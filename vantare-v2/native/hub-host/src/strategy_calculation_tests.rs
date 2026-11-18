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

#[test]
fn fuji_reports_the_grid_passed_to_the_solver_and_the_returned_laps() {
    let input = application::prepare_manual(fuji()).unwrap();
    let outcome =
        application::calculate(&input, SourceStatus::Open, &AtomicBool::new(false)).unwrap();
    let view = project(input.input(), &outcome, "Pilot").unwrap();
    let result = view.result.unwrap();
    assert_eq!(result.steps.fuel_liters, Number::from_f64(1.0));
    assert_eq!(result.steps.ve_percent, Number::from_f64(1.0));
    let metrics = result.metrics.unwrap();
    assert!(metrics.laps >= 236);
    let timeline = result.timeline.unwrap();
    assert_eq!(timeline.stints.len(), outcome.result.stints.len());
    assert_eq!(timeline.pits.len(), outcome.result.pit_stops.len());
    assert_eq!(timeline.stints.last().unwrap().to_lap, metrics.laps);
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
    let result = project(prepared.input(), &outcome, "Pilot")
        .unwrap()
        .result
        .unwrap();
    assert_eq!(result.steps.fuel_liters, Number::from_f64(0.8));
    assert_eq!(result.steps.ve_percent, Number::from_f64(0.8));
    assert!(outcome.certificate.proof.unwrap().discretization_degraded);
}

#[test]
fn cancellation_does_not_reuse_the_worker_slot_or_publish_a_late_result() {
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    let mut calculation = Calculation::default();
    calculation
        .start(move |cancel| {
            ready.send(()).unwrap();
            wait.recv().unwrap();
            assert!(cancel.load(Ordering::Relaxed));
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
            Err(StrategyPlanError::Failed)
        })
        .unwrap();
    started.recv().unwrap();
    drop(calculation);
    assert!(stopped.load(Ordering::Acquire));
}
