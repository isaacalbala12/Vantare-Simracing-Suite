//! Fuentes de `Snapshot`s para [`crate::run_with_rights`]: pipe del núcleo o
//! carrera sintética local para probar los widgets sin núcleo.

use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::{Duration, Instant};
use vantare_ipc::{Demand, Photo};

use vantare_domain::Quality::{Estimated, Reliable};
use vantare_domain::{
    Capabilities, Capability, Car, CarId, Class, ClassId, Driver, Flag, FlagKind, FlagScope, Gap,
    Player, Pose, Session, SessionKind, Snapshot, State, Telemetry,
};

/// Snapshots que publica el núcleo en el pipe `<name>`. El `Subscriber` se
/// conecta y reconecta solo (el núcleo puede arrancar después o reiniciarse con
/// otra época); esto solo reenvía lo más reciente a `run`.
///
/// # Errors
/// Si el sistema no puede crear la conexión o el hilo.
#[derive(Clone)]
pub struct DemandHandle(Arc<Mutex<Demand>>);
impl DemandHandle {
    pub fn new(demand: Demand) -> Self {
        Self(Arc::new(Mutex::new(demand)))
    }
    pub fn set(&self, demand: Demand) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = demand;
    }
    fn current(&self) -> Demand {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

pub fn pipe_feed(name: &str) -> Result<flume::Receiver<Arc<Snapshot>>, vantare_ipc::Error> {
    start_feed(name, None, |photo| photo.snapshot)
}

pub fn pipe_feed_requested(
    name: &str,
    demand: Demand,
) -> Result<flume::Receiver<Arc<Snapshot>>, vantare_ipc::Error> {
    start_feed(name, Some(DemandHandle::new(demand)), |photo| {
        photo.snapshot
    })
}

pub fn layout_feed(
    name: &str,
    handle: DemandHandle,
) -> Result<flume::Receiver<Photo>, vantare_ipc::Error> {
    start_feed(name, Some(handle), std::convert::identity)
}

fn start_feed<T: Send + 'static>(
    name: &str,
    handle: Option<DemandHandle>,
    convert: impl Fn(Photo) -> T + Send + 'static,
) -> Result<flume::Receiver<T>, vantare_ipc::Error> {
    let mut requested = handle
        .as_ref()
        .map_or_else(Demand::all, DemandHandle::current);
    // El pipe es solo del usuario actual (ACL del núcleo).
    let mut subscriber = if handle.is_some() {
        vantare_ipc::Subscriber::connect_requested(name, requested.clone(), |_| true)?
    } else {
        vantare_ipc::Subscriber::connect(name, |_| true)?
    };
    let (tx, rx) = flume::bounded(4);
    let oldest = rx.clone();
    thread::Builder::new()
        .name("pipe-feed".into())
        .spawn(move || {
            let start = Instant::now();
            let mut health = PipeHealth::default();
            let mut activity = subscriber.activity();
            while tx.receiver_count() > 1 {
                if let Some(handle) = &handle {
                    let next = handle.current();
                    if next != requested {
                        if let Err(error) = subscriber.set_demand(next.clone()) {
                            eprintln!("actualizar demanda: {error}");
                            thread::sleep(Duration::from_millis(50));
                            continue;
                        }
                        requested = next;
                        health = PipeHealth::default();
                    }
                }
                let incoming = subscriber.next_photo(Duration::from_millis(50));
                let current_activity = subscriber.activity();
                if current_activity != activity {
                    health.heard(start.elapsed());
                    activity = current_activity;
                }
                let next = if let Some(photo) = incoming {
                    health.received(Arc::clone(&photo.snapshot), start.elapsed());
                    Some(photo)
                } else {
                    health.silence(start.elapsed()).map(|snapshot| Photo {
                        snapshot,
                        demand: requested.clone(),
                    })
                };
                if let Some(photo) = next {
                    send_latest(&tx, &oldest, convert(photo));
                }
            }
        })?;
    Ok(rx)
}

/// Mismo plazo que el timeout de E/S del pipe; reloj local, no el del simulador.
const PIPE_SILENCE_LIMIT: Duration = Duration::from_secs(5);

#[derive(Default)]
struct PipeHealth {
    last: Option<Arc<Snapshot>>,
    received_at: Duration,
    lost: bool,
}

impl PipeHealth {
    fn heard(&mut self, now: Duration) {
        self.received_at = now;
    }

    fn received(&mut self, snapshot: Arc<Snapshot>, now: Duration) {
        self.last = Some(snapshot);
        self.received_at = now;
        self.lost = false;
    }

    fn silence(&mut self, now: Duration) -> Option<Arc<Snapshot>> {
        if self.lost || now.saturating_sub(self.received_at) < PIPE_SILENCE_LIMIT {
            return None;
        }
        let mut snapshot = self.last.as_deref()?.clone();
        vantare_domain::degrade(&mut snapshot.state);
        snapshot.state.source_state = vantare_domain::SourceState::Lost;
        self.lost = true;
        Some(Arc::new(snapshot))
    }
}

fn send_latest<T>(tx: &flume::Sender<T>, oldest: &flume::Receiver<T>, mut snapshot: T) {
    loop {
        match tx.try_send(snapshot) {
            Ok(()) | Err(flume::TrySendError::Disconnected(_)) => return,
            Err(flume::TrySendError::Full(value)) => {
                snapshot = value;
                // Si run acaba de vaciarlo, se reintenta el envío igualmente.
                let _ = oldest.try_recv();
            }
        }
    }
}

/// Instantáneas por segundo de la secuencia sintética.
const RATE_HZ: u64 = 30;
const CARS: u32 = 22;
const PLAYER: u32 = 9;

fn all_fresh() -> Capabilities {
    let fresh = Capability::Fresh;
    Capabilities {
        session_clock: fresh,
        positions: fresh,
        lap_times: fresh,
        gaps: fresh,
        pit_status: fresh,
        flags: fresh,
        spatial: fresh,
        driver_inputs: fresh,
        powertrain: fresh,
        fuel: fresh,
        delta: fresh,
        sectors: fresh,
        lap_progress: fresh,
        weather: fresh,
        damage: fresh,
    }
}

fn car(id: u32, name: String, position: u32) -> Car {
    Car {
        id: CarId(id),
        driver: Driver {
            name,
            ..Driver::default()
        },
        class: Some(Class {
            id: ClassId(1),
            name: "LMP2".into(),
        }),
        position: Reliable(position),
        ..Car::default()
    }
}

/// Escena `standings-44` de `parity/SPEC.md` §3: práctica, 44 coches, jugador
/// en P9, reloj 58:12, sin número, gap ni mejor vuelta. Es la que se compara
/// con `reference/standings-44.png`.
pub fn fixed() -> Snapshot {
    const TOP: [&str; 10] = [
        "DRIVER-012",
        "DRIVER-007",
        "DRIVER-019",
        "DRIVER-013",
        "DRIVER-023",
        "DRIVER-035",
        "DRIVER-016",
        "DRIVER-025",
        "PLAYER",
        "DRIVER-030",
    ];
    let cars = (1..=44)
        .map(|position| {
            let name = TOP
                .get(position as usize - 1)
                .map_or_else(|| format!("DRIVER-{position:03}"), |name| (*name).into());
            car(position, name, position)
        })
        .collect();
    Snapshot {
        epoch: 1,
        sequence: 1,
        state: State {
            source_state: vantare_domain::SourceState::Live,
            capabilities: Capabilities {
                positions: Capability::Fresh,
                session_clock: Capability::Fresh,
                ..Capabilities::default()
            },
            session: Session {
                kind: Reliable(SessionKind::Practice),
                remaining_s: Reliable(3492.4),
                track_name: Reliable("Circuit de Barcelona".into()),
                ..Session::default()
            },
            cars,
            player: Some(Player {
                car: CarId(9),
                ..Player::default()
            }),
            ..State::default()
        },
        ..Snapshot::default()
    }
}

/// Carrera de 22 coches de estrés: cambia todo en cada instantánea
/// (reordenaciones cada pocos segundos, gaps continuos, boxes frecuentes).
pub fn synthetic(tick: u64) -> Snapshot {
    race(tick, false)
}

/// Carrera de 22 coches con el ritmo de una real: la clasificación se reordena
/// cada varios segundos; los gaps, vueltas y mejores vueltas de cada coche solo
/// cambian al cruzar meta (una vez por vuelta, escalonados entre coches); el
/// reloj avanza cada segundo. Radar y pedales sí cambian continuamente, como la
/// telemetría del jugador.
pub fn realistic(tick: u64) -> Snapshot {
    race(tick, true)
}

/// Escena quieta (`fixed`) con la secuencia avanzando: ningún ViewModel cambia.
pub fn quiet(tick: u64) -> Snapshot {
    Snapshot {
        sequence: tick + 1,
        ..fixed()
    }
}

/// Carrera determinista en función del tiempo: reordenaciones, paradas en boxes,
/// mejoras de vuelta, coches alrededor del jugador y pedales.
fn race(tick: u64, realistic: bool) -> Snapshot {
    let t = tick as f64 / RATE_HZ as f64;
    // Orden por una clave que oscila: los coches se adelantan de forma suave.
    let mut order: Vec<u32> = (1..=CARS).collect();
    let key = |id: u32| {
        // La realista adelanta unas 4 veces por minuto entre los 10 primeros.
        let (speed, amplitude) = if realistic { (0.008, 2.0) } else { (0.3, 2.0) };
        f64::from(id) + amplitude * (t * speed + f64::from(id)).sin()
    };
    order.sort_by(|a, b| key(*a).total_cmp(&key(*b)));

    let mut previous_gap = 0.0;
    let cars = order
        .iter()
        .enumerate()
        .map(|(index, &id)| {
            let position = index as u32 + 1;
            let phase = f64::from(id);
            // Vuelta en curso de este coche: 90 s, escalonadas entre coches.
            let lap = ((t + 4.0 * phase) / 90.0).floor();
            let gap = 0.45 * index as f64
                + if realistic {
                    0.3 * (lap + phase).sin()
                } else {
                    0.05 * (t * 0.7 + phase).sin()
                };
            let mut car = car(id, format!("PILOTO {id:02}"), position);
            car.number = id.to_string();
            car.laps = Reliable(1 + lap as u32);
            car.best_lap_s = Reliable(
                100.0 + 0.13 * phase
                    - if realistic {
                        ((t + 7.0 * phase) / 120.0).floor()
                    } else {
                        (t / 20.0).floor()
                    } * 0.01,
            );
            car.last_lap_s = Reliable(
                101.0
                    + 0.11 * phase
                    + if realistic {
                        0.05 * (lap + phase).sin()
                    } else {
                        0.0
                    },
            );
            car.gap_leader = Reliable(Gap::Time { seconds: gap });
            car.gap_ahead = Estimated(Gap::Time {
                seconds: (gap - previous_gap).max(0.0),
            });
            car.in_pits = Reliable(if realistic {
                // Un coche distinto entra 20 s cada 5 minutos.
                t % 300.0 < 20.0 && u64::from(id) == (t / 300.0) as u64 % u64::from(CARS) + 1
            } else {
                (t / 6.0) as u64 % 11 == u64::from(id) % 11
            });
            // El jugador es el origen del radar; los demás oscilan a su alrededor.
            car.pose = Reliable(if id == PLAYER {
                Pose::default()
            } else {
                Pose {
                    x_m: 30.0 * (t * 0.4 + phase).sin(),
                    y_m: 12.0 * (t * 0.3 + 2.1 * phase).sin(),
                    yaw_rad: 0.0,
                }
            });
            previous_gap = gap;
            car
        })
        .collect();

    let wave = (t * 1.3).sin();
    Snapshot {
        epoch: 1,
        sequence: tick + 1,
        state: State {
            source_state: vantare_domain::SourceState::Live,
            capabilities: all_fresh(),
            session: Session {
                kind: Reliable(SessionKind::Race),
                remaining_s: Reliable((3600.0 - t).max(0.0)),
                track_name: Reliable("Circuit de Barcelona".into()),
                laps_remaining: Estimated(12),
                ..Session::default()
            },
            flags: Reliable(vec![Flag {
                kind: FlagKind::Green,
                scope: FlagScope::Session,
            }]),
            cars,
            player: Some(Player {
                car: CarId(PLAYER),
                telemetry: Telemetry {
                    throttle: Reliable((0.5 + 0.5 * wave).clamp(0.0, 1.0)),
                    brake: Reliable((-wave).clamp(0.0, 1.0)),
                    clutch: Reliable(0.0),
                    steering: vantare_domain::Quality::Unavailable,
                    gear: Reliable(1 + (t as i64 % 6) as i8),
                    speed_mps: Reliable(45.0 + 25.0 * wave),
                    engine_speed_rad_s: Reliable(700.0 + 200.0 * wave),
                },
                ..Player::default()
            }),
        },
        ..Snapshot::default()
    }
}

/// Canal con la secuencia sintética a 30 Hz; `VANTARE_FUENTE` elige cuál:
/// `realista` (por defecto), `estres` o `quieta`. El hilo termina cuando se
/// suelta el receptor.
pub fn local_feed() -> flume::Receiver<Arc<Snapshot>> {
    let scene: fn(u64) -> Snapshot = match std::env::var("VANTARE_FUENTE").as_deref() {
        Ok("estres") => synthetic,
        Ok("quieta") => quiet,
        _ => realistic,
    };
    let (sender, receiver) = flume::bounded(4);
    thread::spawn(move || {
        for tick in 0.. {
            if sender.send(Arc::new(scene(tick))).is_err() {
                break;
            }
            thread::sleep(Duration::from_millis(1000 / RATE_HZ));
        }
    });
    receiver
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{format::Preferences, pedals, radar, standings};

    #[test]
    fn pipe_silence_emits_one_lost_copy_without_changing_revision() {
        let mut health = PipeHealth::default();
        assert!(health.silence(Duration::from_secs(10)).is_none());
        let fresh = Arc::new(synthetic(30));
        health.received(Arc::clone(&fresh), Duration::from_secs(10));
        assert!(health.silence(Duration::from_millis(14_999)).is_none());
        let lost = health
            .silence(Duration::from_secs(15))
            .expect("foto perdida");
        assert_eq!(lost.state.source_state, vantare_domain::SourceState::Lost);
        assert_eq!((lost.epoch, lost.sequence), (fresh.epoch, fresh.sequence));
        assert_eq!(lost.origin, fresh.origin);
        assert!(matches!(
            lost.state.player.expect("jugador").telemetry.throttle,
            vantare_domain::Quality::Stale(_)
        ));
        assert!(health.silence(Duration::from_secs(20)).is_none());
        assert_eq!(fresh.state.source_state, vantare_domain::SourceState::Live);
        health.received(Arc::new(synthetic(31)), Duration::from_secs(21));
        assert!(health.silence(Duration::from_secs(25)).is_none());
        assert_eq!(
            health
                .silence(Duration::from_secs(26))
                .expect("otro silencio")
                .sequence,
            32
        );
    }

    #[test]
    fn slow_consumers_keep_the_newest_photos_and_can_stop_the_feed() {
        let (tx, rx) = flume::bounded(4);
        let oldest = rx.clone();
        for tick in 0..10 {
            send_latest(&tx, &oldest, Arc::new(synthetic(tick)));
        }
        assert_eq!(rx.len(), 4);
        let sequences: Vec<_> = rx.try_iter().map(|snapshot| snapshot.sequence).collect();
        assert_eq!(sequences, [7, 8, 9, 10]);
        assert_eq!(tx.receiver_count(), 2);
        drop(rx);
        assert_eq!(tx.receiver_count(), 1, "solo queda el receptor de desalojo");
    }

    #[test]
    fn heartbeats_without_new_photos_keep_the_pipe_alive() {
        let mut health = PipeHealth::default();
        health.received(Arc::new(fixed()), Duration::ZERO);
        for seconds in 1..=20 {
            health.heard(Duration::from_secs(seconds));
            assert!(health.silence(Duration::from_secs(seconds)).is_none());
        }
        assert!(health.silence(Duration::from_secs(24)).is_none());
        assert!(health.silence(Duration::from_secs(25)).is_some());
    }

    #[test]
    fn the_fixed_scene_matches_the_reference_description() {
        let vm = standings::project(&fixed(), Preferences::default());
        assert_eq!(vm.rows.len(), 44);
        assert_eq!(vm.rows[8].driver, "PLAYER");
        assert!(vm.rows[8].is_player);
        assert_eq!(
            (vm.session_label.as_str(), vm.clock.as_str()),
            ("PRÁCTICA", "58:12")
        );
        assert_eq!(vm.class_chip, "LMP");
        assert_eq!(vm.rows[0].gap, "—", "sin mejor vuelta no hay gap");
    }

    #[test]
    fn the_synthetic_sequence_is_consistent_and_moves() {
        let (a, b) = (synthetic(0), synthetic(600));
        assert_eq!(a.state.cars.len(), CARS as usize);
        assert_eq!(b.sequence, 601);
        let mut orders: Vec<Vec<CarId>> = (0..20)
            .map(|second| {
                let snapshot = synthetic(second * RATE_HZ);
                standings::project(&snapshot, Preferences::default())
                    .rows
                    .iter()
                    .map(|r| r.id)
                    .collect()
            })
            .collect();
        orders.dedup();
        assert!(orders.len() > 1, "los coches se reordenan");
        assert!(!radar::project(&b).cars.is_empty());
        assert_ne!(
            pedals::project(&a, Preferences::default()),
            pedals::project(&b, Preferences::default())
        );
    }
}
