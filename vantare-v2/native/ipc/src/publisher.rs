//! Lado del núcleo: acepta suscriptores y les sirve siempre la última foto.

use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_domain::Snapshot;

use crate::Error;
use crate::codec::{Message, Revision, negotiate, read_message, write_message};
use crate::dto::SnapshotDto;
use crate::latest::{Slot, Wait};
use crate::pipe::{Event, IO_TIMEOUT, Listener, Peer, Pipe};

/// Sin fotos nuevas, cada cuánto se envía un latido (así un par muerto se
/// nota por el fallo de escritura y uno mudo por el plazo de lectura).
const HEARTBEAT: Duration = Duration::from_secs(1);
/// Suscriptores simultáneos; los de más se cierran al conectar.
const MAX_CLIENTS: usize = 8;

struct Shared {
    latest: Slot<Snapshot>,
    stop: Arc<Event>,
    accept_peer: Box<dyn Fn(&Peer) -> bool + Send + Sync>,
}

pub struct Publisher {
    shared: Arc<Shared>,
    last: Option<Revision>,
    accept: Option<JoinHandle<()>>,
}

impl Publisher {
    /// Abre `\\.\pipe\<name>`, solo para el usuario actual. `accept_peer`
    /// decide por identidad (PID, imagen) si se atiende a un suscriptor.
    ///
    /// # Errors
    /// Si el nombre ya lo tiene otro proceso o el sistema no puede crear el pipe.
    pub fn new(
        name: &str,
        accept_peer: impl Fn(&Peer) -> bool + Send + Sync + 'static,
    ) -> Result<Self, Error> {
        let stop = Arc::new(Event::new()?);
        let mut listener = Listener::new(name, Arc::clone(&stop), IO_TIMEOUT)?;
        let first = listener.instance()?;
        let shared = Arc::new(Shared {
            latest: Slot::new(),
            stop,
            accept_peer: Box::new(accept_peer),
        });
        let accept = {
            let shared = Arc::clone(&shared);
            thread::Builder::new()
                .name("ipc-accept".into())
                .spawn(move || accept_loop(listener, first, &shared))?
        };
        Ok(Self {
            shared,
            last: None,
            accept: Some(accept),
        })
    }

    /// Publica la foto más reciente. No espera a nadie: los suscriptores lentos
    /// se saltan las intermedias.
    ///
    /// # Errors
    /// [`Error::NotNewer`] si `(epoch, sequence)` no supera a la última publicada.
    pub fn publish(&mut self, snapshot: Arc<Snapshot>) -> Result<(), Error> {
        let revision = Revision::of(&snapshot);
        if self.last.is_some_and(|last| !revision.follows(last)) {
            return Err(Error::NotNewer);
        }
        self.last = Some(revision);
        self.shared.latest.put(snapshot);
        Ok(())
    }
}

impl Drop for Publisher {
    fn drop(&mut self) {
        self.shared.stop.set();
        self.shared.latest.close();
        if let Some(accept) = self.accept.take() {
            let _ = accept.join();
        }
    }
}

fn accept_loop(mut listener: Listener, first: Pipe, shared: &Arc<Shared>) {
    let mut clients: Vec<JoinHandle<()>> = Vec::new();
    let mut next = first;
    loop {
        let accepted = next.accept();
        if shared.stop.is_set() {
            break;
        }
        // La siguiente instancia se abre antes de atender a esta, para que un
        // segundo suscriptor no encuentre el pipe sin instancias libres.
        let Ok(fresh) = listener.instance() else {
            break;
        };
        let connected = std::mem::replace(&mut next, fresh);
        clients.retain(|client| !client.is_finished());
        if accepted.is_ok() && clients.len() < MAX_CLIENTS {
            let shared = Arc::clone(shared);
            clients.push(thread::spawn(move || {
                // Un suscriptor que falla solo se pierde a sí mismo: reconectará.
                let _ = serve(connected, &shared);
            }));
        }
    }
    for client in clients {
        let _ = client.join();
    }
}

fn serve(mut pipe: Pipe, shared: &Shared) -> Result<(), Error> {
    if !(shared.accept_peer)(&pipe.client_peer()?) {
        return Err(Error::Peer);
    }
    let Message::Hello {
        min_version,
        max_version,
        cursor,
    } = read_message(&mut pipe)?
    else {
        return Err(Error::Protocol("se esperaba Hello"));
    };
    let Some(version) = negotiate(min_version, max_version) else {
        let reason = format!("versiones {min_version}..={max_version} no soportadas");
        write_message(&mut pipe, &Message::Reject { reason })?;
        return Err(Error::Version { got: max_version });
    };
    write_message(&mut pipe, &Message::Welcome { version })?;

    // El cursor del suscriptor cuenta como ya enviado: si sigue siendo válido
    // (misma época), no se le repite lo que ya tiene.
    let (mut sent, mut seen) = (cursor, 0);
    loop {
        match shared.latest.wait(seen, HEARTBEAT) {
            Wait::Closed => return Ok(()),
            Wait::Timeout => write_message(&mut pipe, &Message::Ping)?,
            Wait::Value(snapshot, generation) => {
                seen = generation;
                let revision = Revision::of(&snapshot);
                if revision.is_newer(sent) {
                    write_message(&mut pipe, &Message::Snapshot(SnapshotDto::from(&*snapshot)))?;
                    sent = Some(revision);
                }
            }
        }
    }
}

/// Clientes en bruto, sin `Subscriber`: lo que un par defectuoso u hostil puede hacer.
#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::time::Instant;

    use vantare_domain::Quality;

    use super::*;
    use crate::codec::{MAX_MESSAGE, hello};
    use crate::pipe::connect;

    fn start(tag: &str) -> (Publisher, String) {
        let name = format!("vantare-test-pub-{tag}-{}", std::process::id());
        (Publisher::new(&name, |_| true).unwrap(), name)
    }

    fn raw_client(name: &str) -> Pipe {
        let stop = Arc::new(Event::new().unwrap());
        connect(name, stop, Duration::from_secs(2)).unwrap()
    }

    fn big(sequence: u64) -> Arc<Snapshot> {
        let mut snapshot = Snapshot {
            sequence,
            ..Snapshot::default()
        };
        snapshot.state.session.track_name = Quality::Reliable("x".repeat(300_000));
        Arc::new(snapshot)
    }

    #[test]
    fn incompatible_version_is_rejected_in_the_handshake() {
        let (_publisher, name) = start("version");
        let mut client = raw_client(&name);
        let hello = Message::Hello {
            min_version: 99,
            max_version: 100,
            cursor: None,
        };
        write_message(&mut client, &hello).unwrap();
        assert!(matches!(
            read_message(&mut client),
            Ok(Message::Reject { .. })
        ));
        // Y el productor cierra: fin de flujo.
        assert!(matches!(read_message(&mut client), Err(Error::Io(_))));
    }

    #[test]
    fn oversized_or_unexpected_first_message_closes_the_connection() {
        let (_publisher, name) = start("hostile");

        let mut client = raw_client(&name);
        let header = u32::try_from(MAX_MESSAGE + 1).unwrap().to_le_bytes();
        client.write_all(&header).unwrap();
        assert!(matches!(read_message(&mut client), Err(Error::Io(_))));

        let mut client = raw_client(&name);
        write_message(&mut client, &Message::Ping).unwrap();
        assert!(matches!(read_message(&mut client), Err(Error::Io(_))));
    }

    #[test]
    fn a_client_that_never_speaks_does_not_hold_up_shutdown() {
        let (publisher, name) = start("silent");
        let _client = raw_client(&name);
        std::thread::sleep(Duration::from_millis(100)); // ya en su plazo de saludo (5 s)
        let began = Instant::now();
        drop(publisher);
        assert!(began.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn a_client_that_never_reads_blocks_neither_publish_nor_shutdown() {
        let (mut publisher, name) = start("stalled");
        let mut client = raw_client(&name);
        write_message(&mut client, &hello(None)).unwrap();
        assert!(matches!(
            read_message(&mut client),
            Ok(Message::Welcome { .. })
        ));

        // Cada foto (300 KB) desborda el búfer del pipe: el hilo de ese cliente se queda
        // bloqueado en la escritura, y el publicador tiene que seguir sin esperar.
        let mut slowest = Duration::ZERO;
        for sequence in 1..=30 {
            let began = Instant::now();
            publisher.publish(big(sequence)).unwrap();
            slowest = slowest.max(began.elapsed());
            std::thread::sleep(Duration::from_millis(5));
        }
        assert!(slowest < Duration::from_millis(50), "{slowest:?}");

        let began = Instant::now();
        drop(publisher); // la escritura bloqueada se cancela
        assert!(began.elapsed() < Duration::from_secs(2));
    }
}
