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
