//! The authenticated service link remains in Rust, including clipboard read-back.
use crate::protocol::HostError;
pub fn copy(value: &str) -> Result<(), HostError> {
    if value.len() > 16 * 1024
        || value.contains('\0')
        || vantare_services::config::remote_url(value).is_err()
    {
        return Err(HostError::Denied);
    }
    copy_platform(value)
}
#[cfg(not(windows))]
fn copy_platform(_value: &str) -> Result<(), HostError> {
    Err(HostError::Unsupported)
}
#[cfg(windows)]
#[allow(
    unsafe_code,
    reason = "bounded Win32 clipboard allocation, transfer and verified read-back"
)]
fn copy_platform(value: &str) -> Result<(), HostError> {
    use windows_sys::Win32::{
        Foundation::GlobalFree,
        System::{
            DataExchange::{
                CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
            },
            Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock},
        },
    };
    const UNICODE_TEXT: u32 = 13;
    struct Clipboard;
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err(HostError::Io);
        }
        let _clipboard = Clipboard;
        let memory = GlobalAlloc(GMEM_MOVEABLE, wide.len() * size_of::<u16>());
        if memory.is_null() {
            return Err(HostError::Io);
        }
        let target = GlobalLock(memory).cast::<u16>();
        if target.is_null() {
            GlobalFree(memory);
            return Err(HostError::Io);
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), target, wide.len());
        GlobalUnlock(memory);
        if EmptyClipboard() == 0 || SetClipboardData(UNICODE_TEXT, memory).is_null() {
            GlobalFree(memory);
            return Err(HostError::Io);
        }
        // Ownership belongs to Windows from this point. Bound reads by GlobalSize.
        let read = GetClipboardData(UNICODE_TEXT);
        if read.is_null() || GlobalSize(read) < wide.len() * size_of::<u16>() {
            return Err(HostError::Io);
        }
        let source = GlobalLock(read).cast::<u16>();
        if source.is_null() {
            return Err(HostError::Io);
        }
        let matches = std::slice::from_raw_parts(source, wide.len()) == wide;
        GlobalUnlock(read);
        if matches { Ok(()) } else { Err(HostError::Io) }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_links_are_rejected_before_clipboard_access() {
        for value in ["javascript:alert(1)", "https://issuer.invalid/\0", ""] {
            assert!(matches!(copy(value), Err(HostError::Denied)));
        }
    }
}
