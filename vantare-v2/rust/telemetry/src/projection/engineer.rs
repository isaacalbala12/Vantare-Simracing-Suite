//! Engineer V1 full-grid observation, with a typed hot path.

use serde::Serialize;
use serde_json::Value;

use super::strategy::session_name;
use crate::core::{Batch, Vehicle};
use crate::derive::gaps::GapSet;
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness, Provenance};

#[derive(Clone, Copy, Serialize)]
pub struct FieldView<T> {
    present: bool,
    value: T,
    provenance: &'static str,
    freshness: &'static str,
}

impl<T> FieldView<T> {
    fn available(&self) -> bool {
        self.present && self.freshness != "invalid"
    }
}

fn project<'a, S, T: Default>(source: &'a Field<S>, map: impl FnOnce(&'a S) -> T) -> FieldView<T> {
    match source {
        Field::Missing => FieldView {
            present: false,
            value: T::default(),
            provenance: "unknown",
            freshness: "missing",
        },
        Field::Present {
            value,
            provenance,
            freshness,
        } => FieldView {
            present: true,
            value: map(value),
            provenance: match provenance {
                Provenance::Observed => "observed",
                Provenance::Derived => "derived",
                Provenance::Estimated => "estimated",
            },
            freshness: match freshness {
                Freshness::Fresh => "fresh",
                Freshness::Stale => "stale",
                Freshness::Invalid => "invalid",
            },
        },
    }
}

fn text(source: &Field<String>) -> FieldView<&str> {
    project(source, |value| value.as_str())
}

#[derive(Clone, Copy, Default)]
pub struct Number(f64);

impl Serialize for Number {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let value = self.0;
        if value.fract() == 0.0 && value >= i64::MIN as f64 && value < i64::MAX as f64 {
            serializer.serialize_i64(value as i64)
        } else {
            serializer.serialize_f64(value)
        }
    }
}

fn number(source: &Field<f64>) -> FieldView<Number> {
    project(source, |value| Number(*value))
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Vector3 {
    x: Number,
    y: Number,
    z: Number,
}

impl From<&[f64; 3]> for Vector3 {
    fn from(value: &[f64; 3]) -> Self {
        Self {
            x: Number(value[0]),
            y: Number(value[1]),
            z: Number(value[2]),
        }
    }
}

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "PascalCase")]
pub struct Orientation {
    row0: Vector3,
    row1: Vector3,
    row2: Vector3,
}

impl From<&[[f64; 3]; 3]> for Orientation {
    fn from(value: &[[f64; 3]; 3]) -> Self {
        Self {
            row0: Vector3::from(&value[0]),
            row1: Vector3::from(&value[1]),
            row2: Vector3::from(&value[2]),
        }
    }
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VehicleView<'a> {
    id: &'a str,
    driver_name: FieldView<&'a str>,
    vehicle_name: FieldView<&'a str>,
    vehicle_class: FieldView<&'a str>,
    is_player: FieldView<bool>,
    lap_number: FieldView<i32>,
    gear: FieldView<i32>,
    engine_rpm: FieldView<Number>,
    speed_mps: FieldView<Number>,
    throttle: FieldView<Number>,
    brake: FieldView<Number>,
    clutch: FieldView<Number>,
    position: FieldView<i32>,
    completed_laps: FieldView<i32>,
    in_pit: FieldView<bool>,
    pit_stop_count: FieldView<i32>,
    sector: FieldView<u8>,
    lap_distance_meters: FieldView<Number>,
    best_lap_seconds: FieldView<Number>,
    last_lap_seconds: FieldView<Number>,
    estimated_lap_seconds: FieldView<Number>,
    penalty_count: FieldView<i32>,
    time_behind_leader_seconds: FieldView<Number>,
    laps_behind_leader: FieldView<i32>,
    time_behind_next_seconds: FieldView<Number>,
    laps_behind_next: FieldView<i32>,
    fuel_liters: FieldView<Number>,
    fuel_capacity_liters: FieldView<Number>,
    relative_time_gap_seconds: FieldView<Number>,
    relative_lap_delta: FieldView<i32>,
    world_position: FieldView<Vector3>,
    local_velocity: FieldView<Vector3>,
    orientation: FieldView<Orientation>,
}

impl<'a> VehicleView<'a> {
    fn missing(id: &'a str) -> Self {
        Self {
            id,
            driver_name: project::<String, &str>(&Field::Missing, |_| unreachable!()),
            vehicle_name: project::<String, &str>(&Field::Missing, |_| unreachable!()),
            vehicle_class: project::<String, &str>(&Field::Missing, |_| unreachable!()),
            is_player: project::<bool, bool>(&Field::Missing, |_| unreachable!()),
            lap_number: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            gear: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            engine_rpm: number(&Field::Missing),
            speed_mps: number(&Field::Missing),
            throttle: number(&Field::Missing),
            brake: number(&Field::Missing),
            clutch: number(&Field::Missing),
            position: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            completed_laps: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            in_pit: project::<bool, bool>(&Field::Missing, |_| unreachable!()),
            pit_stop_count: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            sector: project::<u8, u8>(&Field::Missing, |_| unreachable!()),
            lap_distance_meters: number(&Field::Missing),
            best_lap_seconds: number(&Field::Missing),
            last_lap_seconds: number(&Field::Missing),
            estimated_lap_seconds: number(&Field::Missing),
            penalty_count: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            time_behind_leader_seconds: number(&Field::Missing),
            laps_behind_leader: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            time_behind_next_seconds: number(&Field::Missing),
            laps_behind_next: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            fuel_liters: number(&Field::Missing),
            fuel_capacity_liters: number(&Field::Missing),
            relative_time_gap_seconds: number(&Field::Missing),
            relative_lap_delta: project::<i32, i32>(&Field::Missing, |_| unreachable!()),
            world_position: project::<[f64; 3], Vector3>(&Field::Missing, |_| unreachable!()),
            local_velocity: project::<[f64; 3], Vector3>(&Field::Missing, |_| unreachable!()),
            orientation: project::<[[f64; 3]; 3], Orientation>(&Field::Missing, |_| unreachable!()),
        }
    }

    fn from_row(row: &'a Vehicle<LmuVehicleState>, gaps: &'a GapSet) -> Self {
        let current = &row.value;
        let gap = gaps.vehicles.iter().find(|gap| gap.vehicle_id == row.id);
        let gap_time = gap.map_or(&Field::Missing, |gap| &gap.time_seconds);
        let gap_laps = gap.map_or(&Field::Missing, |gap| &gap.laps);
        Self {
            id: &row.id,
            driver_name: text(&current.driver_name),
            vehicle_name: text(&current.name),
            vehicle_class: text(&current.vehicle_class),
            is_player: project(&current.player, |value| *value),
            lap_number: project(&current.lap_number, |value| *value),
            gear: project(&current.gear, |value| *value),
            engine_rpm: number(&current.engine_rpm),
            speed_mps: number(&current.speed_mps),
            throttle: number(&current.throttle),
            brake: number(&current.brake),
            clutch: number(&current.clutch),
            position: project(&current.position, |value| *value),
            completed_laps: project(&current.completed_laps, |value| *value),
            in_pit: project(&current.in_pit, |value| *value),
            pit_stop_count: project(&current.pit_stop_count, |value| *value),
            sector: project(&current.sector, |value| *value as u8),
            lap_distance_meters: number(&current.lap_distance),
            best_lap_seconds: number(&current.best_lap_time),
            last_lap_seconds: number(&current.last_lap_time),
            estimated_lap_seconds: number(&current.estimated_lap_time),
            penalty_count: project(&current.penalty_count, |value| *value),
            time_behind_leader_seconds: number(&current.time_behind_leader),
            laps_behind_leader: project(&current.laps_behind_leader, |value| *value),
            time_behind_next_seconds: number(&current.time_behind_next),
            laps_behind_next: project(&current.laps_behind_next, |value| *value),
            fuel_liters: project(&current.fuel, |value| Number(value.amount_liters)),
            fuel_capacity_liters: project(&current.fuel, |value| Number(value.capacity_liters)),
            relative_time_gap_seconds: number(gap_time),
            relative_lap_delta: project(gap_laps, |value| *value),
            world_position: project(&current.world_position, Vector3::from),
            local_velocity: project(&current.local_velocity, Vector3::from),
            orientation: project(&current.orientation, Orientation::from),
        }
    }

    fn any(&self, group: &[bool]) -> bool {
        group.iter().any(|value| *value)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineerView<'a> {
    capabilities: Vec<&'static str>,
    track_name: FieldView<&'a str>,
    session_type: FieldView<&'static str>,
    source_time_seconds: FieldView<Number>,
    end_time_seconds: FieldView<Number>,
    remaining_seconds: FieldView<Number>,
    maximum_laps: FieldView<i32>,
    vehicle_count: FieldView<i32>,
    player_present: FieldView<bool>,
    player: VehicleView<'a>,
    vehicles: Vec<VehicleView<'a>>,
}

/// Borrow canonical values and allocate only the owned vehicle vector.
/// This typed form can be serialized directly without per-field JSON maps.
pub fn build_typed<'a>(
    batch: &'a Batch<SessionType, LmuVehicleState>,
    remaining: &Field<f64>,
    gaps: &'a GapSet,
) -> EngineerView<'a> {
    let state = &batch.state;
    let track_name = text(&state.track_name);
    let session_type = project(&state.session_type, session_name);
    let source_time_seconds = project(&state.source_time_ns, |value| Number(*value as f64 / 1e9));
    let end_time_seconds = number(&state.end_time_seconds);
    let remaining_seconds = number(remaining);
    let maximum_laps = project(&state.maximum_laps, |value| *value);
    let vehicle_count = project(&state.vehicle_count, |value| *value);
    let player_present = project(&state.player_present, |value| *value);
    let vehicles: Vec<_> = state
        .vehicles
        .iter()
        .map(|row| VehicleView::from_row(row, gaps))
        .collect();
    let player = vehicles
        .iter()
        .find(|row| Some(row.id) == batch.player_id.as_deref())
        .copied()
        .unwrap_or_else(|| VehicleView::missing(batch.player_id.as_deref().unwrap_or("")));
    let mut capabilities = Vec::with_capacity(7);
    if [
        track_name.available(),
        session_type.available(),
        source_time_seconds.available(),
        end_time_seconds.available(),
        remaining_seconds.available(),
        maximum_laps.available(),
        vehicle_count.available(),
        player_present.available(),
    ]
    .contains(&true)
    {
        capabilities.push("session");
    }
    for (name, present) in [
        (
            "standings",
            vehicles.iter().any(|v| {
                v.any(&[
                    v.driver_name.available(),
                    v.vehicle_name.available(),
                    v.vehicle_class.available(),
                    v.is_player.available(),
                    v.lap_number.available(),
                    v.position.available(),
                    v.completed_laps.available(),
                    v.sector.available(),
                    v.lap_distance_meters.available(),
                    v.best_lap_seconds.available(),
                    v.last_lap_seconds.available(),
                    v.estimated_lap_seconds.available(),
                    v.penalty_count.available(),
                ])
            }),
        ),
        (
            "controls",
            vehicles.iter().any(|v| {
                v.any(&[
                    v.speed_mps.available(),
                    v.throttle.available(),
                    v.brake.available(),
                    v.clutch.available(),
                    v.gear.available(),
                    v.engine_rpm.available(),
                ])
            }),
        ),
        (
            "pit",
            vehicles
                .iter()
                .any(|v| v.in_pit.available() || v.pit_stop_count.available()),
        ),
        (
            "fuel",
            vehicles
                .iter()
                .any(|v| v.fuel_liters.available() || v.fuel_capacity_liters.available()),
        ),
        (
            "gaps",
            vehicles.iter().any(|v| {
                v.any(&[
                    v.time_behind_leader_seconds.available(),
                    v.laps_behind_leader.available(),
                    v.time_behind_next_seconds.available(),
                    v.laps_behind_next.available(),
                    v.relative_time_gap_seconds.available(),
                    v.relative_lap_delta.available(),
                ])
            }),
        ),
        (
            "spatial",
            vehicles.iter().any(|v| {
                v.world_position.available()
                    || v.local_velocity.available()
                    || v.orientation.available()
            }),
        ),
    ] {
        if present {
            capabilities.push(name);
        }
    }
    EngineerView {
        capabilities,
        track_name,
        session_type,
        source_time_seconds,
        end_time_seconds,
        remaining_seconds,
        maximum_laps,
        vehicle_count,
        player_present,
        player,
        vehicles,
    }
}

/// Compatibility for the existing JSON oracle and prototype IPC encoder.
pub fn build(
    batch: &Batch<SessionType, LmuVehicleState>,
    remaining: &Field<f64>,
    gaps: &GapSet,
) -> Value {
    serde_json::to_value(build_typed(batch, remaining, gaps))
        .expect("canonical Engineer projection serializes")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;
    use serde_json::json;

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
        let typed_json: Value = serde_json::from_slice(
            &serde_json::to_vec(&build_typed(
                prepared.batch(),
                prepared.session_remaining(),
                prepared.gaps(),
            ))
            .unwrap(),
        )
        .unwrap();
        assert_eq!(typed_json, golden["engineer"]);
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
        assert_eq!(actual["capabilities"].as_array().unwrap().len(), 7);
        assert_eq!(
            actual["player"]["orientation"]["value"]["Row0"],
            json!({"X":0,"Y":0,"Z":0})
        );
    }
}
