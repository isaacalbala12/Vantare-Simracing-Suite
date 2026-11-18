//! Manual bridge: when the scalar search runs out of budget without a plan, a
//! deterministic greedy plan is returned, never a proven one (#2627).
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use serde_json::{Value, json};
use vantare_strategy::application::{
    CalculationRoute, SourceStatus, calculate_with_route, prepare_manual,
};
use vantare_strategy::solver::{
    GreedyRefusal, Input, OptimalityStatus, ResultV2, SolverOutcome, Window, runs_extended_search,
    solve_greedy_fallback, solve_v2_cancellable,
};

/// The manual bridge input: the Fuji fixture without `extra`, with the manual
/// budget (2 s, 250.000 candidates, 1.000.000 iterations).
fn manual(laps: u32, ve: bool) -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("frozen Fuji input");
    input.extra.clear();
    input.race_laps = laps;
    input.budget.p95_millis = 2_000;
    input.budget.max_candidates = 250_000;
    input.budget.max_iterations = 1_000_000;
    if !ve {
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
    }
    input
}

fn window(lap: u32) -> Window {
    Window {
        from_lap: lap,
        to_lap: lap,
    }
}

/// Everything the wire can see, without the clock-dependent proof duration.
fn stable(outcome: &SolverOutcome) -> Value {
    let mut value = serde_json::to_value(outcome).expect("serializable outcome");
    if let Some(duration) = value.pointer_mut("/certificate/proof/durationMillis") {
        *duration = Value::Null;
    }
    value
}

fn run(input: Input) -> (SolverOutcome, CalculationRoute) {
    let prepared = prepare_manual(input).expect("valid input");
    calculate_with_route(&prepared, SourceStatus::Open, &AtomicBool::new(false)).expect("outcome")
}

fn reserve(value: &Value, per_lap: f64) -> f64 {
    match value["kind"].as_str().unwrap_or("") {
        "laps" => value["laps"]["value"].as_f64().expect("laps") * per_lap,
        "amount" => value["amount"]["value"].as_f64().expect("amount"),
        _ => 0.0,
    }
}

/// Independent verifier: walks the plan and checks every rule. It shares no
/// code with the solver.
fn verify(input: &Input, result: &ResultV2) {
    // The solver rounds each per-lap consumption to 1e-6: up to that error per lap.
    let eps = 1e-6 * f64::from(input.race_laps);
    assert!(result.feasible, "a plan was expected");
    assert_eq!(result.stints.iter().sum::<u32>(), input.race_laps, "laps");
    assert_eq!(result.pit_stops.len() + 1, result.stints.len(), "stops");
    assert!(result.stints.iter().all(|&laps| laps > 0), "empty stint");
    let mut completed = 0;
    for (index, stint) in result.stints.iter().enumerate() {
        completed += stint;
        if let Some(stop) = result.pit_stops.get(index) {
            assert_eq!(stop.lap, completed, "stop {index} lap");
            assert!(stop.lap < input.race_laps, "a stop at the finish");
        }
        if input.tyre_life_laps.value > 0.0 {
            assert!(
                f64::from(*stint) <= input.tyre_life_laps.value,
                "tyres stint {index}"
            );
        }
    }
    let rules = &input.event_rules;
    let stops = result.pit_stops.len();
    assert!(rules.min_pit_stops.is_none_or(|n| stops >= n), "min stops");
    assert!(rules.max_pit_stops.is_none_or(|n| stops <= n), "max stops");
    for w in &rules.required_windows {
        assert!(
            result
                .pit_stops
                .iter()
                .any(|s| (w.from_lap..=w.to_lap).contains(&s.lap)),
            "window {}..{} not met",
            w.from_lap,
            w.to_lap
        );
    }
    let fuel_serviced: Vec<f64> = result.pit_stops.iter().map(|s| s.fuel_liters).collect();
    let ve_serviced: Vec<f64> = result.pit_stops.iter().map(|s| s.ve_percent).collect();
    for (name, capacity, per_lap, start, remaining, reserve_value, serviced) in [
        (
            "fuel",
            input.fuel_capacity_liters.value,
            input.fuel_per_lap_liters.value,
            result.fuel_start_liters,
            result.fuel_remaining_liters,
            &input.fuel_reserve,
            fuel_serviced,
        ),
        (
            "ve",
            input.ve_capacity_percent.value,
            input.ve_per_lap_percent.value,
            result.ve_start_percent,
            result.ve_remaining_percent,
            &input.virtual_energy_reserve,
            ve_serviced,
        ),
    ] {
        if capacity == 0.0 {
            assert!(serviced.iter().all(|&s| s == 0.0), "{name} without a tank");
            continue;
        }
        assert!(start <= capacity + eps, "{name} start above capacity");
        let mut level = start;
        for (index, stint) in result.stints.iter().enumerate() {
            level -= f64::from(*stint) * per_lap;
            assert!(level >= -eps, "{name} runs dry in stint {index}");
            if let Some(added) = serviced.get(index) {
                level += added;
                assert!(level <= capacity + eps, "{name} overfilled at stop {index}");
            }
        }
        assert!(
            level >= reserve(reserve_value, per_lap) - eps,
            "{name} reserve not kept"
        );
        assert!((level - remaining).abs() < 1e-3, "{name} remaining");
    }
    let pit = &input.pit_cost;
    let mut total = input.formation.seconds.value;
    for stint in &result.stints {
        let n = f64::from(*stint);
        total += n * input.base_lap_seconds.value
            + input.degradation_per_lap_seconds.value * n * (n - 1.0) / 2.0;
    }
    for stop in &result.pit_stops {
        let fuel = stop.fuel_liters / pit.refuel_rate_l_per_s.value;
        let ve = stop.ve_percent / pit.ve_rate_p_per_s.value;
        let service = if pit.service_mode == "parallel" {
            fuel.max(ve).max(pit.tyre_seconds.value)
        } else {
            fuel + ve + pit.tyre_seconds.value
        };
        total += pit.transit_seconds.value + service;
    }
    assert!(
        (total - result.expected.total_seconds).abs() < 1e-3,
        "total {total} vs {}",
        result.expected.total_seconds
    );
}

// (b) Where the scalar search already ends with a plan or a proven answer,
// nothing changes.
#[test]
fn scalar_results_are_identical_to_the_scalar_solver() {
    let mut cases = vec![manual(20, false), manual(40, false), manual(40, true)];
    let mut impossible = manual(5, false);
    impossible.fuel_capacity_liters.value = 1.0; // less than one lap of fuel
    cases.push(impossible);
    for (index, input) in cases.into_iter().enumerate() {
        let expected = solve_v2_cancellable(&input, &AtomicBool::new(false)).expect("scalar");
        let (outcome, route) = run(input);
        assert_eq!(route, CalculationRoute::Scalar, "case {index}");
        assert_eq!(stable(&outcome), stable(&expected), "case {index}");
    }
}

#[test]
fn an_input_with_extra_dimensions_never_gets_the_greedy_plan() {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("frozen Fuji input");
    input.budget.p95_millis = 2_000;
    input.budget.max_candidates = 250_000;
    assert_eq!(
        solve_greedy_fallback(&input).expect_err("extended input"),
        GreedyRefusal::NotScalar
    );
    let expected = solve_v2_cancellable(&input, &AtomicBool::new(false)).expect("extended");
    let (outcome, route) = run(input);
    assert_eq!(route, CalculationRoute::Scalar);
    assert_eq!(stable(&outcome), stable(&expected));
}

// The fallback: the scalar search exhausts its budget without a plan and a
// valid plan comes back, honestly unproven.
#[test]
fn long_races_with_virtual_energy_get_a_valid_unproven_plan() {
    for laps in [240, 480, 960] {
        let input = manual(laps, true);
        let started = Instant::now();
        let (outcome, route) = run(input.clone());
        assert!(started.elapsed().as_millis() < 2_000, "{laps} laps");
        assert_eq!(route, CalculationRoute::Greedy, "{laps} laps");
        assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
        assert!(
            outcome.certificate.proof.is_none(),
            "{laps}: no bound claimed"
        );
        assert!(outcome.certificate.reason.is_some(), "{laps}: reason");
        assert_eq!(
            outcome.cost_seconds,
            Some(outcome.result.expected.total_seconds)
        );
        verify(&input, &outcome.result);
    }
}

#[test]
fn long_races_without_virtual_energy_get_a_valid_unproven_plan() {
    for laps in [60, 160, 240] {
        let input = manual(laps, false);
        let (outcome, route) = run(input.clone());
        assert_eq!(route, CalculationRoute::Greedy, "{laps} laps");
        assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
        verify(&input, &outcome.result);
    }
}

// (c) The constraints "Recalcular" fixes: stop count and exact windows.
#[test]
fn the_greedy_plan_keeps_the_recalculate_schedule() {
    let stints = [40, 35, 41, 30, 40, 38, 16];
    let mut input = manual(240, true);
    let mut lap = 0;
    let mut stops = vec![];
    for stint in &stints[..stints.len() - 1] {
        lap += stint;
        stops.push(lap);
    }
    input.event_rules.min_pit_stops = Some(stops.len());
    input.event_rules.max_pit_stops = Some(stops.len());
    input.event_rules.required_windows = stops.iter().map(|&lap| window(lap)).collect();
    let outcome = solve_greedy_fallback(&input).expect("feasible schedule");
    assert_eq!(outcome.result.stints, stints);
    assert_eq!(
        outcome
            .result
            .pit_stops
            .iter()
            .map(|s| s.lap)
            .collect::<Vec<_>>(),
        stops
    );
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    verify(&input, &outcome.result);
}

#[test]
fn windows_and_stop_limits_are_met() {
    // A window inside the first stint adds a stop where it asks for one.
    let mut input = manual(240, true);
    input.event_rules.required_windows = vec![Window {
        from_lap: 10,
        to_lap: 12,
    }];
    let outcome = solve_greedy_fallback(&input).expect("window plan");
    verify(&input, &outcome.result);
    // At least four stops in a short race.
    let mut input = manual(40, true);
    input.event_rules.min_pit_stops = Some(4);
    let outcome = solve_greedy_fallback(&input).expect("min stops plan");
    assert!(outcome.result.pit_stops.len() >= 4);
    verify(&input, &outcome.result);
}

// Never a plan that breaks a constraint: refuse, with the cause.
#[test]
fn an_unmeetable_constraint_is_refused_with_its_cause() {
    let mut input = manual(240, true);
    input.event_rules.max_pit_stops = Some(3); // 240 laps need five
    assert_eq!(
        solve_greedy_fallback(&input).expect_err("too few stops"),
        GreedyRefusal::MaxStops
    );

    // One stop at lap 100 means a 100-lap first stint; a tank covers 43.
    let mut input = manual(240, true);
    input.event_rules.min_pit_stops = Some(1);
    input.event_rules.max_pit_stops = Some(1);
    input.event_rules.required_windows = vec![window(100)];
    assert_eq!(
        solve_greedy_fallback(&input).expect_err("stint too long"),
        GreedyRefusal::MaxStops
    );

    let mut input = manual(5, true);
    input.event_rules.min_pit_stops = Some(10);
    assert_eq!(
        solve_greedy_fallback(&input).expect_err("too many stops"),
        GreedyRefusal::MinStops
    );

    let mut input = manual(240, true);
    input.fuel_capacity_liters.value = 1.0; // less than one lap
    assert_eq!(
        solve_greedy_fallback(&input).expect_err("no lap fits"),
        GreedyRefusal::ResourceTooSmall
    );
}

#[test]
fn the_bridge_never_returns_a_plan_that_breaks_the_event_rules() {
    let mut input = manual(240, true);
    input.event_rules.max_pit_stops = Some(3);
    let (outcome, _) = run(input);
    assert!(!outcome.result.feasible);
    assert_ne!(outcome.certificate.status, OptimalityStatus::Proven);
}

// (d) Determinism, independent of the clock.
#[test]
fn the_greedy_plan_is_the_same_every_time_and_ignores_the_clock() {
    let (first, route) = run(manual(240, true));
    assert_eq!(route, CalculationRoute::Greedy);
    for p95 in [2_000, 2_000, 60_000] {
        let mut input = manual(240, true);
        input.budget.p95_millis = p95;
        let (again, _) = run(input);
        assert_eq!(
            stable(&again)["result"],
            stable(&first)["result"],
            "p95 {p95}"
        );
    }
}

#[test]
fn the_fallback_is_instant_and_never_proven() {
    let input = manual(960, true);
    let started = Instant::now();
    let outcome = solve_greedy_fallback(&input).expect("plan");
    assert!(
        started.elapsed().as_millis() < 50,
        "{:?}",
        started.elapsed()
    );
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
}

// Limits that Fuji alone never reaches (its tyres, 43 laps, bind before the
// tank, 44, and the battery, 43, and the reserve never tightens).
fn plain(laps: u32) -> Input {
    let mut input = manual(laps, false);
    input.tyre_life_laps.value = 0.0;
    input
}

fn plan_of(input: &Input) -> ResultV2 {
    let outcome = solve_greedy_fallback(input).expect("a plan");
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    verify(input, &outcome.result);
    outcome.result
}

#[test]
fn a_small_tank_is_what_limits_the_stints() {
    let mut input = plain(100);
    input.fuel_capacity_liters.value = 30.0; // 16 laps of 1.83 L; the tyres do not limit
    let result = plan_of(&input);
    assert_eq!(result.stints[0], 16);
    assert!(result.stints.iter().all(|&laps| laps <= 16));
    assert!(result.pit_stops.len() <= 16);
}

#[test]
fn the_battery_is_what_limits_the_stints() {
    let mut input = manual(100, true);
    input.tyre_life_laps.value = 0.0;
    input.ve_per_lap_percent.value = 5.0; // 20 laps of battery; the tank covers 44
    let result = plan_of(&input);
    assert_eq!(result.stints[0], 20);
    assert!(result.stints.iter().all(|&laps| laps <= 20));
}

#[test]
fn the_tyres_are_what_limits_the_stints_when_they_are_the_shortest() {
    let mut input = manual(100, true);
    input.tyre_life_laps.value = 10.0;
    let result = plan_of(&input);
    assert!(result.stints.iter().all(|&laps| laps <= 10));
    assert_eq!(result.stints[0], 10);
}

#[test]
fn the_reserve_forces_a_stop_the_plain_reach_would_not() {
    // 20 L cover 10 laps of 1.83 L, but two laps of reserve must remain: a
    // 10-lap race fits the tank (reach) and not the reserve (final reach).
    let mut input = plain(10);
    input.fuel_capacity_liters.value = 20.0;
    input.fuel_reserve["laps"]["value"] = json!(2.0);
    let result = plan_of(&input);
    assert!(!result.pit_stops.is_empty(), "the reserve needs a stop");
    // No stop sits on the final lap, and the last stint is not empty.
    assert!(result.pit_stops.last().expect("a stop").lap < 10);
}

#[test]
fn the_battery_reserve_forces_a_stop_too() {
    let mut input = manual(40, true);
    input.tyre_life_laps.value = 0.0;
    input.ve_per_lap_percent.value = 2.4; // 41 laps of battery, 1.5 laps of reserve below
    input.virtual_energy_reserve["laps"]["value"] = json!(1.5);
    let result = plan_of(&input);
    assert_eq!(result.pit_stops.len().min(1), 1, "the reserve needs a stop");
}

#[test]
fn degradation_formation_and_sequential_service_are_priced() {
    for mode in ["parallel", "sequential"] {
        let mut input = manual(120, true);
        input.degradation_per_lap_seconds.value = 0.07;
        input.formation.seconds.value = 12.5;
        input.pit_cost.service_mode = mode.into();
        plan_of(&input);
    }
}

// The reach of an input with no tank, no battery and no tyre limit is unbounded:
// the next stop must not overflow adding it to the lap count.
#[test]
fn an_unbounded_reach_does_not_overflow() {
    let mut input = plain(50);
    input.fuel_capacity_liters.value = 0.0;
    input.fuel_per_lap_liters.value = 0.0;
    input.ve_capacity_percent.value = 0.0;
    input.ve_per_lap_percent.value = 0.0;
    input.event_rules.required_windows = vec![Window {
        from_lap: 10,
        to_lap: 12,
    }];
    let result = plan_of(&input);
    assert_eq!(
        result.pit_stops.iter().map(|s| s.lap).collect::<Vec<_>>(),
        [12]
    );
}

// A partial scalar plan (not proven, but a plan) is the scalar answer.
#[test]
fn a_partial_scalar_plan_is_never_replaced_by_the_greedy_one() {
    let input = manual(40, true);
    let scalar = solve_v2_cancellable(&input, &AtomicBool::new(false)).expect("scalar");
    assert_eq!(scalar.certificate.status, OptimalityStatus::NotProven);
    assert!(scalar.result.feasible, "the scalar search ends with a plan");
    let (outcome, route) = run(input);
    assert_eq!(route, CalculationRoute::Scalar);
    assert_eq!(stable(&outcome), stable(&scalar));
    assert_eq!(
        outcome.certificate.reason.as_deref(),
        Some("candidate_budget_exhausted")
    );
}

// Property: deterministic generated inputs. Every plan passes the independent
// verifier; every refusal names a cause. A mutated tank, battery, reserve,
// window, tyre or timing rule fails here without running it by hand.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }

    /// A value in `low..=high`.
    fn range(&mut self, low: u64, high: u64) -> u64 {
        low + self.next() % (high - low + 1)
    }

    /// A value in tenths, `low / 10 ..= high / 10`.
    #[allow(clippy::cast_precision_loss)]
    fn tenths(&mut self, low: u64, high: u64) -> f64 {
        self.range(low, high) as f64 / 10.0
    }
}

fn generated(rng: &mut Lcg) -> Input {
    let laps = u32::try_from(rng.range(1, 400)).expect("laps");
    let mut input = manual(laps, true);
    input.fuel_capacity_liters.value = rng.tenths(50, 1_200);
    input.fuel_per_lap_liters.value = rng.tenths(5, 40);
    if rng.range(0, 2) == 0 {
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
    } else {
        input.ve_capacity_percent.value = rng.tenths(200, 1_000);
        input.ve_per_lap_percent.value = rng.tenths(5, 80);
    }
    #[allow(clippy::cast_precision_loss)]
    {
        input.tyre_life_laps.value = if rng.range(0, 2) == 0 {
            0.0
        } else {
            rng.range(5, 80) as f64
        };
    }
    let reserve = rng.tenths(0, 30);
    if reserve > 0.0 {
        input.fuel_reserve["laps"]["value"] = json!(reserve);
        input.virtual_energy_reserve["laps"]["value"] = json!(reserve / 2.0);
    } else {
        input.fuel_reserve = json!({});
        input.virtual_energy_reserve = json!({});
    }
    input.formation.seconds.value = rng.tenths(0, 300);
    input.degradation_per_lap_seconds.value = rng.tenths(0, 2) / 10.0;
    input.pit_cost.service_mode = if rng.range(0, 1) == 0 {
        "parallel"
    } else {
        "sequential"
    }
    .into();
    if input.race_laps >= 2 {
        let laps = u64::from(input.race_laps);
        for _ in 0..rng.range(0, 3) {
            let from = rng.range(1, laps - 1);
            let to = (from + rng.range(0, 6)).min(laps - 1);
            input.event_rules.required_windows.push(Window {
                from_lap: u32::try_from(from).expect("lap"),
                to_lap: u32::try_from(to).expect("lap"),
            });
        }
    }
    if rng.range(0, 3) == 0 {
        let min = usize::try_from(rng.range(0, 4)).expect("stops");
        input.event_rules.min_pit_stops = Some(min);
        if rng.range(0, 1) == 0 {
            let spread = usize::try_from(rng.range(0, 6)).expect("stops");
            input.event_rules.max_pit_stops = Some(min + spread);
        }
    } else if rng.range(0, 2) == 0 {
        input.event_rules.max_pit_stops = Some(usize::try_from(rng.range(0, 8)).expect("stops"));
    }
    input
}

#[test]
fn every_generated_plan_passes_the_independent_verifier() {
    let mut rng = Lcg(0x5eed_2627);
    let (mut plans, mut refusals, mut tried) = (0, 0, 0);
    for case in 0..3_000 {
        let input = generated(&mut rng);
        if input.validate().is_err() || runs_extended_search(&input) {
            continue;
        }
        tried += 1;
        match solve_greedy_fallback(&input) {
            Ok(outcome) => {
                plans += 1;
                assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
                assert!(outcome.certificate.proof.is_none(), "case {case}");
                assert_eq!(
                    outcome.cost_seconds,
                    Some(outcome.result.expected.total_seconds)
                );
                verify(&input, &outcome.result);
                if case % 10 == 0 {
                    let again = solve_greedy_fallback(&input).expect("same input, same plan");
                    assert_eq!(stable(&again), stable(&outcome), "case {case} determinism");
                }
            }
            Err(refusal) => {
                refusals += 1;
                assert_ne!(refusal, GreedyRefusal::NotScalar, "case {case}");
            }
        }
    }
    // The generator must exercise both outcomes, or the test proves nothing.
    assert!(tried > 2_000, "{tried} valid inputs");
    assert!(plans > 1_000, "{plans} plans");
    assert!(refusals > 50, "{refusals} refusals");
}
