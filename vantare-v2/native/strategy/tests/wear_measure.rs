//! Medición del camino en que todas las paradas cambian ruedas, antes y después
//! de acumular el desgaste (#2691). Ignorado por defecto.
//!
//! Solo usa funciones que ya existían antes del cambio, para poder compilar el
//! mismo fichero con el código de antes y con el de después y comparar los dos
//! binarios guardados, alternándolos:
//! `cargo test -p vantare-strategy --release --test wear_measure --no-run` y
//! después el binario con `--include-ignored --nocapture --test-threads=1`.
//! `VANTARE_MUESTRAS` cambia el número de muestras por caso (5 por defecto).
//!
//! Cada línea `MEDIDA` lleva el caso, los microsegundos de una muestra y el
//! trabajo hecho (candidatos explorados o segundos de carrera), que tiene que
//! ser el mismo en los dos binarios.
use std::sync::atomic::AtomicBool;
use std::time::Instant;

use serde_json::Value;
use vantare_strategy::application::{EditedPlan, recalculate_edited_plan_detailed};
use vantare_strategy::solver::{
    DecisionVector, Input, PitDecision, StintDecision, replay_decision_v2, solve_greedy_fallback,
    solve_v2_cancellable,
};

fn samples() -> usize {
    std::env::var("VANTARE_MUESTRAS")
        .ok()
        .and_then(|text| text.parse().ok())
        .unwrap_or(5)
}

/// Fuji manual: la búsqueda la corta el límite de candidatos, no el reloj.
fn fuji(laps: u32, energy: bool, candidates: usize) -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("entrada congelada de Fuji");
    input.extra.clear();
    input.race_laps = laps;
    input.budget.p95_millis = 60_000;
    input.budget.max_candidates = candidates;
    input.budget.max_iterations = 1_000_000;
    if !energy {
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
    }
    input
}

fn measure(case: &str, mut run: impl FnMut() -> String) {
    for _ in 0..samples() {
        let started = Instant::now();
        let work = run();
        println!(
            "MEDIDA caso={case} micros={} trabajo={work}",
            started.elapsed().as_micros()
        );
    }
}

fn search(case: &str, input: &Input) {
    measure(case, || {
        let outcome = solve_v2_cancellable(input, &AtomicBool::new(false)).expect("resultado");
        format!(
            "{}/{:?}/{:?}",
            outcome.certificate.explored_work_items,
            outcome.certificate.status,
            outcome.cost_seconds
        )
    });
}

#[test]
#[ignore = "measurement"]
fn the_scalar_search_when_every_stop_fits_new_tyres() {
    // Con desgaste y vida de ruedas, que es donde entra la edad.
    let mut worn = fuji(60, false, 250_000);
    worn.degradation_per_lap_seconds.value = 0.05;
    worn.tyre_life_laps.value = 30.0;
    search("escalar-60v-sin-energia", &fuji(60, false, 250_000));
    search("escalar-60v-desgaste-vida", &worn);
    search("escalar-240v-con-energia", &fuji(240, true, 250_000));
    search("escalar-12v-con-energia", &fuji(12, true, 1_000_000));
}

#[test]
#[ignore = "measurement"]
fn the_fallback_and_the_recalculation_of_the_fuji_witness() {
    let edited = EditedPlan {
        stints: vec![43, 42, 42, 43, 42, 24],
        pit_stop_laps: vec![43, 85, 127, 170, 212],
    };
    let input = fuji(236, true, 20_000);
    measure("recalcular-236v-con-respaldo", || {
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                .expect("recálculo");
        format!("{fallback:?}/{:?}", outcome.cost_seconds)
    });
    measure("respaldo-236v-x1000", || {
        let mut seconds = 0.0;
        for _ in 0..1_000 {
            seconds = solve_greedy_fallback(&input)
                .expect("plan de respaldo")
                .result
                .expected
                .total_seconds;
        }
        format!("{seconds}")
    });
}

fn oracle_input(file: &str, name: &str) -> Input {
    let cases: Vec<Value> = serde_json::from_str(file).expect("oráculo");
    let case = cases
        .into_iter()
        .find(|case| case["name"] == name)
        .expect("caso del oráculo");
    serde_json::from_value(case["input"].clone()).expect("entrada")
}

#[test]
#[ignore = "measurement"]
fn the_extended_search_and_the_replay() {
    // Búsqueda extendida sin inventario (todas las paradas cambian ruedas) y con
    // inventario (el cálculo elige).
    let grid = {
        // 329 niveles de carga: el presupuesto engorda el paso y decide la
        // búsqueda extendida. Un depósito da para nueve vueltas.
        let mut input = fuji(14, false, 20_000);
        input.fuel_per_lap_liters.value = 9.0;
        input.discretization.fuel_liters = 0.25;
        input.degradation_per_lap_seconds.value = 0.05;
        input
    };
    search("extendida-14v-pasos-finos", &grid);
    let tyres = oracle_input(
        include_str!("../testdata/oracle/solver-tyres.json"),
        "tyres-reuse",
    );
    search("extendida-inventario", &tyres);
    // Replay del calendario de Fuji con ruedas nuevas en todas las paradas.
    let mut input = fuji(236, false, 1);
    input.degradation_per_lap_seconds.value = 0.05;
    input.tyre_life_laps.value = 0.0;
    input.fuel_per_lap_liters.value = 1.8;
    let stints = [43u32, 42, 42, 43, 42, 24];
    // Cada parada carga lo que gasta el tramo siguiente.
    let loads = [75.6, 75.6, 77.4, 75.6, 43.2];
    let mut lap = 0;
    let decision = DecisionVector {
        stints: stints
            .iter()
            .enumerate()
            .map(|(index, &laps)| StintDecision {
                index,
                laps,
                ..StintDecision::default()
            })
            .collect(),
        pit_stops: stints
            .iter()
            .zip(loads)
            .map(|(&laps, fuel_liters)| {
                lap += laps;
                PitDecision {
                    lap,
                    fuel_liters,
                    change_tyres: true,
                    ..PitDecision::default()
                }
            })
            .collect(),
    };
    measure("replay-236v-x200", || {
        let mut seconds = 0.0;
        for _ in 0..200 {
            let replay = replay_decision_v2(&input, &decision).expect("replay");
            assert!(replay.feasible, "{:?}", replay.reasons);
            seconds = replay.evaluation.total_seconds;
        }
        format!("{seconds}")
    });
}
