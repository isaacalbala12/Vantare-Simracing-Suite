//! Diagnostic static 44-car Engineer projection and JSON encoding timing.
//! Excludes LMU acquisition, IPC, Go decode, scheduler, and temporal churn.

use std::hint::black_box;
use std::time::Instant;

use vantare_telemetry::engine::Engine;
use vantare_telemetry::ipc::snapshot::{ProductMetadata, encode_engineer_typed};
use vantare_telemetry::lmu::mapper::ClockChange;
use vantare_telemetry::projection::engineer;

const FRAME: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");
const WARMUP: usize = 200;
const ITERATIONS: usize = 2_000;

fn measure(label: &str, mut operation: impl FnMut()) {
    for _ in 0..WARMUP {
        operation();
    }
    for run in 1..=5 {
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            operation();
        }
        println!(
            "Rust Engineer static44 {label} run {run}: {:.1} ns/op ({} iterations)",
            start.elapsed().as_nanos() as f64 / ITERATIONS as f64,
            ITERATIONS
        );
    }
}

fn main() {
    let engine = Engine::new(30, 15).expect("engine");
    let prepared = engine
        .prepare(
            FRAME,
            "1.3.0.0",
            100,
            100,
            100_000_000_000,
            ClockChange::Continuous,
        )
        .expect("audited fixture");
    measure("project", || {
        black_box(engineer::build_typed(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.gaps(),
        ));
    });
    measure("project+json", || {
        let value = engineer::build_typed(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.gaps(),
        );
        black_box(serde_json::to_vec(&value).expect("JSON"));
    });
    measure("project+snapshot-frame", || {
        let value = engineer::build_typed(
            prepared.batch(),
            prepared.session_remaining(),
            prepared.gaps(),
        );
        black_box(
            encode_engineer_typed(
                &value,
                ProductMetadata {
                    epoch: 1,
                    sequence: 1,
                    captured_at: "1970-01-01T00:01:40Z",
                },
            )
            .expect("frame"),
        );
    });
}
