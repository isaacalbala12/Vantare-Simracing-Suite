//! The accepted plan (E5a): the plan a person chose, kept in the document with a
//! copy of the entries it was calculated from, so a later change of the data is
//! seen (`stale`) without ever deleting the plan.
//!
//! The document stores it per variant under `acceptedPlan` (schema 2.2.0). The
//! wire shows it as `plan.accepted`, apart from `plan.result` (the proposal).
use super::{
    StrategyField, StrategyReason,
    calculation::{StrategyCalculationView, StrategyCertificate, StrategyComputeForm, StrategyPit},
    valid_text,
};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_strategy::{
    application::{self, ManualEvent, ManualField},
    document::Document,
    solver::{
        DecisionVector, Input, PitDecision, StintDecision, replay_decision_v2_with_resources,
    },
};

/// A changed text longer than this is reported without its value: the frame stays
/// bounded and a text is never cut.
pub const STRATEGY_CHANGE_TEXT_LIMIT: usize = 64;

/// What the screen shows of the plan accepted for the active variant.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyAcceptedState {
    /// The entries are the ones the plan was calculated from.
    Accepted,
    /// The entries changed and, with the new data, the plan still reaches the finish.
    Stale,
    /// The entries changed and, with the new data, the plan does not reach the
    /// finish (or the host cannot tell: `unreachable.cause` says why).
    StaleUnreachable,
}

/// The state of the accepted plans of an event, for the collection: the worst of
/// its variants.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyAcceptedMark {
    #[default]
    None,
    Accepted,
    Stale,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyUnreachableCause {
    /// Fuel, energy or tyres run out before the finish (the replay says no more).
    ResourceExhausted,
    /// The plan finishes without the required reserve.
    ReserveNotMet,
    /// The calendar no longer covers the race (the number of laps changed).
    ScheduleMismatch,
    /// Any other refusal, or the new data cannot be checked.
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyUnreachable {
    pub cause: StrategyUnreachableCause,
    /// With `resourceExhausted`, the first lap the plan cannot complete, when the
    /// replay of the crate names it; `null` otherwise.
    pub fail_lap: Option<u32>,
}

/// One entry that differs from the copy kept with the accepted plan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyChange {
    pub field: StrategyField,
    /// The text of the copy; `null` when it is over `strategyChangeTextLimit` bytes.
    pub before: Option<String>,
    /// The text now; `null` when it is over `strategyChangeTextLimit` bytes.
    pub after: Option<String>,
}

/// The proposal on screen (`plan.result`) against the accepted plan.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyCompare {
    /// Same stints and the same stops (lap, fuel, energy, tyres, service).
    pub same: bool,
    /// Seconds of the proposal MINUS seconds of the accepted plan: positive when
    /// the proposal is slower, negative when it is faster, zero when equal.
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub delta_seconds: Number,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyAcceptedView {
    pub state: StrategyAcceptedState,
    /// RFC 3339, UTC.
    pub accepted_at: String,
    /// `true` when the file on disk holds this very plan (not only the session).
    pub saved: bool,
    /// The plan as it was accepted: its metrics and timeline are never `null`, its
    /// certificate is `proven` or `not_proven`.
    pub result: StrategyCalculationView,
    /// The entries that changed since; empty while `state` is `accepted`.
    pub changes: Vec<StrategyChange>,
    /// Present exactly when `state` is `staleUnreachable`.
    pub unreachable: Option<StrategyUnreachable>,
    /// Present when `plan.result` holds a plan to compare with; `null` otherwise.
    pub compare: Option<StrategyCompare>,
}

/// What the document stores under `acceptedPlan`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StrategyAcceptedPlan {
    pub accepted_at: String,
    /// The 13 fields and the 15 inputs the plan was calculated from.
    pub entries: StrategyComputeForm,
    pub result: StrategyCalculationView,
}

/// The checks every stored plan passes: a document with anything else is not ours.
pub(super) fn plan_is_valid(plan: &StrategyAcceptedPlan) -> bool {
    let result = &plan.result;
    let (Some(metrics), Some(timeline)) = (&result.metrics, &result.timeline) else {
        return false;
    };
    let reason_fits = match result.certificate {
        Some(StrategyCertificate::Proven) => result.reason.is_none(),
        // the renderer takes only these two for a plan that has a timeline
        Some(StrategyCertificate::NotProven) => matches!(
            result.reason,
            Some(StrategyReason::SearchBudgetExhausted | StrategyReason::FineGridNoFallback)
        ),
        _ => false,
    };
    let stints_fit = timeline.stints.len() == timeline.pits.len() + 1
        && timeline.pits.len() <= super::calculation::STRATEGY_PIT_LIMIT
        && timeline
            .stints
            .iter()
            .scan(1_u32, |from, stint| {
                let fits = stint.from_lap == *from
                    && stint.to_lap >= stint.from_lap
                    && stint.to_lap <= MAX_RACE_LAPS;
                *from = stint.to_lap.saturating_add(1);
                Some(fits)
            })
            .all(|fits| fits)
        && timeline
            .pits
            .iter()
            .zip(&timeline.stints)
            .all(|(pit, stint)| pit.lap == stint.to_lap);
    let numbers = [&metrics.total_seconds, &metrics.fuel_reserve_required_laps]
        .into_iter()
        .chain(metrics.fuel_reserve_real_laps.iter())
        .chain(result.steps.fuel_liters.iter())
        .chain(result.steps.ve_percent.iter())
        .chain([
            &timeline.base_pace_seconds,
            &timeline.fuel_start_liters,
            &timeline.fuel_finish_liters,
            &timeline.ve_start_percent,
            &timeline.ve_finish_percent,
        ])
        .chain(timeline.pits.iter().flat_map(|pit| {
            [&pit.fuel_liters, &pit.ve_percent, &pit.pit_seconds]
        }))
        .all(|number| number.as_f64().is_some_and(|value| value >= 0.0));
    reason_fits
        && stints_fit
        && numbers
        && plan.entries.manual().is_ok()
        && valid_text(&plan.accepted_at)
        && is_rfc3339(&plan.accepted_at)
        && valid_text(&timeline.pilot)
}

/// The most laps the crate takes in a race (`Input::validate`).
const MAX_RACE_LAPS: u32 = 100_000;

/// A date as the renderer's validator spells it, and a real one: `YYYY-MM-DDTHH:MM:SS`,
/// an optional fraction, then `Z` or `+HH:MM` / `-HH:MM`. (`chrono` alone also takes
/// a lower case `t` or `z` and a space, which that validator refuses.)
fn is_rfc3339(text: &str) -> bool {
    let bytes = text.as_bytes();
    let digits = |range: std::ops::Range<usize>| {
        bytes.get(range).is_some_and(|part| part.iter().all(u8::is_ascii_digit))
    };
    let mut at = 19;
    let head = digits(0..4)
        && bytes.get(4) == Some(&b'-')
        && digits(5..7)
        && bytes.get(7) == Some(&b'-')
        && digits(8..10)
        && bytes.get(10) == Some(&b'T')
        && digits(11..13)
        && bytes.get(13) == Some(&b':')
        && digits(14..16)
        && bytes.get(16) == Some(&b':')
        && digits(17..19);
    if bytes.get(at) == Some(&b'.') {
        let start = at + 1;
        at = start;
        while bytes.get(at).is_some_and(u8::is_ascii_digit) {
            at += 1;
        }
        if at == start {
            return false;
        }
    }
    let zone = match bytes.get(at..) {
        Some([b'Z']) => true,
        Some([b'+' | b'-', ..]) => {
            digits(at + 1..at + 3) && bytes.get(at + 3) == Some(&b':') && digits(at + 4..at + 6) && bytes.len() == at + 6
        }
        _ => false,
    };
    head && zone && chrono::DateTime::parse_from_rfc3339(text).is_ok()
}

/// The plan stored in a variant: `Ok(None)` when it has none, `Err` when what it
/// holds is not a valid plan or the document is not of the schema that has them.
pub(super) fn read(variant: &Value, schema_allows: bool) -> Result<Option<StrategyAcceptedPlan>, ()> {
    let stored = &variant["acceptedPlan"];
    if stored.is_null() {
        return Ok(None);
    }
    if !schema_allows {
        return Err(());
    }
    let plan: StrategyAcceptedPlan = serde_json::from_value(stored.clone()).map_err(|_| ())?;
    plan_is_valid(&plan).then_some(Some(plan)).ok_or(())
}

/// The plan of the variant `(event, variant)` of the document, if it has a valid one.
pub(super) fn plan_of(doc: &Document, event: usize, variant: usize) -> Option<StrategyAcceptedPlan> {
    let variant = doc.value()["events"].get(event)?["strategies"].get(variant)?;
    read(variant, true).ok().flatten()
}

fn numeric(field: ManualField) -> bool {
    match field {
        ManualField::ServiceMode => false,
        ManualField::DurationMinutes
        | ManualField::FuelCapacityLiters
        | ManualField::PitTransitSeconds => true,
        other => other.is_scalar(),
    }
}

/// Names and notes are labels: they never make a plan stale.
fn counts(field: ManualField) -> bool {
    !matches!(
        field,
        ManualField::Name | ManualField::VariantName | ManualField::VariantNote
    )
}

/// `1.83` and `1.830` are the same number; a text is compared as written.
fn same_entry(field: ManualField, before: &str, after: &str) -> bool {
    if before.trim() == after.trim() {
        return true; // also `inf` and `NaN`, which are never equal as numbers
    }
    if numeric(field)
        && let (Ok(before), Ok(after)) = (before.trim().parse::<f64>(), after.trim().parse::<f64>())
    {
        return before.is_finite()
            && after.is_finite()
            && (before - after).abs() <= f64::EPSILON * before.abs().max(after.abs());
    }
    false
}

/// The text of a change when it can travel: short, and with no control character.
fn shown(text: &str) -> Option<String> {
    (text.len() <= STRATEGY_CHANGE_TEXT_LIMIT && valid_text(text)).then(|| text.to_owned())
}

/// The entries that differ from the copy, in the order of the form.
pub(super) fn changes(copy: &StrategyComputeForm, now: &ManualEvent) -> Vec<StrategyChange> {
    let Ok(before) = copy.manual() else {
        return Vec::new();
    };
    ManualField::ALL
        .iter()
        .copied()
        .filter(|&field| counts(field) && !same_entry(field, &before[field], &now[field]))
        .map(|field| StrategyChange {
            field: field.into(),
            before: shown(&before[field]),
            after: shown(&now[field]),
        })
        .collect()
}

/// The plan as the replay of the crate takes it: the lengths of the stints and the
/// stops, with the driver, tyres and saving level the scalar model does not need.
pub(super) fn decision(stints: &[u32], pits: &[PitDecision]) -> DecisionVector {
    DecisionVector {
        stints: stints
            .iter()
            .enumerate()
            .map(|(index, &laps)| StintDecision {
                index,
                laps,
                ..StintDecision::default()
            })
            .collect(),
        pit_stops: pits.to_vec(),
    }
}

pub(super) fn pit_decision(pit: &StrategyPit) -> PitDecision {
    PitDecision {
        lap: pit.lap,
        fuel_liters: pit.fuel_liters.as_f64().unwrap_or_default(),
        ve_percent: pit.ve_percent.as_f64().unwrap_or_default(),
        change_tyres: pit.change_tyres,
        ..PitDecision::default()
    }
}

/// The seconds one stop takes in the pits, priced the way the crate's model prices
/// a stop (`Model::pit`, which is private): the transit plus the service, in
/// parallel or one after another. It is NOT read from the crate: a test holds this
/// copy to the replay of the crate and to the total of a plan the solver returns, so
/// the two cannot drift apart.
pub(super) fn pit_seconds(input: &Input, pit: &PitDecision) -> f64 {
    let cost = &input.pit_cost;
    let fuel = pit.fuel_liters / cost.refuel_rate_l_per_s.value;
    let ve = pit.ve_percent / cost.ve_rate_p_per_s.value;
    let tyres = if pit.change_tyres {
        cost.tyre_seconds.value
    } else {
        0.0
    };
    let service = if cost.service_mode == "parallel" {
        fuel.max(ve).max(tyres)
    } else {
        fuel + ve + tyres
    };
    cost.transit_seconds.value + service
}

/// Whether the accepted plan still reaches the finish with the entries as they are
/// now: `None` when it does, the cause when it does not. The plan starts with the
/// load it was accepted with and is never repaired.
pub(super) fn reach(
    doc: &Document,
    event: usize,
    variant: usize,
    plan: &StrategyAcceptedPlan,
) -> Option<StrategyUnreachable> {
    let other = Some(StrategyUnreachable {
        cause: StrategyUnreachableCause::Other,
        fail_lap: None,
    });
    let Some(timeline) = plan.result.timeline.as_ref() else {
        return other;
    };
    let mut scratch = doc.clone();
    let Ok(input) = ManualEvent::read(doc, event, variant).prepare(&mut scratch, event, variant)
    else {
        return other;
    };
    let Ok(prepared) = application::prepare_manual(input) else {
        return other;
    };
    let input = prepared.input();
    let stints: Vec<u32> = timeline
        .stints
        .iter()
        .map(|stint| stint.to_lap - stint.from_lap + 1)
        .collect();
    if stints.iter().try_fold(0_u32, |sum, &laps| sum.checked_add(laps)) != Some(input.race_laps) {
        return Some(StrategyUnreachable {
            cause: StrategyUnreachableCause::ScheduleMismatch,
            fail_lap: None,
        });
    }
    let pits: Vec<PitDecision> = timeline.pits.iter().map(pit_decision).collect();
    let start = (
        timeline.fuel_start_liters.as_f64(),
        timeline.ve_start_percent.as_f64(),
    );
    let (Some(fuel), Some(ve)) = start else {
        return other;
    };
    let Ok(replay) =
        replay_decision_v2_with_resources(input, &decision(&stints, &pits), fuel, ve)
    else {
        return other;
    };
    if replay.feasible {
        return None;
    }
    let cause = match replay.reasons.first().map(|reason| reason.code.as_str()) {
        Some("resource_exhausted") => StrategyUnreachableCause::ResourceExhausted,
        Some("reserve_not_met") => StrategyUnreachableCause::ReserveNotMet,
        _ => StrategyUnreachableCause::Other,
    };
    Some(StrategyUnreachable {
        cause,
        fail_lap: (cause == StrategyUnreachableCause::ResourceExhausted)
            .then_some(replay.failure)
            .flatten()
            .map(|failure| failure.lap),
    })
}

/// What the host works out once per document, not on every view.
#[derive(Clone, Debug, Default)]
pub(super) struct Inspection {
    /// One per event, in document order.
    pub marks: Vec<StrategyAcceptedMark>,
    pub active: Option<Active>,
}

/// The accepted plan of the active variant, with what the new data say about it.
#[derive(Clone, Debug)]
pub(super) struct Active {
    pub event_id: String,
    pub variant_id: String,
    pub plan: StrategyAcceptedPlan,
    pub changes: Vec<StrategyChange>,
    pub unreachable: Option<StrategyUnreachable>,
}

pub(super) fn inspect(doc: &Document) -> Inspection {
    let events = doc.value()["events"].as_array().map_or(&[][..], Vec::as_slice);
    let mut inspection = Inspection::default();
    for (event_index, event) in events.iter().enumerate() {
        let mut mark = StrategyAcceptedMark::None;
        let variants = event["strategies"].as_array().map_or(&[][..], Vec::as_slice);
        for (variant_index, variant) in variants.iter().enumerate() {
            let Some(plan) = read(variant, true).ok().flatten() else {
                continue;
            };
            let now = ManualEvent::read(doc, event_index, variant_index);
            let changes = changes(&plan.entries, &now);
            mark = match (mark, changes.is_empty()) {
                (_, false) | (StrategyAcceptedMark::Stale, _) => StrategyAcceptedMark::Stale,
                _ => StrategyAcceptedMark::Accepted,
            };
            let active = doc.value()["activeEventId"] == event["id"]
                && event["activeStrategyId"] == variant["id"];
            if active {
                let unreachable = if changes.is_empty() {
                    None
                } else {
                    reach(doc, event_index, variant_index, &plan)
                };
                inspection.active = Some(Active {
                    event_id: event["id"].as_str().unwrap_or_default().to_owned(),
                    variant_id: variant["id"].as_str().unwrap_or_default().to_owned(),
                    plan,
                    changes,
                    unreachable,
                });
            }
        }
        inspection.marks.push(mark);
    }
    inspection
}

fn same_calendar(left: &StrategyCalculationView, right: &StrategyCalculationView) -> bool {
    let (Some(left), Some(right)) = (&left.timeline, &right.timeline) else {
        return false;
    };
    left.stints == right.stints
        && left.pits.len() == right.pits.len()
        && left.pits.iter().zip(&right.pits).all(|(a, b)| {
            a.lap == b.lap
                && a.fuel_liters.as_f64() == b.fuel_liters.as_f64()
                && a.ve_percent.as_f64() == b.ve_percent.as_f64()
                && a.change_tyres == b.change_tyres
                && a.service == b.service
        })
}

/// The proposal against the accepted plan; `None` without a proposal with a plan.
pub(super) fn compare(
    accepted: &StrategyCalculationView,
    proposal: Option<&StrategyCalculationView>,
) -> Option<StrategyCompare> {
    let proposal = proposal?;
    let total = |view: &StrategyCalculationView| view.metrics.as_ref()?.total_seconds.as_f64();
    let delta = total(proposal)? - total(accepted)?;
    Some(StrategyCompare {
        same: same_calendar(accepted, proposal),
        delta_seconds: Number::from_f64(delta)?,
    })
}

/// The view of the accepted plan of the active variant.
pub(super) fn view(
    active: &Active,
    saved: bool,
    proposal: Option<&StrategyCalculationView>,
) -> StrategyAcceptedView {
    let state = match (&active.changes[..], &active.unreachable) {
        ([], _) => StrategyAcceptedState::Accepted,
        (_, None) => StrategyAcceptedState::Stale,
        (_, Some(_)) => StrategyAcceptedState::StaleUnreachable,
    };
    StrategyAcceptedView {
        state,
        accepted_at: active.plan.accepted_at.clone(),
        saved,
        compare: compare(&active.plan.result, proposal),
        result: active.plan.result.clone(),
        changes: active.changes.clone(),
        unreachable: active.unreachable,
    }
}

/// Whether the file on disk holds the same plan for the variant. `observed` is
/// what was read or written last.
pub(super) fn is_saved(doc: &Document, observed: Option<&[u8]>, active: &Active) -> bool {
    let Some(observed) = observed else {
        return false;
    };
    if observed == doc.bytes() {
        return true;
    }
    let Ok(saved) = serde_json::from_slice::<Value>(observed) else {
        return false;
    };
    let plan = |value: &Value| {
        let event = value["events"]
            .as_array()?
            .iter()
            .find(|event| event["id"] == active.event_id.as_str())?;
        let variant = event["strategies"]
            .as_array()?
            .iter()
            .find(|variant| variant["id"] == active.variant_id.as_str())?;
        Some(variant["acceptedPlan"].clone())
    };
    let (Some(saved), Some(current)) = (plan(&saved), plan(doc.value())) else {
        return false;
    };
    !saved.is_null() && saved == current
}
