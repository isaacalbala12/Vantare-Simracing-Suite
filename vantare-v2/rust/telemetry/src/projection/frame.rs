//! Complete Overlay V2 wire envelope from product sections and source metadata.

use serde_json::{Map, Value, json};

pub const ALL_SECTIONS_MASK: u16 = super::cadence::ALL_SECTIONS_MASK;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FrameError {
    MissingSection,
    InvalidSourceState,
    InvalidSectionMask,
}

#[derive(Clone, Copy, Debug)]
pub struct Metadata<'a> {
    pub revision: u64,
    pub state: &'a str,
    pub retry: i32,
    pub age_ms: i64,
    pub degraded_reason: &'a str,
    pub epoch: u64,
    pub sequence: u64,
    pub section_mask: u16,
    pub session_id: &'a str,
    pub generated_at: &'a str,
    pub speed_unit: &'a str,
    pub temperature_unit: &'a str,
    pub pressure_unit: &'a str,
    pub fuel_unit: &'a str,
}

/// Wraps the eleven Rust-owned sections into the product's full snapshot.
/// RelativeSettled is the bootstrap view; the stateful settler replaces it
/// when the cached projector is integrated.
pub fn wrap_full(sections: &Value, metadata: Metadata<'_>) -> Result<Value, FrameError> {
    if !matches!(
        metadata.state,
        "stopped"
            | "detecting"
            | "connecting"
            | "live"
            | "degraded"
            | "stale"
            | "error"
            | "stopping"
    ) {
        return Err(FrameError::InvalidSourceState);
    }
    if metadata.section_mask & !ALL_SECTIONS_MASK != 0 {
        return Err(FrameError::InvalidSectionMask);
    }
    let mut frame = Map::new();
    for name in [
        "session",
        "player",
        "controls",
        "standings",
        "relative",
        "relativeSameClass",
        "delta",
        "fuel",
        "spotter",
        "radar",
        "damage",
        "weather",
        "capabilities",
    ] {
        let Some(value) = sections.get(name) else {
            return Err(FrameError::MissingSection);
        };
        frame.insert(name.into(), value.clone());
    }
    frame.insert("relativeSettled".into(), sections["relative"].clone());
    frame.insert("contract".into(), json!(2));
    frame.insert("algorithm".into(), json!(2));
    frame.insert("epoch".into(), json!(metadata.epoch));
    frame.insert("sequence".into(), json!(metadata.sequence));
    frame.insert("sectionMask".into(), json!(metadata.section_mask));
    frame.insert("sessionId".into(), json!(metadata.session_id));
    frame.insert("generatedAt".into(), json!(metadata.generated_at));
    frame.insert(
        "units".into(),
        json!({
            "speed": metadata.speed_unit,
            "temperature": metadata.temperature_unit,
            "pressure": metadata.pressure_unit,
            "fuel": metadata.fuel_unit,
        }),
    );
    let mut source = Map::new();
    source.insert("state".into(), json!(metadata.state));
    if metadata.retry > 0 {
        source.insert("retry".into(), json!(metadata.retry));
    }
    if metadata.age_ms > 0 {
        source.insert("ageMs".into(), json!(metadata.age_ms));
    }
    if !metadata.degraded_reason.is_empty() {
        source.insert("reason".into(), json!(metadata.degraded_reason));
    }
    Ok(json!({"revision": metadata.revision, "source": source, "frame": frame}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_section_unknown_state_and_foreign_mask_bit() {
        let mut meta = Metadata {
            revision: 1,
            state: "live",
            retry: 0,
            age_ms: 0,
            degraded_reason: "",
            epoch: 1,
            sequence: 1,
            section_mask: ALL_SECTIONS_MASK,
            session_id: "session",
            generated_at: "1970-01-01T00:01:40Z",
            speed_unit: "mps",
            temperature_unit: "celsius",
            pressure_unit: "kpa",
            fuel_unit: "liters",
        };
        assert_eq!(wrap_full(&json!({}), meta), Err(FrameError::MissingSection));
        meta.state = "unknown";
        assert_eq!(
            wrap_full(&json!({}), meta),
            Err(FrameError::InvalidSourceState)
        );
        meta.state = "live";
        meta.section_mask = ALL_SECTIONS_MASK | (1 << 15);
        assert_eq!(
            wrap_full(&json!({}), meta),
            Err(FrameError::InvalidSectionMask)
        );
    }
}
