//! Win32 boundary: atomically join the child to a non-inherited kill-on-close job.
//! Only the explicitly listed standard handles cross process creation.
#![allow(unsafe_code)]
use std::{
    ffi::OsStr,
    fs::{File, OpenOptions},
    io,
    marker::PhantomData,
    os::windows::{
        ffi::OsStrExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
        process::ExitStatusExt,
    },
    process::{Command, ExitStatus},
    ptr,
};
use windows_sys::Win32::{
    Foundation::{
        GetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT, SetHandleInformation, WAIT_OBJECT_0,
        WAIT_TIMEOUT,
    },
    System::{
        JobObjects::{
            CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject, TerminateJobObject,
        },
        Threading::{
            CREATE_NO_WINDOW, CREATE_UNICODE_ENVIRONMENT, CreateProcessW,
            DeleteProcThreadAttributeList, EXTENDED_STARTUPINFO_PRESENT, GetExitCodeProcess,
            INFINITE, InitializeProcThreadAttributeList, LPPROC_THREAD_ATTRIBUTE_LIST,
            PROC_THREAD_ATTRIBUTE_HANDLE_LIST, PROC_THREAD_ATTRIBUTE_JOB_LIST, PROCESS_INFORMATION,
            STARTF_USESTDHANDLES, STARTUPINFOEXW, UpdateProcThreadAttribute, WaitForSingleObject,
        },
    },
};

fn owned(handle: HANDLE) -> io::Result<OwnedHandle> {
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the caller passes a new owned Win32 handle, never a pseudo-handle.
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}
fn new_job() -> io::Result<OwnedHandle> {
    // SAFETY: no name/security attributes; the new handle cannot be inherited.
    let job = owned(unsafe { CreateJobObjectW(ptr::null(), ptr::null()) })?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    // SAFETY: live job, correctly sized initialized structure, borrowed for this call.
    if unsafe {
        SetInformationJobObject(
            job.as_raw_handle(),
            JobObjectExtendedLimitInformation,
            ptr::from_ref(&limits).cast(),
            u32::try_from(size_of_val(&limits)).expect("Win32 structure"),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    Ok(job)
}

struct Attributes<'a> {
    _storage: Vec<usize>,
    pointer: LPPROC_THREAD_ATTRIBUTE_LIST,
    _values: PhantomData<&'a [HANDLE]>,
}
impl<'a> Attributes<'a> {
    fn new(jobs: &'a [HANDLE], handles: &'a [HANDLE]) -> io::Result<Self> {
        let mut bytes = 0;
        // SAFETY: documented size query, no output list on this first call.
        unsafe {
            InitializeProcThreadAttributeList(ptr::null_mut(), 2, 0, &raw mut bytes);
        }
        if bytes == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut storage = vec![0_usize; bytes.div_ceil(size_of::<usize>())];
        let pointer = storage.as_mut_ptr().cast();
        // SAFETY: stable pointer-aligned allocation, capacity at least the queried size.
        if unsafe { InitializeProcThreadAttributeList(pointer, 2, 0, &raw mut bytes) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut list = Self {
            _storage: storage,
            pointer,
            _values: PhantomData,
        };
        list.set(PROC_THREAD_ATTRIBUTE_JOB_LIST, jobs)?;
        list.set(PROC_THREAD_ATTRIBUTE_HANDLE_LIST, handles)?;
        Ok(list)
    }
    fn set(&mut self, attribute: u32, values: &'a [HANDLE]) -> io::Result<()> {
        // SAFETY: both value slices outlive the initialized attribute list.
        if unsafe {
            UpdateProcThreadAttribute(
                self.pointer,
                0,
                attribute as usize,
                values.as_ptr().cast(),
                size_of_val(values),
                ptr::null_mut(),
                ptr::null(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}
impl Drop for Attributes<'_> {
    fn drop(&mut self) {
        // SAFETY: initialized list remains allocated until after this destructor.
        unsafe {
            DeleteProcThreadAttributeList(self.pointer);
        }
    }
}

struct Inherited(Vec<(HANDLE, u32)>);
impl Inherited {
    fn new(handles: &[HANDLE]) -> io::Result<Self> {
        let mut guard = Self(Vec::new());
        for &handle in handles {
            let mut flags = 0;
            // SAFETY: the owning File values outlive this guard and process creation.
            if unsafe { GetHandleInformation(handle, &raw mut flags) } == 0 {
                return Err(io::Error::last_os_error());
            }
            // SAFETY: only the inheritance flag of our own standard handle is changed.
            if unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) }
                == 0
            {
                return Err(io::Error::last_os_error());
            }
            guard.0.push((handle, flags));
        }
        Ok(guard)
    }
}
impl Drop for Inherited {
    fn drop(&mut self) {
        for &(handle, flags) in &self.0 {
            // SAFETY: borrowed handles are still live; restore their original flags.
            unsafe {
                SetHandleInformation(handle, HANDLE_FLAG_INHERIT, flags & HANDLE_FLAG_INHERIT);
            }
        }
    }
}

fn wide(value: &OsStr) -> io::Result<Vec<u16>> {
    let mut value: Vec<_> = value.encode_wide().collect();
    if value.contains(&0) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    value.push(0);
    Ok(value)
}
// Windows argv escaping, not a shell command. Always quote and double trailing slashes.
fn argument(value: &OsStr, output: &mut Vec<u16>) -> io::Result<()> {
    output.push(u16::from(b'"'));
    let mut slashes = 0;
    for unit in value.encode_wide() {
        if unit == 0 {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        if unit == u16::from(b'\\') {
            slashes += 1;
            continue;
        }
        let count = if unit == u16::from(b'"') {
            slashes * 2 + 1
        } else {
            slashes
        };
        output.extend(std::iter::repeat_n(u16::from(b'\\'), count));
        output.push(unit);
        slashes = 0;
    }
    output.extend(std::iter::repeat_n(u16::from(b'\\'), slashes * 2));
    output.push(u16::from(b'"'));
    Ok(())
}
fn command_line(command: &Command) -> io::Result<Vec<u16>> {
    let mut output = Vec::new();
    argument(command.get_program(), &mut output)?;
    for value in command.get_args() {
        output.push(u16::from(b' '));
        argument(value, &mut output)?;
    }
    output.push(0);
    Ok(output)
}
fn environment(command: &Command) -> io::Result<Vec<u16>> {
    let mut values = std::collections::BTreeMap::new();
    // Windows requires case-insensitive ordering. Names are our explicit ASCII allow-list.
    for (name, value) in command.get_envs() {
        if let Some(value) = value {
            let name = name
                .to_str()
                .filter(|name| {
                    !name.is_empty()
                        && name
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
                })
                .ok_or(io::ErrorKind::InvalidInput)?;
            values.insert(name.to_ascii_uppercase(), value);
        }
    }
    let mut output = Vec::new();
    for (name, value) in values {
        output.extend(name.encode_utf16());
        output.push(u16::from(b'='));
        output.extend(wide(value)?);
    }
    if output.is_empty() {
        output.push(0);
    }
    output.push(0);
    Ok(output)
}

pub struct Child {
    process: OwnedHandle,
    job: OwnedHandle,
    id: u32,
}
impl Child {
    pub fn id(&self) -> u32 {
        self.id
    }
    fn status(&self) -> io::Result<ExitStatus> {
        let mut code = 0;
        // SAFETY: owned process handle and valid output pointer.
        if unsafe { GetExitCodeProcess(self.process.as_raw_handle(), &raw mut code) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(ExitStatus::from_raw(code))
    }
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        // SAFETY: a zero-time process observation, without ownership transfer.
        match unsafe { WaitForSingleObject(self.process.as_raw_handle(), 0) } {
            WAIT_OBJECT_0 => self.status().map(Some),
            WAIT_TIMEOUT => Ok(None),
            _ => Err(io::Error::last_os_error()),
        }
    }
    pub fn kill(&mut self) -> io::Result<()> {
        // SAFETY: this job contains only the child and its descendants, never the host.
        if unsafe { TerminateJobObject(self.job.as_raw_handle(), 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    pub fn wait(&mut self) -> io::Result<ExitStatus> {
        // SAFETY: wait on the owned process handle; callers terminate before cleanup waits.
        if unsafe { WaitForSingleObject(self.process.as_raw_handle(), INFINITE) } != WAIT_OBJECT_0 {
            return Err(io::Error::last_os_error());
        }
        self.status()
    }
}

pub fn spawn(command: &Command, stderr: &File) -> io::Result<Child> {
    let job = new_job()?;
    let null = OpenOptions::new().read(true).write(true).open("NUL")?;
    let jobs = [job.as_raw_handle()];
    let handles = [null.as_raw_handle(), stderr.as_raw_handle()];
    let _inherit = Inherited::new(&handles)?;
    let attributes = Attributes::new(&jobs, &handles)?;
    let application = wide(command.get_program())?;
    let mut line = command_line(command)?;
    let environment = environment(command)?;
    let directory = command
        .get_current_dir()
        .map(|path| wide(path.as_os_str()))
        .transpose()?;
    let mut startup = STARTUPINFOEXW::default();
    startup.StartupInfo.cb = u32::try_from(size_of::<STARTUPINFOEXW>()).expect("Win32 structure");
    startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    startup.StartupInfo.hStdInput = handles[0];
    startup.StartupInfo.hStdOutput = handles[0];
    startup.StartupInfo.hStdError = handles[1];
    startup.lpAttributeList = attributes.pointer;
    let mut info = PROCESS_INFORMATION::default();
    // SAFETY: all UTF-16 buffers, handles and attribute values stay live through this
    // synchronous call. JOB_LIST assigns before the first instruction can run.
    if unsafe {
        CreateProcessW(
            application.as_ptr(),
            line.as_mut_ptr(),
            ptr::null(),
            ptr::null(),
            1,
            EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
            environment.as_ptr().cast(),
            directory.as_ref().map_or(ptr::null(), Vec::as_ptr),
            ptr::from_ref(&startup.StartupInfo),
            &raw mut info,
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let process = owned(info.hProcess)?;
    let _thread = owned(info.hThread)?;
    Ok(Child {
        process,
        job,
        id: info.dwProcessId,
    })
}
