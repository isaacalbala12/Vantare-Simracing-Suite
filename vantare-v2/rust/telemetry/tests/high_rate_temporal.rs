//! Replay of the audited LMU47 corpus with its actual SHM/REST event order.
//! This is a functional prerequisite for the whole-route G0/G1/R bank.

use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::Path;

use serde::Deserialize;
use serde_json::{Value, json};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use vantare_telemetry::assembly::Assembler;
use vantare_telemetry::ipc::{self, Kind};
use vantare_telemetry::lmu::{OBJECT_OUT_SIZE, admit_v13};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema: String,
    build: String,
    vehicles: usize,
    shm_ticks: usize,
    rest_reports: usize,
    events: Vec<Event>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Event {
    kind: String,
    index: usize,
    at_utc: String,
    file: String,
    source_ms: Option<i64>,
    vehicles: Option<usize>,
    standings_started_utc: Option<String>,
    standings_completed_utc: Option<String>,
    session_started_utc: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestBodies {
    schema: String,
    standings: Value,
    session_info: Value,
}

fn utc_ns(value: &str) -> i128 {
    OffsetDateTime::parse(value, &Rfc3339)
        .unwrap()
        .unix_timestamp_nanos()
}

fn elapsed_ns(first: i128, value: &str) -> u64 {
    u64::try_from(utc_ns(value) - first + 1_000_000_000).unwrap()
}

#[test]
fn real_high_rate_shm_and_rest_reach_all_rust_products() {
    let Ok(dir) = std::env::var("LMU_HIGH_RATE_CORPUS") else {
        return;
    };
    let dir = Path::new(&dir);
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(dir.join("manifest.json")).unwrap()).unwrap();
    assert_eq!(manifest.schema, "vantare.lmu-temporal-high-rate.v1");
    assert_eq!(manifest.build, "1.4.2.0");
    assert_eq!(manifest.vehicles, 47);
    assert_eq!(manifest.shm_ticks, 3600);
    assert_eq!(manifest.rest_reports, 239);
    assert_eq!(manifest.events.len(), 3839);
    let first_utc_ns = utc_ns(&manifest.events[0].at_utc);
    let mut config: Value = serde_json::from_slice(
        ipc::decode(include_bytes!("../testdata/configuration-frame-go-v1.bin"))
            .unwrap()
            .payload,
    )
    .unwrap();
    config["consumers"]["strategy"] = json!(true);
    config["source"]["resolveModesFromEvidence"] = json!(true);
    config["source"]["modes"]["delta"] = json!(["personal-best", "session-best", "previous-lap"]);
    config["source"]["modes"]["gaps"] = json!("official");
    let configuration =
        ipc::encode(Kind::Configuration, &serde_json::to_vec(&config).unwrap()).unwrap();
    let mut assembler = Assembler::new(30, 15).unwrap();
    assembler.configure(&configuration).unwrap();
    let mut parity = std::env::var("LMU_HIGH_RATE_PARITY_OUT").ok().map(|out| {
        fs::create_dir_all(&out).unwrap();
        BufWriter::new(
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(Path::new(&out).join("rust-products.jsonl"))
                .unwrap(),
        )
    });
    let mut latest_shm = Vec::new();
    let mut latest_shm_ns = 0;
    let mut last_event_ns = 0;
    let mut shm = 0;
    let mut rest = 0;
    let mut overlays = 0;
    let mut engineers = 0;
    let mut strategies = 0;
    let mut facts = 0;
    let mut acks = 0;
    for event in &manifest.events {
        let now_ns = elapsed_ns(first_utc_ns, &event.at_utc);
        assert!(now_ns >= last_event_ns, "event clock reversed");
        last_event_ns = now_ns;
        let occurred_ns = i64::try_from(utc_ns(&event.at_utc)).unwrap();
        let frames = match event.kind.as_str() {
            "shm" => {
                assert_eq!(event.index, shm);
                assert_eq!(event.file, format!("shm-{shm:05}.bin"));
                assert_eq!(event.vehicles, Some(manifest.vehicles));
                latest_shm = fs::read(dir.join(&event.file)).unwrap();
                assert_eq!(latest_shm.len(), OBJECT_OUT_SIZE);
                let grid = admit_v13(&latest_shm, &manifest.build).unwrap();
                assert_eq!(grid.vehicles.len(), manifest.vehicles);
                let vantare_telemetry::quality::Field::Present {
                    value: source_ns, ..
                } = grid.session.source_time_ns
                else {
                    panic!("SHM source clock absent at {shm}");
                };
                assert_eq!(source_ns / 1_000_000, event.source_ms.unwrap());
                latest_shm_ns = now_ns;
                shm += 1;
                assembler
                    .apply(
                        &latest_shm,
                        &manifest.build,
                        latest_shm_ns,
                        now_ns,
                        occurred_ns,
                    )
                    .unwrap()
            }
            "rest" => {
                assert_eq!(event.index, rest);
                assert_eq!(event.file, format!("rest-{rest:05}.json"));
                assert!(!latest_shm.is_empty());
                let started =
                    elapsed_ns(first_utc_ns, event.standings_started_utc.as_ref().unwrap());
                let standings_done = elapsed_ns(
                    first_utc_ns,
                    event.standings_completed_utc.as_ref().unwrap(),
                );
                let session_started =
                    elapsed_ns(first_utc_ns, event.session_started_utc.as_ref().unwrap());
                assert!(
                    started <= standings_done
                        && standings_done <= session_started
                        && session_started <= now_ns
                );
                let bodies: RestBodies =
                    serde_json::from_slice(&fs::read(dir.join(&event.file)).unwrap()).unwrap();
                assert_eq!(bodies.schema, "vantare.lmu-rest-bodies.v1");
                let cache = assembler.rest_cache_mut();
                cache.accept_standings(
                    &serde_json::to_vec(&bodies.standings).unwrap(),
                    started,
                    standings_done,
                );
                cache.accept_session(&serde_json::to_vec(&bodies.session_info).unwrap(), now_ns);
                rest += 1;
                assembler
                    .apply(
                        &latest_shm,
                        &manifest.build,
                        latest_shm_ns,
                        now_ns,
                        occurred_ns,
                    )
                    .unwrap()
            }
            _ => panic!("unknown corpus event kind"),
        };
        let mut seen = [false; 3];
        let mut overlay_payload = None;
        let mut engineer_payload = None;
        let mut strategy_payload = None;
        let mut event_facts = Vec::new();
        for frame in frames {
            let decoded = ipc::decode(&frame).unwrap();
            match decoded.kind {
                Kind::Snapshot => {
                    let value: Value = serde_json::from_slice(decoded.payload).unwrap();
                    match value["product"].as_str().unwrap() {
                        "overlay-v2" => {
                            assert!(!seen[0]);
                            assert_eq!(
                                value["update"]["frame"]["standings"]
                                    .as_array()
                                    .unwrap()
                                    .len(),
                                manifest.vehicles
                            );
                            seen[0] = true;
                            overlays += 1;
                            overlay_payload = Some(value["update"]["frame"].clone());
                        }
                        "engineer-v1" => {
                            assert!(!seen[1]);
                            assert_eq!(
                                value["snapshot"]["vehicles"].as_array().unwrap().len(),
                                manifest.vehicles
                            );
                            seen[1] = true;
                            engineers += 1;
                            engineer_payload = Some(temporal_payload(&value["snapshot"]));
                        }
                        "strategy-v1" => {
                            assert!(!seen[2]);
                            seen[2] = true;
                            strategies += 1;
                            strategy_payload = Some(temporal_payload(&value["snapshot"]));
                        }
                        other => panic!("unexpected product {other}"),
                    }
                }
                Kind::Fact => {
                    let value: Value = serde_json::from_slice(decoded.payload).unwrap();
                    event_facts.push(value["fact"].clone());
                    facts += 1;
                }
                Kind::ConfigurationAck => {
                    assert_eq!(acks, 0);
                    acks += 1;
                }
                other => panic!("unexpected frame kind {other:?}"),
            }
        }
        assert!(
            seen.into_iter().all(|value| value),
            "incomplete product delivery"
        );
        if let Some(writer) = parity.as_mut() {
            let line = json!({
                "overlay": overlay_payload.unwrap(),
                "engineer": engineer_payload.unwrap(),
                "strategy": strategy_payload.unwrap(),
                "facts": event_facts,
            });
            serde_json::to_writer(&mut *writer, &line).unwrap();
            writer.write_all(b"\n").unwrap();
        }
    }
    if let Some(writer) = parity.as_mut() {
        writer.flush().unwrap();
    }
    assert_eq!((shm, rest), (manifest.shm_ticks, manifest.rest_reports));
    assert_eq!((overlays, engineers, strategies), (3839, 3839, 3839));
    assert!(facts > 0);
    assert_eq!(acks, 1);
    eprintln!(
        "LMU47_HIGH_RATE_RUST events=3839 SHM={shm} REST={rest} products={overlays}/{engineers}/{strategies} facts={facts}"
    );
}

fn temporal_payload(snapshot: &Value) -> Value {
    let mut payload = snapshot.clone();
    let fields = payload.as_object_mut().unwrap();
    for metadata in [
        "canonicalVersion",
        "projectionVersion",
        "epoch",
        "sequence",
        "capturedAt",
    ] {
        assert!(fields.remove(metadata).is_some());
    }
    payload
}
