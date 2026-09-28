//! Strategy V1 observation payload. Planning decisions stay in the consumer.

use serde_json::{Value, json};

use crate::core::Batch;
use crate::lmu::{Fuel, Sector, SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness, Provenance};

pub(crate) fn field<T>(
    source: &Field<T>,
    empty: Value,
    convert: impl FnOnce(&T) -> Value,
) -> Value {
    match source {
        Field::Missing => json!({"present": false, "value": empty,
            "provenance": "unknown", "freshness": "missing"}),
        Field::Present {
            value,
            provenance,
            freshness,
        } => {
            let mut converted = convert(value);
            if let Some(number) = converted.as_f64()
                && converted.is_f64()
                && number.fract() == 0.0
                && number >= i64::MIN as f64
                && number < i64::MAX as f64
            {
                converted = json!(number as i64);
            }
            json!({
                "present": true,
                "value": converted,
                "provenance": match provenance {
                    Provenance::Observed => "observed",
                    Provenance::Derived => "derived",
                    Provenance::Estimated => "estimated",
                },
                "freshness": match freshness {
                    Freshness::Fresh => "fresh",
                    Freshness::Stale => "stale",
                    Freshness::Invalid => "invalid",
                },
            })
        }
    }
}

pub(crate) fn available(value: &Value) -> bool {
    value["present"] == true && value["freshness"] != "invalid"
}

pub(crate) fn session_name(value: &SessionType) -> &'static str {
    match value {
        SessionType::Practice => "practice",
        SessionType::Qualifying => "qualifying",
        SessionType::Race => "race",
        SessionType::Warmup => "warmup",
        SessionType::Endurance => "endurance",
        SessionType::Unknown => "unknown",
    }
}

fn missing_player(id: &str) -> Value {
    json!({
        "id": id,
        "lapNumber": field::<i32>(&Field::Missing, json!(0), |_| unreachable!()),
        "completedLaps": field::<i32>(&Field::Missing, json!(0), |_| unreachable!()),
        "sector": field::<Sector>(&Field::Missing, json!(0), |_| unreachable!()),
        "lapDistanceMeters": field::<f64>(&Field::Missing, json!(0), |_| unreachable!()),
        "inPit": field::<bool>(&Field::Missing, json!(false), |_| unreachable!()),
        "pitStopCount": field::<i32>(&Field::Missing, json!(0), |_| unreachable!()),
        "fuelLiters": field::<Fuel>(&Field::Missing, json!(0), |_| unreachable!()),
        "fuelCapacityLiters": field::<Fuel>(&Field::Missing, json!(0), |_| unreachable!()),
    })
}

/// Build only fields demonstrated by canonical LMU observations.
pub fn build(batch: &Batch<SessionType, LmuVehicleState>, remaining: &Field<f64>) -> Value {
    let state = &batch.state;
    let track_name = field(&state.track_name, json!(""), |value| json!(value));
    let session_type = field(&state.session_type, json!(""), |value| {
        json!(session_name(value))
    });
    let source_time = field(&state.source_time_ns, json!(0), |value| {
        json!(*value as f64 / 1e9)
    });
    let end_time = field(&state.end_time_seconds, json!(0), |value| json!(value));
    let remaining = field(remaining, json!(0), |value| json!(value));
    let maximum_laps = field(&state.maximum_laps, json!(0), |value| json!(value));
    let mut player = missing_player(batch.player_id.as_deref().unwrap_or(""));
    if let Some(current) = state
        .vehicles
        .iter()
        .find(|current| Some(current.id.as_str()) == batch.player_id.as_deref())
    {
        let value = &current.value;
        player["lapNumber"] = field(&value.lap_number, json!(0), |value| json!(value));
        player["completedLaps"] = field(&value.completed_laps, json!(0), |value| json!(value));
        player["sector"] = field(&value.sector, json!(0), |value| json!(*value as u8));
        player["lapDistanceMeters"] = field(&value.lap_distance, json!(0), |value| json!(value));
        player["inPit"] = field(&value.in_pit, json!(false), |value| json!(value));
        player["pitStopCount"] = field(&value.pit_stop_count, json!(0), |value| json!(value));
        player["fuelLiters"] = field(&value.fuel, json!(0), |value| json!(value.amount_liters));
        player["fuelCapacityLiters"] =
            field(&value.fuel, json!(0), |value| json!(value.capacity_liters));
    }
    let mut capabilities = Vec::with_capacity(4);
    if [
        &track_name,
        &session_type,
        &source_time,
        &end_time,
        &remaining,
        &maximum_laps,
    ]
    .iter()
    .any(|value| available(value))
    {
        capabilities.push("session");
    }
    if ["lapNumber", "completedLaps", "sector", "lapDistanceMeters"]
        .iter()
        .any(|key| available(&player[*key]))
    {
        capabilities.push("progress");
    }
    if ["inPit", "pitStopCount"]
        .iter()
        .any(|key| available(&player[*key]))
    {
        capabilities.push("pit");
    }
    if ["fuelLiters", "fuelCapacityLiters"]
        .iter()
        .any(|key| available(&player[*key]))
    {
        capabilities.push("fuel");
    }
    json!({
        "capabilities": capabilities,
        "trackName": track_name,
        "sessionType": session_type,
        "sourceTimeSeconds": source_time,
        "endTimeSeconds": end_time,
        "remainingSeconds": remaining,
        "maximumLaps": maximum_laps,
        "player": player,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn real_44_matches_go_strategy_payload() {
        let golden: Value = serde_json::from_slice(include_bytes!(
            "../../testdata/overlay-core-slices-go-v1.json"
        ))
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
        let got = build(prepared.batch(), prepared.session_remaining());
        assert_eq!(got, golden["strategy"]);
    }

    #[test]
    fn absent_player_stays_missing_and_invalid_is_unavailable() {
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
        let mut batch = prepared.batch().clone();
        batch.player_id = None;
        batch.state.session_type = Field::invalid_observed(SessionType::Race);
        batch.state.track_name = Field::Missing;
        batch.state.source_time_ns = Field::Missing;
        batch.state.end_time_seconds = Field::Missing;
        batch.state.maximum_laps = Field::Missing;
        let result = build(&batch, &Field::Missing);
        assert_eq!(result["player"]["id"], "");
        assert_eq!(result["player"]["fuelLiters"]["present"], false);
        assert_eq!(result["capabilities"], json!([]));
        assert_eq!(result["sessionType"]["freshness"], "invalid");
    }
}
