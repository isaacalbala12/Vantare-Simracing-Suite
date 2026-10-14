use super::*;
use std::time::Duration;
use vantare_domain::{Quality, SourceState};

fn observed(index: u64) -> Snapshot {
    let mut snapshot = crate::source::realistic(0);
    snapshot.sequence = index + 1;
    snapshot.origin.received_at = Duration::from_millis(index * 20);
    snapshot.state.source_state = SourceState::Live;
    snapshot
        .state
        .player
        .as_mut()
        .expect("jugador sintético")
        .delta_best_s = Quality::Reliable(0.2);
    snapshot
}

fn populated() -> Widget {
    let prefs = Preferences::default();
    let mut widget = Widget::new(&Settings::default(), prefs);
    for index in 0..240 {
        widget.ingest(&observed(index), prefs);
    }
    assert!(!widget.trace.samples().is_empty());
    widget
}

#[test]
fn repeated_paint_keeps_the_same_observed_sample_storage() {
    let mut widget = populated();
    let first = widget.paint_samples();
    let second = widget.paint_samples();
    assert_eq!(
        first.as_ptr(),
        second.as_ptr(),
        "repintar sin una foto nueva no debe copiar la historia"
    );
}

#[test]
fn retained_paint_preserves_history_after_new_samples_and_loss() {
    let prefs = Preferences::default();
    let mut widget = populated();
    let retained = widget.paint_samples();
    let original = retained.to_vec();
    widget.ingest(&observed(242), prefs);
    let next = widget.paint_samples();
    assert_ne!(next.as_ptr(), retained.as_ptr());
    assert_eq!(
        next.as_slice(),
        widget.trace.samples().iter().copied().collect::<Vec<_>>()
    );
    assert!(
        next.last().expect("foto nueva").break_before,
        "se conserva el hueco de secuencia"
    );
    assert_eq!(retained.as_slice(), original);
    let mut lost = observed(243);
    lost.state.source_state = SourceState::Lost;
    widget.ingest(&lost, prefs);
    assert!(widget.paint_samples().is_empty());
    assert_eq!(
        retained.as_slice(),
        original,
        "la closure anterior mantiene sus muestras"
    );
    let mut restart = observed(1);
    restart.epoch += 1;
    widget.ingest(&restart, prefs);
    assert_eq!(widget.paint_samples().len(), 1);
}

#[test]
#[ignore = "Banco Release exclusivo #1607; requiere pc-medicion.lock"]
fn measure_paint_samples() {
    for run in 1..=3 {
        let mut widget = populated();
        let count = widget.trace.samples().len();
        let start = std::time::Instant::now();
        for _ in 0..50_000 {
            std::hint::black_box(widget.paint_samples());
        }
        println!(
            "ISA1607 delta_trace unchanged run={run} iterations=50000 samples={count} elapsed_us={}",
            start.elapsed().as_micros()
        );
        let start = std::time::Instant::now();
        for index in 240..10_240 {
            widget.ingest(&observed(index), Preferences::default());
            std::hint::black_box(widget.paint_samples());
        }
        println!(
            "ISA1607 delta_trace changed run={run} iterations=10000 elapsed_us={}",
            start.elapsed().as_micros()
        );
    }
}
