//! Documentos locales acotados, con exclusión del SO y reemplazo atómico.
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

pub const MAX_DOCUMENT: u64 = 5 * 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    Conflict,
    Busy,
    TooLarge,
    EnvironmentFile,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Conflict => {
                f.write_str("conflicto: el documento cambió; cargar antes de guardar")
            }
            Self::Busy => f.write_str("ya hay un guardado en curso"),
            Self::TooLarge => f.write_str("documento demasiado grande"),
            Self::EnvironmentFile => f.write_str("no se admiten archivos de entorno"),
        }
    }
}
impl std::error::Error for Error {}
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
            Error::Conflict => Self::other(error),
            Error::TooLarge | Error::EnvironmentFile => {
                Self::new(io::ErrorKind::InvalidData, error)
            }
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
    File::open(path)?
        .take(limit.saturating_add(1))
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(Error::TooLarge);
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
        return Err(Error::Conflict);
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
        {
            fs::remove_file(entry.path())?;
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
fn persist(
    path: &Path,
    bytes: &[u8],
    mode: Mode<'_>,
    options: &Options,
    before_rename: impl FnOnce() -> io::Result<()>,
) -> Result<(), Error> {
    check_path(path)?;
    if bytes.len() as u64 > options.limit {
        return Err(Error::TooLarge);
    }
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        fs::create_dir_all(parent)?;
    }
    let base = options.sibling_base.as_deref().unwrap_or(path);
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(sibling(base, ".lock"))?;
    match mode {
        Mode::Replace => lock.lock()?,
        Mode::Observed(_) => match lock.try_lock() {
            Ok(()) => {}
            Err(fs::TryLockError::WouldBlock) => return Err(Error::Busy),
            Err(fs::TryLockError::Error(error)) => return Err(error.into()),
        },
    }
    compare(path, mode, options.limit)?;
    clean_orphans(base)?;
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
            Err(error) => return Err(error.into()),
        }
    };
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    if options.backup && path.try_exists()? {
        fs::copy(path, sibling(base, ".bak"))?;
    }
    before_rename()?;
    compare(path, mode, options.limit)?;
    fs::rename(&pending.0, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(matches!(result, Err(Error::Conflict)));
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
            Err(Error::TooLarge)
        ));
        assert!(!path.exists());
        fs::write(&path, b"four").expect("large file");
        assert!(matches!(read(&path, 3), Err(Error::TooLarge)));
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
        let held = OpenOptions::new().read(true).share_mode(0).open(&orphan).expect("deny delete");
        save(&path, b"saved", Mode::Observed(None), &Options::default()).expect("cleanup is best effort");
        assert_eq!(fs::read(&path).expect("published"), b"saved");
        drop(held);
        fs::remove_dir_all(dir).expect("QA cleanup");
    }

}
