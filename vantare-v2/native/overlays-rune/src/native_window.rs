//! Ajustes Windows del host: mismo contrato que ui::overlay, sin enlazar GPUI.
#[cfg(windows)]
pub fn configure(window: &rune::WindowHandle) -> Result<(), String> {
    use rune::raw_window_handle::RawWindowHandle;
    window.with_raw_handle(|handle| {
        let RawWindowHandle::Win32(handle) = handle.as_raw() else {
            return Err("no hay HWND de Windows".into());
        };
        let hwnd = handle.hwnd.get();
        #[link(name = "user32")]
        unsafe extern "system" {
            fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
            fn SetWindowLongPtrW(hwnd: isize, index: i32, value: isize) -> isize;
            fn SetWindowPos(
                hwnd: isize,
                after: isize,
                x: i32,
                y: i32,
                w: i32,
                h: i32,
                flags: u32,
            ) -> i32;
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn SetLastError(error: u32);
        }
        // SAFETY: handle prestado de la ventana Rune en el hilo de eventos;
        // no se conserva ni se destruye el HWND. No se cambia el orden/foco.
        unsafe {
            SetLastError(0);
            let previous = GetWindowLongPtrW(hwnd, -20);
            if previous == 0 && std::io::Error::last_os_error().raw_os_error() != Some(0) {
                return Err("leer estilo de ventana".into());
            }
            SetLastError(0);
            let style = (previous | 0x0800_0000 | 0x80) & !0x0004_0000;
            if SetWindowLongPtrW(hwnd, -20, style) == 0
                && std::io::Error::last_os_error().raw_os_error() != Some(0)
            {
                return Err("aplicar ventana sin activación".into());
            }
            if SetWindowPos(hwnd, 0, 0, 0, 0, 0, 0x1 | 0x2 | 0x4 | 0x10 | 0x20) == 0 {
                return Err("aplicar marco sin cambiar foco".into());
            }
        }
        Ok(())
    })?
}

#[cfg(not(windows))]
pub fn configure(_: &rune::WindowHandle) -> Result<(), String> {
    Ok(())
}
