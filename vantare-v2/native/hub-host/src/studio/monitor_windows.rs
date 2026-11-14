//! Narrow Win32 boundary; tests inject monitor records and never call display APIs.
#![allow(unsafe_code)]
use super::Monitor;
use windows_sys::{
    Win32::{
        Foundation::{LPARAM, RECT},
        Graphics::Gdi::{EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO},
        UI::{
            HiDpi::{
                DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
                GetDpiForMonitor, MDT_EFFECTIVE_DPI, SetThreadDpiAwarenessContext,
            },
            WindowsAndMessaging::MONITORINFOF_PRIMARY,
        },
    },
    core::BOOL,
};

struct Restore(DPI_AWARENESS_CONTEXT);
impl Drop for Restore {
    fn drop(&mut self) {
        unsafe {
            SetThreadDpiAwarenessContext(self.0);
        }
    }
}
unsafe extern "system" fn collect(
    monitor: HMONITOR,
    _dc: HDC,
    _rect: *mut RECT,
    data: LPARAM,
) -> BOOL {
    // EnumDisplayMonitors is synchronous: data uniquely borrows this call's Vec.
    let output = unsafe { &mut *(data as *mut Vec<Monitor>) };
    if output.len() >= 64 {
        return 0;
    }
    let mut info = MONITORINFO {
        cbSize: u32::try_from(std::mem::size_of::<MONITORINFO>()).expect("monitor info size"),
        ..Default::default()
    };
    if unsafe { GetMonitorInfoW(monitor, &raw mut info) } == 0 {
        return 0;
    }
    let mut x = 0;
    let mut y = 0;
    if unsafe { GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &raw mut x, &raw mut y) } < 0
        || x == 0
        || x != y
    {
        return 0;
    }
    let r = info.rcMonitor;
    let Some(logical) = Monitor::from_physical(
        (r.left, r.top, r.right, r.bottom),
        x,
        info.dwFlags & MONITORINFOF_PRIMARY != 0,
    ) else {
        return 0;
    };
    output.push(logical);
    1
}
pub(super) fn snapshot() -> Vec<Monitor> {
    // Restore the host thread's awareness on every return, without changing the process.
    let previous =
        unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
    if previous.is_null() {
        return vec![];
    }
    let _restore = Restore(previous);
    let mut output = Vec::new();
    let result = unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            Some(collect),
            &raw mut output as LPARAM,
        )
    };
    if result == 0 { vec![] } else { output }
}
