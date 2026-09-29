//! Publicación latest-wins: un escritor cambia el `Arc<Snapshot>` con un
//! intercambio atómico y avisa a los lectores con una señal coalescida.
//! Ni el escritor espera a un lector ni un lector espera al escritor.

use std::sync::Arc;
use std::sync::mpsc::{Receiver, RecvTimeoutError, SyncSender, TrySendError, sync_channel};
use std::time::Duration;

use arc_swap::ArcSwap;
use vantare_domain::Snapshot;

/// Extremo de lectura de un consumidor; cada consumidor tiene el suyo.
pub struct Reader {
    latest: Arc<ArcSwap<Snapshot>>,
    wake: Receiver<()>,
}

impl Reader {
    /// Último snapshot publicado, sin esperar.
    pub fn latest(&self) -> Arc<Snapshot> {
        self.latest.load_full()
    }

    /// Espera a que haya algo publicado desde la última espera y devuelve el
    /// último snapshot: varias publicaciones seguidas valen una sola espera. El
    /// primer `wait` de un lector nuevo vuelve enseguida con el estado actual.
    ///
    /// # Errors
    /// `Timeout` si no hay novedades en `timeout`; `Disconnected` si el núcleo ya
    /// no existe.
    pub fn wait(&self, timeout: Duration) -> Result<Arc<Snapshot>, RecvTimeoutError> {
        self.wake.recv_timeout(timeout)?;
        Ok(self.latest())
    }
}

/// Lo posee el único escritor, así que suscribirse y publicar no necesitan cerrojo.
pub(super) struct Publisher {
    latest: Arc<ArcSwap<Snapshot>>,
    wakers: Vec<SyncSender<()>>,
}

impl Publisher {
    pub(super) fn new(initial: Arc<Snapshot>) -> Self {
        Self {
            latest: Arc::new(ArcSwap::new(initial)),
            wakers: Vec::new(),
        }
    }

    pub(super) fn subscribe(&mut self) -> Reader {
        // Capacidad 1: una señal pendiente ya significa "hay algo nuevo".
        let (waker, wake) = sync_channel(1);
        waker.try_send(()).expect("canal recién creado");
        self.wakers.push(waker);
        Reader {
            latest: Arc::clone(&self.latest),
            wake,
        }
    }

    pub(super) fn publish(&mut self, snapshot: Arc<Snapshot>) {
        self.latest.store(snapshot);
        // Señal pendiente (`Full`) = coalescida; solo se descartan lectores caídos.
        self.wakers
            .retain(|waker| !matches!(waker.try_send(()), Err(TrySendError::Disconnected(()))));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(sequence: u64) -> Arc<Snapshot> {
        Arc::new(Snapshot {
            sequence,
            ..Snapshot::default()
        })
    }

    #[test]
    fn notifications_coalesce_and_latest_wins() {
        let mut publisher = Publisher::new(snapshot(0));
        let reader = publisher.subscribe();
        // La señal inicial entrega el estado actual a un lector tardío.
        assert_eq!(reader.wait(Duration::ZERO).unwrap().sequence, 0);
        for sequence in 1..=100 {
            publisher.publish(snapshot(sequence));
        }
        assert_eq!(reader.wait(Duration::ZERO).unwrap().sequence, 100);
        assert_eq!(
            reader.wait(Duration::from_millis(5)).unwrap_err(),
            RecvTimeoutError::Timeout
        );
    }

    #[test]
    fn slow_or_dead_readers_never_block_the_writer() {
        let mut publisher = Publisher::new(snapshot(0));
        let slow = publisher.subscribe();
        let held = slow.latest();
        drop(publisher.subscribe());
        for sequence in 1..=10_000 {
            publisher.publish(snapshot(sequence));
        }
        assert_eq!(held.sequence, 0, "el snapshot retenido no cambia");
        assert_eq!(slow.latest().sequence, 10_000);
        assert_eq!(publisher.wakers.len(), 1, "el lector caído se descarta");
        drop(publisher);
        // Vaciada la señal pendiente, un núcleo caído se distingue del silencio.
        slow.wait(Duration::ZERO).unwrap();
        assert_eq!(
            slow.wait(Duration::ZERO).unwrap_err(),
            RecvTimeoutError::Disconnected
        );
    }

    #[test]
    fn concurrent_reader_sees_monotonic_sequences_and_the_last_one() {
        let mut publisher = Publisher::new(snapshot(0));
        let reader = publisher.subscribe();
        let handle = std::thread::spawn(move || {
            let mut seen = 0;
            while let Ok(snapshot) = reader.wait(Duration::from_secs(5)) {
                assert!(snapshot.sequence >= seen);
                seen = snapshot.sequence;
            }
            seen
        });
        for sequence in 1..=5_000 {
            publisher.publish(snapshot(sequence));
        }
        drop(publisher);
        assert_eq!(handle.join().unwrap(), 5_000);
    }
}
