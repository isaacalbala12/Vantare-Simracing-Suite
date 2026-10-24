//! Casilla latest-wins: quien escribe nunca espera y quien lee ve siempre lo
//! último; lo intermedio se pierde a propósito.

use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

pub(crate) enum Wait<T> {
    /// Valor más reciente y su generación, para pasarla como `seen` la próxima vez.
    Value(Arc<T>, u64),
    Timeout,
    Closed,
}

struct State<T> {
    value: Option<Arc<T>>,
    generation: u64,
    closed: bool,
    #[cfg(test)]
    waiting: Option<std::sync::mpsc::Sender<u64>>,
}

pub(crate) struct Slot<T> {
    state: Mutex<State<T>>,
    changed: Condvar,
}

impl<T> Slot<T> {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(State {
                value: None,
                generation: 0,
                closed: false,
                #[cfg(test)]
                waiting: None,
            }),
            changed: Condvar::new(),
        }
    }

    // El estado se deja coherente antes de soltar el cerrojo: un pánico ajeno no lo invalida.
    fn lock(&self) -> MutexGuard<'_, State<T>> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn put(&self, value: Arc<T>) {
        let mut state = self.lock();
        state.value = Some(value);
        state.generation += 1;
        self.changed.notify_all();
    }

    /// Despierta a todos los que esperan; `wait` devuelve `Closed` desde entonces.
    pub fn close(&self) {
        self.lock().closed = true;
        self.changed.notify_all();
    }

    /// Espera hasta `timeout` un valor de generación mayor que `seen` (0: cualquiera).
    pub fn wait(&self, seen: u64, timeout: Duration) -> Wait<T> {
        let deadline = Instant::now() + timeout;
        let mut state = self.lock();
        loop {
            if state.closed {
                return Wait::Closed;
            }
            if let Some(value) = &state.value
                && state.generation > seen
            {
                return Wait::Value(Arc::clone(value), state.generation);
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Wait::Timeout;
            }
            // El test observa la espera bajo el mismo cerrojo: put/close no pueden
            // adquirirlo hasta que Condvar lo libere atómicamente al esperar.
            #[cfg(test)]
            if let Some(waiting) = &state.waiting {
                let _ = waiting.send(seen);
            }
            state = self
                .changed
                .wait_timeout(state, left)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;

    const SHORT: Duration = Duration::from_millis(20);

    #[test]
    fn reader_sees_only_the_latest_value() {
        let slot = Slot::new();
        for n in 1..=5 {
            slot.put(Arc::new(n));
        }
        let Wait::Value(value, generation) = slot.wait(0, SHORT) else {
            panic!("debía haber valor");
        };
        assert_eq!((*value, generation), (5, 5));
        assert!(matches!(slot.wait(generation, SHORT), Wait::Timeout));
    }

    #[test]
    fn put_wakes_a_waiting_reader_and_close_releases_it() {
        // Límites de fallo, no esperas para ordenar los hilos. La espera del Slot
        // dura más que el ACK para que un notify ausente no pase al vencerla.
        const ACK_TIMEOUT: Duration = Duration::from_secs(5);
        const WAIT_TIMEOUT: Duration = Duration::from_secs(30);
        let slot = Arc::new(Slot::new());
        let (waiting, waits) = mpsc::channel();
        let (received, receipt) = mpsc::sync_channel(0);
        let (finished, completion) = mpsc::sync_channel(0);
        slot.lock().waiting = Some(waiting);
        let reader = {
            let slot = Arc::clone(&slot);
            thread::spawn(move || {
                let first = slot.wait(0, WAIT_TIMEOUT);
                received.send(()).unwrap();
                let closed = slot.wait(1, WAIT_TIMEOUT);
                finished.send(()).unwrap();
                (
                    matches!(first, Wait::Value(..)),
                    matches!(closed, Wait::Closed),
                )
            })
        };
        let wait_until_blocked = |seen| {
            let deadline = Instant::now() + ACK_TIMEOUT;
            loop {
                // Una condición puede despertar espuriamente y anunciar de nuevo
                // la generación anterior: solo cuenta la fase que esperamos.
                let left = deadline.saturating_duration_since(Instant::now());
                if waits.recv_timeout(left).expect("lector esperando") == seen {
                    break;
                }
            }
        };
        wait_until_blocked(0);
        slot.put(Arc::new(1));
        receipt.recv_timeout(ACK_TIMEOUT).expect("valor recibido");
        wait_until_blocked(1);
        slot.close();
        completion
            .recv_timeout(ACK_TIMEOUT)
            .expect("lector liberado por close");
        assert_eq!(reader.join().unwrap(), (true, true));
    }
}
