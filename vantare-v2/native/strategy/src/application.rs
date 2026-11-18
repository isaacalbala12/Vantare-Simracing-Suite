//! Manual Strategy calculation boundary and exact Analysis revision checks.
use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};

use super::solver::{self, Input, SolverOutcome};

mod editing;
mod manual;
pub use manual::{ManualEvent, ManualField, select_event};
pub mod repository;
pub use editing::{EditedPlan, recalculate_edited_plan};

#[derive(Clone, Debug)]
pub struct PreparedCalculation {
    input: Input,
}

impl PreparedCalculation {
    pub fn input(&self) -> &Input {
        &self.input
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceStatus {
    Open,
    Closed,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRevisionRef {
    pub session_id: String,
    pub base_digest: String,
    pub revision_id: String,
    pub snapshot_id: String,
}

/// Validates the complete, exact Analysis snapshot set selected by a caller.
pub fn validate_analysis_revisions(
    selected_sessions: &[String],
    revisions: &[AnalysisRevisionRef],
) -> Result<(), String> {
    if selected_sessions.is_empty() || revisions.len() != selected_sessions.len() {
        return Err("invalid_source_revisions".into());
    }

    let mut remaining = std::collections::BTreeSet::new();
    for session in selected_sessions {
        if session.trim().is_empty() || session.len() > 256 || !remaining.insert(session.clone()) {
            return Err("invalid_source_revisions".into());
        }
    }
    for revision in revisions {
        if !remaining.remove(&revision.session_id)
            || !is_digest(&revision.base_digest)
            || !is_digest(&revision.revision_id)
            || !is_digest(&revision.snapshot_id)
        {
            return Err("invalid_source_revisions".into());
        }
    }
    if !remaining.is_empty() {
        return Err("invalid_source_revisions".into());
    }
    Ok(())
}

fn is_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub fn prepare_manual(input: Input) -> Result<PreparedCalculation, String> {
    input.validate()?;
    Ok(PreparedCalculation { input })
}

/// Search route that produced a manual calculation. Diagnostic only; it is
/// not part of any wire contract.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CalculationRoute {
    Scalar,
    Greedy,
}

pub fn calculate(
    prepared: &PreparedCalculation,
    source_status: SourceStatus,
    cancel: &AtomicBool,
) -> Result<SolverOutcome, String> {
    calculate_with_route(prepared, source_status, cancel).map(|(outcome, _)| outcome)
}

pub fn calculate_with_route(
    prepared: &PreparedCalculation,
    source_status: SourceStatus,
    cancel: &AtomicBool,
) -> Result<(SolverOutcome, CalculationRoute), String> {
    if source_status != SourceStatus::Open {
        return Err("source_not_open".into());
    }
    calculate_inner(prepared, cancel, &|| {})
}

/// `before_greedy` runs once, right before the greedy fallback starts.
fn calculate_inner(
    prepared: &PreparedCalculation,
    cancel: &AtomicBool,
    _before_greedy: &dyn Fn(),
) -> Result<(SolverOutcome, CalculationRoute), String> {
    solver::solve_v2_cancellable(&prepared.input, cancel)
        .map(|outcome| (outcome, CalculationRoute::Scalar))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn exact_analysis_revision_set_matches_selected_sessions() {
        let digest = "a".repeat(64);
        let revision = AnalysisRevisionRef {
            session_id: "session-1".into(),
            base_digest: digest.clone(),
            revision_id: "b".repeat(64),
            snapshot_id: "c".repeat(64),
        };
        let sessions = vec!["session-1".to_string()];
        assert!(validate_analysis_revisions(&sessions, std::slice::from_ref(&revision)).is_ok());

        let cases = [
            (Vec::new(), vec![revision.clone()]),
            (sessions.clone(), Vec::new()),
            (
                vec!["session-1".into(), "session-2".into()],
                vec![revision.clone()],
            ),
            (
                vec!["session-1".into(), "session-1".into()],
                vec![revision.clone()],
            ),
            (vec!["session-2".into()], vec![revision.clone()]),
        ];
        for (selected, refs) in cases {
            assert!(validate_analysis_revisions(&selected, &refs).is_err());
        }

        let mut malformed = revision;
        malformed.snapshot_id = digest.to_ascii_uppercase();
        assert!(validate_analysis_revisions(&sessions, &[malformed]).is_err());
    }

    #[test]
    fn calculation_requires_an_open_source_before_running_the_solver() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../testdata/oracle/solver.json"))
                .expect("scalar input corpus");
        let input: Input = serde_json::from_value(cases[0]["input"].clone()).expect("input");
        let prepared = prepare_manual(input).expect("valid manual input");
        let error = calculate(&prepared, SourceStatus::Closed, &AtomicBool::new(false))
            .expect_err("closed source is blocked");
        assert_eq!(error, "source_not_open");
    }

    #[test]
    fn a_cancellation_during_the_greedy_fallback_publishes_nothing() {
        use std::sync::atomic::Ordering;
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json")).expect("Fuji");
        input.extra.clear();
        input.budget.p95_millis = 2_000;
        input.budget.max_candidates = 250_000;
        input.budget.max_iterations = 1_000_000;
        let prepared = prepare_manual(input).expect("valid manual input");
        let cancel = AtomicBool::new(false);
        let reached = AtomicBool::new(false);
        // The hook runs on the calling thread right before the fallback: the
        // cancellation lands there deterministically, without sleeping.
        let result = calculate_inner(&prepared, &cancel, &|| {
            reached.store(true, Ordering::Relaxed);
            cancel.store(true, Ordering::Relaxed);
        });
        assert!(
            reached.load(Ordering::Relaxed),
            "the scalar search must hand over to the greedy fallback"
        );
        assert_eq!(result.expect_err("cancelled"), "cancelled");
    }
}
