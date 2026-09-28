//! Engineer V1 full-grid observation payload, without radio decisions.

use serde_json::{Value, json};

use super::strategy::{available, field, session_name};
use crate::core::{Batch, Vehicle};
use crate::derive::gaps::GapSet;
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::Field;

fn vector(value: &[f64; 3]) -> Value {
    json!({"X": value[0], "Y": value[1], "Z": value[2]})
}

fn orientation(value: &[[f64; 3]; 3]) -> Value {
    json!({"Row0": vector(&value[0]), "Row1": vector(&value[1]), "Row2": vector(&value[2])})
}

fn missing_player(id: &str) -> Value {
    let mut result = json!({"id": id});
    for key in ["driverName", "vehicleName", "vehicleClass"] {
        result[key] = field::<String>(&Field::Missing, json!(""), |_| unreachable!());
    }
    for key in ["isPlayer", "inPit"] {
        result[key] = field::<bool>(&Field::Missing, json!(false), |_| unreachable!());
    }
    for key in [
        "lapNumber",
        "gear",
        "position",
        "completedLaps",
        "pitStopCount",
        "sector",
        "penaltyCount",
        "lapsBehindLeader",
        "lapsBehindNext",
        "relativeLapDelta",
    ] {
        result[key] = field::<i32>(&Field::Missing, json!(0), |_| unreachable!());
    }
    for key in [
        "engineRpm",
        "speedMps",
        "throttle",
        "brake",
        "clutch",
        "lapDistanceMeters",
        "bestLapSeconds",
        "lastLapSeconds",
        "estimatedLapSeconds",
        "timeBehindLeaderSeconds",
        "timeBehindNextSeconds",
        "fuelLiters",
        "fuelCapacityLiters",
        "relativeTimeGapSeconds",
    ] {
        result[key] = field::<f64>(&Field::Missing, json!(0), |_| unreachable!());
    }
    let empty_vector = vector(&[0.0; 3]);
    for key in ["worldPosition", "localVelocity"] {
        result[key] = field::<[f64; 3]>(&Field::Missing, empty_vector.clone(), |_| unreachable!());
    }
    result["orientation"] = field::<[[f64; 3]; 3]>(
        &Field::Missing,
        orientation(&[[0.0; 3]; 3]),
        |_| unreachable!(),
    );
    result
}

fn project_vehicle(row: &Vehicle<LmuVehicleState>, gaps: &GapSet) -> Value {
    let current = &row.value;
    let gap = gaps.vehicles.iter().find(|gap| gap.vehicle_id == row.id);
    let gap_time = gap.map_or(&Field::Missing, |gap| &gap.time_seconds);
    let gap_laps = gap.map_or(&Field::Missing, |gap| &gap.laps);
    json!({
        "id": row.id,
        "driverName": field(&current.driver_name, json!(""), |value| json!(value)),
        "vehicleName": field(&current.name, json!(""), |value| json!(value)),
        "vehicleClass": field(&current.vehicle_class, json!(""), |value| json!(value)),
        "isPlayer": field(&current.player, json!(false), |value| json!(value)),
        "lapNumber": field(&current.lap_number, json!(0), |value| json!(value)),
        "gear": field(&current.gear, json!(0), |value| json!(value)),
        "engineRpm": field(&current.engine_rpm, json!(0), |value| json!(value)),
        "speedMps": field(&current.speed_mps, json!(0), |value| json!(value)),
        "throttle": field(&current.throttle, json!(0), |value| json!(value)),
        "brake": field(&current.brake, json!(0), |value| json!(value)),
        "clutch": field(&current.clutch, json!(0), |value| json!(value)),
        "position": field(&current.position, json!(0), |value| json!(value)),
        "completedLaps": field(&current.completed_laps, json!(0), |value| json!(value)),
        "inPit": field(&current.in_pit, json!(false), |value| json!(value)),
        "pitStopCount": field(&current.pit_stop_count, json!(0), |value| json!(value)),
        "sector": field(&current.sector, json!(0), |value| json!(*value as u8)),
        "lapDistanceMeters": field(&current.lap_distance, json!(0), |value| json!(value)),
        "bestLapSeconds": field(&current.best_lap_time, json!(0), |value| json!(value)),
        "lastLapSeconds": field(&current.last_lap_time, json!(0), |value| json!(value)),
        "estimatedLapSeconds": field(&current.estimated_lap_time, json!(0), |value| json!(value)),
        "penaltyCount": field(&current.penalty_count, json!(0), |value| json!(value)),
        "timeBehindLeaderSeconds": field(&current.time_behind_leader, json!(0), |value| json!(value)),
        "lapsBehindLeader": field(&current.laps_behind_leader, json!(0), |value| json!(value)),
        "timeBehindNextSeconds": field(&current.time_behind_next, json!(0), |value| json!(value)),
        "lapsBehindNext": field(&current.laps_behind_next, json!(0), |value| json!(value)),
        "fuelLiters": field(&current.fuel, json!(0), |value| json!(value.amount_liters)),
        "fuelCapacityLiters": field(&current.fuel, json!(0), |value| json!(value.capacity_liters)),
        "relativeTimeGapSeconds": field(gap_time, json!(0), |value| json!(value)),
        "relativeLapDelta": field(gap_laps, json!(0), |value| json!(value)),
        "worldPosition": field(&current.world_position, vector(&[0.0; 3]), vector),
        "localVelocity": field(&current.local_velocity, vector(&[0.0; 3]), vector),
        "orientation": field(&current.orientation, orientation(&[[0.0; 3]; 3]), orientation),
    })
}

fn any_field(object: &Value, keys: &[&str]) -> bool {
    keys.iter().any(|key| available(&object[*key]))
}

/// Project the complete canonical grid in source order, even when a vehicle
/// has no usable fields. Capability groups follow Go's fixed order.
pub fn build(
    batch: &Batch<SessionType, LmuVehicleState>,
    remaining: &Field<f64>,
    gaps: &GapSet,
) -> Value {
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
    let vehicle_count = field(&state.vehicle_count, json!(0), |value| json!(value));
    let player_present = field(&state.player_present, json!(false), |value| json!(value));
    let vehicles: Vec<Value> = state
        .vehicles
        .iter()
        .map(|row| project_vehicle(row, gaps))
        .collect();
    let player = vehicles
        .iter()
        .find(|row| row["id"].as_str() == batch.player_id.as_deref())
        .cloned()
        .unwrap_or_else(|| missing_player(batch.player_id.as_deref().unwrap_or("")));
    let mut capabilities = Vec::with_capacity(7);
    if [
        &track_name,
        &session_type,
        &source_time,
        &end_time,
        &remaining,
        &maximum_laps,
        &vehicle_count,
        &player_present,
    ]
    .iter()
    .any(|value| available(value))
    {
        capabilities.push("session");
    }
    for (group, keys) in [
        (
            "standings",
            &[
                "driverName",
                "vehicleName",
                "vehicleClass",
                "isPlayer",
                "lapNumber",
                "position",
                "completedLaps",
                "sector",
                "lapDistanceMeters",
                "bestLapSeconds",
                "lastLapSeconds",
                "estimatedLapSeconds",
                "penaltyCount",
            ][..],
        ),
        (
            "controls",
            &[
                "speedMps",
                "throttle",
                "brake",
                "clutch",
                "gear",
                "engineRpm",
            ],
        ),
        ("pit", &["inPit", "pitStopCount"]),
        ("fuel", &["fuelLiters", "fuelCapacityLiters"]),
        (
            "gaps",
            &[
                "timeBehindLeaderSeconds",
                "lapsBehindLeader",
                "timeBehindNextSeconds",
                "lapsBehindNext",
                "relativeTimeGapSeconds",
                "relativeLapDelta",
            ],
        ),
        (
            "spatial",
            &["worldPosition", "localVelocity", "orientation"],
        ),
    ] {
        if vehicles.iter().any(|row| any_field(row, keys)) {
            capabilities.push(group);
        }
    }
    json!({
        "capabilities": capabilities,
        "trackName": track_name, "sessionType": session_type,
        "sourceTimeSeconds": source_time, "endTimeSeconds": end_time,
        "remainingSeconds": remaining, "maximumLaps": maximum_laps,
        "vehicleCount": vehicle_count, "playerPresent": player_present,
        "player": player, "vehicles": vehicles,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn real_44_full_grid_matches_go_engineer_payload() {
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
        let actual = build(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.gaps(),
        );
        assert_eq!(actual["vehicles"].as_array().unwrap().len(), 44);
        assert_eq!(actual, golden["engineer"]);
    }

    #[test]
    fn absent_player_and_invalid_session_keep_explicit_quality() {
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
        batch.player_id = Some("not-in-grid".into());
        batch.state.session_type = Field::invalid_observed(SessionType::Race);
        let actual = build(&batch, prepared.session_remaining(), prepared.gaps());
        assert_eq!(actual["player"]["id"], "not-in-grid");
        assert_eq!(actual["player"]["worldPosition"]["present"], false);
        assert_eq!(actual["sessionType"]["freshness"], "invalid");
        assert_eq!(actual["vehicles"].as_array().unwrap().len(), 44);
    }
}
