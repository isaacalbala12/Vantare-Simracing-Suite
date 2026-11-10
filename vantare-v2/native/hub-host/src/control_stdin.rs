//! Poll the inherited anonymous pipe without spawning an uncancellable stdin reader.
#![allow(unsafe_code)]
use std::{ffi::c_void, ptr};
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetStdHandle(kind: u32) -> *mut c_void;
    fn PeekNamedPipe(
        pipe: *mut c_void,
        buffer: *mut c_void,
        size: u32,
        read: *mut u32,
        available: *mut u32,
        left: *mut u32,
    ) -> i32;
    fn ReadFile(
        file: *mut c_void,
        buffer: *mut c_void,
        size: u32,
        read: *mut u32,
        overlapped: *mut c_void,
    ) -> i32;
}
pub fn closed() -> bool {
    // SAFETY: borrowed process STD_INPUT_HANDLE; no ownership or pointer escapes.
    let handle = unsafe { GetStdHandle(0xffff_fff6) };
    if handle.is_null() || handle as isize == -1 {
        return true;
    }
    let mut available = 0;
    // SAFETY: only the available count is requested; all other buffers are null.
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
    // SAFETY: one owner reads stdin, and Peek reported at least this many available bytes.
    (unsafe {
        ReadFile(
            handle,
            bytes.as_mut_ptr().cast(),
            available.min(256),
            &raw mut read,
            ptr::null_mut(),
        )
    }) == 0
        || read == 0
}
