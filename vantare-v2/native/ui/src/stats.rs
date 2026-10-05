//! Contadores por segundo de fotogramas de ventana, `render` de cada widget y
//! pintados reales de cada widget (feature `paint-stats`). Sirven para ver qué
//! reutiliza GPUI cuando cambia un solo widget de una ventana compartida.

use std::fmt::Write;
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};
use std::thread;
use std::time::Duration;

use crate::Kind;

/// Por widget: `render` y pintado; al final, fotogramas de ventana.
static COUNTS: [AtomicU64; Kind::ALL.len() * 2 + 1] =
    [const { AtomicU64::new(0) }; Kind::ALL.len() * 2 + 1];
const FRAMES: usize = Kind::ALL.len() * 2;
static INGEST: [AtomicU64; Kind::ALL.len()] = [const { AtomicU64::new(0) }; Kind::ALL.len()];

pub fn ingest(kind: Kind) {
    if !crate::profiling::enabled() {
        return;
    }
    INGEST[kind as usize].fetch_add(1, Relaxed);
}

pub fn render(kind: Kind) {
    if !crate::profiling::enabled() {
        return;
    }
    COUNTS[kind as usize * 2].fetch_add(1, Relaxed);
}

pub fn paint(kind: Kind) {
    if !crate::profiling::enabled() {
        return;
    }
    COUNTS[kind as usize * 2 + 1].fetch_add(1, Relaxed);
}

pub fn frame(window: &gpui::Window) {
    if !crate::profiling::enabled() {
        return;
    }
    COUNTS[FRAMES].fetch_add(1, Relaxed);
    eprintln!(
        "perf frame window={:?} clock={:?}",
        window.window_handle().window_id(),
        crate::profiling::clock()
    );
}

/// Imprime cada segundo lo contado en ese segundo (suma de todas las ventanas).
pub fn report() {
    if !crate::profiling::enabled() {
        return;
    }
    thread::spawn(|| {
        loop {
            thread::sleep(Duration::from_secs(1));
            let now = |i: usize| COUNTS[i].swap(0, Relaxed);
            let mut line = format!("frames/s={}", now(FRAMES));
            for (i, kind) in Kind::ALL.iter().enumerate() {
                let _ = write!(
                    line,
                    "  {} render={} paint={}",
                    kind.name(),
                    now(i * 2),
                    now(i * 2 + 1)
                );
            }
            println!("{line}");
            for (i, kind) in Kind::ALL.iter().enumerate() {
                let calls = INGEST[i].swap(0, Relaxed);
                if calls > 0 {
                    eprintln!("perf ingest widget={} calls={calls}", kind.name());
                }
            }
            crate::profiling::report();
        }
    });
}
