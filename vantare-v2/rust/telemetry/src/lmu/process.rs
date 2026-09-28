//! Resolve build evidence from the running LMU process, never an unrelated install.

use std::ffi::c_void;
use std::io;
use std::path::PathBuf;

use super::version::{self, BuildEvidence};

type Handle = *mut c_void;
const SNAP_PROCESS: u32 = 0x0000_0002;
const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
const ERROR_NO_MORE_FILES: i32 = 18;
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
}

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
    let process =
        OwnedHandle::new(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) })?;
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
    Ok(RunningBuild {
        pid,
        executable,
        evidence,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

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
    }
}
