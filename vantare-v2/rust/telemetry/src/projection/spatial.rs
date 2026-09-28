//! Shared player-frame geometry for Overlay V2 Spotter and Radar.

use serde_json::{Value, json};

use crate::core::{self, Vehicle};
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness};

fn player(batch: &core::Batch<SessionType, LmuVehicleState>) -> Option<&Vehicle<LmuVehicleState>> {
    batch.state.vehicles.iter().find(|row| {
        matches!(
            &row.value.player,
            Field::Present {
                value: true,
                freshness: Freshness::Fresh | Freshness::Stale,
                ..
            }
        )
    })
}

fn position(field: &Field<[f64; 3]>) -> Option<([f64; 3], &'static str)> {
    let Field::Present {
        value, freshness, ..
    } = field
    else {
        return None;
    };
    let quality = match freshness {
        Freshness::Fresh => "fresh",
        Freshness::Stale => "stale",
        Freshness::Invalid => return None,
    };
    if !value.iter().all(|coordinate| coordinate.is_finite()) || *value == [0.0; 3] {
        return None;
    }
    Some((*value, quality))
}

fn yaw(field: &Field<[[f64; 3]; 3]>) -> Option<f64> {
    let Field::Present {
        value,
        freshness: Freshness::Fresh | Freshness::Stale,
        ..
    } = field
    else {
        return None;
    };
    let [x, _, z] = value[2];
    if !x.is_finite() || !z.is_finite() || (x == 0.0 && z == 0.0) {
        return None;
    }
    let mut angle = x.atan2(z);
    if angle < 0.0 {
        angle += 2.0 * std::f64::consts::PI;
    }
    Some(angle)
}

fn aligned(yaw: f64, player: [f64; 3], rival: [f64; 3]) -> (f64, f64) {
    let raw_x = rival[0] - player[0];
    let raw_z = rival[2] - player[2];
    let (sin, cos) = yaw.sin_cos();
    (cos * raw_x + sin * raw_z, cos * raw_z - sin * raw_x)
}

fn overlap(x: f64, z: f64) -> bool {
    if !x.is_finite() || !z.is_finite() || x == 0.0 || x.abs() > 20.0 || x.abs() <= 1.8 {
        return false;
    }
    if z <= 0.0 { -z < 4.5 } else { z < 4.9 }
}

fn in_pit(row: &Vehicle<LmuVehicleState>) -> bool {
    row.value.in_pit.value() == Some(&true)
}

fn invalid_distance(row: &Vehicle<LmuVehicleState>) -> bool {
    row.value
        .lap_distance
        .value()
        .is_some_and(|distance| *distance < 0.0)
}

fn unavailable_spotter() -> Value {
    json!({"mode":"none", "left":{"q":"missing"}, "right":{"q":"missing"}})
}

pub fn spotter(batch: &core::Batch<SessionType, LmuVehicleState>) -> Value {
    let Some(player) = player(batch) else {
        return unavailable_spotter();
    };
    let Some((point, quality)) = position(&player.value.world_position) else {
        return unavailable_spotter();
    };
    let Some(yaw) = yaw(&player.value.orientation) else {
        return unavailable_spotter();
    };
    if player
        .value
        .speed_mps
        .value()
        .is_some_and(|speed| *speed < 10.0)
        && !matches!(
            &player.value.speed_mps,
            Field::Present {
                freshness: Freshness::Invalid,
                ..
            }
        )
        || in_pit(player)
    {
        return unavailable_spotter();
    }
    let mut left = false;
    let mut right = false;
    for rival in &batch.state.vehicles {
        if rival.id == player.id || in_pit(rival) || invalid_distance(rival) {
            continue;
        }
        let Some((rival_point, _)) = position(&rival.value.world_position) else {
            continue;
        };
        let (x, z) = aligned(yaw, point, rival_point);
        if overlap(x, z) {
            if x > 0.0 {
                left = true;
            } else {
                right = true;
            }
        }
    }
    let side = |occupied| {
        if occupied {
            json!({"v":true,"q":quality})
        } else {
            json!({"q":quality})
        }
    };
    json!({"mode":"xyz", "left":side(left), "right":side(right)})
}

fn fresh_number(field: &Field<f64>) -> Option<f64> {
    match field {
        Field::Present {
            value,
            freshness: Freshness::Fresh,
            ..
        } if value.is_finite() => Some(*value),
        _ => None,
    }
}

fn lapped(
    player: &Vehicle<LmuVehicleState>,
    rival: &Vehicle<LmuVehicleState>,
    length: &Field<f64>,
) -> bool {
    let (Some(length), Some(player_distance), Some(rival_distance)) = (
        fresh_number(length),
        fresh_number(&player.value.lap_distance),
        fresh_number(&rival.value.lap_distance),
    ) else {
        return false;
    };
    let fresh_laps = |field: &Field<i32>| match field {
        Field::Present {
            value,
            freshness: Freshness::Fresh,
            ..
        } => Some(*value),
        _ => None,
    };
    let (Some(player_laps), Some(rival_laps)) = (
        fresh_laps(&player.value.completed_laps),
        fresh_laps(&rival.value.completed_laps),
    ) else {
        return false;
    };
    if length <= 0.0
        || player_distance < 0.0
        || rival_distance < 0.0
        || player_distance >= length
        || rival_distance >= length
        || player_laps < 0
        || rival_laps < 0
    {
        return false;
    }
    f64::from(player_laps - rival_laps) + (player_distance - rival_distance) / length >= 1.0
}

pub fn radar(batch: &core::Batch<SessionType, LmuVehicleState>) -> Value {
    let unavailable = || json!({"mode":"none","cars":[]});
    let Some(player) = player(batch) else {
        return unavailable();
    };
    if !matches!(
        &player.value.orientation,
        Field::Present {
            freshness: Freshness::Fresh,
            ..
        }
    ) {
        return unavailable();
    }
    let Some((point, "fresh")) = position(&player.value.world_position) else {
        return unavailable();
    };
    let Some(yaw) = yaw(&player.value.orientation) else {
        return unavailable();
    };
    if in_pit(player) {
        return unavailable();
    }
    let mut cars = Vec::new();
    for rival in &batch.state.vehicles {
        if rival.id == player.id || in_pit(rival) || invalid_distance(rival) {
            continue;
        }
        let Some((rival_point, "fresh")) = position(&rival.value.world_position) else {
            continue;
        };
        if (rival_point[1] - point[1]).abs() > 5.0 {
            continue;
        }
        let (x, z) = aligned(yaw, point, rival_point);
        let distance_squared = x * x + z * z;
        if distance_squared > 900.0 {
            continue;
        }
        cars.push((distance_squared, &rival.id, json!({"id":rival.id,"x":x,"z":z,"overlap":overlap(x,z),"near":distance_squared<=100.0,"lapped":lapped(player,rival,&batch.state.track_length)})));
    }
    cars.sort_by(|left, right| left.0.total_cmp(&right.0).then(left.1.cmp(right.1)));
    json!({"mode":"xyz", "cars":cars.into_iter().take(16).map(|(_,_,car)| car).collect::<Vec<_>>()})
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn populated_spatial_views_classify_side_and_full_lap_from_real_batch_copy() {
        let engine = Engine::new(30, 25).unwrap();
        let candidate = engine
            .prepare(
                REAL_44,
                "1.3.0.0",
                100,
                100,
                100_000_000_000,
                ClockChange::Continuous,
            )
            .unwrap();
        let mut batch = candidate.batch().clone();
        let player_id = batch.player_id.clone().unwrap();
        let player_index = batch
            .state
            .vehicles
            .iter()
            .position(|row| row.id == player_id)
            .unwrap();
        let rival_index = (0..batch.state.vehicles.len())
            .find(|index| *index != player_index)
            .unwrap();
        for row in &mut batch.state.vehicles {
            row.value.world_position = Field::Missing;
        }
        batch.state.track_length = Field::observed(1000.0);
        let player = &mut batch.state.vehicles[player_index];
        player.value.world_position = Field::observed([100.0, 0.0, 100.0]);
        player.value.orientation =
            Field::observed([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]);
        player.value.speed_mps = Field::observed(20.0);
        player.value.in_pit = Field::observed(false);
        player.value.completed_laps = Field::observed(10);
        player.value.lap_distance = Field::observed(10.0);
        let rival = &mut batch.state.vehicles[rival_index];
        rival.value.world_position = Field::observed([103.0, 0.0, 101.0]);
        rival.value.in_pit = Field::observed(false);
        rival.value.completed_laps = Field::observed(9);
        rival.value.lap_distance = Field::observed(990.0);
        assert_eq!(spotter(&batch)["left"], json!({"v":true,"q":"fresh"}));
        assert_eq!(spotter(&batch)["right"], json!({"q":"fresh"}));
        let cars = radar(&batch)["cars"].as_array().unwrap().clone();
        assert_eq!(cars.len(), 1);
        assert_eq!(cars[0]["x"], 3.0);
        assert_eq!(cars[0]["z"], 1.0);
        assert_eq!(cars[0]["overlap"], true);
        assert_eq!(cars[0]["lapped"], false); // timing-line crossing is not a full lap
        batch.state.vehicles[rival_index].value.lap_distance = Field::observed(0.0);
        assert_eq!(radar(&batch)["cars"][0]["lapped"], true);
        batch.state.vehicles[player_index].value.world_position = Field::Missing;
        assert_eq!(spotter(&batch)["mode"], "none");
        assert_eq!(radar(&batch)["mode"], "none");
    }
}
