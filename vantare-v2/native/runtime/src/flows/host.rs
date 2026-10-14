//! Dueño único de I/O. Adquisición solo intercambia un corte inmutable acotado.
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, mpsc};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use arc_swap::ArcSwap;
use vantare_domain::Snapshot;
use vantare_ipc::transport::{Event as Cancel, IO_TIMEOUT, Listener, Peer, Pipe};

use super::{
    Consumer, Cursor, Event, Journal, RecordingStatus,
    wire::{self, Frame},
};

const MAX_CLIENTS: usize = 8;
const POLL: Duration = Duration::from_millis(10);

pub fn pipe_name(photo_pipe: &str) -> String {
    format!("{photo_pipe}-events")
}

struct Cut {
    photo: Arc<Snapshot>,
    tail: Cursor,
    ring: Arc<Vec<Event>>,
}
enum Request {
    Frame(Option<Cursor>, mpsc::SyncSender<io::Result<Frame>>),
    Recording(Option<PathBuf>, mpsc::SyncSender<io::Result<()>>),
}

pub struct EventHost {
    latest: Arc<ArcSwap<Cut>>,
    requests: mpsc::SyncSender<Request>,
    stop: Arc<Cancel>,
    owner: Option<JoinHandle<()>>,
    accept: Option<JoinHandle<()>>,
}
impl EventHost {
    /// Abrir/recuperar recording aquí, antes de entrar en adquisición. La base
    /// devuelta se entrega a Core: los índices continúan el prefijo confirmado.
    pub fn start(
        name: &str,
        epoch: u64,
        recording: Option<&Path>,
        accept_peer: impl Fn(&Peer) -> bool + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let journal = Journal::open(epoch, 256, recording)?;
        let base = journal.tail();
        let stop = Arc::new(Cancel::new()?);
        let mut listener = Listener::new(name, Arc::clone(&stop), IO_TIMEOUT)?;
        let first = listener.instance()?;
        let latest = Arc::new(ArcSwap::from_pointee(Cut {
            photo: Arc::new(Snapshot {
                epoch,
                ..Snapshot::default()
            }),
            tail: base,
            ring: Arc::new(Vec::new()),
        }));
        let (requests, receiver) = mpsc::sync_channel(MAX_CLIENTS);
        let owner = {
            let latest = Arc::clone(&latest);
            let stop = Arc::clone(&stop);
            thread::Builder::new()
                .name("events-io".into())
                .spawn(move || own(journal, &latest, &receiver, &stop))?
        };
        let accept = {
            let requests = requests.clone();
            let stop = Arc::clone(&stop);
            thread::Builder::new()
                .name("events-accept".into())
                .spawn(move || accept_loop(listener, first, &requests, &stop, &accept_peer))
        };
        match accept {
            Ok(accept) => Ok(Self {
                latest,
                requests,
                stop,
                owner: Some(owner),
                accept: Some(accept),
            }),
            Err(error) => {
                stop.set();
                if owner.join().is_err() {
                    eprintln!("events: dueño terminó con panic al abrir");
                }
                Err(error)
            }
        }
    }
    pub fn base(&self) -> Cursor {
        self.latest.load().tail
    }
    /// No mutex, disco ni espera. Reutilizar el ring mientras no cambie el tail.
    pub fn publish(&mut self, photo: Arc<Snapshot>, journal: &Journal) {
        let previous = self.latest.load();
        let tail = journal.tail();
        let ring = if previous.tail == tail {
            Arc::clone(&previous.ring)
        } else {
            Arc::new(journal.retained())
        };
        self.latest.store(Arc::new(Cut { photo, tail, ring }));
    }
    /// Control fuera de adquisición. Error/saturación explícito y plazo finito.
    pub fn set_recording(&self, path: Option<&Path>) -> io::Result<()> {
        let (sender, receiver) = mpsc::sync_channel(1);
        self.requests
            .try_send(Request::Recording(path.map(Path::to_path_buf), sender))
            .map_err(|_| busy())?;
        receiver.recv_timeout(IO_TIMEOUT).map_err(|_| timed_out())?
    }
}
impl Drop for EventHost {
    fn drop(&mut self) {
        self.stop.set();
        for handle in [self.accept.take(), self.owner.take()]
            .into_iter()
            .flatten()
        {
            if handle.join().is_err() {
                eprintln!("events: hilo terminó con panic");
            }
        }
    }
}

fn own(
    mut journal: Journal,
    latest: &ArcSwap<Cut>,
    requests: &mpsc::Receiver<Request>,
    stop: &Cancel,
) {
    let mut photo = Arc::clone(&latest.load().photo);
    let mut reported = None;
    loop {
        // Adquisición ya terminó antes de Drop. Incluso si cancelación gana
        // el siguiente turno de I/O, persistir el último corte publicado.
        let stopping = stop.is_set();
        let request = if stopping {
            Err(mpsc::RecvTimeoutError::Timeout)
        } else {
            requests.recv_timeout(POLL)
        };
        let cut = latest.load_full();
        if cut.photo.sequence != photo.sequence || cut.tail != journal.tail() {
            if let Err(error) = journal.replicate(cut.tail, &cut.ring) {
                eprintln!("events: corte rechazado: {error}");
                return;
            }
            photo = Arc::clone(&cut.photo);
            if let Err(error) = journal.persist()
                && reported != Some(error.kind())
            {
                eprintln!("events: recording degradado: {error}");
                reported = Some(error.kind());
            }
            if !matches!(journal.recording_status(), RecordingStatus::Degraded(_)) {
                reported = None;
            }
        }
        if stopping {
            break;
        }
        match request {
            Ok(Request::Frame(cursor, sender)) => {
                let mut consumer = cursor.map(Consumer::new);
                let frame = Frame::capture(&photo, &journal, consumer.as_mut());
                // El cliente pudo vencer su plazo/cerrar; no bloquea al dueño.
                drop(sender.try_send(frame)); // Petición abandonada: no hay dueño al que responder.
            }
            Ok(Request::Recording(path, sender)) => {
                let result = journal.set_recording(path.as_deref());
                drop(sender.try_send(result)); // Control abandonado: estado sigue visible en el frame.
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
        }
    }
}

fn accept_loop(
    mut listener: Listener,
    first: Pipe,
    requests: &mpsc::SyncSender<Request>,
    stop: &Arc<Cancel>,
    accept_peer: &impl Fn(&Peer) -> bool,
) {
    let mut next = first;
    let mut clients: Vec<JoinHandle<()>> = Vec::new();
    while !stop.is_set() {
        let accepted = next.accept();
        if stop.is_set() {
            break;
        }
        let fresh = match listener.instance() {
            Ok(fresh) => fresh,
            Err(error) => {
                eprintln!("events: instancia: {error}");
                break;
            }
        };
        let mut pipe = std::mem::replace(&mut next, fresh);
        clients.retain(|client| !client.is_finished());
        if accepted.is_err() || clients.len() == MAX_CLIENTS {
            continue;
        }
        let permitted = pipe.client_peer().is_ok_and(|peer| accept_peer(&peer));
        if !permitted {
            continue;
        }
        let (requests, stop) = (requests.clone(), Arc::clone(stop));
        let client = thread::Builder::new()
            .name("events-client".into())
            .spawn(move || {
                if let Err(error) = serve(&mut pipe, &requests, &stop)
                    && !stop.is_set()
                {
                    eprintln!("events: consumidor cerrado: {error}");
                }
            });
        match client {
            Ok(client) => clients.push(client),
            Err(error) => eprintln!("events: cliente: {error}"),
        }
    }
    for client in clients {
        if client.join().is_err() {
            eprintln!("events: cliente terminó con panic");
        }
    }
}

fn serve(pipe: &mut Pipe, requests: &mpsc::SyncSender<Request>, stop: &Cancel) -> io::Result<()> {
    let mut cursor = wire::read_hello(pipe)?;
    while !stop.is_set() {
        let (sender, receiver) = mpsc::sync_channel(1);
        requests
            .try_send(Request::Frame(cursor, sender))
            .map_err(|_| busy())?;
        let frame = receiver
            .recv_timeout(IO_TIMEOUT)
            .map_err(|_| timed_out())??;
        wire::write_frame(pipe, &frame)?;
        let expected = match frame.delivery {
            Some(super::Delivery::Event(e)) => e.cursor,
            Some(super::Delivery::Fact(e)) => e.cursor,
            Some(super::Delivery::Gap { resume_at, .. }) => resume_at,
            None => frame.tail,
        };
        let acknowledged = wire::read_ack(pipe)?;
        if acknowledged != expected {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "ACK no coincide con entrega pendiente",
            ));
        }
        cursor = Some(acknowledged);
        if frame.delivery.is_none() && stop.wait(Duration::from_millis(50)) {
            break;
        }
    }
    Ok(())
}
fn busy() -> io::Error {
    io::Error::new(io::ErrorKind::WouldBlock, "peticiones de eventos saturadas")
}
fn timed_out() -> io::Error {
    io::Error::new(io::ErrorKind::TimedOut, "dueño de eventos no respondió")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::Core;
    use crate::flows::tests::{TestFile, photo};

    #[test]
    fn shutdown_persists_the_last_published_cut_before_owner_exits() {
        let file = TestFile::new();
        let journal = Journal::open(1, 256, Some(&file.0)).expect("recording");
        let mut core = Core::with_event_base(journal.tail()).expect("core");
        core.observe(photo(1, false)).expect("fuera de pits");
        core.observe(photo(2, true)).expect("entrada en pits");
        let tail = core.events().tail();
        assert_eq!(tail.index, 1, "evento pendiente real");
        let latest = ArcSwap::from_pointee(Cut {
            photo: core.snapshot(),
            tail,
            ring: Arc::new(core.events().retained()),
        });
        let (_sender, receiver) = mpsc::sync_channel(1);
        let stop = Cancel::new().expect("cancelación");
        // Intercalación determinista: publish ocurre justo antes de Drop,
        // y el dueño aún no ha recibido su siguiente turno de I/O.
        stop.set();
        own(journal, &latest, &receiver, &stop);
        let recovered = Journal::open(2, 256, Some(&file.0)).expect("reabrir");
        assert_eq!(recovered.durable_cursor(), Some(tail));
    }
}
