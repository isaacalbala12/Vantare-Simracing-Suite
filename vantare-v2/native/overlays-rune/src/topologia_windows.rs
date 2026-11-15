//! Consulta nativa de monitores, sin HWND, DC ni dispositivo gráfico.
//! Mismo HMONITOR/DPI efectivo que vendor/winit de la copia fijada.
//! https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-enumdisplaymonitors
//! https://learn.microsoft.com/windows/win32/api/shellscalingapi/nf-shellscalingapi-getdpiformonitor
use crate::monitores::Monitor;
use std::{
    ffi::c_void,
    io,
    panic::{AssertUnwindSafe, catch_unwind},
};

#[repr(C)]
#[derive(Default)]
struct Rect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}
#[repr(C)]
#[derive(Default)]
struct Info {
    size: u32,
    bounds: Rect,
    work: Rect,
    flags: u32,
}
struct Enumeration {
    monitors: Vec<Monitor>,
    error: Option<io::Error>,
}
#[link(name = "user32")]
unsafe extern "system" {
    fn EnumDisplayMonitors(
        dc: *mut c_void,
        clip: *const Rect,
        callback: unsafe extern "system" fn(isize, *mut c_void, *mut Rect, isize) -> i32,
        data: isize,
    ) -> i32;
    fn GetMonitorInfoW(monitor: isize, info: *mut Info) -> i32;
}
#[link(name = "shcore")]
unsafe extern "system" {
    fn GetDpiForMonitor(monitor: isize, kind: i32, x: *mut u32, y: *mut u32) -> i32;
}

fn read_monitor(id: isize) -> io::Result<Monitor> {
    let mut info = Info {
        size: std::mem::size_of::<Info>() as u32,
        ..Info::default()
    };
    let (mut x, mut y) = (0, 0);
    // SAFETY: estructuras Win32 con repr(C), inicializadas y vivas durante la
    // llamada. HMONITOR prestado por EnumDisplayMonitors, nunca se destruye.
    unsafe {
        if GetMonitorInfoW(id, &mut info) == 0 {
            return Err(io::Error::last_os_error());
        }
        let result = GetDpiForMonitor(id, 0, &mut x, &mut y);
        if result != 0 {
            return Err(io::Error::other(format!(
                "GetDpiForMonitor HRESULT {result:#x}"
            )));
        }
    }
    let width = u32::try_from(i64::from(info.bounds.right) - i64::from(info.bounds.left))
        .map_err(io::Error::other)?;
    let height = u32::try_from(i64::from(info.bounds.bottom) - i64::from(info.bounds.top))
        .map_err(io::Error::other)?;
    if id == 0 || x == 0 || y == 0 || width == 0 || height == 0 {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "monitor sin tamaño/DPI",
        ));
    }
    Ok(Monitor {
        id,
        position: (info.bounds.left, info.bounds.top),
        size: (width, height),
        scale: f64::from(x) / 96.0,
        primary: info.flags & 1 != 0,
    })
}
unsafe extern "system" fn enumerate(id: isize, _: *mut c_void, _: *mut Rect, data: isize) -> i32 {
    // SAFETY: read pasa un &mut Enumeration exclusivo, y EnumDisplayMonitors
    // solo lo presta a callbacks síncronos hasta retornar. No se guarda el ptr.
    let enumeration = unsafe { &mut *(data as *mut Enumeration) };
    let result = catch_unwind(AssertUnwindSafe(|| {
        if enumeration.monitors.len() >= 128 {
            return Err(io::Error::other("demasiados monitores"));
        }
        enumeration.monitors.push(read_monitor(id)?);
        Ok(())
    }));
    match result {
        Ok(Ok(())) => 1,
        Ok(Err(error)) => {
            enumeration.error = Some(error);
            0
        }
        Err(_) => {
            enumeration.error = Some(io::Error::other("panic al enumerar monitores"));
            0
        }
    }
}
pub(crate) fn read() -> io::Result<Vec<Monitor>> {
    let mut enumeration = Enumeration {
        monitors: Vec::new(),
        error: None,
    };
    // SAFETY: sin DC ni rectángulo de recorte; la única memoria que recibe la
    // callback es enumeration, viva y exclusiva hasta acabar esta llamada.
    let ok = unsafe {
        EnumDisplayMonitors(
            std::ptr::null_mut(),
            std::ptr::null(),
            enumerate,
            (&mut enumeration as *mut Enumeration) as isize,
        )
    };
    if let Some(error) = enumeration.error {
        return Err(error);
    }
    if ok == 0 {
        return Err(io::Error::last_os_error());
    }
    enumeration.monitors.sort_by_key(|m| m.id);
    Ok(enumeration.monitors)
}

#[cfg(test)]
mod tests {
    #[test]
    fn ffi_structs_match_win32_abi_without_querying_the_desktop() {
        assert_eq!(std::mem::size_of::<super::Rect>(), 16);
        assert_eq!(std::mem::size_of::<super::Info>(), 40);
    }
}
