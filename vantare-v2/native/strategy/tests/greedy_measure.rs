//! Measurement of the manual bridge with the greedy fallback (#2627). Ignored by
//! default; run with
//! `cargo test -p vantare-strategy --release --test greedy_measure -- --include-ignored --nocapture`.
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use vantare_strategy::application::{SourceStatus, calculate_with_route, prepare_manual};
use vantare_strategy::solver::{Input, solve_greedy_fallback, solve_v2_cancellable};

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

#[test]
#[ignore = "measurement"]
fn manual_bridge_with_the_greedy_fallback() {
    for (laps, ve) in [
        (240, true),
        (480, true),
        (960, true),
        (60, false),
        (160, false),
        (240, false),
    ] {
        for repetition in 1..=3 {
            let prepared = prepare_manual(manual(laps, ve)).expect("valid input");
            let started = Instant::now();
            let (outcome, route) =
                calculate_with_route(&prepared, SourceStatus::Open, &AtomicBool::new(false))
                    .expect("outcome");
            let elapsed = started.elapsed();
            println!(
                "laps={laps} ve={ve} rep={repetition} total={elapsed:?} route={route:?} status={:?} feasible={} stops={} race_seconds={:.1}",
                outcome.certificate.status,
                outcome.result.feasible,
                outcome.result.pit_stops.len(),
                outcome.result.expected.total_seconds,
            );
        }
    }
}

#[test]
#[ignore = "measurement"]
fn fuji_236_greedy_against_the_extended_plan() {
    let mut extended: Input =
        serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
            .expect("frozen Fuji input");
    extended.budget.p95_millis = 2_000;
    extended.budget.max_candidates = 250_000;
    let started = Instant::now();
    let reference = solve_v2_cancellable(&extended, &AtomicBool::new(false)).expect("extended");
    println!(
        "extended with extra: {:?} feasible={} stops={} stints={:?} race_seconds={:.1} cost={:?}",
        started.elapsed(),
        reference.result.feasible,
        reference
            .result
            .best
            .as_ref()
            .map_or(0, |d| d.pit_stops.len()),
        reference
            .result
            .best
            .as_ref()
            .map(|d| d.stints.iter().map(|s| s.laps).collect::<Vec<_>>()),
        reference.result.expected.total_seconds,
        reference.cost_seconds,
    );
    let started = Instant::now();
    let greedy = solve_greedy_fallback(&manual(236, true)).expect("greedy plan");
    println!(
        "greedy 236 laps: {:?} stops={} stints={:?} race_seconds={:.1}",
        started.elapsed(),
        greedy.result.pit_stops.len(),
        greedy.result.stints,
        greedy.result.expected.total_seconds,
    );
}
