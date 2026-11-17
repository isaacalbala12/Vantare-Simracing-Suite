//! Propietario de una grabación por arranque, fuera del camino de adquisición.
use crate::core::Core;
use crate::flows::{SeriesWorker, SessionTracker};
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use vantare_domain::Adapter;
mod prune;
mod status;
use status::{PendingStatus, Status};
#[cfg(all(test, windows))]
#[path = "series/measurement_tests.rs"]
mod measurement_tests;
#[cfg(all(test, windows))]
#[path = "series/recording_tests.rs"]
mod recording_tests;

const SERIES_QUEUE: usize = 32;
/// Dentro de los 3 s del supervisor y los 4 s del watchdog del Core.
#[cfg(not(test))]
const SERIES_FINISH_TIMEOUT: Duration = Duration::from_secs(1);
// Solo el arnés unitario amplía el plazo; el producto conserva 1 s.
#[cfg(test)]
const SERIES_FINISH_TIMEOUT: Duration = session_capture_tests::FINISH_TIMEOUT;
#[cfg(test)]
#[path = "series/session_capture_tests.rs"]
mod session_capture_tests;

pub struct SeriesRecording {
    worker: Option<SeriesWorker>,
    tracker: SessionTracker,
    failed: bool,
    status: Option<Status>,
    pending_status: Option<PendingStatus>,
}

impl SeriesRecording {
    /// Todo fallo de arranque degrada solo la grabación, nunca el núcleo.
    pub fn start(
        core: &mut Core,
        directory: Option<&Path>,
        epoch: u64,
        helper: impl FnOnce() -> std::io::Result<std::path::PathBuf>,
    ) -> Self {
        let mut recording = Self {
            worker: None,
            tracker: SessionTracker::default(),
            failed: false,
            status: None,
            pending_status: None,
        };
        if let Some(directory) = directory {
            let mut status = Status::new(directory, epoch, prune::PruneReport::default());
            let mut cause = "directorio inválido";
            let result = (|| {
                std::fs::create_dir_all(directory)?;
                status::clean_temporary(directory);
                match prune::prune(
                    directory,
                    std::time::SystemTime::now(),
                    prune::MAX_RECORDINGS,
                    prune::MAX_BYTES,
                ) {
                    Ok(report) => {
                        let quota_unmet = report.quota_unmet;
                        status = Status::new(directory, epoch, report);
                        if quota_unmet {
                            status.state = "degraded";
                            status.cause = Some("cuota no alcanzada");
                        }
                    }
                    Err(error) => {
                        eprintln!("poda de grabaciones: {error}; el arranque continúa");
                        status.state = "degraded";
                        status.cause = Some("poda incompleta");
                    }
                }
                cause = "helper ausente";
                let helper = helper()?;
                cause = "volumen sin enlaces duros (NTFS/ReFS)";
                status::validate_volume(directory)?;
                cause = "directorio inválido";
                let mut path =
                    directory.join(format!("series-{epoch}-{}.duckdb", std::process::id()));
                while path.try_exists()? || prune::wal(&path).try_exists()? {
                    let suffix = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(std::io::Error::other)?
                        .as_nanos();
                    path = directory.join(format!("series-{suffix}-{}.duckdb", std::process::id()));
                }
                cause = "writer caído";
                let receiver = core.series_mut().subscribe(SERIES_QUEUE)?;
                cause = "helper ausente";
                let worker = SeriesWorker::start_new(&helper, &path, receiver)?;
                status.file = path
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned());
                Ok::<_, std::io::Error>(worker)
            })();
            match result {
                Ok(worker) => recording.worker = Some(worker),
                Err(error) => {
                    eprintln!("grabación de series desactivada: {error}");
                    recording.failed = true;
                    status.state = "degraded";
                    status.cause = Some(cause);
                }
            }
            status.write();
            recording.status = Some(status);
        }
        recording
    }

    fn check(&mut self, core: &Core) {
        self.check_with_delay(core, None);
        if !self.failed
            && let Some(worker) = &self.worker
            && worker.session_events_enabled()
        {
            for event in self.tracker.observe(&core.snapshot(), wall_ms()) {
                worker.try_session_event(event);
            }
        }
    }
    fn check_with_delay(&mut self, core: &Core, delay: Option<std::sync::mpsc::Receiver<()>>) {
        if !self.failed
            && self.worker.as_ref().is_some_and(|worker| {
                worker.failed()
                    || core
                        .series()
                        .publication_status()
                        .is_some_and(|status| status.disconnected)
            })
        {
            eprintln!("grabación de series terminada: writer desconectado");
            self.failed = true;
            if let Some(status) = self.status.as_mut() {
                status.file = self.worker.as_ref().and_then(|worker| {
                    worker
                        .database
                        .load_full()
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                });
                status.state = "degraded";
                status.cause = Some("writer caído");
                let pending = PendingStatus::spawn(status.clone(), delay);
                match pending {
                    Ok(task) => self.pending_status = Some(task),
                    Err(error) => eprintln!("arrancar hilo de estado: {error}"),
                }
            }
        }
    }

    fn finish(mut self, core: &mut Core) {
        // El bucle ya no llama al adaptador. Core conserva el sender hasta terminar finish.
        self.check_with_delay(core, None);
        if !self.failed
            && let Some(worker) = &self.worker
            && worker.session_events_enabled()
        {
            for event in self.tracker.finish(wall_ms()) {
                worker.try_session_event(event);
            }
        }
        core.series_mut().flush();
        if let Some(worker) = self.worker.take() {
            let database = worker.database.clone();
            let attempted = core
                .series()
                .publication_status()
                .map_or(0, |status| status.attempted);
            if let Some(status) = self.status.as_mut() {
                status.attempted = Some(attempted.to_string());
                status.durable_watermark = Some(worker.watermark().to_string());
            }
            if self.failed {
                drop(worker);
            } else {
                match worker.finish(attempted, SERIES_FINISH_TIMEOUT) {
                    Ok((state, _)) => {
                        if let Some(status) = self.status.as_mut() {
                            status.durable_watermark = Some(state.watermark.to_string());
                            status.attempted = Some(state.attempted.to_string());
                        }
                    }
                    Err(error) => {
                        eprintln!("cierre de grabación de series: {error}");
                        if let Some(status) = self.status.as_mut() {
                            status.cause = Some(if error.kind() == std::io::ErrorKind::TimedOut {
                                "finish vencido"
                            } else {
                                "writer caído"
                            });
                        }
                    }
                }
            }
            if let Some(status) = self.status.as_mut() {
                status.file = database
                    .load_full()
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned());
            }
        }
        let gate = self.pending_status.take().map(PendingStatus::finish);
        if let Some(status) = self.status.as_mut() {
            status.state = "stopped";
            status.write_with_gate(gate.as_deref());
        }
    }
}

fn wall_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .and_then(|time| u64::try_from(time.as_millis()).ok())
        .unwrap_or(0)
}

/// Mismo bucle y resultado; el cierre se ejecuta también tras error de publicación.
#[allow(clippy::too_many_arguments)]
pub fn drive_core_recorded(
    core: &mut Core,
    adapter: &mut dyn Adapter,
    speed: f64,
    stop: &AtomicBool,
    demand: Option<&vantare_ipc::DemandSource>,
    mut recording: SeriesRecording,
    mut publish: impl FnMut(&Core) -> Result<(), vantare_ipc::Error>,
) -> Result<(), vantare_ipc::Error> {
    let result = super::drive_core_demanded(core, adapter, speed, stop, demand, |core| {
        recording.check(core);
        publish(core)
    });
    recording.finish(core);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_recording_never_resolves_the_helper() {
        let mut core = Core::new(1);
        let recording = SeriesRecording::start(&mut core, None, 1, || {
            panic!("sin series-dir no se debe resolver el helper")
        });
        assert!(recording.worker.is_none());
        assert!(!recording.failed);
        assert!(recording.status.is_none());
        assert!(recording.pending_status.is_none());
        assert!(core.series().publication_status().is_none());
    }

    #[test]
    fn helper_resolution_failure_only_disables_recording() {
        let mut core = Core::new(1);
        let directory =
            std::env::temp_dir().join(format!("series-no-helper-{}", std::process::id()));
        let recording = SeriesRecording::start(&mut core, Some(&directory), 1, || {
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "ejecutable no disponible",
            ))
        });
        assert!(recording.worker.is_none());
        assert!(recording.failed);
        let status: serde_json::Value = serde_json::from_slice(
            &std::fs::read(directory.join("recording-status.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(status["state"], "degraded");
        assert_eq!(status["cause"], "helper ausente");
        assert!(status["file"].is_null());
        assert!(status["lastPrune"]["atMs"].as_u64().unwrap() > 0);
        core.observe(vantare_domain::Observation::default())
            .expect("Core sigue vivo");
        assert_eq!(core.snapshot().sequence, 1);
        recording.finish(&mut core);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
