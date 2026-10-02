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
        let slot = Arc::new(Slot::new());
        let reader = {
            let slot = Arc::clone(&slot);
            thread::spawn(move || {
                let first = slot.wait(0, Duration::from_secs(5));
                let closed = slot.wait(1, Duration::from_secs(5));
                (
                    matches!(first, Wait::Value(..)),
                    matches!(closed, Wait::Closed),
                )
            })
        };
        thread::sleep(SHORT);
        slot.put(Arc::new(1));
        thread::sleep(SHORT);
        slot.close();
        assert_eq!(reader.join().unwrap(), (true, true));
    }
}
