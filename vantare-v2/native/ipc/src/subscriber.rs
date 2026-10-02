//! Lado de overlays: mantiene la conexión con el núcleo y guarda la última foto.

use std::sync::Arc;
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
        let worker = {
            let (name, latest, stop) = (name.to_owned(), Arc::clone(&latest), Arc::clone(&stop));
            thread::Builder::new()
                .name("ipc-subscriber".into())
                .spawn(move || run(&name, &stop, &latest, &accept_peer))?
        };
        Ok(Self {
            latest,
            seen: 0,
            stop,
            worker: Some(worker),
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
) {
    // El cursor sobrevive a las reconexiones: es lo que evita repeticiones
    // mientras el productor siga en su época.
    let mut cursor = None;
    loop {
        // Cualquier error (par caído, mudo o hostil) se resuelve igual: reconectar.
        let _ = session(name, stop, latest, accept_peer, &mut cursor);
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
    }
}
