//! Apertura recuperable: nunca se reemplazan bytes dañados sin una copia durable.
use super::{Error, Mode, Options, compare, read_optional, sibling, write_context};
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};

pub struct Doc<T> {
    pub value: T,
    /// Bytes que el siguiente guardado debe comprobar, incluidos los dañados archivados.
    pub observed: Option<Vec<u8>>,
    pub warning: Option<String>,
}
impl<T> Doc<T> {
    pub fn open_or_quarantine(
        path: &Path,
        options: &Options,
        parse: impl FnOnce(&[u8]) -> Result<T, Error>,
        defaults: impl Fn() -> T,
    ) -> Self {
        let fallback = |warning: Option<String>| Self {
            value: defaults(),
            observed: None,
            warning,
        };
        let bytes = match read_optional(path, options.limit) {
            Ok(Some(bytes)) => bytes,
            Ok(None) => return fallback(None),
            Err(error) => return fallback(Some(error.to_string())),
        };
        match parse(&bytes) {
            Ok(value) => Self {
                value,
                observed: Some(bytes),
                warning: None,
            },
            // Versiones futuras y fallos de E/S quedan intactos y no se pueden sobrescribir.
            Err(error @ (Error::Io(_) | Error::Unsupported(_))) => {
                fallback(Some(format!("{}: {error}", path.display())))
            }
            Err(error) => match quarantine(path, &bytes, options) {
                Ok(archive) => Self {
                    value: defaults(),
                    observed: Some(bytes),
                    warning: Some(format!(
                        "{}: {error}. Copia conservada en {}",
                        path.display(),
                        archive.display()
                    )),
                },
                Err(copy_error) => fallback(Some(format!(
                    "{}: {error}; no se pudo conservar copia: {copy_error}. El original queda protegido.",
                    path.display()
                ))),
            },
        }
    }
}

fn archive_matches(path: &Path, bytes: &[u8], limit: u64) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
        && read_optional(path, limit).ok().flatten().as_deref() == Some(bytes)
}
fn quarantine(path: &Path, bytes: &[u8], options: &Options) -> Result<PathBuf, Error> {
    let base = options.sibling_base.as_deref().unwrap_or(path);
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(sibling(base, ".lock"))
        .map_err(|e| write_context(path, "crear bloqueo para", &e))?;
    match lock.try_lock() {
        Ok(()) => {}
        Err(std::fs::TryLockError::WouldBlock) => return Err(Error::Busy),
        Err(std::fs::TryLockError::Error(error)) => {
            return Err(write_context(path, "bloquear", &error));
        }
    }
    compare(path, Mode::Observed(Some(bytes)), options.limit)?;
    let first = sibling(path, ".invalid");
    if archive_matches(&first, bytes, options.limit) {
        return Ok(first);
    }
    let mut archive = first;
    let mut sequence = 0_u64;
    loop {
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&archive)
        {
            Ok(mut file) => {
                let result = file.write_all(bytes).and_then(|()| file.sync_all());
                drop(file);
                if let Err(error) = result {
                    let _ = std::fs::remove_file(&archive);
                    return Err(write_context(
                        &archive,
                        "conservar documento dañado en",
                        &error,
                    ));
                }
                return Ok(archive);
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                if archive_matches(&archive, bytes, options.limit) {
                    return Ok(archive);
                }
                sequence += 1;
                archive = sibling(path, &format!(".{sequence}.invalid"));
            }
            Err(error) => {
                return Err(write_context(
                    &archive,
                    "crear copia del documento dañado en",
                    &error,
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::files::{Kind, save};
    fn directory(label: &str) -> PathBuf {
        let path =
            std::env::temp_dir().join(format!("vantare-quarantine-{label}-{}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }
    fn broken(_: &[u8]) -> Result<Vec<u8>, Error> {
        Err(Error::InvalidInput("invalid fixture".into()))
    }
    #[test]
    fn step5_quarantine_is_exact_idempotent_and_keeps_original_until_cas_save() {
        let root = directory("cas");
        let path = root.join("settings.json");
        let options = Options::default();
        std::fs::write(&path, b"{ damaged \xff").unwrap();
        std::fs::write(sibling(&path, ".invalid"), b"older corruption").unwrap();
        for _ in 0..2 {
            let opened = Doc::open_or_quarantine(&path, &options, broken, Vec::new);
            assert!(opened.value.is_empty());
            assert!(opened.warning.unwrap().contains(".1.invalid"));
            assert_eq!(
                opened.observed.as_deref(),
                Some(b"{ damaged \xff".as_slice())
            );
            assert_eq!(std::fs::read(&path).unwrap(), b"{ damaged \xff");
        }
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 4); // original, lock, two archives
        assert_eq!(
            std::fs::read(sibling(&path, ".invalid")).unwrap(),
            b"older corruption"
        );
        assert_eq!(
            std::fs::read(sibling(&path, ".1.invalid")).unwrap(),
            b"{ damaged \xff"
        );
        let opened = Doc::open_or_quarantine(&path, &options, broken, Vec::new);
        std::fs::write(&path, b"external").unwrap();
        let error = save(
            &path,
            b"new",
            Mode::Observed(opened.observed.as_deref()),
            &options,
        )
        .unwrap_err();
        assert_eq!(error.kind(), Kind::Conflict);
        assert_eq!(std::fs::read(&path).unwrap(), b"external");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn step5_unknown_version_read_errors_and_busy_archive_never_enable_overwrite() {
        let root = directory("protected");
        let path = root.join("settings.json");
        let options = Options {
            limit: 4,
            ..Default::default()
        };
        std::fs::write(&path, b"v99").unwrap();
        let opened = Doc::open_or_quarantine(
            &path,
            &options,
            |_| {
                Err::<Vec<u8>, _>(
                    std::io::Error::new(std::io::ErrorKind::Unsupported, "future version").into(),
                )
            },
            Vec::new,
        );
        assert!(opened.warning.is_some());
        assert!(opened.observed.is_none());
        assert!(!sibling(&path, ".invalid").exists());
        assert!(
            save(
                &path,
                b"new",
                Mode::Observed(opened.observed.as_deref()),
                &options
            )
            .is_err()
        );
        let lock = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(sibling(&path, ".lock"))
            .unwrap();
        lock.try_lock().unwrap();
        let opened = Doc::open_or_quarantine(&path, &options, broken, Vec::new);
        assert!(opened.warning.is_some());
        assert!(opened.observed.is_none());
        drop(lock);
        assert!(
            save(
                &path,
                b"new",
                Mode::Observed(opened.observed.as_deref()),
                &options
            )
            .is_err()
        );
        std::fs::write(&path, b"oversized").unwrap();
        let opened = Doc::open_or_quarantine(&path, &options, broken, Vec::new);
        assert!(opened.warning.is_some());
        assert!(opened.observed.is_none());
        assert!(!sibling(&path, ".invalid").exists());
        assert_eq!(std::fs::read(&path).unwrap(), b"oversized");
        let forbidden = root.join(".env.local");
        let opened = Doc::open_or_quarantine(&forbidden, &options, broken, Vec::new);
        assert!(opened.warning.is_some());
        assert!(!forbidden.exists());
        std::fs::remove_dir_all(root).unwrap();
    }
}
