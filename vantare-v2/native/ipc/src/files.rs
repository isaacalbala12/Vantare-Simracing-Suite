//! Documentos locales acotados, con exclusión del SO y reemplazo atómico.
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

mod doc;
pub use doc::Doc;

pub const MAX_DOCUMENT: u64 = 5 * 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);

/// Una versión numérica distinta de la conocida se conserva; no es corrupción.
/// Ausencia permite al lector aplicar su contrato histórico de campos por defecto.
pub fn future_version(value: &serde_json::Value, field: &str, current: u64) -> Result<(), Error> {
    if let Some(version) = value.get(field) {
        let Some(version) = version.as_u64() else {
            return Err(Error::InvalidInput(format!(
                "{field} debe ser una versión entera"
            )));
        };
        if version != current {
            return Err(Error::Unsupported(format!(
                "{field} {version} no compatible (actual {current}); original protegido"
            )));
        }
    }
    Ok(())
}

/// Clasificacion estable, independiente del texto mostrado al usuario.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Kind {
    Conflict,
    Busy,
    InvalidInput,
    #[default]
    Local,
}
impl Kind {
    pub const fn is_conflict(self) -> bool {
        matches!(self, Self::Conflict)
    }
}

/// Error visible de UI: clonar el mensaje conserva su clasificacion.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Failure {
    kind: Kind,
    message: String,
}
impl Failure {
    pub fn new(kind: Kind, message: String) -> Self {
        Self { kind, message }
    }
    pub fn kind(&self) -> Kind {
        self.kind
    }
    pub fn as_str(&self) -> &str {
        &self.message
    }
}
impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl From<String> for Failure {
    fn from(message: String) -> Self {
        Self::new(Kind::Local, message)
    }
}
impl From<&str> for Failure {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}
impl From<Failure> for String {
    fn from(failure: Failure) -> Self {
        failure.message
    }
}
impl From<Error> for Failure {
    fn from(error: Error) -> Self {
        Self::new(error.kind(), error.to_string())
    }
}

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    Conflict { path: PathBuf },
    Busy,
    TooLarge { path: PathBuf, limit: u64 },
    EnvironmentFile,
    Message(String),
    InvalidInput(String),
    Unsupported(String),
    ReadTooLarge { path: PathBuf, limit: u64 },
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Message(message) | Self::InvalidInput(message) | Self::Unsupported(message) => {
                f.write_str(message)
            }
            Self::ReadTooLarge { path, limit } => {
                write!(f, "leer {}: supera {limit} bytes", path.display())
            }
            Self::Conflict { path } => write!(
                f,
                "conflicto en {}: el documento cambió; cargar antes de guardar",
                path.display()
            ),
            Self::Busy => f.write_str("ya hay un guardado en curso"),
            Self::TooLarge { path, limit } => {
                write!(f, "guardar {}: supera {limit} bytes", path.display())
            }
            Self::EnvironmentFile => f.write_str("no se admiten archivos de entorno"),
        }
    }
}
impl std::error::Error for Error {}
impl Error {
    pub fn kind(&self) -> Kind {
        match self {
            Self::Conflict { .. } => Kind::Conflict,
            Self::Busy => Kind::Busy,
            Self::InvalidInput(_) | Self::TooLarge { .. } | Self::ReadTooLarge { .. } => {
                Kind::InvalidInput
            }
            Self::Io(error) => error
                .get_ref()
                .and_then(|source| source.downcast_ref::<Self>())
                .map_or(Kind::Local, Self::kind),
            Self::EnvironmentFile | Self::Message(_) | Self::Unsupported(_) => Kind::Local,
        }
    }
}
impl From<String> for Error {
    fn from(message: String) -> Self {
        Self::Message(message)
    }
}
impl From<&str> for Error {
    fn from(message: &str) -> Self {
        Self::Message(message.into())
    }
}
impl From<Error> for String {
    fn from(error: Error) -> Self {
        error.to_string()
    }
}
impl From<io::Error> for Error {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
impl From<Error> for io::Error {
    fn from(error: Error) -> Self {
        match error {
            Error::Io(error) => error,
            Error::Busy => Self::new(io::ErrorKind::WouldBlock, error),
            Error::Unsupported(_) => Self::new(io::ErrorKind::Unsupported, error),
            Error::Conflict { .. } | Error::Message(_) => Self::other(error),
            Error::TooLarge { .. }
            | Error::EnvironmentFile
            | Error::InvalidInput(_)
            | Error::ReadTooLarge { .. } => Self::new(io::ErrorKind::InvalidData, error),
        }
    }
}

#[derive(Clone, Copy)]
pub enum Mode<'a> {
    /// Compara dos veces los bytes observados y rechaza otro escritor activo.
    Observed(Option<&'a [u8]>),
    /// Workshop conserva su contrato: espera al escritor y reemplaza completo.
    Replace,
}
pub struct Options {
    pub limit: u64,
    pub backup: bool,
    /// Conserva hermanos legacy .json.lock/.json.bak para extensiones personalizadas.
    pub sibling_base: Option<PathBuf>,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            limit: MAX_DOCUMENT,
            backup: false,
            sibling_base: None,
        }
    }
}
fn check_path(path: &Path) -> Result<(), Error> {
    if path.components().any(|part| {
        part.as_os_str()
            .to_string_lossy()
            .to_ascii_lowercase()
            .starts_with(".env")
    }) {
        return Err(Error::EnvironmentFile);
    }
    Ok(())
}
fn sibling(base: &Path, suffix: &str) -> PathBuf {
    let mut name = base.as_os_str().to_os_string();
    name.push(suffix);
    name.into()
}
pub fn read(path: &Path, limit: u64) -> Result<Vec<u8>, Error> {
    check_path(path)?;
    let mut bytes = Vec::new();
    let context = |error: io::Error| {
        Error::Io(io::Error::new(
            error.kind(),
            format!("leer {}: {error}", path.display()),
        ))
    };
    File::open(path)
        .map_err(context)?
        .take(limit.saturating_add(1))
        .read_to_end(&mut bytes)
        .map_err(context)?;
    if bytes.len() as u64 > limit {
        return Err(Error::ReadTooLarge {
            path: path.to_owned(),
            limit,
        });
    }
    Ok(bytes)
}
pub fn read_optional(path: &Path, limit: u64) -> Result<Option<Vec<u8>>, Error> {
    match read(path, limit) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(Error::Io(error)) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}
pub fn save(path: &Path, bytes: &[u8], mode: Mode<'_>, options: &Options) -> Result<(), Error> {
    persist(path, bytes, mode, options, || Ok(()))
}
/// Inyección determinista del fallo o edición externa antes del reemplazo.
#[cfg(feature = "test-support")]
pub fn save_with_hook(
    path: &Path,
    bytes: &[u8],
    mode: Mode<'_>,
    options: &Options,
    before_rename: impl FnOnce() -> io::Result<()>,
) -> Result<(), Error> {
    persist(path, bytes, mode, options, before_rename)
}
fn compare(path: &Path, mode: Mode<'_>, limit: u64) -> Result<(), Error> {
    if let Mode::Observed(expected) = mode
        && read_optional(path, limit)?.as_deref() != expected
    {
        return Err(Error::Conflict {
            path: path.to_path_buf(),
        });
    }
    Ok(())
}
fn clean_orphans(base: &Path) -> io::Result<()> {
    let prefix = format!(
        "{}.",
        base.file_name()
            .ok_or_else(|| io::Error::other("ruta sin nombre"))?
            .to_string_lossy()
    );
    let parent = base
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if let Some((pid, sequence)) = name
            .strip_prefix(&prefix)
            .and_then(|s| s.strip_suffix(".tmp"))
            .and_then(|s| s.split_once('.'))
            && pid.parse::<u32>().is_ok()
            && sequence.parse::<u64>().is_ok()
            && entry.file_type()?.is_file()
            && let Err(error) = fs::remove_file(entry.path())
        {
            eprintln!("limpiar temporal {}: {error}", entry.path().display());
        }
    }
    Ok(())
}
struct Pending(PathBuf);
impl Drop for Pending {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn write_context(path: &Path, action: &str, error: &io::Error) -> Error {
    Error::Io(io::Error::new(
        error.kind(),
        format!("{action} {}: {error}", path.display()),
    ))
}
fn persist(
    path: &Path,
    bytes: &[u8],
    mode: Mode<'_>,
    options: &Options,
    before_rename: impl FnOnce() -> io::Result<()>,
) -> Result<(), Error> {
    check_path(path)?;
    if bytes.len() as u64 > options.limit {
        return Err(Error::TooLarge {
            path: path.to_owned(),
            limit: options.limit,
        });
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent).map_err(|e| write_context(path, "crear carpeta para", &e))?;
    }
    let base = options.sibling_base.as_deref().unwrap_or(path);
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(sibling(base, ".lock"))
        .map_err(|e| write_context(path, "crear bloqueo para", &e))?;
    match mode {
        Mode::Replace => lock
            .lock()
            .map_err(|e| write_context(path, "bloquear", &e))?,
        Mode::Observed(_) => match lock.try_lock() {
            Ok(()) => {}
            Err(fs::TryLockError::WouldBlock) => return Err(Error::Busy),
            Err(fs::TryLockError::Error(error)) => {
                return Err(write_context(path, "bloquear", &error));
            }
        },
    }
    compare(path, mode, options.limit)?;
    if let Err(error) = clean_orphans(base) {
        eprintln!(
            "limpiar temporales de {}: {error}; el guardado continua",
            base.display()
        );
    }
    let (pending, mut file) = loop {
        let temporary = sibling(
            base,
            &format!(
                ".{}.{}.tmp",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ),
        );
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => break (Pending(temporary), file),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(write_context(path, "crear temporal para", &error)),
        }
    };
    file.write_all(bytes)
        .map_err(|e| write_context(path, "escribir", &e))?;
    file.sync_all()
        .map_err(|e| write_context(path, "sincronizar", &e))?;
    drop(file);
    if options.backup
        && path
            .try_exists()
            .map_err(|e| write_context(path, "inspeccionar", &e))?
    {
        fs::copy(path, sibling(base, ".bak"))
            .map_err(|e| write_context(path, "copiar respaldo de", &e))?;
    }
    before_rename().map_err(|e| write_context(path, "preparar reemplazo de", &e))?;
    compare(path, mode, options.limit)?;
    fs::rename(&pending.0, path).map_err(|e| write_context(path, "reemplazar", &e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn step6_versions_keep_unknown_documents_and_reject_invalid_tags() {
        assert!(future_version(&serde_json::json!({}), "version", 1).is_ok());
        assert!(future_version(&serde_json::json!({"version":1}), "version", 1).is_ok());
        for version in [0, 2, 99] {
            assert!(matches!(
                future_version(&serde_json::json!({"version":version}), "version", 1),
                Err(Error::Unsupported(_))
            ));
        }
        assert!(matches!(
            future_version(&serde_json::json!({"version":"1"}), "version", 1),
            Err(Error::InvalidInput(_))
        ));
    }

    #[test]
    fn step6_cas_diagnostic_identifies_the_failed_document() {
        let path =
            std::env::temp_dir().join(format!("vantare-step6-cas-{}.json", std::process::id()));
        std::fs::write(&path, b"old").unwrap();
        let result = save(&path, b"new", Mode::Observed(None), &Options::default()).unwrap_err();
        assert!(result.kind().is_conflict());
        assert!(result.to_string().contains(&path.display().to_string()));
        assert_eq!(std::fs::read(&path).unwrap(), b"old");
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn step5_busy_does_not_offer_destructive_conflict_recovery() {
        assert!(!Error::Busy.kind().is_conflict());
        assert!(
            Error::Conflict {
                path: PathBuf::from("test.json")
            }
            .kind()
            .is_conflict()
        );
    }

    #[test]
    fn step5_write_diagnostics_include_destination_and_limit() {
        let dir = directory();
        let path = dir.join("document.json");
        let error = save(
            &path,
            b"four",
            Mode::Replace,
            &Options {
                limit: 3,
                ..Options::default()
            },
        )
        .expect_err("oversize");
        assert!(error.to_string().contains(&path.display().to_string()));
        assert!(
            matches!(&error, Error::TooLarge { path: reported, limit: 3 } if reported == &path)
        );
        assert!(error.to_string().contains("supera 3 bytes"));
        fs::write(dir.join("file"), b"parent is not a directory").unwrap();
        let blocked = dir.join("file/document.json");
        let error = save(&blocked, b"x", Mode::Replace, &Options::default()).unwrap_err();
        assert!(error.to_string().contains(&blocked.display().to_string()));
        fs::remove_dir_all(dir).unwrap();
    }

    fn directory() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "vantare-writer-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).expect("QA directory");
        path
    }

    #[test]
    fn failed_or_conflicting_replacements_preserve_the_original_and_backup() {
        let dir = directory();
        let path = dir.join("layout.json");
        let options = Options {
            backup: true,
            ..Options::default()
        };
        save(&path, b"old", Mode::Observed(None), &options).expect("create");
        let result = persist(
            &path,
            b"new",
            Mode::Observed(Some(b"old")),
            &options,
            || Err(io::Error::other("injected failure")),
        );
        assert!(matches!(result, Err(Error::Io(_))));
        assert_eq!(fs::read(&path).expect("original"), b"old");
        assert_eq!(fs::read(sibling(&path, ".bak")).expect("backup"), b"old");
        let result = persist(
            &path,
            b"new",
            Mode::Observed(Some(b"old")),
            &options,
            || fs::write(&path, b"external"),
        );
        assert!(matches!(result, Err(Error::Conflict { .. })));
        assert_eq!(fs::read(&path).expect("external edit"), b"external");
        assert!(!fs::read_dir(&dir).expect("entries").any(|entry| {
            entry
                .expect("entry")
                .path()
                .extension()
                .is_some_and(|ext| ext == "tmp")
        }));
        fs::remove_dir_all(dir).expect("QA cleanup");
    }

    #[test]
    fn cleans_only_numeric_protocol_orphans_under_the_document_lock() {
        let dir = directory();
        let path = dir.join("document.json");
        let orphan = sibling(&path, ".123.4.tmp");
        let foreign = sibling(&path, ".user.tmp");
        let other = dir.join("another.json.123.4.tmp");
        for temp in [&orphan, &foreign, &other] {
            fs::write(temp, b"temporary").expect("seed");
        }
        save(&path, b"one", Mode::Observed(None), &Options::default()).expect("save");
        assert!(!orphan.exists());
        for temp in [&foreign, &other] {
            assert_eq!(fs::read(temp).expect("unrelated retained"), b"temporary");
        }
        assert!(!sibling(&path, ".bak").exists());
        let lock = OpenOptions::new()
            .write(true)
            .open(sibling(&path, ".lock"))
            .expect("lock");
        lock.try_lock().expect("hold lock");
        assert!(matches!(
            save(
                &path,
                b"two",
                Mode::Observed(Some(b"one")),
                &Options::default()
            ),
            Err(Error::Busy)
        ));
        assert_eq!(fs::read(&path).expect("preserved"), b"one");
        drop(lock);
        fs::remove_dir_all(dir).expect("QA cleanup");
    }

    #[test]
    fn bounds_reads_and_writes_and_rejects_environment_files_before_io() {
        let dir = directory();
        let path = dir.join("bounded.json");
        let options = Options {
            limit: 3,
            ..Options::default()
        };
        assert!(matches!(
            save(&path, b"four", Mode::Observed(None), &options),
            Err(Error::TooLarge { .. })
        ));
        assert!(!path.exists());
        fs::write(&path, b"four").expect("large file");
        assert!(matches!(read(&path, 3), Err(Error::ReadTooLarge { .. })));
        let environment = dir.join(".env.local");
        assert!(matches!(read(&environment, 3), Err(Error::EnvironmentFile)));
        assert!(matches!(
            save(&environment, b"x", Mode::Replace, &options),
            Err(Error::EnvironmentFile)
        ));
        assert!(!environment.exists());
        fs::remove_dir_all(dir).expect("QA cleanup");
    }
    #[cfg(windows)]
    #[test]
    fn review_undeletable_orphan_does_not_prevent_a_save() {
        use std::os::windows::fs::OpenOptionsExt as _;
        let dir = directory();
        let path = dir.join("document.json");
        let orphan = sibling(&path, ".123.4.tmp");
        fs::write(&orphan, b"held orphan").expect("seed orphan");
        let held = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&orphan)
            .expect("deny delete");
        save(&path, b"saved", Mode::Observed(None), &Options::default())
            .expect("cleanup is best effort");
        assert_eq!(fs::read(&path).expect("published"), b"saved");
        drop(held);
        fs::remove_dir_all(dir).expect("QA cleanup");
    }
}
