//! Simulator-neutral relative progress and time gaps (Go relative.gaps v3).

use crate::core::{Vehicle, VehicleState};
use crate::quality::{Field, Freshness, Provenance};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GapFreshness {
    Fresh,
    Stale,
    Missing,
    Invalid,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VehicleGap {
    pub vehicle_id: String,
    pub time_seconds: Field<f64>,
    pub laps: Field<i32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GapSet {
    pub freshness: GapFreshness,
    pub vehicles: Vec<VehicleGap>,
}

pub trait GapSignals {
    fn player(&self) -> &Field<bool>;
    fn completed_laps(&self) -> &Field<i32>;
    fn lap_distance(&self) -> &Field<f64>;
    fn lap_progress_time(&self) -> &Field<f64>;
    fn estimated_lap_time(&self) -> &Field<f64>;
}

impl<S, F, D> GapSignals for VehicleState<S, F, D> {
    fn player(&self) -> &Field<bool> {
        &self.player
    }
    fn completed_laps(&self) -> &Field<i32> {
        &self.completed_laps
    }
    fn lap_distance(&self) -> &Field<f64> {
        &self.lap_distance
    }
    fn lap_progress_time(&self) -> &Field<f64> {
        &self.lap_progress_time
    }
    fn estimated_lap_time(&self) -> &Field<f64> {
        &self.estimated_lap_time
    }
}

pub fn derive<V: GapSignals>(
    player_id: Option<&str>,
    player_present: &Field<bool>,
    vehicles: &[Vehicle<V>],
    track_length: &Field<f64>,
) -> GapSet {
    let missing = || GapSet {
        freshness: GapFreshness::Missing,
        vehicles: Vec::new(),
    };
    let Some(player_id) = player_id.filter(|id| !id.is_empty()) else {
        return missing();
    };
    if observed_bool(player_present) != Some(true) {
        return missing();
    }
    let Some(player) = vehicles.iter().find(|vehicle| vehicle.id == player_id) else {
        return missing();
    };
    if observed_bool(player.value.player()) != Some(true) {
        return missing();
    }
    let mut result = GapSet {
        freshness: GapFreshness::Fresh,
        vehicles: Vec::with_capacity(vehicles.len()),
    };
    for current in vehicles {
        let gap = vehicle_gap(player, current, track_length);
        result.freshness = worst(
            result.freshness,
            worst(field_quality(&gap.time_seconds), field_quality(&gap.laps)),
        );
        result.vehicles.push(gap);
    }
    result
}

fn vehicle_gap<V: GapSignals>(
    player: &Vehicle<V>,
    current: &Vehicle<V>,
    track_length: &Field<f64>,
) -> VehicleGap {
    let laps = relative_laps(&player.value, &current.value, track_length);
    let time_quality = exact_quality(
        player.value.lap_progress_time(),
        current.value.lap_progress_time(),
    );
    let time_seconds = match time_quality {
        GapFreshness::Invalid => invalid(),
        GapFreshness::Missing => Field::Missing,
        GapFreshness::Fresh | GapFreshness::Stale => {
            let (Some(&player_time), Some(&current_time)) = (
                player.value.lap_progress_time().value(),
                current.value.lap_progress_time().value(),
            ) else {
                unreachable!()
            };
            if !player_time.is_finite() || !current_time.is_finite() {
                invalid()
            } else if player.id == current.id {
                derived(0.0, time_quality)
            } else {
                let period_quality = exact_quality(
                    player.value.lap_progress_time(),
                    player.value.estimated_lap_time(),
                );
                if period_quality == GapFreshness::Invalid {
                    invalid()
                } else if period_quality != time_quality {
                    Field::Missing
                } else {
                    let period = *player
                        .value
                        .estimated_lap_time()
                        .value()
                        .expect("usable period");
                    if !period.is_finite() || period <= 0.0 {
                        invalid()
                    } else {
                        let mut delta = current_time - player_time;
                        delta -= (delta / period).round() * period;
                        if delta.is_finite() {
                            derived(delta, time_quality)
                        } else {
                            invalid()
                        }
                    }
                }
            }
        }
    };
    VehicleGap {
        vehicle_id: current.id.clone(),
        time_seconds,
        laps,
    }
}

fn relative_laps<V: GapSignals>(player: &V, current: &V, track_length: &Field<f64>) -> Field<i32> {
    let laps_quality = exact_quality(player.completed_laps(), current.completed_laps());
    let distance_quality = exact_quality(player.lap_distance(), current.lap_distance());
    let length_quality = single_quality(track_length);
    if laps_quality != distance_quality
        || laps_quality != length_quality
        || matches!(laps_quality, GapFreshness::Invalid | GapFreshness::Missing)
    {
        return if [laps_quality, distance_quality, length_quality].contains(&GapFreshness::Invalid)
        {
            invalid()
        } else {
            Field::Missing
        };
    }
    let length = *track_length.value().expect("usable track length");
    let player_distance = *player
        .lap_distance()
        .value()
        .expect("usable player distance");
    let current_distance = *current
        .lap_distance()
        .value()
        .expect("usable rival distance");
    let player_laps = *player.completed_laps().value().expect("usable player laps");
    let current_laps = *current.completed_laps().value().expect("usable rival laps");
    if !length.is_finite()
        || length <= 0.0
        || !player_distance.is_finite()
        || !current_distance.is_finite()
        || player_distance < 0.0
        || current_distance < 0.0
        || player_distance >= length
        || current_distance >= length
        || player_laps < 0
        || current_laps < 0
    {
        return invalid();
    }
    let difference = f64::from(current_laps) - f64::from(player_laps)
        + (current_distance - player_distance) / length;
    if !difference.is_finite()
        || difference < f64::from(i32::MIN)
        || difference > f64::from(i32::MAX)
    {
        return invalid();
    }
    derived(difference.trunc() as i32, laps_quality)
}

fn observed_bool(field: &Field<bool>) -> Option<bool> {
    match field {
        Field::Present {
            value,
            provenance: Provenance::Observed,
            freshness: Freshness::Fresh | Freshness::Stale,
        } => Some(*value),
        _ => None,
    }
}

fn single_quality<T>(field: &Field<T>) -> GapFreshness {
    match field {
        Field::Missing => GapFreshness::Missing,
        Field::Present {
            provenance: Provenance::Derived | Provenance::Estimated,
            ..
        } => GapFreshness::Invalid,
        Field::Present { freshness, .. } => match freshness {
            Freshness::Fresh => GapFreshness::Fresh,
            Freshness::Stale => GapFreshness::Stale,
            Freshness::Invalid => GapFreshness::Invalid,
        },
    }
}

fn exact_quality<A, B>(left: &Field<A>, right: &Field<B>) -> GapFreshness {
    let left_quality = single_quality(left);
    let right_quality = single_quality(right);
    if left_quality == GapFreshness::Invalid || right_quality == GapFreshness::Invalid {
        GapFreshness::Invalid
    } else if left_quality == right_quality {
        left_quality
    } else {
        GapFreshness::Missing
    }
}

fn field_quality<T>(field: &Field<T>) -> GapFreshness {
    match field {
        Field::Missing => GapFreshness::Missing,
        Field::Present {
            freshness: Freshness::Fresh,
            ..
        } => GapFreshness::Fresh,
        Field::Present {
            freshness: Freshness::Stale,
            ..
        } => GapFreshness::Stale,
        Field::Present {
            freshness: Freshness::Invalid,
            ..
        } => GapFreshness::Invalid,
    }
}

fn worst(left: GapFreshness, right: GapFreshness) -> GapFreshness {
    fn rank(value: GapFreshness) -> u8 {
        match value {
            GapFreshness::Fresh => 0,
            GapFreshness::Stale => 1,
            GapFreshness::Missing => 2,
            GapFreshness::Invalid => 3,
        }
    }
    if rank(right) > rank(left) {
        right
    } else {
        left
    }
}

fn invalid<T: Default>() -> Field<T> {
    Field::Present {
        value: T::default(),
        provenance: Provenance::Derived,
        freshness: Freshness::Invalid,
    }
}
fn derived<T>(value: T, quality: GapFreshness) -> Field<T> {
    Field::Present {
        value,
        provenance: Provenance::Derived,
        freshness: match quality {
            GapFreshness::Fresh => Freshness::Fresh,
            GapFreshness::Stale => Freshness::Stale,
            _ => unreachable!("only usable quality is derived"),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Signals {
        player: Field<bool>,
        laps: Field<i32>,
        distance: Field<f64>,
        progress: Field<f64>,
        period: Field<f64>,
    }
    impl GapSignals for Signals {
        fn player(&self) -> &Field<bool> {
            &self.player
        }
        fn completed_laps(&self) -> &Field<i32> {
            &self.laps
        }
        fn lap_distance(&self) -> &Field<f64> {
            &self.distance
        }
        fn lap_progress_time(&self) -> &Field<f64> {
            &self.progress
        }
        fn estimated_lap_time(&self) -> &Field<f64> {
            &self.period
        }
    }
    fn vehicle(
        id: &str,
        player: bool,
        laps: i32,
        distance: f64,
        progress: f64,
    ) -> Vehicle<Signals> {
        Vehicle {
            id: id.to_owned(),
            driver_id: String::new(),
            team_id: String::new(),
            stint_id: None,
            value: Signals {
                player: Field::observed(player),
                laps: Field::observed(laps),
                distance: Field::observed(distance),
                progress: Field::observed(progress),
                period: Field::observed(100.0),
            },
        }
    }

    #[test]
    fn relative_laps_follow_player_progress_across_timing_line() {
        for (player_laps, rival_laps, player_distance, rival_distance, expected) in [
            (9, 9, 300.0, 100.0, 0),
            (10, 9, 10.0, 990.0, 0),
            (10, 8, 10.0, 990.0, -1),
            (8, 10, 990.0, 10.0, 1),
            (10, 9, 300.0, 300.0, -1),
        ] {
            let player = vehicle("player", true, player_laps, player_distance, 50.0);
            let rival = vehicle("rival", false, rival_laps, rival_distance, 55.0);
            let gaps = derive(
                Some("player"),
                &Field::observed(true),
                &[player, rival],
                &Field::observed(1000.0),
            );
            assert_eq!(gaps.vehicles[1].laps.value(), Some(&expected));
            assert_eq!(gaps.vehicles[1].time_seconds.value(), Some(&5.0));
        }
    }

    #[test]
    fn time_and_lap_quality_are_independent_and_player_presence_gates_all() {
        let mut player = vehicle("player", true, 5, 100.0, 5.5);
        let rival = vehicle("rival", false, 5, 200.0, 6.75);
        player.value.laps = Field::Missing;
        let gaps = derive(
            Some("player"),
            &Field::observed(true),
            &[player, rival],
            &Field::observed(1000.0),
        );
        assert_eq!(gaps.vehicles[1].time_seconds.value(), Some(&1.25));
        assert_eq!(gaps.vehicles[1].laps, Field::Missing);
        assert_eq!(gaps.freshness, GapFreshness::Missing);
        assert!(
            derive::<Signals>(None, &Field::observed(true), &[], &Field::observed(1000.0))
                .vehicles
                .is_empty()
        );
    }

    #[test]
    fn stale_and_invalid_inputs_keep_quality_without_inventing_gaps() {
        let player = vehicle("player", true, 5, 100.0, 5.5);
        let mut rival = vehicle("rival", false, 5, 200.0, 6.75);
        rival.value.progress = Field::Present {
            value: 6.75,
            provenance: Provenance::Observed,
            freshness: Freshness::Stale,
        };
        let gaps = derive(
            Some("player"),
            &Field::observed(true),
            &[player, rival],
            &Field::observed(1000.0),
        );
        assert_eq!(gaps.vehicles[1].time_seconds, Field::Missing);
        let player = vehicle("player", true, 5, 100.0, 5.5);
        let rival = vehicle("rival", false, 5, 2000.0, 6.75);
        let gaps = derive(
            Some("player"),
            &Field::observed(true),
            &[player, rival],
            &Field::observed(1000.0),
        );
        assert_eq!(
            gaps.vehicles[1].laps.quality(),
            (Some(Provenance::Derived), Some(Freshness::Invalid))
        );
    }
}
