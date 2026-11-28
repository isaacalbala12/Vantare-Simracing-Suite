//! Cierre de una grabación por progreso (#2871). Storage hace el trabajo
//! (guardar lo pendiente, marcar `finished`, cerrar la base); aquí solo se
//! decide cuánto esperarle. Bajo disco ocupado cada COMMIT tarda, pero avanza:
//! no se le mata mientras siga respondiendo.
//!
//! Progreso = cada respuesta que storage ya envía (ACK de bloque, ACK de evento
//! de sesión, `finished`) y su salida. Sin señal ni protocolo nuevos: el cierre
//! de la base (`stop` → checkpoint) es un único paso que debe caber en `stall`.
//!
//! Cierre de la app o de Windows: el supervisor da al Core 1–3 s y luego lo
//! mata (el Core se mata solo a los 4 s tras una señal de Windows), antes de
//! estos límites. Entonces el estado se queda en `recording` y el anfitrión lo
//! muestra parado y sin causa; storage recibe EOF, termina el COMMIT en curso y
//! cierra la base. Si el job del supervisor lo mata a mitad del checkpoint,
//! `DuckDB` conserva lo confirmado en el `.wal` y lo reaplica al abrir. Solo se
//! pierde lo que seguía en la cola del Core, y la base queda sin `finished`.

use std::io;
use std::time::{Duration, Instant};

use super::SeriesStorageState;

/// Matar a storage solo tras `stall` sin progreso, o al llegar a `cap` desde
/// que se pidió cerrar, aunque siga avanzando.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CloseLimits {
    pub stall: Duration,
    pub cap: Duration,
}

impl CloseLimits {
    /// Producto: 10 s sin avanzar o 30 s en total.
    pub const PRODUCT: Self = Self {
        stall: Duration::from_secs(10),
        cap: Duration::from_secs(30),
    };

    /// Plazo fijo: el mismo margen para todo el cierre, avance o no.
    #[must_use]
    pub const fn fixed(timeout: Duration) -> Self {
        Self {
            stall: timeout,
            cap: timeout,
        }
    }
}

/// Cómo terminó el cierre. Lo confirmado (`finished`) ya está en disco: un
/// cierre de la base que no termina no lo convierte en pérdida.
#[derive(Debug)]
pub enum Closed {
    /// `finished` confirmado y storage salió bien.
    Clean(SeriesStorageState),
    /// `finished` confirmado, pero storage no salió a tiempo (se le mata) o
    /// salió con error al cerrar la base. Los datos están completos.
    ConfirmedUnclosed(SeriesStorageState, io::Error),
    /// Sin `finished`: queda lo confirmado bloque a bloque hasta el watermark.
    /// `TimedOut` si se agotó un límite; cualquier otro tipo, storage falló.
    Unconfirmed(io::Error),
}

/// Lo que el bucle observa de storage. Real: hilo y proceso; tests: guion.
pub(super) trait CloseProbe {
    /// Respuestas recibidas hasta ahora; solo crece.
    fn progress(&self) -> u64;
    /// Espera como mucho `wait` el resultado de `finish`.
    fn confirmation(&mut self, wait: Duration) -> Option<io::Result<SeriesStorageState>>;
    /// Espera como mucho `wait` la salida del proceso.
    fn exit(&mut self, wait: Duration) -> Option<io::Result<()>>;
}

/// Cada espera es corta: el plazo se vuelve a mirar al menos así de a menudo.
pub(super) const POLL: Duration = Duration::from_millis(5);

/// Política pura: el llamador da el instante y el progreso observado.
pub(super) struct Deadline {
    limits: CloseLimits,
    started: Instant,
    last: Instant,
    seen: u64,
}

impl Deadline {
    pub(super) fn new(limits: CloseLimits, now: Instant, progress: u64) -> Self {
        Self {
            limits,
            started: now,
            last: now,
            seen: progress,
        }
    }

    /// `Err` cuando hay que dejar de esperar. El tope gana al progreso.
    pub(super) fn check(&mut self, now: Instant, progress: u64) -> io::Result<()> {
        if progress != self.seen {
            self.seen = progress;
            self.last = now;
        }
        if now.saturating_duration_since(self.started) >= self.limits.cap {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "cierre de storage: tope absoluto agotado",
            ));
        }
        if now.saturating_duration_since(self.last) >= self.limits.stall {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "cierre de storage: sin progreso",
            ));
        }
        Ok(())
    }
}

/// Espera la confirmación y después la salida, con un único plazo por progreso.
/// `on_confirmed` corre en cuanto `finished` está en disco, antes de esperar
/// el cierre de la base: así el estado se publica aunque luego maten al Core.
pub(super) fn run(
    probe: &mut impl CloseProbe,
    now: &mut impl FnMut() -> Instant,
    limits: CloseLimits,
    on_confirmed: impl FnOnce(&SeriesStorageState),
) -> Closed {
    let mut deadline = Deadline::new(limits, now(), probe.progress());
    let state = loop {
        if let Err(error) = deadline.check(now(), probe.progress()) {
            // Al vencer, se mira una vez más sin esperar: un `finished` que ya
            // llegó cuenta, aunque llegase en el mismo instante que el límite.
            match probe.confirmation(Duration::ZERO) {
                Some(Ok(state)) => break state,
                Some(Err(failure)) => return Closed::Unconfirmed(failure),
                None => return Closed::Unconfirmed(error),
            }
        }
        match probe.confirmation(POLL) {
            None => {}
            Some(Ok(state)) => break state,
            Some(Err(error)) => return Closed::Unconfirmed(error),
        }
    };
    on_confirmed(&state);
    loop {
        if let Err(error) = deadline.check(now(), probe.progress()) {
            // Igual con la salida: si storage ya salió, el cierre fue limpio.
            return match probe.exit(Duration::ZERO) {
                Some(Ok(())) => Closed::Clean(state),
                Some(Err(failure)) => Closed::ConfirmedUnclosed(state, failure),
                None => Closed::ConfirmedUnclosed(state, error),
            };
        }
        match probe.exit(POLL) {
            None => {}
            Some(Ok(())) => return Closed::Clean(state),
            Some(Err(error)) => return Closed::ConfirmedUnclosed(state, error),
        }
    }
}

#[cfg(test)]
#[path = "series_close_tests.rs"]
mod tests;
