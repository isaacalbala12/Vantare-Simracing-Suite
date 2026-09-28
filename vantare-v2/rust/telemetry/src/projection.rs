//! Product projection begins with the Overlay V2 session and player slices.

use crate::core::{self, SessionFlag};
use crate::lmu::SessionType;
use crate::lmu::pipeline::LmuVehicleState;
use crate::quality::{Field, Freshness};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Quality {
    Fresh,
    Stale,
    Missing,
    Invalid,
}

#[derive(Clone, Debug, PartialEq)]
pub struct QValue<T> {
    pub value: Option<T>,
    pub quality: Quality,
}

impl<T> QValue<T> {
    fn missing() -> Self {
        Self {
            value: None,
            quality: Quality::Missing,
        }
    }
}

fn project<T, U>(field: &Field<T>, convert: impl FnOnce(&T) -> U) -> QValue<U> {
    match field {
        Field::Missing => QValue::missing(),
        Field::Present {
            value, freshness, ..
        } => QValue {
            value: Some(convert(value)),
            quality: match freshness {
                Freshness::Fresh => Quality::Fresh,
                Freshness::Stale => Quality::Stale,
                Freshness::Invalid => Quality::Invalid,
            },
        },
    }
}

#[derive(Debug, PartialEq)]
pub struct Session {
    pub track: QValue<String>,
    pub phase: QValue<&'static str>,
    pub flag: QValue<&'static str>,
    pub remaining_seconds: QValue<f64>,
    pub maximum_laps: QValue<i32>,
}

pub fn session(
    batch: &core::Batch<SessionType, LmuVehicleState>,
    remaining: &Field<f64>,
) -> Session {
    Session {
        track: project(&batch.state.track_name, Clone::clone),
        phase: project(&batch.state.session_type, |kind| match kind {
            SessionType::Practice => "practice",
            SessionType::Qualifying => "qualifying",
            SessionType::Race => "race",
            SessionType::Warmup => "warmup",
            SessionType::Endurance => "endurance",
            SessionType::Unknown => "unknown",
        }),
        flag: project(&batch.state.session_flag, |flag| match flag {
            SessionFlag::Yellow => "yellow",
        }),
        remaining_seconds: project(remaining, |value| *value),
        maximum_laps: project(&batch.state.maximum_laps, |value| *value),
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SpeedUnit {
    Mps,
    Kph,
    Mph,
}

#[derive(Debug, PartialEq)]
pub struct Player {
    pub vehicle_id: Option<String>,
    pub lap_number: QValue<i32>,
    pub speed: QValue<f64>,
    pub rpm: QValue<f64>,
    pub gear: QValue<i32>,
    pub throttle: QValue<f64>,
    pub brake: QValue<f64>,
    pub clutch: QValue<f64>,
    pub steering: QValue<f64>,
}

pub fn player(batch: &core::Batch<SessionType, LmuVehicleState>, unit: SpeedUnit) -> Player {
    let mut result = Player {
        vehicle_id: None,
        lap_number: QValue::missing(),
        speed: QValue::missing(),
        rpm: QValue::missing(),
        gear: QValue::missing(),
        throttle: QValue::missing(),
        brake: QValue::missing(),
        clutch: QValue::missing(),
        steering: QValue::missing(),
    };
    for current in &batch.state.vehicles {
        let Field::Present {
            value: true,
            freshness,
            ..
        } = &current.value.player
        else {
            continue;
        };
        if *freshness == Freshness::Invalid {
            continue;
        }
        result.vehicle_id = Some(current.id.clone());
        if *freshness == Freshness::Fresh {
            result.lap_number = project(&current.value.lap_number, |value| *value);
        }
        result.speed = project(&current.value.speed_mps, |value| match unit {
            SpeedUnit::Mps => *value,
            SpeedUnit::Kph => *value * 3.6,
            SpeedUnit::Mph => *value * 2.236_936_292_054_4,
        });
        result.rpm = project(&current.value.engine_rpm, |value| *value);
        result.gear = project(&current.value.gear, |value| *value);
        result.throttle = project(&current.value.throttle, |value| *value);
        result.brake = project(&current.value.brake, |value| *value);
        result.clutch = project(&current.value.clutch, |value| *value);
        break;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;
    use serde_json::{Map, Value, json};

    const REAL_44: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");

    #[test]
    fn real_grid_projects_session_and_player_without_inventing_steering_or_flag() {
        let engine = Engine::new(30, 15).unwrap();
        let prepared = engine
            .prepare(REAL_44, "1.3.0.0", 100, 100, 1_000, ClockChange::Continuous)
            .unwrap();
        let session = session(prepared.batch(), prepared.session_remaining());
        assert_eq!(session.flag.quality, Quality::Missing);
        assert_eq!(session.track.quality, Quality::Fresh);
        let player = player(prepared.batch(), SpeedUnit::Mps);
        assert_eq!(
            player.vehicle_id.as_deref(),
            prepared.batch().player_id.as_deref()
        );
        assert_eq!(player.steering.quality, Quality::Missing);
        assert_eq!(player.speed.quality, Quality::Fresh);
        let kph = super::player(prepared.batch(), SpeedUnit::Kph);
        assert_eq!(kph.speed.value, player.speed.value.map(|speed| speed * 3.6));
    }

    #[test]
    fn invalid_value_keeps_presence_and_quality() {
        let projected = project(&Field::invalid_observed(0_i32), |value| *value);
        assert_eq!(
            projected,
            QValue {
                value: Some(0),
                quality: Quality::Invalid
            }
        );
        let missing: QValue<i32> = project(&Field::<i32>::Missing, |value| *value);
        assert_eq!(missing, QValue::missing());
    }

    fn wire_value<T: Clone + Default + PartialEq + Into<Value>>(field: &QValue<T>) -> Value {
        let mut object = Map::new();
        if let Some(value) = &field.value
            && *value != T::default()
        {
            object.insert("v".into(), value.clone().into());
        }
        let quality = match field.quality {
            Quality::Fresh => "fresh",
            Quality::Stale => "stale",
            Quality::Missing => "missing",
            Quality::Invalid => "invalid",
        };
        object.insert("q".into(), Value::from(quality));
        Value::Object(object)
    }

    #[test]
    fn static_44_session_player_match_go_projection_oracle() {
        let golden: Value = serde_json::from_slice(include_bytes!(
            "../testdata/overlay-session-player-go-v1.json"
        ))
        .unwrap();
        let engine = Engine::new(30, 15).unwrap();
        let prepared = engine
            .prepare(REAL_44, "1.3.0.0", 100, 100, 1_000, ClockChange::Continuous)
            .unwrap();
        let session = session(prepared.batch(), prepared.session_remaining());
        let player = player(prepared.batch(), SpeedUnit::Mps);
        let actual = json!({
            "session": {
                "track": wire_value(&session.track), "phase": wire_value(&session.phase),
                "flag": wire_value(&session.flag), "remaining": wire_value(&session.remaining_seconds),
                "maxLaps": wire_value(&session.maximum_laps),
            },
            "player": {
                "lapNumber": wire_value(&player.lap_number), "id": player.vehicle_id,
                "speed": wire_value(&player.speed), "rpm": wire_value(&player.rpm),
                "gear": wire_value(&player.gear), "throttle": wire_value(&player.throttle),
                "brake": wire_value(&player.brake), "clutch": wire_value(&player.clutch),
                "steering": wire_value(&player.steering),
            }
        });
        assert_eq!(actual, golden);
    }
}
