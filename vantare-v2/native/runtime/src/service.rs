//! Bucle del núcleo: `Adapter::poll` → [`Core`] → `ipc::Publisher`.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use vantare_domain::{Adapter, Snapshot};
#[cfg(windows)]
use vantare_ipc::{Error, Publisher};

use crate::core::Core;

/// Espera cuando una vuelta no ha producido nada nuevo.
const IDLE: Duration = Duration::from_millis(2);
/// No aplazar el cierre, la demanda ni la vigilancia de frescura más de un frame.
const MAX_WAIT: Duration = Duration::from_nanos(1_000_000_000 / 60);

/// Sirve por `\\.\pipe\<pipe>` lo que produce `adapter` hasta que `stop` se
/// levante. El reloj del núcleo es el tiempo transcurrido por `speed`: con 1,0
/// las marcas de un replay se respetan a tiempo real. Al volver, el pipe ya se
/// ha cerrado y sus hilos han terminado; el adaptador lo suelta quien llama.
///
/// El pipe solo es del usuario actual (ACL de `ipc`), así que se atiende a
/// cualquier suscriptor de fotos que conecte. El canal ordenado de eventos
/// exige además imagen de Engineer y usa otro pipe con la misma ACL.
///
/// # Errors
/// Si el pipe no se puede abrir (p. ej. otro núcleo ya lo tiene) o `ipc` falla al publicar.
#[cfg(windows)]
pub fn run(
    adapter: &mut dyn Adapter,
    pipe: &str,
    epoch: u64,
    speed: f64,
    stop: &AtomicBool,
) -> Result<(), Error> {
    let image = std::env::current_exe()?.with_file_name("vantare-engineer.exe");
    run_with_events(adapter, pipe, epoch, speed, stop, None, image)
}

/// Recording opt-in; su dueño de E/S nunca ejecuta en adquisición.
#[cfg(windows)]
pub fn run_with_events(
    adapter: &mut dyn Adapter,
    pipe: &str,
    epoch: u64,
    speed: f64,
    stop: &AtomicBool,
    recording: Option<&std::path::Path>,
    engineer_image: std::path::PathBuf,
) -> Result<(), Error> {
    run_controlled(
        adapter,
        pipe,
        epoch,
        speed,
        stop,
        Options {
            recording,
            engineer_image,
            rights_nonce: None,
        },
    )
}

#[cfg(windows)]
pub struct Options<'a> {
    pub recording: Option<&'a std::path::Path>,
    pub engineer_image: std::path::PathBuf,
    pub rights_nonce: Option<String>,
}

#[cfg(windows)]
pub fn run_controlled(
    adapter: &mut dyn Adapter,
    pipe: &str,
    epoch: u64,
    speed: f64,
    stop: &AtomicBool,
    options: Options<'_>,
) -> Result<(), Error> {
    use crate::flows::host::{EventHost, pipe_name};
    let measurement = std::env::var_os("VANTARE_MEASUREMENT_MODE");
    if measurement.is_some() && options.recording.is_some() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "medición incompatible con recording",
        )
        .into());
    }
    let rights = crate::rights::production(
        pipe,
        epoch,
        options.rights_nonce,
        options.engineer_image.clone(),
    )?;
    let mut events = EventHost::start(&pipe_name(pipe), epoch, options.recording, move |peer| {
        peer.is_image(&options.engineer_image)
    })?;
    let mut core = Core::with_event_base(events.base())?;
    if let Some(mode) = measurement {
        let mode = mode.to_str().ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "modo de medición no UTF-8",
            )
        })?;
        core.set_measurement_mode(mode)?;
        eprintln!("SOLO MEDICIÓN #1461: VANTARE_MEASUREMENT_MODE={mode}");
    }
    let mut publisher = Publisher::new(pipe, |_| true)?;
    let demand = publisher.demand_source();
    drive_core_demanded(&mut core, adapter, speed, stop, Some(&demand), |core| {
        let snapshot = core.snapshot();
        rights.publish(Arc::clone(&snapshot));
        events.publish(Arc::clone(&snapshot), core.events());
        publisher.publish(snapshot)
    })
}

/// El bucle sin transporte: hasta que `stop` se levante, hace avanzar `core`
/// con `adapter` y entrega a `publish` cada foto nueva. Quien no necesite
/// `publish` lee del [`Core::subscribe`] que haya sacado antes.
///
/// # Errors
/// El primer error de `publish`.
pub fn drive<E>(
    core: &mut Core,
    adapter: &mut dyn Adapter,
    speed: f64,
    stop: &AtomicBool,
    mut publish: impl FnMut(Arc<Snapshot>) -> Result<(), E>,
) -> Result<(), E> {
    drive_core_demanded(core, adapter, speed, stop, None, |core| {
        publish(core.snapshot())
    })
}

/// Bucle compartido por ambos transportes; el callback publica foto y eventos
/// del mismo corte. La composición de derechos sigue siendo de Windows.
///
/// # Errors
/// El primer error de `publish`.
pub fn drive_core_demanded<E>(
    core: &mut Core,
    adapter: &mut dyn Adapter,
    speed: f64,
    stop: &AtomicBool,
    demand: Option<&vantare_ipc::DemandSource>,
    mut publish: impl FnMut(&Core) -> Result<(), E>,
) -> Result<(), E> {
    let start = Instant::now();
    #[cfg(feature = "paint-stats")]
    let mut report_at = Instant::now();
    let (mut sent, mut last_error) = (0, String::new());
    let mut demand_revision = u64::MAX;
    let mut freshness = vantare_ipc::freshness::state(&core.snapshot());
    while !stop.load(Ordering::Relaxed) {
        if let Some(demand) = demand {
            let revision = demand.revision();
            if revision != demand_revision {
                core.set_demand_mask(demand.mask());
                demand_revision = revision;
            }
        }
        // Un fallo del adaptador no para el núcleo: se registra al cambiar de
        // causa (con la fuente cerrada, `poll` repite el mismo error).
        match core.step(adapter, start.elapsed().mul_f64(speed)) {
            Ok(()) => last_error.clear(),
            Err(error) if error.to_string() != last_error => {
                last_error = error.to_string();
                eprintln!("núcleo: {last_error}");
            }
            Err(_) => {}
        }
        let snapshot = core.snapshot();
        vantare_ipc::freshness::log_transition(
            "core",
            freshness,
            &snapshot,
            core.freshness_reason(),
        );
        freshness = vantare_ipc::freshness::state(&snapshot);
        let idle = snapshot.sequence <= sent;
        if !idle {
            sent = snapshot.sequence;
            #[cfg(feature = "paint-stats")]
            let _span = crate::profiling::begin(crate::profiling::Stage::Publish);
            publish(core)?;
        }
        let next = adapter.next_poll().map(|next| {
            core.freshness_deadline()
                .map_or(next, |deadline| next.min(deadline))
        });
        let wait = poll_wait(next, start.elapsed(), speed, idle);
        if !wait.is_zero() {
            thread::sleep(wait);
        }
        #[cfg(feature = "paint-stats")]
        if report_at.elapsed() >= Duration::from_secs(1) {
            crate::profiling::report();
            report_at = Instant::now();
        }
    }
    Ok(())
}

fn poll_wait(next: Option<Duration>, elapsed: Duration, speed: f64, idle: bool) -> Duration {
    next.map_or(if idle { IDLE } else { Duration::ZERO }, |next| {
        next.saturating_sub(elapsed.mul_f64(speed))
            .div_f64(speed)
            .min(MAX_WAIT)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waits_follow_the_source_clock_without_delaying_stop_or_legacy_sources() {
        assert_eq!(
            poll_wait(Some(MAX_WAIT), Duration::ZERO, 2.0, false),
            MAX_WAIT.div_f64(2.0)
        );
        assert_eq!(
            poll_wait(Some(Duration::from_secs(1)), Duration::ZERO, 1.0, false),
            MAX_WAIT
        );
        assert_eq!(poll_wait(Some(IDLE), MAX_WAIT, 1.0, true), Duration::ZERO);
        assert_eq!(poll_wait(None, Duration::ZERO, 1.0, true), IDLE);
        assert_eq!(poll_wait(None, Duration::ZERO, 1.0, false), Duration::ZERO);
    }
}
