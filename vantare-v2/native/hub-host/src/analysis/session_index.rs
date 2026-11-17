//! Índice propiedad del worker del Calendario; ninguna instancia global ni DB simultáneas.
use super::{
    Cancel, ErrorCode, Reader, Result, SessionSummary, error, invalid, recordings, reparse, stamp,
};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::atomic::Ordering,
    time::{Duration, Instant, SystemTime},
};

#[derive(Clone, Debug, PartialEq)]
pub struct RecordingSessions {
    pub file_name: String,
    pub size: u64,
    pub modified: SystemTime,
    pub sessions: Vec<SessionSummary>,
    pub readable: bool,
    pub locked: bool,
}
#[derive(Default)]
pub struct SessionIndex {
    directory: Option<PathBuf>,
    cache: BTreeMap<String, RecordingSessions>,
}
impl SessionIndex {
    /// Secuencial mediante &mut self. Ejecutar fuera del hilo del puente.
    /// Un solo presupuesto de 30 s incluye catálogo, aperturas y lecturas.
    pub fn refresh(
        &mut self,
        exe: &Path,
        dir: &Path,
        cancel: Cancel,
    ) -> Result<Vec<RecordingSessions>> {
        let deadline = Instant::now() + Duration::from_secs(30);
        check(&cancel, deadline)?;
        let paths = recordings(dir)?;
        check(&cancel, deadline)?;
        if paths.is_empty() {
            self.cache.clear();
            self.directory = None;
            return Ok(Vec::new());
        }
        let directory = fs::canonicalize(dir).map_err(|e| error(ErrorCode::Io, e.to_string()))?;
        let same_directory = self.directory.as_ref() == Some(&directory);
        let mut cache = BTreeMap::new();
        let mut results = Vec::with_capacity(paths.len());
        for path in paths {
            check(&cancel, deadline)?;
            let original = stamp(&path)?;
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .filter(|name| !name.contains(['/', '\\', ':']))
                .ok_or_else(|| invalid("Nombre de grabación inválido"))?
                .to_owned();
            if same_directory
                && let Some(cached) = self.cache.get(&name)
                && cached.size == original.len
                && cached.modified == original.modified
                && cache_unlocked(&path)
            {
                results.push(cached.clone());
                cache.insert(name, cached.clone());
                continue;
            }
            let mut row = RecordingSessions {
                file_name: name.clone(),
                size: original.len,
                modified: original.modified,
                sessions: Vec::new(),
                readable: false,
                locked: false,
            };
            let mut cacheable = false;
            let read = (|| {
                check(&cancel, deadline)?;
                let mut reader = Reader::open_with_timeout(
                    exe,
                    &path,
                    cancel.clone(),
                    deadline.saturating_duration_since(Instant::now()),
                )?;
                let sessions = reader.sessions_until(deadline)?;
                if stamp(&path)? != original {
                    return Err(error(
                        ErrorCode::Changed,
                        "Grabación cambiada durante el índice",
                    ));
                }
                row.sessions = sessions;
                cacheable = reader.summary.finished;
                row.readable = true;
                Ok(())
            })();
            if let Err(failure) = read {
                match failure.code {
                    ErrorCode::Cancelled | ErrorCode::Deadline | ErrorCode::Io => {
                        return Err(failure);
                    }
                    ErrorCode::Locked => row.locked = true,
                    _ => {}
                }
            }
            if cacheable {
                cache.insert(name, row.clone());
            }
            results.push(row);
        }
        check(&cancel, deadline)?;
        self.directory = Some(directory);
        self.cache = cache;
        drop(cancel); // El token es propiedad de este trabajo, no de la caché.
        Ok(results)
    }
}
fn check(cancel: &Cancel, deadline: Instant) -> Result<()> {
    if cancel.load(Ordering::Acquire) {
        return Err(error(ErrorCode::Cancelled, "Índice cancelado"));
    }
    if Instant::now() >= deadline {
        return Err(error(ErrorCode::Deadline, "Plazo del índice agotado"));
    }
    Ok(())
}
fn cache_unlocked(path: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Denegar escritura detecta también un writer recién abierto sin cambios
        // en el fichero principal (sus commits pueden estar aún en el WAL).
        fs::OpenOptions::new()
            .read(true)
            .share_mode(
                windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ
                    | windows_sys::Win32::Storage::FileSystem::FILE_SHARE_DELETE,
            )
            .custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT)
            .open(path)
            .and_then(|file| file.metadata())
            .is_ok_and(|m| m.is_file() && !reparse(&m))
    }
    #[cfg(not(windows))]
    {
        // El host productivo es Windows. Sin una prueba de exclusión equivalente,
        // conservar corrección consultando de nuevo al helper.
        let _ = path;
        false
    }
}
