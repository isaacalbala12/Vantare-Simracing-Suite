//! Propietario de una grabación por arranque, fuera del camino de adquisición.
use crate::core::Core;
use crate::flows::SeriesWorker;
use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use vantare_domain::Adapter;

const SERIES_QUEUE: usize = 32;
/// Dentro de los 3 s del supervisor y los 4 s del watchdog del Core.
const SERIES_FINISH_TIMEOUT: Duration = Duration::from_secs(1);

pub struct SeriesRecording {
    worker: Option<SeriesWorker>,
    failed: bool,
}

impl SeriesRecording {
    /// Todo fallo de arranque degrada solo la grabación, nunca el núcleo.
    pub fn start(core: &mut Core, directory: Option<&Path>, epoch: u64, helper: &Path) -> Self {
        let mut recording = Self {
            worker: None,
            failed: false,
        };
        if let Some(directory) = directory {
            let result = (|| {
                std::fs::create_dir_all(directory)?;
                let path = directory.join(format!("series-{epoch}-{}.duckdb", std::process::id()));
                let receiver = core.series_mut().subscribe(SERIES_QUEUE)?;
                SeriesWorker::start_new(helper, &path, receiver)
            })();
            match result {
                Ok(worker) => recording.worker = Some(worker),
                Err(error) => {
                    eprintln!("grabación de series desactivada: {error}");
                    recording.failed = true;
                }
            }
        }
        recording
    }

    fn check(&mut self, core: &Core) {
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
        }
    }

    fn finish(mut self, core: &mut Core) {
        // El bucle ya no llama al adaptador. Core conserva el sender hasta terminar finish.
        self.check(core);
        core.series_mut().flush();
        if let Some(worker) = self.worker.take() {
            if self.failed {
                return;
            }
            let attempted = core
                .series()
                .publication_status()
                .map_or(0, |status| status.attempted);
            if let Err(error) = worker.finish(attempted, SERIES_FINISH_TIMEOUT) {
                eprintln!("cierre de grabación de series: {error}");
            }
        }
    }
}

/// Mismo bucle y resultado; el cierre se ejecuta también tras error de publicación.
#[allow(clippy::too_many_arguments)]
pub fn drive_core_recorded<E>(
    core: &mut Core,
    adapter: &mut dyn Adapter,
    speed: f64,
    stop: &AtomicBool,
    demand: Option<&vantare_ipc::DemandSource>,
    mut recording: SeriesRecording,
    mut publish: impl FnMut(&Core) -> Result<(), E>,
) -> Result<(), E> {
    let result = super::drive_core_demanded(core, adapter, speed, stop, demand, |core| {
        recording.check(core);
        publish(core)
    });
    recording.finish(core);
    result
}
