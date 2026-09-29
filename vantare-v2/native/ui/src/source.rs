//! Fuentes de `Snapshot`s para [`crate::run`]: el núcleo por su named pipe
//! ([`pipe_feed`]) o una carrera sintética local ([`local_feed`]), para probar
//! los widgets sin núcleo.

use std::sync::Arc;
use std::thread;
use std::time::Duration;

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
pub fn pipe_feed(name: &str) -> Result<flume::Receiver<Arc<Snapshot>>, vantare_ipc::Error> {
    // El pipe es solo del usuario actual (ACL del núcleo): se acepta al servidor.
    let mut subscriber = vantare_ipc::Subscriber::connect(name, |_| true)?;
    let (tx, rx) = flume::unbounded();
    thread::Builder::new()
        .name("pipe-feed".into())
        .spawn(move || {
            // `run` suelta el receptor al cerrarse la última ventana.
            while !tx.is_disconnected() {
                if let Some(snapshot) = subscriber.next(Duration::from_millis(250))
                    && tx.send(snapshot).is_err()
                {
                    break;
                }
            }
        })?;
    Ok(rx)
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

/// Carrera de 22 coches determinista en función del tiempo: reordenaciones,
/// paradas en boxes, mejoras de vuelta, coches alrededor del jugador y pedales.
pub fn synthetic(tick: u64) -> Snapshot {
    let t = tick as f64 / RATE_HZ as f64;
    // Orden por una clave que oscila: los coches se adelantan de forma suave.
    let mut order: Vec<u32> = (1..=CARS).collect();
    let key = |id: u32| f64::from(id) + 2.0 * (t * 0.3 + f64::from(id)).sin();
    order.sort_by(|a, b| key(*a).total_cmp(&key(*b)));

    let mut previous_gap = 0.0;
    let cars = order
        .iter()
        .enumerate()
        .map(|(index, &id)| {
            let position = index as u32 + 1;
            let gap = 0.45 * index as f64 + 0.05 * (t * 0.7 + f64::from(id)).sin();
            let mut car = car(id, format!("PILOTO {id:02}"), position);
            car.number = id.to_string();
            car.laps = Reliable(1 + (t / 90.0) as u32);
            car.best_lap_s = Reliable(100.0 + 0.13 * f64::from(id) - (t / 20.0).floor() * 0.01);
            car.last_lap_s = Reliable(101.0 + 0.11 * f64::from(id));
            car.gap_leader = Reliable(Gap::Time { seconds: gap });
            car.gap_ahead = Estimated(Gap::Time {
                seconds: (gap - previous_gap).max(0.0),
            });
            car.in_pits = Reliable((t / 6.0) as u64 % 11 == u64::from(id) % 11);
            // El jugador es el origen del radar; los demás oscilan a su alrededor.
            let phase = f64::from(id);
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
                    gear: Reliable(1 + (t as i64 % 6) as i8),
                    speed_mps: Reliable(45.0 + 25.0 * wave),
                    engine_speed_rad_s: Reliable(700.0 + 200.0 * wave),
                },
            }),
        },
        ..Snapshot::default()
    }
}

/// Canal con la secuencia sintética a 30 Hz. El hilo termina cuando se suelta
/// el receptor.
pub fn local_feed() -> flume::Receiver<Arc<Snapshot>> {
    let (sender, receiver) = flume::bounded(4);
    thread::spawn(move || {
        for tick in 0.. {
            if sender.send(Arc::new(synthetic(tick))).is_err() {
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
