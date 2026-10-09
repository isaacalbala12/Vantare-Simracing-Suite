//! Mensajes del cable y su marco: longitud `u32` little-endian + JSON. El
//! límite se comprueba antes de reservar memoria, de modo que un par no puede
//! hacernos reservar lo que quiera.

use std::io::{Read, Write};

use serde::{Deserialize, Serialize};
use vantare_domain::Snapshot;

use crate::Error;
use crate::dto::{self, SnapshotDto};

pub(crate) const MAX_MESSAGE: usize = 1 << 20;
/// Versiones de DTO que este extremo sabe hablar.
const PROTOCOL_VERSION: u32 = dto::VERSION;

/// Posición de una foto en la línea de tiempo de un productor.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct Revision {
    pub epoch: u64,
    pub sequence: u64,
}

impl Revision {
    pub fn of(snapshot: &Snapshot) -> Self {
        Self {
            epoch: snapshot.epoch,
            sequence: snapshot.sequence,
        }
    }

    /// Orden estricto del productor: la época no retrocede y, dentro de ella,
    /// la secuencia crece.
    pub fn follows(self, last: Self) -> bool {
        (self.epoch, self.sequence) > (last.epoch, last.sequence)
    }

    /// ¿Aporta algo a quien ya tiene `cursor`? Solo se compara dentro de una
    /// época; otra época es otro productor (reinicio) y siempre aporta.
    pub fn is_newer(self, cursor: Option<Self>) -> bool {
        cursor.is_none_or(|c| c.epoch != self.epoch || self.sequence > c.sequence)
    }
}

// La foto pesa más que el resto, pero el mensaje vive solo lo que tarda en (de)serializarse.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Message {
    /// Suscriptor → productor. El esquema del saludo no cambia entre versiones.
    Hello {
        min_version: u32,
        max_version: u32,
        cursor: Option<Revision>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        demand: Option<crate::Demand>,
    },
    /// Productor → suscriptor: versión elegida.
    Welcome {
        version: u32,
    },
    Reject {
        reason: String,
    },
    /// Latido del productor para detectar pares muertos y silencios.
    Ping,
    Snapshot(SnapshotDto),
    DemandSnapshot {
        snapshot: SnapshotDto,
        requested: crate::Demand,
        delivered: crate::Demand,
    },
}

/// Mayor versión común, si la hay.
pub(crate) fn negotiate(min: u32, max: u32) -> Option<u32> {
    (min <= PROTOCOL_VERSION && max >= PROTOCOL_VERSION).then_some(PROTOCOL_VERSION)
}

pub(crate) fn hello(cursor: Option<Revision>) -> Message {
    Message::Hello {
        min_version: PROTOCOL_VERSION,
        max_version: PROTOCOL_VERSION,
        cursor,
        demand: None,
    }
}

pub(crate) fn hello_requested(cursor: Option<Revision>, demand: crate::Demand) -> Message {
    Message::Hello {
        min_version: PROTOCOL_VERSION,
        max_version: PROTOCOL_VERSION,
        cursor,
        demand: Some(demand),
    }
}

pub(crate) fn supports(version: u32) -> bool {
    version == PROTOCOL_VERSION
}

pub(crate) fn write_message(w: &mut impl Write, message: &Message) -> Result<(), Error> {
    write_buffered(w, message, &mut Vec::new())
}

pub(crate) fn write_buffered(
    w: &mut impl Write,
    message: &Message,
    frame: &mut Vec<u8>,
) -> Result<(), Error> {
    frame.clear();
    frame.resize(4, 0);
    {
        let _span = crate::profiling::begin(crate::profiling::Stage::Serialize);
        serde_json::to_writer(&mut *frame, message)?;
    }
    let len = frame.len() - 4;
    let header = match u32::try_from(len) {
        Ok(header) if len <= MAX_MESSAGE => header,
        _ => return Err(Error::TooLarge { len }),
    };
    frame[..4].copy_from_slice(&header.to_le_bytes());
    {
        let _span = crate::profiling::begin(crate::profiling::Stage::IpcWrite);
        w.write_all(frame)?; // un solo write: un solo `WriteFile` en el pipe
    }
    crate::profiling::report_if_due();
    Ok(())
}

pub(crate) fn read_message(r: &mut impl Read) -> Result<Message, Error> {
    read_buffered(r, &mut Vec::new())
}

pub(crate) fn read_buffered(r: &mut impl Read, body: &mut Vec<u8>) -> Result<Message, Error> {
    let mut header = [0; 4];
    r.read_exact(&mut header)?;
    let len = u32::from_le_bytes(header) as usize;
    if len > MAX_MESSAGE {
        return Err(Error::TooLarge { len });
    }
    body.resize(len, 0);
    r.read_exact(body)?;
    let message = {
        let _span = crate::profiling::begin(crate::profiling::Stage::Decode);
        serde_json::from_slice(body)?
    };
    crate::profiling::report_if_due();
    Ok(message)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Cursor;
    use std::time::Duration;

    use vantare_domain::{
        Capabilities, Capability, Car, CarId, Class, ClassId, Damage, Driver, DriverId,
        DriverRating, Flag, FlagKind, FlagScope, Fuel, Gap, Origin, PitService, Player, Pose,
        Quality, Session, SessionId, SessionKind, SessionState, Source, SourceKind, State, Stint,
        Telemetry, TyreCompound, Weather,
    };

    use super::*;

    fn rich_car(id: u32) -> Car {
        Car {
            id: CarId(id),
            number: format!("{id}"),
            vehicle: "Ferrari 499P".into(),
            driver: Driver {
                id: DriverId(id + 100),
                name: "Ñandú \"Rápido\"".into(),
            },
            class: (id.is_multiple_of(2)).then(|| Class {
                id: ClassId(1),
                name: "Hyper".into(),
            }),
            position: Quality::Reliable(id),
            class_position: Quality::Estimated(id),
            laps: Quality::Stale(3),
            last_lap_s: Quality::Reliable(92.123_456_789),
            best_lap_s: Quality::Unavailable,
            estimated_lap_s: Quality::Estimated(91.5),
            last_sectors_s: vec![Quality::Reliable(30.5), Quality::Unavailable],
            gap_leader: Quality::Estimated(Gap::Time { seconds: 1.25 }),
            gap_ahead: Quality::Reliable(Gap::Laps { count: 2 }),
            gap_class_leader: Quality::Stale(Gap::Time { seconds: 3.5 }),
            gap_class_ahead: Quality::Unavailable,
            relative_s: Quality::Estimated(-2.5),
            relative_laps: Quality::Estimated(-1),
            lap_distance_m: Quality::Reliable(1234.5),
            lap_elapsed_s: Quality::Estimated(41.25),
            current_sector: Quality::Reliable(2),
            in_pits: Quality::Reliable(true),
            pose: Quality::Reliable(Pose {
                x_m: -1.5,
                y_m: 1e-9,
                yaw_rad: 3.25,
            }),
            velocity_mps: Quality::Reliable([-12.5, 40.0]),
            pending_penalties: Quality::Estimated(2),
            grid_position: Quality::Reliable(id + 2),
            pit_stops: Quality::Estimated(1),
            tyre_compound: Quality::Stale(TyreCompound::Wet),
            best_sectors_s: vec![Quality::Reliable(29.75), Quality::Unavailable],
            current_sectors_s: vec![Quality::Estimated(30.25)],
            driver_rating: Quality::Reliable(DriverRating::Gold),
            safety_rating: Quality::Reliable(88.0),
            relative_trend_s_per_lap: Quality::Estimated(-0.6),
        }
    }

    #[test]
    fn signals_1497_are_optional_on_the_wire_and_keep_each_quality() {
        // Una foto anterior a #1497 no los lleva: se leen como no disponibles.
        let mut value = serde_json::to_value(SnapshotDto::from(&rich_snapshot(1, 1))).expect("DTO");
        let car = value["state"]["cars"][0].as_object_mut().expect("coche");
        for field in [
            "vehicle",
            "grid_position",
            "pit_stops",
            "tyre_compound",
            "best_sectors_s",
            "current_sectors_s",
            "driver_rating",
            "safety_rating",
            "relative_trend_s_per_lap",
        ] {
            assert!(car.remove(field).is_some(), "{field}");
        }
        let player = value["state"]["player"].as_object_mut().expect("jugador");
        for field in [
            "pit_loss_s",
            "fuel_energy",
            "fuel_energy_per_lap",
            "fuel_lap_projection_l",
            "pit_refuel_target_l",
            "pit_refuel_added_l",
            "pit_service_remaining_s",
            "pit_tyres",
            "stint_laps",
            "stint_elapsed_s",
            "delta_optimal_s",
            "delta_leader_s",
            "lap_invalid",
        ] {
            assert!(player.remove(field).is_some(), "{field}");
        }
        let old = crate::snapshot_from_json(&value.to_string()).expect("foto sin señales nuevas");
        let car = &old.state.cars[0];
        assert!(car.vehicle.is_empty());
        assert_eq!(car.grid_position, Quality::Unavailable);
        assert_eq!(car.pit_stops, Quality::Unavailable);
        assert_eq!(car.driver_rating, Quality::Unavailable);
        assert_eq!(car.safety_rating, Quality::Unavailable);
        assert_eq!(car.relative_trend_s_per_lap, Quality::Unavailable);
        let me = old.state.player.as_ref().expect("jugador");
        assert_eq!(me.pit_loss_s, Quality::Unavailable);
        assert_eq!(me.fuel.energy, Quality::Unavailable);
        assert_eq!(me.fuel.lap_projection_l, Quality::Unavailable);
        assert_eq!(me.pit_service, PitService::default());
        assert_eq!(me.stint, Stint::default());
        assert_eq!(me.delta_optimal_s, Quality::Unavailable);
        assert_eq!(me.lap_invalid, Quality::Unavailable);
        assert_eq!(car.tyre_compound, Quality::Unavailable);
        assert!(car.best_sectors_s.is_empty() && car.current_sectors_s.is_empty());
        // Sin dato no se escriben: las fotos existentes conservan sus bytes.
        let written = serde_json::to_value(SnapshotDto::from(&old)).expect("DTO");
        let car = written["state"]["cars"][0].as_object().expect("coche");
        assert!(!car.contains_key("grid_position") && !car.contains_key("tyre_compound"));
        let player = written["state"]["player"].as_object().expect("jugador");
        assert!(!player.contains_key("fuel_energy") && !player.contains_key("stint_laps"));
        for compound in [
            TyreCompound::Soft,
            TyreCompound::Medium,
            TyreCompound::Hard,
            TyreCompound::Wet,
        ] {
            let mut original = rich_snapshot(1, 1);
            original.state.cars[0].tyre_compound = Quality::Reliable(compound);
            assert_eq!(round_trip(&original), original);
        }
    }

    /// Foto que ejercita todas las variantes del modelo.
    pub(crate) fn rich_snapshot(epoch: u64, sequence: u64) -> Snapshot {
        Snapshot {
            epoch,
            sequence,
            origin: Origin {
                source: Source {
                    simulator: "lmu",
                    kind: SourceKind::Replay,
                },
                source_time: Some(Duration::new(12, 345)),
                received_at: Duration::from_millis(1500),
            },
            state: State {
                source_state: vantare_domain::SourceState::Live,
                capabilities: Capabilities {
                    session_clock: Capability::Fresh,
                    positions: Capability::WithData,
                    gaps: Capability::Supported,
                    fuel: Capability::Fresh,
                    lap_progress: Capability::WithData,
                    weather: Capability::Fresh,
                    damage: Capability::WithData,
                    ..Capabilities::default()
                },
                session: Session {
                    id: SessionId(u64::MAX),
                    kind: Quality::Reliable(SessionKind::Other("drift".into())),
                    state: Quality::Estimated(SessionState::Interrupted),
                    elapsed_s: Quality::Reliable(10.5),
                    remaining_s: Quality::Stale(20.0),
                    track_name: Quality::Reliable("Le Mans".into()),
                    laps_remaining: Quality::Unavailable,
                    laps_total: Quality::Reliable(24),
                    track_length_m: Quality::Reliable(13_626.0),
                    weather: Weather {
                        air_temperature_k: Quality::Reliable(295.15),
                        track_temperature_k: Quality::Estimated(308.15),
                        wind_speed_mps: Quality::Reliable(5.0),
                        wind_direction_rad: Quality::Stale(std::f64::consts::FRAC_PI_2),
                        rain: Quality::Reliable(0.25),
                        track_wetness: Quality::Estimated(0.5),
                        pressure_pa: Quality::Reliable(101_325.0),
                    },
                },
                flags: Quality::Reliable(vec![
                    Flag {
                        kind: FlagKind::Other("ámbar".into()),
                        scope: FlagScope::Sector(2),
                    },
                    Flag {
                        kind: FlagKind::Yellow,
                        scope: FlagScope::Car(CarId(7)),
                    },
                ]),
                cars: vec![rich_car(1), rich_car(2)],
                player: Some(rich_player()),
            },
        }
    }

    /// Jugador con todas las señales, de `rich_snapshot`.
    fn rich_player() -> Player {
        Player {
            car: CarId(2),
            telemetry: Telemetry {
                throttle: Quality::Reliable(0.75),
                steering: Quality::Reliable(-0.25),
                gear: Quality::Reliable(-1),
                ..Telemetry::default()
            },
            fuel: Fuel {
                level_l: Quality::Reliable(42.5),
                per_lap_l: Quality::Estimated(3.1),
                history: [
                    Some((1, 3.0)),
                    Some((2, 3.2)),
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                    None,
                ],
                energy: Quality::Reliable(0.614),
                energy_per_lap: Quality::Estimated(0.0482),
                lap_projection_l: Quality::Stale(1.41),
                ..Fuel::default()
            },
            delta_best_s: Quality::Reliable(-0.125),
            pit_limiter_active: Quality::Reliable(false),
            pit_stop_stopped: Quality::Unavailable,
            pit_loss_s: Quality::Estimated(27.4),
            pit_service: PitService {
                refuel_target_l: Quality::Reliable(58.0),
                refuel_added_l: Quality::Reliable(34.1),
                remaining_s: Quality::Estimated(9.8),
                tyres: Quality::Reliable(4),
            },
            stint: Stint {
                laps: Quality::Reliable(13),
                elapsed_s: Quality::Stale(2712.0),
            },
            delta_optimal_s: Quality::Estimated(0.388),
            delta_leader_s: Quality::Reliable(-0.05),
            lap_invalid: Quality::Reliable(true),
            damage: Damage {
                aero: Quality::Reliable(0.9),
                body: Quality::Estimated(0.8),
                suspension: Quality::Stale(0.7),
                tyre_wear: [
                    Quality::Reliable(1.0),
                    Quality::Estimated(0.75),
                    Quality::Stale(0.5),
                    Quality::Reliable(0.25),
                ],
            },
        }
    }

    /// Valores distintos para cada campo y calidad rotada: `(n + shift) % kinds`
    /// elige Reliable, Estimated, Stale y, con `kinds == 4`, Unavailable. Los
    /// literales no usan `..Default`: un campo nuevo del modelo no compila
    /// hasta entrar aquí. Intercambiar dos campos del mismo tipo en el DTO
    /// cambia el valor o la calidad y rompe la ida y vuelta (#1537).
    pub(crate) struct Distinct {
        n: u32,
        shift: u32,
        kinds: u32,
    }

    impl Distinct {
        pub(crate) fn new(base: u32, shift: u32, kinds: u32) -> Self {
            Self {
                n: base,
                shift,
                kinds,
            }
        }
        fn q<T>(&mut self, value: impl FnOnce(u32) -> T) -> Quality<T> {
            self.n += 1;
            match (self.n + self.shift) % self.kinds {
                0 => Quality::Reliable(value(self.n)),
                1 => Quality::Estimated(value(self.n)),
                2 => Quality::Stale(value(self.n)),
                _ => Quality::Unavailable,
            }
        }
        fn f(&mut self) -> Quality<f64> {
            self.q(|n| f64::from(n) + 0.123_456_789)
        }
        fn u(&mut self) -> Quality<u32> {
            self.q(|n| n)
        }
        fn byte(&mut self) -> Quality<u8> {
            self.q(|n| (n % 251) as u8)
        }
        fn yes(&mut self) -> Quality<bool> {
            self.q(|n| n % 2 == 0)
        }
        fn gap(&mut self) -> Quality<Gap> {
            self.q(|n| {
                if n % 2 == 0 {
                    Gap::Time {
                        seconds: f64::from(n) + 0.25,
                    }
                } else {
                    Gap::Laps { count: n }
                }
            })
        }
        fn text(&mut self, prefix: &str) -> String {
            self.n += 1;
            format!("{prefix}-{}", self.n)
        }

        fn car(&mut self, id: u32) -> Car {
            Car {
                id: CarId(id),
                number: self.text("número"),
                vehicle: self.text("vehículo"),
                driver: Driver {
                    id: DriverId(self.n + 1000),
                    name: self.text("piloto"),
                },
                class: Some(Class {
                    id: ClassId(self.n),
                    name: self.text("clase"),
                }),
                position: self.u(),
                class_position: self.u(),
                laps: self.u(),
                last_lap_s: self.f(),
                best_lap_s: self.f(),
                estimated_lap_s: self.f(),
                last_sectors_s: vec![self.f(), self.f(), self.f()],
                gap_leader: self.gap(),
                gap_ahead: self.gap(),
                gap_class_leader: self.gap(),
                gap_class_ahead: self.gap(),
                relative_s: self.f(),
                relative_laps: self.q(|n| -i32::try_from(n).expect("contador pequeño")),
                lap_distance_m: self.f(),
                lap_elapsed_s: self.f(),
                current_sector: self.byte(),
                in_pits: self.yes(),
                pose: self.q(|n| Pose {
                    x_m: f64::from(n),
                    y_m: -f64::from(n),
                    yaw_rad: f64::from(n) / 100.0,
                }),
                velocity_mps: self.q(|n| [f64::from(n), -f64::from(n) - 0.5]),
                pending_penalties: self.u(),
                grid_position: self.u(),
                pit_stops: self.u(),
                tyre_compound: self.q(|n| {
                    [
                        TyreCompound::Soft,
                        TyreCompound::Medium,
                        TyreCompound::Hard,
                        TyreCompound::Wet,
                    ][n as usize % 4]
                }),
                best_sectors_s: vec![self.f(), self.f(), self.f()],
                current_sectors_s: vec![self.f(), self.f()],
                driver_rating: self.q(|n| {
                    [
                        DriverRating::Bronze,
                        DriverRating::Silver,
                        DriverRating::Gold,
                        DriverRating::Platinum,
                    ][n as usize % 4]
                }),
                safety_rating: self.f(),
                relative_trend_s_per_lap: self.f(),
            }
        }

        fn player(&mut self, car: u32) -> Player {
            let mut history = [None; 10];
            for slot in &mut history {
                self.n += 1;
                *slot = Some((self.n, f64::from(self.n) + 0.5));
            }
            Player {
                car: CarId(car),
                telemetry: Telemetry {
                    throttle: self.f(),
                    brake: self.f(),
                    clutch: self.f(),
                    steering: self.f(),
                    gear: self.q(|n| -((n % 100) as i8)),
                    speed_mps: self.f(),
                    engine_speed_rad_s: self.f(),
                },
                fuel: Fuel {
                    level_l: self.f(),
                    capacity_l: self.f(),
                    per_lap_l: self.f(),
                    laps_left: self.f(),
                    history,
                    energy: self.f(),
                    energy_per_lap: self.f(),
                    lap_projection_l: self.f(),
                },
                damage: Damage {
                    aero: self.f(),
                    body: self.f(),
                    suspension: self.f(),
                    tyre_wear: [self.f(), self.f(), self.f(), self.f()],
                },
                delta_best_s: self.f(),
                // Booleanos consecutivos: calidades distintas entre sí.
                pit_limiter_active: self.yes(),
                pit_stop_stopped: self.yes(),
                lap_invalid: self.yes(),
                pit_loss_s: self.f(),
                pit_service: PitService {
                    refuel_target_l: self.f(),
                    refuel_added_l: self.f(),
                    remaining_s: self.f(),
                    tyres: self.byte(),
                },
                stint: Stint {
                    laps: self.u(),
                    elapsed_s: self.f(),
                },
                delta_optimal_s: self.f(),
                delta_leader_s: self.f(),
            }
        }

        pub(crate) fn snapshot(&mut self) -> Snapshot {
            let shift = self.shift;
            let capabilities = capabilities(shift);
            let session = Session {
                id: SessionId(u64::from(shift) + 7),
                kind: self.q(|n| SessionKind::Other(format!("tipo-{n}"))),
                state: self.q(|n| {
                    [
                        SessionState::Preparing,
                        SessionState::Running,
                        SessionState::Interrupted,
                        SessionState::Finished,
                    ][n as usize % 4]
                }),
                elapsed_s: self.f(),
                remaining_s: self.f(),
                track_name: self.q(|n| format!("pista-{n}")),
                laps_remaining: self.u(),
                laps_total: self.u(),
                track_length_m: self.f(),
                weather: Weather {
                    air_temperature_k: self.f(),
                    track_temperature_k: self.f(),
                    wind_speed_mps: self.f(),
                    wind_direction_rad: self.f(),
                    rain: self.f(),
                    track_wetness: self.f(),
                    pressure_pa: self.f(),
                },
            };
            let flags = self.q(|n| {
                vec![
                    Flag {
                        kind: FlagKind::Blue,
                        scope: FlagScope::Car(CarId(n)),
                    },
                    Flag {
                        kind: FlagKind::Other(format!("bandera-{n}")),
                        scope: FlagScope::Sector((n % 3) as u8),
                    },
                    Flag {
                        kind: FlagKind::Checkered,
                        scope: FlagScope::Session,
                    },
                ]
            });
            let cars = vec![self.car(11), self.car(12), self.car(13)];
            let player = Some(self.player(12));
            Snapshot {
                epoch: u64::from(shift) + 3,
                sequence: u64::from(self.n),
                origin: Origin {
                    source: Source {
                        simulator: ["lmu", "acc"][shift as usize % 2],
                        kind: [SourceKind::Live, SourceKind::Replay][shift as usize % 2],
                    },
                    source_time: Some(Duration::new(u64::from(shift), 5)),
                    received_at: Duration::from_micros(u64::from(shift) + 9),
                },
                state: State {
                    source_state: [
                        vantare_domain::SourceState::Live,
                        vantare_domain::SourceState::Paused,
                        vantare_domain::SourceState::Stale,
                        vantare_domain::SourceState::Lost,
                    ][shift as usize % 4],
                    capabilities,
                    session,
                    flags,
                    cars,
                    player,
                },
            }
        }
    }

    /// Cada par de capacidades difiere en la pasada par o en la impar.
    fn capabilities(shift: u32) -> Capabilities {
        let mut index = 0;
        let mut next = || {
            index += 1;
            let bits = if shift.is_multiple_of(2) {
                index
            } else {
                index >> 2
            };
            [
                Capability::Unsupported,
                Capability::Supported,
                Capability::WithData,
                Capability::Fresh,
            ][bits % 4]
        };
        Capabilities {
            session_clock: next(),
            positions: next(),
            lap_times: next(),
            gaps: next(),
            pit_status: next(),
            flags: next(),
            spatial: next(),
            driver_inputs: next(),
            powertrain: next(),
            fuel: next(),
            delta: next(),
            sectors: next(),
            lap_progress: next(),
            weather: next(),
            damage: next(),
        }
    }

    #[test]
    fn every_field_keeps_its_own_value_and_quality_through_the_wire() {
        for shift in 0..4 {
            let original = Distinct::new(0, shift, 4).snapshot();
            assert_eq!(round_trip(&original), original, "pasada {shift}");
        }
    }

    fn frame(message: &Message) -> Vec<u8> {
        let mut bytes = Vec::new();
        write_message(&mut bytes, message).unwrap();
        bytes
    }

    fn round_trip(original: &Snapshot) -> Snapshot {
        let bytes = frame(&Message::Snapshot(SnapshotDto::from(original)));
        let Message::Snapshot(dto) = read_message(&mut Cursor::new(bytes)).unwrap() else {
            panic!("no es una foto");
        };
        Snapshot::try_from(dto).unwrap()
    }

    #[test]
    fn snapshot_round_trips_through_the_wire() {
        let original = rich_snapshot(3, 42);
        assert_eq!(round_trip(&original), original);
        assert_eq!(round_trip(&Snapshot::default()), Snapshot::default());
    }

    #[test]
    fn pit_and_estimated_time_signals_preserve_all_qualities_and_are_required_in_v7_full_photos() {
        for (time, limiter, stopped) in [
            (
                Quality::Reliable(90.0),
                Quality::Reliable(false),
                Quality::Reliable(true),
            ),
            (
                Quality::Estimated(91.0),
                Quality::Estimated(true),
                Quality::Estimated(false),
            ),
            (
                Quality::Stale(92.0),
                Quality::Stale(false),
                Quality::Stale(true),
            ),
            (
                Quality::Unavailable,
                Quality::Unavailable,
                Quality::Unavailable,
            ),
        ] {
            let mut original = rich_snapshot(1, 1);
            original.state.cars[0].estimated_lap_s = time;
            let p = original.state.player.as_mut().expect("jugador");
            p.pit_limiter_active = limiter;
            p.pit_stop_stopped = stopped;
            assert_eq!(round_trip(&original), original);
        }
        for (section, field) in [
            ("player", "pit_limiter_active"),
            ("player", "pit_stop_stopped"),
            ("cars", "estimated_lap_s"),
        ] {
            let mut value =
                serde_json::to_value(SnapshotDto::from(&rich_snapshot(1, 1))).expect("DTO");
            let object = if section == "cars" {
                &mut value["state"][section][0]
            } else {
                &mut value["state"][section]
            };
            object.as_object_mut().expect("sección").remove(field);
            assert!(crate::snapshot_from_json(&value.to_string()).is_err());
        }
    }

    #[test]
    fn velocity_and_penalties_preserve_each_quality_and_are_required_in_v7_full_photos() {
        for (velocity, penalties) in [
            (Quality::Reliable([-1.0, 40.0]), Quality::Reliable(0)),
            (Quality::Estimated([1.0, 40.0]), Quality::Estimated(1)),
            (Quality::Stale([-1.0, 40.0]), Quality::Stale(3)),
            (Quality::Unavailable, Quality::Unavailable),
        ] {
            let mut original = rich_snapshot(1, 1);
            original.state.cars[0].velocity_mps = velocity;
            original.state.cars[0].pending_penalties = penalties;
            assert_eq!(round_trip(&original), original);
        }
        for field in ["velocity_mps", "pending_penalties"] {
            let mut value =
                serde_json::to_value(SnapshotDto::from(&rich_snapshot(1, 1))).expect("DTO");
            value["state"]["cars"][0]
                .as_object_mut()
                .expect("coche")
                .remove(field);
            assert!(crate::snapshot_from_json(&value.to_string()).is_err());
        }
    }

    #[test]
    fn weather_and_damage_fields_are_required_and_tyres_have_four_slots() {
        let json = serde_json::to_value(SnapshotDto::from(&rich_snapshot(1, 1))).unwrap();
        for (section, fields) in [
            (
                "session",
                &[
                    "weather_air_temperature_k",
                    "weather_track_temperature_k",
                    "weather_wind_speed_mps",
                    "weather_wind_direction_rad",
                    "weather_rain",
                    "weather_track_wetness",
                    "weather_pressure_pa",
                ][..],
            ),
            (
                "player",
                &[
                    "damage_aero",
                    "damage_body",
                    "damage_suspension",
                    "damage_tyre_wear",
                ][..],
            ),
            ("capabilities", &["weather", "damage"][..]),
        ] {
            for field in fields {
                let mut missing = json.clone();
                missing["state"][section]
                    .as_object_mut()
                    .unwrap()
                    .remove(*field);
                assert!(
                    crate::snapshot_from_json(&missing.to_string()).is_err(),
                    "{field}"
                );
            }
        }
        for count in [3, 5] {
            let mut malformed = json.clone();
            malformed["state"]["player"]["damage_tyre_wear"] =
                serde_json::json!(vec!["unavailable"; count]);
            assert!(serde_json::from_value::<SnapshotDto>(malformed).is_err());
        }
    }

    #[test]
    fn a_simulator_name_outside_the_table_decodes_as_unknown() {
        let mut json = serde_json::to_value(SnapshotDto::from(&rich_snapshot(1, 1))).unwrap();
        assert_eq!(json["origin"]["simulator"], "lmu");
        json["origin"]["simulator"] = "no-existe-".repeat(1000).into();
        let dto: SnapshotDto = serde_json::from_value(json).unwrap();
        let snapshot = Snapshot::try_from(dto).unwrap();
        assert_eq!(
            snapshot.origin.source.simulator,
            vantare_domain::UNKNOWN_SIMULATOR
        );
    }

    #[test]
    fn incompatible_dto_version_is_refused() {
        for version in [dto::VERSION - 1, dto::VERSION + 1] {
            let mut dto = SnapshotDto::from(&Snapshot::default());
            dto.version = version;
            assert!(matches!(
                Snapshot::try_from(dto),
                Err(Error::Version { got }) if got == version
            ));
        }
    }

    #[test]
    fn negotiation_picks_the_highest_common_version() {
        assert_eq!(negotiate(1, 1), None);
        assert_eq!(negotiate(1, dto::VERSION - 1), None);
        assert!(!supports(dto::VERSION - 1));
        assert!(supports(dto::VERSION));
        assert_eq!(negotiate(1, 9), Some(dto::VERSION));
        assert_eq!(negotiate(dto::VERSION + 1, dto::VERSION + 2), None);
        assert_eq!(negotiate(0, 0), None);
    }

    #[test]
    fn reused_buffers_preserve_wire_bytes_and_do_not_leak_a_previous_body() {
        let messages = [
            Message::Snapshot(SnapshotDto::from(&rich_snapshot(1, 1))),
            Message::Ping,
        ];
        let mut encode = Vec::new();
        let mut decode = Vec::new();
        let mut capacities = None;
        for message in messages {
            // Referencia independiente: no llama al codec que se está probando.
            let body = serde_json::to_vec(&message).unwrap();
            let mut expected = u32::try_from(body.len()).unwrap().to_le_bytes().to_vec();
            expected.extend_from_slice(&body);
            let mut actual = Vec::new();
            write_buffered(&mut actual, &message, &mut encode).unwrap();
            assert_eq!(actual, expected);
            let got = read_buffered(&mut Cursor::new(actual), &mut decode).unwrap();
            assert_eq!(frame(&got), expected);
            let current = (encode.capacity(), decode.capacity());
            if let Some(previous) = capacities {
                assert_eq!(
                    current, previous,
                    "Ping reutiliza la reserva del DTO grande"
                );
            }
            capacities = Some(current);
        }
        let capacity = decode.capacity();
        let header = u32::try_from(MAX_MESSAGE + 1).unwrap().to_le_bytes();
        assert!(matches!(
            read_buffered(&mut Cursor::new(header), &mut decode),
            Err(Error::TooLarge { .. })
        ));
        assert_eq!(decode.capacity(), capacity, "rechazar antes de reservar");
    }

    #[test]
    fn oversized_frame_is_refused_before_reading_the_body() {
        // Solo la cabecera: si intentara leer el cuerpo fallaría con `Io`, no con `TooLarge`.
        let header = u32::try_from(MAX_MESSAGE + 1).unwrap().to_le_bytes();
        let got = read_message(&mut Cursor::new(header));
        assert!(matches!(got, Err(Error::TooLarge { len }) if len == MAX_MESSAGE + 1));
    }

    #[test]
    fn oversized_message_is_refused_when_sending() {
        let mut snapshot = Snapshot::default();
        snapshot.state.session.track_name = Quality::Reliable("x".repeat(MAX_MESSAGE));
        let mut sink = Vec::new();
        let got = write_message(&mut sink, &Message::Snapshot(SnapshotDto::from(&snapshot)));
        assert!(matches!(got, Err(Error::TooLarge { .. })));
        assert!(sink.is_empty(), "no debe escribirse nada");
    }

    #[test]
    fn malformed_and_truncated_frames_are_errors() {
        let mut bytes = 5_u32.to_le_bytes().to_vec();
        bytes.extend_from_slice(b"{no}!");
        assert!(matches!(
            read_message(&mut Cursor::new(bytes)),
            Err(Error::Json(_))
        ));

        let mut truncated = frame(&Message::Ping);
        truncated.pop();
        assert!(matches!(
            read_message(&mut Cursor::new(truncated)),
            Err(Error::Io(_))
        ));
    }

    #[test]
    fn unknown_fields_are_ignored_but_missing_ones_are_not() {
        let mut json = serde_json::to_value(SnapshotDto::from(&Snapshot::default())).unwrap();
        json["campo_futuro"] = 1.into();
        assert!(serde_json::from_value::<SnapshotDto>(json.clone()).is_ok());
        json.as_object_mut().unwrap().remove("state");
        assert!(serde_json::from_value::<SnapshotDto>(json).is_err());
    }

    #[test]
    fn revision_order() {
        let r = |epoch, sequence| Revision { epoch, sequence };
        assert!(r(1, 2).follows(r(1, 1)));
        assert!(r(2, 1).follows(r(1, 9)));
        assert!(!r(1, 1).follows(r(1, 1)));
        assert!(!r(1, 9).follows(r(2, 1)));

        assert!(r(1, 2).is_newer(None));
        assert!(r(1, 2).is_newer(Some(r(1, 1))));
        assert!(!r(1, 1).is_newer(Some(r(1, 1))));
        assert!(!r(1, 1).is_newer(Some(r(1, 5))));
        // Época distinta = productor reiniciado: aporta aunque la secuencia sea menor.
        assert!(r(2, 1).is_newer(Some(r(1, 5))));
    }

    /// El lector de marcos del pipe es la frontera mas expuesta del nucleo:
    /// acepta bytes de cualquier proceso del usuario que abra el pipe, y un
    /// panico aqui tumba al que publica la telemetria.
    #[test]
    fn hostile_frames_are_rejected_without_panicking_or_allocating() {
        // Un prefijo de longitud enorme con el cuerpo vacio. Si el tope se
        // comprobase DESPUES de `vec![0; len]`, esto agotaria la memoria: la
        // prueba pasa precisamente porque no se reserva nada.
        let mut hostile = u32::MAX.to_le_bytes().to_vec();
        hostile.extend_from_slice(b"{}");
        assert!(read_message(&mut Cursor::new(hostile)).is_err());

        // Bytes arbitrarios: nunca panico.
        let mut state = 0x9E37_79B9_7F4A_7C15_u64;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for _ in 0..20_000 {
            let len = usize::try_from(next() % 64).unwrap_or(0);
            let mut bytes = vec![0_u8; len];
            for byte in &mut bytes {
                *byte = (next() & 0xff) as u8;
            }
            let _ = read_message(&mut Cursor::new(bytes));
        }

        // Marcos validos con un byte cambiado: tampoco.
        let valid = frame(&Message::Ping);
        for _ in 0..20_000 {
            let mut bytes = valid.clone();
            let at = usize::try_from(next()).unwrap_or(0) % bytes.len();
            bytes[at] = (next() & 0xff) as u8;
            let _ = read_message(&mut Cursor::new(bytes));
        }
    }
}
