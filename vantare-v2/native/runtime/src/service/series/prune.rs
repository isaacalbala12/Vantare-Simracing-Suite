//! Poda de arranque: sin SQL, sin seguir enlaces y nunca desde adquisición.
use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub(super) const MAX_RECORDINGS: usize = 200;
pub(super) const MAX_BYTES: u64 = 5 * 1024 * 1024 * 1024;
const ORPHAN_MIN_AGE: Duration = Duration::from_secs(10 * 60);
const MAX_PRUNE_ITEMS: usize = 50;

#[derive(Clone, Default, Serialize)]
pub(super) struct Counts {
    pub recordings: usize,
    pub bytes: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Item {
    pub name: String,
    pub size_bytes: u64,
    pub modified_at_ms: u64,
    pub reason: &'static str,
    pub result: &'static str,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PruneReport {
    pub at_ms: u64,
    pub items: Vec<Item>,
    #[serde(skip)]
    pub counts: Counts,
    #[serde(skip)]
    pub quota_unmet: bool,
}
struct Candidate {
    path: PathBuf,
    name: String,
    modified: SystemTime,
    bytes: u64,
    orphan: bool,
}
pub(super) fn millis(time: SystemTime) -> u64 {
    u64::try_from(
        time.duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
    )
    .unwrap_or(u64::MAX)
}
fn database(name: &str) -> bool {
    name.starts_with("series-") && name.ends_with(".duckdb")
}
fn wal(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(".wal");
    name.into()
}
// Rechaza enlaces también dentro de temporales: nunca salir del directorio dueño.
fn files(path: &Path, output: &mut Vec<PathBuf>) -> io::Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() {
        return Err(io::Error::other("enlace omitido"));
    }
    if meta.is_dir() {
        for entry in fs::read_dir(path)? {
            files(&entry?.path(), output)?;
        }
    } else if meta.is_file() {
        output.push(path.to_owned());
    } else {
        return Err(io::Error::other("tipo de fichero no admitido"));
    }
    Ok(())
}
fn size(path: &Path) -> io::Result<u64> {
    let mut paths = Vec::new();
    files(path, &mut paths)?;
    paths.iter().try_fold(0_u64, |total, path| {
        Ok(total.saturating_add(fs::metadata(path)?.len()))
    })
}
fn scan(directory: &Path) -> io::Result<(Vec<Candidate>, Counts)> {
    let mut candidates = Vec::new();
    let mut counts = Counts::default();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        let orphan = name.contains(".creating-");
        let db = database(name) && kind.is_file();
        let is_wal = name.strip_suffix(".wal").is_some_and(database) && kind.is_file();
        if !orphan && !db && !is_wal {
            continue;
        }
        let path = entry.path();
        let bytes = match size(&path) {
            Ok(bytes) => bytes,
            Err(error) => {
                eprintln!("contar grabación {name}: {error}");
                continue;
            }
        };
        counts.bytes = counts.bytes.saturating_add(bytes);
        if db {
            counts.recordings += 1;
        }
        if db || orphan {
            let mut bytes = bytes;
            if db
                && let Ok(meta) = fs::symlink_metadata(wal(&path))
                && meta.is_file()
                && !meta.file_type().is_symlink()
            {
                bytes = bytes.saturating_add(meta.len());
            }
            candidates.push(Candidate {
                path,
                name: name.into(),
                modified: entry.metadata()?.modified()?,
                bytes,
                orphan,
            });
        }
    }
    candidates.sort_by(|a, b| a.modified.cmp(&b.modified).then(a.name.cmp(&b.name)));
    Ok((candidates, counts))
}
fn exclusive(path: &Path) -> io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    #[cfg(not(windows))]
    {
        // No hay una prueba portable de los handles de otros procesos. Fallar
        // cerrado evita borrar una DB abierta fuera del producto Windows.
        let _ = (options, path);
        return Err(io::Error::other(
            "poda exclusiva solo disponible en Windows",
        ));
    }
    #[cfg(windows)]
    options.open(path).map(drop)
}
fn remove(candidate: &Candidate) -> io::Result<()> {
    let mut paths = Vec::new();
    files(&candidate.path, &mut paths)?;
    let wal = wal(&candidate.path);
    if !candidate.orphan && wal.try_exists()? {
        files(&wal, &mut paths)?;
    }
    // Probar DB y WAL antes de borrar cualquiera. Windows impide borrar con
    // nuestro propio share_mode(0), por eso cada prueba cierra su handle.
    for path in paths {
        exclusive(&path)?;
    }
    if candidate.path.is_dir() {
        fs::remove_dir_all(&candidate.path)
    } else {
        fs::remove_file(&candidate.path)?;
        if !candidate.orphan && wal.try_exists()? {
            fs::remove_file(wal)?;
        }
        Ok(())
    }
}
fn record(report: &mut PruneReport, candidate: &Candidate, reason: &'static str) {
    let result = match remove(candidate) {
        Ok(()) => "borrada",
        Err(error) => {
            eprintln!("poda {}: {error}", candidate.name);
            if matches!(error.raw_os_error(), Some(32 | 33)) {
                "omitida en uso"
            } else {
                "error"
            }
        }
    };
    let item = Item {
        name: candidate.name.clone(),
        size_bytes: candidate.bytes,
        modified_at_ms: millis(candidate.modified),
        reason,
        result,
    };
    eprintln!(
        "poda: {} | {} bytes | mtime={} | {} | {}",
        item.name, item.size_bytes, item.modified_at_ms, item.reason, item.result
    );
    if report.items.len() == MAX_PRUNE_ITEMS {
        report.items.remove(0);
    }
    report.items.push(item);
}
pub(super) fn prune(
    directory: &Path,
    now: SystemTime,
    max_recordings: usize,
    max_bytes: u64,
) -> io::Result<PruneReport> {
    let (candidates, _) = scan(directory)?;
    let mut report = PruneReport {
        at_ms: millis(now),
        ..PruneReport::default()
    };
    for candidate in candidates.iter().filter(|item| item.orphan) {
        if now
            .duration_since(candidate.modified)
            .is_ok_and(|age| age > ORPHAN_MIN_AGE)
        {
            record(&mut report, candidate, "huérfano");
        }
    }
    report.counts = scan(directory)?.1;
    for candidate in candidates.iter().filter(|item| !item.orphan) {
        let reason = if report.counts.recordings.saturating_add(1) > max_recordings {
            "cuota de nº"
        } else if report.counts.bytes > max_bytes {
            "cuota de bytes"
        } else {
            break;
        };
        record(&mut report, candidate, reason);
        report.counts = scan(directory)?.1;
    }
    report.quota_unmet = report.counts.recordings.saturating_add(1) > max_recordings
        || report.counts.bytes > max_bytes;
    if report.quota_unmet {
        eprintln!("grabación: cuota no alcanzada; se crea igualmente la nueva DB");
    }
    Ok(report)
}

#[cfg(all(test, windows))]
#[path = "prune_tests.rs"]
mod tests;
