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
/// cualquier suscriptor que conecte.
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
    use crate::flows::host::{EventHost, pipe_name};
    let mut events = EventHost::start(&pipe_name(pipe), epoch, recording, move |peer| {
        peer.is_image(&engineer_image)
    })?;
    let mut core = Core::with_event_base(events.base())?;
    let mut publisher = Publisher::new(pipe, |_| true)?;
    drive_core(&mut core, adapter, speed, stop, |core| {
        let snapshot = core.snapshot();
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
    mut publish: impl FnMut(&Core) -> Result<(), E>,
) -> Result<(), E> {
    let start = Instant::now();
    let (mut sent, mut last_error) = (0, String::new());
    while !stop.load(Ordering::Relaxed) {
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
