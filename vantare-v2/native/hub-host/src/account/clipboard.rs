//! Only the authenticated build issuer reaches the private Win32 clipboard owner.
use crate::protocol::HostError;
fn normalized(value: &str, issuer: &str) -> Option<String> {
    let issuer = vantare_services::config::remote_url(issuer).ok()?;
    super::platform::normalized(value, &[issuer.host_str()?])
}
#[cfg(test)]
fn allowed(value: &str, issuer: &str) -> bool {
    normalized(value, issuer).is_some()
}
fn issuer_available(issuer: Option<&str>) -> bool {
    issuer.is_some_and(|issuer| {
        vantare_services::config::remote_url(issuer).is_ok_and(|url| url.host_str().is_some())
    })
}
pub fn configured() -> bool {
    issuer_available(option_env!("VANTARE_CLERK_ISSUER"))
}
#[cfg(any(test, all(windows, not(feature = "qa-e2e"))))]
fn open_with_retry(
    mut open: impl FnMut() -> bool,
    mut wait: impl FnMut(std::time::Duration),
) -> bool {
    if open() {
        return true;
    }
    for millis in [10, 20, 30] {
        wait(std::time::Duration::from_millis(millis));
        if open() {
            return true;
        }
    }
    false
}
fn copy_for_issuer(
    value: &str,
    issuer: &str,
    write: impl FnOnce(&str) -> Result<(), HostError>,
) -> Result<(), HostError> {
    let normalized = normalized(value, issuer).ok_or(HostError::Denied)?;
    #[cfg(feature = "qa-e2e")]
    {
        let _ = (write, normalized);
        Ok(())
    }
    #[cfg(not(feature = "qa-e2e"))]
    write(&normalized)
}
pub fn copy(value: &str) -> Result<(), HostError> {
    let issuer = option_env!("VANTARE_CLERK_ISSUER").ok_or(HostError::Denied)?;
    copy_for_issuer(value, issuer, copy_platform)
}
#[cfg(any(not(windows), feature = "qa-e2e"))]
fn copy_platform(_value: &str) -> Result<(), HostError> {
    Err(HostError::Unsupported)
}
#[cfg(all(windows, not(feature = "qa-e2e")))]
#[allow(
    unsafe_code,
    reason = "owned message-only HWND, bounded clipboard transfers and read-back"
)]
fn copy_platform(value: &str) -> Result<(), HostError> {
    use windows_sys::Win32::{
        Foundation::HWND,
        System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard},
        UI::WindowsAndMessaging::{CreateWindowExW, DestroyWindow, HWND_MESSAGE},
    };
    struct Owner(HWND);
    impl Drop for Owner {
        fn drop(&mut self) {
            unsafe {
                DestroyWindow(self.0);
            }
        }
    }
    struct Clipboard;
    impl Drop for Clipboard {
        fn drop(&mut self) {
            unsafe {
                CloseClipboard();
            }
        }
    }
    let class: Vec<u16> = "STATIC".encode_utf16().chain(Some(0)).collect();
    unsafe {
        let owner = Owner(CreateWindowExW(
            0,
            class.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
        ));
        if owner.0.is_null() || !open_with_retry(|| OpenClipboard(owner.0) != 0, std::thread::sleep)
        {
            return Err(HostError::Io);
        }
        let _clipboard = Clipboard;
        if EmptyClipboard() == 0 {
            return Err(HostError::Io);
        }
        private_formats()?;
        let wide: Vec<u16> = value.encode_utf16().chain(Some(0)).collect();
        let bytes =
            std::slice::from_raw_parts(wide.as_ptr().cast::<u8>(), wide.len() * size_of::<u16>());
        transfer(13, bytes)?;
        read_back(&wide)
    }
}
#[cfg(all(windows, not(feature = "qa-e2e")))]
#[allow(
    unsafe_code,
    reason = "registered Windows privacy formats each receive an owned DWORD zero"
)]
fn private_formats() -> Result<(), HostError> {
    use windows_sys::Win32::System::DataExchange::RegisterClipboardFormatW;
    for name in [
        "ExcludeClipboardContentFromMonitorProcessing",
        "CanIncludeInClipboardHistory",
        "CanUploadToCloudClipboard",
    ] {
        let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
        let format = unsafe { RegisterClipboardFormatW(wide.as_ptr()) };
        if format == 0 {
            return Err(HostError::Io);
        }
        transfer(format, &0u32.to_ne_bytes())?;
    }
    Ok(())
}
#[cfg(all(windows, not(feature = "qa-e2e")))]
#[allow(
    unsafe_code,
    reason = "bounded movable allocation transfers ownership only after SetClipboardData succeeds"
)]
fn transfer(format: u32, bytes: &[u8]) -> Result<(), HostError> {
    use windows_sys::Win32::{
        Foundation::GlobalFree,
        System::{
            DataExchange::SetClipboardData,
            Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock},
        },
    };
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
        if memory.is_null() {
            return Err(HostError::Io);
        }
        let target = GlobalLock(memory).cast::<u8>();
        if target.is_null() {
            GlobalFree(memory);
            return Err(HostError::Io);
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), target, bytes.len());
        GlobalUnlock(memory);
        if SetClipboardData(format, memory).is_null() {
            GlobalFree(memory);
            return Err(HostError::Io);
        }
    }
    Ok(())
}
#[cfg(all(windows, not(feature = "qa-e2e")))]
#[allow(
    unsafe_code,
    reason = "clipboard reads bounded by GlobalSize and compared before releasing the lock"
)]
fn read_back(wide: &[u16]) -> Result<(), HostError> {
    use windows_sys::Win32::System::{
        DataExchange::GetClipboardData,
        Memory::{GlobalLock, GlobalSize, GlobalUnlock},
    };
    unsafe {
        let read = GetClipboardData(13);
        if read.is_null() || GlobalSize(read) < std::mem::size_of_val(wide) {
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
    fn login_query_is_allowed_only_for_the_build_issuer() {
        assert!(allowed(
            "https://issuer.invalid/authorize?state=qa&code_challenge=qa",
            "https://issuer.invalid"
        ));
        for value in [
            "javascript:alert(1)",
            "https://issuer.invalid/\0",
            "",
            "https://other.invalid/authorize?state=qa",
            "https://user@issuer.invalid/a?state=qa",
            "https://issuer.invalid:8443/a?state=qa",
        ] {
            assert!(!allowed(value, "https://issuer.invalid"));
        }
    }
    #[test]
    fn copied_payload_is_the_canonical_url_and_ambiguous_authorities_are_denied() {
        assert_eq!(
            normalized(
                "HTTPS://ISSUER.INVALID:443/a/../oauth/authorize?state=qa&code_challenge=qa",
                "https://issuer.invalid"
            )
            .as_deref(),
            Some("https://issuer.invalid/oauth/authorize?state=qa&code_challenge=qa")
        );
        for value in [
            r"https://issuer.invalid\@evil.invalid/a",
            r"https://issuer.invalid/a?state=\qa",
            "https://issuer.invalid/a#fragment",
            "https://issuer.invalid./a",
            "https://іssuer.invalid/a",
            "https://xn--issuer-9jg.invalid/a",
        ] {
            assert!(normalized(value, "https://issuer.invalid").is_none());
        }
    }
    #[test]
    fn a_build_without_an_issuer_cannot_enable_clipboard_links() {
        assert!(!issuer_available(None));
        assert!(!issuer_available(Some("file:///issuer")));
        assert!(issuer_available(Some("https://issuer.invalid")));
    }
    #[test]
    fn clipboard_contention_retries_are_short_bounded_and_injected() {
        let mut attempts = 0;
        let mut waits = Vec::new();
        assert!(!open_with_retry(
            || {
                attempts += 1;
                false
            },
            |delay| waits.push(delay)
        ));
        assert_eq!(attempts, 4);
        assert_eq!(waits, [10, 20, 30].map(std::time::Duration::from_millis));
        attempts = 0;
        waits.clear();
        assert!(open_with_retry(
            || {
                attempts += 1;
                attempts == 2
            },
            |delay| waits.push(delay)
        ));
        assert_eq!(attempts, 2);
        assert_eq!(waits, [std::time::Duration::from_millis(10)]);
    }
    #[cfg(feature = "qa-e2e")]
    #[test]
    fn qa_never_touches_the_os_clipboard() {
        assert_eq!(
            copy_for_issuer(
                "https://issuer.invalid/a?state=qa",
                "https://issuer.invalid",
                |_| panic!("QA touched clipboard")
            ),
            Ok(())
        );
    }
}
