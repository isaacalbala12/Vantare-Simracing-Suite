//! PNG de referencia y captura productiva; sin renderer ni codec alternativos.
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicU64, Ordering},
};
use std::time::{Duration, Instant};

use crate::files;
use gpui::{Image, ImageFormat, RenderImage, SvgRenderer};
use vantare_domain::Snapshot;
use vantare_ui::Kind;

pub const REFERENCES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/reference");
const MAX_PNG: u64 = 16 * 1024 * 1024;
const MAX_PIXELS: u64 = 16 * 1024 * 1024;

pub fn reference(kind: Kind) -> PathBuf {
    Path::new(REFERENCES).join(format!("{}.png", kind.name()))
}

/// Igual que ui/diff.py: píxel distinto si cualquier canal premultiplicado
/// supera 8, incluido alfa recto. RGBA y BGRA dan el mismo máximo por canal.
pub fn different_percent(candidate: &[u8], reference: &[u8]) -> Result<f64, String> {
    if candidate.is_empty()
        || candidate.len() != reference.len()
        || !candidate.len().is_multiple_of(4)
    {
        return Err("buffers de píxeles vacíos o de distinto tamaño".into());
    }
    let mut changed = 0_u32;
    let mut total = 0_u32;
    for (candidate, reference) in candidate.chunks_exact(4).zip(reference.chunks_exact(4)) {
        let alpha_c = f32::from(candidate[3]) / 255.0;
        let alpha_r = f32::from(reference[3]) / 255.0;
        let rgb_diff = (0..3).any(|channel| {
            (f32::from(candidate[channel]) * alpha_c - f32::from(reference[channel]) * alpha_r)
                .abs()
                > 8.0
        });
        changed += u32::from(rgb_diff || candidate[3].abs_diff(reference[3]) > 8);
        total = total.checked_add(1).ok_or("demasiados píxeles")?;
    }
    Ok(100.0 * f64::from(changed) / f64::from(total))
}

pub fn load_png(path: &Path) -> Result<Arc<RenderImage>, String> {
    let bytes = files::read(path, MAX_PNG)?;
    // Acotar antes de decodificar evita que un IHDR pequeño provoque una
    // asignación desmesurada. GPUI valida CRC, chunks y formato después.
    if bytes.len() < 33 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" || &bytes[12..16] != b"IHDR" {
        return Err("PNG sin cabecera IHDR válida".into());
    }
    let number = |at| u32::from_be_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]]);
    let (width, height) = (number(16), number(20));
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
        return Err("dimensiones PNG no admitidas".into());
    }
    Image::from_bytes(ImageFormat::Png, bytes)
        .to_image_data(SvgRenderer::new(Arc::new(())))
        .map_err(|error| format!("decodificar PNG: {error}"))
}

pub struct Comparison {
    pub candidate: Arc<RenderImage>,
    pub reference: Arc<RenderImage>,
    pub percent: f64,
}

#[derive(Default)]
pub struct CaptureProcess {
    child: Mutex<Option<Child>>,
    cancelled: AtomicBool,
}

impl CaptureProcess {
    // También se llama al destruir Workshop: el cierre del Hub recoge al hijo
    // antes de salir, sin depender de que el executor ejecute otra tarea.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.stop_child();
    }

    fn run(&self, command: &mut Command) -> Result<(), String> {
        {
            let mut slot = self.child.lock().map_err(|e| format!("captura: {e}"))?;
            if self.cancelled.load(Ordering::Acquire) {
                return Err("captura cancelada".into());
            }
            if slot.is_some() {
                return Err("otra captura está en curso".into());
            }
            *slot = Some(
                command
                    .spawn()
                    .map_err(|e| format!("arrancar captura: {e}"))?,
            );
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        let status = loop {
            let polled = {
                let mut slot = self.child.lock().map_err(|e| format!("captura: {e}"))?;
                slot.as_mut().ok_or("captura cancelada")?.try_wait()
            };
            match polled {
                Ok(Some(status)) => break Ok(status),
                Ok(None)
                    if !self.cancelled.load(Ordering::Acquire) && Instant::now() < deadline =>
                {
                    std::thread::sleep(Duration::from_millis(50));
                }
                Ok(None) => break Err("captura cancelada o plazo de 30 s agotado".into()),
                Err(error) => break Err(format!("esperar captura: {error}")),
            }
        };
        if status.is_err() {
            self.stop_child();
        } else {
            self.child
                .lock()
                .map_err(|e| format!("captura: {e}"))?
                .take();
        }
        if !status?.success() {
            return Err("captura fallida: comprobar feature parity-capture, DPI 100 %, ventana visible y widget dentro del monitor".into());
        }
        Ok(())
    }

    fn stop_child(&self) {
        if let Ok(mut slot) = self.child.lock()
            && let Some(mut child) = slot.take()
        {
            if let Err(error) = child.kill() {
                eprintln!("parar captura: {error}");
            }
            if let Err(error) = child.wait() {
                eprintln!("recoger captura: {error}");
            }
        }
    }
}

impl Comparison {
    pub fn from_pngs(candidate: &Path, reference: &Path) -> Result<Self, String> {
        let candidate = load_png(candidate)?;
        let reference = load_png(reference)?;
        if candidate.size(0) != reference.size(0) {
            return Err(format!(
                "tamaños distintos: captura {:?}, referencia {:?}",
                candidate.size(0),
                reference.size(0)
            ));
        }
        let percent = different_percent(
            candidate.as_bytes(0).ok_or("captura sin píxeles")?,
            reference.as_bytes(0).ok_or("referencia sin píxeles")?,
        )?;
        Ok(Self {
            candidate,
            reference,
            percent,
        })
    }
}

struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        for name in ["scene.json", "candidate.png"] {
            let path = self.0.join(name);
            if path.exists()
                && let Err(error) = std::fs::remove_file(&path)
            {
                eprintln!("limpiar captura {}: {error}", path.display());
            }
        }
        if let Err(error) = std::fs::remove_dir(&self.0) {
            eprintln!("limpiar directorio de captura: {error}");
        }
    }
}

/// Ejecuta el capturador ya existente, una foto congelada, ES/métrico.
/// Plazo y cancelación mantienen este proceso temporal bajo el Hub.
pub fn capture(
    kind: Kind,
    snapshot: &Snapshot,
    process: &CaptureProcess,
) -> Result<Comparison, String> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let reference = reference(kind);
    load_png(&reference)?;
    let binary = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .with_file_name("vantare-workshop.exe");
    if !binary.is_file() {
        return Err("falta vantare-workshop.exe con feature parity-capture junto al Hub".into());
    }
    let directory = std::env::temp_dir().join(format!(
        "vantare-hub-capture-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir(&directory).map_err(|e| format!("directorio de captura: {e}"))?;
    let temporary = Temporary(directory);
    let scene = temporary.0.join("scene.json");
    let candidate = temporary.0.join("candidate.png");
    std::fs::write(
        &scene,
        vantare_ipc::snapshot_to_json(snapshot).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("congelar foto: {e}"))?;
    let mut command = Command::new(binary);
    command
        .args(["--widget", kind.name(), "--escena"])
        .arg(scene)
        .arg("--captura")
        .arg(&candidate)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: sin consola nueva.
    }
    process.run(&mut command)?;
    Comparison::from_pngs(&candidate, &reference)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_diff_py_threshold_premultiplication_and_alpha() {
        // Oráculo conocido: ui/diff.py --threshold 8 devuelve 2/5 = 40 %.
        let reference = [
            0, 0, 0, 0, 100, 0, 0, 255, 100, 0, 0, 255, 100, 0, 0, 128, 0, 0, 0, 0,
        ];
        let candidate = [
            255, 80, 20, 0, 108, 0, 0, 255, 109, 0, 0, 255, 116, 0, 0, 128, 0, 0, 0, 8,
        ];
        assert!(
            (different_percent(&candidate, &reference).expect("diff") - 40.0).abs() < f64::EPSILON
        );
        assert!(
            different_percent(&reference, &reference)
                .expect("idéntico")
                .abs()
                < f64::EPSILON
        );
        assert!(
            (different_percent(&[0, 0, 0, 9], &[0, 0, 0, 0]).expect("alfa distinto") - 100.0).abs()
                < f64::EPSILON
        );
        assert!(different_percent(&[], &[]).is_err());
        assert!(different_percent(&candidate[..4], &reference).is_err());
    }

    #[test]
    fn frozen_pngs_decode_with_gpui_and_size_mismatch_is_an_error() {
        let reference = reference(Kind::Standings);
        let comparison =
            Comparison::from_pngs(&reference, &reference).expect("referencia obligatoria");
        assert!(comparison.percent.abs() < f64::EPSILON);
        assert!(Comparison::from_pngs(&reference, &super::reference(Kind::Pedals)).is_err());
    }
}
