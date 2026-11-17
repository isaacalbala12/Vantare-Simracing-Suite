use super::prune::{MAX_BYTES, MAX_RECORDINGS, PruneReport};
use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

fn temporary(directory: &Path, prefix: &str) -> io::Result<(PathBuf, fs::File)> {
    loop {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(io::Error::other)?
            .as_nanos();
        let path = directory.join(format!("{prefix}.{}-{nanos}.tmp", std::process::id()));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
}
pub(super) fn clean_temporary(directory: &Path) {
    let result = (|| -> io::Result<()> {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            let parsed = name
                .strip_prefix("recording-status.")
                .and_then(|name| name.strip_suffix(".tmp"))
                .or_else(|| {
                    name.strip_prefix("recording-volume.").and_then(|name| {
                        name.strip_suffix(".tmp")
                            .or_else(|| name.strip_suffix(".link"))
                    })
                });
            if parsed.is_some_and(super::prune::numeric_pair)
                && std::time::SystemTime::now()
                    .duration_since(entry.metadata()?.modified()?)
                    .is_ok_and(|age| age > Duration::from_mins(10))
                && let Err(error) = super::prune::exclusive(&entry.path(), true)
            {
                eprintln!("limpiar temporal de grabación: {error}");
            }
        }
        Ok(())
    })();
    if let Err(error) = result {
        eprintln!("barrer temporales de grabación: {error}");
    }
}
// Los lectores deben abrir recording-status.json con FILE_SHARE_DELETE.
// Tres intentos totales; solo se ejecuta en arranque, cierre o hilo de degradación.
fn replace(source: &Path, target: &Path) -> io::Result<()> {
    for attempt in 0..3 {
        match fs::rename(source, target) {
            Ok(()) => return Ok(()),
            Err(error) if attempt < 2 && matches!(error.raw_os_error(), Some(5 | 32 | 33)) => {
                std::thread::sleep(Duration::from_millis(2));
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("tres intentos retornan")
}

/// G1 publica con hard links: NTFS/ReFS, no volúmenes que no los admitan.
pub(super) fn validate_volume(directory: &Path) -> io::Result<()> {
    let (source, file) = temporary(directory, "recording-volume")?;
    let target = source.with_extension("link");
    drop(file);
    let result = fs::hard_link(&source, &target);
    let cleanup = if result.is_ok() {
        vec![&target, &source]
    } else {
        vec![&source]
    };
    for path in cleanup {
        if let Err(error) = fs::remove_file(path)
            && error.kind() != io::ErrorKind::NotFound
        {
            eprintln!("limpiar prueba de volumen: {error}");
        }
    }
    result
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Status {
    schema: &'static str,
    pub state: &'static str,
    pub file: Option<String>,
    started_at_ms: u64,
    pub cause: Option<&'static str>,
    pub durable_watermark: Option<String>,
    pub attempted: Option<String>,
    limits: Limits,
    counts: super::prune::Counts,
    last_prune: PruneReport,
    #[serde(skip)]
    directory: PathBuf,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Limits {
    max_recordings: usize,
    max_bytes: u64,
}
impl Status {
    pub fn new(directory: &Path, epoch: u64, report: PruneReport) -> Self {
        Self {
            schema: "vantare.recording-status.v1",
            state: "recording",
            file: None,
            started_at_ms: epoch,
            cause: None,
            durable_watermark: None,
            attempted: None,
            limits: Limits {
                max_recordings: MAX_RECORDINGS,
                max_bytes: MAX_BYTES,
            },
            counts: report.counts.clone(),
            last_prune: report,
            directory: directory.into(),
        }
    }
    pub fn write(&self) {
        self.write_with_gate(None);
    }
    pub fn write_with_gate(&self, gate: Option<&Mutex<bool>>) {
        if let Err(error) = self.persist(gate) {
            eprintln!("escribir estado de grabación: {error}");
        }
    }
    // El hilo lento prepara el temporal sin bloquear al Core ni al cierre.
    // Solo el rename comparte la guarda: un hilo abandonado no publica después
    // de stopped. Finish cancela bajo esa misma guarda antes de escribir.
    pub fn persist(&self, cancelled: Option<&Mutex<bool>>) -> io::Result<()> {
        let path = self.directory.join("recording-status.json");
        let (temporary, mut file) = temporary(&self.directory, "recording-status")?;
        let result = (|| {
            file.write_all(&serde_json::to_vec(self)?)?;
            file.sync_all()?;
            drop(file);
            let mut guard = cancelled.map(|gate| {
                gate.lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner)
            });
            if self.state == "stopped" {
                if let Some(cancelled) = guard.as_mut() {
                    **cancelled = true;
                }
            } else if guard.as_ref().is_some_and(|cancelled| **cancelled) {
                return Ok(());
            }
            replace(&temporary, &path)
        })();
        if let Err(error) = fs::remove_file(&temporary)
            && error.kind() != io::ErrorKind::NotFound
        {
            eprintln!("limpiar temporal de estado: {error}");
        }
        result
    }
}

pub(super) struct PendingStatus {
    task: std::thread::JoinHandle<()>,
    cancelled: Arc<Mutex<bool>>,
}
impl PendingStatus {
    pub fn spawn(
        status: Status,
        before_write: Option<std::sync::mpsc::Receiver<()>>,
    ) -> io::Result<Self> {
        let cancelled = Arc::new(Mutex::new(false));
        let gate = cancelled.clone();
        let task = std::thread::Builder::new()
            .name("series-status-degraded".into())
            .spawn(move || {
                if let Some(release) = before_write {
                    let _ = release.recv();
                }
                if let Err(error) = status.persist(Some(&gate)) {
                    eprintln!("escribir degradación de grabación: {error}");
                }
            })?;
        Ok(Self { task, cancelled })
    }
    pub fn finish(self) -> Arc<Mutex<bool>> {
        const JOIN_TIMEOUT: Duration = Duration::from_millis(100);
        let deadline = std::time::Instant::now() + JOIN_TIMEOUT;
        while !self.task.is_finished() && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(1));
        }
        if self.task.is_finished() {
            if self.task.join().is_err() {
                eprintln!("hilo de estado de grabación terminó con panic");
            }
        } else {
            eprintln!("hilo de estado de grabación excedió plazo; se abandona sin publicar");
        }
        self.cancelled
    }
}

#[cfg(test)]
#[path = "status_tests.rs"]
mod tests;
