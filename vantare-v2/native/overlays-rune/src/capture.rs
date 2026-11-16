//! Debug-only scene capture. CPU preparation and explicit data update precede GPU creation.
use crate::widget::{Update, Widget};
use rune::{
    El, Env, Runtime,
    render::{Gpu, OFFSCREEN_FORMAT, Offscreen, Renderer},
};
use std::{
    ffi::OsString,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};
use vantare_domain::{
    Snapshot,
    widget_settings::{Kind, look::Look},
};
use vantare_ipc::layout::Layout;

type Error = Box<dyn std::error::Error>;
struct Request {
    layout: PathBuf,
    snapshot: PathBuf,
    output: PathBuf,
    scale: f32,
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
impl Request {
    fn parse(args: &[OsString]) -> io::Result<Self> {
        let (mut layout, mut snapshot, mut output, mut scale) = (None, None, None, None);
        if !args.len().is_multiple_of(2) {
            return Err(invalid("falta un valor de captura"));
        }
        for pair in args.as_chunks::<2>().0 {
            let slot = match pair[0].to_str() {
                Some("--layout") => &mut layout,
                Some("--snapshot") => &mut snapshot,
                Some("--output") => &mut output,
                Some("--scale") => {
                    let value = pair[1]
                        .to_str()
                        .and_then(|v| v.parse::<f32>().ok())
                        .filter(|v| [1.0, 1.25, 1.5].contains(v))
                        .ok_or_else(|| invalid("escala: 1, 1.25 o 1.5"))?;
                    if scale.replace(value).is_some() {
                        return Err(invalid("escala repetida"));
                    }
                    continue;
                }
                _ => return Err(invalid("argumento de captura desconocido")),
            };
            if slot.replace(PathBuf::from(&pair[1])).is_some() {
                return Err(invalid("ruta repetida"));
            }
        }
        let request = Self {
            layout: layout.ok_or_else(|| invalid("falta --layout"))?,
            snapshot: snapshot.ok_or_else(|| invalid("falta --snapshot"))?,
            output: output.ok_or_else(|| invalid("falta --output"))?,
            scale: scale.unwrap_or(1.0),
        };
        if request.layout.extension().is_none_or(|v| v != "json")
            || request.snapshot.extension().is_none_or(|v| v != "json")
            || request.output.extension().is_none_or(|v| v != "png")
        {
            return Err(invalid("entradas .json y salida .png requeridas"));
        }
        Ok(request)
    }
}
fn read(path: &Path, max: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(max + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max {
        return Err(invalid("entrada de captura demasiado grande"));
    }
    Ok(bytes)
}
struct Capture {
    runtime: Runtime<Box<dyn Widget>>,
    width: u32,
    height: u32,
    update: Update,
}
fn view(widget: &dyn Widget) -> El {
    widget.view()
}
fn prepare(layout: &Layout, snapshot: &Snapshot, scale: f32) -> Result<Capture, Error> {
    let [instance] = layout.instances.as_slice() else {
        return Err(invalid("una instancia por captura").into());
    };
    if instance.settings.kind() != Kind::Relative || instance.settings.look() != Some(Look::Vantare)
    {
        return Err(invalid("esta captura solo admite Relative Vantare").into());
    }
    if ![1.0, 1.25, 1.5].contains(&scale) {
        return Err(invalid("escala invalida").into());
    }
    let text = rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter"));
    let _families = rune::text::with_families("Inter", "Inter");
    let new = crate::renderer::constructor(&instance.settings)
        .ok_or_else(|| invalid("widget no migrado"))?;
    let mut widget = new(
        &instance.settings,
        layout.preferences,
        true,
        layout.performance.hz(&instance.id, Kind::Relative),
        0.0,
    )
    .ok_or_else(|| invalid("ajustes incompatibles"))?;
    // No pipe, QA directory or source thread: the validated photo reaches the actual widget here.
    let update = widget.update(snapshot, 0.0);
    let size = widget.size();
    let (w, h) = ((size.width * scale).round(), (size.height * scale).round());
    if ![w, h]
        .into_iter()
        .all(|n| n.is_finite() && (1.0..=4096.0).contains(&n))
    {
        return Err(invalid("imagen fuera de la cota 4096 x 4096").into());
    }
    let mut runtime = Runtime::with_text(
        widget,
        |widget, _| view(widget.as_ref()),
        (size.width, size.height),
        Env::new(true, scale),
        text,
    );
    runtime.transparent = true;
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    Ok(Capture {
        runtime,
        width: w as u32,
        height: h as u32,
        update,
    })
}
fn validate_pixels(pixels: &[u8], width: u32, height: u32) -> io::Result<()> {
    if pixels.len() != width as usize * height as usize * 4 || pixels.is_empty() {
        return Err(invalid("longitud RGBA invalida"));
    }
    if pixels.as_chunks::<4>().0.iter().all(|p| p[3] == 0)
        || pixels.as_chunks::<4>().0.iter().all(|p| p == &pixels[..4])
    {
        return Err(invalid("captura vacia: RGBA transparente o uniforme"));
    }
    Ok(())
}
fn render(capture: &mut Capture) -> Result<Vec<u8>, Error> {
    let gpu = Gpu::try_new(Gpu::instance(), None).map_err(io::Error::other)?;
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
    validate_pixels(&pixels, size.0, size.1)?;
    Ok(pixels)
}
/// Called after the machine graphics guard and only compiled into debug builds.
pub fn run(args: &[OsString]) -> Result<(), Error> {
    let request = Request::parse(args)?;
    let record = request.output.with_extension("capture.txt");
    if request.output.try_exists()? || record.try_exists()? {
        return Err(
            io::Error::new(io::ErrorKind::AlreadyExists, "conservar evidencia anterior").into(),
        );
    }
    let layout = Layout::from_json(&read(&request.layout, vantare_ipc::layout::MAX_BYTES)?)?;
    let snapshot = vantare_ipc::snapshot_from_saved_json(&String::from_utf8(read(
        &request.snapshot,
        8 * 1024 * 1024,
    )?)?)?;
    let mut capture = prepare(&layout, &snapshot, request.scale)?;
    let pixels = render(&mut capture)?;
    rune::render::write_png(&request.output, capture.width, capture.height, &pixels)?;
    let mut record = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(record)?;
    writeln!(
        record,
        "engine=rune\nrune_rev=d5338988a7c1b3377adb60853815b6d0843dae7c\nepoch={}\nsequence={}\ncars={}\nupdate_build={}\nupdate_pixels={}\nwidth={}\nheight={}\nscale={}",
        snapshot.epoch,
        snapshot.sequence,
        snapshot.state.cars.len(),
        capture.update.build,
        capture.update.pixels,
        capture.width,
        capture.height,
        request.scale
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const PHOTO: &str = include_str!("../../ui/fixtures/relative.snapshot.json");
    fn layout() -> Layout {
        Layout::from_json(br#"{"version":1,"instances":[{"id":"variant","x":0,"y":0,"settings":{"kind":"relative","rangeAhead":1,"rangeBehind":2}}]}"#).expect("asymmetric scene layout")
    }
    #[test]
    fn real_photo_reaches_rows_and_text_and_changes_the_actual_cpu_paint_stream() {
        let mut snapshot = vantare_ipc::snapshot_from_saved_json(PHOTO).expect("GPUI photo");
        for scale in [1.0, 1.25, 1.5] {
            let first = prepare(&layout(), &snapshot, scale).expect("CPU preparation");
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
            let second = prepare(&layout(), &snapshot, scale).expect("updated photo");
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
            vantare_domain::widget_settings::Settings::default_for(Kind::Radar);
        assert!(prepare(&wrong, &snapshot, 1.0).is_err());
        assert!(prepare(&layout(), &snapshot, f32::NAN).is_err());
    }
    #[test]
    fn blank_or_malformed_rgba_is_rejected_and_nonuniform_visible_pixels_are_accepted() {
        assert!(validate_pixels(&[0; 8], 2, 1).is_err());
        assert!(validate_pixels(&[255; 8], 2, 1).is_err());
        assert!(validate_pixels(&[1, 2, 3, 0, 4, 5, 6, 0], 2, 1).is_err());
        assert!(validate_pixels(&[0; 4], 2, 1).is_err());
        assert!(validate_pixels(&[0, 0, 0, 255, 255, 255, 255, 255], 2, 1).is_ok());
    }
}
