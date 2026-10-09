//! Biblioteca visual de Vantare (ADR 0099): overlays GPUI sobre el `ViewModel`
//! de `domain`.
//!
//! GPUI se usa directamente; este crate solo añade la integración con Windows
//! ([`overlay`]) y las primitivas visuales (texto Inter con `letter-spacing`,
//! pintado a bajo nivel) que GPUI no trae.
//!
//! El pintado es aritmética de píxeles con `f32`: los `as` entre enteros y
//! flotantes son deliberados y acotados por el tamaño de la ventana.
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    clippy::too_many_arguments,
    clippy::too_many_lines,
    clippy::many_single_char_names,
    clippy::similar_names,
    clippy::float_cmp,
    clippy::unreadable_literal // colores hex de CSS
)]

mod motion_policy;
pub use motion_policy::MotionPolicy;

mod app;
#[cfg(feature = "parity-capture")]
pub mod capture;
mod connection;
mod demand;
pub mod efficiency;
pub mod geometry;
pub mod layout;
mod overlay;
pub mod paths;
#[cfg(feature = "paint-stats")]
#[path = "../../profiling.rs"]
pub mod profiling;
mod rights;
pub mod source;
#[cfg(feature = "paint-stats")]
mod stats;
pub mod theme;
#[cfg(windows)]
mod tray;
mod vantare;
pub mod workshop;

include!("registry.rs");

// Hub incrusta el mismo renderer productivo.
pub use app::{
    Overlay, layout_row, run_layout_requested, run_layout_requested_hidden, run_layout_with_rights,
    run_placed, run_with_connection, run_with_rights,
};

/// Requests a zoom change for this window only, via the vendored Windows backend.
/// Posted rather than sent: resize callbacks must run after the current GPUI update.
pub fn set_window_zoom(window: &gpui::Window, percent: u16) -> Result<(), String> {
    if !matches!(percent, 90 | 100 | 110 | 125) {
        return Err("Tamaño de interfaz no válido".into());
    }
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn PostMessageW(hwnd: isize, message: u32, wparam: usize, lparam: isize) -> i32;
        }
        let hwnd = overlay::hwnd_of(window).ok_or("Ventana no disponible")?;
        // SAFETY: HWND comes from this GPUI window; payload contains no pointers.
        if unsafe { PostMessageW(hwnd, 0x8000 + 0x1470, usize::from(percent), 0) } == 0 {
            return Err(format!(
                "Cambiar tamaño de interfaz: {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        if percent == 100 {
            Ok(())
        } else {
            Err("Zoom disponible solo en Windows".into())
        }
    }
}

/// Largest Hub zoom that leaves its 1280 x 800 logical design area.
pub fn window_zoom_limit(window: &gpui::Window) -> f32 {
    #[cfg(not(windows))]
    let _ = window;
    #[cfg(windows)]
    {
        #[link(name = "user32")]
        unsafe extern "system" {
            fn GetDpiForWindow(hwnd: isize) -> u32;
        }
        if let Some(hwnd) = overlay::hwnd_of(window) {
            // SAFETY: HWND belongs to the live GPUI window; no pointers are passed.
            let dpi = unsafe { GetDpiForWindow(hwnd) } as f32 / 96.0;
            if dpi > 0.0 {
                let size = window.viewport_size();
                return (f32::from(size.width) / 1280.0).min(f32::from(size.height) / 800.0)
                    * window.scale_factor()
                    / dpi
                    * 100.0;
            }
        }
    }
    100.0
}

pub mod performance;
