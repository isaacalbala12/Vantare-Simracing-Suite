//! Observed quality of LMU Overlay V2 capabilities.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};

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

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Modes {
    pub spatial: Vec<String>,
    pub delta: Vec<String>,
    pub standings: String,
    pub gaps: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Performance {
    pub level: u8,
    pub mode: String,
    pub effects: String,
    pub raf_cap: Option<i32>,
    pub widget_hz: Map<String, Value>,
    #[serde(default)]
    pub reason: String,
    pub source_hz: f64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub descriptor_capabilities: Vec<String>,
    pub modes: Modes,
    pub performance: Performance,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CapabilityError {
    InvalidSourceHz,
}

/// Product capability declaration and effective host policy. The host sends
/// source data; Rust resolves observed availability and normalizes the wire.
pub fn build(
    batch: &core::Batch<SessionType, LmuVehicleState>,
    remaining: &Field<f64>,
    gaps: &GapSet,
    delta: &SelfDelta,
    source: &Source,
) -> Result<Value, CapabilityError> {
    if !source.performance.source_hz.is_finite() {
        return Err(CapabilityError::InvalidSourceHz);
    }
    let mut supported = Vec::new();
    for descriptor in &source.descriptor_capabilities {
        match descriptor.as_str() {
            "shared-memory" => supported.extend([
                "session",
                "controls",
                "standings",
                "gaps",
                "fuel",
                "delta",
                "spatial.longitudinal",
                "spatial.lateral",
                "spotter",
                "damage",
            ]),
            "rest" => supported.push("session"),
            _ => {}
        }
    }
    supported.sort_unstable();
    supported.dedup();
    let observed = availability(batch, remaining, gaps, delta);
    let mut available = Map::new();
    for id in &supported {
        available.insert((*id).into(), observed[*id].clone());
    }
    let performance = &source.performance;
    let level = if (1..=5).contains(&performance.level) {
        performance.level
    } else {
        3
    };
    let mode = match performance.mode.as_str() {
        "manual" | "custom" | "auto" => performance.mode.as_str(),
        _ => "manual",
    };
    let effects = match performance.effects.as_str() {
        "full" | "noBlur" | "flat" => performance.effects.as_str(),
        _ => "noBlur",
    };
    let reason = match performance.reason.as_str() {
        "" | "cpu" | "frametime" | "user" | "vr" | "unavailable" => performance.reason.as_str(),
        _ => "unavailable",
    };
    let source_hz = if performance.source_hz.is_finite()
        && performance.source_hz.fract() == 0.0
        && performance.source_hz >= i64::MIN as f64
        && performance.source_hz < i64::MAX as f64
    {
        json!(performance.source_hz as i64)
    } else {
        json!(performance.source_hz)
    };
    let mut policy = json!({
        "level": level, "mode": mode, "effects": effects,
        "rafCap": performance.raf_cap, "widgetHz": performance.widget_hz,
        "sourceHz": source_hz,
    });
    if !reason.is_empty() {
        policy["reason"] = json!(reason);
    }
    Ok(json!({
        "supported": supported, "available": available,
        "modes": {
            "spatial": source.modes.spatial,
            "delta": source.modes.delta,
            "standings": if source.modes.standings.is_empty() { "none" } else { &source.modes.standings },
            "gaps": if source.modes.gaps.is_empty() { "none" } else { &source.modes.gaps },
        },
        "performance": policy,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::Engine;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn availability_prefers_fresh_then_stale_then_invalid_over_missing() {
        assert_eq!(best([Quality::Missing, Quality::Invalid]), Quality::Invalid);
        assert_eq!(best([Quality::Invalid, Quality::Stale]), Quality::Stale);
        assert_eq!(best([Quality::Stale, Quality::Fresh]), Quality::Fresh);
        assert_eq!(best([Quality::Missing]), Quality::Missing);
    }

    #[test]
    fn descriptor_restricts_supported_capabilities_and_invalid_rate_is_rejected() {
        let engine = Engine::new(30, 26).unwrap();
        let candidate = engine
            .prepare(REAL_44, "1.3.0.0", 100, 100, 100_000_000_000)
            .unwrap();
        let mut source = Source {
            descriptor_capabilities: vec!["rest".into(), "rest".into(), "unknown".into()],
            ..Source::default()
        };
        let view = build(
            candidate.batch(),
            candidate.session_remaining(),
            candidate.gaps(),
            candidate.delta(),
            &source,
        )
        .unwrap();
        assert_eq!(view["supported"], json!(["session"]));
        assert_eq!(view["available"], json!({"session":"fresh"}));
        assert_eq!(view["modes"]["standings"], "none");
        source.performance.source_hz = f64::NAN;
        assert_eq!(
            build(
                candidate.batch(),
                candidate.session_remaining(),
                candidate.gaps(),
                candidate.delta(),
                &source
            ),
            Err(CapabilityError::InvalidSourceHz)
        );
    }
}
