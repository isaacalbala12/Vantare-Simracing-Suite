//! Application entry point for recalculating an edited stint and stop schedule.
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

use super::Fallback;
use super::solver::{self, Input, SolverOutcome, Window};

const MAX_PIT_STOPS: usize = 16;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditedPlan {
    /// Competitive laps in each stint; their sum must equal raceLaps.
    pub stints: Vec<u32>,
    /// The lap completed immediately before each pit stop.
    pub pit_stop_laps: Vec<u32>,
}

/// Recalculates cost with the edited stint boundaries fixed as required stops.
///
/// The scalar solver still chooses service amounts. Its current public input
/// cannot pin fuel, VE, or tyre actions from edited pit-stop details.
pub fn recalculate_edited_plan(
    input: &Input,
    edited: &EditedPlan,
    cancel: &AtomicBool,
) -> Result<SolverOutcome, String> {
    recalculate_edited_plan_detailed(input, edited, cancel).map(|(outcome, _)| outcome)
}

/// Like [`recalculate_edited_plan`], also saying whether the greedy fallback was
/// needed, applied or refused, so that the caller can report the cause.
pub fn recalculate_edited_plan_detailed(
    input: &Input,
    edited: &EditedPlan,
    cancel: &AtomicBool,
) -> Result<(SolverOutcome, Fallback), String> {
    input.validate()?;
    validate_edited_plan(input.race_laps, edited)?;

    let stops = edited.pit_stop_laps.len();
    if input
        .event_rules
        .min_pit_stops
        .is_some_and(|minimum| stops < minimum)
        || input
            .event_rules
            .max_pit_stops
            .is_some_and(|maximum| stops > maximum)
    {
        return Err("edited_stop_count_conflicts_with_event_rules".into());
    }

    let mut constrained = input.clone();
    constrained.event_rules.min_pit_stops = Some(stops);
    constrained.event_rules.max_pit_stops = Some(stops);
    for &lap in &edited.pit_stop_laps {
        if !constrained
            .event_rules
            .required_windows
            .iter()
            .any(|window| window.from_lap == lap && window.to_lap == lap)
        {
            constrained.event_rules.required_windows.push(Window {
                from_lap: lap,
                to_lap: lap,
            });
        }
    }
    if constrained.event_rules.required_windows.len() > MAX_PIT_STOPS {
        return Err("too_many_required_pit_windows".into());
    }

    let (outcome, fallback) = solve_with_fallback(&constrained, cancel)?;
    if outcome.result.feasible
        && (outcome.result.stints != edited.stints
            || outcome
                .result
                .pit_stops
                .iter()
                .map(|stop| stop.lap)
                .collect::<Vec<_>>()
                != edited.pit_stop_laps)
    {
        return Err("solver_did_not_preserve_edited_schedule".into());
    }
    Ok((outcome, fallback))
}

/// The scalar search first. Only when it ends without any plan (`not_proven`, no
/// feasible plan) the greedy plan is tried on the same constrained input; it keeps
/// the fixed stops and windows or refuses with its typed cause, and the result is
/// never `proven`. A plan or a proven "no solution" is returned untouched.
fn solve_with_fallback(
    constrained: &Input,
    cancel: &AtomicBool,
) -> Result<(SolverOutcome, Fallback), String> {
    let mut outcome = solver::solve_v2_cancellable(constrained, cancel)?;
    let without_plan = outcome.certificate.status == solver::OptimalityStatus::NotProven
        && !outcome.result.feasible;
    if !without_plan {
        return Ok((outcome, Fallback::NotApplicable));
    }
    if solver::runs_extended_search(constrained) {
        return Ok((outcome, Fallback::Refused(solver::GreedyRefusal::NotScalar)));
    }
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    let greedy = solver::solve_greedy_fallback(constrained);
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    match greedy {
        Ok(plan) => Ok((plan, Fallback::Applied)),
        Err(refusal) => {
            let cause = format!("greedy_plan_unavailable: {}", refusal.code());
            outcome.certificate.reason = Some(match outcome.certificate.reason.take() {
                Some(reason) => format!("{reason}; {cause}"),
                None => cause,
            });
            Ok((outcome, Fallback::Refused(refusal)))
        }
    }
}

fn validate_edited_plan(race_laps: u32, edited: &EditedPlan) -> Result<(), String> {
    if edited.stints.is_empty()
        || edited.stints.len() > MAX_PIT_STOPS + 1
        || edited.pit_stop_laps.len() + 1 != edited.stints.len()
    {
        return Err("invalid_edited_stint_schedule".into());
    }
    let mut completed = 0_u32;
    for (index, &stint_laps) in edited.stints.iter().enumerate() {
        if stint_laps == 0 {
            return Err("invalid_edited_stint_schedule".into());
        }
        completed = completed
            .checked_add(stint_laps)
            .ok_or("invalid_edited_stint_schedule")?;
        if let Some(&stop_lap) = edited.pit_stop_laps.get(index)
            && completed != stop_lap
        {
            return Err("invalid_edited_stint_schedule".into());
        }
    }
    if completed != race_laps || edited.pit_stop_laps.last() == Some(&race_laps) {
        return Err("invalid_edited_stint_schedule".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn solver_input() -> Input {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../../testdata/oracle/solver.json"))
                .expect("scalar input corpus");
        serde_json::from_value(cases[0]["input"].clone()).expect("valid scalar input")
    }

    #[test]
    fn edited_schedule_is_a_solver_constraint_and_returns_recalculated_cost() {
        let input = solver_input();
        let edited = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        let outcome =
            recalculate_edited_plan(&input, &edited, &AtomicBool::new(false)).expect("recalculate");
        assert!(outcome.result.feasible);
        assert_eq!(outcome.result.stints, edited.stints);
        assert_eq!(outcome.result.pit_stops[0].lap, edited.pit_stop_laps[0]);
        assert_eq!(
            outcome.cost_seconds,
            Some(outcome.result.expected.total_seconds)
        );
        let golden: Value =
            serde_json::from_str(include_str!("../../testdata/oracle/edited-plan-v1-go.json"))
                .expect("Go generated edited-plan fixture");
        assert_eq!(outcome.result.feasible, golden["feasible"]);
        let expected_stints: Vec<u32> =
            serde_json::from_value(golden["stints"].clone()).expect("Go stint schedule");
        assert_eq!(outcome.result.stints, expected_stints);
        let expected_stop_laps: Vec<u32> =
            serde_json::from_value(golden["pitStopLaps"].clone()).expect("Go pit stop schedule");
        assert_eq!(
            outcome
                .result
                .pit_stops
                .iter()
                .map(|stop| stop.lap)
                .collect::<Vec<_>>(),
            expected_stop_laps
        );
        assert_eq!(outcome.cost_seconds, golden["costSeconds"].as_f64());
    }

    #[test]
    fn edited_stint_and_stop_shapes_are_checked() {
        let input = solver_input();
        for edited in [
            EditedPlan {
                stints: vec![],
                pit_stop_laps: vec![],
            },
            EditedPlan {
                stints: vec![0, 3],
                pit_stop_laps: vec![1],
            },
            EditedPlan {
                stints: vec![1, 1],
                pit_stop_laps: vec![1],
            },
            EditedPlan {
                stints: vec![1, 2],
                pit_stop_laps: vec![2],
            },
            EditedPlan {
                stints: vec![1, 2],
                pit_stop_laps: vec![3],
            },
        ] {
            assert!(
                recalculate_edited_plan(&input, &edited, &AtomicBool::new(false)).is_err(),
                "{edited:?}"
            );
        }
    }

    #[test]
    fn edited_stop_count_must_fit_existing_event_rules() {
        let mut input = solver_input();
        input.event_rules.min_pit_stops = Some(2);
        let edited = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        assert_eq!(
            recalculate_edited_plan(&input, &edited, &AtomicBool::new(false))
                .expect_err("event minimum conflicts with edit"),
            "edited_stop_count_conflicts_with_event_rules"
        );
    }

    fn manual(laps: u32) -> Input {
        let mut input: Input =
            serde_json::from_str(include_str!("../../testdata/fuji-1450-input.json"))
                .expect("frozen Fuji input");
        input.extra.clear();
        input.race_laps = laps;
        input.budget.p95_millis = 60_000; // the candidate limit, not the clock, ends the search
        input.budget.max_candidates = 250_000;
        input.budget.max_iterations = 1_000_000;
        input
    }

    /// The Fuji witness (236 laps; stints 43-42-42-43-42-24), edited by one lap.
    fn witness(index: Option<usize>, delta: i32) -> EditedPlan {
        let mut edited = EditedPlan {
            stints: vec![43, 42, 42, 43, 42, 24],
            pit_stop_laps: vec![43, 85, 127, 170, 212],
        };
        if let Some(index) = index {
            edited.pit_stop_laps[index] = edited.pit_stop_laps[index]
                .checked_add_signed(delta)
                .expect("lap");
            edited.stints[index] = edited.stints[index].checked_add_signed(delta).expect("lap");
            edited.stints[index + 1] = edited.stints[index + 1]
                .checked_add_signed(-delta)
                .expect("lap");
        }
        edited
    }

    // The scalar search alone ends without a plan for a Fuji race with virtual
    // energy and an exact calendar; the greedy fallback must keep that calendar.
    #[test]
    fn fuji_with_virtual_energy_recalculates_the_edited_schedule_with_the_fallback() {
        for (index, delta) in [(None, 0), (Some(0), -1), (Some(3), -1)] {
            let edited = witness(index, delta);
            let (outcome, fallback) =
                recalculate_edited_plan_detailed(&manual(236), &edited, &AtomicBool::new(false))
                    .expect("recalculate");
            assert!(outcome.result.feasible, "{edited:?}: no plan");
            assert_eq!(outcome.result.stints, edited.stints);
            assert_eq!(
                outcome
                    .result
                    .pit_stops
                    .iter()
                    .map(|s| s.lap)
                    .collect::<Vec<_>>(),
                edited.pit_stop_laps
            );
            assert_eq!(
                outcome.certificate.status,
                solver::OptimalityStatus::NotProven
            );
            assert!(outcome.certificate.proof.is_none());
            assert_eq!(fallback, Fallback::Applied, "{edited:?}");
        }
    }

    // On the 1 % grid a second 43-lap stint is impossible after a first one of 43:
    // the battery left (0.41 %) plus the largest whole-step top-up is 99.41 %, short
    // of the 99.59 % it needs. The scalar model has the same limit, so this edit has
    // no plan; the answer is the typed cause, not a plan that breaks the calendar.
    #[test]
    fn an_edit_the_service_grid_cannot_serve_has_no_plan_and_a_typed_cause() {
        let (outcome, fallback) = recalculate_edited_plan_detailed(
            &manual(236),
            &witness(Some(1), 1),
            &AtomicBool::new(false),
        )
        .expect("a result, not an error");
        assert!(!outcome.result.feasible);
        assert_eq!(fallback, Fallback::Refused(solver::GreedyRefusal::MaxStops));
    }

    // A calendar no plan can follow is still "no plan", never a plan that breaks it,
    // and the cause is typed.
    #[test]
    fn an_impossible_calendar_has_no_plan_and_a_typed_cause() {
        let mut input = manual(236);
        input.budget.max_candidates = 1; // the scalar search ends at once, without a plan
        let edited = EditedPlan {
            stints: vec![100, 136],
            pit_stop_laps: vec![100],
        };
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                .expect("a result, not an error");
        assert!(!outcome.result.feasible);
        assert_eq!(
            fallback,
            Fallback::Refused(solver::GreedyRefusal::MaxStops),
            "a 100-lap stint needs more stops than the one edited"
        );
    }

    // Where the scalar search already gives its answer, nothing changes: the
    // result is the scalar solver's on the same constrained input.
    #[test]
    fn a_calendar_the_scalar_search_solves_is_the_scalar_result() {
        let input = solver_input();
        let edited = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        let mut constrained = input.clone();
        constrained.event_rules.min_pit_stops = Some(1);
        constrained.event_rules.max_pit_stops = Some(1);
        constrained.event_rules.required_windows.push(Window {
            from_lap: 1,
            to_lap: 1,
        });
        let expected = solver::solve_v2_cancellable(&constrained, &AtomicBool::new(false))
            .expect("scalar result");
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                .expect("recalculate");
        assert_eq!(fallback, Fallback::NotApplicable);
        assert_eq!(
            serde_json::to_value(&outcome).expect("json"),
            serde_json::to_value(&expected).expect("json")
        );
    }
}
