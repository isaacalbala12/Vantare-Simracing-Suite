//! Bounded, owned player control history matching Go's controls.history v1.

use crate::core::{Batch, Cursor, VehicleState};
use crate::quality::{Field, Freshness};

pub const MAX_CONTROLS_HISTORY: usize = 120;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HistoryFreshness {
    Fresh,
    Stale,
    Missing,
    Invalid,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ControlSample {
    pub cursor: Cursor,
    pub captured_utc_ns: i64,
    pub vehicle_id: String,
    pub throttle: f64,
    pub brake: f64,
    pub clutch: f64,
    pub speed_mps: Field<f64>,
    pub engine_rpm: Field<f64>,
    pub gear: Field<i32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ControlHistory {
    pub freshness: HistoryFreshness,
    pub samples: Vec<ControlSample>,
}

pub trait ControlSignals {
    fn throttle(&self) -> &Field<f64>;
    fn brake(&self) -> &Field<f64>;
    fn clutch(&self) -> &Field<f64>;
    fn speed_mps(&self) -> &Field<f64>;
    fn engine_rpm(&self) -> &Field<f64>;
    fn gear(&self) -> &Field<i32>;
}

impl<S, F, D> ControlSignals for VehicleState<S, F, D> {
    fn throttle(&self) -> &Field<f64> {
        &self.throttle
    }
    fn brake(&self) -> &Field<f64> {
        &self.brake
    }
    fn clutch(&self) -> &Field<f64> {
        &self.clutch
    }
    fn speed_mps(&self) -> &Field<f64> {
        &self.speed_mps
    }
    fn engine_rpm(&self) -> &Field<f64> {
        &self.engine_rpm
    }
    fn gear(&self) -> &Field<i32> {
        &self.gear
    }
}

pub fn prepare<S, V: ControlSignals>(
    previous: Option<&ControlHistory>,
    previous_cursor: Option<Cursor>,
    batch: &Batch<S, V>,
    captured_utc_ns: i64,
    max_history: usize,
) -> ControlHistory {
    let limit = if (1..=MAX_CONTROLS_HISTORY).contains(&max_history) {
        max_history
    } else {
        MAX_CONTROLS_HISTORY
    };
    let reset = previous_cursor.is_some_and(|cursor| cursor.epoch != batch.cursor.epoch);
    let old = if reset {
        &[][..]
    } else {
        previous.map_or(&[][..], |history| history.samples.as_slice())
    };
    let Some(player_id) = &batch.player_id else {
        return ControlHistory {
            freshness: HistoryFreshness::Missing,
            samples: old.to_vec(),
        };
    };
    let Some(player) = batch
        .state
        .vehicles
        .iter()
        .find(|vehicle| &vehicle.id == player_id)
    else {
        return ControlHistory {
            freshness: HistoryFreshness::Missing,
            samples: old.to_vec(),
        };
    };
    let quality = controls_quality(
        player.value.throttle(),
        player.value.brake(),
        player.value.clutch(),
    );
    if quality != HistoryFreshness::Fresh {
        return ControlHistory {
            freshness: quality,
            samples: old.to_vec(),
        };
    }
    let (Some(throttle), Some(brake), Some(clutch)) = (
        player.value.throttle().value(),
        player.value.brake().value(),
        player.value.clutch().value(),
    ) else {
        unreachable!("fresh controls have values")
    };
    let mut samples = Vec::with_capacity((old.len() + 1).min(limit));
    if old.len() >= limit {
        samples.extend_from_slice(&old[old.len() - limit + 1..]);
    } else {
        samples.extend_from_slice(old);
    }
    samples.push(ControlSample {
        cursor: batch.cursor,
        captured_utc_ns,
        vehicle_id: player_id.clone(),
        throttle: *throttle,
        brake: *brake,
        clutch: *clutch,
        speed_mps: player.value.speed_mps().clone(),
        engine_rpm: player.value.engine_rpm().clone(),
        gear: player.value.gear().clone(),
    });
    ControlHistory {
        freshness: HistoryFreshness::Fresh,
        samples,
    }
}

fn controls_quality(
    throttle: &Field<f64>,
    brake: &Field<f64>,
    clutch: &Field<f64>,
) -> HistoryFreshness {
    let fields = [throttle, brake, clutch];
    if fields.iter().any(|field| {
        matches!(
            field,
            Field::Present {
                freshness: Freshness::Invalid,
                ..
            }
        )
    }) {
        return HistoryFreshness::Invalid;
    }
    if fields.iter().any(|field| matches!(field, Field::Missing)) {
        return HistoryFreshness::Missing;
    }
    if fields.iter().any(|field| {
        matches!(
            field,
            Field::Present {
                freshness: Freshness::Stale,
                ..
            }
        )
    }) {
        return HistoryFreshness::Stale;
    }
    HistoryFreshness::Fresh
}
