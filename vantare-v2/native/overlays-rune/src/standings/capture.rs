//! Same painter as on-track, prepared in CPU; GPU entry point opens no window.
use super::Standings;
use crate::offscreen::{self, Rgba, Size};
use rune::{Cx, El, Env, Runtime};
use std::{
    ffi::OsString,
    io::{self, Read},
    path::PathBuf,
};
use vantare_domain::{Snapshot, format::Preferences, widget_settings::standings::Settings};

pub struct Capture {
    pub runtime: Runtime<Standings>,
    pub size: Size,
}
fn view(state: &Standings, _: &mut Cx<Standings>) -> El {
    state.view()
}

/// Scene callers supply decoded canonical IPC data/settings, never another mock VM.
pub fn prepare(
    settings: &Settings,
    prefs: Preferences,
    snapshot: &Snapshot,
    scale: f32,
) -> Result<Capture, offscreen::Error> {
    let mut painter = Standings::new(settings, prefs);
    painter.update(snapshot);
    let natural = painter.size();
    let size = Size::new((natural.width, natural.height), scale)?;
    let runtime = Runtime::with_text(
        painter,
        view,
        size.logical(),
        Env::new(true, scale),
        rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter W400", "Inter W400")),
    );
    Ok(Capture { runtime, size })
}

/// Fake pixels in CI; this exercises the actual Runtime tree/layout, not a screenshot mock.
pub fn render_with<E: From<offscreen::Error>>(
    capture: &mut Capture,
    painter: impl FnOnce(&mut Runtime<Standings>, Size) -> Result<Vec<u8>, E>,
) -> Result<Rgba, E> {
    offscreen::render_with(&mut capture.runtime, capture.size, painter)
}

/// Graphics only on the PC of play in the orchestrator's allocated session.
/// No App, HWND, event loop, monitor activation or desktop surface is created.
pub fn render_gpu(capture: &mut Capture) -> Result<Rgba, Box<dyn std::error::Error>> {
    offscreen::render_gpu(&mut capture.runtime, capture.size)
}

#[derive(Debug, PartialEq)]
struct Request {
    layout: PathBuf,
    snapshot: PathBuf,
    output: PathBuf,
    scale: f32,
}
impl Request {
    fn parse(args: &[OsString], development: bool) -> io::Result<Self> {
        if !development {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "la captura de escenas sintéticas solo está disponible en debug",
            ));
        }
        let mut layout = None;
        let mut snapshot = None;
        let mut output = None;
        let mut scale = None;
        let mut args = args.iter();
        while let Some(key) = args.next() {
            let value = args
                .next()
                .ok_or_else(|| invalid("falta un valor de captura"))?;
            let slot = match key.to_str() {
                Some("--layout") => &mut layout,
                Some("--snapshot") => &mut snapshot,
                Some("--output") => &mut output,
                Some("--scale") => {
                    if scale.is_some() {
                        return Err(invalid("escala repetida"));
                    }
                    let n = value
                        .to_str()
                        .and_then(|v| v.parse::<f32>().ok())
                        .filter(|n| [1.0, 1.25, 1.5].contains(n))
                        .ok_or_else(|| invalid("escala de captura: 1, 1.25 o 1.5"))?;
                    scale = Some(n);
                    continue;
                }
                _ => return Err(invalid("argumento de captura desconocido")),
            };
            if slot.replace(PathBuf::from(value)).is_some() {
                return Err(invalid("ruta de captura repetida"));
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
            return Err(invalid("se requieren dos entradas .json y una salida .png"));
        }
        Ok(request)
    }
    fn prepare(&self) -> Result<Capture, Box<dyn std::error::Error>> {
        let layout = vantare_ipc::layout::Layout::from_json(&read(
            &self.layout,
            vantare_ipc::layout::MAX_BYTES,
        )?)?;
        let [instance] = layout.instances.as_slice() else {
            return Err(invalid("la escena debe contener exactamente un widget").into());
        };
        let vantare_domain::widget_settings::Settings::Standings(settings) = &instance.settings
        else {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "esta captura prepara Standings; Relative usa su entrada común de PR 7",
            )
            .into());
        };
        let snapshot = String::from_utf8(read(&self.snapshot, 8 * 1024 * 1024)?)?;
        let snapshot = vantare_ipc::snapshot_from_saved_json(&snapshot)?;
        Ok(prepare(
            settings,
            layout.preferences,
            &snapshot,
            self.scale,
        )?)
    }
}
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}
fn read(path: &std::path::Path, max: u64) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(max + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max {
        return Err(invalid("entrada de captura demasiado grande"));
    }
    Ok(bytes)
}
/// Entry point of the debug-only scene mode in the product executable.
/// The executable's machine graphics guard precedes even parsing this request.
pub fn run(args: &[OsString]) -> Result<(), Box<dyn std::error::Error>> {
    let request = Request::parse(args, crate::options::LOCAL_PREVIEW_ENABLED)?;
    if request.output.try_exists()? {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "la captura no reemplaza evidencias anteriores",
        )
        .into());
    }
    let mut capture = request.prepare()?;
    let image = render_gpu(&mut capture)?;
    let (w, h) = image.size.pixels();
    rune::render::write_png(&request.output, w, h, &image.pixels)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<OsString> {
        values.iter().map(OsString::from).collect()
    }
    #[test]
    fn scene_arguments_are_bounded_and_distribution_never_reads_or_renders_them() {
        let valid = args(&[
            "--layout",
            "scene.json",
            "--snapshot",
            "photo.json",
            "--output",
            "rune.png",
            "--scale",
            "1.25",
        ]);
        assert_eq!(
            Request::parse(&valid, true).expect("debug scene").scale,
            1.25
        );
        assert_eq!(
            Request::parse(&valid, false)
                .expect_err("distribution closed")
                .kind(),
            io::ErrorKind::PermissionDenied
        );
        for invalid_args in [
            args(&[]),
            args(&["--layout"]),
            args(&["--snap", "x"]),
            args(&["--scale", "NaN"]),
            args(&["--scale", "2"]),
            args(&["--scale", "1", "--scale", "1"]),
            args(&["--layout", "x.json", "--layout", "x.json"]),
            args(&[
                "--layout",
                ".env",
                "--snapshot",
                "x.json",
                "--output",
                "x.png",
            ]),
        ] {
            assert_eq!(
                Request::parse(&invalid_args, true)
                    .expect_err("reject invalid request before IO/GPU")
                    .kind(),
                io::ErrorKind::InvalidInput
            );
        }
    }
}
