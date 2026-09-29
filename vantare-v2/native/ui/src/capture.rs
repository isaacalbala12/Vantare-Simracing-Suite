//! Captura con alfa de Standings para la prueba de paridad (feature
//! `parity-capture`, no entra en el binario de producto).
//!
//! GPUI en Windows no lee la textura de la ventana. Se pinta el mismo estado
//! sobre un fondo opaco negro y luego blanco, se copia el área cliente por GDI
//! (lo que compone DWM) y se resuelve el alfa: `a = 1 - (Cw - Cb)/255`,
//! `F = Cb/a`. Compárese con `parity/reference/standings-44.png` mediante
//! `parity/diff.py`.

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::rc::Rc;
use std::time::Duration;

use gpui::{App, AsyncApp, Entity};
use vantare_domain::format::Preferences;

use crate::app::{self, Kind, Overlay};
use crate::overlay::{Hwnd, ffi};
use crate::source;
use crate::standings::view::col;

mod gdi {
    use std::ffi::c_void;

    use crate::overlay::Hwnd;

    #[repr(C)]
    pub struct BitmapInfoHeader {
        pub size: u32,
        pub width: i32,
        pub height: i32,
        pub planes: u16,
        pub bit_count: u16,
        pub compression: u32,
        pub size_image: u32,
        pub x_pels: i32,
        pub y_pels: i32,
        pub clr_used: u32,
        pub clr_important: u32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        pub fn GetDC(hwnd: Hwnd) -> *mut c_void;
        pub fn ReleaseDC(hwnd: Hwnd, dc: *mut c_void) -> i32;
        pub fn GetDpiForWindow(hwnd: Hwnd) -> u32;
    }
    #[link(name = "gdi32")]
    unsafe extern "system" {
        pub fn CreateCompatibleDC(dc: *mut c_void) -> *mut c_void;
        pub fn CreateCompatibleBitmap(dc: *mut c_void, w: i32, h: i32) -> *mut c_void;
        pub fn SelectObject(dc: *mut c_void, object: *mut c_void) -> *mut c_void;
        pub fn BitBlt(
            dst: *mut c_void,
            x: i32,
            y: i32,
            w: i32,
            h: i32,
            src: *mut c_void,
            sx: i32,
            sy: i32,
            rop: u32,
        ) -> i32;
        pub fn GetDIBits(
            dc: *mut c_void,
            bitmap: *mut c_void,
            start: u32,
            lines: u32,
            bits: *mut c_void,
            info: *mut BitmapInfoHeader,
            usage: u32,
        ) -> i32;
        pub fn DeleteObject(object: *mut c_void) -> i32;
        pub fn DeleteDC(dc: *mut c_void) -> i32;
    }
}

/// Copia BGRA de la región cliente tal como la compone DWM en pantalla.
fn capture_client(hwnd: Hwnd) -> Option<(u32, u32, Vec<u8>)> {
    use gdi::{
        BitBlt, BitmapInfoHeader, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC,
        DeleteObject, GetDC, GetDIBits, ReleaseDC, SelectObject,
    };
    const SRCCOPY: u32 = 0x00CC_0020;
    const CAPTUREBLT: u32 = 0x4000_0000;
    let (mut client, mut origin) = (ffi::Rect::default(), ffi::Point::default());
    // SAFETY: `hwnd` es un HWND vivo de este proceso; los punteros son de locales
    // que viven durante la llamada.
    unsafe {
        ffi::GetClientRect(hwnd, &raw mut client);
        ffi::ClientToScreen(hwnd, &raw mut origin);
    }
    let (w, h) = (client.right - client.left, client.bottom - client.top);
    if w <= 0 || h <= 0 {
        return None;
    }
    let mut pixels = vec![0u8; (w * h * 4) as usize];
    let mut info = BitmapInfoHeader {
        size: std::mem::size_of::<BitmapInfoHeader>() as u32,
        width: w,
        height: -h,
        planes: 1,
        bit_count: 32,
        compression: 0,
        size_image: 0,
        x_pels: 0,
        y_pels: 0,
        clr_used: 0,
        clr_important: 0,
    };
    // SAFETY: cada recurso GDI se crea y se libera aquí, en orden inverso;
    // `pixels` tiene exactamente `w * h * 4` bytes, lo que `GetDIBits` escribe
    // para un DIB de 32 bpp de `h` líneas.
    let (copied, lines) = unsafe {
        let screen = GetDC(0);
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, w, h);
        let previous = SelectObject(memory, bitmap);
        let copied = BitBlt(
            memory,
            0,
            0,
            w,
            h,
            screen,
            origin.x,
            origin.y,
            SRCCOPY | CAPTUREBLT,
        );
        let lines = GetDIBits(
            memory,
            bitmap,
            0,
            h as u32,
            pixels.as_mut_ptr().cast(),
            &raw mut info,
            0,
        );
        SelectObject(memory, previous);
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(0, screen);
        (copied, lines)
    };
    (copied != 0 && lines != 0).then_some((w as u32, h as u32, pixels))
}

/// Combina dos capturas BGRA del mismo estado sobre fondo negro y blanco en un
/// RGBA con alfa recto: `Cb = a F`, `Cw = a F + (1-a) 255`.
fn solve_alpha(black: &[u8], white: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(black.len());
    for (b, w) in black.chunks_exact(4).zip(white.chunks_exact(4)) {
        let diff: f32 = (0..3)
            .map(|i| (f32::from(w[i]) - f32::from(b[i])).max(0.0))
            .sum::<f32>()
            / 3.0;
        let alpha = (1.0 - diff / 255.0).clamp(0.0, 1.0);
        if alpha < 1.0 / 510.0 {
            out.extend_from_slice(&[0, 0, 0, 0]);
            continue;
        }
        let straight = |v: u8| (f32::from(v) / alpha).round().clamp(0.0, 255.0) as u8;
        // BGRA -> RGBA
        out.extend_from_slice(&[
            straight(b[2]),
            straight(b[1]),
            straight(b[0]),
            (alpha * 255.0).round() as u8,
        ]);
    }
    out
}

fn write_png(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| format!("crear {}: {e}", path.display()))?;
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
    writer.write_image_data(rgba).map_err(|e| e.to_string())
}

async fn sleep(cx: &AsyncApp, ms: u64) {
    cx.background_executor()
        .timer(Duration::from_millis(ms))
        .await;
}

/// Espera a que la ventana exista y el movimiento termine; devuelve su HWND.
async fn settled(cx: &mut AsyncApp, view: &Entity<Overlay>) -> Result<Hwnd, String> {
    for _ in 0..200 {
        sleep(cx, 50).await;
        let state = view.read_with(cx, |v, _| (v.hwnd(), v.animating()));
        if let (Some(hwnd), false) = state {
            return Ok(hwnd);
        }
    }
    Err("no se obtuvo el HWND de la ventana".into())
}

/// Pinta el estado sobre `level` (0 negro, 255 blanco) y captura cuando DWM ya
/// lo compuso: el hueco derecho (x = w-4, y = 3) es siempre transparente y debe
/// mostrar el fondo puro.
async fn pass(
    cx: &mut AsyncApp,
    view: &Entity<Overlay>,
    hwnd: Hwnd,
    level: u8,
) -> Result<(u32, u32, Vec<u8>), String> {
    let color = col(u32::from(level) * 0x0001_0101, 1.0);
    view.update(cx, |v, cx| {
        v.backdrop = Some(color);
        cx.notify();
    });
    let mut last = None;
    for _ in 0..60 {
        sleep(cx, 120).await;
        if let Some((w, h, pixels)) = capture_client(hwnd) {
            let at = (3 * w as usize + w as usize - 4) * 4;
            if pixels[at..at + 3].iter().all(|c| c.abs_diff(level) <= 1) {
                return Ok((w, h, pixels));
            }
            last = Some(pixels[at..at + 4].to_vec());
        }
    }
    Err(format!(
        "la pasada de nivel {level} no se asentó (píxel de margen BGRA: {last:?})"
    ))
}

async fn capture(mut cx: AsyncApp, view: Entity<Overlay>, path: PathBuf) -> Result<(), String> {
    let hwnd = settled(&mut cx, &view).await?;
    // La referencia son píxeles físicos a 100 % de DPI (SPEC §7).
    // SAFETY: `hwnd` es el HWND vivo de la ventana; la llamada no toma punteros.
    let dpi = unsafe { gdi::GetDpiForWindow(hwnd) };
    if dpi != 96 {
        return Err(format!(
            "la captura necesita 100 % de DPI y la ventana da {dpi}"
        ));
    }
    sleep(&cx, 200).await;
    let (w, h, black) = pass(&mut cx, &view, hwnd, 0).await?;
    let (_, _, white) = pass(&mut cx, &view, hwnd, 255).await?;
    write_png(&path, w, h, &solve_alpha(&black, &white))?;
    println!("captura {} ({w}x{h} px)", path.display());
    Ok(())
}

/// Abre Standings con la escena fija de `source::fixed`, captura y sale.
pub fn run(path: PathBuf) -> ExitCode {
    let failure = Rc::new(Cell::new(false));
    let flag = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if !app::init(cx) {
            flag.set(true);
            return;
        }
        let view = match app::open_window(cx, Kind::Standings, Preferences::default(), (20.0, 20.0))
        {
            Ok(view) => view,
            Err(error) => {
                eprintln!("no se pudo abrir la ventana: {error}");
                flag.set(true);
                cx.quit();
                return;
            }
        };
        view.update(cx, |v, cx| v.ingest(&source::fixed(), cx));
        cx.spawn(async move |cx| {
            let result = capture(cx.clone(), view, path).await;
            if let Err(error) = &result {
                eprintln!("{error}");
                flag.set(true);
            }
            cx.update(|cx| cx.quit());
        })
        .detach();
    });
    if failure.get() {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

#[cfg(test)]
mod tests {
    use super::solve_alpha;

    #[test]
    fn alpha_is_recovered_from_black_and_white_composites() {
        // F = (200, 100, 50) con a = 0.5 -> negro (100, 50, 25), blanco (227.5, 177.5, 152.5)
        let black = [25u8, 50, 100, 255];
        let white = [153u8, 178, 228, 255];
        let out = solve_alpha(&black, &white);
        assert!((i32::from(out[3]) - 128).abs() <= 1);
        assert!(
            (i32::from(out[0]) - 200).abs() <= 2
                && (i32::from(out[1]) - 100).abs() <= 2
                && (i32::from(out[2]) - 50).abs() <= 2
        );
        // Transparente: el fondo se ve tal cual.
        assert_eq!(
            solve_alpha(&[0, 0, 0, 255], &[255, 255, 255, 255]),
            vec![0, 0, 0, 0]
        );
    }
}
