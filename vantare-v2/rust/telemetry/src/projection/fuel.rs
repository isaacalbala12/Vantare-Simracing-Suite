//! Overlay V2 fuel presentation from the canonical measured tracker.

use super::{QValue, Quality, project};
use crate::core;
use crate::derive::fuel::{FuelFreshness, FuelUsage};
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness};

const US_GALLONS_PER_LITRE: f64 = 0.264_172_052_358_148_42;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FuelUnit {
    Litres,
    GallonsUs,
}

fn convert(value: f64, unit: FuelUnit) -> f64 {
    match unit {
        FuelUnit::Litres => value,
        FuelUnit::GallonsUs => value * US_GALLONS_PER_LITRE,
    }
}

#[derive(Debug, PartialEq)]
pub struct FuelView {
    pub remaining: QValue<f64>,
    pub capacity: QValue<f64>,
    pub per_lap: QValue<f64>,
    pub estimated_laps: QValue<f64>,
    pub basis: Option<&'static str>,
    pub session_laps: QValue<f64>,
    pub required_fuel: QValue<f64>,
    pub history_quality: Quality,
    pub history_lap: Vec<i32>,
    pub history_consumed: Vec<f64>,
}

impl Default for FuelView {
    fn default() -> Self {
        Self {
            remaining: QValue::missing(),
            capacity: QValue::missing(),
            per_lap: QValue::missing(),
            estimated_laps: QValue::missing(),
            basis: None,
            session_laps: QValue::missing(),
            required_fuel: QValue::missing(),
            history_quality: Quality::Missing,
            history_lap: Vec::new(),
            history_consumed: Vec::new(),
        }
    }
}

fn quality<T>(field: &QValue<T>) -> Quality {
    field.quality
}
fn rank(value: Quality) -> u8 {
    match value {
        Quality::Fresh => 0,
        Quality::Stale => 1,
        Quality::Missing => 2,
        Quality::Invalid => 3,
    }
}
fn worst(left: Quality, right: Quality) -> Quality {
    if rank(right) > rank(left) {
        right
    } else {
        left
    }
}
fn measured<T>(value: &QValue<T>) -> bool {
    value.value.is_some() && matches!(quality(value), Quality::Fresh | Quality::Stale)
}
fn arithmetic(value: f64, quality: Quality) -> QValue<f64> {
    QValue {
        value: Some(value),
        quality,
    }
}
fn history_quality(value: FuelFreshness) -> Quality {
    match value {
        FuelFreshness::Fresh => Quality::Fresh,
        FuelFreshness::Stale => Quality::Stale,
        FuelFreshness::Missing => Quality::Missing,
        FuelFreshness::Invalid => Quality::Invalid,
    }
}

pub fn build(
    batch: &core::Batch<SessionType, LmuVehicleState>,
    remaining_seconds: &Field<f64>,
    usage: &FuelUsage,
    unit: FuelUnit,
) -> FuelView {
    let Some(player) = batch.state.vehicles.iter().find(|current| {
        matches!(
            current.value.player,
            Field::Present {
                value: true,
                freshness: Freshness::Fresh | Freshness::Stale,
                ..
            }
        )
    }) else {
        return FuelView::default();
    };
    let mut view = FuelView {
        remaining: project(&player.value.fuel, |fuel| convert(fuel.amount_liters, unit)),
        capacity: project(&player.value.fuel, |fuel| {
            convert(fuel.capacity_liters, unit)
        }),
        per_lap: project(&usage.per_lap_liters, |value| convert(*value, unit)),
        history_quality: history_quality(usage.history_freshness),
        ..FuelView::default()
    };
    for sample in &usage.history {
        view.history_lap.push(sample.lap);
        view.history_consumed
            .push(convert(sample.consumed_liters, unit));
    }
    let session_remaining = project(remaining_seconds, |value| *value);
    let last_lap = project(&player.value.last_lap_time, |value| *value);
    let session_quality = worst(session_remaining.quality, last_lap.quality);
    if measured(&session_remaining) && measured(&last_lap) {
        let seconds = session_remaining.value.expect("measured remaining");
        let lap = last_lap.value.expect("measured lap");
        if lap > 0.0 && lap.is_finite() && seconds.is_finite() {
            let laps = (seconds / lap).ceil();
            view.session_laps = arithmetic(
                if laps.is_finite() { laps.max(0.0) } else { 0.0 },
                session_quality,
            );
        }
    }
    let required_quality = worst(view.per_lap.quality, view.session_laps.quality);
    if measured(&view.per_lap) && measured(&view.session_laps) {
        let per_lap = view.per_lap.value.expect("measured per lap");
        let laps = view.session_laps.value.expect("measured session laps");
        let required = per_lap * laps;
        if per_lap > 0.0
            && per_lap.is_finite()
            && laps >= 0.0
            && laps.is_finite()
            && required.is_finite()
        {
            view.required_fuel = arithmetic(required, required_quality);
        }
    }
    let fuel_quality = worst(view.remaining.quality, view.per_lap.quality);
    if measured(&view.remaining) && measured(&view.per_lap) {
        let remaining = view.remaining.value.expect("measured fuel");
        let per_lap = view.per_lap.value.expect("measured per lap");
        if remaining >= 0.0 && remaining.is_finite() && per_lap > 0.0 && per_lap.is_finite() {
            let laps = (remaining / per_lap).floor();
            view.estimated_laps = arithmetic(
                if laps.is_finite() { laps.max(0.0) } else { 0.0 },
                fuel_quality,
            );
            view.basis = Some("fuel");
            return view;
        }
    }
    if view.session_laps.quality != Quality::Missing {
        view.estimated_laps = view.session_laps.clone();
        view.basis = Some("session");
    }
    view
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::derive::fuel::FuelLapSample;
    use crate::engine::Engine;
    use crate::lmu::mapper::ClockChange;
    use crate::quality::Provenance;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn measured_consumption_takes_fuel_basis_and_converts_history_once() {
        let engine = Engine::new(30, 19).unwrap();
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
        let mut usage = candidate.fuel_usage().clone();
        usage.per_lap_liters = Field::Present {
            value: 2.0,
            provenance: Provenance::Derived,
            freshness: Freshness::Fresh,
        };
        usage.history = vec![FuelLapSample {
            lap: 4,
            consumed_liters: 2.0,
        }];
        let litres = build(
            candidate.batch(),
            candidate.session_remaining(),
            &usage,
            FuelUnit::Litres,
        );
        assert_eq!(litres.basis, Some("fuel"));
        assert_eq!(litres.estimated_laps.value, Some(49.0));
        assert_eq!(litres.history_lap, [4]);
        assert_eq!(litres.history_consumed, [2.0]);
        let gallons = build(
            candidate.batch(),
            candidate.session_remaining(),
            &usage,
            FuelUnit::GallonsUs,
        );
        assert_eq!(gallons.estimated_laps.value, Some(49.0));
        assert_eq!(gallons.history_consumed, [2.0 * US_GALLONS_PER_LITRE]);
        assert_eq!(gallons.per_lap.value, Some(2.0 * US_GALLONS_PER_LITRE));
    }
}
