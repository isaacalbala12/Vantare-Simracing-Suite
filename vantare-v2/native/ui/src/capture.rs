//! Captura con alfa de un widget para la prueba de paridad (feature
//! `parity-capture`, no entra en el binario de producto).
//!
//! GPUI en Windows no lee la textura de la ventana. Se pinta el mismo estado
//! sobre un fondo opaco negro y luego blanco, se copia el propio HWND por
//! `PrintWindow` fuera de los monitores y se resuelve el alfa: `a = 1 - (Cw - Cb)/255`,
//! `F = Cb/a`. Compárese con `parity/reference/standings-44.png` mediante
//! `parity/diff.py`.

use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::rc::Rc;
use std::time::Duration;

use gpui::{App, AppContext, AsyncApp, Entity};
use vantare_domain::Snapshot;
use vantare_domain::format::Preferences;

use crate::Kind;
use crate::app::{self, Overlay};
use crate::efficiency::col;
use crate::overlay::{Hwnd, ffi};
use crate::source;

pub(crate) const MARGIN: i32 = 66;

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
        pub fn PrintWindow(hwnd: Hwnd, dc: *mut c_void, flags: u32) -> i32;
    }
    #[link(name = "gdi32")]
    unsafe extern "system" {
        pub fn CreateCompatibleDC(dc: *mut c_void) -> *mut c_void;
        pub fn CreateCompatibleBitmap(dc: *mut c_void, w: i32, h: i32) -> *mut c_void;
        pub fn SelectObject(dc: *mut c_void, object: *mut c_void) -> *mut c_void;
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

/// Copia BGRA del HWND, recortando su área cliente. Nunca lee el escritorio.
pub fn capture_client(hwnd: Hwnd, w: i32, h: i32) -> Result<(u32, u32, Vec<u8>), String> {
    use gdi::{
        BitmapInfoHeader, CreateCompatibleBitmap, CreateCompatibleDC, GetDC, GetDIBits,
        PrintWindow, SelectObject,
    };
    let bytes = pixel_bytes(w, h)?;
    let mut pixels = Vec::new();
    pixels
        .try_reserve_exact(bytes)
        .map_err(|e| format!("reservar captura BGRA: {e}"))?;
    pixels.resize(bytes, 0);
    crate::capture_window::verify(hwnd)?;
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
        resources.screen = GetDC(hwnd);
        resources.hwnd = hwnd;
        if resources.screen.is_null() {
            return Err("GetDC no pudo obtener el HWND".into());
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
        if PrintWindow(hwnd, resources.memory, 3) == 0 {
            return Err("PrintWindow no pudo copiar el HWND".into());
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
    hwnd: Hwnd,
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
                gdi::ReleaseDC(self.hwnd, self.screen);
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

pub fn write_png(path: &Path, width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
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
        let (w, h, mut pixels) = capture_client(hwnd, size.0, size.1 + MARGIN)?;
        let at = (h as usize - 1) * w as usize * 4;
        if pixels[at..at + 3].iter().all(|c| c.abs_diff(level) <= 1) {
            pixels.truncate(size.1 as usize * w as usize * 4);
            return Ok((w, size.1 as u32, pixels));
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
        || h.ceil() + MARGIN as f32 > (client.bottom - client.top) as f32
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
    let settings = default_settings(kind);
    run_configured_sequence(settings, Preferences::default(), snapshots, path)
}

/// Captura exactamente los ajustes y el idioma del layout, para cualquier Look.
pub fn run_configured_sequence(
    settings: crate::Settings,
    prefs: Preferences,
    snapshots: &[Snapshot],
    path: PathBuf,
) -> ExitCode {
    if snapshots.is_empty() {
        eprintln!("la escena no contiene fotos");
        return ExitCode::FAILURE;
    }
    let request = crate::capture_batch::Request {
        scene: "in-memory".into(),
        output: path,
        appearance: None,
        size: None,
        collapsed: false,
        zoom: None,
        widget: Some(settings.kind().name().into()),
        settings: Some(settings.clone()),
        until: None,
        parameters: std::collections::BTreeMap::new(),
    };
    let encoded = match snapshots
        .iter()
        .map(vantare_ipc::snapshot_to_json)
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(frames) => frames.join("\n"),
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::FAILURE;
        }
    };
    let result = (|| {
        let common = crate::capture_batch::inputs_hash(&[])?;
        let cache = crate::capture_batch::Cache::new(
            request.output.clone(),
            &[
                serde_json::to_vec(&request).map_err(|e| e.to_string())?,
                encoded.into_bytes(),
                format!("{prefs:?}").into_bytes(),
            ]
            .concat(),
            &common,
        )?;
        if cache.fresh() {
            println!("capture-skip {}", request.output.display());
            return Ok(());
        }
        run_jobs(vec![Job {
            settings,
            prefs,
            snapshots: snapshots.to_vec(),
            request,
            cache,
        }])
    })();
    exit(result)
}

struct Job {
    settings: crate::Settings,
    prefs: Preferences,
    snapshots: Vec<Snapshot>,
    request: crate::capture_batch::Request,
    cache: crate::capture_batch::Cache,
}

fn exit(result: Result<(), String>) -> ExitCode {
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("captura: {error}");
            ExitCode::FAILURE
        }
    }
}

/// Una sola aplicación y un solo HWND para todas las entradas del manifiesto.
pub fn run_batch(path: &Path) -> ExitCode {
    let started = std::time::Instant::now();
    exit((|| {
        let requests = crate::capture_batch::read(path)?;
        let total = requests.len();
        let common = crate::capture_batch::inputs_hash(&[])?;
        let mut jobs = Vec::new();
        for request in requests {
            if request.appearance.is_some() || request.collapsed || request.zoom.is_some() {
                return Err(
                    "Workshop usa settings para su apariencia; collapsed/zoom son del Hub".into(),
                );
            }
            let prefs = batch_preferences(&request.parameters)?;
            let kind: Kind = request
                .widget
                .as_deref()
                .ok_or("falta widget")?
                .parse()
                .map_err(|()| "widget desconocido".to_owned())?;
            let settings = request
                .settings
                .clone()
                .unwrap_or_else(|| default_settings(kind));
            if settings.kind() != kind {
                return Err("settings no corresponde al widget".into());
            }
            let bytes = std::fs::read(&request.scene).map_err(|e| e.to_string())?;
            let cache = crate::capture_batch::Cache::new(
                request.output.clone(),
                &[
                    serde_json::to_vec(&request).map_err(|e| e.to_string())?,
                    bytes.clone(),
                ]
                .concat(),
                &common,
            )?;
            if cache.fresh() {
                println!("capture-skip {}", request.output.display());
                continue;
            }
            let scene = String::from_utf8(bytes).map_err(|e| e.to_string())?;
            let mut snapshots = crate::workshop::snapshots_from_json(&scene)?;
            if let Some(until) = request.until {
                if until == 0 || until > snapshots.len() {
                    return Err("until fuera de la secuencia".into());
                }
                snapshots.truncate(until);
            }
            jobs.push(Job {
                settings,
                prefs,
                snapshots,
                request,
                cache,
            });
        }
        let captured = jobs.len();
        run_jobs(jobs)?;
        println!(
            "capture-batch total={total} captured={captured} skipped={} app_processes=1 windows={} elapsed_ms={}",
            total - captured,
            usize::from(captured > 0),
            started.elapsed().as_millis()
        );
        Ok(())
    })())
}

fn batch_preferences(
    parameters: &std::collections::BTreeMap<String, String>,
) -> Result<Preferences, String> {
    if parameters.keys().any(|key| key != "language") {
        return Err("Workshop solo admite parameters.language (es/en)".into());
    }
    let language = match parameters.get("language").map(String::as_str) {
        None | Some("es") => vantare_domain::format::Language::Es,
        Some("en") => vantare_domain::format::Language::En,
        Some(_) => return Err("idioma de captura desconocido; usa es/en".into()),
    };
    Ok(Preferences {
        language,
        ..Preferences::default()
    })
}

fn default_settings(kind: Kind) -> crate::Settings {
    match kind {
        Kind::Standings => crate::Settings::Standings(crate::standings::Settings::eficiencia()),
        Kind::Relative => crate::Settings::Relative(crate::relative::Settings::eficiencia()),
        Kind::FuelStrategy => {
            crate::Settings::FuelStrategy(crate::fuel_strategy::Settings::eficiencia())
        }
        Kind::Delta => crate::Settings::Delta(crate::delta::Settings::eficiencia()),
        Kind::Pedals => crate::Settings::Pedals(crate::pedals::Settings::eficiencia()),
        _ => crate::Settings::default_for(kind),
    }
}

struct CaptureRoot {
    view: Entity<Overlay>,
}
impl gpui::Render for CaptureRoot {
    fn render(
        &mut self,
        _: &mut gpui::Window,
        cx: &mut gpui::Context<Self>,
    ) -> impl gpui::IntoElement {
        use gpui::{div, prelude::*, px};
        let (w, h) = self.view.read(cx).frame_size();
        div().size_full().child(
            div()
                .absolute()
                .left(px(0.0))
                .top(px(0.0))
                .w(px(w))
                .h(px(h))
                .child(
                    self.view
                        .clone()
                        .cached(gpui::StyleRefinement::default().w(px(w)).h(px(h))),
                ),
        )
    }
}

fn run_jobs(jobs: Vec<Job>) -> Result<(), String> {
    if jobs.is_empty() {
        return Ok(());
    }
    let _lock = crate::capture_window::lock()?;
    let mut options = crate::capture_window::options(2304, 1440)?;
    options.window_background = gpui::WindowBackgroundAppearance::Transparent;
    let failure = Rc::new(std::cell::RefCell::new(None));
    let flag = failure.clone();
    gpui_platform::application().run(move |cx: &mut App| {
        if !app::init(cx) {
            *flag.borrow_mut() = Some("inicializar UI".into());
            cx.quit();
            return;
        }
        // Mantener la guarda de paridad de #1629 antes de crear el HWND:
        // no aceptar silenciosamente una sustitución de las fuentes aprobadas.
        let names = cx.text_system().all_font_names();
        let style = crate::vantare::style::Style::compiled();
        let families = [
            style.fonts.display_family.as_str(),
            style.fonts.mono_family.as_str(),
            "Inter W400",
            "Inter W500",
            "Inter W600",
            "Inter W650",
            "Inter W700",
            "Inter W750",
            "Inter W800",
        ];
        if !families
            .iter()
            .all(|name| names.iter().any(|registered| registered.as_str() == *name))
        {
            *flag.borrow_mut() =
                Some("faltan fuentes del diseño; se rechaza la captura con sustitución".into());
            cx.quit();
            return;
        }
        let view = cx.new(|_| Overlay::new(jobs[0].settings.kind(), jobs[0].prefs));
        let window = match cx.open_window(options, |_, cx| {
            cx.new(|_| CaptureRoot { view: view.clone() })
        }) {
            Ok(window) => window,
            Err(error) => {
                *flag.borrow_mut() = Some(error.to_string());
                cx.quit();
                return;
            }
        };
        if let Err(error) = window
            .update(cx, |_, window, _| crate::capture_window::created(window))
            .map_err(|e| e.to_string())
            .and_then(|result| result)
        {
            *flag.borrow_mut() = Some(error);
            cx.quit();
            return;
        }
        cx.spawn(async move |cx| {
            let result = async {
                for job in jobs {
                    view.update(cx, |v, cx| {
                        *v = Overlay::configured(&job.settings, job.prefs);
                        for snapshot in &job.snapshots {
                            v.ingest(snapshot, cx);
                        }
                        v.freeze_for_capture();
                        cx.notify();
                    });
                    let [width, height] = job.request.size.unwrap_or([2304, 1440]);
                    window
                        .update(cx, |_, window, cx| {
                            crate::capture_window::show(window, width as i32, height as i32, cx)
                        })
                        .map_err(|e| e.to_string())??;
                    capture(cx.clone(), view.clone(), job.request.output).await?;
                    job.cache.commit()?;
                }
                Ok::<(), String>(())
            }
            .await;
            if let Err(error) = result {
                *flag.borrow_mut() = Some(error);
            }
            cx.update(|cx| cx.quit());
        })
        .detach();
    });
    let result = failure.borrow_mut().take();
    result.map_or(Ok(()), Err)
}

#[cfg(test)]
mod tests {
    use super::solve_alpha;

    #[test]
    fn batch_language_is_explicit_and_rejects_unknown_parameters_before_opening() {
        use std::collections::BTreeMap;
        use vantare_domain::format::Language;
        assert_eq!(
            super::batch_preferences(&BTreeMap::new())
                .expect("default")
                .language,
            Language::Es
        );
        for (value, expected) in [("es", Language::Es), ("en", Language::En)] {
            let parameters = BTreeMap::from([("language".into(), value.into())]);
            assert_eq!(
                super::batch_preferences(&parameters)
                    .expect("idioma")
                    .language,
                expected
            );
        }
        for parameters in [
            BTreeMap::from([("language".into(), "fr".into())]),
            BTreeMap::from([("unknown".into(), "en".into())]),
        ] {
            assert!(super::batch_preferences(&parameters).is_err());
        }
    }

    #[test]
    fn capture_rejects_invalid_sizes_and_window_before_gdi_copy() {
        assert_eq!(super::pixel_bytes(3, 2).expect("tamaño válido"), 24);
        for (w, h) in [(0, 2), (2, 0), (-1, 2), (2, -1), (i32::MAX, i32::MAX)] {
            assert!(super::pixel_bytes(w, h).is_err());
            assert!(super::capture_client(0, w, h).is_err());
        }
        assert!(super::capture_client(0, 1, 1).is_err());
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
