//! Señal de cierre del proceso (Ctrl+C, Ctrl+Break, cerrar la consola, cerrar
//! sesión, apagar). El manejador solo levanta una bandera que el bucle
//! principal consulta; si el cierre ordenado no termina en `DEADLINE`, sale
//! del proceso. Windows da unos 5 s tras cerrar la consola, de ahí el plazo.

#![allow(unsafe_code)]

use std::io;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

/// Plazo del cierre ordenado desde la señal.
const DEADLINE: Duration = Duration::from_secs(4);

static STOP: AtomicBool = AtomicBool::new(false);

#[link(name = "kernel32")]
unsafe extern "system" {
    fn SetConsoleCtrlHandler(
        handler: Option<unsafe extern "system" fn(u32) -> i32>,
        add: i32,
    ) -> i32;
}

/// Corre en un hilo que crea el sistema. Para cerrar consola, sesión o equipo
/// el proceso muere en cuanto vuelve, así que espera aquí: o `main` termina
/// antes (y se lleva el proceso), o se agota el plazo.
unsafe extern "system" fn on_signal(_event: u32) -> i32 {
    STOP.store(true, Ordering::SeqCst);
    std::thread::sleep(DEADLINE);
    std::process::exit(1)
}

/// Instala el manejador. La bandera pasa a `true` con la primera señal.
///
/// # Errors
/// Si el sistema rechaza el manejador.
pub fn install() -> io::Result<&'static AtomicBool> {
    // SAFETY: `on_signal` tiene la firma de `PHANDLER_ROUTINE`, no captura
    // estado y solo toca un atómico estático, duerme y termina el proceso.
    if unsafe { SetConsoleCtrlHandler(Some(on_signal), 1) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(&STOP)
}
