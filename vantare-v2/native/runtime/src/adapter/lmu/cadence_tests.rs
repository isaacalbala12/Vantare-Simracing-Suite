//! Diagnóstico opt-in de relojes grabados; no publica cuerpos ni identidades.
use std::{collections::BTreeMap, fs::File, io::BufReader, time::Duration};

use serde_json::{Value, json};

use super::gate::Gate;
use crate::lmu_recording::Reader;

#[derive(Default)]
struct Cadence {
    samples: u64,
    changes: u64,
    regressions: u64,
    previous: Option<f64>,
    last_change: Option<u64>,
    intervals: Vec<u64>,
    deltas: Vec<f64>,
}

impl Cadence {
    fn observe(&mut self, at: u64, value: f64) {
        self.samples += 1;
        if self.previous != Some(value) {
            if let Some(previous) = self.previous {
                self.regressions += u64::from(value < previous);
                self.deltas.push(value - previous);
            }
            if let Some(previous) = self.last_change {
                self.intervals.push(at.saturating_sub(previous));
            }
            self.last_change = Some(at);
            self.changes += 1;
            self.previous = Some(value);
        }
    }

    fn report(mut self, include_long_intervals: bool) -> Value {
        let mut at = self
            .last_change
            .unwrap_or(0)
            .saturating_sub(self.intervals.iter().sum());
        let mut long_intervals = Vec::new();
        if include_long_intervals {
            for &interval in &self.intervals {
                if interval >= 500_000_000 {
                    long_intervals.push([at, at + interval]);
                }
                at += interval;
            }
        }
        self.intervals.sort_unstable();
        self.deltas.sort_by(f64::total_cmp);
        let interval = |percent: usize| {
            self.intervals
                .get(self.intervals.len().saturating_sub(1) * percent / 100)
                .map(|n| Duration::from_nanos(*n).as_secs_f64() * 1000.0)
        };
        let delta = |percent: usize| {
            self.deltas
                .get(self.deltas.len().saturating_sub(1) * percent / 100)
        };
        json!({"samples":self.samples,"changes_including_first":self.changes,
            "regressions":self.regressions,
            "interval_ms":{"min":interval(0),"p50":interval(50),"p95":interval(95),"p99":interval(99),"max":interval(100)},
            "source_delta":{"min":delta(0),"p50":delta(50),"p99":delta(99),"max":delta(100)},
            "intervals_ge_500ms":self.intervals.iter().filter(|v| **v>=500_000_000).count(),
            "last_change_ns":self.last_change,"long_intervals_ns":long_intervals})
    }
}

fn f64_at(bytes: &[u8], at: usize) -> f64 {
    f64::from_le_bytes(bytes[at..at + 8].try_into().unwrap())
}

#[test]
fn imola_recorded_clocks_recover_without_waiting_for_a_two_second_clear_run() {
    let trace: Value = serde_json::from_str(include_str!(
        "../../../testdata/lmu-imola-2026-10-16/clock-trace.json"
    ))
    .unwrap();
    for column in [1, 2] {
        let mut gate = Gate::default();
        let mut previous = None;
        let mut last_advance = None;
        let mut was_stale = false;
        let (mut freezes, mut recoveries) = (0, 0);
        for row in trace["samples"].as_array().unwrap() {
            let at = Duration::from_nanos(row[0].as_u64().unwrap());
            let source = Duration::from_secs_f64(row[column].as_f64().unwrap());
            let advanced = previous != Some(source);
            let stale = gate.observe(at, Some(source));
            if was_stale && advanced {
                let confirmed = last_advance.is_some_and(|last: Duration| {
                    at.saturating_sub(last) < super::gate::STALL_LIMIT
                });
                assert_eq!(!stale, confirmed, "dos avances cercanos en {at:?}");
                recoveries += u32::from(!stale);
            } else if was_stale {
                assert!(stale, "una lectura repetida no recupera en {at:?}");
            }
            freezes += u32::from(stale && !was_stale);
            was_stale = stale;
            previous = Some(source);
            if advanced {
                last_advance = Some(at);
            }
        }
        assert!(freezes >= 4, "se conservan los huecos reales >500 ms");
        assert!(
            recoveries >= 4,
            "se recuperan datos entre huecos periódicos"
        );
    }
}

#[test]
#[ignore = "opt-in: Replay/Core completos de una grabación privada grande"]
fn recorded_replay_freshness() {
    let input = std::env::var_os("VANTARE_LMU_CADENCE_INPUT").expect("INPUT");
    let output = std::env::var_os("VANTARE_LMU_CADENCE_OUTPUT").expect("OUTPUT");
    let mut replay = super::open::open_replay(std::path::Path::new(&input), None).unwrap();
    let mut core = crate::core::Core::new(1);
    core.set_demand(vantare_ipc::Demand::all());
    let mut states = BTreeMap::<String, u64>::new();
    let mut reasons = BTreeMap::<String, u64>::new();
    let mut sequence = 0;
    let mut last = Duration::ZERO;
    while let Some(at) = replay.next_recorded_at() {
        last = last.max(at);
        core.step(&mut replay, last).unwrap();
        let snapshot = core.snapshot();
        if snapshot.sequence == sequence {
            continue;
        }
        sequence = snapshot.sequence;
        if snapshot.state.player.is_none() || snapshot.state.cars.is_empty() {
            continue;
        }
        *states
            .entry(format!("{:?}", snapshot.state.source_state))
            .or_default() += 1;
        *reasons.entry(core.freshness_reason().into()).or_default() += 1;
        let count: u64 = states.values().sum();
        if count.is_multiple_of(25_000) {
            eprintln!("Replay/Core: {count} fotos, {last:?}");
        }
    }
    let report = json!({"last_at_ns":last.as_nanos(),"states":states,"reasons":reasons});
    let output = std::path::PathBuf::from(output).with_extension("replay.json");
    let output = File::options()
        .write(true)
        .create_new(true)
        .open(output)
        .unwrap();
    serde_json::to_writer_pretty(output, &report).unwrap();
}

/// Usa `VANTARE_LMU_CADENCE_INPUT`/`OUTPUT`; `LIMIT_S` opcional limita un prefijo.
#[test]
#[ignore = "opt-in: lectura streaming de una grabación privada grande"]
#[allow(clippy::too_many_lines)] // Auditoría secuencial opt-in, sin rutas de producto.
fn recorded_clock_cadence() {
    let input = std::env::var_os("VANTARE_LMU_CADENCE_INPUT").expect("INPUT");
    let output = std::env::var_os("VANTARE_LMU_CADENCE_OUTPUT").expect("OUTPUT");
    let limit = std::env::var("VANTARE_LMU_CADENCE_LIMIT_S")
        .ok()
        .map(|v| v.parse::<u64>().unwrap() * 1_000_000_000);
    let mut clocks = BTreeMap::<String, Cadence>::new();
    let mut rest = BTreeMap::<String, Value>::new();
    let mut trace = Vec::new();
    let mut gate = Gate::default();
    let mut states = BTreeMap::<String, u64>::new();
    let mut stable = 0_u64;
    let mut changed_bodies = 0_u64;
    let mut previous_hash = String::new();
    let mut footer = false;
    let mut last_at = 0;
    let mut at_regressions = 0_u64;
    let mut max_at_regression_ns = 0_u64;
    let mut first_rest = Vec::new();
    let mut slow_rest = Vec::new();
    let mut clock_body_disagreements = 0_u64;
    let mut previous_telemetry = None;
    for record in Reader::new(BufReader::new(File::open(input).unwrap())) {
        let record = record.unwrap();
        if limit.is_some_and(|limit| record.at_ns > limit) {
            break;
        }
        if record.at_ns < last_at {
            at_regressions += 1;
            max_at_regression_ns = max_at_regression_ns.max(last_at - record.at_ns);
        }
        last_at = last_at.max(record.at_ns);
        footer |= record.kind == "footer";
        if record.kind == "rest" {
            if record.at_ns.saturating_sub(record.started_ns) >= 500_000_000 {
                slow_rest.push(json!({"key":record.key,"at_ns":record.at_ns,"started_ns":record.started_ns,"completed_ns":record.details["completed_ns"],"status":record.status}));
            }
            if record.at_ns < 10_000_000_000 {
                first_rest.push(json!({"key":record.key,"at_ns":record.at_ns,"started_ns":record.started_ns,"status":record.status}));
            }
            let info = rest.entry(record.key.clone()).or_insert_with(
                || json!({"responses":0,"ok":0,"slow_ge_500ms":0,"max_latency_ms":0.0}),
            );
            info["responses"] = json!(info["responses"].as_u64().unwrap() + 1);
            let latency = record.at_ns.saturating_sub(record.started_ns);
            info["slow_ge_500ms"] =
                json!(info["slow_ge_500ms"].as_u64().unwrap() + u64::from(latency >= 500_000_000));
            info["max_latency_ms"] = json!(
                info["max_latency_ms"]
                    .as_f64()
                    .unwrap()
                    .max(Duration::from_nanos(latency).as_secs_f64() * 1000.0)
            );
            clocks
                .entry(format!("REST responses {}", record.key))
                .or_default()
                .observe(
                    record.at_ns,
                    Duration::from_nanos(record.at_ns).as_secs_f64(),
                );
            if record.status == Some(200) && record.error.is_none() {
                info["ok"] = json!(info["ok"].as_u64().unwrap() + 1);
                clocks
                    .entry(format!("REST OK {}", record.key))
                    .or_default()
                    .observe(
                        record.at_ns,
                        Duration::from_nanos(record.at_ns).as_secs_f64(),
                    );
                if record.key == "/rest/watch/sessionInfo" {
                    let value: Value = serde_json::from_slice(&record.body).unwrap();
                    for key in [
                        "currentEventTime",
                        "currentTime",
                        "currentSessionTime",
                        "elapsedTime",
                        "endEventTime",
                    ] {
                        if let Some(value) = value[key].as_f64() {
                            clocks
                                .entry(format!("REST sessionInfo {key}"))
                                .or_default()
                                .observe(record.at_ns, value);
                        }
                    }
                }
            }
        }
        if record.kind != "shm" || record.key != "LMU_Data" || record.details["stable"] != true {
            continue;
        }
        stable += 1;
        let body_changed = previous_hash != record.sha256;
        changed_bodies += u64::from(body_changed);
        previous_hash = record.sha256;
        let b = &record.body;
        let scoring = f64_at(b, 1700);
        let player_index = usize::from(b[128_465]);
        let telemetry = f64_at(b, 128_468 + player_index * 1888 + 12);
        clock_body_disagreements +=
            u64::from(body_changed != (previous_telemetry != Some(telemetry)));
        previous_telemetry = Some(telemetry);
        clocks.entry("SHM reads".into()).or_default().observe(
            record.at_ns,
            Duration::from_nanos(record.at_ns).as_secs_f64(),
        );
        clocks
            .entry("SHM scoring mCurrentET".into())
            .or_default()
            .observe(record.at_ns, scoring);
        clocks
            .entry("SHM player mElapsedTime".into())
            .or_default()
            .observe(record.at_ns, telemetry);
        clocks
            .entry("SHM gameVersion (not a sequence counter)".into())
            .or_default()
            .observe(
                record.at_ns,
                f64::from(i32::from_le_bytes(b[64..68].try_into().unwrap())),
            );
        // SDK SharedMemoryGeneric has an event queue, not a sequence/version counter.
        for i in 0..16 {
            let value = u32::from_le_bytes(b[i * 4..i * 4 + 4].try_into().unwrap());
            clocks
                .entry(format!("SHM event[{i}]"))
                .or_default()
                .observe(record.at_ns, f64::from(value));
        }
        let expired = gate.observe(
            Duration::from_nanos(record.at_ns),
            Duration::try_from_secs_f64(scoring).ok(),
        );
        *states
            .entry(if expired { "stale" } else { "live" }.into())
            .or_default() += 1;
        if record.at_ns < 10_000_000_000 {
            trace.push(json!([record.at_ns, scoring, telemetry, expired]));
        }
        if stable.is_multiple_of(25_000) {
            eprintln!(
                "Cadencia: {stable} SHM, {:.1}s",
                Duration::from_nanos(record.at_ns).as_secs_f64()
            );
        }
    }
    let clocks: BTreeMap<_, _> = clocks
        .into_iter()
        .map(|(k, v)| {
            let include = matches!(
                k.as_str(),
                "SHM scoring mCurrentET" | "SHM player mElapsedTime"
            );
            (k, v.report(include))
        })
        .collect();
    let report = json!({"footer":footer,"last_at_ns":last_at,"at_regressions":at_regressions,"max_at_regression_ns":max_at_regression_ns,"stable_shm":stable,"changed_raw_bodies":changed_bodies,"clock_body_disagreements":clock_body_disagreements,"scoring_gate_states_shm_only":states,"clocks":clocks,"rest":rest,"slow_rest":slow_rest,"first_10s_rest":first_rest,"first_10s_trace_columns":["at_ns","scoring_s","player_telemetry_s","gate_stale"],"first_10s_trace":trace});
    let output = File::options()
        .write(true)
        .create_new(true)
        .open(output)
        .unwrap();
    serde_json::to_writer_pretty(output, &report).unwrap();
    assert!(stable > 0);
    assert!(limit.is_some() || footer);
}
