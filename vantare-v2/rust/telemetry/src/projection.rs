//! Product projection of verified Overlay V2 slices from canonical Rust state.

pub mod cadence;
pub mod capabilities;
pub mod delta;
pub mod frame;
pub mod fuel;
pub mod relative;
pub mod spatial;
pub mod standings;

use crate::core::{self, SessionFlag};
use crate::derive::controls::{ControlHistory, HistoryFreshness};
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

#[derive(Debug, PartialEq)]
pub struct Weather {
    pub ambient_c: QValue<f64>,
    pub track_c: QValue<f64>,
    pub rain_percent: QValue<f64>,
    pub wetness_pct: QValue<f64>,
    pub wind_kph: QValue<f64>,
    pub wind_dir: QValue<String>,
    pub pressure_hpa: QValue<f64>,
}

pub fn weather(batch: &core::Batch<SessionType, LmuVehicleState>) -> Weather {
    Weather {
        ambient_c: project(&batch.state.ambient_temp_c, |value| *value),
        track_c: project(&batch.state.track_temp_c, |value| *value),
        rain_percent: project(&batch.state.rain_fraction, |value| *value * 100.0),
        wetness_pct: project(&batch.state.wetness_fraction, |value| *value * 100.0),
        wind_kph: QValue::missing(),
        wind_dir: QValue::missing(),
        pressure_hpa: QValue::missing(),
    }
}

#[derive(Debug, PartialEq)]
pub struct Controls {
    pub quality: Quality,
    pub captured_at_ms: Vec<i64>,
    pub throttle: Vec<i16>,
    pub brake: Vec<i16>,
    pub clutch: Vec<i16>,
    pub speed_mps: Vec<QValue<f64>>,
    pub rpm: Vec<QValue<f64>>,
    pub gear: Vec<QValue<i32>>,
}

fn pedal_per_mille(value: f64) -> i16 {
    if !value.is_finite() || value <= 0.0 {
        0
    } else if value >= 1.0 {
        1000
    } else {
        (value * 1000.0).round() as i16
    }
}

pub fn controls(history: &ControlHistory) -> Controls {
    let quality = match history.freshness {
        HistoryFreshness::Fresh => Quality::Fresh,
        HistoryFreshness::Stale => Quality::Stale,
        HistoryFreshness::Missing => Quality::Missing,
        HistoryFreshness::Invalid => Quality::Invalid,
    };
    let mut view = Controls {
        quality,
        captured_at_ms: Vec::new(),
        throttle: Vec::new(),
        brake: Vec::new(),
        clutch: Vec::new(),
        speed_mps: Vec::new(),
        rpm: Vec::new(),
        gear: Vec::new(),
    };
    if matches!(quality, Quality::Missing | Quality::Invalid) {
        return view;
    }
    for sample in &history.samples {
        view.captured_at_ms
            .push(sample.captured_utc_ns.div_euclid(1_000_000));
        view.throttle.push(pedal_per_mille(sample.throttle));
        view.brake.push(pedal_per_mille(sample.brake));
        view.clutch.push(pedal_per_mille(sample.clutch));
        view.speed_mps
            .push(project(&sample.speed_mps, |value| *value));
        view.rpm.push(project(&sample.engine_rpm, |value| *value));
        view.gear.push(project(&sample.gear, |value| *value));
    }
    view
}

#[derive(Debug, PartialEq)]
pub struct Damage {
    pub dents: QValue<Vec<u16>>,
    pub overheating: QValue<bool>,
    pub detached: QValue<bool>,
    pub wheel_detached_count: QValue<u8>,
    pub tyre_wear: Option<QValue<Vec<f64>>>,
}

pub fn damage(batch: &core::Batch<SessionType, LmuVehicleState>) -> Damage {
    let mut result = Damage {
        dents: QValue::missing(),
        overheating: QValue::missing(),
        detached: QValue::missing(),
        wheel_detached_count: QValue::missing(),
        tyre_wear: None,
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
        result.tyre_wear = match &current.value.tyre_wear {
            Field::Missing => None,
            Field::Present {
                freshness: Freshness::Invalid,
                ..
            } => Some(QValue {
                value: None,
                quality: Quality::Invalid,
            }),
            field => Some(project(field, |value| value.to_vec())),
        };
        match &current.value.damage {
            Field::Missing => {}
            Field::Present {
                freshness: Freshness::Invalid,
                ..
            } => {
                result.dents.quality = Quality::Invalid;
                result.overheating.quality = Quality::Invalid;
                result.detached.quality = Quality::Invalid;
                result.wheel_detached_count.quality = Quality::Invalid;
            }
            field => {
                result.dents = project(field, |value| value.dents.map(u16::from).to_vec());
                result.overheating = project(field, |value| value.overheating);
                result.detached = project(field, |value| value.detached);
                result.wheel_detached_count = project(field, |value| value.wheel_detached_count);
            }
        }
        break;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::capabilities;
    use super::delta;
    use super::frame;
    use super::fuel::{self, FuelUnit};
    use super::relative;
    use super::spatial;
    use super::standings;
    use super::*;
    use crate::core::Cursor;
    use crate::derive::controls::ControlSample;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;
    use crate::quality::Provenance;
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

    #[test]
    fn json_decimal_parsing_retains_the_go_fuel_observation() {
        let parsed: f64 = serde_json::from_str("99.58657327772369").unwrap();
        assert_eq!(parsed.to_bits(), 99.58657327772369_f64.to_bits());
    }

    #[test]
    fn controls_keep_aligned_motion_quality_and_absolute_milliseconds() {
        let sample = ControlSample {
            cursor: Cursor {
                epoch: 1,
                sequence: 1,
            },
            captured_utc_ns: -1,
            vehicle_id: "player".into(),
            throttle: 0.4565,
            brake: 0.0,
            clutch: 1.0,
            speed_mps: Field::Present {
                value: 50.0,
                provenance: Provenance::Observed,
                freshness: Freshness::Stale,
            },
            engine_rpm: Field::invalid_observed(0.0),
            gear: Field::Missing,
        };
        let history = ControlHistory {
            freshness: HistoryFreshness::Fresh,
            samples: vec![sample],
        };
        let view = controls(&history);
        assert_eq!(view.captured_at_ms, [-1]);
        assert_eq!(view.throttle, [457]);
        assert_eq!(view.brake, [0]);
        assert_eq!(view.clutch, [1000]);
        assert_eq!(view.speed_mps[0].quality, Quality::Stale);
        assert_eq!(view.rpm[0].quality, Quality::Invalid);
        assert_eq!(view.gear[0].quality, Quality::Missing);
        assert_eq!(view.speed_mps.len(), view.gear.len());
        let invalid = controls(&ControlHistory {
            freshness: HistoryFreshness::Invalid,
            samples: history.samples,
        });
        assert_eq!(invalid.quality, Quality::Invalid);
        assert!(invalid.captured_at_ms.is_empty());
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

    fn wire_float_array(field: &QValue<Vec<f64>>) -> Value {
        let mut value = wire_value(field);
        if let Some(values) = value.get_mut("v").and_then(Value::as_array_mut) {
            for element in values {
                if element.as_f64() == Some(0.0) {
                    *element = json!(0);
                }
            }
        }
        value
    }

    fn wire_float(field: &QValue<f64>) -> Value {
        let mut value = wire_value(field);
        if let Some(number) = value.get("v").and_then(Value::as_f64)
            && number.fract() == 0.0
            && number >= i64::MIN as f64
            && number < i64::MAX as f64
        {
            value["v"] = json!(number as i64);
        }
        value
    }

    fn wire_delta_reference(view: &delta::ReferenceView) -> Value {
        let mut value = json!({
            "requested": view.requested, "reference": view.reference,
            "seconds": wire_float(&view.seconds), "authority": view.authority,
        });
        if view.reference.is_none() {
            value.as_object_mut().unwrap().remove("reference");
        }
        if view.authority.is_none() {
            value.as_object_mut().unwrap().remove("authority");
        }
        value
    }

    #[test]
    fn static_44_core_slices_match_go_projection_oracle() {
        let golden: Value =
            serde_json::from_slice(include_bytes!("../testdata/overlay-core-slices-go-v1.json"))
                .unwrap();
        let engine = Engine::new(30, 15).unwrap();
        let prepared = engine
            .prepare(
                REAL_44,
                "1.3.0.0",
                100,
                100,
                100_000_000_000,
                ClockChange::Continuous,
            )
            .unwrap();
        let session = session(prepared.batch(), prepared.session_remaining());
        let player = player(prepared.batch(), SpeedUnit::Mps);
        let weather = weather(prepared.batch());
        let controls = controls(prepared.controls_history());
        let damage = damage(prepared.batch());
        let fuel = fuel::build(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.fuel_usage(),
            FuelUnit::Litres,
        );
        let delta = delta::build(prepared.delta(), "personal-best");
        let standings = standings::build(prepared.batch());
        let relative = relative::build(prepared.batch(), prepared.gaps(), false);
        let relative_same_class = relative::build(prepared.batch(), prepared.gaps(), true);
        let spotter = spatial::spotter(prepared.batch());
        let radar = spatial::radar(prepared.batch());
        let capability_availability = capabilities::availability(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.gaps(),
            prepared.delta(),
        );
        let mut widget_hz = Map::new();
        widget_hz.insert("pedals".into(), json!(40));
        let capability_source = capabilities::Source {
            descriptor_capabilities: vec!["shared-memory".into(), "rest".into()],
            modes: capabilities::Modes {
                spatial: vec!["xyz".into()],
                delta: vec!["personal-best".into()],
                standings: "official".into(),
                gaps: "reconstructed".into(),
            },
            performance: capabilities::Performance {
                level: 9,
                mode: "unknown".into(),
                effects: "unknown".into(),
                raf_cap: Some(40),
                widget_hz,
                reason: "unknown".into(),
                source_hz: 60.0,
            },
        };
        let capabilities = capabilities::build(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.gaps(),
            prepared.delta(),
            &capability_source,
        )
        .unwrap();
        assert_eq!(standings.len(), 44);
        let mut actual = json!({
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
            },
            "weather": {
                "ambientC": wire_value(&weather.ambient_c), "trackC": wire_value(&weather.track_c),
                "rainPercent": wire_value(&weather.rain_percent), "wetnessPct": wire_value(&weather.wetness_pct),
                "windKph": wire_value(&weather.wind_kph), "windDir": wire_value(&weather.wind_dir),
                "pressureHpa": wire_value(&weather.pressure_hpa),
            },
            "controls": {
                "history": {
                    "q": match controls.quality {
                        Quality::Fresh => "fresh", Quality::Stale => "stale",
                        Quality::Missing => "missing", Quality::Invalid => "invalid",
                    },
                    "capturedAtMS": controls.captured_at_ms,
                    "throttle": controls.throttle,
                    "brake": controls.brake,
                    "clutch": controls.clutch,
                    "speedMPS": controls.speed_mps.iter().map(wire_value).collect::<Vec<_>>(),
                    "rpm": controls.rpm.iter().map(wire_value).collect::<Vec<_>>(),
                    "gear": controls.gear.iter().map(wire_value).collect::<Vec<_>>(),
                }
            },
            "damage": {
                "dents": wire_value(&damage.dents),
                "overheating": wire_value(&damage.overheating),
                "detached": wire_value(&damage.detached),
                "wheelDetachedCount": wire_value(&damage.wheel_detached_count),
                "tyreWear": damage.tyre_wear.as_ref().map(wire_float_array),
            },
            "fuel": {
                "remaining": wire_float(&fuel.remaining), "capacity": wire_float(&fuel.capacity),
                "perLap": wire_float(&fuel.per_lap), "estimatedLaps": wire_float(&fuel.estimated_laps),
                "basis": fuel.basis, "sessionLaps": wire_float(&fuel.session_laps),
                "requiredFuel": wire_float(&fuel.required_fuel),
                "history": {
                    "q": match fuel.history_quality {
                        Quality::Fresh => "fresh", Quality::Stale => "stale",
                        Quality::Missing => "missing", Quality::Invalid => "invalid",
                    },
                    "lap": fuel.history_lap,
                    "consumed": fuel.history_consumed,
                }
            },
            "delta": {
                "references": delta.references.iter().map(wire_delta_reference).collect::<Vec<_>>(),
                "seconds": wire_float(&delta.seconds), "reference": delta.reference,
                "requested": delta.requested, "available": delta.available,
                "authority": delta.authority,
                "history": {
                    "q": match delta.history_quality {
                        Quality::Fresh => "fresh", Quality::Stale => "stale",
                        Quality::Missing => "missing", Quality::Invalid => "invalid",
                    },
                    "capturedAtMS": delta.history_captured_at_ms,
                    "seconds": delta.history_seconds,
                }
            },
            "standings": standings.iter().map(standings::Standing::to_wire).collect::<Vec<_>>(),
            "relative": relative,
            "relativeSameClass": relative_same_class,
            "spotter": spotter,
            "radar": radar,
            "capabilityAvailability": capability_availability,
            "capabilities": capabilities,
        });
        if damage.tyre_wear.is_none() {
            actual["damage"].as_object_mut().unwrap().remove("tyreWear");
        }
        if fuel.basis.is_none() {
            actual["fuel"].as_object_mut().unwrap().remove("basis");
        }
        if fuel.history_lap.is_empty() {
            let history = actual["fuel"]["history"].as_object_mut().unwrap();
            history.remove("lap");
            history.remove("consumed");
        }
        if delta.reference.is_none() {
            actual["delta"].as_object_mut().unwrap().remove("reference");
        }
        if delta.authority.is_none() {
            actual["delta"].as_object_mut().unwrap().remove("authority");
        }
        if delta.history_captured_at_ms.is_empty() {
            let history = actual["delta"]["history"].as_object_mut().unwrap();
            history.remove("capturedAtMS");
            history.remove("seconds");
        }
        let projected =
            frame::build_sections(&prepared, &capability_source, frame::Preferences::default())
                .unwrap();
        let mut expected_sections = actual.clone();
        expected_sections
            .as_object_mut()
            .unwrap()
            .remove("capabilityAvailability");
        assert_eq!(projected, expected_sections);
        let full = frame::wrap_full(
            &projected,
            frame::Metadata {
                revision: 1,
                state: "live",
                retry: 0,
                age_ms: 0,
                degraded_reason: "",
                epoch: prepared.batch().cursor.epoch,
                sequence: prepared.batch().cursor.sequence,
                section_mask: frame::ALL_SECTIONS_MASK,
                session_id: &prepared.batch().session_id,
                generated_at: "1970-01-01T00:01:40Z",
                speed_unit: "mps",
                temperature_unit: "celsius",
                pressure_unit: "kpa",
                fuel_unit: "liters",
            },
        )
        .unwrap();
        assert_eq!(full, golden["full"]);
        actual["full"] = full;
        let alternate_sections = frame::build_sections(
            &prepared,
            &capability_source,
            frame::Preferences {
                speed: SpeedUnit::Kph,
                fuel: FuelUnit::GallonsUs,
                delta_reference: "previous-lap",
            },
        )
        .unwrap();
        let full_alternate = frame::wrap_full(
            &alternate_sections,
            frame::Metadata {
                revision: 2,
                state: "live",
                retry: 0,
                age_ms: 0,
                degraded_reason: "",
                epoch: prepared.batch().cursor.epoch,
                sequence: prepared.batch().cursor.sequence,
                section_mask: frame::ALL_SECTIONS_MASK,
                session_id: &prepared.batch().session_id,
                generated_at: "1970-01-01T00:01:40Z",
                speed_unit: "kph",
                temperature_unit: "fahrenheit",
                pressure_unit: "psi",
                fuel_unit: "gallons-us",
            },
        )
        .unwrap();
        assert_eq!(full_alternate, golden["fullAlternate"]);
        actual["fullAlternate"] = full_alternate;
        assert_eq!(actual["fuel"], golden["fuel"]);
        assert_eq!(actual["capabilities"], golden["capabilities"]);
        assert_eq!(actual, golden);
    }
}
