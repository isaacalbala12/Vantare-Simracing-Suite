use super::{Error, Resultado};
use std::{ffi::OsStr, os::windows::ffi::OsStrExt};
use windows::{
    Win32::{
        Foundation::{COLORREF, HWND, LPARAM, LRESULT, WPARAM},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            HiDpi::{
                DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, GetDpiForWindow,
                SetThreadDpiAwarenessContext,
            },
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DestroyWindow, HWND_TOPMOST, LWA_ALPHA,
                PostQuitMessage, RegisterClassW, SWP_NOACTIVATE, SWP_SHOWWINDOW,
                SetLayeredWindowAttributes, SetWindowPos, WM_CLOSE, WM_MOUSEACTIVATE, WM_NCHITTEST,
                WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP,
                WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT, WS_POPUP,
            },
        },
    },
    core::w,
};

pub(super) fn ancho(texto: &OsStr) -> Vec<u16> {
    texto.encode_wide().chain(Some(0)).collect()
}

pub(super) struct Ventana {
    pub hwnd: HWND,
    pub dpi: f32,
}

impl Ventana {
    pub fn nueva(x: i32, y: i32, ancho: i32, alto: i32) -> Resultado<Self> {
        // SAFETY: clase sin estado compartido, HWND usado exclusivamente en este hilo.
        unsafe {
            let anterior = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
            if anterior.0.is_null() {
                return Err(windows::core::Error::from_thread().into());
            }
            let resultado = Self::crear(x, y, ancho, alto);
            SetThreadDpiAwarenessContext(anterior);
            resultado
        }
    }

    unsafe fn crear(x: i32, y: i32, ancho: i32, alto: i32) -> Resultado<Self> {
        unsafe {
            let instancia = GetModuleHandleW(None)?;
            let clase = WNDCLASSW {
                hInstance: instancia.into(),
                lpszClassName: w!("VantareCompositor2022"),
                lpfnWndProc: Some(procedimiento),
                ..Default::default()
            };
            if RegisterClassW(&raw const clase) == 0 {
                let error = windows::core::Error::from_thread();
                if error.code() != windows::core::HRESULT::from_win32(1410) {
                    return Err(error.into());
                }
            }
            let hwnd = CreateWindowExW(
                WS_EX_NOREDIRECTIONBITMAP
                    | WS_EX_TOPMOST
                    | WS_EX_TOOLWINDOW
                    | WS_EX_NOACTIVATE
                    | WS_EX_TRANSPARENT
                    | WS_EX_LAYERED,
                clase.lpszClassName,
                w!("VANTA-140 compositor"),
                WS_POPUP,
                x,
                y,
                ancho,
                alto,
                None,
                None,
                Some(instancia.into()),
                None,
            )?;
            let ventana = Self {
                hwnd,
                dpi: f32::from(
                    u16::try_from(GetDpiForWindow(hwnd))
                        .map_err(|_| Error::Entrada("DPI fuera de rango"))?,
                ),
            };
            SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)?;
            SetWindowPos(
                hwnd,
                Some(HWND_TOPMOST),
                x,
                y,
                ancho,
                alto,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            )?;
            Ok(ventana)
        }
    }
}

impl Drop for Ventana {
    fn drop(&mut self) {
        // SAFETY: esta instancia posee el HWND y se destruye en el hilo creador.
        if let Err(error) = unsafe { DestroyWindow(self.hwnd) } {
            eprintln!("Cerrar ventana compositor: {error}");
        }
    }
}

unsafe extern "system" fn procedimiento(
    hwnd: HWND,
    mensaje: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match mensaje {
        WM_NCHITTEST => LRESULT(-1), // HTTRANSPARENT; layered + transparent cruza también procesos.
        WM_MOUSEACTIVATE => LRESULT(3), // MA_NOACTIVATE.
        WM_CLOSE => {
            unsafe {
                PostQuitMessage(0);
            }
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, mensaje, wparam, lparam) },
    }
}
