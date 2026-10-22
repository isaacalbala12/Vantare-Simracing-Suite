//! Activación inicial de una ventana normal, sin generar entrada del usuario.
/// Solicita primer plano una sola vez. Windows conserva la decisión si el usuario
/// ya activó otra aplicación; no se reintenta ni se cambia el orden permanente.
#[cfg(windows)]
pub fn request(window: &gpui::Window) -> bool {
    let Some(hwnd) = crate::overlay::hwnd_of(window) else {
        return false;
    };
    // SAFETY: HWND de esta ventana GPUI, vivo durante la llamada del hilo de UI.
    unsafe { windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow(hwnd as *mut _) != 0 }
}

/// Oculta solo la ventana propia mientras termina la confirmación de arranque.
#[cfg(windows)]
pub fn hide(window: &gpui::Window) {
    if let Some(hwnd) = crate::overlay::hwnd_of(window) {
        // SAFETY: HWND propio, vivo durante la actualización GPUI.
        unsafe {
            windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(hwnd as *mut _, 0);
        }
    }
}

#[cfg(not(windows))]
pub fn hide(window: &gpui::Window) {
    window.minimize_window();
}

#[cfg(not(windows))]
pub fn request(window: &gpui::Window) -> bool {
    let _ = window;
    true
}

/// Señal explícita, después del primer frame. Solo puede cerrar un indicador
/// de nuestra clase Win32; no acepta un HWND arbitrario de otro producto.
#[cfg(windows)]
pub fn finish_startup() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetWindowThreadProcessId, PostMessageW,
    };
    let Some(value) = std::env::var_os("VANTARE_STARTUP_WINDOW") else {
        return;
    };
    let Some(hwnd) = value
        .to_str()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value != 0)
    else {
        return;
    };
    let hwnd = hwnd as *mut std::ffi::c_void;
    let Some(expected_pid) = std::env::var("VANTARE_STARTUP_PID")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value != 0)
    else {
        return;
    };
    let mut pid = 0;
    let mut class = [0_u16; 64];
    // SAFETY: bounded writable UTF-16 buffer; Win32 validates the external HWND.
    let count = unsafe {
        GetWindowThreadProcessId(hwnd, &raw mut pid);
        GetClassNameW(hwnd, class.as_mut_ptr(), 64)
    };
    if pid == expected_pid
        && count > 0
        && String::from_utf16_lossy(&class[..count as usize]) == vantare_ipc::product::STARTUP_CLASS
    {
        // SAFETY: no pointers/data in the message; target class checked above.
        unsafe {
            PostMessageW(hwnd, vantare_ipc::product::STARTUP_READY, 0, 0);
        }
    }
}

#[cfg(not(windows))]
pub fn finish_startup() {}
