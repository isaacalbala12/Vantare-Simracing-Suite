//! Test-only kernel synchronization. No sleeps or accounts/services.
#![allow(unsafe_code)]
use std::{
    io,
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    path::PathBuf,
    ptr,
};
use windows_sys::Win32::{
    Foundation::{HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
    System::{
        Pipes::CreatePipe,
        Threading::{
            CreateEventW, EVENT_MODIFY_STATE, INFINITE, OpenEventW, OpenProcess,
            PROCESS_SYNCHRONIZE, SYNCHRONIZATION_SYNCHRONIZE, SetEvent, WaitForMultipleObjects,
            WaitForSingleObject,
        },
    },
};
fn owned(handle: HANDLE) -> io::Result<OwnedHandle> {
    if handle.is_null() {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: fresh owned kernel handle, never a pseudo-handle.
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}
pub struct Signal {
    handle: OwnedHandle,
    pub name: String,
}
impl Signal {
    pub fn new() -> io::Result<Self> {
        let name = format!(
            "Local\\vantare-hub-test-{}",
            vantare_services::random_id().map_err(io::Error::other)?
        );
        let text: Vec<_> = name.encode_utf16().chain([0]).collect();
        // SAFETY: NUL-terminated name; default user DACL, non-inherited handle.
        let handle = owned(unsafe { CreateEventW(ptr::null(), 1, 0, text.as_ptr()) })?;
        Ok(Self { handle, name })
    }
    pub fn open(name: String) -> io::Result<Self> {
        let text: Vec<_> = name.encode_utf16().chain([0]).collect();
        // SAFETY: opens our test's event for wait/signal only.
        let handle = owned(unsafe {
            OpenEventW(
                EVENT_MODIFY_STATE | SYNCHRONIZATION_SYNCHRONIZE,
                0,
                text.as_ptr(),
            )
        })?;
        Ok(Self { handle, name })
    }
    pub fn set(&self) {
        // SAFETY: the owned event remains live for this call.
        assert_ne!(
            unsafe { SetEvent(self.handle.as_raw_handle()) },
            0,
            "signal test peer"
        );
    }
    pub fn wait_or_exit(&self, process: &impl AsRawHandle) {
        let handles = [self.handle.as_raw_handle(), process.as_raw_handle()];
        // SAFETY: both borrowed handles remain live; a dying helper fails the test immediately.
        assert_eq!(
            unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, INFINITE) },
            WAIT_OBJECT_0,
            "helper exited before readiness"
        );
    }
    pub fn wait(&self) {
        // SAFETY: explicit kernel event synchronization; the peer owns the signal.
        assert_eq!(
            unsafe { WaitForSingleObject(self.handle.as_raw_handle(), INFINITE) },
            WAIT_OBJECT_0
        );
    }
}
impl Drop for Signal {
    fn drop(&mut self) {
        self.set();
    }
}
pub fn anonymous_pipe() -> io::Result<(OwnedHandle, OwnedHandle)> {
    let mut read = ptr::null_mut();
    let mut write = ptr::null_mut();
    // SAFETY: valid out pointers; default non-inherited anonymous pipe handles.
    if unsafe { CreatePipe(&raw mut read, &raw mut write, ptr::null(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((owned(read)?, owned(write)?))
}
pub fn process(pid: u32) -> io::Result<OwnedHandle> {
    // SAFETY: this PID came from our synchronized helper; only wait access is requested.
    owned(unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid) })
}
pub fn running(process: &OwnedHandle) -> bool {
    // SAFETY: borrowed owned process handle, zero-time observation.
    unsafe { WaitForSingleObject(process.as_raw_handle(), 0) == WAIT_TIMEOUT }
}
pub fn terminated(process: &OwnedHandle) {
    // SAFETY: wait for our owned process after terminating its owner/job.
    assert_eq!(
        unsafe { WaitForSingleObject(process.as_raw_handle(), INFINITE) },
        WAIT_OBJECT_0
    );
}
pub struct Root {
    pub path: PathBuf,
    namespace: PathBuf,
}
impl Root {
    pub fn new() -> Self {
        let namespace = std::env::var_os("VANTARE_HUB_QA_ROOT").map_or_else(
            || std::env::temp_dir().join("vantare-hub-qa"),
            PathBuf::from,
        );
        let path = namespace.join(vantare_services::random_id().expect("test root id"));
        std::fs::create_dir_all(&path).expect("create owned test root");
        Self { path, namespace }
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let root = self.path.canonicalize().expect("owned root");
        let namespace = self.namespace.canonicalize().expect("test namespace");
        assert!(root.starts_with(&namespace) && root != namespace);
        std::fs::remove_dir_all(root).expect("remove owned test files");
    }
}
