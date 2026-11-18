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
}

// ---- E4a: the closed reason of a partial or infeasible result

/// What the host sees of a real calculation: the crate's typed account of it.
fn detailed(input: Input) -> (application::Calculation, StrategyPlanView) {
    let prepared = application::prepare_manual(input).unwrap();
    let calculation =
        application::calculate_detailed(&prepared, SourceStatus::Open, &AtomicBool::new(false))
            .unwrap();
    let view = project_calculated(prepared.input(), &calculation, "Pilot").unwrap();
    (calculation, view)
}

const REFUSALS: [solver::GreedyRefusal; 6] = [
    solver::GreedyRefusal::NotScalar,
    solver::GreedyRefusal::ResourceTooSmall,
    solver::GreedyRefusal::MaxStops,
    solver::GreedyRefusal::MinStops,
    solver::GreedyRefusal::WindowUnreachable,
    solver::GreedyRefusal::ServiceGrid,
];

fn fallbacks() -> Vec<application::Fallback> {
    let mut all = vec![application::Fallback::NotApplicable, application::Fallback::Applied];
    all.extend(REFUSALS.map(application::Fallback::Refused));
    all
}

#[test]
fn the_reason_is_mapped_from_the_typed_account_of_the_crate() {
    use OptimalityStatus::{NoSolution, NotProven, Proven};
    use StrategyReason::{
        ConstraintsUnsatisfiable, FineGridNoFallback, NoFeasiblePlan, SearchBudgetExhausted,
    };
    for fallback in fallbacks() {
        for constrained in [false, true] {
            // proven: nothing to explain
            assert_eq!(reason_of(Proven, fallback, constrained), None);
            // a complete search that found nothing, whatever the fallback says
            assert_eq!(
                reason_of(NoSolution, fallback, constrained),
                Some(if constrained {
                    ConstraintsUnsatisfiable
                } else {
                    NoFeasiblePlan
                }),
                "{fallback:?} {constrained}"
            );
            // the search did not finish: the budget, but for a grid the greedy
            // plan could not follow (#2635)
            let expected = if fallback
                == application::Fallback::Refused(solver::GreedyRefusal::NotScalar)
            {
                FineGridNoFallback
            } else {
                SearchBudgetExhausted
            };
            assert_eq!(
                reason_of(NotProven, fallback, constrained),
                Some(expected),
                "{fallback:?} {constrained}"
            );
        }
    }
}

#[test]
fn a_reason_always_agrees_with_the_certificate() {
    use OptimalityStatus::{NoSolution, NotProven, Proven};
    use StrategyReason::{
        ConstraintsUnsatisfiable, FineGridNoFallback, NoFeasiblePlan, SearchBudgetExhausted,
    };
    for status in [Proven, NotProven, NoSolution] {
        for fallback in fallbacks() {
            for constrained in [false, true] {
                let allowed: &[StrategyReason] = match status {
                    Proven => &[],
                    NotProven => &[SearchBudgetExhausted, FineGridNoFallback],
                    NoSolution => &[ConstraintsUnsatisfiable, NoFeasiblePlan],
                };
                match reason_of(status, fallback, constrained) {
                    None => assert!(allowed.is_empty(), "{status:?} needs a reason"),
                    Some(reason) => assert!(
                        allowed.contains(&reason),
                        "{status:?} {fallback:?} cannot be {reason:?}"
                    ),
                }
            }
        }
    }
}

#[test]
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
    assert!(
        serde_json::from_value::<StrategyReason>(serde_json::json!("initialLoadNotProven"))
            .is_err()
    );
}

#[test]
fn a_partial_plan_of_the_search_names_the_budget() {
    let mut input = fuji();
    input.budget.p95_millis = 60_000;
    let (calculation, view) = detailed(input);
    assert_eq!(calculation.fallback, application::Fallback::NotApplicable);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NotProven));
    assert_eq!(result.reason, Some(StrategyReason::SearchBudgetExhausted));
}

#[test]
fn a_plan_of_the_greedy_seed_is_not_proven_and_names_the_budget() {
    // A small tank and a budget of one candidate: the search ends without a plan
    // and the seed's plan is shown, never as proven (#2628).
    let mut input = scalar();
    input.race_laps = 100;
    input.fuel_capacity_liters.value = 40.0;
    input.budget.max_candidates = 1;
    let (calculation, view) = detailed(input);
    assert_eq!(calculation.fallback, application::Fallback::Applied);
    assert_eq!(calculation.route, application::CalculationRoute::Greedy);
    assert!(calculation.outcome.result.feasible);
    assert_eq!(view.state, StrategyPlanState::Partial);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NotProven));
    assert_eq!(result.reason, Some(StrategyReason::SearchBudgetExhausted));
    assert!(result.metrics.is_some());
}

#[test]
fn a_search_without_a_plan_whose_fallback_refused_for_the_rules_names_the_budget() {
    let mut input = scalar();
    input.race_laps = 100;
    input.budget.max_candidates = 1;
    input.event_rules.max_pit_stops = Some(1); // 100 laps need two stops
    let (calculation, view) = detailed(input);
    assert_eq!(
        calculation.fallback,
        application::Fallback::Refused(solver::GreedyRefusal::MaxStops)
    );
    let result = view.result.unwrap();
    assert_eq!(result.certificate, None);
    assert_eq!(result.reason, Some(StrategyReason::SearchBudgetExhausted));
}

#[test]
fn a_grid_too_fine_for_the_budget_and_no_plan_is_its_own_reason() {
    // #2635: 0.25 L steps on a 90-litre tank are more than 200 levels; the seed
    // does not act on a coarsened grid, so there is nothing to fall back to.
    let mut input = scalar();
    input.race_laps = 100;
    input.fuel_capacity_liters.value = 90.0;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    input.discretization.fuel_liters = 0.25;
    input.budget.max_candidates = 1;
    let (calculation, view) = detailed(input);
    assert_eq!(
        calculation.fallback,
        application::Fallback::Refused(solver::GreedyRefusal::NotScalar)
    );
    assert_eq!(calculation.outcome.certificate.status, OptimalityStatus::NotProven);
    assert!(!calculation.outcome.result.feasible);
    let result = view.result.unwrap();
    assert!(result.degraded);
    assert_eq!(result.certificate, None);
    assert_eq!(result.reason, Some(StrategyReason::FineGridNoFallback));
}

#[test]
fn an_impossible_race_says_there_is_no_feasible_plan() {
    let mut input = scalar();
    input.race_laps = 5;
    input.fuel_capacity_liters.value = 1.0;
    let (calculation, view) = detailed(input);
    assert_eq!(calculation.fallback, application::Fallback::NotApplicable);
    assert_eq!(
        view.result.unwrap().reason,
        Some(StrategyReason::NoFeasiblePlan)
    );
}

#[test]
fn a_coarsened_grid_with_no_solution_reports_the_steps_it_proved_it_on() {
    // "No plan" is proven on the effective steps; the same result carries them
    // and `degraded`, so the claim is never stronger than what was searched.
    let mut input = scalar();
    input.race_laps = 5;
    input.fuel_capacity_liters.value = 90.0;
    input.fuel_per_lap_liters.value = 200.0; // a lap does not fit the tank
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    input.discretization.fuel_liters = 0.25;
    let (_, view) = detailed(input);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::NoSolution));
    assert!(result.degraded);
    assert!(result.steps.fuel_liters.is_some());
    assert_eq!(result.reason, Some(StrategyReason::NoFeasiblePlan));
}

#[test]
fn event_rules_nothing_satisfies_name_the_constraints() {
    let mut input = scalar();
    input.race_laps = 5;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    input.event_rules.min_pit_stops = Some(8); // more stops than laps
    let (calculation, view) = detailed(input);
    assert_eq!(calculation.outcome.certificate.status, OptimalityStatus::NoSolution);
    assert_eq!(
        view.result.unwrap().reason,
        Some(StrategyReason::ConstraintsUnsatisfiable)
    );
}

#[test]
fn a_proven_plan_has_no_reason_and_only_unproven_results_have_one() {
    let mut input = scalar();
    input.race_laps = 3;
    let (_, view) = detailed(input);
    let result = view.result.unwrap();
    assert_eq!(result.certificate, Some(StrategyCertificate::Proven));
    assert_eq!(result.reason, None);
    assert_eq!(
        serde_json::to_value(&result).unwrap()["reason"],
        serde_json::Value::Null
    );
    // every result the host builds: a reason exactly when it is not proven, and
    // one of the values its certificate allows
    for (laps, candidates, tank) in [(3, 250_000, 80.0), (100, 1, 40.0), (5, 250_000, 1.0)] {
        let mut input = scalar();
        input.race_laps = laps;
        input.budget.max_candidates = candidates;
        input.fuel_capacity_liters.value = tank;
        let result = detailed(input).1.result.unwrap();
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
