//! Deterministic offscreen capture. CPU preparation and explicit data update precede GPU creation.
use crate::widget::{Update, Widget};
use rune::{
    Env, Runtime,
    render::{Gpu, OFFSCREEN_FORMAT, Offscreen, Renderer},
};
use std::{
    ffi::OsString,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, mpsc},
    time::{Duration, Instant},
};
use vantare_domain::{Snapshot, widget_settings::Kind};
use vantare_ipc::layout::Layout;

// Stable CLI tokens/codes shared with the Hub; details are never parsed.
#[derive(Debug)]
pub struct Failure {
    pub code: u8,
    token: &'static str,
    detail: String,
}
impl Failure {
    fn new(code: u8, token: &'static str, detail: impl std::fmt::Display) -> Self {
        Self {
            code,
            token,
            detail: detail.to_string(),
        }
    }
    fn input(detail: impl std::fmt::Display) -> Self {
        Self::new(2, "INVALID_INPUT", detail)
    }
    fn capture(detail: impl std::fmt::Display) -> Self {
        Self::new(5, "CAPTURE_FAILED", detail)
    }
}
impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.token, self.detail)
    }
}
impl std::error::Error for Failure {}
const MAX_MS: u64 = 60_000;
const MAX_PHOTOS: usize = 256;
const MAX_TOTAL: u64 = 64 * 1024 * 1024;
/// Fixed 2026-01-01T00:00:00Z, never the machine's wall clock.
const WALL_MS: u64 = 1_767_225_600_000;
struct Request {
    layout: Option<PathBuf>,
    widget: Option<Kind>,
    settings: Option<PathBuf>,
    instance: Option<String>,
    snapshot: Option<PathBuf>,
    sequence: Option<PathBuf>,
    output: PathBuf,
    scale: f32,
    at: Option<u64>,
    wall: u64,
    reduced: bool,
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
impl Request {
    fn parse(args: &[OsString]) -> Result<Self, Failure> {
        let mut values = std::collections::BTreeMap::new();
        if !args.len().is_multiple_of(2) {
            return Err(Failure::input("falta un valor"));
        }
        for pair in args.as_chunks::<2>().0 {
            let key = pair[0]
                .to_str()
                .ok_or_else(|| Failure::input("flag no UTF-8"))?;
            if ![
                "--layout",
                "--widget",
                "--settings",
                "--instance",
                "--snapshot",
                "--sequence",
                "--output",
                "--scale",
                "--at-ms",
                "--wall-ms",
                "--motion",
            ]
            .contains(&key)
                || pair[1].is_empty()
                || values.insert(key, &pair[1]).is_some()
            {
                return Err(Failure::input("flag desconocido, vacio o repetido"));
            }
        }
        let string = |key| -> Result<Option<&str>, Failure> {
            values
                .get(key)
                .map(|v| v.to_str().ok_or_else(|| Failure::input("valor no UTF-8")))
                .transpose()
        };
        let number = |key| -> Result<Option<u64>, Failure> {
            string(key)?
                .map(|s| s.parse().map_err(Failure::input))
                .transpose()
        };
        let path = |key| values.get(key).map(PathBuf::from);
        let layout = path("--layout");
        let widget = string("--widget")?
            .map(|s| {
                s.parse::<Kind>()
                    .map_err(|()| Failure::input("widget desconocido"))
            })
            .transpose()?;
        let settings = path("--settings");
        if (layout.is_some() && (widget.is_some() || settings.is_some()))
            || (layout.is_none() && (widget.is_none() || settings.is_none()))
            || (values.contains_key("--snapshot") && values.contains_key("--sequence"))
            || (widget.is_some() && values.contains_key("--instance"))
        {
            return Err(Failure::input("origenes incompatibles o incompletos"));
        }
        let scale = string("--scale")?
            .unwrap_or("1")
            .parse::<f32>()
            .map_err(Failure::input)?;
        if ![1.0, 1.25, 1.5].contains(&scale) {
            return Err(Failure::input("escala: 1/1.25/1.5"));
        }
        let at = number("--at-ms")?;
        let wall = number("--wall-ms")?.unwrap_or(WALL_MS);
        if at.is_some_and(|at| at > MAX_MS) || wall.checked_add(MAX_MS).is_none() {
            return Err(Failure::input("reloj fuera de cota"));
        }
        let reduced = match string("--motion")?.unwrap_or("false") {
            "false" => true,
            "true" => false,
            _ => return Err(Failure::input("motion: true/false")),
        };
        let output = path("--output").ok_or_else(|| Failure::input("falta --output"))?;
        if output.extension().is_none_or(|v| v != "png") {
            return Err(Failure::input("salida .png requerida"));
        }
        Ok(Self {
            layout,
            widget,
            settings,
            instance: string("--instance")?.map(str::to_owned),
            snapshot: path("--snapshot"),
            sequence: path("--sequence"),
            output,
            scale,
            at,
            wall,
            reduced,
        })
    }
    fn design(&self) -> Result<Layout, Failure> {
        if let Some(path) = &self.layout {
            return Layout::from_json(
                &read(path, vantare_ipc::layout::MAX_BYTES).map_err(Failure::input)?,
            )
            .map_err(Failure::input);
        }
        let kind = self.widget.ok_or_else(|| Failure::input("falta widget"))?;
        let path = self
            .settings
            .as_ref()
            .ok_or_else(|| Failure::input("faltan ajustes"))?;
        let settings =
            String::from_utf8(read(path, vantare_ipc::layout::MAX_BYTES).map_err(Failure::input)?)
                .map_err(Failure::input)?;
        let wrap = |settings: &str| {
            format!(
                r#"{{"version":1,"instances":[{{"id":"capture","x":0,"y":0,"settings":{settings}}}]}}"#
            )
        };
        // Full tagged Settings or the payload of --widget: both use the IPC reader.
        if let Ok(layout) = Layout::from_json(wrap(&settings).as_bytes()) {
            if layout.instances[0].settings.kind() != kind {
                return Err(Failure::input("widget/ajustes distintos"));
            }
            return Ok(layout);
        }
        let body = settings
            .trim()
            .strip_prefix('{')
            .and_then(|s| s.strip_suffix('}'))
            .ok_or_else(|| Failure::input("ajustes deben ser objeto JSON"))?;
        let tagged = format!(
            r#"{{"kind":"{}"{}{body}}}"#,
            kind.name(),
            if body.trim().is_empty() { "" } else { "," }
        );
        Layout::from_json(wrap(&tagged).as_bytes()).map_err(Failure::input)
    }
    fn photos(&self) -> Result<Vec<(u64, Snapshot)>, Failure> {
        let inputs = if let Some(path) = &self.snapshot {
            vec![(0, path.clone())]
        } else if let Some(path) = &self.sequence {
            let text = String::from_utf8(
                read(path, vantare_ipc::layout::MAX_BYTES).map_err(Failure::input)?,
            )
            .map_err(Failure::input)?;
            sequence(&text, path.parent().unwrap_or_else(|| Path::new(".")))?
        } else {
            return Err(Failure::new(
                3,
                "NO_DEMO",
                "sin demo canonica registrada; proporciona una foto",
            ));
        };
        let mut total = 0;
        inputs
            .into_iter()
            .map(|(at, path)| {
                let bytes = read(&path, (8 * 1024 * 1024).min(MAX_TOTAL - total))
                    .map_err(Failure::input)?;
                total += bytes.len() as u64;
                let text = String::from_utf8(bytes).map_err(Failure::input)?;
                let snapshot =
                    vantare_ipc::snapshot_from_saved_json(&text).map_err(Failure::input)?;
                Ok((at, snapshot))
            })
            .collect()
    }
}
fn sequence(text: &str, root: &Path) -> Result<Vec<(u64, PathBuf)>, Failure> {
    let mut entries = Vec::new();
    for line in text.lines() {
        let (at, path) = line
            .split_once('\t')
            .ok_or_else(|| Failure::input("fila TSV invalida"))?;
        let at = at.parse::<u64>().map_err(Failure::input)?;
        if at > MAX_MS
            || entries.last().is_some_and(|(previous, _)| *previous > at)
            || path.is_empty()
            || path.contains('\t')
            || entries.len() == MAX_PHOTOS
        {
            return Err(Failure::input("secuencia fuera de cota u orden"));
        }
        entries.push((at, root.join(path)));
    }
    if entries.is_empty() {
        return Err(Failure::input("secuencia vacia"));
    }
    Ok(entries)
}
fn read(path: &Path, max: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(max + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max {
        return Err(invalid("entrada demasiado grande"));
    }
    Ok(bytes)
}
fn dimensions(size: vantare_domain::geometry::Size, scale: f32) -> Result<(u32, u32), Failure> {
    let (w, h) = ((size.width * scale).round(), (size.height * scale).round());
    if ![1.0, 1.25, 1.5].contains(&scale)
        || ![w, h]
            .into_iter()
            .all(|n| n.is_finite() && (1.0..=4096.0).contains(&n))
    {
        return Err(Failure::input("imagen fuera de cota 4096 x 4096"));
    }
    let (w, h) = (w as u32, h as u32);
    if w.checked_mul(h)
        .and_then(|n| n.checked_mul(4))
        .is_none_or(|n| u64::from(n) > MAX_TOTAL)
    {
        return Err(Failure::input("RGBA fuera de cota"));
    }
    Ok((w, h))
}
enum AssetEvent {
    Published,
    Stopped,
}
struct WorkerExit(mpsc::Sender<AssetEvent>);
impl Drop for WorkerExit {
    fn drop(&mut self) {
        let _ = self.0.send(AssetEvent::Stopped);
    }
}
// One cache, one wait budget and no extra threads. Rune owns its decoders.
struct Assets {
    cache: Option<Arc<rune::ImageCache>>,
    events: mpsc::Receiver<AssetEvent>,
    deadline: Instant,
    stopped: bool,
}
impl Assets {
    fn new() -> Self {
        let (tx, events) = mpsc::channel();
        let exit = WorkerExit(tx.clone());
        let wake = Arc::new(move || {
            let _keep_until_last_worker = &exit;
            let _ = tx.send(AssetEvent::Published);
        });
        Self {
            cache: Some(Arc::new(rune::ImageCache::new(wake))),
            events,
            deadline: Instant::now() + Duration::from_secs(10),
            stopped: false,
        }
    }
    fn receive(&self) -> Result<AssetEvent, Failure> {
        self.events
            .recv_timeout(self.deadline.saturating_duration_since(Instant::now()))
            .map_err(|e| Failure::capture(format!("assets/cierre: {e}")))
    }
    fn wait(&self, images: &[rune::Image]) -> Result<(), Failure> {
        loop {
            let mut published = true;
            for image in images {
                if let Some(error) = image.error() {
                    return Err(Failure::capture(error));
                }
                // decoded/is_ready precedes Pixels publication inside Image::finish.
                published &= image
                    .size()
                    .is_some_and(|[w, h]| image.pixels().size() == (w, h));
            }
            if published {
                return Ok(());
            }
            if matches!(self.receive()?, AssetEvent::Stopped) {
                return Err(Failure::capture(
                    "cache cerrada antes de publicar sus imagenes",
                ));
            }
        }
    }
    fn shutdown(&mut self) -> Result<(), Failure> {
        if self.stopped {
            return Ok(());
        }
        self.stopped = true;
        drop(self.cache.take());
        loop {
            if matches!(self.receive()?, AssetEvent::Stopped) {
                return Ok(());
            }
        }
    }
}
impl Drop for Assets {
    fn drop(&mut self) {
        // Error unwinding still closes the cache; normal success checks shutdown explicitly.
        if let Err(error) = self.shutdown() {
            eprintln!("{error}");
        }
    }
}
struct Capture {
    runtime: Runtime<Box<dyn Widget>>,
    width: u32,
    height: u32,
    update: Update,
    images: Vec<rune::Image>,
    // Declared last: runtime/widget/cache clones and image handles drop first.
    assets: Assets,
}
fn poll(widget: &mut Box<dyn Widget>, clock: f64, tx: &mut rune::Tx) -> bool {
    let update = widget.animate(clock);
    widget.schedule(clock, tx);
    update.build || update.pixels
}
impl Capture {
    fn finish(self) -> Result<(), Failure> {
        let Self {
            runtime,
            images,
            mut assets,
            ..
        } = self;
        drop(runtime);
        drop(images);
        assets.shutdown()
    }
    fn advance(&mut self, clock: &mut f64, at: f64, steps: &mut usize) -> Result<(), Failure> {
        while *clock < at {
            *steps += 1;
            if *steps > 10_000 {
                return Err(Failure::input("replay supera 10000 pasos"));
            }
            let next = self
                .runtime
                .wake_deadline()
                .map_or(at, |due| due.max(*clock + 1.0 / 60.0).min(at));
            self.runtime.frame(next - *clock);
            *clock = next;
        }
        Ok(())
    }
}
fn selected<'a>(
    layout: &'a Layout,
    id: Option<&str>,
) -> Result<&'a vantare_ipc::layout::Instance, Failure> {
    Ok(match id {
        Some(id) => layout
            .instances
            .iter()
            .find(|i| i.id == id)
            .ok_or_else(|| Failure::input("instancia desconocida"))?,
        None => match layout.instances.as_slice() {
            [instance] => instance,
            _ => return Err(Failure::input("elige una instancia")),
        },
    })
}
fn prepare(
    layout: &Layout,
    photos: &[(u64, Snapshot)],
    scale: f32,
    reduced: bool,
    wall: u64,
    at: Option<u64>,
    id: Option<&str>,
) -> Result<Capture, Failure> {
    let instance = selected(layout, id)?;
    let new = crate::renderer::constructor(&instance.settings)
        .ok_or_else(|| Failure::input("widget no disponible"))?;
    let Some((last, _)) = photos.last() else {
        return Err(Failure::input("fotos vacias"));
    };
    let at = at.unwrap_or(*last);
    if at > MAX_MS
        || at < *last
        || photos.len() > MAX_PHOTOS
        || wall.checked_add(at).is_none()
        || photos.windows(2).any(|p| p[0].0 > p[1].0)
    {
        return Err(Failure::input("tiempo/fotos fuera de cota"));
    }
    let hz = layout
        .performance
        .hz(&instance.id, instance.settings.kind());
    let text = rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter"));
    let _families = rune::text::with_families("Inter", "Inter");
    let assets = Assets::new();
    let mut widget = new(&instance.settings, layout.preferences, reduced, hz, 0.0)
        .ok_or_else(|| Failure::input("ajustes incompatibles"))?;
    if let Some(cache) = &assets.cache {
        widget.attach_assets(cache);
    }
    widget.set_wall_base(wall);
    widget.policy(reduced, hz, 0.0);
    let size = widget.size_for(Some(&photos[0].1));
    let (width, height) = dimensions(size, scale)?;
    let mut runtime = Runtime::with_text(
        widget,
        |widget, _| widget.view(),
        (size.width, size.height),
        Env::new(true, scale),
        text,
    );
    runtime.transparent = true;
    runtime.reduced_motion = reduced;
    runtime.poll = Some(poll);
    let mut capture = Capture {
        runtime,
        width,
        height,
        update: Update::default(),
        images: Vec::new(),
        assets,
    };
    let (mut clock, mut steps) = (0.0, 0);
    for (ms, snapshot) in photos {
        capture.advance(&mut clock, *ms as f64 / 1000.0, &mut steps)?;
        let size = capture.runtime.state.size_for(Some(snapshot));
        (capture.width, capture.height) = dimensions(size, scale)?;
        capture
            .runtime
            .set_viewport((size.width, size.height), scale);
        // Explicit injection, no feed, rights, sequence filter or cadence gate.
        let update = capture.runtime.state.update(snapshot, clock);
        capture.update.build |= update.build;
        capture.update.pixels |= update.pixels;
        capture.images = capture.runtime.state.capture_images();
        capture.assets.wait(&capture.images)?;
        capture.runtime.invalidate();
        capture.runtime.frame(0.0);
    }
    capture.advance(&mut clock, at as f64 / 1000.0, &mut steps)?;
    capture.images = capture.runtime.state.capture_images();
    capture.assets.wait(&capture.images)?;
    capture.runtime.invalidate();
    capture.runtime.frame(0.0);
    Ok(capture)
}
fn validate_pixels(pixels: &[u8], width: u32, height: u32) -> io::Result<()> {
    if pixels.len() != width as usize * height as usize * 4 || pixels.is_empty() {
        return Err(invalid("longitud RGBA invalida"));
    }
    Ok(())
}
fn render(capture: &mut Capture) -> Result<Vec<u8>, Failure> {
    for image in &capture.images {
        if let Some(error) = image.error() {
            return Err(Failure::capture(error));
        }
    }
    let gpu =
        Gpu::try_new(Gpu::instance(), None).map_err(|e| Failure::new(4, "GPU_UNAVAILABLE", e))?;
    let srgb = capture.runtime.srgb_blend();
    let format = if srgb {
        OFFSCREEN_FORMAT.remove_srgb_suffix()
    } else {
        OFFSCREEN_FORMAT
    };
    let mut renderer = Renderer::new(&gpu.device, format);
    renderer.set_srgb_blend(srgb);
    let runtime = &mut capture.runtime;
    renderer.attach_text(&mut runtime.text.atlas);
    let size = (capture.width, capture.height);
    let target = Offscreen::with_format(&gpu.device, size.0, size.1, format);
    renderer.upload_images(&gpu.device, &gpu.queue, &mut runtime.images);
    renderer.prepare_surfaces(&gpu.device, &gpu.queue, &runtime.surfaces, size);
    renderer.prepare(
        &gpu.device,
        &gpu.queue,
        &mut runtime.text.atlas,
        &runtime.instances,
        size,
    );
    let mut encoder = gpu.device.create_command_encoder(&Default::default());
    renderer.draw(&mut encoder, &target.view, [0.0; 4]);
    target.copy(&mut encoder);
    renderer.submit(&gpu.queue, encoder);
    let mut pixels = target.read(&gpu.device);
    // Rune blends premultiplied color; PNG carries straight alpha in sRGB.
    for pixel in pixels.as_chunks_mut::<4>().0 {
        let alpha = f32::from(pixel[3]) / 255.0;
        for channel in &mut pixel[..3] {
            let encoded = f32::from(*channel) / 255.0;
            let value = if alpha == 0.0 {
                0.0
            } else if srgb {
                encoded / alpha
            } else {
                let linear = if encoded <= 0.04045 {
                    encoded / 12.92
                } else {
                    ((encoded + 0.055) / 1.055).powf(2.4)
                };
                let straight = (linear / alpha).clamp(0.0, 1.0);
                if straight <= 0.0031308 {
                    straight * 12.92
                } else {
                    1.055 * straight.powf(1.0 / 2.4) - 0.055
                }
            };
            *channel = (value.clamp(0.0, 1.0) * 255.0).round() as u8;
        }
    }
    validate_pixels(&pixels, size.0, size.1).map_err(Failure::capture)?;
    Ok(pixels)
}
/// Called after the machine graphics guard in debug and release; never opens a window.
pub fn run(args: &[OsString]) -> Result<(), Failure> {
    std::panic::catch_unwind(|| execute(args))
        .unwrap_or_else(|_| Err(Failure::capture("panico en captura")))
}
fn execute(args: &[OsString]) -> Result<(), Failure> {
    let request = Request::parse(args)?;
    let layout = request.design()?;
    let id = request
        .instance
        .as_deref()
        .or(request.widget.map(|_| "capture"));
    let instance = selected(&layout, id)?;
    if crate::renderer::constructor(&instance.settings).is_none() {
        return Err(Failure::input("widget no disponible"));
    }
    let photos = request.photos()?;
    let mut capture = prepare(
        &layout,
        &photos,
        request.scale,
        request.reduced,
        request.wall,
        request.at,
        id,
    )?;
    // Complete validation precedes even the fast existing-file check.
    if request.output.try_exists().map_err(Failure::capture)? {
        return Err(Failure::capture("conservar evidencia anterior"));
    }
    let size = (capture.width, capture.height);
    let pixels = render(&mut capture);
    let cleanup = capture.finish();
    cleanup?;
    publish_png(&request.output, size, &pixels?)
}
struct TempPng {
    dir: PathBuf,
}
impl TempPng {
    fn new(parent: &Path) -> io::Result<Self> {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        for _ in 0..32 {
            let id = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let dir = parent.join(format!(".vantare-capture-{}-{id}", std::process::id()));
            match std::fs::create_dir(&dir) {
                Ok(()) => return Ok(Self { dir }),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(e),
            }
        }
        Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "temporales ocupados",
        ))
    }
    fn remove(&self) -> io::Result<()> {
        match std::fs::remove_file(self.dir.join("image.png")) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => return Err(e),
        }
        match std::fs::remove_dir(&self.dir) {
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            result => result,
        }
    }
}
impl Drop for TempPng {
    fn drop(&mut self) {
        let _ = self.remove();
    }
}
fn publish_png(output: &Path, size: (u32, u32), pixels: &[u8]) -> Result<(), Failure> {
    validate_pixels(pixels, size.0, size.1).map_err(Failure::capture)?;
    let temp = TempPng::new(output.parent().unwrap_or_else(|| Path::new(".")))
        .map_err(Failure::capture)?;
    let result = (|| {
        // Rune's writer only accepts a path and truncates it. Encode privately, then
        // publish through our exclusive handle; no new encoder or dependency.
        let path = temp.dir.join("image.png");
        rune::render::write_png(&path, size.0, size.1, pixels).map_err(Failure::capture)?;
        let png = read(&path, MAX_TOTAL + 1024 * 1024).map_err(Failure::capture)?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(output)
            .map_err(Failure::capture)?;
        file.write_all(&png).map_err(Failure::capture)
    })();
    let cleanup = temp.remove().map_err(Failure::capture);
    result.and(cleanup)
}

#[cfg(test)]
mod tests {
    use super::*;
    const PHOTO: &str = include_str!("../../ui/fixtures/relative.snapshot.json");
    fn single(layout: &Layout, snapshot: &Snapshot, scale: f32) -> Result<Capture, Failure> {
        prepare(
            layout,
            &[(0, snapshot.clone())],
            scale,
            true,
            WALL_MS,
            None,
            None,
        )
    }
    fn layout() -> Layout {
        Layout::from_json(br#"{"version":1,"instances":[{"id":"variant","x":0,"y":0,"settings":{"kind":"relative","rangeAhead":1,"rangeBehind":2}}]}"#).expect("asymmetric scene layout")
    }
    #[test]
    fn real_photo_reaches_rows_and_text_and_changes_the_actual_cpu_paint_stream() {
        let mut snapshot = vantare_ipc::snapshot_from_saved_json(PHOTO).expect("GPUI photo");
        for scale in [1.0, 1.25, 1.5] {
            let first = single(&layout(), &snapshot, scale).expect("CPU preparation");
            assert!(first.update.build || first.update.pixels);
            assert!(first.runtime.find("relative-view").is_some());
            let elements = first.runtime.elements();
            assert!(
                elements
                    .iter()
                    .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("car-")))
            );
            assert!(elements.iter().any(|e| {
                e.text
                    .as_deref()
                    .is_some_and(|t| t.contains("Antonio Giovinazzi"))
            }));
            assert!(!first.runtime.instances.is_empty());
            let original = snapshot
                .state
                .cars
                .iter()
                .map(|c| c.driver.name.clone())
                .collect::<Vec<_>>();
            for car in &mut snapshot.state.cars {
                car.driver.name = "CAPTURE DATA 98765".into();
            }
            let second = single(&layout(), &snapshot, scale).expect("updated photo");
            assert!(
                second
                    .runtime
                    .elements()
                    .iter()
                    .any(|e| e.text.as_deref().is_some_and(|t| t.contains("98765")))
            );
            assert!(
                first.runtime.instances.len() != second.runtime.instances.len()
                    || first
                        .runtime
                        .instances
                        .iter()
                        .zip(&second.runtime.instances)
                        .any(|(a, b)| a.uv != b.uv || a.rect != b.rect)
            );
            for (car, number) in snapshot.state.cars.iter_mut().zip(original) {
                car.driver.name = number;
            }
        }
    }
    #[test]
    fn paused_photo_reserves_the_process_pause_band_before_the_first_frame() {
        let live = vantare_ipc::snapshot_from_saved_json(PHOTO).expect("GPUI photo");
        let mut paused = live.clone();
        paused.state.source_state = vantare_domain::SourceState::Paused;
        for scale in [1.0, 1.25, 1.5] {
            let live = single(&layout(), &live, scale).expect("live CPU preparation");
            let capture = single(&layout(), &paused, scale).expect("paused CPU preparation");
            let size = capture.runtime.state.size_for(Some(&paused));
            assert_eq!(capture.width, live.width);
            assert_eq!(capture.height, (size.height * scale).round() as u32);
            assert!(capture.height > live.height);
            let band = capture
                .runtime
                .presented("pause-band")
                .expect("pause band")
                .0;
            assert_eq!(band[3], 22.0);
            assert!(band[1] + band[3] <= capture.height as f32 / scale + 0.5);
            assert!(
                capture
                    .runtime
                    .elements()
                    .iter()
                    .any(|e| e.text.as_deref() == Some("EN PAUSA"))
            );
        }
    }
    #[test]
    fn malformed_arguments_and_unsupported_widgets_fail_before_gpu() {
        for args in [
            vec![],
            vec!["--layout"],
            vec!["--scale", "NaN"],
            vec!["--unknown", "x"],
        ] {
            assert!(
                Request::parse(&args.into_iter().map(OsString::from).collect::<Vec<_>>()).is_err()
            );
        }
        let snapshot = vantare_ipc::snapshot_from_saved_json(PHOTO).expect("photo");
        let mut wrong = layout();
        wrong.instances[0].settings =
            vantare_domain::widget_settings::Settings::default_for(Kind::Standings);
        assert_eq!(single(&wrong, &snapshot, 1.0).err().unwrap().code, 2);
        assert!(single(&layout(), &snapshot, f32::NAN).is_err());
    }
    #[test]
    fn malformed_rgba_is_rejected_but_legitimate_empty_pixels_are_accepted() {
        assert!(validate_pixels(&[0; 8], 2, 1).is_ok());
        assert!(validate_pixels(&[255; 8], 2, 1).is_ok());
        assert!(validate_pixels(&[1, 2, 3, 0, 4, 5, 6, 0], 2, 1).is_ok());
        assert!(validate_pixels(&[0; 4], 2, 1).is_err());
        assert!(validate_pixels(&[0, 0, 0, 255, 255, 255, 255, 255], 2, 1).is_ok());
    }
    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }
    #[test]
    fn cli_has_exclusive_inputs_fixed_wall_and_explicit_motion() {
        let request = Request::parse(&args(&[
            "--layout",
            "a.json",
            "--snapshot",
            "b.json",
            "--output",
            "c.png",
        ]))
        .unwrap();
        assert_eq!(request.wall, WALL_MS);
        assert!(request.reduced);
        assert_eq!(request.at, None);
        for extra in [
            vec!["--sequence", "seq.tsv"],
            vec!["--widget", "relative"],
            vec!["--settings", "s.json"],
            vec!["--scale", "NaN"],
            vec!["--scale", "2"],
            vec!["--scale", "0"],
            vec!["--at-ms", "60001"],
            vec!["--at-ms", "-1"],
            vec!["--wall-ms", "18446744073709551615"],
            vec!["--motion", "yes"],
            vec!["--output", "other.png"],
            vec!["--instance", ""],
        ] {
            let mut input = args(&[
                "--layout",
                "a.json",
                "--snapshot",
                "b.json",
                "--output",
                "c.png",
            ]);
            input.extend(args(&extra));
            assert_eq!(Request::parse(&input).err().unwrap().code, 2, "{extra:?}");
        }
        let request = Request::parse(&args(&[
            "--widget",
            "relative",
            "--settings",
            "a.json",
            "--output",
            "b.png",
            "--motion",
            "true",
            "--wall-ms",
            "123",
            "--at-ms",
            "60",
        ]))
        .unwrap();
        assert!(!request.reduced);
        assert_eq!(request.wall, 123);
        assert_eq!(request.at, Some(60));
    }
    #[test]
    fn tsv_preserves_tied_input_order_and_has_strict_time_and_count_limits() {
        let rows = sequence(
            "0\tfirst.json\n0\tsecond.json\n60000\tlast.json\n",
            Path::new("fixtures"),
        )
        .unwrap();
        assert_eq!(rows[0], (0, Path::new("fixtures").join("first.json")));
        assert_eq!(rows[1], (0, Path::new("fixtures").join("second.json")));
        assert_eq!(rows[2].0, 60_000);
        for text in [
            "",
            "1\ta\n0\tb",
            "-1\ta",
            "60001\ta",
            "1 a",
            "0\t",
            "0\ta\tb",
            "1.5\ta",
        ] {
            assert_eq!(sequence(text, Path::new(".")).err().unwrap().code, 2);
        }
        let full = "0\tphoto.json\n".repeat(256);
        assert_eq!(sequence(&full, Path::new(".")).unwrap().len(), 256);
        assert!(sequence(&(full + "0\textra.json\n"), Path::new(".")).is_err());
    }
    #[test]
    fn every_registered_kind_and_look_uses_the_live_constructor_and_snapshot_size() {
        use vantare_domain::widget_settings::{Settings, look::Look};
        let snapshot = vantare_ipc::snapshot_from_saved_json(PHOTO).unwrap();
        let mut checked = 0;
        for kind in Kind::ALL {
            for look in Look::ALL {
                let json = format!(
                    r#"{{"version":1,"instances":[{{"id":"item","x":120,"y":80,"settings":{{"kind":"{}","designSystem":"{}"}}}}]}}"#,
                    kind.name(),
                    look.name()
                );
                let design = Layout::from_json(json.as_bytes()).unwrap();
                let settings = &design.instances[0].settings;
                let Some(new) = crate::renderer::constructor(settings) else {
                    continue;
                };
                let expected = new(settings, design.preferences, true, 15, 0.0)
                    .unwrap()
                    .size_for(Some(&snapshot));
                let capture = prepare(
                    &design,
                    &[(0, snapshot.clone())],
                    1.0,
                    true,
                    WALL_MS,
                    None,
                    Some("item"),
                )
                .unwrap();
                assert_eq!(
                    (capture.width, capture.height),
                    dimensions(expected, 1.0).unwrap(),
                    "{}",
                    kind.name()
                );
                checked += 1;
                assert!(capture.images.iter().all(|i| i.pixels().size() != (0, 0)));
                // No hidden filtering on unsupported kinds; the registry is the authority.
                assert_eq!(settings.kind(), Settings::default_for(*kind).kind());
            }
        }
        assert!(checked >= 15);
    }
    #[test]
    fn replay_injects_changes_even_when_metadata_repeats_or_goes_backwards() {
        let first = vantare_ipc::snapshot_from_saved_json(PHOTO).unwrap();
        let mut second = first.clone();
        second.sequence = 0;
        for car in &mut second.state.cars {
            car.driver.name = "SECOND PHOTO 12345".into();
        }
        let mut third = first.clone();
        third.sequence = 0;
        for car in &mut third.state.cars {
            car.driver.name = "THIRD PHOTO 98765".into();
        }
        let photos = [(0, first), (0, second), (20, third)];
        let capture = prepare(&layout(), &photos, 1.0, true, WALL_MS, None, None).unwrap();
        assert!(
            capture
                .runtime
                .elements()
                .iter()
                .any(|e| e.text.as_deref().is_some_and(|v| v.contains("98765")))
        );
        assert!(
            !capture
                .runtime
                .elements()
                .iter()
                .any(|e| e.text.as_deref().is_some_and(|v| v.contains("12345")))
        );
        assert!(prepare(&layout(), &photos, 1.0, true, WALL_MS, Some(19), None).is_err());
        assert!(
            prepare(
                &layout(),
                &[(2, photos[0].1.clone()), (1, photos[1].1.clone())],
                1.0,
                true,
                WALL_MS,
                None,
                None
            )
            .is_err()
        );
    }
    #[test]
    fn bounds_are_checked_before_allocation_and_instance_selection_is_explicit() {
        use vantare_domain::geometry::Size;
        assert_eq!(
            dimensions(
                Size {
                    width: 4096.0,
                    height: 4096.0
                },
                1.0
            )
            .unwrap(),
            (4096, 4096)
        );
        for (w, h, scale) in [
            (4097.0, 1.0, 1.0),
            (0.0, 1.0, 1.0),
            (1.0, f32::INFINITY, 1.0),
            (1.0, 1.0, f32::NAN),
            (4096.0, 1.0, 1.5),
        ] {
            assert_eq!(
                dimensions(
                    Size {
                        width: w,
                        height: h
                    },
                    scale
                )
                .err()
                .unwrap()
                .code,
                2
            );
        }
        let snapshot = vantare_ipc::snapshot_from_saved_json(PHOTO).unwrap();
        let mut design = layout();
        let mut other = design.instances[0].clone();
        other.id = "second".into();
        other.settings = vantare_domain::widget_settings::Settings::default_for(Kind::Radar);
        design.instances.push(other);
        assert!(single(&design, &snapshot, 1.0).is_err());
        assert!(
            prepare(
                &design,
                &[(0, snapshot.clone())],
                1.0,
                true,
                WALL_MS,
                None,
                Some("missing")
            )
            .is_err()
        );
        let capture = prepare(
            &design,
            &[(0, snapshot)],
            1.0,
            true,
            WALL_MS,
            None,
            Some("second"),
        )
        .unwrap();
        assert!(capture.runtime.find("relative-view").is_none());
    }
    #[test]
    fn disk_inputs_use_ipc_settings_and_reject_missing_demo_without_gpu() {
        let root = std::env::temp_dir().join(format!("vantare-capture-a-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let settings = root.join("settings.json");
        let photo = root.join("photo.json");
        let seq = root.join("sequence.tsv");
        std::fs::write(&settings, r#"{"rangeAhead":1,"rangeBehind":2}"#).unwrap();
        std::fs::write(&photo, PHOTO).unwrap();
        std::fs::write(&seq, "0\tphoto.json\n0\tphoto.json\n10\tphoto.json\n").unwrap();
        let mut request = Request::parse(&args(&[
            "--widget",
            "relative",
            "--settings",
            settings.to_str().unwrap(),
            "--output",
            root.join("out.png").to_str().unwrap(),
        ]))
        .unwrap();
        let design = request.design().unwrap();
        assert_eq!(design.instances[0].settings.kind(), Kind::Relative);
        assert_eq!(request.photos().err().unwrap().code, 3);
        request.sequence = Some(seq.clone());
        let photos = request.photos().unwrap();
        assert_eq!(
            photos.iter().map(|(at, _)| *at).collect::<Vec<_>>(),
            [0, 0, 10]
        );
        assert_eq!(photos[0].1.sequence, photos[1].1.sequence);
        std::fs::write(&settings, "{}").unwrap();
        request.widget = Some(Kind::SessionAlerts);
        let alerts = request.design().unwrap();
        assert!(selected(&alerts, Some("capture")).is_ok());
        request.widget = Some(Kind::Relative);
        std::fs::write(&settings, r#"{"kind":"radar"}"#).unwrap();
        assert!(request.design().is_err());
        std::fs::write(&settings, r#"{"rangeAhead": "wrong"}"#).unwrap();
        assert!(request.design().is_err());
        std::fs::write(&seq, "0\tmissing.json\n").unwrap();
        assert_eq!(request.photos().err().unwrap().code, 2);
        std::fs::write(&seq, "0\tphoto.json\n").unwrap();
        std::fs::write(&photo, vec![b' '; 8 * 1024 * 1024 + 1]).unwrap();
        assert!(request.photos().is_err());
        let mut padded = PHOTO.as_bytes().to_vec();
        padded.resize(8 * 1024 * 1024, b' ');
        std::fs::write(&photo, padded).unwrap();
        std::fs::write(&seq, "0\tphoto.json\n".repeat(9)).unwrap();
        assert_eq!(
            request.photos().err().unwrap().code,
            2,
            "total exceeds 64 MiB"
        );
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn virtual_clock_runs_scheduled_alerts_with_the_fixed_wall_hook() {
        let mut design = layout();
        design.instances[0].settings =
            vantare_domain::widget_settings::Settings::default_for(Kind::SessionAlerts);
        let mut photo = crate::testdata::snapshot();
        photo.origin.source.simulator = "lmu";
        photo.state.source_state = vantare_domain::SourceState::Live;
        photo.state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Practice);
        photo.state.session.elapsed_s = vantare_domain::Quality::Reliable(0.0);
        photo.state.session.timing.scheduled_end_s = vantare_domain::Quality::Reliable(300.0);
        let photos = [(0, photo)];
        let first = prepare(&design, &photos, 1.0, false, 1234, Some(500), None).unwrap();
        let second = prepare(&design, &photos, 1.0, false, 1234, Some(500), None).unwrap();
        let text = |capture: &Capture| {
            capture
                .runtime
                .elements()
                .into_iter()
                .filter_map(|e| e.text)
                .collect::<Vec<_>>()
        };
        assert_eq!(text(&first), text(&second));
        assert!(!first.runtime.instances.is_empty());
        assert!(first.runtime.wake_deadline().is_none_or(|due| due >= 0.5));
        let mut exhausted = 10_000;
        let mut clock = 0.5;
        let mut first = first;
        assert_eq!(
            first
                .advance(&mut clock, 1.0, &mut exhausted)
                .err()
                .unwrap()
                .code,
            2
        );
    }
    #[test]
    fn wall_and_motion_flags_change_real_alert_deadlines_and_paint() {
        let mut design = layout();
        design.instances[0].settings =
            vantare_domain::widget_settings::Settings::default_for(Kind::SessionAlerts);
        let mut photo = crate::testdata::snapshot();
        photo.origin.source.simulator = "lmu";
        photo.state.source_state = vantare_domain::SourceState::Live;
        photo.state.session.kind =
            vantare_domain::Quality::Reliable(vantare_domain::SessionKind::Practice);
        photo.state.session.elapsed_s = vantare_domain::Quality::Reliable(0.0);
        photo.state.session.timing.scheduled_end_s = vantare_domain::Quality::Reliable(300.0);
        let photos = [(0, photo)];
        let from_flags = |wall, motion, at| {
            let flags = args(&[
                "--layout",
                "scene.json",
                "--snapshot",
                "photo.json",
                "--output",
                "out.png",
                "--wall-ms",
                wall,
                "--motion",
                motion,
                "--at-ms",
                at,
            ]);
            let request = Request::parse(&flags).unwrap();
            prepare(
                &design,
                &photos,
                request.scale,
                request.reduced,
                request.wall,
                request.at,
                None,
            )
            .unwrap()
        };
        let early = from_flags("1234", "false", "0");
        let late = from_flags("1789", "false", "0");
        assert!(early.runtime.wake_deadline().is_some());
        assert_ne!(
            early.runtime.wake_deadline(),
            late.runtime.wake_deadline(),
            "--wall-ms must reach the actual notice clock"
        );
        let animated = from_flags("1234", "true", "75");
        let reduced = from_flags("1234", "false", "75");
        let paint = |c: &Capture| {
            c.runtime
                .instances
                .iter()
                .map(|i| (i.rect, i.fill, i.fade))
                .collect::<Vec<_>>()
        };
        assert_ne!(
            paint(&animated),
            paint(&reduced),
            "--motion must reach Widget::policy and change its real fade"
        );
    }
    #[test]
    fn full_minute_replay_has_a_fixed_sixty_hz_floor() {
        let mut design = layout();
        design.performance.widgets.insert("variant".into(), 1000);
        let snapshot = vantare_ipc::snapshot_from_saved_json(PHOTO).unwrap();
        let mut capture = prepare(
            &design,
            &[(0, snapshot)],
            1.0,
            false,
            WALL_MS,
            Some(0),
            None,
        )
        .unwrap();
        let (mut clock, mut steps) = (0.0, 0);
        capture.advance(&mut clock, 60.0, &mut steps).unwrap();
        assert!(steps <= 3601);
        assert_eq!(clock, 60.0);
    }
    #[test]
    fn run_rejects_unsupported_before_demo_and_validates_before_existing_output() {
        let root = std::env::temp_dir().join(format!("rune-capture-order-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let settings = root.join("settings.json");
        let output = root.join("out.png");
        std::fs::write(&settings, "{}").unwrap();
        std::fs::write(&output, b"KEEP EVIDENCE").unwrap();
        let flags = |kind| {
            args(&[
                "--widget",
                kind,
                "--settings",
                settings.to_str().unwrap(),
                "--output",
                output.to_str().unwrap(),
            ])
        };
        let unsupported = run(&flags("standings")).unwrap_err();
        assert_eq!(unsupported.code, 2);
        assert_eq!(unsupported.token, "INVALID_INPUT");
        let no_demo = run(&flags("relative")).unwrap_err();
        assert_eq!(no_demo.code, 3);
        assert_eq!(no_demo.token, "NO_DEMO");
        assert_eq!(std::fs::read(&output).unwrap(), b"KEEP EVIDENCE");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn assets_wait_for_pixels_and_shutdown_even_with_queued_work_or_decode_failure() {
        let mut assets = Assets::new();
        let image = assets
            .cache
            .as_ref()
            .unwrap()
            .rgba(128, 128, vec![0; 128 * 128 * 4]);
        assets.wait(std::slice::from_ref(&image)).unwrap();
        assert_eq!(image.size(), Some([128, 128]));
        assert_eq!(image.pixels().size(), (128, 128));
        assets.shutdown().unwrap();
        assert!(assets.stopped && assets.cache.is_none());
        let mut queued = Assets::new();
        let image = queued
            .cache
            .as_ref()
            .unwrap()
            .rgba(128, 128, vec![0; 128 * 128 * 4]);
        queued.shutdown().unwrap();
        assert_eq!(
            image.pixels().size(),
            (128, 128),
            "stop follows publication and last worker exit"
        );
        let mut failed = Assets::new();
        let image = failed.cache.as_ref().unwrap().load(vec![1, 2, 3, 4]);
        assert_eq!(failed.wait(&[image]).unwrap_err().code, 5);
        failed.shutdown().unwrap();
        assert!(failed.stopped);
    }
    #[test]
    fn assets_closed_channel_or_wait_deadline_is_a_capture_failure() {
        let (tx, events) = mpsc::channel();
        let mut assets = Assets {
            cache: None,
            events,
            deadline: Instant::now(),
            stopped: true,
        };
        assert_eq!(assets.receive().err().unwrap().code, 5);
        drop(tx);
        assets.deadline = Instant::now() + Duration::from_secs(1);
        assert_eq!(assets.receive().err().unwrap().code, 5);
    }
    #[test]
    fn actual_wheel_pixels_reach_the_capture_atlas_and_workers_close_before_success() {
        let mut design = layout();
        design.instances[0].settings =
            vantare_domain::widget_settings::Settings::default_for(Kind::PedalsTelemetry);
        let snapshot = crate::testdata::snapshot();
        let capture = single(&design, &snapshot, 1.0).unwrap();
        assert_eq!(capture.images.len(), 1);
        assert_eq!(capture.images[0].pixels().size(), (40, 40));
        assert!(capture.runtime.find("pedals-telemetry-wheel").is_some());
        assert!(!capture.runtime.images.pages.is_empty());
        capture.finish().unwrap();
    }
    #[test]
    fn png_creation_preserves_existing_evidence_and_races_have_one_winner() {
        let folder = TempPng::new(&std::env::temp_dir()).unwrap();
        let path = folder.dir.join("image.png");
        publish_png(&path, (1, 1), &[0, 0, 0, 0]).unwrap();
        let first = std::fs::read(&path).unwrap();
        assert!(first.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(
            publish_png(&path, (1, 1), &[255, 0, 0, 255])
                .unwrap_err()
                .code,
            5
        );
        assert_eq!(std::fs::read(&path).unwrap(), first);
        assert_eq!(
            std::fs::read_dir(&folder.dir).unwrap().count(),
            1,
            "one PNG, no sidecar/temporary left"
        );
        let mut assets = Assets::new();
        let png = assets.cache.as_ref().unwrap().load(first);
        assets.wait(std::slice::from_ref(&png)).unwrap();
        assert_eq!(png.size(), Some([1, 1]));
        assets.shutdown().unwrap();
        std::fs::remove_file(&path).unwrap();
        let barrier = std::sync::Barrier::new(2);
        std::thread::scope(|scope| {
            let a = scope.spawn(|| {
                barrier.wait();
                publish_png(&path, (1, 1), &[255, 0, 0, 255])
            });
            let b = scope.spawn(|| {
                barrier.wait();
                publish_png(&path, (1, 1), &[0, 255, 0, 255])
            });
            let outcomes = [a.join().unwrap(), b.join().unwrap()];
            assert_eq!(outcomes.iter().filter(|r| r.is_ok()).count(), 1);
            assert_eq!(outcomes.into_iter().find_map(Result::err).unwrap().code, 5);
        });
        assert_eq!(std::fs::read_dir(&folder.dir).unwrap().count(), 1);
        folder.remove().unwrap();
    }
}
