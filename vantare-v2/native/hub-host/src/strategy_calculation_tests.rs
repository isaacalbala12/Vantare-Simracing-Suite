#![allow(clippy::unwrap_used)]
use super::*;
use std::sync::mpsc;
use vantare_strategy::solver::Input;

fn fuji() -> Input {
    let mut input: Input =
        serde_json::from_str(include_str!("../../strategy/testdata/fuji-1450-input.json")).unwrap();
    input.budget.p95_millis = 2_000;
    input.budget.max_candidates = 250_000;
    input
}

fn scalar() -> Input {
    let mut input = fuji();
    input.extra.clear();
    input.budget.p95_millis = 60_000; // the candidate limit, not the clock, ends the search
    input
}

fn view_of(input: Input) -> (SolverOutcome, StrategyPlanView) {
    let prepared = application::prepare_manual(input).unwrap();
    let outcome =
        application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false)).unwrap();
    let view = project(prepared.input(), &outcome, "Pilot").unwrap();
    (outcome, view)
}

#[test]
fn fuji_reports_the_grid_passed_to_the_solver_and_the_returned_laps() {
    let mut input = fuji();
    input.budget.p95_millis = 60_000; // the candidate limit, not the clock, ends the search
    let (outcome, view) = view_of(input);
    assert_eq!(view.state, StrategyPlanState::Partial);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NotProven));
    assert_eq!(result.steps.fuel_liters, Number::from_f64(1.0));
    assert_eq!(result.steps.ve_percent, Number::from_f64(1.0));
    assert!(!result.degraded, "the grid equals the requested steps");
    let metrics = result.metrics.unwrap();
    assert_eq!(metrics.laps, 236);
    assert_eq!(metrics.pit_count, 5);
    assert_eq!(outcome.result.stints.iter().sum::<u32>(), 236);
    let timeline = result.timeline.unwrap();
    assert_eq!(timeline.stints.len(), 6);
    assert_eq!(timeline.pits.len(), 5);
    assert_eq!(timeline.stints[0].from_lap, 1);
    assert_eq!(timeline.stints.last().unwrap().to_lap, 236);
}

#[test]
fn a_resource_without_a_grid_reports_a_null_step() {
    let mut input = scalar();
    input.race_laps = 3;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    let (_, view) = view_of(input);
    let result = view.result.unwrap();
    assert_eq!(result.steps.fuel_liters, Number::from_f64(1.0));
    assert_eq!(result.steps.ve_percent, None);
    assert!(
        !result.degraded,
        "a resource without a grid is never degraded"
    );
}

#[test]
fn solver_unit_rounding_alone_is_not_degradation() {
    let mut input = scalar();
    input.race_laps = 3;
    input.discretization.fuel_liters = 1.000_000_4;
    input.discretization.ve_percent = 0.0; // the solver default is one
    let (_, view) = view_of(input);
    assert!(!view.result.unwrap().degraded);
}

#[test]
fn the_field_names_are_the_28_wire_names_of_the_form() {
    use std::collections::BTreeSet;
    let inputs: StrategySolverFields = serde_json::from_value(serde_json::json!({
        "basePaceSeconds": "", "fuelPerLapLiters": "", "raceLaps": "",
        "veCapacityPercent": "", "vePerLapPercent": "", "tyreLifeLaps": "",
        "degradationSeconds": "", "refuelRate": "", "veRate": "",
        "tyreServiceSeconds": "", "formationSeconds": "", "fuelStep": "",
        "veStep": "", "reserveLaps": "", "serviceMode": ""
    }))
    .unwrap();
    let form = serde_json::to_value(StrategyComputeForm {
        fields: StrategyFields::default(),
        inputs,
    })
    .unwrap();
    let wire: BTreeSet<String> = ["fields", "inputs"]
        .iter()
        .flat_map(|group| form[group].as_object().unwrap().keys().cloned())
        .collect();
    let named: BTreeSet<String> = StrategyField::ALL
        .iter()
        .map(|field| {
            serde_json::to_value(field)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect();
    assert_eq!(wire.len(), 28);
    assert_eq!(named, wire);
    assert_eq!(ManualField::ALL.len(), 28);
}

#[test]
fn a_partial_search_without_a_complete_plan_has_no_certificate_or_plan() {
    let mut input = scalar();
    input.race_laps = 100;
    input.budget.max_candidates = 1;
    let (outcome, view) = view_of(input);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    assert!(!outcome.result.feasible);
    assert_eq!(view.state, StrategyPlanState::Partial);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, None);
    assert!(result.metrics.is_none() && result.timeline.is_none());
}

#[test]
fn an_impossible_race_reports_no_solution_without_a_plan() {
    let mut input = scalar();
    input.race_laps = 5;
    input.fuel_capacity_liters.value = 1.0; // less than one lap of fuel
    let (outcome, view) = view_of(input);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NoSolution);
    assert_eq!(view.state, StrategyPlanState::Calculated);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NoSolution));
    assert!(result.metrics.is_none() && result.timeline.is_none());
    assert_eq!(result.steps.fuel_liters, Number::from_f64(1.0));
}

#[test]
fn a_plan_with_more_stops_than_the_timeline_limit_keeps_its_metrics() {
    let mut input = scalar();
    input.race_laps = 30;
    input.fuel_capacity_liters.value = 4.0; // two laps per tank: 24 stops
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    let (outcome, view) = view_of(input);
    assert!(outcome.result.feasible);
    let result = view.result.unwrap();
    let metrics = result.metrics.unwrap();
    assert!(usize::try_from(metrics.pit_count).unwrap() > STRATEGY_PIT_LIMIT);
    assert_eq!(metrics.laps, 30);
    assert!(result.timeline.is_none());
}

#[test]
fn the_grid_reports_coarsening_and_solver_unit_rounding() {
    let mut input = fuji();
    input.extra.clear();
    input.race_laps = 3;
    input.discretization.fuel_liters = 0.1;
    input.discretization.ve_percent = 0.100_000_04;
    let prepared = application::prepare_manual(input).unwrap();
    let outcome =
        application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false)).unwrap();
    let first = project(prepared.input(), &outcome, "Pilot").unwrap();
    let repeated =
        application::calculate(&prepared, SourceStatus::Open, &AtomicBool::new(false)).unwrap();
    assert_eq!(
        first,
        project(prepared.input(), &repeated, "Pilot").unwrap()
    );
    let result = first.result.unwrap();
    assert_eq!(result.steps.fuel_liters, Number::from_f64(0.8));
    assert_eq!(result.steps.ve_percent, Number::from_f64(0.8));
    assert!(result.degraded, "both steps are coarser than requested");
    assert!(outcome.certificate.proof.unwrap().discretization_degraded);
}

#[test]
fn cancellation_does_not_reuse_the_worker_slot_or_publish_a_late_result() {
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    let (cancelled, observed) = mpsc::sync_channel(1);
    let mut calculation = Calculation::default();
    calculation
        .start(move |cancel| {
            ready.send(()).unwrap();
            wait.recv().unwrap();
            cancelled.send(cancel.load(Ordering::Relaxed)).unwrap();
            Ok((
                Document::empty("2026-11-18T00:00:00Z").unwrap(),
                StrategyPlanView {
                    state: StrategyPlanState::Calculated,
                    ..StrategyPlanView::default()
                },
            ))
        })
        .unwrap();
    started.recv().unwrap();
    assert_eq!(calculation.view().state, StrategyPlanState::Calculating);
    assert!(calculation.poll().is_none());
    calculation.invalidate(false);
    assert_eq!(calculation.start(|_| unreachable!()), Err(HostError::Busy));
    release.send(()).unwrap();
    assert!(observed.recv().unwrap());
    assert!(calculation.finish().is_none());
    assert_eq!(calculation.view().state, StrategyPlanState::Uncalculated);
    assert!(!calculation.running());
}

#[test]
fn dropping_a_calculation_requests_cancellation_and_joins_its_worker() {
    let (ready, started) = mpsc::sync_channel(1);
    let mut calculation = Calculation::default();
    let stopped = Arc::new(AtomicBool::new(false));
    let did_stop = stopped.clone();
    calculation
        .start(move |cancel| {
            ready.send(()).unwrap();
            while !cancel.load(Ordering::Relaxed) {
                std::thread::yield_now();
            }
            did_stop.store(true, Ordering::Release);
            Err(StrategyPlanError::Failed.into())
        })
        .unwrap();
    started.recv().unwrap();
    drop(calculation);
    assert!(stopped.load(Ordering::Acquire));
}
