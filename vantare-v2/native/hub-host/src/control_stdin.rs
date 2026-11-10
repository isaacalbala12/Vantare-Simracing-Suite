//! Poll the inherited anonymous pipe without an uncancellable stdin thread.
#![allow(unsafe_code)]
use std::ptr;
use windows_sys::Win32::{
    Foundation::{HANDLE, INVALID_HANDLE_VALUE},
    Storage::FileSystem::ReadFile,
    System::{
        Console::{GetStdHandle, STD_INPUT_HANDLE},
        Pipes::PeekNamedPipe,
    },
};
pub fn closed() -> bool {
    // SAFETY: borrowing the process standard handle, never closing or retaining it.
    closed_handle(unsafe { GetStdHandle(STD_INPUT_HANDLE) })
}
pub(crate) fn closed_handle(handle: HANDLE) -> bool {
    if handle.is_null() || handle == INVALID_HANDLE_VALUE {
        return true;
    }
    let mut available = 0;
    // SAFETY: only the available count is requested; no buffer is read here.
    if unsafe {
        PeekNamedPipe(
            handle,
            ptr::null_mut(),
            0,
            ptr::null_mut(),
            &raw mut available,
            ptr::null_mut(),
        )
    } == 0
    {
        return true;
    }
    if available == 0 {
        return false;
    }
    let mut bytes = [0_u8; 256];
    let mut read = 0;
    // SAFETY: one owner drains only bytes reported available; the buffer is sized accordingly.
    (unsafe {
        ReadFile(
            handle,
            bytes.as_mut_ptr(),
            available.min(256),
            &raw mut read,
            ptr::null_mut(),
        )
    }) == 0
        || read == 0
}
