//! Propietario de una grabación por arranque, fuera del camino de adquisición.
use crate::core::Core;
use crate::flows::{
    CloseLimits, Closed, SeriesClose, SeriesStorageState, SeriesWorker, SessionTracker,
};
use std::path::Path;
use std::sync::atomic::AtomicBool;
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
/// #2871: se espera a storage mientras avance (10 s sin progreso, 30 s en
/// total). El cierre de la app o de Windows puede matar antes al Core (3 s del
/// supervisor, 4 s de su propio plazo): lo confirmado sigue en la base y el
/// anfitrión muestra esa grabación como parada sin causa, nunca como error.
const SERIES_CLOSE_LIMITS: CloseLimits = CloseLimits::PRODUCT;
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
            // ADR 0111 T2b: el supervisor reinicia el núcleo con los mismos
            // argumentos, así que el propio núcleo nunca usa una carpeta que sea
            // un enlace, una unión o un archivo: ni escribe, ni poda, ni lee.
            if std::fs::symlink_metadata(directory).is_ok_and(|found| !prune::folder(&found)) {
                eprintln!("grabación de series desactivada: la carpeta no es una carpeta normal");
                recording.failed = true;
                return recording;
            }
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

    fn finish(self, core: &mut Core) {
        self.finish_with(core, |worker, attempted, publish| {
            worker.close(attempted, SERIES_CLOSE_LIMITS, publish)
        });
    }

    /// `close` cierra el worker y llama a `publish` en cuanto `finished` está
    /// confirmado. Los tests lo envuelven para ver qué estado encontraría el
    /// anfitrión en ese momento (revisión de #2876).
    fn finish_with(
        mut self,
        core: &mut Core,
        close: impl FnOnce(SeriesWorker, u64, &mut dyn FnMut(&SeriesStorageState)) -> SeriesClose,
    ) {
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
        let gate = self.pending_status.take().map(PendingStatus::finish);
        let mut written = false;
        if let Some(worker) = self.worker.take() {
            let database = worker.database.clone();
            let file = || {
                database
                    .load_full()
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
            };
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
                let status = &mut self.status;
                let mut publish = |state: &SeriesStorageState| {
                    // `finished` ya está en disco: se publica antes de esperar
                    // el cierre de la base, por si el cierre de la app mata al Core.
                    if let Some(status) = status.as_mut() {
                        confirmed(status, state);
                        status.file = file();
                        status.state = "stopped";
                        status.write_with_gate(gate.as_deref());
                    }
                    written = true;
                };
                let close = close(worker, attempted, &mut publish);
                match &close.closed {
                    Closed::Clean(_) => {}
                    Closed::ConfirmedUnclosed(_, error) => {
                        eprintln!("cierre de grabación de series: datos confirmados; {error}");
                    }
                    Closed::Unconfirmed(error) => {
                        eprintln!("cierre de grabación de series: {error}");
                    }
                }
                if let Some(status) = self.status.as_mut() {
                    settle(status, &close);
                }
            }
            if let Some(status) = self.status.as_mut() {
                status.file = file();
            }
        }
        if !written && let Some(status) = self.status.as_mut() {
            status.state = "stopped";
            status.write_with_gate(gate.as_deref());
        }
    }
}

/// Lo que storage confirmó al terminar: el prefijo final y los intentos.
fn confirmed(status: &mut Status, state: &SeriesStorageState) {
    status.durable_watermark = Some(state.watermark.to_string());
    status.attempted = Some(state.attempted.to_string());
}

/// Tras el cierre (#2871). Lo confirmado ya se publicó y nunca pasa a error.
/// Sin confirmar, el estado dice el último bloque con ACK (lo que de verdad
/// está en la base) y por qué: límite agotado o storage caído.
fn settle(status: &mut Status, close: &SeriesClose) {
    if let Closed::Unconfirmed(error) = &close.closed {
        status.durable_watermark = Some(close.analysis.watermark.to_string());
        status.cause = Some(if error.kind() == std::io::ErrorKind::TimedOut {
            "finish vencido"
        } else {
            "writer caído"
        });
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

    #[cfg(windows)]
    struct LinkGuard(std::path::PathBuf);

    #[cfg(windows)]
    impl Drop for LinkGuard {
        // Quita el enlace sin seguirlo, también si el test falla antes de su limpieza.
        fn drop(&mut self) {
            let _ = std::fs::remove_dir(&self.0).or_else(|_| std::fs::remove_file(&self.0));
        }
    }

    #[cfg(windows)]
    #[test]
    fn a_recordings_folder_that_is_not_one_is_never_used() {
        let name = format!("series-not-a-folder-{}", std::process::id());
        let base = std::env::temp_dir().join(name);
        let (outside, recordings) = (base.join("fuera"), base.join("recordings"));
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("notas.txt"), b"mine").unwrap();
        let _link = LinkGuard(recordings.clone());
        for kind in ["link", "file"] {
            if kind == "link" {
                std::os::windows::fs::symlink_dir(&outside, &recordings).unwrap();
            } else {
                std::fs::write(&recordings, b"not a folder").unwrap();
            }
            let mut core = Core::new(1);
            let recording = SeriesRecording::start(&mut core, Some(&recordings), 1, || {
                panic!("{kind}: nothing is recorded there, so no helper")
            });
            assert!(
                recording.worker.is_none() && recording.status.is_none(),
                "{kind}"
            );
            recording.finish(&mut core);
            if kind == "link" {
                std::fs::remove_dir(&recordings).unwrap();
            }
        }
        // Nada escrito detrás del enlace ni en su lugar.
        let names: Vec<_> = std::fs::read_dir(&outside)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, ["notas.txt"]);
        assert_eq!(std::fs::read(&recordings).unwrap(), b"not a folder");
        std::fs::remove_dir_all(base).unwrap();
    }

    fn closed_status() -> Status {
        let mut status = Status::new(Path::new("."), 1, prune::PruneReport::default());
        status.attempted = Some("3".into());
        status.durable_watermark = Some("1".into());
        status
    }

    fn close(closed: Closed, acked: u64) -> SeriesClose {
        SeriesClose {
            closed,
            analysis: std::sync::Arc::new(crate::flows::RecordedSeriesSummary {
                watermark: acked,
                ..Default::default()
            }),
        }
    }

    const FINISHED: SeriesStorageState = SeriesStorageState {
        watermark: 3,
        finished: true,
        attempted: 3,
    };

    #[test]
    fn the_recorder_waits_by_progress_with_the_decided_limits() {
        // Decisión de la raíz (#2871): 10 s sin avanzar y 30 s de tope, nunca 1 s fijo.
        assert_eq!(
            SERIES_CLOSE_LIMITS,
            CloseLimits {
                stall: std::time::Duration::from_secs(10),
                cap: std::time::Duration::from_secs(30),
            }
        );
    }

    #[test]
    fn a_confirmed_finish_is_never_an_error_even_if_closing_the_database_is_cut() {
        for closed in [
            Closed::Clean(FINISHED),
            Closed::ConfirmedUnclosed(
                FINISHED,
                std::io::Error::new(std::io::ErrorKind::TimedOut, "sin progreso"),
            ),
            Closed::ConfirmedUnclosed(FINISHED, std::io::Error::other("salió con error")),
        ] {
            let mut status = closed_status();
            confirmed(&mut status, &FINISHED);
            settle(&mut status, &close(closed, 3));
            assert_eq!(status.cause, None);
            assert_eq!(status.durable_watermark.as_deref(), Some("3"));
            assert_eq!(status.attempted.as_deref(), Some("3"));
        }
    }

    #[test]
    fn an_unconfirmed_finish_reports_the_last_acknowledged_block_and_why() {
        let mut status = closed_status();
        let timed_out = std::io::Error::new(std::io::ErrorKind::TimedOut, "sin progreso");
        // El estado decía 1 al empezar el cierre; storage confirmó un bloque más.
        settle(&mut status, &close(Closed::Unconfirmed(timed_out), 2));
        assert_eq!(status.cause, Some("finish vencido"));
        assert_eq!(status.durable_watermark.as_deref(), Some("2"));
        // Lo que el Core intentó no cambia: la diferencia es la cola perdida.
        assert_eq!(status.attempted.as_deref(), Some("3"));
        let mut status = closed_status();
        let broken = std::io::Error::new(std::io::ErrorKind::BrokenPipe, "storage murió");
        settle(&mut status, &close(Closed::Unconfirmed(broken), 0));
        assert_eq!(status.cause, Some("writer caído"));
        assert_eq!(status.durable_watermark.as_deref(), Some("0"));
    }

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
