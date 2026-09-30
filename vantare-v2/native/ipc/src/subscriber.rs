//! Lado de overlays: mantiene la conexión con el núcleo y guarda la última foto.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_domain::Snapshot;

use crate::Error;
use crate::codec::{Message, Revision, hello, read_message, supports, write_message};
use crate::latest::{Slot, Wait};
use crate::pipe::{self, Event, IO_TIMEOUT, Peer};

/// Espera entre intentos de conexión (el núcleo puede no haber arrancado).
const RETRY: Duration = Duration::from_millis(250);

pub struct Subscriber {
    latest: Arc<Slot<Snapshot>>,
    seen: u64,
    stop: Arc<Event>,
    worker: Option<JoinHandle<()>>,
    activity: Arc<AtomicU64>,
}

impl Subscriber {
    /// Empieza a conectarse a `\\.\pipe\<name>` en segundo plano; si el núcleo
    /// no está o se cae, reintenta solo. `accept_peer` decide por identidad
    /// (PID, imagen) si se confía en el servidor.
    ///
    /// # Errors
    /// Si el sistema no puede crear el evento o el hilo.
    pub fn connect(
        name: &str,
        accept_peer: impl Fn(&Peer) -> bool + Send + 'static,
    ) -> Result<Self, Error> {
        let latest = Arc::new(Slot::new());
        let stop = Arc::new(Event::new()?);
        let activity = Arc::new(AtomicU64::new(0));
        let worker = {
            let (name, latest, stop) = (name.to_owned(), Arc::clone(&latest), Arc::clone(&stop));
            let activity = Arc::clone(&activity);
            thread::Builder::new()
                .name("ipc-subscriber".into())
                .spawn(move || run(&name, &stop, &latest, &accept_peer, &activity))?
        };
        Ok(Self {
            latest,
            seen: 0,
            stop,
            worker: Some(worker),
            activity,
        })
    }

    /// La última foto recibida desde la anterior llamada, esperando hasta
    /// `timeout` si aún no hay una nueva. Las intermedias se han perdido a
    /// propósito: quien llama, por lento que sea, ve siempre la más reciente.
    pub fn next(&mut self, timeout: Duration) -> Option<Arc<Snapshot>> {
        match self.latest.wait(self.seen, timeout) {
            Wait::Value(snapshot, generation) => {
                self.seen = generation;
                Some(snapshot)
            }
            Wait::Timeout | Wait::Closed => None,
        }
    }

    /// Contador de mensajes válidos recibidos, incluidos latidos. Permite
    /// distinguir un núcleo vivo sin fotos nuevas de un pipe silencioso.
    pub fn activity(&self) -> u64 {
        self.activity.load(Ordering::Relaxed)
    }
}

impl Drop for Subscriber {
    fn drop(&mut self) {
        self.stop.set();
        self.latest.close();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn run(
    name: &str,
    stop: &Arc<Event>,
    latest: &Slot<Snapshot>,
    accept_peer: &dyn Fn(&Peer) -> bool,
    activity: &AtomicU64,
) {
    // El cursor sobrevive a las reconexiones: es lo que evita repeticiones
    // mientras el productor siga en su época.
    let mut cursor = None;
    let mut reported_incompatible = false;
    loop {
        // Cualquier error (par caído, mudo o hostil) se resuelve igual: reconectar.
        if let Err(error) = session(name, stop, latest, accept_peer, &mut cursor, activity)
            && matches!(error, Error::Version { .. } | Error::Rejected(_))
            && !reported_incompatible
        {
            eprintln!("IPC incompatible: {error}");
            reported_incompatible = true;
        }
        if stop.wait(RETRY) {
            break;
        }
    }
}

fn session(
    name: &str,
    stop: &Arc<Event>,
    latest: &Slot<Snapshot>,
    accept_peer: &dyn Fn(&Peer) -> bool,
    cursor: &mut Option<Revision>,
    activity: &AtomicU64,
) -> Result<(), Error> {
    let mut pipe = pipe::connect(name, Arc::clone(stop), IO_TIMEOUT)?;
    if !accept_peer(&pipe.server_peer()?) {
        return Err(Error::Peer);
    }
    write_message(&mut pipe, &hello(*cursor))?;
    match read_message(&mut pipe)? {
        Message::Welcome { version } if supports(version) => {}
        Message::Welcome { version } => return Err(Error::Version { got: version }),
        Message::Reject { reason } => return Err(Error::Rejected(reason)),
        _ => return Err(Error::Protocol("se esperaba Welcome")),
    }
    activity.fetch_add(1, Ordering::Relaxed);
    loop {
        match read_message(&mut pipe)? {
            Message::Ping => {}
            Message::Snapshot(dto) => {
                let revision = Revision {
                    epoch: dto.epoch,
                    sequence: dto.sequence,
                };
                if revision.is_newer(*cursor) {
                    latest.put(Arc::new(Snapshot::try_from(dto)?));
                    *cursor = Some(revision);
                }
            }
            _ => return Err(Error::Protocol("mensaje inesperado")),
        }
        activity.fetch_add(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipe::Listener;

    #[test]
    fn incompatible_server_reconnects_without_publishing_a_snapshot() {
        let name = format!("vantare-test-old-server-{}", std::process::id());
        let stop = Arc::new(Event::new().expect("evento"));
        let mut listener = Listener::new(&name, stop, IO_TIMEOUT).expect("listener");
        let server = thread::spawn(move || {
            for _ in 0..3 {
                let mut pipe = listener.instance().expect("instancia");
                pipe.accept().expect("conexión");
                assert!(matches!(read_message(&mut pipe), Ok(Message::Hello { .. })));
                write_message(&mut pipe, &Message::Welcome { version: 3 })
                    .expect("versión antigua");
            }
        });
        let mut subscriber = Subscriber::connect(&name, |_| true).expect("suscriptor");
        server.join().expect("tres reconexiones");
        assert!(subscriber.next(Duration::ZERO).is_none());
        // cargo test ... --nocapture permite comprobar que las tres respuestas
        // incompatibles anteriores producen una sola línea en stderr.
    }
}
