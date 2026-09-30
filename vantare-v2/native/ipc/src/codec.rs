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
const MIN_VERSION: u32 = dto::VERSION;
const MAX_VERSION: u32 = dto::VERSION;

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
}

/// Mayor versión común, si la hay.
pub(crate) fn negotiate(min: u32, max: u32) -> Option<u32> {
    let version = max.min(MAX_VERSION);
    (version >= min.max(MIN_VERSION)).then_some(version)
}

pub(crate) fn hello(cursor: Option<Revision>) -> Message {
    Message::Hello {
        min_version: MIN_VERSION,
        max_version: MAX_VERSION,
        cursor,
    }
}

pub(crate) fn supports(version: u32) -> bool {
    (MIN_VERSION..=MAX_VERSION).contains(&version)
}

pub(crate) fn write_message(w: &mut impl Write, message: &Message) -> Result<(), Error> {
    let mut frame = vec![0; 4];
    serde_json::to_writer(&mut frame, message)?;
    let len = frame.len() - 4;
    let header = match u32::try_from(len) {
        Ok(header) if len <= MAX_MESSAGE => header,
        _ => return Err(Error::TooLarge { len }),
    };
    frame[..4].copy_from_slice(&header.to_le_bytes());
    w.write_all(&frame)?; // un solo write: un solo `WriteFile` en el pipe
    Ok(())
}

pub(crate) fn read_message(r: &mut impl Read) -> Result<Message, Error> {
    let mut header = [0; 4];
    r.read_exact(&mut header)?;
    let len = u32::from_le_bytes(header) as usize;
    if len > MAX_MESSAGE {
        return Err(Error::TooLarge { len });
    }
    let mut body = vec![0; len];
    r.read_exact(&mut body)?;
    Ok(serde_json::from_slice(&body)?)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Cursor;
    use std::time::Duration;

    use vantare_domain::{
        Capabilities, Capability, Car, CarId, Class, ClassId, Damage, Driver, DriverId, Flag,
        FlagKind, FlagScope, Fuel, Gap, Origin, Player, Pose, Quality, Session, SessionId,
        SessionKind, SessionState, Source, SourceKind, State, Telemetry, Weather,
    };

    use super::*;

    fn rich_car(id: u32) -> Car {
        Car {
            id: CarId(id),
            number: format!("{id}"),
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
                player: Some(Player {
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
                        ..Fuel::default()
                    },
                    delta_best_s: Quality::Reliable(-0.125),
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
                }),
            },
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
    fn velocity_and_penalties_preserve_each_quality_and_are_required_in_v5() {
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
            assert!(serde_json::from_value::<SnapshotDto>(value).is_err());
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
                    serde_json::from_value::<SnapshotDto>(missing).is_err(),
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
}
