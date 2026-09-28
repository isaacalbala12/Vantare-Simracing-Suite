//! Complete Overlay V2 wire envelope from product sections and source metadata.

use serde_json::{Map, Value, json};

use super::{
    QValue, Quality, SpeedUnit, capabilities, controls, damage, delta, fuel, player, relative,
    session, spatial, standings, weather,
};
use crate::engine::EngineCandidate;

pub const ALL_SECTIONS_MASK: u16 = super::cadence::ALL_SECTIONS_MASK;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameError {
    MissingSection,
    InvalidSourceState,
    InvalidSectionMask,
    InvalidCapabilitySource,
}

#[derive(Clone, Copy, Debug)]
pub struct Preferences {
    pub speed: SpeedUnit,
    pub fuel: fuel::FuelUnit,
    pub delta_reference: &'static str,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            speed: SpeedUnit::Mps,
            fuel: fuel::FuelUnit::Litres,
            delta_reference: "personal-best",
        }
    }
}

fn quality_word(quality: Quality) -> &'static str {
    match quality {
        Quality::Fresh => "fresh",
        Quality::Stale => "stale",
        Quality::Missing => "missing",
        Quality::Invalid => "invalid",
    }
}

fn wire_value<T: Clone + Default + PartialEq + Into<Value>>(field: &QValue<T>) -> Value {
    let mut object = Map::new();
    if let Some(value) = &field.value
        && *value != T::default()
    {
        object.insert("v".into(), value.clone().into());
    }
    object.insert("q".into(), json!(quality_word(field.quality)));
    Value::Object(object)
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

fn wire_delta_reference(view: &delta::ReferenceView) -> Value {
    let mut value = json!({
        "requested": view.requested, "reference": view.reference,
        "seconds": wire_float(&view.seconds), "authority": view.authority,
    });
    if view.reference.is_none() {
        value.as_object_mut().expect("object").remove("reference");
    }
    if view.authority.is_none() {
        value.as_object_mut().expect("object").remove("authority");
    }
    value
}

/// Projects one admitted candidate into all complete Overlay V2 sections.
/// The caller supplies host policy/capability declarations and keeps frame
/// publication behind the later candidate/commit and IPC gate.
pub fn build_sections(
    candidate: &EngineCandidate,
    source: &capabilities::Source,
    preferences: Preferences,
) -> Result<Value, FrameError> {
    let batch = candidate.batch();
    let session = session(batch, candidate.session_remaining());
    let player = player(batch, preferences.speed);
    let weather = weather(batch);
    let controls = controls(candidate.controls_history());
    let damage = damage(batch);
    let fuel = fuel::build(
        batch,
        candidate.session_remaining(),
        candidate.fuel_usage(),
        preferences.fuel,
    );
    let delta = delta::build(candidate.delta(), preferences.delta_reference);
    let standings = standings::build(batch);
    let relative = relative::build(batch, candidate.gaps(), false);
    let relative_same_class = relative::build(batch, candidate.gaps(), true);
    let spotter = spatial::spotter(batch);
    let radar = spatial::radar(batch);
    let capabilities = capabilities::build(
        batch,
        candidate.session_remaining(),
        candidate.gaps(),
        candidate.delta(),
        source,
    )
    .map_err(|_| FrameError::InvalidCapabilitySource)?;
    let mut result = json!({
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
        "controls": {"history": {
            "q": quality_word(controls.quality), "capturedAtMS": controls.captured_at_ms,
            "throttle": controls.throttle, "brake": controls.brake, "clutch": controls.clutch,
            "speedMPS": controls.speed_mps.iter().map(wire_value).collect::<Vec<_>>(),
            "rpm": controls.rpm.iter().map(wire_value).collect::<Vec<_>>(),
            "gear": controls.gear.iter().map(wire_value).collect::<Vec<_>>(),
        }},
        "damage": {
            "dents": wire_value(&damage.dents), "overheating": wire_value(&damage.overheating),
            "detached": wire_value(&damage.detached), "wheelDetachedCount": wire_value(&damage.wheel_detached_count),
            "tyreWear": damage.tyre_wear.as_ref().map(wire_float_array),
        },
        "fuel": {
            "remaining": wire_float(&fuel.remaining), "capacity": wire_float(&fuel.capacity),
            "perLap": wire_float(&fuel.per_lap), "estimatedLaps": wire_float(&fuel.estimated_laps),
            "basis": fuel.basis, "sessionLaps": wire_float(&fuel.session_laps),
            "requiredFuel": wire_float(&fuel.required_fuel),
            "history": {"q": quality_word(fuel.history_quality), "lap": fuel.history_lap, "consumed": fuel.history_consumed}
        },
        "delta": {
            "references": delta.references.iter().map(wire_delta_reference).collect::<Vec<_>>(),
            "seconds": wire_float(&delta.seconds), "reference": delta.reference,
            "requested": delta.requested, "available": delta.available, "authority": delta.authority,
            "history": {"q": quality_word(delta.history_quality), "capturedAtMS": delta.history_captured_at_ms, "seconds": delta.history_seconds}
        },
        "standings": standings.iter().map(standings::Standing::to_wire).collect::<Vec<_>>(),
        "relative": relative,
        "relativeSameClass": relative_same_class,
        "spotter": spotter,
        "radar": radar,
        "capabilities": capabilities,
    });
    if damage.tyre_wear.is_none() {
        result["damage"]
            .as_object_mut()
            .expect("object")
            .remove("tyreWear");
    }
    if fuel.basis.is_none() {
        result["fuel"]
            .as_object_mut()
            .expect("object")
            .remove("basis");
    }
    if fuel.history_lap.is_empty() {
        let history = result["fuel"]["history"].as_object_mut().expect("object");
        history.remove("lap");
        history.remove("consumed");
    }
    if delta.reference.is_none() {
        result["delta"]
            .as_object_mut()
            .expect("object")
            .remove("reference");
    }
    if delta.authority.is_none() {
        result["delta"]
            .as_object_mut()
            .expect("object")
            .remove("authority");
    }
    if delta.history_captured_at_ms.is_empty() {
        let history = result["delta"]["history"].as_object_mut().expect("object");
        history.remove("capturedAtMS");
        history.remove("seconds");
    }
    Ok(result)
}

#[derive(Clone, Copy, Debug)]
pub struct Metadata<'a> {
    pub revision: u64,
    pub state: &'a str,
    pub retry: i32,
    pub age_ms: i64,
    pub degraded_reason: &'a str,
    pub epoch: u64,
    pub sequence: u64,
    pub section_mask: u16,
    pub session_id: &'a str,
    pub generated_at: &'a str,
    pub speed_unit: &'a str,
    pub temperature_unit: &'a str,
    pub pressure_unit: &'a str,
    pub fuel_unit: &'a str,
}

/// Wraps the eleven Rust-owned sections into the product's full snapshot.
/// RelativeSettled is the bootstrap view; the stateful settler replaces it
/// when the cached projector is integrated.
pub fn wrap_full(sections: Value, metadata: Metadata<'_>) -> Result<Value, FrameError> {
    if !matches!(
        metadata.state,
        "stopped"
            | "detecting"
            | "connecting"
            | "live"
            | "degraded"
            | "stale"
            | "error"
            | "stopping"
    ) {
        return Err(FrameError::InvalidSourceState);
    }
    if metadata.section_mask & !ALL_SECTIONS_MASK != 0 {
        return Err(FrameError::InvalidSectionMask);
    }
    let Value::Object(mut sections) = sections else {
        return Err(FrameError::MissingSection);
    };
    let mut frame = Map::new();
    for name in [
        "session",
        "player",
        "controls",
        "standings",
        "relative",
        "relativeSameClass",
        "delta",
        "fuel",
        "spotter",
        "radar",
        "damage",
        "weather",
        "capabilities",
    ] {
        let Some(value) = sections.remove(name) else {
            return Err(FrameError::MissingSection);
        };
        frame.insert(name.into(), value);
    }
    frame.insert("relativeSettled".into(), frame["relative"].clone());
    frame.insert("contract".into(), json!(2));
    frame.insert("algorithm".into(), json!(2));
    frame.insert("epoch".into(), json!(metadata.epoch));
    frame.insert("sequence".into(), json!(metadata.sequence));
    frame.insert("sectionMask".into(), json!(metadata.section_mask));
    frame.insert("sessionId".into(), json!(metadata.session_id));
    frame.insert("generatedAt".into(), json!(metadata.generated_at));
    frame.insert(
        "units".into(),
        json!({
            "speed": metadata.speed_unit,
            "temperature": metadata.temperature_unit,
            "pressure": metadata.pressure_unit,
            "fuel": metadata.fuel_unit,
        }),
    );
    let mut source = Map::new();
    source.insert("state".into(), json!(metadata.state));
    if metadata.retry > 0 {
        source.insert("retry".into(), json!(metadata.retry));
    }
    if metadata.age_ms > 0 {
        source.insert("ageMs".into(), json!(metadata.age_ms));
    }
    if !metadata.degraded_reason.is_empty() {
        source.insert("reason".into(), json!(metadata.degraded_reason));
    }
    let mut update = Map::new();
    update.insert("revision".into(), json!(metadata.revision));
    update.insert("source".into(), Value::Object(source));
    update.insert("frame".into(), Value::Object(frame));
    Ok(Value::Object(update))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_section_unknown_state_and_foreign_mask_bit() {
        let mut meta = Metadata {
            revision: 1,
            state: "live",
            retry: 0,
            age_ms: 0,
            degraded_reason: "",
            epoch: 1,
            sequence: 1,
            section_mask: ALL_SECTIONS_MASK,
            session_id: "session",
            generated_at: "1970-01-01T00:01:40Z",
            speed_unit: "mps",
            temperature_unit: "celsius",
            pressure_unit: "kpa",
            fuel_unit: "liters",
        };
        assert_eq!(wrap_full(json!({}), meta), Err(FrameError::MissingSection));
        meta.state = "unknown";
        assert_eq!(
            wrap_full(json!({}), meta),
            Err(FrameError::InvalidSourceState)
        );
        meta.state = "live";
        meta.section_mask = ALL_SECTIONS_MASK | (1 << 15);
        assert_eq!(
            wrap_full(json!({}), meta),
            Err(FrameError::InvalidSectionMask)
        );
    }
}
