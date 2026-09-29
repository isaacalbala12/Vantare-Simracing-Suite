//! Bucle del núcleo: `Adapter::poll` → [`Core`] → `ipc::Publisher`.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use vantare_domain::Adapter;
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
    let mut publisher = Publisher::new(pipe, |_| true)?;
    let mut core = Core::new(epoch);
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
            publisher.publish(snapshot)?;
        } else {
            thread::sleep(IDLE);
        }
    }
    Ok(())
}
