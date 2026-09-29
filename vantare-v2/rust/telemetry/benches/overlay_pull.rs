//! Diagnostic cost of Rust Overlay pull state on the real 44-car golden.
//! Excludes acquisition, projection, IPC, Wails and consumer rendering.

use std::hint::black_box;
use std::time::Instant;

use vantare_telemetry::delivery::{OverlayPull, PullRequest};

const GOLDEN: &[u8] = include_bytes!(
    "../../../internal/telemetry/projection/overlayv2/testdata/overlay_v2_44.golden.json"
);
const WARMUP: usize = 100;
const ITERATIONS: usize = 400;
const BLOCKS: usize = 5;

fn samples() -> Vec<Vec<u8>> {
    let original: serde_json::Value = serde_json::from_slice(GOLDEN).expect("Go 44-car golden");
    (1..=(WARMUP + ITERATIONS * BLOCKS))
        .map(|revision| {
            let mut update = original.clone();
            update["revision"] = (revision as u64).into();
            update["frame"]["sequence"] = (revision as u64).into();
            serde_json::to_vec(&update).expect("golden update")
        })
        .collect()
}

fn measure(sections: u8, samples: &[Vec<u8>]) {
    let mut pull = OverlayPull::new();
    let mut ack = 0;
    let mut next = 0;
    let mut apply = || {
        next += 1;
        pull.publish_snapshot(next as u64, &samples[next - 1])
            .expect("publish golden");
        let response = pull
            .pull(
                "overlay",
                PullRequest {
                    session_id: "bench",
                    ack,
                    sections,
                },
            )
            .expect("pull golden")
            .expect("changed snapshot");
        if sections == 1 && ack != 0 {
            assert_eq!(response.events[0].base_revision, Some(ack));
        }
        ack = response.delivery;
        black_box(response.encode_json());
    };
    for _ in 0..WARMUP {
        apply();
    }
    for block in 1..=BLOCKS {
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            apply();
        }
        println!(
            "Rust Overlay pull static44 sections={sections} block={block}: {:.1} us/op ({} iterations)",
            start.elapsed().as_secs_f64() * 1_000_000.0 / ITERATIONS as f64,
            ITERATIONS
        );
    }
}

fn main() {
    let samples = samples();
    measure(0, &samples);
    measure(1, &samples);
}
