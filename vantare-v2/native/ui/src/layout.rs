//! Documento propio de UI: posiciones globales, opciones y persistencia local.
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};

use crate::Settings;
use vantare_domain::format::Preferences;

pub const VERSION: u32 = 1;
pub const MAX_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub version: u32,
    pub instances: Vec<Instance>,
    /// Un solo documento permite aplicar formato y layout con la misma recarga.
    /// Los documentos v1 anteriores conservan ES/métrico por defecto.
    #[serde(default, with = "preferences")]
    pub preferences: Preferences,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            version: VERSION,
            instances: Vec::new(),
            preferences: Preferences::default(),
        }
    }
}

// El dominio sigue siendo puro y no depende de serde: el formato persistido
// pertenece a UI, igual que las posiciones y Settings.
mod preferences {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use vantare_domain::format::{Language, Preferences, Units};

    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "lowercase")]
    enum Unit {
        Metric,
        Imperial,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "lowercase")]
    enum Locale {
        Es,
        En,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Stored {
        units: Unit,
        language: Locale,
    }

    #[allow(clippy::trivially_copy_pass_by_ref)] // Firma requerida por serde(with).
    pub fn serialize<S: Serializer>(prefs: &Preferences, serializer: S) -> Result<S::Ok, S::Error> {
        Stored {
            units: match prefs.units {
                Units::Metric => Unit::Metric,
                Units::Imperial => Unit::Imperial,
            },
            language: match prefs.language {
                Language::Es => Locale::Es,
                Language::En => Locale::En,
            },
        }
        .serialize(serializer)
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Preferences, D::Error> {
        let stored = Stored::deserialize(deserializer)?;
        Ok(Preferences {
            units: match stored.units {
                Unit::Metric => Units::Metric,
                Unit::Imperial => Units::Imperial,
            },
            language: match stored.language {
                Locale::Es => Language::Es,
                Locale::En => Language::En,
            },
        })
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
    pub fn demand(&self) -> vantare_ipc::Demand {
        let mut demand = vantare_ipc::Demand::default();
        for instance in self.instances.iter().filter(|instance| instance.visible) {
            demand.union(&instance.settings.demand());
        }
        demand
    }

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
    let root = crate::paths::default_data_dir().map_err(Error::Invalid)?;
    Ok(root.join("Vantare/native/layout.json"))
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

    /// `false` si el fichero no existía al abrirlo (usuario nuevo).
    pub fn exists(&self) -> bool {
        self.bytes.is_some()
    }

    /// Una lectura fallida se reintenta aunque conserve mtime (guardado parcial).
    /// El host deduplica sus errores; nunca se sustituye el último layout válido.
    pub fn poll(&mut self) -> Result<bool, Error> {
        let stamp = modified(&self.path);
        if stamp == self.modified {
            return Ok(false);
        }
        let bytes = read(&self.path)?.ok_or(Error::Invalid("layout desaparecido"))?;
        let layout = Layout::from_json(&bytes)?;
        self.modified = stamp;
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
    fn preferences_are_durable_polled_and_old_layouts_keep_defaults() {
        use vantare_domain::format::{Language, Units};
        let dir = directory();
        let path = dir.join("layout.json");
        fs::write(&path, FIXTURE).expect("layout previo");
        let mut overlay_reader = Document::open(path.clone()).expect("overlays");
        assert_eq!(overlay_reader.layout().preferences, Preferences::default());
        let mut editor = Document::open(path.clone()).expect("Hub");
        let mut layout = editor.layout().clone();
        layout.preferences = Preferences {
            units: Units::Imperial,
            language: Language::En,
        };
        editor.save(&layout).expect("guardar");
        overlay_reader.modified = None;
        assert!(overlay_reader.poll().expect("vigilar"));
        assert_eq!(overlay_reader.layout(), &layout);
        assert_eq!(
            Document::open(path.clone()).expect("reiniciar").layout(),
            &layout
        );
        assert_eq!(
            vantare_domain::format::speed(Some(50.0), overlay_reader.layout().preferences),
            "112 mph"
        );
        for prefs in [
            r#"{"units":"metric","language":"it"}"#,
            r#"{"units":"invalid","language":"es"}"#,
            r#"{"units":"metric","language":"es","extra":true}"#,
        ] {
            assert!(
                Layout::from_json(
                    format!(r#"{{"version":1,"instances":[],"preferences":{prefs}}}"#).as_bytes()
                )
                .is_err()
            );
        }
        fs::remove_dir_all(dir).expect("limpiar");
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
    fn completed_edit_with_the_partial_json_mtime_is_retried() {
        let dir = directory();
        let path = dir.join("layout.json");
        fs::write(&path, FIXTURE).expect("fixture");
        let mut document = Document::open(path.clone()).expect("abrir");
        fs::write(&path, b"").expect("editor trunca antes de escribir");
        let partial_stamp = modified(&path).expect("mtime de la escritura parcial");
        document.modified = None;
        assert!(document.poll().is_err());
        fs::write(&path, b"{\"version\":1,\"instances\":[]}").expect("editor termina");
        OpenOptions::new()
            .write(true)
            .open(&path)
            .expect("abrir para fijar mtime")
            .set_modified(partial_stamp)
            .expect("misma resolución de mtime");
        assert!(document.poll().expect("reintentar la lectura fallida"));
        assert!(document.layout().instances.is_empty());
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
        assert!(document.poll().is_err(), "lectura fallida se reintenta");
        fs::write(&path, b"{\"version\":1,\"instances\":[]}").expect("recuperar");
        document.modified = None;
        assert!(document.poll().expect("recarga"));
        assert!(document.layout().instances.is_empty());
        fs::remove_dir_all(dir).expect("limpiar");
    }
}
