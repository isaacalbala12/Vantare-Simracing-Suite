//! Medida local del calculador productivo; adquisición y preparación fuera del reloj.
use std::{
    alloc::{GlobalAlloc, Layout, System},
    cell::Cell,
    hint::black_box,
    path::Path,
    time::{Duration, Instant},
};
use vantare_domain::{Adapter, Snapshot};
use vantare_runtime::adapter::open_acc_replay;

// Mismo crate propietario: mide el código productivo sin exportar una API de QA.
#[allow(dead_code)]
#[path = "../src/core/situation.rs"]
mod situation;

thread_local! {
    static COUNT: Cell<Option<u64>> = const { Cell::new(None) };
}
struct Counting;
fn record() {
    let _ = COUNT.try_with(|count| {
        if let Some(n) = count.get() {
            count.set(Some(n + 1));
        }
    });
}
// SAFETY: System conserva su contrato; el contador no modifica la memoria.
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        record();
        // SAFETY: delega el mismo Layout válido.
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        record();
        // SAFETY: delega el mismo Layout y contrato de memoria cero.
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: todos los bloques proceden de System con este Layout.
        unsafe { System.dealloc(ptr, layout) }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        record();
        // SAFETY: delega puntero, Layout y tamaño sin alterarlos.
        unsafe { System.realloc(ptr, layout, size) }
    }
}
#[global_allocator]
static ALLOCATOR: Counting = Counting;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    const N: u32 = 4096;
    const ROUNDS: u32 = 30;
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/acc/acc-sesion-udp-20260929.tar.gz");
    let mut replay = open_acc_replay(&path)?;
    let mut samples = Vec::new();
    while samples.len() < N as usize {
        if let Some(observation) = replay.poll(Duration::from_secs(121))? {
            samples.push(Snapshot {
                state: observation.state,
                origin: observation.origin,
                ..Snapshot::default()
            });
        }
    }
    let mut tracker = situation::Tracker::default();
    for sample in &mut samples {
        tracker.update(sample);
    }
    let mut timings = Vec::new();
    let mut allocations = 0;
    for _ in 0..ROUNDS {
        tracker.reset();
        COUNT.with(|count| count.set(Some(0)));
        let start = Instant::now();
        for sample in &mut samples {
            tracker.update(black_box(&mut *sample));
            black_box(sample.state.driving_situation);
        }
        let elapsed = start.elapsed();
        allocations += COUNT.with(|count| count.replace(None).unwrap_or(0));
        timings.push(elapsed.as_secs_f64() * 1e9 / f64::from(N));
    }
    timings.sort_by(f64::total_cmp);
    println!("corpus=ACC real N={N} rounds={ROUNDS} calls={}", N * ROUNDS);
    println!(
        "ns/call min={:.3} median={:.3} max={:.3}",
        timings[0],
        timings[timings.len() / 2],
        timings[timings.len() - 1]
    );
    println!("allocation_requests={allocations}");
    assert_eq!(allocations, 0, "el cálculo no debe asignar memoria");
    Ok(())
}
