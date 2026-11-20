#![allow(clippy::unwrap_used)]
use super::*;
use crate::strategy::calculation::{Calculation, StrategyPlanView as PlanView};
use crate::strategy::calculation::{StrategyCertificate, StrategyPlanState, project};
use vantare_strategy::{
    application::{self, EditedPlan, SourceStatus, recalculate_edited_plan},
    document::Document,
};

fn fuji() -> Input {
    let mut input: Input =
        serde_json::from_str(include_str!("../../strategy/testdata/fuji-1450-input.json")).unwrap();
    input.budget.p95_millis = 60_000; // the candidate limit, not the clock, ends the search
    input.budget.max_candidates = 250_000;
    input
}

/// The Fuji bridge input as the manual form builds it (no `extra`), with a tank
/// of about six laps so that a short race has several stops, with or without VE.
fn manual(laps: u32, ve: bool) -> Input {
    let mut input = fuji();
    input.extra.clear();
    input.race_laps = laps;
    input.fuel_capacity_liters.value = 12.0;
    if !ve {
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
    }
    input
}

fn calculate(input: Input) -> (SolverOutcome, StrategyPlanView, Option<Editing>) {
    let prepared = application::prepare_manual(input).unwrap();
    let outcome =
        application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false)).unwrap();
    let view = project(prepared.input(), &outcome, "Pilot").unwrap();
    let editing = Editing::new(prepared.input(), &outcome, &view, "Pilot");
    (outcome, view, editing)
}

const RACE: u32 = 24;

/// A plan with several stops that the real solver proves within milliseconds.
fn editable() -> Editing {
    calculate(manual(RACE, false)).2.expect("a feasible plan")
}

fn laps(editing: &Editing) -> Vec<u32> {
    editing
        .edit_view()
        .stops
        .iter()
        .map(|stop| stop.lap)
        .collect()
}

fn lengths(editing: &Editing) -> Vec<u32> {
    editing
        .edit_view()
        .stints
        .iter()
        .map(|stint| stint.to_lap - stint.from_lap + 1)
        .collect()
}

#[test]
fn a_boundary_moves_inside_its_range_and_keeps_the_other_boundaries_and_the_total() {
    let mut editing = editable();
    let before = laps(&editing);
    assert!(
        before.len() >= 2,
        "the case needs two boundaries to be useful"
    );
    let stop = editing.edit_view().stops[0].clone();
    assert!(stop.lap < stop.max_lap);
    editing.move_boundary(0, stop.lap + 1).unwrap();
    let after = laps(&editing);
    assert_eq!(after[0], before[0] + 1);
    assert_eq!(&after[1..], &before[1..], "the other boundaries stay");
    assert_eq!(
        lengths(&editing).iter().sum::<u32>(),
        RACE,
        "the total stays"
    );
    assert!(editing.pending());
    let view = editing.edit_view();
    assert!(view.can_reset);
    assert_eq!(view.stints.first().unwrap().from_lap, 1);
    assert_eq!(view.stints.last().unwrap().to_lap, RACE);
    for pair in view.stints.windows(2) {
        assert_eq!(pair[0].to_lap + 1, pair[1].from_lap, "contiguous stints");
    }
}

#[test]
fn a_boundary_never_leaves_an_empty_stint_nor_passes_its_neighbours_or_the_finish() {
    let mut editing = editable();
    let count = editing.edit_view().stops.len();
    for index in 0..count {
        let stop = editing.edit_view().stops[index].clone();
        let before = laps(&editing);
        let index = u32::try_from(index).unwrap();
        for bad in [
            0,
            stop.min_lap - 1,
            stop.max_lap + 1,
            RACE,
            RACE + 1,
            u32::MAX,
        ] {
            assert_eq!(
                editing.move_boundary(index, bad),
                Err(HostError::Rejected),
                "stop {index} to {bad}"
            );
        }
        assert_eq!(laps(&editing), before, "a rejected move changes nothing");
        // The extremes of the range are valid and leave one lap in a stint.
        editing.move_boundary(index, stop.min_lap).unwrap();
        assert!(lengths(&editing).iter().all(|&stint| stint >= 1));
        editing.move_boundary(index, stop.max_lap).unwrap();
        assert!(lengths(&editing).iter().all(|&stint| stint >= 1));
        editing.reset();
    }
    assert_eq!(
        editing.move_boundary(u32::try_from(count).unwrap(), 1),
        Err(HostError::Rejected),
        "there is no boundary after the last stint"
    );
}

#[test]
fn moving_a_boundary_to_where_it_is_changes_nothing() {
    let mut editing = editable();
    let stop = editing.edit_view().stops[0].lap;
    editing.move_boundary(0, stop).unwrap();
    assert!(!editing.pending());
    assert!(!editing.edit_view().can_reset);
}

#[test]
fn a_plan_with_one_stint_has_no_boundary_to_edit() {
    let mut editing = calculate(manual(3, false)).2.expect("a feasible plan");
    let view = editing.edit_view();
    assert_eq!(view.stints.len(), 1);
    assert_eq!(view.stops, vec![]);
    assert_eq!(editing.move_boundary(0, 1), Err(HostError::Rejected));
    assert_eq!(editing.move_stop(0, 1), Err(HostError::Rejected));
}

#[test]
fn a_plan_with_more_than_sixteen_stops_cannot_be_edited() {
    let mut input = manual(30, false);
    input.fuel_capacity_liters.value = 4.0; // two laps per tank: 24 stops
    let (outcome, view, editing) = calculate(input);
    assert!(outcome.result.pit_stops.len() > STRATEGY_PIT_LIMIT);
    assert!(view.result.unwrap().timeline.is_none());
    assert!(editing.is_none());
}

#[test]
fn only_a_feasible_plan_can_be_edited() {
    let mut input = manual(5, false);
    input.fuel_capacity_liters.value = 1.0; // less than one lap of fuel
    let (outcome, _, editing) = calculate(input);
    assert!(!outcome.result.feasible);
    assert!(editing.is_none());
}

#[test]
fn a_stop_moves_one_lap_inside_the_laps_of_its_neighbours() {
    let mut editing = editable();
    let stop = editing.edit_view().stops[1].clone();
    editing.move_stop(1, -1).unwrap();
    assert_eq!(laps(&editing)[1], stop.lap - 1);
    editing.move_stop(1, 1).unwrap();
    editing.move_stop(1, 1).unwrap();
    assert_eq!(laps(&editing)[1], stop.lap + 1);
    for bad in [0_i8, 2, -2, i8::MIN, i8::MAX] {
        assert_eq!(editing.move_stop(1, bad), Err(HostError::Rejected), "{bad}");
    }
    assert_eq!(
        editing.move_stop(u32::MAX, 1),
        Err(HostError::Rejected),
        "no such stop"
    );
}

#[test]
fn consecutive_stops_cannot_cross_and_the_last_one_cannot_reach_the_finish() {
    let mut editing = editable();
    let count = editing.edit_view().stops.len();
    // Push every stop as late as it goes, one lap at a time.
    for index in (0..count).rev() {
        let index = u32::try_from(index).unwrap();
        while editing.move_stop(index, 1).is_ok() {}
    }
    let pushed = laps(&editing);
    assert!(pushed.windows(2).all(|pair| pair[0] < pair[1]));
    assert_eq!(*pushed.last().unwrap(), RACE - 1, "never the last lap");
    for (index, lap) in pushed.iter().enumerate().take(count - 1) {
        assert_eq!(*lap + 1, pushed[index + 1], "consecutive laps, no crossing");
    }
    assert!(lengths(&editing).iter().all(|&stint| stint >= 1));
    // And as early as it goes.
    for index in 0..count {
        let index = u32::try_from(index).unwrap();
        while editing.move_stop(index, -1).is_ok() {}
    }
    assert_eq!(
        laps(&editing),
        (1..=u32::try_from(count).unwrap()).collect::<Vec<_>>()
    );
}

#[test]
fn the_amounts_of_each_stop_are_the_solvers_and_do_not_move_with_the_lap() {
    let mut editing = editable();
    let amounts = |editing: &Editing| {
        editing
            .edit_view()
            .stops
            .iter()
            .map(|stop| (stop.fuel_liters.clone(), stop.ve_percent.clone()))
            .collect::<Vec<_>>()
    };
    let before = amounts(&editing);
    let timeline = editing
        .base
        .result
        .as_ref()
        .unwrap()
        .timeline
        .clone()
        .unwrap();
    assert_eq!(
        before,
        timeline
            .pits
            .iter()
            .map(|pit| (pit.fuel_liters.clone(), pit.ve_percent.clone()))
            .collect::<Vec<_>>()
    );
    editing.move_stop(0, 1).unwrap();
    assert_eq!(amounts(&editing), before);
}

#[test]
fn recalculating_keeps_exactly_the_edited_schedule_and_returns_its_cost() {
    // A short race without VE. The Fuji case with VE waits for #2628 (below).
    let mut editing = editable();
    let stop = editing.edit_view().stops[0].clone();
    let lap = if stop.lap > stop.min_lap {
        stop.lap - 1
    } else {
        stop.lap + 1
    };
    editing.move_boundary(0, lap).unwrap();
    let edited = editing.edit_view();
    let schedule = EditedPlan {
        stints: edited
            .stints
            .iter()
            .map(|stint| stint.to_lap - stint.from_lap + 1)
            .collect(),
        pit_stop_laps: edited.stops.iter().map(|stop| stop.lap).collect(),
    };
    // The cost the crate gives for exactly this schedule, asked independently.
    let expected = recalculate_edited_plan(&editing.input, &schedule, &AtomicBool::new(false))
        .unwrap()
        .cost_seconds
        .expect("a feasible schedule has a cost");
    let job = editing.job();
    let done = job(&AtomicBool::new(false)).expect("recalculate");
    assert!(done.feasible);
    let result = done.view.result.as_ref().unwrap();
    let timeline = result.timeline.as_ref().unwrap();
    assert_eq!(timeline.stints, edited.stints, "stints preserved exactly");
    assert_eq!(
        timeline.pits.iter().map(|pit| pit.lap).collect::<Vec<_>>(),
        schedule.pit_stop_laps,
        "stops preserved exactly"
    );
    let metrics = result.metrics.as_ref().unwrap();
    assert_eq!(
        usize::try_from(metrics.pit_count).unwrap(),
        edited.stops.len()
    );
    assert_eq!(metrics.laps, edited.stints.last().unwrap().to_lap);
    assert_eq!(
        metrics.total_seconds.as_f64().unwrap(),
        expected,
        "the cost is the one of the edited schedule"
    );
    editing.apply(Ok(done));
    assert!(!editing.pending());
    let view = editing.plan_view(Some(2));
    assert_ne!(view.state, StrategyPlanState::Edited);
    assert_eq!(view.edit.as_ref().unwrap().stints, edited.stints);
    assert!(
        !view.edit.unwrap().can_reset,
        "the recalculated plan is the new base"
    );
    editing.reset();
    assert_eq!(
        editing.edit_view().stints,
        edited.stints,
        "reset stops there"
    );
}

#[test]
fn a_schedule_that_has_no_solution_is_shown_and_can_be_reset() {
    let mut editing = editable();
    let base = editing.plan_view(Some(1));
    // Stretch the stint after the stop with most room beyond what the tank holds.
    let stops = editing.edit_view().stops;
    let (index, stop) = stops
        .iter()
        .enumerate()
        .max_by_key(|(_, stop)| stop.max_lap - stop.lap)
        .unwrap();
    editing
        .move_boundary(u32::try_from(index).unwrap(), stop.max_lap)
        .unwrap();
    let job = editing.job();
    let done = job(&AtomicBool::new(false)).expect("an answer, not an error");
    assert!(!done.feasible, "a stint longer than the tank has no plan");
    editing.apply(Ok(done));
    let shown = editing.plan_view(Some(2));
    let result = shown.result.as_ref().unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NoSolution));
    // the edited schedule is the constraint nothing satisfies (E4a)
    assert_eq!(
        result.reason,
        Some(crate::strategy::calculation::StrategyReason::ConstraintsUnsatisfiable)
    );
    assert!(result.metrics.is_none() && result.timeline.is_none());
    assert!(shown.edit.as_ref().unwrap().can_reset);
    editing.reset();
    assert_eq!(
        editing.plan_view(Some(1)),
        base,
        "back to the feasible plan"
    );
}

#[test]
fn recalculating_conflicts_with_the_event_rules_on_the_number_of_stops() {
    let mut editing = editable();
    let stops = editing.edit_view().stops.len();
    editing.move_stop(0, 1).unwrap();
    editing.input.event_rules.min_pit_stops = Some(stops + 1);
    let job = editing.job();
    assert_eq!(
        job(&AtomicBool::new(false)).err(),
        Some(StrategyEditError::EventRulesConflict)
    );
    editing.apply(job_error(StrategyEditError::EventRulesConflict));
    assert!(editing.pending(), "the edit stays pending");
    assert_eq!(
        editing.edit_view().error,
        Some(StrategyEditError::EventRulesConflict)
    );
    editing.move_stop(0, -1).unwrap();
    assert_eq!(
        editing.edit_view().error,
        None,
        "a new move clears the error"
    );
}

fn job_error(error: StrategyEditError) -> Recalculation {
    Err(error)
}

#[test]
fn a_cancelled_recalculation_ends_without_a_plan() {
    let mut editing = editable();
    editing.move_stop(0, 1).unwrap();
    let job = editing.job();
    assert_eq!(
        job(&AtomicBool::new(true)).err(),
        Some(StrategyEditError::Failed),
        "the flag stops the solver before it publishes"
    );
}

#[test]
fn the_crates_error_strings_map_to_closed_errors() {
    for (text, error) in [
        (
            "invalid_edited_stint_schedule",
            StrategyEditError::InvalidSchedule,
        ),
        (
            "too_many_required_pit_windows",
            StrategyEditError::InvalidSchedule,
        ),
        (
            "edited_stop_count_conflicts_with_event_rules",
            StrategyEditError::EventRulesConflict,
        ),
        (
            "solver_did_not_preserve_edited_schedule",
            StrategyEditError::ScheduleNotPreserved,
        ),
        ("cancelled", StrategyEditError::Failed),
        ("anything else", StrategyEditError::Failed),
    ] {
        assert_eq!(edit_error(text), error, "{text}");
    }
}

#[test]
fn reset_returns_exactly_to_the_calculated_plan() {
    let mut editing = editable();
    let base = editing.plan_view(Some(1));
    assert!(!base.edit.as_ref().unwrap().can_reset);
    editing
        .move_boundary(0, editing.edit_view().stops[0].min_lap)
        .unwrap();
    editing.move_stop(1, 1).unwrap();
    assert_eq!(editing.plan_view(Some(1)).state, StrategyPlanState::Edited);
    editing.reset();
    assert_eq!(editing.plan_view(Some(1)), base);
    assert!(!editing.pending());
}

#[test]
fn the_wire_names_are_the_documented_ones() {
    let view = editable().plan_view(Some(1));
    let json = serde_json::to_value(&view).unwrap();
    assert_eq!(json["state"], "calculated");
    let edit = &json["edit"];
    assert_eq!(
        edit.as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>(),
        ["stints", "stops", "canReset", "error", "cause", "automatic"]
            .map(String::from)
            .into()
    );
    assert_eq!(
        edit["stops"][0]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>(),
        [
            "lap",
            "minLap",
            "maxLap",
            "fuelLiters",
            "vePercent",
            "fixed",
            "pitSeconds",
            "limits",
            "tyres"
        ]
        .map(String::from)
        .into()
    );
    assert_eq!(
        serde_json::to_value(StrategyEditError::ScheduleNotPreserved).unwrap(),
        "scheduleNotPreserved"
    );
    assert_eq!(
        serde_json::to_value(StrategyPlanState::Edited).unwrap(),
        "edited"
    );
}

#[test]
fn a_plan_that_does_not_cover_the_input_laps_cannot_be_edited() {
    let (outcome, view, editing) = calculate(fuji()); // 240 laps asked, 236 driven
    assert_eq!(outcome.result.stints.iter().sum::<u32>(), 236);
    assert!(view.result.unwrap().timeline.is_some());
    assert!(editing.is_none());
}

/// The Fuji witness (236 laps, 82 L; stints 43-42-42-43-42-24) as the manual form
/// builds it, with virtual energy, edited by one lap. The solver must keep the
/// schedule exactly (the scalar search finds no plan here; the greedy fallback does).
#[test]
fn fuji_with_ve_recalculates_an_edited_witness_schedule() {
    let mut input = manual(236, true);
    input.fuel_capacity_liters.value = 82.0;
    let prepared = application::prepare_manual(input).unwrap();
    let edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    // Edits the 1 % battery grid can serve (all four checked by the run): moving the
    // last stop by -1 (43-42-42-43-41-25) is one of them, and exercises the final
    // stint's reserve. Moving stop 2 by +1 (43-43-41-...) has no plan: a second 43-lap
    // stint after a first one of 43 needs more battery than the grid can top up (see
    // the crate test).
    for (index, delta) in [(None, 0_i32), (Some(0), -1), (Some(3), -1), (Some(4), -1)] {
        let mut edited = edited.clone();
        if let Some(index) = index {
            edited.pit_stop_laps[index] = edited.pit_stop_laps[index]
                .checked_add_signed(delta)
                .unwrap();
            edited.stints[index] = edited.stints[index].checked_add_signed(delta).unwrap();
            edited.stints[index + 1] = edited.stints[index + 1].checked_add_signed(-delta).unwrap();
        }
        let done = recalculate(
            prepared.input(),
            &edited,
            &[],
            "Pilot",
            &AtomicBool::new(false),
        )
        .expect("the edited Fuji schedule is solved");
        assert!(done.feasible, "{edited:?}");
        let timeline = done.view.result.unwrap().timeline.unwrap();
        assert_eq!(
            timeline
                .stints
                .iter()
                .map(|s| s.to_lap - s.from_lap + 1)
                .collect::<Vec<_>>(),
            edited.stints
        );
        assert_eq!(
            timeline.pits.iter().map(|pit| pit.lap).collect::<Vec<_>>(),
            edited.pit_stop_laps
        );
    }
}

/// A plan the solver returned with a schedule that does not describe a plan.
#[test]
fn a_malformed_schedule_is_not_editable_instead_of_panicking() {
    let (outcome, view, editing) = calculate(manual(RACE, false));
    let input = editing.unwrap().input;
    let broken = |change: &dyn Fn(&mut SolverOutcome)| {
        let mut outcome = outcome.clone();
        change(&mut outcome);
        Editing::new(&input, &outcome, &view, "Pilot").is_none()
    };
    assert!(!broken(&|_| {}), "the unchanged plan is editable");
    assert!(
        broken(&|outcome| outcome.result.stints[0] = 0),
        "empty stint"
    );
    assert!(
        broken(&|outcome| {
            outcome.result.stints[0] += 1;
            outcome.result.stints[1] -= 1;
        }),
        "stops are not the running totals of the stints"
    );
    assert!(
        broken(&|outcome| outcome.result.pit_stops[0].lap += 1),
        "stop off its stint"
    );
    assert!(
        broken(&|outcome| {
            let last = outcome.result.stints.len() - 1;
            outcome.result.stints[last] = 0;
            outcome.result.stints[0] += 1;
        }),
        "an empty last stint"
    );
}

fn calculation_with_edit() -> (Calculation, u32) {
    let editing = editable();
    let view = editing.plan_view(None);
    let mut calculation = Calculation::default();
    calculation
        .start(move |_| {
            Ok((
                Document::empty("2026-11-18T00:00:00Z").unwrap(),
                view,
                Some(editing),
            ))
        })
        .unwrap();
    calculation.finish().unwrap();
    let id = calculation.view().compute_id.unwrap();
    (calculation, id)
}

/// Moves some stop by one lap so that the edit is pending.
fn nudge(calculation: &mut Calculation, id: u32) {
    let moved = (0..3).any(|index| {
        [1, -1].into_iter().any(|delta| {
            calculation
                .edit(id, |editing| editing.move_stop(index, delta))
                .is_ok_and(|done| done.is_some())
        })
    });
    assert!(moved);
    assert!(calculation.edit_pending());
}

/// A recalculation that waits to be released and then fails recognisably.
fn held(
    calculation: &mut Calculation,
) -> (
    std::sync::mpsc::SyncSender<()>,
    std::sync::mpsc::Receiver<bool>,
) {
    use std::sync::{atomic::Ordering, mpsc};
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    let (seen, observed) = mpsc::sync_channel(1);
    calculation
        .test_recalculate_with(move |cancel| {
            ready.send(()).unwrap();
            wait.recv().unwrap();
            seen.send(cancel.load(Ordering::Relaxed)).unwrap();
            Err(StrategyEditError::EventRulesConflict)
        })
        .unwrap();
    started.recv().unwrap();
    (release, observed)
}

#[test]
fn a_late_recalculation_is_not_applied_after_cancel_or_reset_even_with_the_edit_alive() {
    for reset in [false, true] {
        let (mut calculation, id) = calculation_with_edit();
        nudge(&mut calculation, id);
        let (release, observed) = held(&mut calculation);
        let running = calculation.view().compute_id.unwrap();
        assert_eq!(calculation.view().state, StrategyPlanState::Calculating);
        if reset {
            assert!(calculation.reset(running).is_some());
        } else {
            calculation.cancel(running);
        }
        let shown: PlanView = calculation.view().clone();
        release.send(()).unwrap();
        assert!(observed.recv().unwrap(), "the worker saw its flag");
        assert!(calculation.finish().is_none());
        assert_eq!(calculation.view(), &shown, "the late failure is discarded");
        assert_eq!(calculation.view().edit.as_ref().unwrap().error, None);
    }
}

#[test]
fn a_panicking_recalculation_leaves_the_edit_pending_with_a_failed_error() {
    let (mut calculation, id) = calculation_with_edit();
    nudge(&mut calculation, id);
    calculation
        .test_recalculate_with(|_| panic!("the solver panicked on purpose"))
        .unwrap();
    assert!(calculation.finish().is_none());
    let view = calculation.view();
    assert_eq!(view.state, StrategyPlanState::Edited);
    assert_eq!(
        view.edit.as_ref().unwrap().error,
        Some(StrategyEditError::Failed)
    );
    assert!(!calculation.running());
}

/// A grid coarsened by the budget is the extended search's: there is no greedy plan to
/// fall back to, and "Recalcular" reports it like the calculation does.
#[test]
fn a_fine_grid_recalculation_reports_fine_grid_no_fallback() {
    use crate::strategy::calculation::StrategyReason;
    let mut input = manual(100, false);
    input.fuel_capacity_liters.value = 90.0;
    input.discretization.fuel_liters = 0.25; // more than 200 levels
    input.budget.max_candidates = 1;
    let edited = EditedPlan {
        stints: vec![49, 51],
        pit_stop_laps: vec![49],
    };
    let (_, fallback) = vantare_strategy::application::recalculate_edited_plan_detailed(
        &input,
        &edited,
        &AtomicBool::new(false),
    )
    .unwrap();
    assert_eq!(
        fallback,
        application::Fallback::Refused(vantare_strategy::solver::GreedyRefusal::NotScalar),
        "the precondition: the extended search ends without a plan"
    );
    let done = recalculate(&input, &edited, &[], "Pilot", &AtomicBool::new(false)).unwrap();
    assert!(!done.feasible);
    assert_eq!(
        done.view.result.unwrap().reason,
        Some(StrategyReason::FineGridNoFallback)
    );
}

// ---------------------------------------------------------------------------
// Fuel and energy fixed by hand in a stop (E5f, #2709).
// ---------------------------------------------------------------------------

type FuelLimits = (Option<(f64, f64)>, Option<StrategyAmountIssue>, Option<u32>);

/// The range, the issue and the failing lap of the fuel of a stop.
fn fuel_limits(stop: &StrategyEditStop) -> FuelLimits {
    let StrategyStopLimits::Exact {
        fuel:
            StrategyAmountLimits::Used {
                range,
                issue,
                fail_lap,
                ..
            },
        ..
    } = &stop.limits
    else {
        panic!("exact fuel limits: {:?}", stop.limits);
    };
    (
        range
            .as_ref()
            .map(|range| (range.min.as_f64().unwrap(), range.max.as_f64().unwrap())),
        *issue,
        *fail_lap,
    )
}

/// A stop whose fuel can be fixed to something else than what the plan loads,
/// with that amount (inside its limits) and its limits.
fn a_stop_with_room(editing: &Editing) -> (u32, f64, (f64, f64)) {
    editing
        .edit_view()
        .stops
        .iter()
        .enumerate()
        .find_map(|(index, stop)| {
            let (min, max) = fuel_limits(stop).0?;
            let planned = stop.fuel_liters.as_f64().unwrap();
            let other = if planned < max {
                planned + 1.0
            } else {
                planned - 1.0
            };
            (min < max).then_some((u32::try_from(index).unwrap(), other, (min, max)))
        })
        .expect("some stop admits more than one amount")
}

fn fixed_fuel(editing: &Editing) -> Vec<Option<f64>> {
    editing
        .edit_view()
        .stops
        .iter()
        .map(|stop| {
            stop.fixed
                .fuel_liters
                .as_ref()
                .map(|fuel| fuel.as_f64().unwrap())
        })
        .collect()
}

/// Recalculates the edit as the worker does; `true` when there is a plan.
fn run(editing: &mut Editing) -> bool {
    let job = editing.job();
    let done = job(&AtomicBool::new(false)).expect("a recalculation");
    let feasible = done.feasible;
    editing.apply(Ok(done));
    feasible
}

/// The plan of `editable()` moved to stints of five laps (5-5-5-5-4) and
/// recalculated: a tank of six laps leaves room in every stop, so more than one
/// amount can be fixed in them.
fn roomy() -> Editing {
    let mut editing = editable();
    for (index, lap) in [(0, 5), (1, 10), (2, 15), (3, 20)] {
        editing.move_boundary(index, lap).unwrap();
    }
    assert!(run(&mut editing), "five laps fit the tank");
    assert!(!editing.edit_view().can_reset);
    editing
}

fn nudge_first_stop(editing: &mut Editing) {
    editing
        .move_stop(0, 1)
        .or_else(|_| editing.move_stop(0, -1))
        .unwrap();
}

#[test]
fn nothing_is_fixed_in_a_new_plan_and_every_stop_has_its_limits() {
    let editing = editable();
    let view = editing.edit_view();
    assert_eq!((view.cause, view.automatic.clone()), (None, None));
    let pits = editing
        .base
        .result
        .as_ref()
        .unwrap()
        .timeline
        .clone()
        .unwrap()
        .pits;
    let bounds = fixed_stop_bounds(&editing.input, &editing.edited, &[])
        .unwrap()
        .expect("a scalar input has limits");
    assert_eq!(view.stops.len(), bounds.len());
    for ((stop, pit), bounds) in view.stops.iter().zip(&pits).zip(&bounds) {
        assert_eq!(stop.fixed, StrategyStopFixed::default());
        assert_eq!(stop.pit_seconds, pit.pit_seconds, "the time of that stop");
        let StrategyStopLimits::Exact { fuel, ve } = &stop.limits else {
            panic!("exact limits");
        };
        // this car has no virtual energy
        assert_eq!(*ve, StrategyAmountLimits::Unused);
        let StrategyAmountLimits::Used {
            arrival,
            range,
            issue,
            fail_lap,
        } = fuel
        else {
            panic!("fuel is in use");
        };
        // the numbers are those of the crate, and the amount of the plan is inside
        let service = bounds.fuel.service.expect("a feasible plan has a range");
        let range = range.as_ref().unwrap();
        assert_eq!(range.min.as_f64(), Some(service.min));
        assert_eq!(range.max.as_f64(), Some(service.max));
        let arrives = bounds.fuel.arrival.unwrap();
        let arrival = arrival.as_ref().unwrap();
        assert_eq!(arrival.min.as_f64(), Some(arrives.min));
        assert_eq!(arrival.max.as_f64(), Some(arrives.max));
        let planned = pit.fuel_liters.as_f64().unwrap();
        assert!(service.min <= planned && planned <= service.max);
        assert_eq!((*issue, *fail_lap), (None, None));
    }
}

#[test]
fn a_car_with_virtual_energy_has_limits_for_it_too() {
    let editing = calculate(manual(RACE, true)).2.expect("a feasible plan");
    let view = editing.edit_view();
    assert_ne!(view.stops.len(), 0, "the case needs a stop");
    for stop in &view.stops {
        let StrategyStopLimits::Exact {
            ve: StrategyAmountLimits::Used { range, .. },
            ..
        } = &stop.limits
        else {
            panic!("energy limits: {:?}", stop.limits);
        };
        let range = range.as_ref().unwrap();
        let planned = stop.ve_percent.as_f64().unwrap();
        assert!(range.min.as_f64().unwrap() <= planned && planned <= range.max.as_f64().unwrap());
    }
}

#[test]
fn fixing_an_amount_keeps_it_in_the_session_and_leaves_the_plan_pending() {
    let mut editing = roomy();
    let before = editing.plan_view(Some(1));
    let (index, amount, _) = a_stop_with_room(&editing);
    let at = usize::try_from(index).unwrap();
    editing.set_stop_service(index, Some(amount), None, None).unwrap();
    assert!(editing.pending());
    let view = editing.plan_view(Some(1));
    assert_eq!(view.state, StrategyPlanState::Edited);
    assert_eq!(view.result, before.result, "the plan on screen stays");
    let edit = view.edit.unwrap();
    assert!(edit.can_reset);
    let mut expected = vec![None; edit.stops.len()];
    expected[at] = Some(amount);
    assert_eq!(fixed_fuel(&editing), expected);
    assert_eq!(edit.stops[at].fixed.ve_percent, None);
    // what "automatic" shows is still the amount of the plan
    let old = &before.edit.as_ref().unwrap().stops[at];
    assert_eq!(edit.stops[at].fuel_liters, old.fuel_liters);
    assert_eq!(fuel_limits(&edit.stops[at]).1, None, "inside its limits");
    // the limits of a stop do not depend on what is fixed in it
    assert_eq!(fuel_limits(&edit.stops[at]).0, fuel_limits(old).0);
    // the time in the pits follows the fixed amount at once: at most the litre
    // of difference at the refuelling rate, and never the other way
    let rate = editing.input.pit_cost.refuel_rate_l_per_s.value;
    let delta = edit.stops[at].pit_seconds.as_f64().unwrap() - old.pit_seconds.as_f64().unwrap();
    let litres = amount - old.fuel_liters.as_f64().unwrap();
    assert!(
        delta.abs() <= (litres / rate).abs() + 1e-9 && delta * litres >= 0.0,
        "{delta} s for {litres} L"
    );
    // nothing was moved, so the automatic plan of this schedule is the one before
    let automatic = edit.automatic.expect("the plan with nothing fixed");
    let result = before.result.as_ref().unwrap();
    assert_eq!(
        automatic.total_seconds,
        result.metrics.as_ref().unwrap().total_seconds
    );
    assert_eq!(
        automatic.fuel_finish_liters,
        result.timeline.as_ref().unwrap().fuel_finish_liters
    );
    // fixing the same again changes nothing; back to automatic clears it
    editing.set_stop_service(index, Some(amount), None, None).unwrap();
    assert_eq!(fixed_fuel(&editing), expected);
    editing.set_stop_service(index, None, None, None).unwrap();
    assert_eq!(fixed_fuel(&editing), vec![None; expected.len()]);
    assert_eq!(
        editing.edit_view().automatic,
        None,
        "nothing fixed, nothing to compare"
    );
    assert!(
        editing.pending(),
        "like a stop moved back: the edit stays pending"
    );
}

#[test]
fn an_amount_the_calculation_cannot_take_is_refused_with_its_reason_and_neighbours() {
    let mut editing = editable();
    let refusal = |amount, reason, below: Option<f64>, above: Option<f64>| {
        Err(HostError::StrategyInvalidStopService {
            amount,
            reason,
            below: below.and_then(Number::from_f64),
            above: above.and_then(Number::from_f64),
        })
    };
    let fuel = StrategyStopAmount::FuelLiters;
    let off_grid = StrategyStopServiceReason::OffGrid;
    let above_capacity = StrategyStopServiceReason::AboveCapacity;
    let negative = StrategyStopServiceReason::Negative;
    // the tank holds 12 L and the calculation loads whole litres
    for (value, reason, below, above) in [
        (7.5, off_grid, Some(7.0), Some(8.0)),
        (11.25, off_grid, Some(11.0), Some(12.0)),
        (0.000_4, off_grid, Some(0.0), Some(1.0)),
        (12.5, above_capacity, Some(12.0), None),
        (90.0, above_capacity, Some(12.0), None),
        (f64::MAX, above_capacity, Some(12.0), None),
        (f64::INFINITY, above_capacity, Some(12.0), None),
        (-1.0, negative, None, Some(0.0)),
        (-0.5, negative, None, Some(0.0)),
        (f64::NEG_INFINITY, negative, None, Some(0.0)),
        (f64::NAN, negative, None, Some(0.0)),
    ] {
        assert_eq!(
            editing.set_stop_service(0, Some(value), None, None),
            refusal(fuel, reason, below, above),
            "{value}"
        );
    }
    // this car has no virtual energy: not even zero can be fixed
    for value in [0.0, 50.0, -1.0] {
        assert_eq!(
            editing.set_stop_service(0, None, Some(value), None),
            refusal(
                StrategyStopAmount::VePercent,
                StrategyStopServiceReason::NotInUse,
                None,
                None
            ),
            "{value}"
        );
    }
    // fuel is checked before energy, and a refusal of either fixes nothing
    assert_eq!(
        editing.set_stop_service(0, Some(7.5), Some(50.0), None),
        refusal(fuel, off_grid, Some(7.0), Some(8.0))
    );
    assert!(editing.set_stop_service(0, Some(7.0), Some(50.0), None).is_err());
    assert_eq!(
        fixed_fuel(&editing),
        vec![None; editing.edit_view().stops.len()]
    );
    assert!(!editing.pending());
    // a stop that does not exist
    let count = u32::try_from(editing.edit_view().stops.len()).unwrap();
    for index in [count, u32::MAX] {
        assert_eq!(
            editing.set_stop_service(index, Some(7.0), None, None),
            Err(HostError::Rejected)
        );
    }
    // the edges are valid: nothing and a full tank (whether a plan exists is
    // what the limits say, not a refusal)
    editing.set_stop_service(0, Some(0.0), None, None).unwrap();
    editing.set_stop_service(0, Some(12.0), None, None).unwrap();
    // a number a rounding away from the grid is the number of the grid
    editing
        .set_stop_service(0, Some(0.1 + 0.2 + 6.7), None, None)
        .unwrap();
    assert_eq!(fixed_fuel(&editing)[0], Some(7.0));
    editing.set_stop_service(0, Some(-0.0), None, None).unwrap();
    assert_eq!(
        serde_json::to_string(&editing.edit_view().stops[0].fixed.fuel_liters).unwrap(),
        "0.0"
    );
}

#[test]
fn with_virtual_energy_its_amount_is_checked_on_its_own_grid() {
    let mut editing = calculate(manual(RACE, true)).2.expect("a feasible plan");
    editing.set_stop_service(0, None, Some(97.0), None).unwrap();
    assert_eq!(
        editing.edit_view().stops[0].fixed.ve_percent,
        Number::from_f64(97.0)
    );
    assert_eq!(
        editing.set_stop_service(0, None, Some(103.0), None),
        Err(HostError::StrategyInvalidStopService {
            amount: StrategyStopAmount::VePercent,
            reason: StrategyStopServiceReason::AboveCapacity,
            below: Number::from_f64(100.0),
            above: None,
        })
    );
    assert_eq!(
        editing.set_stop_service(0, None, Some(96.5), None),
        Err(HostError::StrategyInvalidStopService {
            amount: StrategyStopAmount::VePercent,
            reason: StrategyStopServiceReason::OffGrid,
            below: Number::from_f64(96.0),
            above: Number::from_f64(97.0),
        })
    );
    assert_eq!(
        editing.edit_view().stops[0].fixed.ve_percent,
        Number::from_f64(97.0),
        "a refusal keeps the last valid amount"
    );
}

#[test]
fn a_valid_amount_outside_its_limits_is_kept_and_the_view_says_what_happens() {
    let mut editing = roomy();
    let (index, _, (min, max)) = a_stop_with_room(&editing);
    let at = usize::try_from(index).unwrap();
    assert!(min >= 1.0, "the case needs room below the least amount");
    // too little: the lap it runs out in comes with it
    editing
        .set_stop_service(index, Some(min - 1.0), None, None)
        .unwrap();
    let stop = editing.edit_view().stops[at].clone();
    let (range, issue, fail_lap) = fuel_limits(&stop);
    assert_eq!(
        range,
        Some((min, max)),
        "the limits do not move with the amount"
    );
    assert_eq!(issue, Some(StrategyAmountIssue::BelowMin));
    let lap = fail_lap.expect("a lap: without a reserve it runs out on track");
    assert!(stop.lap < lap && lap <= RACE, "after this stop: {lap}");
    // the crate says the same, and so does the recalculation
    let bounds = fixed_stop_bounds(&editing.input, &editing.edited, &editing.fixed)
        .unwrap()
        .unwrap();
    assert_eq!(
        bounds[at].fuel.problem,
        Some(FixedProblem::BelowMin {
            fail_lap: Some(lap)
        })
    );
    assert!(!run(&mut editing), "no plan with too little");
    // too much, when the tank leaves room above the most
    if max < 12.0 {
        editing
            .set_stop_service(index, Some(max + 1.0), None, None)
            .unwrap();
        let (range, issue, fail_lap) = fuel_limits(&editing.edit_view().stops[at]);
        assert_eq!(range, Some((min, max)));
        assert_eq!(
            (issue, fail_lap),
            (Some(StrategyAmountIssue::AboveMax), None)
        );
        assert!(!run(&mut editing), "no plan with too much");
    }
    // the two ends of the limits do have a plan
    for amount in [min, max] {
        editing.set_stop_service(index, Some(amount), None, None).unwrap();
        assert_eq!(fuel_limits(&editing.edit_view().stops[at]).1, None);
        assert!(run(&mut editing), "{amount} L is inside the limits");
    }
}

#[test]
fn recalculating_keeps_what_is_fixed_and_the_plan_says_which_amounts_are_fixed() {
    let mut editing = roomy();
    let automatic = editing.plan_view(Some(1));
    let (index, amount, _) = a_stop_with_room(&editing);
    let at = usize::try_from(index).unwrap();
    editing.set_stop_service(index, Some(amount), None, None).unwrap();
    assert!(run(&mut editing));
    let view = editing.plan_view(Some(2));
    assert_ne!(view.state, StrategyPlanState::Edited);
    let timeline = view.result.as_ref().unwrap().timeline.as_ref().unwrap();
    for (stop, pit) in timeline.pits.iter().enumerate() {
        assert_eq!(pit.pinned.fuel_liters, stop == at, "stop {stop}");
        assert!(!pit.pinned.ve_percent && !pit.pinned.change_tyres);
    }
    assert_eq!(timeline.pits[at].fuel_liters.as_f64(), Some(amount));
    // the edit keeps it fixed, and the recalculated plan is the new base
    let edit = view.edit.as_ref().unwrap();
    assert_eq!(fixed_fuel(&editing)[at], Some(amount));
    assert!(!edit.can_reset);
    assert_eq!(edit.cause, None);
    assert_eq!(edit.stops[at].pit_seconds, timeline.pits[at].pit_seconds);
    // the comparison is with the plan that had nothing fixed
    let before = automatic.result.as_ref().unwrap().metrics.as_ref().unwrap();
    assert_eq!(
        edit.automatic.as_ref().unwrap().total_seconds,
        before.total_seconds
    );
    // "Restablecer" returns to the last feasible plan, with what was fixed in it
    editing.set_stop_service(index, None, None, None).unwrap();
    nudge_first_stop(&mut editing);
    editing.reset();
    assert_eq!(editing.plan_view(Some(2)), view);
    assert_eq!(fixed_fuel(&editing)[at], Some(amount));
    // "Volver todo a automático" is what clears it
    editing.clear_stop_services();
    assert!(editing.pending());
    assert_eq!(fixed_fuel(&editing), vec![None; edit.stops.len()]);
    assert!(run(&mut editing));
    let cleared = editing.plan_view(Some(3));
    assert_eq!(cleared.result, automatic.result, "the automatic plan again");
    assert_eq!(cleared.edit.unwrap().automatic, None);
    editing.clear_stop_services();
    assert!(!editing.pending(), "nothing to clear changes nothing");
}

#[test]
fn with_nothing_fixed_the_recalculation_is_the_one_of_the_schedule_alone() {
    let mut editing = editable();
    nudge_first_stop(&mut editing);
    let job = editing.job();
    let done = job(&AtomicBool::new(false)).unwrap();
    let (outcome, fallback) = vantare_strategy::application::recalculate_edited_plan_detailed(
        &editing.input,
        &editing.edited,
        &AtomicBool::new(false),
    )
    .unwrap();
    let expected = project_with(&editing.input, &outcome, "Pilot", true, fallback).unwrap();
    assert_eq!(done.view, expected);
    assert_eq!(done.unreachable_stop, None);
}

#[test]
fn a_fixed_amount_no_plan_respects_names_its_stop_until_the_edit_changes() {
    let mut editing = roomy();
    let base = editing.plan_view(Some(1));
    // an empty load in a stop that needs one
    let (index, _, (min, _)) = a_stop_with_room(&editing);
    assert!(min > 0.0);
    editing.set_stop_service(index, Some(0.0), None, None).unwrap();
    assert!(!run(&mut editing));
    let view = editing.plan_view(Some(2));
    let edit = view.edit.as_ref().unwrap();
    assert_eq!(
        edit.cause,
        Some(StrategyEditCause::FixedAmountUnreachable { stop: index })
    );
    assert_eq!(edit.error, None, "the recalculation ran: this is its answer");
    let result = view.result.as_ref().unwrap();
    assert!(result.metrics.is_none() && result.timeline.is_none());
    assert!(edit.can_reset);
    assert_eq!(
        fixed_fuel(&editing)[usize::try_from(index).unwrap()],
        Some(0.0)
    );
    // any change of the edit is a new question
    editing.set_stop_service(index, Some(min), None, None).unwrap();
    assert_eq!(editing.edit_view().cause, None);
    // and so is a reset, which returns to the plan that had nothing fixed
    editing.set_stop_service(index, Some(0.0), None, None).unwrap();
    assert!(!run(&mut editing));
    assert!(editing.edit_view().cause.is_some());
    editing.reset();
    assert_eq!(editing.plan_view(Some(1)), base);
}

#[test]
fn a_schedule_without_a_plan_names_no_stop_when_nothing_fixed_is_to_blame() {
    let mut editing = roomy();
    let (index, amount, _) = a_stop_with_room(&editing);
    editing.set_stop_service(index, Some(amount), None, None).unwrap();
    // stretch a stint beyond the tank: the schedule has no plan whatever is fixed
    let stops = editing.edit_view().stops;
    let (stretched, stop) = stops
        .iter()
        .enumerate()
        .max_by_key(|(_, stop)| stop.max_lap - stop.lap)
        .unwrap();
    editing
        .move_boundary(u32::try_from(stretched).unwrap(), stop.max_lap)
        .unwrap();
    assert_eq!(
        editing.edit_view().automatic,
        None,
        "another schedule: nothing to compare with"
    );
    assert!(!run(&mut editing));
    assert_eq!(editing.edit_view().cause, None);
}

#[test]
fn a_step_the_calculation_coarsens_has_no_limits() {
    let mut editing = editable();
    editing.input.discretization.fuel_liters = 0.01; // 1.200 levels: the extended search
    assert!(vantare_strategy::solver::runs_extended_search(
        &editing.input
    ));
    for stop in editing.edit_view().stops {
        assert_eq!(stop.limits, StrategyStopLimits::Unavailable);
    }
}

#[test]
fn the_wire_names_of_what_is_fixed_are_the_documented_ones() {
    let mut editing = roomy();
    let (index, _, (min, _)) = a_stop_with_room(&editing);
    editing
        .set_stop_service(index, Some(min - 1.0), None, None)
        .unwrap();
    let json = serde_json::to_value(editing.edit_view()).unwrap();
    let stop = &json["stops"][usize::try_from(index).unwrap()];
    assert_eq!(
        stop["fixed"],
        serde_json::json!({"fuelLiters": min - 1.0, "vePercent": null, "changeTyres": null})
    );
    assert_eq!(stop["limits"]["kind"], "exact");
    assert_eq!(stop["limits"]["ve"], serde_json::json!({"kind": "unused"}));
    let fuel = &stop["limits"]["fuel"];
    assert_eq!(
        fuel.as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>(),
        ["kind", "arrival", "range", "issue", "failLap"]
            .map(String::from)
            .into()
    );
    assert_eq!(fuel["kind"], "used");
    assert_eq!(fuel["issue"], "belowMin");
    assert!(fuel["failLap"].is_u64());
    assert!(fuel["range"]["min"].is_number() && fuel["arrival"]["max"].is_number());
    assert_eq!(
        serde_json::to_value(StrategyStopLimits::Unavailable).unwrap(),
        serde_json::json!({"kind": "unavailable"})
    );
    assert_eq!(
        serde_json::to_value(StrategyEditCause::FixedAmountUnreachable { stop: 1 }).unwrap(),
        serde_json::json!({"kind": "fixedAmountUnreachable", "stop": 1})
    );
    assert_eq!(
        serde_json::to_value(StrategyAmountIssue::ALL).unwrap(),
        serde_json::json!(["belowMin", "aboveMax", "noRange"])
    );
    let error = serde_json::to_value(HostError::StrategyInvalidStopService {
        amount: StrategyStopAmount::VePercent,
        reason: StrategyStopServiceReason::AboveCapacity,
        below: Number::from_f64(100.0),
        above: None,
    })
    .unwrap();
    assert_eq!(
        error,
        serde_json::json!({
            "kind": "strategyInvalidStopService",
            "amount": "vePercent",
            "reason": "aboveCapacity",
            "below": 100.0,
            "above": null
        })
    );
    assert_eq!(
        serde_json::to_value(StrategyStopServiceReason::ALL).unwrap(),
        serde_json::json!(["negative", "aboveCapacity", "offGrid", "notInUse"])
    );
}

// ---------------------------------------------------------------------------
// Tyres kept or changed by hand in a stop (E5h, #2743).
// ---------------------------------------------------------------------------

type Tyres = (Option<u32>, u32, u32, Option<StrategyTyreIssue>);

/// `roomy()` (stints 5-5-5-5-4) with tyres that last `life` laps (0: no limit)
/// and lose `wear` seconds per lap of age. A stop costs its 25 s of transit and,
/// side by side, the 30 s of the tyres and at most 3 s of fuel.
fn with_tyres(life: f64, wear: f64) -> Editing {
    let mut input = manual(RACE, false);
    input.tyre_life_laps.value = life;
    input.degradation_per_lap_seconds.value = wear;
    let mut editing = calculate(input).2.expect("a feasible plan");
    for (index, lap) in [(0, 5), (1, 10), (2, 15), (3, 20)] {
        editing.move_boundary(index, lap).unwrap();
    }
    assert!(run(&mut editing), "five laps fit the tank and the tyres");
    editing
}

fn tyres(editing: &Editing) -> Vec<Tyres> {
    editing
        .edit_view()
        .stops
        .iter()
        .map(|stop| {
            let tyres = &stop.tyres;
            (
                tyres.life_laps,
                tyres.arrival_laps,
                tyres.kept_laps,
                tyres.issue,
            )
        })
        .collect()
}

fn fixed_tyres(editing: &Editing) -> Vec<Option<bool>> {
    editing
        .edit_view()
        .stops
        .iter()
        .map(|stop| stop.fixed.change_tyres)
        .collect()
}

fn keep(editing: &mut Editing, index: u32) {
    editing
        .set_stop_service(index, None, None, Some(false))
        .unwrap();
}

fn seconds(stop: &StrategyEditStop) -> f64 {
    stop.pit_seconds.as_f64().unwrap()
}

#[test]
fn keeping_the_tyres_stays_in_the_session_and_the_view_counts_their_laps() {
    let mut editing = with_tyres(10.0, 0.0);
    let before = editing.plan_view(Some(1));
    let fresh: Tyres = (Some(10), 5, 10, None);
    let last: Tyres = (Some(10), 5, 9, None);
    assert_eq!(tyres(&editing), [fresh, fresh, fresh, last]);
    assert_eq!(fixed_tyres(&editing), [None; 4]);
    keep(&mut editing, 1);
    assert!(editing.pending());
    let view = editing.plan_view(Some(1));
    assert_eq!(view.state, StrategyPlanState::Edited);
    assert_eq!(view.result, before.result, "the plan on screen stays");
    assert_eq!(fixed_tyres(&editing), [None, Some(false), None, None]);
    // ten laps on tyres that last ten: they fit, and the next stop gets them
    // with ten laps on. What a stop says does not depend on what is fixed in it.
    assert_eq!(
        tyres(&editing),
        [fresh, fresh, (Some(10), 10, 15, None), last]
    );
    // the view is the crate's count, stop by stop
    let counted = fixed_stop_tyres(&editing.input, &editing.edited, &editing.fixed).unwrap();
    let edit = view.edit.unwrap();
    for (stop, counted) in edit.stops.iter().zip(&counted) {
        assert_eq!(stop.tyres, stop_tyres(counted));
    }
    // the time in the pits follows at once: the 30 s of the tyres are not paid,
    // only the transit and the refuelling
    let old = &before.edit.as_ref().unwrap().stops[1];
    let rate = editing.input.pit_cost.refuel_rate_l_per_s.value;
    assert!((seconds(old) - 55.0).abs() < 1e-6, "{}", seconds(old));
    let refuelling = old.fuel_liters.as_f64().unwrap() / rate;
    assert!((seconds(&edit.stops[1]) - 25.0 - refuelling).abs() < 1e-6);
    assert!(edit.automatic.is_some(), "something is fixed: there is a plan to compare with");
    // «change them» is fixed too, and is what the calculation does anyway
    editing
        .set_stop_service(1, None, None, Some(true))
        .unwrap();
    assert_eq!(fixed_tyres(&editing)[1], Some(true));
    assert_eq!(tyres(&editing), [fresh, fresh, fresh, last]);
    assert!((seconds(&editing.edit_view().stops[1]) - 55.0).abs() < 1e-6);
    editing.set_stop_service(1, None, None, None).unwrap();
    assert_eq!(fixed_tyres(&editing), [None; 4]);
    assert_eq!(editing.edit_view().automatic, None);
    // stating «automatic» where it already is changes nothing
    let mut untouched = with_tyres(10.0, 0.0);
    untouched.set_stop_service(0, None, None, None).unwrap();
    assert!(!untouched.pending());
}

#[test]
fn tyres_that_would_not_last_are_kept_marked_and_named_when_there_is_no_plan() {
    let mut editing = with_tyres(9.0, 0.0);
    keep(&mut editing, 1);
    let beyond = Some(StrategyTyreIssue::BeyondLife);
    assert_eq!(tyres(&editing)[1], (Some(9), 5, 10, beyond));
    assert_eq!(editing.edit_view().cause, None, "nothing was recalculated");
    assert!(!run(&mut editing), "ten laps on tyres that last nine");
    let edit = editing.edit_view();
    assert_eq!(
        edit.cause,
        Some(StrategyEditCause::FixedAmountUnreachable { stop: 1 })
    );
    assert_eq!(tyres(&editing)[1].3, beyond);
    assert_eq!(fuel_limits(&edit.stops[1]).1, None, "the fuel has no say");
    // one lap less in the next stint (5-5-4-6-4) and they last: moving a stop
    // is a new question, and its answer is another
    editing.move_boundary(2, 14).unwrap();
    assert_eq!(editing.edit_view().cause, None);
    assert_eq!(tyres(&editing)[1], (Some(9), 5, 9, None));
    assert!(run(&mut editing));
    let view = editing.plan_view(Some(2));
    let timeline = view.result.as_ref().unwrap().timeline.as_ref().unwrap();
    for (stop, pit) in timeline.pits.iter().enumerate() {
        assert_eq!(pit.change_tyres, stop != 1, "stop {stop}");
        assert_eq!(pit.pinned.change_tyres, stop == 1, "stop {stop}");
        assert!(!pit.pinned.fuel_liters && !pit.pinned.ve_percent);
    }
    let edit = view.edit.as_ref().unwrap();
    assert_eq!(edit.cause, None);
    assert_eq!(edit.stops[1].pit_seconds, timeline.pits[1].pit_seconds);
    // left to the calculation again the stop fits new tyres, and its time says
    // so at once: the 55 s of a stop that changes them, as in the automatic plan
    editing.set_stop_service(1, None, None, None).unwrap();
    assert!((seconds(&editing.edit_view().stops[1]) - 55.0).abs() < 1e-6);
    // «Restablecer» returns to this plan with its tyres kept
    editing.reset();
    assert_eq!(editing.plan_view(Some(2)), view);
    assert_eq!(fixed_tyres(&editing)[1], Some(false));
}

#[test]
fn tyres_and_fuel_fixed_in_the_same_stop_are_both_carried_by_the_plan() {
    let mut editing = with_tyres(10.0, 0.0);
    let automatic = editing.plan_view(Some(1));
    let (index, amount, limits) = a_stop_with_room(&editing);
    let at = usize::try_from(index).unwrap();
    editing
        .set_stop_service(index, Some(amount), None, Some(false))
        .unwrap();
    let stop = editing.edit_view().stops[at].clone();
    assert_eq!(fuel_limits(&stop).0, Some(limits), "the tyres do not move the fuel");
    assert!(run(&mut editing));
    let view = editing.plan_view(Some(2));
    let timeline = view.result.as_ref().unwrap().timeline.as_ref().unwrap();
    for (stop, pit) in timeline.pits.iter().enumerate() {
        let fixed = stop == at;
        assert_eq!(pit.change_tyres, !fixed, "stop {stop}");
        assert_eq!(
            (pit.pinned.fuel_liters, pit.pinned.change_tyres),
            (fixed, fixed),
            "stop {stop}"
        );
        assert!(!pit.pinned.ve_percent);
    }
    assert_eq!(timeline.pits[at].fuel_liters.as_f64(), Some(amount));
    // the request states the whole stop: the same amount with the tyres left to
    // the calculation takes them back to automatic
    editing
        .set_stop_service(index, Some(amount), None, None)
        .unwrap();
    assert_eq!(fixed_tyres(&editing)[at], None);
    assert_eq!(fixed_fuel(&editing)[at], Some(amount));
    editing.reset();
    assert_eq!(fixed_tyres(&editing)[at], Some(false));
    // «Volver todo a automático» clears the tyres as well
    editing.clear_stop_services();
    assert!(editing.pending());
    assert_eq!(fixed_tyres(&editing), [None; 4]);
    assert!(run(&mut editing));
    assert_eq!(editing.plan_view(Some(3)).result, automatic.result);
}

// With a loss per lap of age, the plan that keeps the tyres pays it: the time
// of the plan is the one the replay of the crate gives for that very plan.
#[test]
fn the_plan_that_keeps_tyres_pays_their_wear_as_the_crate_replays_it() {
    use super::super::accepted::{decision, pit_decision};
    use vantare_strategy::solver::replay_decision_v2_with_resources;
    let mut editing = with_tyres(10.0, 0.5);
    let total = |view: &StrategyPlanView| {
        let metrics = view.result.as_ref().unwrap().metrics.as_ref().unwrap();
        metrics.total_seconds.as_f64().unwrap()
    };
    let automatic = total(&editing.plan_view(Some(1)));
    keep(&mut editing, 0);
    assert!(run(&mut editing));
    let view = editing.plan_view(Some(2));
    let timeline = view.result.as_ref().unwrap().timeline.as_ref().unwrap();
    let pits: Vec<_> = timeline.pits.iter().map(pit_decision).collect();
    let replay = replay_decision_v2_with_resources(
        &editing.input,
        &decision(&lengths(&editing), &pits),
        timeline.fuel_start_liters.as_f64().unwrap(),
        timeline.ve_start_percent.as_f64().unwrap(),
    )
    .unwrap();
    assert!(replay.feasible, "{:?}", replay.reasons);
    assert!((replay.evaluation.total_seconds - total(&view)).abs() < 1e-6);
    // stints of 5-5-5-5-4 on new tyres lose 0.5 × (10 + 10 + 10 + 10 + 6); the
    // second one, on tyres five laps old, loses 0.5 × 5 × 5 more
    assert!((replay.evaluation.degradation_seconds - 35.5).abs() < 1e-6);
    // and it is still the faster plan: it saves most of the 30 s of the tyres
    assert!(total(&view) < automatic, "{} vs {automatic}", total(&view));
}

// When the schedule has no plan with nothing fixed, a stop that keeps its tyres
// may still be marked, but the recalculation names no stop: the schedule is to
// blame, and the tyres are not blamed for it.
#[test]
fn a_schedule_without_a_plan_of_its_own_does_not_blame_the_tyres() {
    let mut editing = with_tyres(10.0, 0.0);
    editing.input.tyre_life_laps.value = 4.0; // every stint of five laps is too long
    keep(&mut editing, 0);
    assert_eq!(
        tyres(&editing)[0],
        (Some(4), 5, 10, Some(StrategyTyreIssue::BeyondLife))
    );
    assert!(!run(&mut editing));
    assert_eq!(editing.edit_view().cause, None);
}

// A step the calculation coarsens has no limits and names no stop, but the
// tyres do not depend on the grid: they are counted all the same.
#[test]
fn a_step_the_calculation_coarsens_still_counts_the_tyres_and_names_no_stop() {
    let mut editing = with_tyres(9.0, 0.0);
    editing.input.discretization.fuel_liters = 0.01;
    editing.input.budget.max_candidates = 2_000;
    assert!(vantare_strategy::solver::runs_extended_search(
        &editing.input
    ));
    keep(&mut editing, 1);
    assert_eq!(
        editing.edit_view().stops[1].limits,
        StrategyStopLimits::Unavailable
    );
    assert_eq!(
        tyres(&editing)[1],
        (Some(9), 5, 10, Some(StrategyTyreIssue::BeyondLife))
    );
    assert!(!run(&mut editing));
    assert_eq!(editing.edit_view().cause, None);
}

// Host and solver agree. Over every way of fixing the tyres of the four stops,
// with a fuel amount inside or below its limits in one of them, the marks of
// the view say «there is a plan» exactly when the recalculation gives one; and
// with only tyres fixed, the stop it blames is the first one marked.
#[test]
fn the_marks_of_the_view_say_there_is_a_plan_exactly_when_the_recalculation_gives_one() {
    let options = [None, Some(true), Some(false)];
    let (mut plans, mut by_tyres, mut by_fuel, mut by_both) = (0, 0, 0, 0);
    for life in [0.0, 9.0, 10.0, 14.0, 15.0] {
        let mut editing = with_tyres(life, 0.0);
        let (with_fuel, _, (min, _)) = a_stop_with_room(&editing);
        assert!(min >= 1.0, "the case needs room below the least amount");
        for code in 0..81_usize {
            for fuel in [None, Some(min), Some(min - 1.0)] {
                for (stop, index) in (0..4_u32).enumerate() {
                    let amount = fuel.filter(|_| index == with_fuel);
                    let change = options[code / 3_usize.pow(index) % 3];
                    editing
                        .set_stop_service(index, amount, None, change)
                        .unwrap_or_else(|error| panic!("stop {stop}: {error:?}"));
                }
                let stops = editing.edit_view().stops;
                let marked = stops.iter().position(|stop| stop.tyres.issue.is_some());
                let short = stops.iter().any(|stop| fuel_limits(stop).1.is_some());
                let context = format!("life {life}, tyres {code}, fuel {fuel:?}");
                assert_eq!(run(&mut editing), marked.is_none() && !short, "{context}");
                if fuel.is_none() {
                    let blamed = marked
                        .and_then(|stop| u32::try_from(stop).ok())
                        .map(|stop| StrategyEditCause::FixedAmountUnreachable { stop });
                    assert_eq!(editing.edit_view().cause, blamed, "{context}");
                }
                match (marked.is_some(), short) {
                    (false, false) => plans += 1,
                    (true, false) => by_tyres += 1,
                    (false, true) => by_fuel += 1,
                    (true, true) => by_both += 1,
                }
            }
        }
    }
    assert!(
        plans > 100 && by_tyres > 100 && by_fuel > 50 && by_both > 50,
        "{plans} plans, {by_tyres} by the tyres, {by_fuel} by the fuel, {by_both} by both"
    );
}

#[test]
fn the_wire_names_of_the_tyres_are_the_documented_ones() {
    let mut editing = with_tyres(9.0, 0.0);
    keep(&mut editing, 1);
    let json = serde_json::to_value(editing.edit_view()).unwrap();
    assert_eq!(
        json["stops"][1]["fixed"],
        serde_json::json!({"fuelLiters": null, "vePercent": null, "changeTyres": false})
    );
    assert_eq!(
        json["stops"][1]["tyres"],
        serde_json::json!({"lifeLaps": 9, "arrivalLaps": 5, "keptLaps": 10, "issue": "beyondLife"})
    );
    assert_eq!(
        serde_json::to_value(&with_tyres(0.0, 0.0).edit_view().stops[3].tyres).unwrap(),
        serde_json::json!({"lifeLaps": null, "arrivalLaps": 5, "keptLaps": 9, "issue": null})
    );
    assert_eq!(
        serde_json::to_value(StrategyTyreIssue::ALL).unwrap(),
        serde_json::json!(["beyondLife"])
    );
}
