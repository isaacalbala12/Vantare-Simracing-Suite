//! HWND de captura: nace oculto fuera de todos los monitores; nunca activa.
use crate::overlay::{Hwnd, ffi::Rect};
use gpui::{App, Bounds, Window, WindowBounds, WindowKind, WindowOptions, point, px, size};

#[cfg(windows)]
mod win {
    use super::{Hwnd, Rect};
    #[link(name = "user32")]
    unsafe extern "system" {
        pub fn EnumDisplayMonitors(
            dc: isize,
            clip: *const Rect,
            callback: unsafe extern "system" fn(isize, isize, *mut Rect, isize) -> i32,
            data: isize,
        ) -> i32;
        pub fn GetWindowRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
        pub fn GetDpiForWindow(hwnd: Hwnd) -> u32;
        pub fn ShowWindow(hwnd: Hwnd, command: i32) -> i32;
        pub fn GetForegroundWindow() -> Hwnd;
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn CreateMutexW(
            attributes: *const std::ffi::c_void,
            owner: i32,
            name: *const u16,
        ) -> isize;
        pub fn WaitForSingleObject(handle: isize, milliseconds: u32) -> u32;
        pub fn ReleaseMutex(handle: isize) -> i32;
        pub fn CloseHandle(handle: isize) -> i32;
    }
}

pub struct CaptureLock(isize);
#[cfg(windows)]
pub fn lock() -> Result<CaptureLock, String> {
    let name = "Global\\VantareParityCapture\0"
        .encode_utf16()
        .collect::<Vec<_>>();
    // SAFETY: valid terminated name, no security attributes; owner releases on this thread.
    let handle = unsafe { win::CreateMutexW(std::ptr::null(), 0, name.as_ptr()) };
    if handle == 0 {
        return Err("crear mutex de captura".into());
    }
    // SAFETY: handle is a live mutex; bounded wait (abandoned is acquired too).
    if !matches!(
        unsafe { win::WaitForSingleObject(handle, 300_000) },
        0 | 0x80
    ) {
        unsafe {
            win::CloseHandle(handle);
        }
        return Err("el mutex de captura no quedó libre en cinco minutos".into());
    }
    let lock = CaptureLock(handle);
    match std::fs::read_to_string("C:/tmp/fase2/pantalla-ocupada") {
        Ok(turn) if std::env::var("VANTARE_CAPTURE_TURN").is_ok_and(|own| own == turn.trim()) => {}
        Ok(_) => {
            return Err(
                "pantalla-ocupada pertenece a otro turno; no se abre ninguna ventana".into(),
            );
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("comprobar turno de captura: {error}")),
    }
    Ok(lock)
}
#[cfg(windows)]
impl Drop for CaptureLock {
    fn drop(&mut self) {
        // SAFETY: this thread owns the live mutex acquired by lock.
        unsafe {
            win::ReleaseMutex(self.0);
            win::CloseHandle(self.0);
        }
    }
}
#[cfg(not(windows))]
pub fn lock() -> Result<CaptureLock, String> {
    Err("capturas HWND requieren Windows".into())
}

#[cfg(windows)]
fn monitors() -> Result<Vec<Rect>, String> {
    unsafe extern "system" fn collect(_: isize, _: isize, rect: *mut Rect, data: isize) -> i32 {
        // SAFETY: EnumDisplayMonitors invokes synchronously with a valid RECT;
        // data points to the Vec owned by monitors for the whole enumeration.
        unsafe {
            (*(data as *mut Vec<Rect>)).push(*rect);
        }
        1
    }
    let mut rectangles = Vec::<Rect>::new();
    // SAFETY: callback and Vec remain alive until enumeration returns.
    if unsafe {
        win::EnumDisplayMonitors(0, std::ptr::null(), collect, (&raw mut rectangles) as isize)
    } == 0
        || rectangles.is_empty()
    {
        return Err("no se pudo enumerar todos los monitores".into());
    }
    Ok(rectangles)
}

fn outside(monitors: &[Rect], width: i32, height: i32) -> Result<Rect, String> {
    if monitors.is_empty() || !(1..=8192).contains(&width) || !(1..=8192).contains(&height) {
        return Err("monitores o dimensiones de captura inválidos".into());
    }
    let right = monitors
        .iter()
        .map(|r| r.left)
        .min()
        .ok_or("sin monitores")?
        .checked_sub(2048)
        .ok_or("coordenada fuera de rango")?;
    Ok(Rect {
        left: right
            .checked_sub(width)
            .ok_or("coordenada fuera de rango")?,
        top: 0,
        right,
        bottom: height,
    })
}

fn intersects(a: Rect, b: Rect) -> bool {
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

#[cfg(windows)]
pub fn options(width: i32, height: i32) -> Result<WindowOptions, String> {
    let rect = outside(&monitors()?, width, height)?;
    Ok(WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
            point(px(rect.left as f32), px(rect.top as f32)),
            size(px(width as f32), px(height as f32)),
        ))),
        focus: false,
        show: false,
        kind: WindowKind::PopUp,
        titlebar: None,
        is_movable: false,
        is_resizable: false,
        is_minimizable: false,
        window_min_size: Some(size(px(1.0), px(1.0))),
        ..Default::default()
    })
}

/// Se mide ANTES de mostrar. Si GPUI/Windows recoloca el HWND, falla oculto.
#[cfg(windows)]
pub fn show(window: &mut Window, width: i32, height: i32, cx: &mut App) -> Result<Hwnd, String> {
    use crate::overlay::ffi::{GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos};
    let hwnd = crate::overlay::hwnd_of(window).ok_or("HWND no disponible")?;
    let monitors = monitors()?;
    let target = outside(&monitors, width, height)?;
    let mut initial = Rect::default();
    // SAFETY: HWND belongs to this live GPUI window. All pointers are locals.
    unsafe {
        win::ShowWindow(hwnd, 0);
        if win::GetWindowRect(hwnd, &raw mut initial) == 0
            || monitors.iter().any(|r| intersects(initial, *r))
        {
            return Err("el HWND nació o fue recolocado dentro de un monitor; sigue oculto".into());
        }
        let ex = GetWindowLongPtrW(hwnd, -20);
        SetWindowLongPtrW(hwnd, -20, (ex | 0x0800_0080) & !0x0004_0008); // NOACTIVATE, TOOLWINDOW; no APPWINDOW/TOPMOST
        SetWindowLongPtrW(hwnd, -16, 0x8400_0000); // WS_POPUP | WS_CLIPSIBLINGS, todavía oculto
        if SetWindowPos(hwnd, 0, target.left, target.top, width, height, 0x0034) == 0 {
            // NOZORDER | NOACTIVATE | FRAMECHANGED
            return Err("no se pudo dimensionar el HWND oculto".into());
        }
        verify(hwnd)?;
        let mut client = Rect::default();
        if crate::overlay::ffi::GetClientRect(hwnd, &raw mut client) == 0
            || client.right - client.left != width
            || client.bottom - client.top != height
            || win::GetDpiForWindow(hwnd) != 96
        {
            return Err("cliente o DPI de captura inesperados; el HWND sigue oculto".into());
        }
        if SetWindowPos(hwnd, 0, target.left, target.top, width, height, 0x0054) == 0 {
            // SHOWWINDOW | NOACTIVATE | NOZORDER
            return Err("no se pudo presentar el HWND fuera de pantalla".into());
        }
        verify(hwnd)?;
        if win::GetForegroundWindow() == hwnd {
            win::ShowWindow(hwnd, 0);
            return Err("la ventana de captura recibió foco".into());
        }
    }
    // WM_SIZE may arrive reentrantly while GPUI's Window is borrowed by its
    // owner. Sync the cached viewport explicitly and invalidate the full frame
    // after the native resize; otherwise PrintWindow can include the old size.
    window.bounds_changed(cx);
    let viewport = window.viewport_size() * window.scale_factor();
    if (viewport.width.0 - width as f32).abs() > 0.5
        || (viewport.height.0 - height as f32).abs() > 0.5
    {
        // SAFETY: hide our HWND before rejecting a stale GPUI viewport.
        unsafe {
            win::ShowWindow(hwnd, 0);
        }
        return Err("el viewport GPUI no coincide con el cliente de captura".into());
    }
    println!(
        "capture-viewport physical={}x{} expected={width}x{height}",
        viewport.width.0, viewport.height.0
    );
    Ok(hwnd)
}

/// Se llama una vez, inmediatamente después de `open_window`, antes de mostrar.
#[cfg(windows)]
pub fn created(window: &Window) -> Result<(), String> {
    let hwnd = crate::overlay::hwnd_of(window).ok_or("HWND no disponible")?;
    verify(hwnd)?;
    // SAFETY: reads styles only from this live HWND.
    let (style, extended) = unsafe {
        (
            crate::overlay::ffi::GetWindowLongPtrW(hwnd, -16),
            crate::overlay::ffi::GetWindowLongPtrW(hwnd, -20),
        )
    };
    if style & 0x1000_0000 != 0 || extended & 0x0800_0080 != 0x0800_0080 {
        // SAFETY: hide our HWND before returning the failure.
        unsafe {
            win::ShowWindow(hwnd, 0);
        }
        return Err("el HWND no nació oculto, TOOLWINDOW y NOACTIVATE".into());
    }
    println!(
        "capture-created pid={} hwnd={hwnd} visible=false noactivate=true toolwindow=true",
        std::process::id()
    );
    Ok(())
}

#[cfg(not(windows))]
pub fn created(_: &Window) -> Result<(), String> {
    Err("capturas HWND requieren Windows".into())
}

#[cfg(windows)]
pub fn verify(hwnd: Hwnd) -> Result<(), String> {
    let mut rect = Rect::default();
    // SAFETY: caller owns a live HWND; rect is writable for the call.
    if unsafe { win::GetWindowRect(hwnd, &raw mut rect) } == 0
        || monitors()?.iter().any(|r| intersects(rect, *r))
    {
        // SAFETY: hide only the caller's HWND before propagating the failure.
        unsafe {
            win::ShowWindow(hwnd, 0);
        }
        return Err("HWND de captura dentro de un monitor: ocultado, lote detenido".into());
    }
    println!(
        "capture-window pid={} hwnd={hwnd} rect={},{},{},{} focus=false",
        std::process::id(),
        rect.left,
        rect.top,
        rect.right,
        rect.bottom
    );
    Ok(())
}

#[cfg(not(windows))]
pub fn options(_: i32, _: i32) -> Result<WindowOptions, String> {
    Err("capturas HWND requieren Windows".into())
}
#[cfg(not(windows))]
pub fn show(_: &mut Window, _: i32, _: i32, _: &mut App) -> Result<Hwnd, String> {
    Err("capturas HWND requieren Windows".into())
}
#[cfg(not(windows))]
pub fn verify(_: Hwnd) -> Result<(), String> {
    Err("capturas HWND requieren Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn offscreen_placement_covers_negative_and_stacked_monitors() {
        let monitors = [
            Rect {
                left: -7680,
                top: -2160,
                right: -3840,
                bottom: 0,
            },
            Rect {
                left: -3840,
                top: 0,
                right: 0,
                bottom: 2160,
            },
            Rect {
                left: 0,
                top: 0,
                right: 3840,
                bottom: 2160,
            },
        ];
        for (w, h) in [(1440, 900), (8192, 8192), (1, 1)] {
            let rect = outside(&monitors, w, h).expect("posición segura");
            assert!(monitors.iter().all(|m| !intersects(rect, *m)));
            assert_eq!((rect.right - rect.left, rect.bottom - rect.top), (w, h));
        }
        assert!(outside(&[], 100, 100).is_err());
        assert!(outside(&monitors, 0, 100).is_err());
    }
}
