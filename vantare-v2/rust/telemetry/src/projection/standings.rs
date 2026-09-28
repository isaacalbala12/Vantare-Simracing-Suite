//! Overlay V2 standings preserve canonical order, class membership and quality.

use std::collections::HashMap;

use serde_json::{Map, Value, json};

use super::{QValue, Quality, project};
use crate::core::{self, Vehicle};
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness};

#[derive(Debug, PartialEq)]
pub struct Standing {
    pub vehicle_id: String,
    pub position: i32,
    pub class_position: i32,
    pub class_id: String,
    pub driver_name: String,
    pub car_number: String,
    pub pit_state: Option<&'static str>,
    pub completed_laps: i32,
    pub gap_laps: i32,
    pub class_gap: f64,
    pub class_gap_laps: i32,
    pub class_ref: i32,
    pub interval: f64,
    pub interval_laps: i32,
    pub gap_seconds: QValue<f64>,
    pub best_lap: QValue<f64>,
    pub last_lap: QValue<f64>,
    pub ground_position: QValue<[f64; 2]>,
    pub base_quality: Quality,
    pub overrides: [Option<Quality>; 9],
}

fn quality<T>(field: &Field<T>) -> Quality {
    match field {
        Field::Missing => Quality::Missing,
        Field::Present {
            freshness: Freshness::Fresh,
            ..
        } => Quality::Fresh,
        Field::Present {
            freshness: Freshness::Stale,
            ..
        } => Quality::Stale,
        Field::Present {
            freshness: Freshness::Invalid,
            ..
        } => Quality::Invalid,
    }
}

fn fresh<T>(field: &Field<T>) -> Option<&T> {
    match field {
        Field::Present {
            value,
            freshness: Freshness::Fresh,
            ..
        } => Some(value),
        _ => None,
    }
}

fn usable_position(row: &Vehicle<LmuVehicleState>) -> Option<i32> {
    fresh(&row.value.position)
        .copied()
        .filter(|position| *position > 0)
}

fn class_id(row: &Vehicle<LmuVehicleState>) -> &str {
    fresh(&row.value.vehicle_class).map_or("", |value| value.trim())
}

fn fresh_finite(field: &Field<f64>) -> Option<f64> {
    fresh(field).copied().filter(|value| value.is_finite())
}

fn class_gap(
    row: &Vehicle<LmuVehicleState>,
    leader: &Vehicle<LmuVehicleState>,
    track_length: &Field<f64>,
) -> (QValue<f64>, QValue<i32>) {
    if row.id == leader.id {
        return (
            QValue {
                value: Some(0.0),
                quality: Quality::Fresh,
            },
            QValue {
                value: Some(0),
                quality: Quality::Fresh,
            },
        );
    }
    let missing = || (QValue::missing(), QValue::missing());
    let (
        Some(length),
        Some(row_laps),
        Some(leader_laps),
        Some(row_distance),
        Some(leader_distance),
    ) = (
        fresh_finite(track_length),
        fresh(&row.value.completed_laps).copied(),
        fresh(&leader.value.completed_laps).copied(),
        fresh_finite(&row.value.lap_distance),
        fresh_finite(&leader.value.lap_distance),
    )
    else {
        return missing();
    };
    if length <= 0.0
        || row_laps < 0
        || leader_laps < 0
        || row_distance < 0.0
        || leader_distance < 0.0
        || row_distance >= length
        || leader_distance >= length
    {
        return missing();
    }
    let progress = f64::from(leader_laps - row_laps) + (leader_distance - row_distance) / length;
    if progress < 0.0 || !progress.is_finite() {
        return missing();
    }
    let lap_delta = QValue {
        value: Some(progress.floor() as i32),
        quality: Quality::Fresh,
    };
    let (Some(row_global_laps), Some(leader_global_laps), Some(row_seconds), Some(leader_seconds)) = (
        fresh(&row.value.laps_behind_leader).copied(),
        fresh(&leader.value.laps_behind_leader).copied(),
        fresh_finite(&row.value.time_behind_leader),
        fresh_finite(&leader.value.time_behind_leader),
    ) else {
        return (QValue::missing(), lap_delta);
    };
    if lap_delta.value != Some(0)
        || row_global_laps != leader_global_laps
        || row_seconds < leader_seconds
        || leader_seconds < 0.0
    {
        return (QValue::missing(), lap_delta);
    }
    (
        QValue {
            value: Some(row_seconds - leader_seconds),
            quality: Quality::Fresh,
        },
        lap_delta,
    )
}

fn base_quality(qualities: [Quality; 9]) -> (Quality, [Option<Quality>; 9]) {
    let mut base = Quality::Fresh;
    let mut count = 0;
    for candidate in qualities {
        let frequency = qualities
            .iter()
            .filter(|value| **value == candidate)
            .count();
        if frequency > count {
            base = candidate;
            count = frequency;
        }
    }
    (
        base,
        qualities.map(|value| (value != base).then_some(value)),
    )
}

pub fn build(batch: &core::Batch<SessionType, LmuVehicleState>) -> Vec<Standing> {
    let mut ordered: Vec<_> = batch.state.vehicles.iter().collect();
    ordered.sort_by_key(|row| {
        (
            usable_position(row).is_none(),
            usable_position(row).unwrap_or(0),
        )
    });
    let unknown_class = ordered.iter().any(|row| class_id(row).is_empty());
    let mut incomplete_classes = std::collections::HashSet::new();
    for row in &ordered {
        if usable_position(row).is_none() {
            incomplete_classes.insert(class_id(row).to_uppercase());
        }
    }
    let mut class_positions: HashMap<String, i32> = HashMap::new();
    let mut class_leaders: HashMap<String, &Vehicle<LmuVehicleState>> = HashMap::new();
    let mut result = Vec::with_capacity(ordered.len());
    for row in ordered {
        let class = class_id(row);
        let key = class.to_uppercase();
        let position = usable_position(row).unwrap_or(0);
        let mut class_position = 0;
        let mut class_quality = Quality::Missing;
        let mut class_ref = 0;
        let mut class_gap_seconds = QValue::missing();
        let mut class_gap_laps = QValue::missing();
        if position > 0 && !class.is_empty() && !unknown_class && !incomplete_classes.contains(&key)
        {
            let entry = class_positions.entry(key.clone()).or_default();
            *entry += 1;
            class_position = *entry;
            class_quality = Quality::Fresh;
            let leader = *class_leaders.entry(key).or_insert(row);
            class_ref = usable_position(leader).unwrap_or(0);
            (class_gap_seconds, class_gap_laps) = class_gap(row, leader, &batch.state.track_length);
        }
        let interval = project(&row.value.time_behind_next, |value| *value);
        let interval_laps = project(&row.value.laps_behind_next, |value| *value);
        let position_quality = if row.value.position.value().is_some_and(|value| *value <= 0) {
            Quality::Invalid
        } else {
            quality(&row.value.position)
        };
        let qualities = [
            position_quality,
            class_quality,
            quality(&row.value.in_pit),
            quality(&row.value.completed_laps),
            quality(&row.value.laps_behind_leader),
            class_gap_seconds.quality,
            class_gap_laps.quality,
            interval.quality,
            interval_laps.quality,
        ];
        let (base_quality, overrides) = base_quality(qualities);
        let ground_position = project(&row.value.world_position, |value| [value[0], value[2]]);
        result.push(Standing {
            vehicle_id: row.id.clone(),
            position,
            class_position,
            class_id: class.to_owned(),
            driver_name: fresh(&row.value.driver_name).cloned().unwrap_or_default(),
            car_number: fresh(&row.value.car_number).cloned().unwrap_or_default(),
            pit_state: fresh(&row.value.in_pit).map(|value| if *value { "pit" } else { "track" }),
            completed_laps: row.value.completed_laps.value().copied().unwrap_or(0),
            gap_laps: row.value.laps_behind_leader.value().copied().unwrap_or(0),
            class_gap: class_gap_seconds.value.unwrap_or(0.0),
            class_gap_laps: class_gap_laps.value.unwrap_or(0),
            class_ref,
            interval: interval.value.unwrap_or(0.0),
            interval_laps: interval_laps.value.unwrap_or(0),
            gap_seconds: project(&row.value.time_behind_leader, |value| *value),
            best_lap: project(&row.value.best_lap_time, |value| *value),
            last_lap: project(&row.value.last_lap_time, |value| *value),
            ground_position,
            base_quality,
            overrides,
        });
    }
    result
}

fn wire_quality(quality: Quality) -> &'static str {
    match quality {
        Quality::Fresh => "f",
        Quality::Stale => "s",
        Quality::Missing => "m",
        Quality::Invalid => "i",
    }
}
fn word_quality(quality: Quality) -> &'static str {
    match quality {
        Quality::Fresh => "fresh",
        Quality::Stale => "stale",
        Quality::Missing => "missing",
        Quality::Invalid => "invalid",
    }
}
fn number(value: f64) -> Value {
    if value.is_finite()
        && value.fract() == 0.0
        && value >= i64::MIN as f64
        && value < i64::MAX as f64
    {
        json!(value as i64)
    } else {
        json!(value)
    }
}

impl Standing {
    /// Compact Go Overlay V2 row spelling, including base quality and overrides.
    pub fn to_wire(&self) -> Value {
        let mut quality = Map::new();
        quality.insert("q".into(), json!(wire_quality(self.base_quality)));
        for (index, name) in [
            "position",
            "classPosition",
            "pit",
            "laps",
            "gapLaps",
            "classGap",
            "classGapLaps",
            "interval",
            "intervalLaps",
        ]
        .iter()
        .enumerate()
        {
            if let Some(value) = self.overrides[index] {
                quality.insert((*name).into(), json!(wire_quality(value)));
            }
        }
        for (name, field) in [
            ("g", &self.gap_seconds),
            ("b", &self.best_lap),
            ("l", &self.last_lap),
        ] {
            if field.quality != self.base_quality {
                quality.insert(name.into(), json!(wire_quality(field.quality)));
            }
        }
        let mut row = Map::new();
        row.insert("id".into(), json!(self.vehicle_id));
        row.insert("position".into(), json!(self.position));
        row.insert("classPosition".into(), json!(self.class_position));
        row.insert("laps".into(), json!(self.completed_laps));
        row.insert("gap".into(), number(self.gap_seconds.value.unwrap_or(0.0)));
        row.insert("bestLap".into(), number(self.best_lap.value.unwrap_or(0.0)));
        row.insert("lastLap".into(), number(self.last_lap.value.unwrap_or(0.0)));
        row.insert("q".into(), Value::Object(quality));
        let mut ground = Map::new();
        ground.insert(
            "q".into(),
            json!(word_quality(self.ground_position.quality)),
        );
        if let Some([x, z]) = self.ground_position.value {
            ground.insert("v".into(), json!({"x": number(x), "z": number(z)}));
        }
        row.insert("groundPosition".into(), Value::Object(ground));
        for (name, value) in [
            ("classId", &self.class_id),
            ("driver", &self.driver_name),
            ("number", &self.car_number),
        ] {
            if !value.is_empty() {
                row.insert(name.into(), json!(value));
            }
        }
        if let Some(pit) = self.pit_state {
            row.insert("pit".into(), json!(pit));
        }
        for (name, value) in [
            ("cg", number(self.class_gap)),
            ("cr", json!(self.class_ref)),
            ("cl", json!(self.class_gap_laps)),
            ("i", number(self.interval)),
            ("il", json!(self.interval_laps)),
            ("gapLaps", json!(self.gap_laps)),
        ] {
            if value != json!(0) {
                row.insert(name.into(), value);
            }
        }
        Value::Object(row)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn class_gap_distinguishes_timing_line_from_full_lap() {
        let engine = Engine::new(30, 23).unwrap();
        let candidate = engine
            .prepare(REAL_44, "1.3.0.0", 100, 100, 100_000_000_000)
            .unwrap();
        let mut batch = candidate.batch().clone();
        let initial = build(&batch);
        let leader_id = initial[0].vehicle_id.clone();
        let rival_id = initial[1].vehicle_id.clone();
        batch.state.track_length = Field::observed(1000.0);
        let leader = batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == leader_id)
            .unwrap();
        leader.value.vehicle_class = Field::observed("UNITTEST".into());
        leader.value.completed_laps = Field::observed(10);
        leader.value.lap_distance = Field::observed(10.0);
        leader.value.time_behind_leader = Field::observed(80.0);
        leader.value.laps_behind_leader = Field::observed(0);
        let rival = batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == rival_id)
            .unwrap();
        rival.value.vehicle_class = Field::observed("unittest".into());
        rival.value.completed_laps = Field::observed(9);
        rival.value.lap_distance = Field::observed(990.0);
        rival.value.time_behind_leader = Field::observed(84.0);
        rival.value.laps_behind_leader = Field::observed(0);
        let row = build(&batch)
            .into_iter()
            .find(|row| row.vehicle_id == rival_id)
            .unwrap();
        assert_eq!(row.class_ref, 1);
        assert_eq!(row.class_gap_laps, 0);
        assert_eq!(row.class_gap, 4.0);
        let rival = batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == rival_id)
            .unwrap();
        rival.value.lap_distance = Field::observed(700.0);
        let leader = batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == leader_id)
            .unwrap();
        leader.value.lap_distance = Field::observed(800.0);
        let row = build(&batch)
            .into_iter()
            .find(|row| row.vehicle_id == rival_id)
            .unwrap();
        assert_eq!(row.class_gap_laps, 1);
        assert_eq!(
            row.overrides[5].unwrap_or(row.base_quality),
            Quality::Missing
        );
        let rival = batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == rival_id)
            .unwrap();
        rival.value.lap_distance = Field::Missing;
        let row = build(&batch)
            .into_iter()
            .find(|row| row.vehicle_id == rival_id)
            .unwrap();
        assert_eq!(
            row.overrides[6].unwrap_or(row.base_quality),
            Quality::Missing
        );
    }
}
