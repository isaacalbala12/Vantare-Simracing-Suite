//! Esperas de proceso para los tests E2E de Windows y Unix.

use std::process::Child;
use std::thread;
use std::time::{Duration, Instant};

// Un watchdog de test, no una promesa de latencia ni el --plazo del launcher.
// IPC permite operaciones de hasta 5 s. El antiguo límite de 3 s podía vencer
// antes de ese contrato; una pausa controlada de 3,5 s en la salida lo reproduce.
// Dos plazos IPC permiten observar la salida también con desplanificación.
const EXIT_WATCHDOG: Duration = vantare_ipc::transport::IO_TIMEOUT.saturating_mul(2);

pub fn wait_for_success(child: &mut Child) {
    let asked = Instant::now();
    loop {
        if let Some(status) = child.try_wait().expect("estado del núcleo") {
            // Un corte forzoso o un error siguen fallando: solo vale salida ordenada.
            assert!(status.success(), "salida del núcleo: {status}");
            return;
        }
        assert!(
            asked.elapsed() < EXIT_WATCHDOG,
            "EOF no cerró el núcleo tras {:?} (watchdog {EXIT_WATCHDOG:?})",
            asked.elapsed(),
        );
        thread::sleep(Duration::from_millis(10));
    }
}
