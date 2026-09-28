//! Diagnostic static 44-car Rust assembly timing by product demand.
//! Excludes live LMU acquisition, REST, Go decode/delivery and process CPU.

use std::hint::black_box;
use std::time::Instant;

use serde_json::Value;
use vantare_telemetry::assembly::Assembler;
use vantare_telemetry::ipc::snapshot;
use vantare_telemetry::ipc::{self, Kind};
use vantare_telemetry::lmu::mapper::ClockChange;

const FRAME: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");
const CONFIG: &[u8] = include_bytes!("../testdata/configuration-frame-go-v1.bin");
const WARMUP: usize = 50;
const ITERATIONS: usize = 500;

fn configuration(overlay: bool, engineer: bool, strategy: bool) -> Vec<u8> {
    let decoded = ipc::decode(CONFIG).expect("Go configuration fixture");
    let mut wire: Value = serde_json::from_slice(decoded.payload).expect("Go configuration JSON");
    wire["consumers"]["overlayV2"] = overlay.into();
    wire["consumers"]["engineer"] = engineer.into();
    wire["consumers"]["strategy"] = strategy.into();
    ipc::encode(Kind::Configuration, &serde_json::to_vec(&wire).unwrap()).unwrap()
}

fn measure(label: &str, config: &[u8]) {
    let mut assembly = Assembler::new(30, 15).expect("assembly");
    assembly.configure(config).expect("configuration");
    let mut tick = 0_u64;
    let mut apply = || {
        tick += 1;
        let stamp = 100_000_000_000_i64 + tick as i64 * 1_000_000;
        black_box(
            assembly
                .apply(
                    black_box(FRAME),
                    "1.3.0.0",
                    tick * 1_000_000,
                    tick * 1_000_000,
                    stamp,
                    ClockChange::Continuous,
                )
                .expect("static frame batch"),
        );
    };
    for _ in 0..WARMUP {
        apply();
    }
    for run in 1..=5 {
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            apply();
        }
        println!(
            "Rust assembly static44 {label} run {run}: {:.1} us/op ({} iterations)",
            start.elapsed().as_secs_f64() * 1_000_000.0 / ITERATIONS as f64,
            ITERATIONS
        );
    }
}

fn main() {
    measure("canonical-only", &configuration(false, false, false));
    measure("overlay-only", &configuration(true, false, false));
    measure("engineer-only", &configuration(false, true, false));
    measure("strategy-only", &configuration(false, false, true));
    measure("overlay+engineer", &configuration(true, true, false));
    measure_overlay_encoding();
}

fn measure_overlay_encoding() {
    let mut assembly = Assembler::new(30, 15).expect("assembly");
    assembly
        .configure(&configuration(true, false, false))
        .expect("configuration");
    let frames = assembly
        .apply(
            FRAME,
            "1.3.0.0",
            1_000_000,
            1_000_000,
            100_000_000_000,
            ClockChange::Continuous,
        )
        .expect("static frame batch");
    let decoded = ipc::decode(&frames[1]).expect("overlay snapshot frame");
    let wire: Value = serde_json::from_slice(decoded.payload).expect("overlay JSON");
    let update = &wire["update"];
    let borrowed = snapshot::encode_overlay(update).expect("borrowed encoding");
    let cloned = ipc::encode(
        Kind::Snapshot,
        &serde_json::to_vec(&serde_json::json!({"product": "overlay-v2", "update": update}))
            .expect("cloned encoding"),
    )
    .expect("cloned frame");
    assert_eq!(borrowed, cloned, "wire bytes must remain identical");
    for run in 1..=5 {
        for (label, cloned_path) in [("borrowed", false), ("cloned", true)] {
            let start = Instant::now();
            for _ in 0..2_000 {
                let encoded = if cloned_path {
                    ipc::encode(
                        Kind::Snapshot,
                        &serde_json::to_vec(
                            &serde_json::json!({"product": "overlay-v2", "update": update}),
                        )
                        .unwrap(),
                    )
                    .unwrap()
                } else {
                    snapshot::encode_overlay(update).unwrap()
                };
                black_box(encoded);
            }
            println!(
                "Rust Overlay static44 {label} run {run}: {:.1} us/op (2000 iterations)",
                start.elapsed().as_secs_f64() * 500.0
            );
        }
    }
}
