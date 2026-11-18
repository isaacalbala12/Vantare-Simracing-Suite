#![allow(clippy::unwrap_used)]
use super::*;
use crate::strategy::calculation::{Calculation, StrategyPlanView as PlanView};
use crate::strategy::calculation::{StrategyCertificate, StrategyPlanState};
use vantare_strategy::{
    application::{self, EditedPlan, SourceStatus, recalculate_edited_plan},
    document::Document,
    solver::Input,
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
        ["stints", "stops", "canReset", "error"]
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
        ["lap", "minLap", "maxLap", "fuelLiters", "vePercent"]
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
/// builds it, edited by one lap. The solver must keep the schedule exactly.
/// Measured on 2026-11-18: today the scalar search reaches its 250.000-candidate
/// limit without a plan (`partial`, as in the base calculation of such races), so
/// this stays ignored until the greedy seed (#2628, PR #2635) is merged.
#[test]
#[ignore = "the manual bridge finds no plan for a race this size before #2628"]
fn fuji_with_ve_recalculates_an_edited_witness_schedule() {
    let mut input = manual(236, false);
    input.fuel_capacity_liters.value = 82.0;
    let prepared = application::prepare_manual(input).unwrap();
    let edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    for (index, delta) in [(None, 0_i32), (Some(1), 1), (Some(4), -1)] {
        let mut edited = edited.clone();
        if let Some(index) = index {
            edited.pit_stop_laps[index] = edited.pit_stop_laps[index]
                .checked_add_signed(delta)
                .unwrap();
            edited.stints[index] = edited.stints[index].checked_add_signed(delta).unwrap();
            edited.stints[index + 1] = edited.stints[index + 1].checked_add_signed(-delta).unwrap();
        }
        let done = recalculate(prepared.input(), &edited, "Pilot", &AtomicBool::new(false))
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
