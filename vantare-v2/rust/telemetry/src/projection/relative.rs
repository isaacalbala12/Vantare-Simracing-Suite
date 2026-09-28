//! Overlay V2 physical relative window and canonical display gaps.

use std::collections::HashSet;

use serde_json::{Map, Value, json};

use super::{QValue, Quality, project};
use crate::core::{self, Vehicle};
use crate::derive::gaps::{GapSet, VehicleGap};
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness, Provenance};

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

fn class_id(row: &Vehicle<LmuVehicleState>) -> &str {
    fresh(&row.value.vehicle_class).map_or("", |value| value.trim())
}

fn usable_distance(field: &Field<f64>) -> Option<f64> {
    match field {
        Field::Present {
            value,
            freshness: Freshness::Fresh | Freshness::Stale,
            ..
        } if value.is_finite() && *value >= 0.0 => Some(*value),
        _ => None,
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

fn wire_float(number: f64) -> Value {
    if number.is_finite()
        && number.fract() == 0.0
        && number >= i64::MIN as f64
        && number < i64::MAX as f64
    {
        json!(number as i64)
    } else {
        json!(number)
    }
}

fn wire_float_quality(field: QValue<f64>) -> Value {
    let mut object = Map::new();
    object.insert("q".into(), json!(quality_word(field.quality)));
    if let Some(value) = field.value
        && value != 0.0
    {
        object.insert("v".into(), wire_float(value));
    }
    Value::Object(object)
}

fn wire_int_quality(field: QValue<i32>) -> Value {
    let mut object = Map::new();
    object.insert("q".into(), json!(quality_word(field.quality)));
    if let Some(value) = field.value
        && value != 0
    {
        object.insert("v".into(), json!(value));
    }
    Value::Object(object)
}

fn gap_for<'a>(gaps: &'a GapSet, id: &str) -> Option<&'a VehicleGap> {
    gaps.vehicles.iter().find(|gap| gap.vehicle_id == id)
}

fn relative_gap(gap: Option<&VehicleGap>, side: &str) -> QValue<f64> {
    let Some(gap) = gap else {
        return QValue::missing();
    };
    let projected = project(&gap.time_seconds, |value| *value);
    if !matches!(projected.quality, Quality::Fresh | Quality::Stale) {
        return projected;
    }
    let consistent = match (side, projected.value) {
        ("player", Some(value)) => value == 0.0,
        ("ahead", Some(value)) => value > 0.0,
        ("behind", Some(value)) => value < 0.0,
        _ => false,
    };
    if consistent {
        projected
    } else {
        QValue {
            value: None,
            quality: Quality::Invalid,
        }
    }
}

fn row(row: &Vehicle<LmuVehicleState>, gap: Option<&VehicleGap>, side: &str) -> Value {
    let mut relative_time = relative_gap(gap, side);
    let mut authority = gap.and_then(|gap| match &gap.time_seconds {
        Field::Present {
            provenance: Provenance::Observed,
            ..
        } => Some("native"),
        _ => None,
    });
    if side == "player" && !matches!(relative_time.quality, Quality::Fresh | Quality::Stale) {
        relative_time = QValue::missing();
        authority = None;
    }
    let mut object = Map::new();
    object.insert("id".into(), json!(row.id));
    object.insert(
        "position".into(),
        json!(
            fresh(&row.value.position)
                .copied()
                .filter(|p| *p > 0)
                .unwrap_or(0)
        ),
    );
    object.insert("side".into(), json!(side));
    object.insert(
        "bestLap".into(),
        wire_float_quality(project(&row.value.best_lap_time, |value| *value)),
    );
    object.insert(
        "lastLap".into(),
        wire_float_quality(project(&row.value.last_lap_time, |value| *value)),
    );
    object.insert("gap".into(), wire_float_quality(relative_time));
    object.insert(
        "lapDelta".into(),
        wire_int_quality(
            gap.map_or_else(QValue::missing, |gap| project(&gap.laps, |value| *value)),
        ),
    );
    for (name, value) in [
        (
            "number",
            fresh(&row.value.car_number)
                .map(String::as_str)
                .unwrap_or(""),
        ),
        (
            "name",
            fresh(&row.value.driver_name)
                .map(String::as_str)
                .unwrap_or(""),
        ),
        ("classId", class_id(row)),
    ] {
        if !value.is_empty() {
            object.insert(name.into(), json!(value));
        }
    }
    if let Some(authority) = authority {
        object.insert("authority".into(), json!(authority));
    }
    Value::Object(object)
}

/// Select at most eight physical neighbours per side; temporal gaps only label rows.
pub fn build(
    batch: &core::Batch<SessionType, LmuVehicleState>,
    gaps: &GapSet,
    same_class: bool,
) -> Vec<Value> {
    let vehicles = &batch.state.vehicles;
    let Some(player) = vehicles.iter().find(|row| {
        matches!(
            &row.value.player,
            Field::Present {
                value: true,
                freshness: Freshness::Fresh | Freshness::Stale,
                ..
            }
        )
    }) else {
        return Vec::new();
    };
    let mut ahead = Vec::new();
    let mut behind = Vec::new();
    if let (Some(length), Some(player_distance)) = (
        usable_distance(&batch.state.track_length),
        usable_distance(&player.value.lap_distance),
    ) && length > 0.0
        && player_distance <= length
    {
        let mut seen = HashSet::new();
        seen.insert(player.id.as_str());
        for current in vehicles {
            if !seen.insert(current.id.as_str()) {
                continue;
            }
            if same_class
                && (class_id(player).is_empty()
                    || !class_id(current).eq_ignore_ascii_case(class_id(player)))
            {
                continue;
            }
            let Some(distance) =
                usable_distance(&current.value.lap_distance).filter(|distance| *distance <= length)
            else {
                continue;
            };
            let mut arc = (distance - player_distance + length) % length;
            if arc > length / 2.0 {
                arc -= length;
            }
            if arc < 0.0 || (arc == 0.0 && current.id < player.id) {
                behind.push((current, -arc));
            } else {
                ahead.push((current, arc));
            }
        }
    }
    for side in [&mut ahead, &mut behind] {
        side.sort_by(|(left, left_arc), (right, right_arc)| {
            left_arc.total_cmp(right_arc).then(left.id.cmp(&right.id))
        });
        side.truncate(8);
    }
    let mut result = Vec::with_capacity(ahead.len() + behind.len() + 1);
    for (current, _) in ahead {
        result.push(row(current, gap_for(gaps, &current.id), "ahead"));
    }
    result.push(row(player, gap_for(gaps, &player.id), "player"));
    for (current, _) in behind {
        result.push(row(current, gap_for(gaps, &current.id), "behind"));
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn physical_window_uses_shortest_arc_before_display_gap_and_class_limit() {
        let engine = Engine::new(30, 23).unwrap();
        let candidate = engine
            .prepare(REAL_44, "1.3.0.0", 100, 100, 100_000_000_000)
            .unwrap();
        let mut batch = candidate.batch().clone();
        let player_id = batch.player_id.clone().unwrap();
        let player_index = batch
            .state
            .vehicles
            .iter()
            .position(|row| row.id == player_id)
            .unwrap();
        let rivals: Vec<_> = (0..batch.state.vehicles.len())
            .filter(|index| *index != player_index)
            .take(3)
            .collect();
        let ids: Vec<_> = rivals
            .iter()
            .map(|index| batch.state.vehicles[*index].id.clone())
            .collect();
        for row in &mut batch.state.vehicles {
            row.value.lap_distance = Field::Missing;
        }
        batch.state.track_length = Field::observed(1000.0);
        batch.state.vehicles[player_index].value.lap_distance = Field::observed(100.0);
        batch.state.vehicles[player_index].value.vehicle_class = Field::observed("GT3".into());
        batch.state.vehicles[rivals[0]].value.lap_distance = Field::observed(600.0); // half lap goes ahead
        batch.state.vehicles[rivals[0]].value.vehicle_class = Field::observed("gt3".into());
        batch.state.vehicles[rivals[1]].value.lap_distance = Field::observed(99.0);
        batch.state.vehicles[rivals[1]].value.vehicle_class = Field::observed("LMP2".into());
        batch.state.vehicles[rivals[2]].value.lap_distance = Field::observed(101.0);
        batch.state.vehicles[rivals[2]].value.vehicle_class = Field::observed("GT3".into());
        let all = build(&batch, candidate.gaps(), false);
        assert_eq!(
            all.iter()
                .map(|row| row["id"].as_str().unwrap())
                .collect::<Vec<_>>(),
            [
                ids[2].as_str(),
                ids[0].as_str(),
                player_id.as_str(),
                ids[1].as_str()
            ]
        );
        assert_eq!(all[1]["side"], "ahead");
        let class = build(&batch, candidate.gaps(), true);
        assert_eq!(
            class
                .iter()
                .map(|row| row["id"].as_str().unwrap())
                .collect::<Vec<_>>(),
            [ids[2].as_str(), ids[0].as_str(), player_id.as_str()]
        );
        batch.state.track_length = Field::Missing;
        assert_eq!(build(&batch, candidate.gaps(), false).len(), 1);
        batch.state.vehicles[player_index].value.player = Field::Missing;
        assert!(build(&batch, candidate.gaps(), false).is_empty());
    }

    #[test]
    fn inconsistent_time_gap_invalidates_value_without_removing_physical_neighbour() {
        let engine = Engine::new(30, 24).unwrap();
        let candidate = engine
            .prepare(REAL_44, "1.3.0.0", 100, 100, 100_000_000_000)
            .unwrap();
        let mut batch = candidate.batch().clone();
        let player_id = batch.player_id.clone().unwrap();
        let rival_id = batch
            .state
            .vehicles
            .iter()
            .find(|row| row.id != player_id)
            .unwrap()
            .id
            .clone();
        for row in &mut batch.state.vehicles {
            row.value.lap_distance = Field::Missing;
        }
        batch.state.track_length = Field::observed(1000.0);
        batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == player_id)
            .unwrap()
            .value
            .lap_distance = Field::observed(100.0);
        batch
            .state
            .vehicles
            .iter_mut()
            .find(|row| row.id == rival_id)
            .unwrap()
            .value
            .lap_distance = Field::observed(101.0);
        let mut gaps = candidate.gaps().clone();
        gaps.vehicles
            .iter_mut()
            .find(|gap| gap.vehicle_id == rival_id)
            .unwrap()
            .time_seconds = Field::Present {
            value: -1.5,
            provenance: Provenance::Derived,
            freshness: Freshness::Fresh,
        };
        let rows = build(&batch, &gaps, false);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["id"], rival_id);
        assert_eq!(rows[0]["gap"], json!({"q": "invalid"}));
    }
}
