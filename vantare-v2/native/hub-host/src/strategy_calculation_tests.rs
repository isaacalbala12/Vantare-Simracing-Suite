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
    // The greedy fallback refuses too: 100 laps need two stops, one is allowed.
    input.event_rules.max_pit_stops = Some(1);
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
                None,
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

#[test]
fn a_long_race_with_virtual_energy_gets_an_unproven_plan_the_host_reports_truthfully() {
    // The scalar search used to end here as "partial, no plan"; the greedy
    // fallback now gives a plan, and the host must never present it as proven.
    let mut input = scalar();
    input.race_laps = 240;
    let (outcome, view) = view_of(input);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    assert!(outcome.certificate.proof.is_none(), "no bound is claimed");
    assert_eq!(view.state, StrategyPlanState::Partial);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NotProven));
    // Effective steps are the grid the plan was built on, and nothing was coarsened.
    assert_eq!(result.steps.fuel_liters, Number::from_f64(1.0));
    assert_eq!(result.steps.ve_percent, Number::from_f64(1.0));
    assert!(!result.degraded);
    let metrics = result.metrics.unwrap();
    assert_eq!(metrics.laps, 240);
    assert_eq!(metrics.pit_count, 5);
    assert_eq!(
        metrics.total_seconds,
        Number::from_f64(outcome.result.expected.total_seconds).unwrap()
    );
    let real = metrics.fuel_reserve_real_laps.unwrap().as_f64().unwrap();
    let required = metrics.fuel_reserve_required_laps.as_f64().unwrap();
    assert!(real >= required - 1e-3, "reserve {real} < {required}");
    let timeline = result.timeline.unwrap();
    assert_eq!(timeline.stints.len(), 6);
    assert_eq!(timeline.stints[0].from_lap, 1);
    assert_eq!(timeline.stints.last().unwrap().to_lap, 240);
    for pair in timeline.stints.windows(2) {
        assert_eq!(pair[0].to_lap + 1, pair[1].from_lap, "contiguous stints");
    }
    // Every service amount sits on the reported 1 L / 1 % grid.
    for pit in &timeline.pits {
        for amount in [&pit.fuel_liters, &pit.ve_percent] {
            let amount = amount.as_f64().unwrap();
            assert!((amount - amount.round()).abs() < 1e-6, "{amount} off grid");
// ---- E4a: the closed reason of a partial or infeasible result

#[test]
fn the_reason_is_decided_by_typed_facts_and_never_by_the_crates_text() {
    use OptimalityStatus::{NoSolution, NotProven, Proven};
    use StrategyReason::{ConstraintsUnsatisfiable, NoFeasiblePlan, SearchBudgetExhausted};
    // proven: nothing to explain, whatever else is true
    for (feasible, degraded, constrained) in [(true, false, false), (true, true, true)] {
        assert_eq!(reason_of(Proven, feasible, degraded, constrained), None);
    }
    // PROVISIONAL (completed when #2628 exposes its causes as a typed enum): every
    // result that is not proven says that the search did not finish
    for feasible in [false, true] {
        for degraded in [false, true] {
            for constrained in [false, true] {
                assert_eq!(
                    reason_of(NotProven, feasible, degraded, constrained),
                    Some(SearchBudgetExhausted),
                    "{feasible} {degraded} {constrained}"
                );
            }
        }
    }
    // complete search, nothing fits; rules or an edited schedule make it about them
    assert_eq!(
        reason_of(NoSolution, false, false, false),
        Some(NoFeasiblePlan)
    );
    assert_eq!(
        reason_of(NoSolution, false, false, true),
        Some(ConstraintsUnsatisfiable)
    );
    // on a coarsened grid the claim is relative to the effective steps, which the
    // same result reports (`steps`, `degraded`)
    assert_eq!(
        reason_of(NoSolution, false, true, false),
        Some(NoFeasiblePlan)
    );
}

#[test]
fn a_reason_always_agrees_with_the_certificate() {
    use OptimalityStatus::{NoSolution, NotProven, Proven};
    use StrategyReason::{
        ConstraintsUnsatisfiable, FineGridNoFallback, NoFeasiblePlan, SearchBudgetExhausted,
    };
    for status in [Proven, NotProven, NoSolution] {
        for feasible in [false, true] {
            for degraded in [false, true] {
                for constrained in [false, true] {
                    let reason = reason_of(status, feasible, degraded, constrained);
                    let allowed: &[StrategyReason] = match status {
                        Proven => &[],
                        NotProven => &[SearchBudgetExhausted, FineGridNoFallback],
                        NoSolution => &[ConstraintsUnsatisfiable, NoFeasiblePlan],
                    };
                    match reason {
                        None => assert!(allowed.is_empty(), "{status:?} needs a reason"),
                        Some(reason) => assert!(
                            allowed.contains(&reason),
                            "{status:?} cannot be {reason:?}"
                        ),
                    }
                }
            }
        }
    }
}

#[test]
fn a_plan_beyond_the_timeline_limit_keeps_its_summary_when_it_comes_from_the_fallback() {
    // A 24 h race with VE: the fallback must not change what the host says
    // about the grid the solver used.
    let mut input = scalar();
    input.race_laps = 960;
    let (outcome, view) = view_of(input);
    assert!(outcome.result.feasible);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NotProven));
    assert!(!result.degraded);
    assert_eq!(result.steps.fuel_liters, Number::from_f64(1.0));
    assert!(result.timeline.is_none(), "22 stops exceed the timeline limit");
    assert_eq!(result.metrics.unwrap().pit_count, 22);
fn the_reason_names_are_the_documented_wire_values() {
    assert_eq!(
        serde_json::to_value(StrategyReason::ALL).unwrap(),
        serde_json::json!([
            "searchBudgetExhausted",
            "fineGridNoFallback",
            "constraintsUnsatisfiable",
            "noFeasiblePlan"
        ])
    );
    assert!(serde_json::from_value::<StrategyReason>(serde_json::json!("initialLoadNotProven")).is_err());
}

#[test]
fn a_partial_plan_names_why_it_is_not_proven() {
    let mut input = fuji();
    input.budget.p95_millis = 60_000;
    let (_, view) = view_of(input);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NotProven));
    assert_eq!(result.reason, Some(StrategyReason::SearchBudgetExhausted));
}

#[test]
fn a_partial_search_without_a_plan_names_the_budget() {
    let mut input = scalar();
    input.race_laps = 100;
    input.budget.max_candidates = 1;
    let (_, view) = view_of(input);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, None);
    assert_eq!(result.reason, Some(StrategyReason::SearchBudgetExhausted));
}

#[test]
fn a_grid_too_fine_for_the_budget_is_reported_as_degraded_with_the_budget_reason_for_now() {
    // #2635: 0.25 L steps on a 90-litre tank are more than 200 levels. Until #2628
    // exposes why no fallback plan exists, `fineGridNoFallback` is not emitted.
    let mut input = scalar();
    input.race_laps = 100;
    input.fuel_capacity_liters.value = 90.0;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    input.discretization.fuel_liters = 0.25;
    input.budget.max_candidates = 1;
    let (outcome, view) = view_of(input);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    assert!(!outcome.result.feasible);
    let result = view.result.unwrap();
    assert!(result.degraded);
    assert_eq!(result.reason, Some(StrategyReason::SearchBudgetExhausted));
}

#[test]
fn an_impossible_race_says_there_is_no_feasible_plan() {
    let mut input = scalar();
    input.race_laps = 5;
    input.fuel_capacity_liters.value = 1.0;
    let (_, view) = view_of(input);
    assert_eq!(
        view.result.unwrap().reason,
        Some(StrategyReason::NoFeasiblePlan)
    );
}

#[test]
fn event_rules_nothing_satisfies_name_the_constraints() {
    let mut input = scalar();
    input.race_laps = 5;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    input.event_rules.min_pit_stops = Some(8); // more stops than laps
    let (outcome, view) = view_of(input);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NoSolution);
    assert_eq!(
        view.result.unwrap().reason,
        Some(StrategyReason::ConstraintsUnsatisfiable)
    );
}

#[test]
fn a_proven_plan_has_no_reason_and_only_unproven_results_have_one() {
    let mut input = scalar();
    input.race_laps = 3;
    let (_, view) = view_of(input);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::Proven));
    assert_eq!(result.reason, None);
    assert_eq!(
        serde_json::to_value(&result).unwrap()["reason"],
        serde_json::Value::Null
    );
    // every result the host builds: a reason exactly when it is not proven, and
    // one of the values its certificate allows
    for (laps, candidates) in [(3, 250_000), (100, 1), (5, 250_000)] {
        let mut input = scalar();
        input.race_laps = laps;
        input.budget.max_candidates = candidates;
        if laps == 5 {
            input.fuel_capacity_liters.value = 1.0;
        }
        let result = view_of(input).1.result.unwrap();
        assert_eq!(
            result.reason.is_some(),
            result.certificate != Some(StrategyCertificate::Proven),
            "{laps} laps"
        );
        match result.certificate {
            Some(StrategyCertificate::NoSolution) => assert!(matches!(
                result.reason,
                Some(StrategyReason::NoFeasiblePlan | StrategyReason::ConstraintsUnsatisfiable)
            )),
            Some(StrategyCertificate::NotProven) | None => assert!(matches!(
                result.reason,
                Some(StrategyReason::SearchBudgetExhausted | StrategyReason::FineGridNoFallback)
            )),
            Some(StrategyCertificate::Proven) => {}
        }
    }
}
