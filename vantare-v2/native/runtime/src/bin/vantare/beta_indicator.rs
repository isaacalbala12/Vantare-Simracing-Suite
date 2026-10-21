//! Indicador del arranque interactivo. Solo Win32 y recurso ICON 1 del EXE.
use std::{
    io,
    io::Write,
    os::windows::io::AsRawHandle,
    process::Child,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{FreeLibrary, HMODULE, HWND, LPARAM, LRESULT, POINT, RECT, WAIT_OBJECT_0, WPARAM},
    Graphics::Gdi::{
        BeginPaint, CLEARTYPE_QUALITY, CreateFontW, CreateSolidBrush, DEFAULT_CHARSET, DT_LEFT,
        DT_SINGLELINE, DT_VCENTER, DeleteObject, DrawTextW, EndPaint, FillRect, GetMonitorInfoW,
        HBRUSH, HDC, HFONT, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromPoint, PAINTSTRUCT,
        SelectObject, SetBkMode, SetTextColor, TRANSPARENT, UpdateWindow,
    },
    System::LibraryLoader::{
        GetModuleHandleW, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE, LoadLibraryExW,
    },
    UI::WindowsAndMessaging::{
        CreateWindowExW, DI_NORMAL, DefWindowProcW, DestroyWindow, DispatchMessageW, DrawIconEx,
        GWLP_USERDATA, GetClientRect, GetCursorPos, GetWindowLongPtrW, HICON, IMAGE_ICON,
        LR_SHARED, LoadImageW, MSG, MsgWaitForMultipleObjects, PM_REMOVE, PeekMessageW,
        QS_ALLINPUT, RegisterClassW, SW_SHOWNOACTIVATE, SetWindowLongPtrW, ShowWindow,
        TranslateMessage, WM_APP, WM_PAINT, WM_PRINTCLIENT, WNDCLASSW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_POPUP,
    },
};

pub const READY: u32 = WM_APP + 105;
pub const MAINTENANCE: u32 = WM_APP + 106;
const CLASS: &str = "VantareStartupIndicator";
const LIMIT: Duration = Duration::from_secs(45);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Closed {
    HubVisible,
    Maintenance,
    EngineExited,
    Timeout,
}

#[derive(Clone, Copy)]
enum Signal {
    FirstFrame,
    Maintenance,
}

struct Lifecycle {
    closed: Option<Closed>,
}
impl Lifecycle {
    fn new() -> Self {
        Self { closed: None }
    }
    fn update(
        &mut self,
        elapsed: Duration,
        signal: Option<Signal>,
        exited: bool,
    ) -> Option<Closed> {
        if self.closed.is_none() {
            self.closed = if let Some(signal) = signal {
                Some(match signal {
                    Signal::FirstFrame => Closed::HubVisible,
                    Signal::Maintenance => Closed::Maintenance,
                })
            } else if exited {
                Some(Closed::EngineExited)
            } else if elapsed >= LIMIT {
                Some(Closed::Timeout)
            } else {
                None
            };
        }
        self.closed
    }
}

struct Icon {
    handle: HICON,
    module: HMODULE,
}
impl Icon {
    fn load() -> io::Result<Self> {
        use std::os::windows::ffi::OsStrExt;
        // SAFETY: existing ICON1 resource; LR_SHARED icons must not be destroyed.
        unsafe {
            let handle = LoadImageW(
                GetModuleHandleW(std::ptr::null()),
                std::ptr::without_provenance(1),
                IMAGE_ICON,
                48,
                48,
                LR_SHARED,
            ) as HICON;
            if !handle.is_null() {
                return Ok(Self {
                    handle,
                    module: std::ptr::null_mut(),
                });
            }
            // RC4 predates ICON1 in the supervisor. Map only the Hub's resources:
            // no imported DLL or executable code is loaded or initialized.
            let hub = std::env::current_exe()?.with_file_name("vantare-hub.exe");
            let path: Vec<u16> = hub.as_os_str().encode_wide().chain(Some(0)).collect();
            let module = LoadLibraryExW(
                path.as_ptr(),
                std::ptr::null_mut(),
                LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE,
            );
            if module.is_null() {
                return Err(io::Error::last_os_error());
            }
            let handle = LoadImageW(
                module,
                std::ptr::without_provenance(1),
                IMAGE_ICON,
                48,
                48,
                LR_SHARED,
            ) as HICON;
            if handle.is_null() {
                let error = io::Error::last_os_error();
                FreeLibrary(module);
                return Err(error);
            }
            Ok(Self { handle, module })
        }
    }
}
impl Drop for Icon {
    fn drop(&mut self) {
        if !self.module.is_null() {
            // SAFETY: sole owned data-only module; window is destroyed before this field.
            unsafe {
                FreeLibrary(self.module);
            }
        }
    }
}
struct Paint {
    brush: HBRUSH,
    font: HFONT,
    icon: Icon,
}
pub(super) struct Indicator {
    hwnd: HWND,
    paint: Box<Paint>,
    opened: Instant,
}
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

// SAFETY: Win32 invokes this callback on the owning thread. USERDATA is the
// stable boxed Paint, installed before ShowWindow and alive through DestroyWindow.
unsafe fn draw(hwnd: HWND, dc: HDC) {
    // SAFETY: caller supplies this window and the paint/print DC for this callback.
    unsafe {
        let paint = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const Paint;
        if let Some(paint) = paint.as_ref() {
            let mut rect = RECT::default();
            GetClientRect(hwnd, &raw mut rect);
            FillRect(dc, &raw const rect, paint.brush);
            let previous = SelectObject(dc, paint.font);
            SetBkMode(
                dc,
                i32::try_from(TRANSPARENT).expect("Win32 background constant"),
            );
            SetTextColor(dc, 0x00f2_f2f2);
            DrawIconEx(
                dc,
                28,
                40,
                paint.icon.handle,
                48,
                48,
                0,
                std::ptr::null_mut(),
                DI_NORMAL,
            );
            rect.left = 96;
            let text = wide("Abriendo Vantare…");
            DrawTextW(
                dc,
                text.as_ptr(),
                -1,
                &raw mut rect,
                DT_LEFT | DT_SINGLELINE | DT_VCENTER,
            );
            SelectObject(dc, previous);
        }
    }
}

// SAFETY: Win32 calls on the owning thread; USERDATA points to the live boxed Paint.
unsafe extern "system" fn procedure(hwnd: HWND, message: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    if message == WM_PAINT {
        // SAFETY: BeginPaint/EndPaint enclose all use of this owned window's DC.
        unsafe {
            let mut ps = PAINTSTRUCT::default();
            let dc = BeginPaint(hwnd, &raw mut ps);
            draw(hwnd, dc);
            EndPaint(hwnd, &raw const ps);
        }
        return 0;
    }
    if message == WM_PRINTCLIENT {
        // SAFETY: Win32 supplies the print DC in WPARAM; no pointer is retained.
        unsafe {
            draw(hwnd, w as HDC);
        }
        return 0;
    }
    // SAFETY: forward unhandled native messages with their original parameters.
    unsafe { DefWindowProcW(hwnd, message, w, l) }
}

impl Indicator {
    pub(super) fn show() -> io::Result<Self> {
        // SAFETY: process module, shared resource ICON 1, and owned GDI objects.
        unsafe {
            let module = GetModuleHandleW(std::ptr::null());
            let class_name = wide(CLASS);
            let class = WNDCLASSW {
                lpfnWndProc: Some(procedure),
                hInstance: module,
                lpszClassName: class_name.as_ptr(),
                ..Default::default()
            };
            RegisterClassW(&raw const class);
            let icon = Icon::load()?;
            let brush = CreateSolidBrush(0x000b_0908); // canvas de marca #08090b.
            let font = CreateFontW(
                -20,
                0,
                0,
                0,
                500,
                0,
                0,
                0,
                u32::from(DEFAULT_CHARSET),
                0,
                0,
                u32::from(CLEARTYPE_QUALITY),
                0,
                wide("Segoe UI").as_ptr(),
            );
            if brush.is_null() || font.is_null() {
                let error = io::Error::last_os_error();
                DeleteObject(brush);
                DeleteObject(font);
                return Err(error);
            }
            let paint = Box::new(Paint { brush, font, icon });
            let mut cursor = POINT::default();
            GetCursorPos(&raw mut cursor);
            let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: u32::try_from(std::mem::size_of::<MONITORINFO>())
                    .expect("Win32 MONITORINFO size"),
                ..Default::default()
            };
            if GetMonitorInfoW(monitor, &raw mut info) == 0 {
                DeleteObject(brush);
                DeleteObject(font);
                return Err(io::Error::last_os_error());
            }
            let x = info.rcWork.left + (info.rcWork.right - info.rcWork.left - 400) / 2;
            let y = info.rcWork.top + (info.rcWork.bottom - info.rcWork.top - 128) / 2;
            let hwnd = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                class_name.as_ptr(),
                wide("Abriendo Vantare…").as_ptr(),
                WS_POPUP,
                x,
                y,
                400,
                128,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                module,
                std::ptr::null(),
            );
            if hwnd.is_null() {
                DeleteObject(brush);
                DeleteObject(font);
                return Err(io::Error::last_os_error());
            }
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, (&raw const *paint) as isize);
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            UpdateWindow(hwnd);
            Ok(Self {
                hwnd,
                paint,
                opened: Instant::now(),
            })
        }
    }

    pub(super) fn handle(&self) -> String {
        (self.hwnd as usize).to_string()
    }

    pub(super) fn wait(self, engine: &Child, log: &mut std::fs::File) {
        let mut state = Lifecycle::new();
        let handle = engine.as_raw_handle();
        // No sleeps or polling timer: engine exit, window messages, or deadline wake us.
        loop {
            let elapsed = self.opened.elapsed();
            let timeout =
                u32::try_from(LIMIT.saturating_sub(elapsed).as_millis()).unwrap_or(u32::MAX);
            // SAFETY: live child process handle; one-element array stays alive throughout wait.
            let wake =
                unsafe { MsgWaitForMultipleObjects(1, &raw const handle, 0, timeout, QS_ALLINPUT) };
            let mut signal = None;
            // SAFETY: MSG is initialized; dispatch only this thread's queued messages.
            unsafe {
                let mut message = MSG::default();
                while PeekMessageW(&raw mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                    if message.hwnd == self.hwnd && message.message == READY {
                        signal = Some(Signal::FirstFrame);
                    } else if message.hwnd == self.hwnd && message.message == MAINTENANCE {
                        signal = Some(Signal::Maintenance);
                    } else {
                        TranslateMessage(&raw const message);
                        DispatchMessageW(&raw const message);
                    }
                }
            }
            if let Some(reason) = state.update(self.opened.elapsed(), signal, wake == WAIT_OBJECT_0)
            {
                if reason != Closed::HubVisible {
                    let _ = writeln!(
                        log,
                        "bootstrap: indicador cerrado: {reason:?}, tras {} ms",
                        self.opened.elapsed().as_millis()
                    );
                }
                break;
            }
            if wake == u32::MAX {
                let _ = writeln!(
                    log,
                    "bootstrap: espera del indicador: {}",
                    io::Error::last_os_error()
                );
                break;
            }
        }
    }
}

impl Drop for Indicator {
    fn drop(&mut self) {
        // SAFETY: window is ours; Paint remains alive through synchronous destruction.
        unsafe {
            DestroyWindow(self.hwnd);
            DeleteObject(self.paint.brush);
            DeleteObject(self.paint.font);
        }
        // icon is LR_SHARED: never destroy the module's resource.
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn signal_closes_the_open_indicator_without_waiting_for_the_deadline() {
        let mut state = Lifecycle::new();
        assert_eq!(state.update(Duration::ZERO, None, false), None);
        assert_eq!(
            state.update(Duration::from_millis(150), Some(Signal::FirstFrame), false),
            Some(Closed::HubVisible)
        );
        assert_eq!(state.update(LIMIT, None, false), Some(Closed::HubVisible));
    }
    #[test]
    fn maintenance_releases_the_generation_before_binary_mutation() {
        let mut state = Lifecycle::new();
        assert_eq!(
            state.update(Duration::from_millis(50), Some(Signal::Maintenance), false),
            Some(Closed::Maintenance)
        );
        assert_eq!(state.update(LIMIT, None, false), Some(Closed::Maintenance));
    }
    #[test]
    fn timeout_and_engine_failure_close_the_indicator() {
        let mut state = Lifecycle::new();
        assert_eq!(
            state.update(
                LIMIT.checked_sub(Duration::from_millis(1)).unwrap(),
                None,
                false
            ),
            None
        );
        assert_eq!(state.update(LIMIT, None, false), Some(Closed::Timeout));
        let mut state = Lifecycle::new();
        assert_eq!(
            state.update(Duration::ZERO, None, true),
            Some(Closed::EngineExited)
        );
    }
}
