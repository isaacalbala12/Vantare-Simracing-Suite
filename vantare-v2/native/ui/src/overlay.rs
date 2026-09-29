//! Comportamiento de overlay en Windows (ADR 0099 §5).
//!
//! GPUI crea la ventana `PopUp` como `WS_EX_TOOLWINDOW | WS_EX_TOPMOST` con
//! composición `DirectComposition`, pero no la hace click-through ni la impide
//! activarse, y la crea con bits de título que dejan un marco invisible. Aquí se
//! corrige sobre el HWND con FFI directa a user32/dwmapi (sin dependencias).

use gpui::Window;

pub(crate) type Hwnd = isize;

pub(crate) mod ffi {
    use super::Hwnd;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct Rect {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct Point {
        pub x: i32,
        pub y: i32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        pub fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        pub fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
        pub fn SetLayeredWindowAttributes(hwnd: Hwnd, key: u32, alpha: u8, flags: u32) -> i32;
        pub fn SetWindowPos(
            hwnd: Hwnd,
            after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        pub fn GetClientRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
        pub fn ClientToScreen(hwnd: Hwnd, point: *mut Point) -> i32;
    }
    #[link(name = "dwmapi")]
    unsafe extern "system" {
        pub fn DwmSetWindowAttribute(
            hwnd: Hwnd,
            attribute: u32,
            value: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }
}

/// HWND de la ventana GPUI.
pub fn hwnd_of(window: &Window) -> Option<Hwnd> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    match HasWindowHandle::window_handle(window).ok()?.as_raw() {
        RawWindowHandle::Win32(handle) => Some(handle.hwnd.get()),
        _ => None,
    }
}

/// Transparente, click-through, sin foco, siempre encima, sin marco ni
/// esquinas de sistema. Los fallos de las llamadas Win32 no se propagan: el
/// overlay sigue siendo usable (solo perdería una de las propiedades).
pub fn apply(hwnd: Hwnd) {
    const GWL_STYLE: i32 = -16;
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_TOPMOST: u32 = 0x8;
    const WS_EX_TRANSPARENT: u32 = 0x20;
    const WS_EX_TOOLWINDOW: u32 = 0x80;
    const WS_EX_LAYERED: u32 = 0x8_0000;
    const WS_EX_NOACTIVATE: u32 = 0x0800_0000;
    const WS_POPUP_VISIBLE: u32 = 0x8000_0000 | 0x1000_0000 | 0x0400_0000;
    const SWP_NOACTIVATE: u32 = 0x10;
    const SWP_FRAMECHANGED: u32 = 0x20;
    const HWND_TOPMOST: Hwnd = -1;
    const LWA_ALPHA: u32 = 0x2;
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWA_BORDER_COLOR: u32 = 34;
    use ffi::{
        ClientToScreen, DwmSetWindowAttribute, GetClientRect, GetWindowLongPtrW, Point, Rect,
        SetLayeredWindowAttributes, SetWindowLongPtrW, SetWindowPos,
    };

    let (mut client, mut origin) = (Rect::default(), Point::default());
    let do_not_round: u32 = 1; // DWMWCP_DONOTROUND
    let no_border: u32 = 0xFFFF_FFFE; // DWMWA_COLOR_NONE
    // SAFETY: `hwnd` es el HWND vivo de una ventana de este proceso, obtenido de
    // `raw-window-handle` en el hilo de la interfaz; todos los punteros apuntan a
    // locales que viven durante la llamada y los tamaños pasados coinciden.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let wanted = style
            | WS_EX_LAYERED
            | WS_EX_TRANSPARENT
            | WS_EX_NOACTIVATE
            | WS_EX_TOOLWINDOW
            | WS_EX_TOPMOST;
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, wanted as isize);
        // Una ventana layered sin atributos no se dibuja: alfa global 255.
        SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);
        // GPUI crea la ventana con WS_CAPTION..., que deja un marco invisible de
        // 8 px. WS_POPUP no tiene área no cliente: el exterior pasa a ser el cliente.
        GetClientRect(hwnd, &raw mut client);
        ClientToScreen(hwnd, &raw mut origin);
        SetWindowLongPtrW(hwnd, GWL_STYLE, WS_POPUP_VISIBLE as isize);
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            origin.x,
            origin.y,
            client.right - client.left,
            client.bottom - client.top,
            SWP_FRAMECHANGED | SWP_NOACTIVATE,
        );
        // Windows 11 redondea las esquinas de toda ventana y recortaría las del widget.
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            (&raw const do_not_round).cast(),
            4,
        );
        DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, (&raw const no_border).cast(), 4);
    }
}

/// Cambia el tamaño (px físicos) de una ventana ya pasada por [`apply`].
pub fn resize(hwnd: Hwnd, width: i32, height: i32) {
    const SWP_KEEP_POSITION: u32 = 0x2 | 0x4 | 0x10; // SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE
    // SAFETY: `hwnd` es un HWND vivo de este proceso; la llamada no toma punteros.
    unsafe {
        ffi::SetWindowPos(hwnd, 0, 0, 0, width, height, SWP_KEEP_POSITION);
    }
}
