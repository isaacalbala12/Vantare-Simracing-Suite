//! Captura con alfa de un widget para la prueba de paridad (feature
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
use vantare_domain::Snapshot;
use vantare_domain::format::Preferences;

use crate::Kind;
use crate::app::{self, Overlay};
use crate::efficiency::col;
use crate::overlay::{Hwnd, ffi};
use crate::source;

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

fn read_dib(
    expected: i32,
    restore: impl FnOnce() -> bool,
    read: impl FnOnce() -> i32,
) -> Result<(), String> {
    if !restore() {
        return Err("SelectObject no pudo deseleccionar el bitmap".into());
    }
    let lines = read();
    if lines == expected {
        Ok(())
    } else {
        Err(format!("GetDIBits copió {lines}/{expected} filas"))
    }
}

/// Copia BGRA de la esquina superior izquierda (`w` x `h` px) de la región
/// cliente tal como la compone DWM en pantalla: el widget está en (0, 0) de una
/// ventana del tamaño del monitor.
fn capture_client(hwnd: Hwnd, w: i32, h: i32) -> Result<(u32, u32, Vec<u8>), String> {
    use gdi::{
        BitBlt, BitmapInfoHeader, CreateCompatibleBitmap, CreateCompatibleDC, GetDC, GetDIBits,
        SelectObject,
    };
    const SRCCOPY: u32 = 0x00CC_0020;
    const CAPTUREBLT: u32 = 0x4000_0000;
    let bytes = pixel_bytes(w, h)?;
    let mut pixels = Vec::new();
    pixels
        .try_reserve_exact(bytes)
        .map_err(|e| format!("reservar captura BGRA: {e}"))?;
    pixels.resize(bytes, 0);
    let mut origin = ffi::Point::default();
    // SAFETY: `hwnd` es un HWND vivo de este proceso; el puntero es de un local
    // que vive durante la llamada.
    if unsafe { ffi::ClientToScreen(hwnd, &raw mut origin) } == 0 {
        return Err("ClientToScreen no pudo localizar el área cliente".into());
    }
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
    let mut resources = GdiResources::default();
    // SAFETY: se comprueba cada handle antes de usarlo. El propietario libera
    // todos los recursos incluso en las salidas de error. `pixels` dispone de
    // w*h*4 bytes comprobados para el DIB de 32 bpp, con filas alineadas a DWORD.
    unsafe {
        resources.screen = GetDC(0);
        if resources.screen.is_null() {
            return Err("GetDC no pudo obtener el escritorio".into());
        }
        resources.memory = CreateCompatibleDC(resources.screen);
        if resources.memory.is_null() {
            return Err("CreateCompatibleDC falló".into());
        }
        resources.bitmap = CreateCompatibleBitmap(resources.screen, w, h);
        if resources.bitmap.is_null() {
            return Err("CreateCompatibleBitmap falló".into());
        }
        let previous = SelectObject(resources.memory, resources.bitmap);
        if !valid_object(previous) {
            return Err("SelectObject no pudo seleccionar el bitmap".into());
        }
        if BitBlt(
            resources.memory,
            0,
            0,
            w,
            h,
            resources.screen,
            origin.x,
            origin.y,
            SRCCOPY | CAPTUREBLT,
        ) == 0
        {
            return Err("BitBlt no pudo copiar el área cliente".into());
        }
        read_dib(
            h,
            || valid_object(SelectObject(resources.memory, previous)),
            || {
                GetDIBits(
                    resources.memory,
                    resources.bitmap,
                    0,
                    h as u32,
                    pixels.as_mut_ptr().cast(),
                    &raw mut info,
                    0,
                )
            },
        )?;
    }
    Ok((w as u32, h as u32, pixels))
}

fn pixel_bytes(w: i32, h: i32) -> Result<usize, String> {
    if w <= 0 || h <= 0 {
        return Err(format!("dimensiones de captura inválidas: {w}x{h}"));
    }
    (w as usize)
        .checked_mul(h as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .filter(|bytes| isize::try_from(*bytes).is_ok())
        .ok_or_else(|| format!("dimensiones de captura demasiado grandes: {w}x{h}"))
}

fn valid_object(object: *mut std::ffi::c_void) -> bool {
    !object.is_null() && object as isize != -1
}

#[derive(Default)]
struct GdiResources {
    screen: *mut std::ffi::c_void,
    memory: *mut std::ffi::c_void,
    bitmap: *mut std::ffi::c_void,
}

impl Drop for GdiResources {
    fn drop(&mut self) {
        // SAFETY: handles creados y poseídos exclusivamente por capture_client.
        // Se destruye el DC antes del bitmap para liberarlo incluso si falló
        // la restauración de SelectObject. Los handles nulos no se liberan.
        unsafe {
            if !self.memory.is_null() {
                gdi::DeleteDC(self.memory);
            }
            if !self.bitmap.is_null() {
                gdi::DeleteObject(self.bitmap);
            }
            if !self.screen.is_null() {
                gdi::ReleaseDC(0, self.screen);
            }
        }
    }
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
        let window = cx.update(|cx| cx.windows().first().copied());
        let hwnd = window.and_then(|w| {
            w.update(cx, |_, window, _| crate::overlay::hwnd_of(window))
                .ok()
                .flatten()
        });
        let animating = view.read_with(cx, |v, _| v.animating());
        if let (Some(hwnd), false) = (hwnd, animating) {
            return Ok(hwnd);
        }
    }
    Err("la ventana no apareció o las animaciones no terminaron en 10 s".into())
}

/// Pinta el estado sobre `level` (0 negro, 255 blanco) y captura cuando DWM ya
/// lo compuso: la marca bajo el widget debe mostrar el fondo puro (abajo y no a
/// la derecha para que quepan widgets tan anchos como el monitor).
async fn pass(
    cx: &mut AsyncApp,
    view: &Entity<Overlay>,
    hwnd: Hwnd,
    size: (i32, i32),
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
        let (w, h, mut pixels) = capture_client(hwnd, size.0, size.1 + 2)?;
        let at = (h as usize - 1) * w as usize * 4;
        if pixels[at..at + 3].iter().all(|c| c.abs_diff(level) <= 1) {
            pixels.truncate(at - w as usize * 4);
            return Ok((w, h - 2, pixels));
        }
        last = Some(pixels[at..at + 4].to_vec());
    }
    Err(format!(
        "la pasada de nivel {level} no se asentó (píxel de margen BGRA: {last:?})"
    ))
}

async fn capture(mut cx: AsyncApp, view: Entity<Overlay>, path: PathBuf) -> Result<(), String> {
    let hwnd = settled(&mut cx, &view).await?;
    let (w, h) = view.read_with(&cx, |v, _| v.wanted_size());
    let mut client = ffi::Rect::default();
    // SAFETY: HWND vivo y puntero a un Rect local válido durante la llamada.
    let valid = unsafe { ffi::GetClientRect(hwnd, &raw mut client) };
    if valid == 0
        || !w.is_finite()
        || !h.is_finite()
        || w <= 0.0
        || h <= 0.0
        || w.ceil() > (client.right - client.left) as f32
        || h.ceil() + 2.0 > (client.bottom - client.top) as f32
    {
        return Err(format!(
            "el widget ({w}x{h}) no cabe en el área cliente con su marca de captura"
        ));
    }
    let size = (w.ceil() as i32, h.ceil() as i32);
    // La referencia son píxeles físicos a 100 % de DPI (SPEC §7).
    // SAFETY: `hwnd` es el HWND vivo de la ventana; la llamada no toma punteros.
    let dpi = unsafe { gdi::GetDpiForWindow(hwnd) };
    if dpi != 96 {
        return Err(format!(
            "la captura necesita 100 % de DPI y la ventana da {dpi}"
        ));
    }
    sleep(&cx, 200).await;
    let (w, h, black) = pass(&mut cx, &view, hwnd, size, 0).await?;
    let (_, _, white) = pass(&mut cx, &view, hwnd, size, 255).await?;
    write_png(&path, w, h, &solve_alpha(&black, &white))?;
    println!("captura {} ({w}x{h} px)", path.display());
    Ok(())
}

/// Abre Standings con la escena fija de `source::fixed`, captura y sale.
pub fn run(path: PathBuf) -> ExitCode {
    run_widget(Kind::Standings, source::fixed(), path)
}

/// Captura el renderer productivo con una sola foto, sin núcleo ni feed live.
pub fn run_widget(kind: Kind, snapshot: Snapshot, path: PathBuf) -> ExitCode {
    run_sequence(kind, &[snapshot], path)
}

/// Alimenta todas las fotos en orden antes de esperar el fin de las animaciones.
pub fn run_sequence(kind: Kind, snapshots: &[Snapshot], path: PathBuf) -> ExitCode {
    if snapshots.is_empty() {
        eprintln!("la escena no contiene fotos");
        return ExitCode::FAILURE;
    }
    let snapshots = snapshots.to_vec();
    let failure = Rc::new(Cell::new(false));
    let flag = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if !app::init(cx) {
            flag.set(true);
            return;
        }
        // El widget en la esquina del monitor principal: se captura solo su rectángulo.
        let placed = [(kind, (0.0, 0.0))];
        let Some(view) = app::open_screens(cx, &placed, Preferences::default()).pop() else {
            eprintln!("no se pudo abrir la ventana");
            flag.set(true);
            cx.quit();
            return;
        };
        view.update(cx, |v, cx| {
            for snapshot in &snapshots {
                v.ingest(snapshot, cx);
            }
        });
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
    fn capture_rejects_invalid_sizes_and_window_before_gdi_copy() {
        assert_eq!(super::pixel_bytes(3, 2).expect("tamaño válido"), 24);
        for (w, h) in [(0, 2), (2, 0), (-1, 2), (2, -1), (i32::MAX, i32::MAX)] {
            assert!(super::pixel_bytes(w, h).is_err());
            assert!(super::capture_client(0, w, h).is_err());
        }
        let error = super::capture_client(0, 1, 1).expect_err("HWND nulo");
        assert!(error.contains("ClientToScreen"));
    }

    #[test]
    fn dib_restores_the_bitmap_before_reading_its_pixels() {
        let restored = std::cell::Cell::new(false);
        let read_after_restore = std::cell::Cell::new(false);
        super::read_dib(
            2,
            || {
                restored.set(true);
                true
            },
            || {
                read_after_restore.set(restored.get());
                2
            },
        )
        .expect("copia completa");
        assert!(
            read_after_restore.get(),
            "GetDIBits exige bitmap deseleccionado"
        );
    }

    #[test]
    fn dib_requires_every_row_and_skips_reading_if_restore_fails() {
        assert!(
            super::read_dib(2, || true, || 1).is_err(),
            "una fila no es una captura completa"
        );
        let read = std::cell::Cell::new(false);
        assert!(
            super::read_dib(
                2,
                || false,
                || {
                    read.set(true);
                    2
                }
            )
            .is_err()
        );
        assert!(!read.get(), "no leer un bitmap aún seleccionado");
    }

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
