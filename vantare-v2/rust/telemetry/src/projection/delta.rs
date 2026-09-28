//! Overlay V2 delta reference resolution from one canonical Rust series.

use super::{QValue, Quality, project};
use crate::derive::delta::{DeltaFreshness, MAX_SELF_DELTA_HISTORY, SelfDelta};
use crate::quality::{Field, Freshness, Provenance};

const PRIORITY: [&str; 3] = ["personal-best", "session-best", "previous-lap"];

#[derive(Debug, PartialEq)]
pub struct ReferenceView {
    pub requested: &'static str,
    pub reference: Option<&'static str>,
    pub seconds: QValue<f64>,
    pub authority: Option<&'static str>,
}

#[derive(Debug, PartialEq)]
pub struct DeltaView {
    pub references: Vec<ReferenceView>,
    pub seconds: QValue<f64>,
    pub reference: Option<&'static str>,
    pub requested: &'static str,
    pub available: Vec<&'static str>,
    pub authority: Option<&'static str>,
    pub history_quality: Quality,
    pub history_captured_at_ms: Vec<i64>,
    pub history_seconds: Vec<f64>,
}

fn field<'a>(delta: &'a SelfDelta, name: &str) -> &'a Field<f64> {
    match name {
        "session-best" => &delta.session_best,
        "previous-lap" => &delta.previous_lap,
        _ => &delta.personal_best,
    }
}

fn usable(field: &Field<f64>) -> bool {
    matches!(field,
        Field::Present { value, freshness: Freshness::Fresh | Freshness::Stale, .. }
        if value.is_finite())
}

fn resolve(
    delta: &SelfDelta,
    requested: &'static str,
    available: &[&'static str],
) -> ReferenceView {
    let effective = if usable(field(delta, requested)) {
        Some(requested)
    } else {
        available.first().copied()
    };
    let seconds = effective.map_or_else(QValue::missing, |name| {
        project(field(delta, name), |value| *value)
    });
    let authority = effective.map(|name| match field(delta, name) {
        Field::Present {
            provenance: Provenance::Observed,
            ..
        } => "native",
        _ => "derived",
    });
    ReferenceView {
        requested,
        reference: effective,
        seconds,
        authority,
    }
}

pub fn build(delta: &SelfDelta, requested: &str) -> DeltaView {
    let requested = PRIORITY
        .into_iter()
        .find(|name| *name == requested)
        .unwrap_or(PRIORITY[0]);
    let available: Vec<&'static str> = PRIORITY
        .into_iter()
        .filter(|name| usable(field(delta, name)))
        .collect();
    let references: Vec<_> = PRIORITY
        .into_iter()
        .map(|name| resolve(delta, name, &available))
        .collect();
    let selected = references
        .iter()
        .find(|view| view.requested == requested)
        .expect("closed request");
    let history_quality = match delta.freshness {
        DeltaFreshness::Fresh => Quality::Fresh,
        DeltaFreshness::Stale => Quality::Stale,
        DeltaFreshness::Missing => Quality::Missing,
        DeltaFreshness::Invalid => Quality::Invalid,
    };
    let mut history_captured_at_ms = Vec::new();
    let mut history_seconds = Vec::new();
    if matches!(history_quality, Quality::Fresh | Quality::Stale) {
        let tail = delta.history.len().saturating_sub(MAX_SELF_DELTA_HISTORY);
        for sample in &delta.history[tail..] {
            history_captured_at_ms.push(sample.captured_utc_ns.div_euclid(1_000_000));
            history_seconds.push(sample.seconds);
        }
    }
    DeltaView {
        seconds: selected.seconds.clone(),
        reference: selected.reference,
        requested,
        authority: selected.authority,
        references,
        available,
        history_quality,
        history_captured_at_ms,
        history_seconds,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::Cursor;
    use crate::derive::delta::{DeltaReference, DeltaSample};

    #[test]
    fn three_requests_resolve_independently_with_priority_fallback() {
        let fresh = |value, provenance| Field::Present {
            value,
            provenance,
            freshness: Freshness::Fresh,
        };
        let mut delta = SelfDelta {
            freshness: DeltaFreshness::Fresh,
            seconds: Field::Missing,
            reference: Field::<DeltaReference>::Missing,
            history: Vec::new(),
            personal_best: fresh(-0.2, Provenance::Observed),
            session_best: Field::Missing,
            previous_lap: fresh(0.3, Provenance::Derived),
        };
        let view = build(&delta, "session-best");
        assert_eq!(view.available, ["personal-best", "previous-lap"]);
        assert_eq!(view.reference, Some("personal-best"));
        assert_eq!(view.seconds.value, Some(-0.2));
        assert_eq!(view.authority, Some("native"));
        assert_eq!(view.references[2].reference, Some("previous-lap"));
        assert_eq!(view.references[2].authority, Some("derived"));
        delta.personal_best = Field::Missing;
        delta.previous_lap = Field::Missing;
        delta.history.push(DeltaSample {
            cursor: Cursor {
                epoch: 1,
                sequence: 1,
            },
            captured_utc_ns: -1,
            source_time_ns: 0,
            lap_distance_m: 0.0,
            seconds: -0.2,
        });
        let empty = build(&delta, "personal-best");
        assert!(empty.available.is_empty());
        assert_eq!(empty.reference, None);
        assert_eq!(empty.seconds.quality, Quality::Missing);
        assert_eq!(empty.history_captured_at_ms, [-1]);
        assert_eq!(empty.history_seconds, [-0.2]);
    }
}
