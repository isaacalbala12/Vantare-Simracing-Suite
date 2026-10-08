//! Lecturas para Hub: cálculo canónico en storage, sin enlazar runtime/DuckDB en UI.
use serde_json::{Value, json};
use vantare_runtime::flows::{ANALYSIS_VERSION, LapSummary, SignalSummary};

use super::{MAX_PAGE_CHUNKS, Result, SeriesAnalysis, Store};

pub(super) fn open_error(error: &(dyn std::error::Error + Send + Sync)) -> Value {
    // DuckDB no expone un código específico de lock; conserva su diagnóstico.
    let detail = error.to_string();
    let lower = detail.to_lowercase();
    let code = if lower.contains("could not set lock")
        || lower.contains("conflicting lock")
        || lower.contains("file is already open in")
    {
        "locked"
    } else if lower.contains("versión") || lower.contains("series_meta") {
        "incompatible"
    } else {
        "unreadable"
    };
    json!(["error", code, detail])
}

fn signal(summary: SignalSummary) -> Value {
    json!({"reliable": summary.reliable, "estimated": summary.estimated,
        "stale": summary.stale, "unavailable": summary.unavailable,
        "mean": summary.mean, "min": summary.min, "max": summary.max})
}

fn lap(summary: &LapSummary) -> Value {
    json!({"epoch": summary.id.epoch, "session": summary.id.session.0,
        "car": summary.id.car.0, "lap": summary.id.lap,
        "first_chunk": summary.first_chunk, "sealed": summary.sealed_at.is_some(),
        "gap": summary.gap, "samples": summary.samples,
        "observed_span_s": summary.continuous_span_s(),
        "speed": signal(summary.speed_mps), "throttle": signal(summary.throttle),
        "brake": signal(summary.brake)})
}

pub(super) fn summaries(store: &Store) -> Result<Value> {
    // Una activa + 255 recientes; truncamiento visible, no catálogo inventado.
    let mut analysis = SeriesAnalysis::new(255)?;
    let mut after = 0;
    let mut total = 0_u64;
    loop {
        let chunks = store.page(after, MAX_PAGE_CHUNKS)?;
        if chunks.is_empty() {
            break;
        }
        for chunk in chunks {
            analysis.consume(&chunk)?;
            if analysis
                .find_lap((&chunk.block).into())
                .is_some_and(|summary| summary.first_chunk == chunk.index)
            {
                total += 1;
            }
            after = chunk.index;
        }
    }
    let mut laps: Vec<_> = analysis.recent().iter().collect();
    laps.extend(analysis.active());
    laps.sort_by_key(|summary| summary.first_chunk);
    let values: Vec<_> = laps
        .iter()
        .enumerate()
        .map(|(index, summary)| {
            let mut value = lap(summary);
            value["next_chunk"] = json!(laps.get(index + 1).map(|next| next.first_chunk));
            value
        })
        .collect();
    Ok(json!(["summaries", ANALYSIS_VERSION, total, values]))
}

pub(super) fn page(store: &Store, after: u64, limit: usize) -> Result<Value> {
    use vantare_runtime::flows::LapSample;
    fn reliable(value: vantare_domain::Quality<f64>) -> Option<f64> {
        match value {
            vantare_domain::Quality::Reliable(value) => Some(value),
            _ => None,
        }
    }
    fn sample(sample: &LapSample) -> Value {
        // Solo Reliable se dibuja; null significa ausencia/calidad no fiable, nunca cero.
        json!({"distance": reliable(sample.distance_m), "elapsed": reliable(sample.elapsed_s),
            "speed": reliable(sample.speed_mps), "throttle": reliable(sample.throttle),
            "brake": reliable(sample.brake)})
    }
    let chunks = store.page(after, limit)?;
    let values: Vec<_> = chunks
        .iter()
        .map(|chunk| {
            json!({
                "index": chunk.index, "offset": chunk.offset,
                "epoch": chunk.block.epoch, "session": chunk.block.session.0,
                "car": chunk.block.car.0, "lap": chunk.block.lap,
                "gap": chunk.block.gap || chunk.lost_before > 0,
                "samples": chunk.block.samples.iter().map(sample).collect::<Vec<_>>()
            })
        })
        .collect();
    Ok(json!(["plot-page", "series-plot.v1", values]))
}
