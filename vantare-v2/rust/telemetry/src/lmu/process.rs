//! Resolve build evidence from the running LMU process, never an unrelated install.

use std::ffi::c_void;
use std::io;
use std::path::PathBuf;

use super::reader::{MAX_STABLE_COMPARISONS, Mapping};
use super::version::{self, BuildEvidence};

type Handle = *mut c_void;
const SNAP_PROCESS: u32 = 0x0000_0002;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const SYNCHRONIZE: u32 = 0x0010_0000;
const ERROR_NO_MORE_FILES: i32 = 18;
const WAIT_OBJECT_0: u32 = 0;
const WAIT_TIMEOUT: u32 = 258;
const MAX_PATH_UNITS: usize = 32_768;

#[repr(C)]
struct ProcessEntry {
    size: u32,
    usage: u32,
    pid: u32,
    heap: usize,
    module: u32,
    threads: u32,
    parent_pid: u32,
    priority: i32,
    flags: u32,
    name: [u16; 260],
}

impl ProcessEntry {
    fn empty() -> Self {
        Self {
            size: std::mem::size_of::<Self>() as u32,
            usage: 0,
            pid: 0,
            heap: 0,
            module: 0,
            threads: 0,
            parent_pid: 0,
            priority: 0,
            flags: 0,
            name: [0; 260],
        }
    }

    fn is_lmu(&self) -> bool {
        let end = self
            .name
            .iter()
            .position(|unit| *unit == 0)
            .unwrap_or(self.name.len());
        String::from_utf16_lossy(&self.name[..end]).eq_ignore_ascii_case("Le Mans Ultimate.exe")
    }
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> Handle;
    fn Process32FirstW(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
    fn Process32NextW(snapshot: Handle, entry: *mut ProcessEntry) -> i32;
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    fn QueryFullProcessImageNameW(
        process: Handle,
        flags: u32,
        buffer: *mut u16,
        size: *mut u32,
    ) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
}

#[derive(Debug)]
struct OwnedHandle(Handle);

impl OwnedHandle {
    fn new(handle: Handle) -> io::Result<Self> {
        if handle.is_null() || handle as usize == usize::MAX {
            Err(io::Error::last_os_error())
        } else {
            Ok(Self(handle))
        }
    }
}

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        // SAFETY: this value uniquely owns the Win32 handle returned by an open call.
        unsafe { CloseHandle(self.0) };
    }
}

#[derive(Debug)]
pub struct RunningBuild {
    pub pid: u32,
    pub executable: PathBuf,
    pub evidence: BuildEvidence,
    process: OwnedHandle,
}

impl RunningBuild {
    /// The retained process handle cannot silently refer to a recycled PID.
    pub fn ensure_alive(&self) -> io::Result<()> {
        ensure_process_alive(&self.process)
    }
}

fn ensure_process_alive(process: &OwnedHandle) -> io::Result<()> {
    // SAFETY: process owns a valid handle until this call returns.
    match unsafe { WaitForSingleObject(process.0, 0) } {
        WAIT_TIMEOUT => Ok(()),
        WAIT_OBJECT_0 => Err(io::Error::new(
            io::ErrorKind::NotConnected,
            "LMU process exited",
        )),
        _ => Err(io::Error::last_os_error()),
    }
}

/// Keep the LMU process handle and its single mapping view together for a run.
/// This detects producer exit during acquisition; build admission remains a
/// separate decision that also needs matching REST evidence.
pub struct RunningSource {
    pub build: RunningBuild,
    mapping: Mapping,
}

impl RunningSource {
    pub fn open() -> io::Result<Self> {
        let build = read_running_build()?;
        let mapping = Mapping::open_lmu()?;
        build.ensure_alive()?;
        Ok(Self { build, mapping })
    }

    pub fn read_stable(&self, destination: &mut [u8], scratch: &mut [u8]) -> io::Result<()> {
        self.build.ensure_alive()?;
        self.mapping
            .read_stable(destination, scratch, MAX_STABLE_COMPARISONS)?;
        self.build.ensure_alive()
    }
}

/// Fails closed if no LMU process exists, more than one matches, or the
/// process path/version cannot be read. No disk-install fallback is used.
pub fn read_running_build() -> io::Result<RunningBuild> {
    // SAFETY: the returned snapshot handle is immediately put under RAII.
    let snapshot = OwnedHandle::new(unsafe { CreateToolhelp32Snapshot(SNAP_PROCESS, 0) })?;
    let mut entry = ProcessEntry::empty();
    // SAFETY: entry is a writable PROCESSENTRY32W with the required size.
    if unsafe { Process32FirstW(snapshot.0, &mut entry) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let mut matching_pid = None;
    loop {
        if entry.is_lmu() && matching_pid.replace(entry.pid).is_some() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "multiple LMU processes",
            ));
        }
        entry = ProcessEntry::empty();
        // SAFETY: the snapshot remains alive and entry is writable.
        if unsafe { Process32NextW(snapshot.0, &mut entry) } == 0 {
            let error = io::Error::last_os_error();
            if error.raw_os_error() != Some(ERROR_NO_MORE_FILES) {
                return Err(error);
            }
            break;
        }
    }
    let pid = matching_pid
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "LMU process not found"))?;
    // SAFETY: OpenProcess returns a process handle owned by this function.
    let process = OwnedHandle::new(unsafe {
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, 0, pid)
    })?;
    let mut buffer = vec![0_u16; MAX_PATH_UNITS];
    let mut length = buffer.len() as u32;
    // SAFETY: buffer is writable for length UTF-16 units and length is in/out.
    if unsafe { QueryFullProcessImageNameW(process.0, 0, buffer.as_mut_ptr(), &mut length) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let executable = PathBuf::from(
        String::from_utf16(&buffer[..length as usize])
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid LMU process path"))?,
    );
    let evidence = version::read_file_version(&executable)?;
    ensure_process_alive(&process)?;
    Ok(RunningBuild {
        pid,
        executable,
        evidence,
        process,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn process_entry_matches_only_exact_executable_name() {
        assert_eq!(std::mem::size_of::<ProcessEntry>(), 568);
        let mut entry = ProcessEntry::empty();
        for (slot, unit) in entry
            .name
            .iter_mut()
            .zip("Le Mans Ultimate.exe".encode_utf16())
        {
            *slot = unit;
        }
        assert!(entry.is_lmu());
        entry.name[0] = b'X' as u16;
        assert!(!entry.is_lmu());
    }

    #[test]
    fn retained_handle_detects_process_exit() {
        let mut child = Command::new("cmd")
            .args(["/C", "more"])
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .spawn()
            .expect("start child waiting for input");
        // SAFETY: OpenProcess returns a handle owned by this test.
        let process = OwnedHandle::new(unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE,
                0,
                child.id(),
            )
        })
        .expect("open child process");
        ensure_process_alive(&process).expect("child still waiting");
        drop(child.stdin.take());
        child.wait().expect("child exits after input closes");
        assert_eq!(
            ensure_process_alive(&process).unwrap_err().kind(),
            io::ErrorKind::NotConnected
        );
    }

    #[test]
    fn installed_running_lmu_evidence_is_diagnostic_only() {
        if std::env::var_os("VANTARE_LMU_LIVE_PROCESS_TEST").is_none() {
            return;
        }
        let running = read_running_build().expect("running LMU process and version");
        assert_ne!(running.pid, 0);
        assert_eq!(
            running.executable.file_name().unwrap(),
            "Le Mans Ultimate.exe"
        );
        assert_eq!(running.evidence.file_version, "1.4.2.0");
        assert_eq!(running.evidence.product_version, "1.4.2.0");
        assert_eq!(running.evidence.exact_supported_build(), None);
        running.ensure_alive().expect("LMU still running");
    }

    #[test]
    fn running_lmu_source_reads_only_while_process_is_alive() {
        if std::env::var_os("VANTARE_LMU_LIVE_PROCESS_TEST").is_none() {
            return;
        }
        let source = RunningSource::open().expect("running LMU and LMU_Data");
        let mut frame = vec![0; super::super::OBJECT_OUT_SIZE];
        let mut scratch = vec![0; frame.len()];
        source
            .read_stable(&mut frame, &mut scratch)
            .expect("stable live LMU snapshot");
        assert_eq!(source.build.evidence.exact_supported_build(), None);
    }
}
