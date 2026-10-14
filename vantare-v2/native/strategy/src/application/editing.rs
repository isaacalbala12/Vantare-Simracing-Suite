//! Application entry point for recalculating an edited stint and stop schedule.
use std::sync::atomic::AtomicBool;

use serde::{Deserialize, Serialize};

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

    let outcome = solver::solve_v2_cancellable(&constrained, cancel)?;
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
    Ok(outcome)
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
}
