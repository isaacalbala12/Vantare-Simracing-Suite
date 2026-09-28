//! Diagnostic parser timing on the audited static 44-car SHM fixture.
//! This does not measure CPU for the full driver/core/product path.

use std::hint::black_box;
use std::time::Instant;

use vantare_telemetry::lmu::admit_v13;

const FRAME: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");
const WARMUP: usize = 10_000;
const ITERATIONS: usize = 100_000;

fn main() {
    for _ in 0..WARMUP {
        let grid = admit_v13(black_box(FRAME), "1.3.0.0").expect("audited fixture");
        black_box(grid);
    }
    let start = Instant::now();
    for _ in 0..ITERATIONS {
        let grid = admit_v13(black_box(FRAME), "1.3.0.0").expect("audited fixture");
        black_box(grid);
    }
    let elapsed = start.elapsed();
    println!(
        "Rust LMU 44 static admission: {:.1} ns/op ({} iterations, wall clock)",
        elapsed.as_nanos() as f64 / ITERATIONS as f64,
        ITERATIONS
    );
}
