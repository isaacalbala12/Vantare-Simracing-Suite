//! Measurement of "Recalcular" on the Fuji witness with virtual energy (#2648).
//! Ignored by default; run with
//! `cargo test -p vantare-strategy --release --test recalc_measure -- --include-ignored --nocapture --test-threads=1`.
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use vantare_strategy::application::{EditedPlan, recalculate_edited_plan_detailed};
use vantare_strategy::solver::{Input, Window, solve_v2_cancellable};

fn manual() -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("frozen Fuji input");
    input.extra.clear();
    input.race_laps = 236;
    input.budget.p95_millis = 60_000; // the candidate limit, not the clock, ends the search
    input.budget.max_candidates = 250_000;
    input.budget.max_iterations = 1_000_000;
    input
}

#[test]
#[ignore = "measurement"]
fn recalculating_the_fuji_witness_with_virtual_energy() {
    let edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    for repetition in 1..=3 {
        // Before: the scalar search alone on the constrained input.
        let mut constrained = manual();
        constrained.event_rules.min_pit_stops = Some(edited.pit_stop_laps.len());
        constrained.event_rules.max_pit_stops = Some(edited.pit_stop_laps.len());
        constrained.event_rules.required_windows = edited
            .pit_stop_laps
            .iter()
            .map(|&lap| Window {
                from_lap: lap,
                to_lap: lap,
            })
            .collect();
        let started = Instant::now();
        let before = solve_v2_cancellable(&constrained, &AtomicBool::new(false)).expect("scalar");
        let scalar = started.elapsed();
        // After: `recalculate_edited_plan_detailed`.
        let started = Instant::now();
        let (after, fallback) =
            recalculate_edited_plan_detailed(&manual(), &edited, &AtomicBool::new(false))
                .expect("recalculate");
        println!(
            "rep={repetition} before(scalar only)={scalar:?} status={:?} feasible={} | after={:?} status={:?} feasible={} fallback={fallback:?} stops={} race_seconds={:.1}",
            before.certificate.status,
            before.result.feasible,
            started.elapsed(),
            after.certificate.status,
            after.result.feasible,
            after.result.pit_stops.len(),
            after.result.expected.total_seconds,
        );
    }
}
