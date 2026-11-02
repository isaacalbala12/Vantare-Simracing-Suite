//! Entrada QA a los manejadores reales; sin automatizar clics ni teclado.
use super::{Process, Real, alive, kill, note, opt, tray};
use std::{fs, path::PathBuf, process::ExitCode};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, FindWindowW, GetMessageW,
        GetWindowThreadProcessId, IsWindowVisible, MSG, PostMessageW, PostQuitMessage,
        RegisterClassW, SMTO_ABORTIFHUNG, SendMessageTimeoutW, TranslateMessage, WM_APP, WM_CLOSE,
        WM_DESTROY, WNDCLASSW,
    },
};

const HUB_TITLE: &str = "Vantare · Hub";

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

pub(super) fn assert_shell() {
    let class = wide("Shell_TrayWnd");
    assert!(
        !unsafe { FindWindowW(class.as_ptr(), std::ptr::null()) }.is_null(),
        "lifecycle de overlays real requiere sesión Windows interactiva dedicada con Explorer"
    );
}

pub(super) fn assert_no_existing_hub() {
    // tray.rs busca por título global; nunca enfocar un Hub real ajeno al test.
    let title = wide(HUB_TITLE);
    assert!(
        unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) }.is_null(),
        "cerrar el Hub existente antes de ejecutar la caracterización de bandeja"
    );
}

pub(super) fn invoke(real: &Real, command: usize) -> usize {
    let process = real.ready();
    let window = tray(process.pid).unwrap();
    let mut handled = 0;
    // HWND del hijo propio y payload cerrado, sin punteros ni entrada global.
    let sent = unsafe {
        SendMessageTimeoutW(
            window,
            WM_APP + 0x1860,
            command,
            0,
            SMTO_ABORTIFHUNG,
            5000,
            &raw mut handled,
        )
    };
    assert_ne!(
        sent,
        0,
        "manejador de bandeja sin respuesta: {}",
        std::io::Error::last_os_error()
    );
    handled
}

pub(super) struct HubGuard(pub Process);
impl Drop for HubGuard {
    fn drop(&mut self) {
        if alive(self.0) {
            kill(self.0);
        }
    }
}

pub(super) fn close_hub(pid: u32) {
    let window = owned_hub(pid);
    assert_ne!(unsafe { PostMessageW(window, WM_CLOSE, 0, 0) }, 0);
}

pub(super) fn hub_visible(pid: u32) -> bool {
    unsafe { IsWindowVisible(owned_hub(pid)) != 0 }
}

fn owned_hub(pid: u32) -> HWND {
    let title = wide(HUB_TITLE);
    let window = unsafe { FindWindowW(std::ptr::null(), title.as_ptr()) };
    let mut owner = 0;
    unsafe {
        GetWindowThreadProcessId(window, &raw mut owner);
    }
    assert_eq!(
        owner, pid,
        "el Hub falso sigue siendo el dueño de la ventana"
    );
    window
}

unsafe extern "system" fn hub_window(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_DESTROY {
        unsafe {
            PostQuitMessage(0);
        }
        return 0;
    }
    unsafe { DefWindowProcW(window, message, wparam, lparam) }
}

pub(super) fn hub_process(args: &[String]) -> ExitCode {
    let root = PathBuf::from(opt(args, "--data-dir"))
        .parent()
        .unwrap()
        .to_path_buf();
    note(root.join("status").to_str().unwrap(), "hub entering");
    let class = wide("VantareLifecycleFakeHub");
    let title = wide(HUB_TITLE);
    let definition = WNDCLASSW {
        lpfnWndProc: Some(hub_window),
        lpszClassName: class.as_ptr(),
        ..unsafe { std::mem::zeroed() }
    };
    assert_ne!(unsafe { RegisterClassW(&raw const definition) }, 0);
    let window = unsafe {
        CreateWindowExW(
            0,
            class.as_ptr(),
            title.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null(),
        )
    };
    assert!(!window.is_null());
    note(
        root.join("status").to_str().unwrap(),
        &format!("hub pid={}", std::process::id()),
    );
    let mut message: MSG = unsafe { std::mem::zeroed() };
    while unsafe { GetMessageW(&raw mut message, std::ptr::null_mut(), 0, 0) } > 0 {
        unsafe {
            TranslateMessage(&raw const message);
            DispatchMessageW(&raw const message);
        }
    }
    fs::write(root.join("hub-exit"), "idle").unwrap();
    ExitCode::SUCCESS
}
