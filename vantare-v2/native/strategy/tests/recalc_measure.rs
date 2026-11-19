//! Measurement of "Recalcular" on the Fuji witness with virtual energy (#2648).
//! Ignored by default; run with
//! `cargo test -p vantare-strategy --release --test recalc_measure -- --include-ignored --nocapture --test-threads=1`.
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use vantare_strategy::application::{
    EditedPlan, fixed_stop_bounds, recalculate_edited_plan_detailed, recalculate_edited_plan_fixed,
};
use vantare_strategy::solver::{FixedStop, Input, Window, solve_v2_cancellable};

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

/// Medición de «Recalcular» con cantidades fijadas a mano (#2690), sobre el
/// mismo calendario de Fuji. Parte de lo que el cálculo carga solo y fija la
/// segunda parada: lo mismo, 4 L menos (la primera parada compensa: llega con
/// 3,3 L y le caben 78), 5 L menos (ya no cabe compensar) y 0 L.
#[test]
#[ignore = "measurement"]
fn recalculating_the_fuji_witness_with_fixed_amounts() {
    let edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    let (automatic, _) =
        recalculate_edited_plan_detailed(&manual(), &edited, &AtomicBool::new(false))
            .expect("recalculate");
    let second = &automatic.result.pit_stops[1];
    let pin = |fuel_liters: f64| {
        vec![
            FixedStop::default(),
            FixedStop {
                fuel_liters: Some(fuel_liters),
                ve_percent: Some(second.ve_percent),
                change_tyres: None,
            },
        ]
    };
    for (name, fixed) in [
        ("sin fijar", Vec::new()),
        ("lo mismo", pin(second.fuel_liters)),
        ("4 L menos", pin(second.fuel_liters - 4.0)),
        ("5 L menos", pin(second.fuel_liters - 5.0)),
        ("0 L", pin(0.0)),
    ] {
        for repetition in 1..=3 {
            let started = Instant::now();
            let recalculation =
                recalculate_edited_plan_fixed(&manual(), &edited, &fixed, &AtomicBool::new(false))
                    .expect("recalculate");
            println!(
                "{name} rep={repetition} total={:?} status={:?} feasible={} fallback={:?} unreachable={:?} fuel={:?} race_seconds={:.1}",
                started.elapsed(),
                recalculation.outcome.certificate.status,
                recalculation.outcome.result.feasible,
                recalculation.fallback,
                recalculation.unreachable_stop,
                recalculation
                    .outcome
                    .result
                    .pit_stops
                    .iter()
                    .map(|stop| stop.fuel_liters)
                    .collect::<Vec<_>>(),
                recalculation.outcome.result.expected.total_seconds,
            );
        }
    }
}

/// Medición de los límites de lo que se puede fijar (#2709), sobre el mismo
/// calendario de Fuji: lo que tarda `fixed_stop_bounds` para las cinco paradas,
/// sin nada fijado y con la segunda parada fijada. Es lo que el anfitrión paga
/// en cada cambio de la edición, sin worker.
#[test]
#[ignore = "measurement"]
fn the_bounds_of_the_fuji_witness() {
    const CALLS: u32 = 10_000;
    let input = manual();
    let edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    let second = vec![
        FixedStop::default(),
        FixedStop {
            fuel_liters: Some(73.0),
            ve_percent: Some(97.0),
            change_tyres: None,
        },
    ];
    for (name, fixed) in [("sin fijar", Vec::new()), ("parada 2 fijada", second)] {
        for repetition in 1..=3 {
            let started = Instant::now();
            let mut stops = 0;
            for _ in 0..CALLS {
                stops += fixed_stop_bounds(&input, &edited, &fixed)
                    .expect("entrada válida")
                    .expect("cálculo escalar")
                    .len();
            }
            println!(
                "{name} rep={repetition} por llamada={:?} ({stops} paradas en {CALLS} llamadas)",
                started.elapsed() / CALLS
            );
        }
    }
}
