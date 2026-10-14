use serde_json::json;
use vantare_strategy::solver::{
    DecisionVector, Input, OptimalityStatus, PitDecision, Scalar, StintDecision,
    replay_decision_v2, solve_v2,
};

#[test]
fn fuji_six_hours_returns_a_replayable_incumbent_in_hub_budget() {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("frozen Fuji input");
    input.budget.p95_millis = 2_000;
    input.budget.max_candidates = 250_000;
    let witness: DecisionVector =
        serde_json::from_str(include_str!("../testdata/fuji-1458-witness-decision.json"))
            .expect("frozen feasible witness from #1450");
    let witness = replay_decision_v2(&input, &witness).expect("witness replay");
    assert!(witness.feasible);
    let outcome = solve_v2(&input).expect("valid input");
    assert!(outcome.result.feasible, "no incumbent within Hub budget");
    let decision = outcome.result.best.expect("feasible decision");
    let replay = replay_decision_v2(&input, &decision).expect("replay");
    assert!(replay.feasible);
    assert!(decision.stints.iter().map(|s| s.laps).sum::<u32>() >= 236);
    assert!(
        replay.evaluation.total_seconds <= witness.evaluation.total_seconds + 5.0,
        "same completed laps, at most 5 s from the feasible witness"
    );
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    assert!(
        outcome
            .certificate
            .proof
            .expect("proof")
            .lower_bound_seconds
            .is_none()
    );
}

#[test]
fn fuji_one_to_twenty_four_hours_has_valid_terminal_lap_and_reserve() {
    for hours in 1..=24 {
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
                .expect("frozen Fuji input");
        input.race_laps = hours * 40;
        input
            .extra
            .insert("raceDurationSeconds".into(), json!(hours * 3_600));
        input.budget.p95_millis = 2_000;
        input.budget.max_candidates = 1; // seed precedes enumeration, deterministically
        let outcome = solve_v2(&input).expect("valid input");
        let replay = replay_decision_v2(
            &input,
            outcome.result.best.as_ref().unwrap_or_else(|| {
                panic!("{hours} h: no incumbent, {:?}", outcome.certificate.reason)
            }),
        )
        .expect("replay");
        assert!(replay.feasible, "{hours} h: {:?}", replay.reasons);
        assert!(replay.reserve.satisfied, "{hours} h");
        assert!(replay.final_lap_start_seconds < f64::from(hours * 3_600));
        assert!(replay.evaluation.total_seconds >= f64::from(hours * 3_600));
        assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    }
}

#[test]
fn larger_iteration_budget_still_stops_at_the_retained_history_limit() {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("frozen Fuji input");
    input.budget.p95_millis = 20_000;
    input.budget.max_candidates = 100_000_000;
    input.budget.max_iterations = 1_000_000_000;
    let outcome = solve_v2(&input).expect("valid input");
    assert!(outcome.result.feasible);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    assert_eq!(
        outcome.certificate.reason.as_deref(),
        Some("frontier_memory_budget_exhausted")
    );
    assert!(!outcome.certificate.proof.expect("proof").search_completed);
}

#[test]
fn a_large_lap_ceiling_does_not_allocate_empty_frontiers_or_delay_the_seed() {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("frozen Fuji input");
    input.race_laps = 100_000; // maximum already accepted by the existing validator
    input.budget.p95_millis = 2_000;
    input.budget.max_candidates = 1;
    let outcome = solve_v2(&input).expect("valid input with a conservative lap ceiling");
    let decision = outcome.result.best.expect("seed within Hub budget");
    assert!(
        replay_decision_v2(&input, &decision)
            .expect("replay")
            .feasible
    );
}

// Independent enumeration of every partition and grid load for a tiny model.
// No production dominance, incumbent or bound is reused by this oracle.
fn exhaustive(input: &Input, d: &mut DecisionVector, lap: u32, best: &mut Option<(u32, f64)>) {
    for laps in 1..=input.race_laps - lap {
        d.stints.push(StintDecision {
            index: d.stints.len(),
            laps,
            ..StintDecision::default()
        });
        let end = lap + laps;
        if let Ok(replay) = replay_decision_v2(input, d)
            && replay.feasible
        {
            let seconds = replay.evaluation.total_seconds;
            if best.is_none_or(|(n, t)| end > n || (end == n && seconds < t)) {
                *best = Some((end, seconds));
            }
        }
        if end < input.race_laps {
            for fuel in 0..=3 {
                d.pit_stops.push(PitDecision {
                    lap: end,
                    fuel_liters: f64::from(fuel),
                    change_tyres: true,
                    ..PitDecision::default()
                });
                exhaustive(input, d, end, best);
                d.pit_stops.pop();
            }
        }
        d.stints.pop();
    }
}

#[test]
fn timed_small_optima_match_exhaustive_partitions_and_loads() {
    for duration in [5_399.999, 5_400.0, 5_400.001, 9_000.0, 9_003.0, 9_003.001] {
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
                .expect("fixture shape");
        input.race_laps = 6;
        input.base_lap_seconds = Scalar::manual(1_800.0);
        input.fuel_capacity_liters = Scalar::manual(3.0);
        input.fuel_per_lap_liters = Scalar::manual(1.0);
        input.ve_capacity_percent = Scalar::manual(0.0);
        input.ve_per_lap_percent = Scalar::manual(0.0);
        input.tyre_life_laps = Scalar::manual(6.0);
        input.fuel_reserve = serde_json::Value::Null;
        input.virtual_energy_reserve = serde_json::Value::Null;
        input.pit_cost.transit_seconds = Scalar::manual(1.0);
        input.pit_cost.refuel_rate_l_per_s = Scalar::manual(1.0);
        input.pit_cost.tyre_seconds = Scalar::manual(0.0);
        input.extra.remove("driverProfiles");
        input.extra.remove("driverSequence");
        input
            .extra
            .insert("initialFuelLiters".into(), json!(Scalar::manual(3.0)));
        input
            .extra
            .insert("initialVEPercent".into(), json!(Scalar::manual(0.0)));
        input
            .extra
            .insert("raceDurationSeconds".into(), json!(duration));
        input.budget.p95_millis = 20_000;
        let mut expected = None;
        exhaustive(&input, &mut DecisionVector::default(), 0, &mut expected);
        let expected = expected.expect("exhaustive feasible plan");
        let actual = solve_v2(&input).expect("search");
        assert_eq!(
            actual.certificate.status,
            OptimalityStatus::Proven,
            "{duration}"
        );
        assert_eq!(
            actual.result.stints.iter().sum::<u32>(),
            expected.0,
            "{duration}"
        );
        assert!(
            (actual.result.expected.total_seconds - expected.1).abs() < 1e-8,
            "{duration}"
        );
    }
}
