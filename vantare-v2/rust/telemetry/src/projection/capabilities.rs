//! Observed quality of LMU Overlay V2 capabilities.

use serde_json::{Value, json};

use super::{Quality, SpeedUnit, player, session};
use crate::core;
use crate::derive::{
    delta::{DeltaFreshness, SelfDelta},
    gaps::{GapFreshness, GapSet},
};
use crate::lmu::{SessionType, pipeline::LmuVehicleState};
use crate::quality::{Field, Freshness};

fn field_quality<T>(field: &Field<T>) -> Quality {
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

fn best(values: impl IntoIterator<Item = Quality>) -> Quality {
    let mut quality = Quality::Missing;
    for value in values {
        match value {
            Quality::Fresh => return Quality::Fresh,
            Quality::Stale => quality = Quality::Stale,
            Quality::Invalid if quality == Quality::Missing => quality = Quality::Invalid,
            _ => {}
        }
    }
    quality
}

fn word(value: Quality) -> &'static str {
    match value {
        Quality::Fresh => "fresh",
        Quality::Stale => "stale",
        Quality::Missing => "missing",
        Quality::Invalid => "invalid",
    }
}

/// Availability for a declared LMU shared-memory source. Source modes and
/// host performance policy remain inputs of the later complete IPC view.
pub fn availability(
    batch: &core::Batch<SessionType, LmuVehicleState>,
    remaining: &Field<f64>,
    gaps: &GapSet,
    delta: &SelfDelta,
) -> Value {
    let session = session(batch, remaining);
    let player = player(batch, SpeedUnit::Mps);
    let selected = batch
        .state
        .vehicles
        .iter()
        .find(|row| row.value.player.value() == Some(&true));
    let gap_quality = match gaps.freshness {
        GapFreshness::Fresh => Quality::Fresh,
        GapFreshness::Stale => Quality::Stale,
        GapFreshness::Missing => Quality::Missing,
        GapFreshness::Invalid => Quality::Invalid,
    };
    let delta_quality = match delta.freshness {
        DeltaFreshness::Fresh => Quality::Fresh,
        DeltaFreshness::Stale => Quality::Stale,
        DeltaFreshness::Missing => Quality::Missing,
        DeltaFreshness::Invalid => Quality::Invalid,
    };
    let spatial = best(
        batch
            .state
            .vehicles
            .iter()
            .map(|row| field_quality(&row.value.world_position)),
    );
    json!({
        "session": word(best([session.track.quality, session.phase.quality, session.remaining_seconds.quality])),
        "controls": word(best([player.speed.quality, player.rpm.quality, player.gear.quality, player.throttle.quality, player.brake.quality, player.clutch.quality])),
        "standings": word(best(batch.state.vehicles.iter().map(|row| field_quality(&row.value.position)))),
        "gaps": word(gap_quality),
        "fuel": word(selected.map_or(Quality::Missing, |row| field_quality(&row.value.fuel))),
        "delta": word(delta_quality),
        "spatial.longitudinal": word(spatial),
        "spatial.lateral": word(spatial),
        "spotter": word(spatial),
        "damage": word(selected.map_or(Quality::Missing, |row| field_quality(&row.value.damage))),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn availability_prefers_fresh_then_stale_then_invalid_over_missing() {
        assert_eq!(best([Quality::Missing, Quality::Invalid]), Quality::Invalid);
        assert_eq!(best([Quality::Invalid, Quality::Stale]), Quality::Stale);
        assert_eq!(best([Quality::Stale, Quality::Fresh]), Quality::Fresh);
        assert_eq!(best([Quality::Missing]), Quality::Missing);
    }
}
