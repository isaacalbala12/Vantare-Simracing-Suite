//! Bucle del núcleo: `Adapter::poll` → [`Core`] → `ipc::Publisher`.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use vantare_domain::{Adapter, Snapshot};
use vantare_ipc::{Error, Publisher};

use crate::core::Core;

/// Espera cuando una vuelta no ha producido nada nuevo.
const IDLE: Duration = Duration::from_millis(2);

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

pub struct Options<'a> {
    pub recording: Option<&'a std::path::Path>,
    pub engineer_image: std::path::PathBuf,
    pub rights_nonce: Option<String>,
}

pub fn run_controlled(
    adapter: &mut dyn Adapter,
    pipe: &str,
    epoch: u64,
    speed: f64,
    stop: &AtomicBool,
    options: Options<'_>,
) -> Result<(), Error> {
    use crate::flows::host::{EventHost, pipe_name};
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
    drive_core(core, adapter, speed, stop, |core| publish(core.snapshot()))
}

fn drive_core<E>(
    core: &mut Core,
    adapter: &mut dyn Adapter,
    speed: f64,
    stop: &AtomicBool,
    publish: impl FnMut(&Core) -> Result<(), E>,
) -> Result<(), E> {
    drive_core_demanded(core, adapter, speed, stop, None, publish)
}

fn drive_core_demanded<E>(
    core: &mut Core,
    adapter: &mut dyn Adapter,
    speed: f64,
    stop: &AtomicBool,
    demand: Option<&vantare_ipc::DemandSource>,
    mut publish: impl FnMut(&Core) -> Result<(), E>,
) -> Result<(), E> {
    let start = Instant::now();
    let (mut sent, mut last_error) = (0, String::new());
    let mut demand_revision = u64::MAX;
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
        if snapshot.sequence > sent {
            sent = snapshot.sequence;
            publish(core)?;
        } else {
            thread::sleep(IDLE);
        }
    }
    Ok(())
}
