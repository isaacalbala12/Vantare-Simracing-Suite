//! Lado del núcleo: acepta suscriptores y les sirve siempre la última foto.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

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
    demands: Arc<[AtomicU64; MAX_CLIENTS]>,
    demand_revision: Arc<AtomicU64>,
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
            demands: Arc::new(std::array::from_fn(|_| AtomicU64::new(0))),
            demand_revision: Arc::new(AtomicU64::new(0)),
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

    /// Observa la unión de demanda. Leer primero revisión y después máscara;
    /// aplicar cada revisión al núcleo, incluso si la máscara no ha cambiado.
    pub fn demand_source(&self) -> DemandSource {
        DemandSource(
            Arc::clone(&self.shared.demands),
            Arc::clone(&self.shared.demand_revision),
        )
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

/// Unión de los consumidores conectados: adquisición solo lee ocho atómicos.
#[derive(Clone)]
pub struct DemandSource(Arc<[AtomicU64; MAX_CLIENTS]>, Arc<AtomicU64>);
impl DemandSource {
    pub fn revision(&self) -> u64 {
        self.1.load(Ordering::Acquire)
    }
    pub fn mask(&self) -> u64 {
        self.0
            .iter()
            .fold(0, |mask, slot| mask | slot.load(Ordering::Acquire))
            & !(1 << 63)
    }
    pub fn current(&self) -> crate::Demand {
        crate::Demand::from_mask(self.mask())
    }
}
struct DemandLease<'a>(&'a AtomicU64, &'a AtomicU64);
impl Drop for DemandLease<'_> {
    fn drop(&mut self) {
        self.0.store(0, Ordering::Release);
        self.1.fetch_add(1, Ordering::Release);
    }
}

impl Shared {
    fn register(&self, requested: &crate::Demand) -> Result<DemandLease<'_>, Error> {
        requested.validate()?;
        let Some(slot) = self.demands.iter().find(|slot| {
            slot.compare_exchange(
                0,
                requested.mask() | (1 << 63),
                Ordering::AcqRel,
                Ordering::Relaxed,
            )
            .is_ok()
        }) else {
            return Err(Error::Protocol("demasiados consumidores de demanda"));
        };
        let lease = DemandLease(slot, &self.demand_revision);
        self.demand_revision.fetch_add(1, Ordering::Release);
        Ok(lease)
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
        let fresh = match listener.instance() {
            Ok(fresh) => fresh,
            Err(error) => {
                eprintln!("IPC: aceptación detenida al crear instancia: {error}");
                break;
            }
        };
        let connected = std::mem::replace(&mut next, fresh);
        for client in clients.extract_if(.., |client| client.is_finished()) {
            join_client(client);
        }
        if accepted.is_ok() && clients.len() < MAX_CLIENTS {
            let shared = Arc::clone(shared);
            clients.push(thread::spawn(move || {
                // Un suscriptor que falla solo se pierde a sí mismo: reconectará.
                let _ = serve(connected, &shared);
            }));
        }
    }
    for client in clients {
        join_client(client);
    }
}

fn join_client(client: JoinHandle<()>) {
    if client.join().is_err() {
        eprintln!("IPC: hilo de suscriptor terminó con pánico");
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
        demand,
    } = read_message(&mut pipe)?
    else {
        return Err(Error::Protocol("se esperaba Hello"));
    };
    let Some(version) = negotiate(min_version, max_version) else {
        let reason = format!("versiones {min_version}..={max_version} no soportadas");
        write_message(&mut pipe, &Message::Reject { reason })?;
        return Err(Error::Version { got: max_version });
    };
    // Registrar antes de responder, pero no servir una foto anterior a la demanda.
    let before_demand = if demand.is_some() {
        match shared.latest.wait(0, Duration::ZERO) {
            Wait::Value(snapshot, generation) => Some((Revision::of(&snapshot), generation)),
            Wait::Timeout | Wait::Closed => None,
        }
    } else {
        None
    };
    let requested = demand.clone().unwrap_or_else(crate::Demand::all);
    let _lease = shared.register(&requested)?;
    write_message(&mut pipe, &Message::Welcome { version })?;
    let start = Instant::now();
    let mut last_message = start;
    let mut cadence = crate::demand::Cadence::default();
    let mut boundary = None;

    // El cursor del suscriptor cuenta como ya enviado: si sigue siendo válido
    // (misma época), no se le repite lo que ya tiene.
    let (mut sent, mut seen) = (cursor, 0);
    if let Some((revision, generation)) = before_demand {
        sent = Some(revision);
        seen = generation;
    }
    loop {
        match shared.latest.wait(seen, HEARTBEAT) {
            Wait::Closed => return Ok(()),
            Wait::Timeout => {
                write_message(&mut pipe, &Message::Ping)?;
                last_message = Instant::now();
            }
            Wait::Value(snapshot, generation) => {
                seen = generation;
                let revision = Revision::of(&snapshot);
                if revision.is_newer(sent) {
                    if demand.is_some() {
                        let mut car_ids: Vec<_> =
                            snapshot.state.cars.iter().map(|car| car.id).collect();
                        car_ids.sort_unstable_by_key(|id| id.0);
                        let next_boundary = (
                            snapshot.epoch,
                            snapshot.state.session.id,
                            snapshot.state.player.as_ref().map(|p| p.car),
                            snapshot.state.source_state,
                            car_ids,
                        );
                        let reset = boundary.as_ref() != Some(&next_boundary);
                        boundary = Some(next_boundary);
                        let delivered = cadence.due(&requested, start.elapsed(), reset);
                        if delivered.is_empty() {
                            if last_message.elapsed() >= HEARTBEAT {
                                write_message(&mut pipe, &Message::Ping)?;
                                last_message = Instant::now();
                            }
                            sent = Some(revision);
                            continue;
                        }
                        let dto = {
                            let _span = crate::profiling::begin(crate::profiling::Stage::Dto);
                            SnapshotDto::selected(&snapshot, &delivered)?
                        };
                        write_message(
                            &mut pipe,
                            &Message::DemandSnapshot {
                                snapshot: dto,
                                requested: requested.clone(),
                                delivered,
                            },
                        )?;
                    } else {
                        write_message(
                            &mut pipe,
                            &Message::Snapshot(SnapshotDto::from(&*snapshot)),
                        )?;
                    }
                    last_message = Instant::now();
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
            demand: None,
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
    #[test]
    fn connected_consumers_union_demand_and_layout_reconnect_hydrates_the_next_photo() {
        use crate::{Demand, Signal, SignalState, Subscriber};
        fn wait_for(source: &DemandSource, wanted: &Demand) {
            let deadline = Instant::now() + Duration::from_secs(2);
            while source.current() != *wanted {
                assert!(Instant::now() < deadline, "demanda no aceptada");
                std::thread::yield_now();
            }
        }
        let (mut publisher, name) = start("demand");
        publisher
            .publish(Arc::new(crate::codec::tests::rich_snapshot(1, 0)))
            .expect("base");
        let source = publisher.demand_source();
        let mut pedals = Demand::default();
        pedals.request(Signal::Pedals, 0);
        let mut first =
            Subscriber::connect_requested(&name, pedals.clone(), |_| true).expect("pedales");
        wait_for(&source, &pedals);
        publisher
            .publish(Arc::new(crate::codec::tests::rich_snapshot(1, 1)))
            .expect("tick");
        let photo = first
            .next_photo(Duration::from_secs(2))
            .expect("foto solicitada");
        assert_eq!(photo.signal_state(Signal::Delta), SignalState::NotRequested);
        assert_eq!(photo.signal_state(Signal::Pedals), SignalState::Requested);
        assert_eq!(
            photo.snapshot.state.player.expect("jugador").delta_best_s,
            Quality::Unavailable
        );
        let mut delta = Demand::default();
        delta.request(Signal::Delta, 0);
        let mut second =
            Subscriber::connect_requested(&name, delta.clone(), |_| true).expect("delta");
        let mut union = pedals.clone();
        union.union(&delta);
        wait_for(&source, &union);
        publisher
            .publish(Arc::new(crate::codec::tests::rich_snapshot(1, 2)))
            .expect("tick con delta");
        assert_eq!(
            second
                .next_photo(Duration::from_secs(2))
                .expect("delta")
                .demand,
            delta
        );
        drop(second);
        wait_for(&source, &pedals);
        first.set_demand(delta.clone()).expect("cambio de layout");
        wait_for(&source, &delta);
        publisher
            .publish(Arc::new(crate::codec::tests::rich_snapshot(1, 3)))
            .expect("siguiente tick");
        let photo = first
            .next_photo(Duration::from_secs(2))
            .expect("hidratación");
        assert_eq!(
            photo.signal_state(Signal::Pedals),
            SignalState::NotRequested
        );
        assert_eq!(
            photo.snapshot.state.player.expect("jugador").delta_best_s,
            crate::codec::tests::rich_snapshot(1, 3)
                .state
                .player
                .expect("jugador")
                .delta_best_s
        );
    }
    #[test]
    fn empty_demand_keeps_heartbeats_while_acquisition_continues() {
        let (mut publisher, name) = start("empty-demand");
        let source = publisher.demand_source();
        let mut subscriber =
            crate::Subscriber::connect_requested(&name, crate::Demand::default(), |_| true)
                .expect("sin widgets");
        let deadline = Instant::now() + Duration::from_secs(3);
        while subscriber.activity() == 0 {
            assert!(Instant::now() < deadline, "saludo pendiente");
            std::thread::yield_now();
        }
        let revision = source.revision();
        let activity = subscriber.activity();
        let mut sequence = 0;
        while subscriber.activity() == activity {
            assert!(
                Instant::now() < deadline,
                "sin latido entre fotos no pedidas"
            );
            sequence += 1;
            publisher
                .publish(Arc::new(Snapshot {
                    sequence,
                    ..Snapshot::default()
                }))
                .expect("adquisición");
            std::thread::yield_now();
        }
        assert!(subscriber.next_photo(Duration::ZERO).is_none());
        assert_eq!(source.revision(), revision, "sin reconexión espuria");
    }
}
