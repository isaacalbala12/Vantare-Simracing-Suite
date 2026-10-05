//! Lado de overlays: mantiene la conexión con el núcleo y guarda la última foto.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use vantare_domain::Snapshot;

use crate::codec::{
    Message, Revision, hello, hello_requested, read_message, supports, write_message,
};
use crate::latest::{Slot, Wait};
use crate::pipe::{self, Event, IO_TIMEOUT, Peer};
use crate::{Demand, Error, Photo};

/// Espera entre intentos de conexión (el núcleo puede no haber arrancado).
const RETRY: Duration = Duration::from_millis(250);

pub struct Subscriber {
    name: String,
    accept_peer: Arc<dyn Fn(&Peer) -> bool + Send + Sync>,
    demand: Option<Demand>,
    latest: Arc<Slot<Photo>>,
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
        accept_peer: impl Fn(&Peer) -> bool + Send + Sync + 'static,
    ) -> Result<Self, Error> {
        Self::start(name, Arc::new(accept_peer), None)
    }

    pub fn connect_requested(
        name: &str,
        demand: Demand,
        accept_peer: impl Fn(&Peer) -> bool + Send + Sync + 'static,
    ) -> Result<Self, Error> {
        demand.validate()?;
        Self::start(name, Arc::new(accept_peer), Some(demand))
    }

    /// Reconexión inmediata: descarta la casilla anterior y fuerza hidratación.
    /// Cancelar la E/S y cerrar el hilo es acotado por el transporte existente.
    /// El reemplazo se crea antes de cerrar el anterior: un fallo conserva la
    /// conexión, con un breve solapamiento de clientes durante el cambio exitoso.
    pub fn set_demand(&mut self, demand: Demand) -> Result<(), Error> {
        self.change_demand(demand, |this, demand| {
            Self::start(&this.name, Arc::clone(&this.accept_peer), Some(demand))
        })
    }

    fn change_demand(
        &mut self,
        demand: Demand,
        start: impl FnOnce(&Self, Demand) -> Result<Self, Error>,
    ) -> Result<(), Error> {
        demand.validate()?;
        if self.demand.as_ref() != Some(&demand) {
            let next = start(self, demand)?;
            *self = next;
        }
        Ok(())
    }

    fn start(
        name: &str,
        accept_peer: Arc<dyn Fn(&Peer) -> bool + Send + Sync>,
        demand: Option<Demand>,
    ) -> Result<Self, Error> {
        let latest = Arc::new(Slot::new());
        let stop = Arc::new(Event::new()?);
        let activity = Arc::new(AtomicU64::new(0));
        let worker = {
            let (name, latest, stop) = (name.to_owned(), Arc::clone(&latest), Arc::clone(&stop));
            let activity = Arc::clone(&activity);
            let accept_peer = Arc::clone(&accept_peer);
            let demand = demand.clone();
            thread::Builder::new()
                .name("ipc-subscriber".into())
                .spawn(move || {
                    run(
                        &name,
                        &stop,
                        &latest,
                        &*accept_peer,
                        &activity,
                        demand.as_ref(),
                    );
                })?
        };
        Ok(Self {
            name: name.to_owned(),
            accept_peer,
            demand,
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
        self.next_photo(timeout).map(|photo| photo.snapshot)
    }

    pub fn next_photo(&mut self, timeout: Duration) -> Option<Photo> {
        match self.latest.wait(self.seen, timeout) {
            Wait::Value(snapshot, generation) => {
                self.seen = generation;
                Some((*snapshot).clone())
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
    latest: &Slot<Photo>,
    accept_peer: &dyn Fn(&Peer) -> bool,
    activity: &AtomicU64,
    demand: Option<&Demand>,
) {
    // El cursor sobrevive a las reconexiones: es lo que evita repeticiones
    // mientras el productor siga en su época.
    let mut cursor = None;
    let mut reported_incompatible = false;
    loop {
        // Cualquier error (par caído, mudo o hostil) se resuelve igual: reconectar.
        if let Err(error) = session(
            name,
            stop,
            latest,
            accept_peer,
            &mut cursor,
            activity,
            demand,
        ) && matches!(error, Error::Version { .. } | Error::Rejected(_))
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
    latest: &Slot<Photo>,
    accept_peer: &dyn Fn(&Peer) -> bool,
    cursor: &mut Option<Revision>,
    activity: &AtomicU64,
    demand: Option<&Demand>,
) -> Result<(), Error> {
    let mut pipe = pipe::connect(name, Arc::clone(stop), IO_TIMEOUT)?;
    if !accept_peer(&pipe.server_peer()?) {
        return Err(Error::Peer);
    }
    write_message(
        &mut pipe,
        &demand.map_or_else(
            || hello(*cursor),
            |demand| hello_requested(None, demand.clone()),
        ),
    )?;
    match read_message(&mut pipe)? {
        Message::Welcome { version } if supports(version) => {}
        Message::Welcome { version } => return Err(Error::Version { got: version }),
        Message::Reject { reason } => return Err(Error::Rejected(reason)),
        _ => return Err(Error::Protocol("se esperaba Welcome")),
    }
    activity.fetch_add(1, Ordering::Relaxed);
    let mut previous: Option<crate::dto::SnapshotDto> = None;
    let mut body = Vec::new();
    loop {
        match crate::codec::read_buffered(&mut pipe, &mut body)? {
            Message::Ping => {}
            Message::Snapshot(mut dto) => {
                if demand.is_some() {
                    return Err(Error::Protocol("se esperaba foto con demanda"));
                }
                dto.restore(None, &Demand::all(), &Demand::all())?;
                let revision = Revision {
                    epoch: dto.epoch,
                    sequence: dto.sequence,
                };
                if revision.is_newer(*cursor) {
                    latest.put(Arc::new(Photo::full(Arc::new(Snapshot::try_from(dto)?))));
                    *cursor = Some(revision);
                }
            }
            Message::DemandSnapshot {
                mut snapshot,
                requested,
                delivered,
            } => {
                requested.validate()?;
                // La lista delivered es parcial: las identidades pueden quedar retenidas.
                if delivered.mask() & !requested.mask() != 0 {
                    return Err(Error::Protocol("señal no solicitada"));
                }
                if demand != Some(&requested) || !requested.covers(&delivered) {
                    return Err(Error::Protocol("entrega fuera de la demanda"));
                }
                let revision = Revision {
                    epoch: snapshot.epoch,
                    sequence: snapshot.sequence,
                };
                if revision.is_newer(*cursor) {
                    if previous
                        .as_ref()
                        .is_some_and(|old| !snapshot.same_scope(old, &delivered))
                    {
                        previous = None;
                    }
                    if previous.is_none() && !delivered.covers(&requested) {
                        return Err(Error::Protocol("primera entrega sin hidratación completa"));
                    }
                    snapshot.restore(previous.as_ref(), &requested, &delivered)?;
                    let decoded = Snapshot::try_from(snapshot.clone())?;
                    previous = Some(snapshot);
                    latest.put(Arc::new(Photo {
                        snapshot: Arc::new(decoded),
                        demand: requested,
                    }));
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
    fn failed_demand_replacement_keeps_the_old_worker_alive() {
        use crate::{Publisher, Signal};
        let name = format!("vantare-demand-transaction-{}", std::process::id());
        let mut publisher = Publisher::new(&name, |_| true).expect("publicador");
        let mut old = Demand::default();
        old.request(Signal::TrackName, 10);
        let mut subscriber =
            Subscriber::connect_requested(&name, old.clone(), |_| true).expect("suscriptor");
        let stop = Arc::clone(&subscriber.stop);
        let mut wanted = old.clone();
        wanted.request(Signal::Weather, 10);
        let result = subscriber.change_demand(wanted.clone(), |_, _| {
            Err(std::io::Error::other("fallo de recursos inyectado").into())
        });
        assert!(result.is_err());
        assert!(
            !stop.is_set(),
            "no cancelar el trabajador ante creación fallida"
        );
        assert!(subscriber.worker.is_some());
        subscriber.set_demand(old).expect("demanda anterior");
        assert!(Arc::ptr_eq(&stop, &subscriber.stop));
        let demand = publisher.demand_source();
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        while demand.revision() == 0 {
            assert!(
                std::time::Instant::now() < deadline,
                "handshake del trabajador conservado"
            );
            thread::yield_now();
        }
        publisher
            .publish(Arc::new(Snapshot {
                epoch: 1,
                sequence: 1,
                ..Snapshot::default()
            }))
            .expect("foto tras fallo");
        assert_eq!(
            subscriber
                .next(Duration::from_secs(3))
                .expect("conexión preservada")
                .sequence,
            1
        );
        subscriber.set_demand(wanted).expect("reintento");
        assert!(stop.is_set());
        assert!(subscriber.worker.is_some());
        assert!(!subscriber.stop.is_set());
    }

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
