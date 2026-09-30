//! Documento propio de UI: posiciones globales, opciones y persistencia local.
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::Settings;

pub const VERSION: u32 = 1;
pub const MAX_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub version: u32,
    pub instances: Vec<Instance>,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            version: VERSION,
            instances: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Instance {
    pub id: String,
    pub x: f32,
    pub y: f32,
    #[serde(default = "visible")]
    pub visible: bool,
    #[serde(default = "opaque")]
    pub opacity: f32,
    pub settings: Settings,
}

const fn visible() -> bool {
    true
}
const fn opaque() -> f32 {
    1.0
}

impl Layout {
    /// Acota entradas del editor sin guardar tamaños calculados por los widgets.
    pub fn normalized(mut self) -> Result<Self, Error> {
        if self.version != VERSION {
            return Err(Error::Invalid("versión de layout desconocida"));
        }
        let mut ids = HashSet::new();
        for instance in &mut self.instances {
            if instance.id.trim().is_empty() || !ids.insert(instance.id.clone()) {
                return Err(Error::Invalid("ID de instancia vacío o duplicado"));
            }
            for position in [&mut instance.x, &mut instance.y] {
                *position = if position.is_finite() {
                    position.clamp(-100_000.0, 100_000.0)
                } else {
                    0.0
                };
            }
            instance.opacity = if instance.opacity.is_finite() {
                instance.opacity.clamp(0.0, 1.0)
            } else {
                1.0
            };
            instance.settings = instance.settings.normalized();
        }
        Ok(self)
    }

    pub fn from_json(bytes: &[u8]) -> Result<Self, Error> {
        if bytes.len() as u64 > MAX_BYTES {
            return Err(Error::Invalid("layout supera 1 MiB"));
        }
        serde_json::from_slice::<Self>(bytes)
            .map_err(Error::Json)?
            .normalized()
    }
}

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    Json(serde_json::Error),
    Invalid(&'static str),
    Conflict,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Json(error) => write!(f, "JSON de layout: {error}"),
            Self::Invalid(message) => f.write_str(message),
            Self::Conflict => {
                f.write_str("layout cambiado por otro editor; releer antes de guardar")
            }
        }
    }
}
impl std::error::Error for Error {}
impl From<io::Error> for Error {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

pub fn default_path() -> Result<PathBuf, Error> {
    std::env::var_os("LOCALAPPDATA")
        .map(|root| PathBuf::from(root).join("Vantare/native/layout.json"))
        .ok_or(Error::Invalid("LOCALAPPDATA no está definido"))
}

fn read(path: &Path) -> Result<Option<Vec<u8>>, Error> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(Error::Invalid("layout supera 1 MiB"));
    }
    Ok(Some(bytes))
}

fn modified(path: &Path) -> Option<SystemTime> {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
}

/// Conserva los bytes originales para detectar conflictos y el último layout válido.
pub struct Document {
    path: PathBuf,
    bytes: Option<Vec<u8>>,
    modified: Option<SystemTime>,
    layout: Layout,
}

impl Document {
    /// Un fichero ausente representa un layout vacío; uno inválido devuelve error.
    pub fn open(path: PathBuf) -> Result<Self, Error> {
        let stamp = modified(&path);
        let bytes = read(&path)?;
        let layout = bytes
            .as_deref()
            .map_or_else(|| Ok(Layout::default()), Layout::from_json)?;
        Ok(Self {
            path,
            bytes,
            modified: stamp,
            layout,
        })
    }

    pub fn layout(&self) -> &Layout {
        &self.layout
    }

    /// El sondeo registra un error una vez por mtime y nunca sustituye el último válido.
    pub fn poll(&mut self) -> Result<bool, Error> {
        let stamp = modified(&self.path);
        if stamp == self.modified {
            return Ok(false);
        }
        self.modified = stamp;
        let bytes = read(&self.path)?.ok_or(Error::Invalid("layout desaparecido"))?;
        let layout = Layout::from_json(&bytes)?;
        let changed = layout != self.layout;
        self.bytes = Some(bytes);
        self.layout = layout;
        Ok(changed)
    }

    pub fn save(&mut self, layout: &Layout) -> Result<(), Error> {
        let layout = layout.clone().normalized()?;
        let bytes = serde_json::to_vec_pretty(&layout).map_err(Error::Json)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err(Error::Invalid("layout supera 1 MiB"));
        }
        persist(&self.path, self.bytes.as_deref(), &bytes, || Ok(()))?;
        self.bytes = Some(bytes);
        self.layout = layout;
        self.modified = modified(&self.path);
        Ok(())
    }
}

// Serializa los escritores de esta API; los bytes comparados siguen siendo la
// autoridad del conflicto. Un editor externo se detecta antes del reemplazo.
struct PendingFile {
    path: PathBuf,
    file: File,
}
impl Drop for PendingFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn persist(
    path: &Path,
    expected: Option<&[u8]>,
    bytes: &[u8],
    before_rename: impl FnOnce() -> io::Result<()>,
) -> Result<(), Error> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(path.with_extension("json.lock"))?;
    match lock.try_lock() {
        Ok(()) => {}
        Err(std::fs::TryLockError::WouldBlock) => return Err(Error::Conflict),
        Err(std::fs::TryLockError::Error(error)) => return Err(error.into()),
    }
    if read(path)?.as_deref() != expected {
        return Err(Error::Conflict);
    }
    let temporary = path.with_extension(format!(
        "json.{}.{}.tmp",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let mut pending = PendingFile {
        file: OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?,
        path: temporary,
    };
    pending.file.write_all(bytes)?;
    pending.file.sync_all()?;
    if expected.is_some() {
        fs::copy(path, path.with_extension("json.bak"))?;
    }
    before_rename()?;
    if read(path)?.as_deref() != expected {
        return Err(Error::Conflict);
    }
    // rename reemplaza el destino sin borrar primero el layout válido.
    fs::rename(&pending.path, path)?;
    drop(lock);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Kind;

    const FIXTURE: &[u8] = include_bytes!("../fixtures/layout.json");

    fn directory() -> PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "vantare-layout-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("directorio temporal");
        path
    }

    #[test]
    fn frozen_document_roundtrip_preserves_order_and_options() {
        let layout = Layout::from_json(FIXTURE).expect("fixture");
        assert_eq!(layout.instances[0].settings.kind(), Kind::Standings);
        assert_eq!(layout.instances[1].settings.kind(), Kind::Radar);
        assert!(!layout.instances[1].visible);
        assert_eq!(
            Layout::from_json(&serde_json::to_vec(&layout).expect("serializar")).expect("releer"),
            layout
        );
        let options = serde_json::to_value(&layout.instances[0].settings).expect("opciones");
        assert!(options.get("showSessionHeader").is_some());
        assert!(options.get("width").is_none());
        assert!(options.get("height").is_none());
    }

    #[test]
    fn invalid_json_versions_ids_and_oversized_files_are_rejected() {
        for bytes in [b"{".as_slice(), b"{}", b"{\"version\":4,\"instances\":[]}"] {
            assert!(Layout::from_json(bytes).is_err());
        }
        let mut layout = Layout::from_json(FIXTURE).expect("fixture");
        layout.instances[1].id = layout.instances[0].id.clone();
        assert!(layout.normalized().is_err());
        let dir = directory();
        let path = dir.join("layout.json");
        fs::write(&path, vec![b' '; MAX_BYTES as usize + 1]).expect("fichero grande");
        assert!(matches!(Document::open(path), Err(Error::Invalid(_))));
        fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn normalized_bounds_positions_and_opacity() {
        let mut layout = Layout::from_json(FIXTURE).expect("fixture");
        layout.instances[0].x = f32::INFINITY;
        layout.instances[0].y = -200_000.0;
        layout.instances[0].opacity = 8.0;
        layout.instances[1].opacity = f32::NAN;
        let normalized = layout.normalized().expect("normalizar");
        assert_eq!(
            (
                normalized.instances[0].x,
                normalized.instances[0].y,
                normalized.instances[0].opacity
            ),
            (0.0, -100_000.0, 1.0)
        );
        assert_eq!(normalized.instances[1].opacity, 1.0);
    }

    #[test]
    fn save_detects_conflicts_and_failure_preserves_previous_file() {
        let dir = directory();
        let path = dir.join("layout.json");
        fs::write(&path, FIXTURE).expect("fixture");
        let mut first = Document::open(path.clone()).expect("primer editor");
        let mut second = Document::open(path.clone()).expect("segundo editor");
        let changed = Layout::default();
        assert!(
            persist(&path, Some(FIXTURE), b"nuevo", || Err(io::Error::other(
                "fallo simulado"
            )))
            .is_err()
        );
        assert_eq!(fs::read(&path).expect("previo sobrevive"), FIXTURE);
        first.save(&changed).expect("guardar");
        assert_eq!(
            fs::read(path.with_extension("json.bak")).expect("backup"),
            FIXTURE
        );
        assert!(matches!(second.save(&changed), Err(Error::Conflict)));
        assert_eq!(
            Layout::from_json(&fs::read(&path).expect("nuevo")).expect("válido"),
            changed
        );
        fs::remove_dir_all(dir).expect("limpiar");
    }

    #[test]
    fn polling_keeps_last_valid_document_then_recovers_without_sleep() {
        let dir = directory();
        let path = dir.join("layout.json");
        fs::write(&path, FIXTURE).expect("fixture");
        let mut document = Document::open(path.clone()).expect("abrir");
        let previous = document.layout().clone();
        assert!(!document.poll().expect("sin cambios"));
        fs::write(&path, "{").expect("JSON roto");
        document.modified = None;
        assert!(document.poll().is_err());
        assert_eq!(document.layout(), &previous);
        assert!(!document.poll().expect("error no se repite"));
        fs::write(&path, b"{\"version\":1,\"instances\":[]}").expect("recuperar");
        document.modified = None;
        assert!(document.poll().expect("recarga"));
        assert!(document.layout().instances.is_empty());
        fs::remove_dir_all(dir).expect("limpiar");
    }
}
