//! Diagnostic temporal replay of an externally audited, real LMU SHM corpus.
//! The Go corpus audit verifies SHM+REST hashes and correlation first; this
//! test checks the Rust admission, commit and three demanded products.

use std::fs;
use std::path::Path;

use serde::Deserialize;
use serde_json::{Value, json};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use vantare_telemetry::assembly::Assembler;
use vantare_telemetry::engine::Engine;
use vantare_telemetry::ipc::snapshot::{self, EngineerIdentity, ProductMetadata};
use vantare_telemetry::ipc::{self, Kind};
use vantare_telemetry::lmu::{OBJECT_OUT_SIZE, admit_v13};
use vantare_telemetry::projection::engineer;
use vantare_telemetry::quality::Field;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    build: String,
    samples: Vec<Sample>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    index: usize,
    at_utc: String,
    source_ms: u64,
    vehicles: usize,
    shared_file: String,
}

#[test]
fn external_real_temporal_shm_reaches_all_rust_products() {
    let Ok(dir) = std::env::var("LMU_TEMPORAL_CORPUS") else {
        return;
    };
    let expected: usize = std::env::var("LMU_TEMPORAL_EXPECTED_VEHICLES")
        .expect("set expected real vehicle count")
        .parse()
        .expect("expected vehicle count must be an integer");
    assert!((46..=104).contains(&expected));
    let dir = Path::new(&dir);
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(dir.join("manifest.json")).unwrap()).unwrap();
    assert!((8..=240).contains(&manifest.samples.len()));
    let mut config: Value = serde_json::from_slice(
        ipc::decode(include_bytes!("../testdata/configuration-frame-go-v1.bin"))
            .unwrap()
            .payload,
    )
    .unwrap();
    config["consumers"]["strategy"] = json!(true);
    if std::env::var_os("LMU_TEMPORAL_RESOLVE_MODES").is_some() {
        config["source"]["resolveModesFromEvidence"] = json!(true);
        config["source"]["modes"]["delta"] =
            json!(["personal-best", "session-best", "previous-lap"]);
        config["source"]["modes"]["gaps"] = json!("official");
    }
    let configuration =
        ipc::encode(Kind::Configuration, &serde_json::to_vec(&config).unwrap()).unwrap();
    let mut assembler = Assembler::new(30, 15).unwrap();
    assembler.configure(&configuration).unwrap();
    let mut previous_source_ns = 0;
    let parity_out = std::env::var_os("LMU_TEMPORAL_PARITY_OUT");
    let binary_out = std::env::var_os("LMU_TEMPORAL_BINARY_OUT");
    let mut binary_engine = binary_out.as_ref().map(|_| Engine::new(30, 15).unwrap());
    if let Some(out) = &binary_out {
        fs::create_dir_all(out).unwrap();
    }
    let mut parity = Vec::new();
    for (index, sample) in manifest.samples.iter().enumerate() {
        assert_eq!(sample.index, index);
        assert_eq!(sample.vehicles, expected);
        assert_eq!(sample.shared_file, format!("{index:03}-shm.bin"));
        let bytes = fs::read(dir.join(&sample.shared_file)).unwrap();
        assert_eq!(bytes.len(), OBJECT_OUT_SIZE);
        let grid = admit_v13(&bytes, &manifest.build).unwrap();
        assert_eq!(grid.vehicles.len(), expected);
        assert!(grid.player_index.is_some());
        let Field::Present {
            value: source_ns, ..
        } = grid.session.source_time_ns
        else {
            panic!("sample {index} lacks a source clock");
        };
        assert_eq!(
            source_ns / 1_000_000,
            i64::try_from(sample.source_ms).unwrap()
        );
        assert!(source_ns > previous_source_ns);
        previous_source_ns = source_ns;
        let received_ns = u64::try_from(source_ns).unwrap();
        let occurred_ns = i64::try_from(
            OffsetDateTime::parse(&sample.at_utc, &Rfc3339)
                .unwrap()
                .unix_timestamp_nanos(),
        )
        .unwrap();
        let frames = assembler
            .apply(
                &bytes,
                &manifest.build,
                received_ns,
                received_ns,
                occurred_ns,
            )
            .unwrap();
        let mut products = Vec::new();
        let mut engineer_player = None;
        let mut strategy_player = None;
        let mut engineer_payload = None;
        let mut strategy_payload = None;
        let mut overlay_payload = None;
        let mut facts_payload = Vec::new();
        let mut engineer_json_frame = None;
        let mut engineer_captured_at = None;
        for frame in &frames {
            let decoded = ipc::decode(frame).unwrap();
            if decoded.kind == Kind::Snapshot {
                let value: Value = serde_json::from_slice(decoded.payload).unwrap();
                let product = value["product"].as_str().unwrap();
                if product == "overlay-v2" {
                    assert_eq!(
                        value["update"]["frame"]["standings"]
                            .as_array()
                            .unwrap()
                            .len(),
                        expected
                    );
                    overlay_payload = Some(value["update"]["frame"].clone());
                }
                if product == "engineer-v1" {
                    engineer_json_frame = Some(frame.clone());
                    engineer_captured_at =
                        value["snapshot"]["capturedAt"].as_str().map(str::to_owned);
                    assert_eq!(
                        value["snapshot"]["vehicles"].as_array().unwrap().len(),
                        expected
                    );
                    assert_eq!(value["identity"]["event"], "lmu-event-1");
                    assert_eq!(value["identity"]["session"], "lmu-session-1");
                    assert_eq!(
                        value["identity"]["vehicle"],
                        value["snapshot"]["player"]["id"]
                    );
                    assert!(!value["identity"]["driver"].as_str().unwrap().is_empty());
                    let projected_time = value["snapshot"]["sourceTimeSeconds"]["value"]
                        .as_f64()
                        .unwrap();
                    assert!((projected_time - source_ns as f64 / 1e9).abs() < 1e-6);
                    engineer_player = value["snapshot"]["player"]["id"]
                        .as_str()
                        .map(str::to_owned);
                    engineer_payload = Some(temporal_payload(&value["snapshot"]));
                }
                if product == "strategy-v1" {
                    let projected_time = value["snapshot"]["sourceTimeSeconds"]["value"]
                        .as_f64()
                        .unwrap();
                    assert!((projected_time - source_ns as f64 / 1e9).abs() < 1e-6);
                    strategy_player = value["snapshot"]["player"]["id"]
                        .as_str()
                        .map(str::to_owned);
                    strategy_payload = Some(temporal_payload(&value["snapshot"]));
                }
                products.push(product.to_owned());
            }
            if decoded.kind == Kind::Fact {
                let value: Value = serde_json::from_slice(decoded.payload).unwrap();
                facts_payload.push(value["fact"].clone());
            }
        }
        assert_eq!(products, ["overlay-v2", "engineer-v1", "strategy-v1"]);
        assert_eq!(engineer_player, strategy_player);
        assert!(engineer_player.is_some());
        if let (Some(out), Some(binary_engine)) = (&binary_out, binary_engine.as_mut()) {
            let candidate = binary_engine
                .prepare(
                    &bytes,
                    &manifest.build,
                    received_ns,
                    received_ns,
                    occurred_ns,
                )
                .unwrap();
            let batch = candidate.batch();
            let view =
                engineer::build_typed(batch, candidate.session_remaining(), candidate.gaps());
            let player_id = batch.player_id.as_deref().unwrap();
            let player = batch
                .state
                .vehicles
                .iter()
                .find(|vehicle| vehicle.id == player_id)
                .unwrap();
            let captured_at = engineer_captured_at.as_deref().unwrap();
            let binary_frame = snapshot::encode_engineer_binary(
                &view,
                ProductMetadata {
                    epoch: batch.cursor.epoch,
                    sequence: batch.cursor.sequence,
                    captured_at,
                },
                Some(EngineerIdentity {
                    event: &batch.event_id,
                    session: &batch.session_id,
                    vehicle: player_id,
                    team: &player.team_id,
                    driver: &player.driver_id,
                }),
            )
            .unwrap();
            let out = Path::new(out);
            fs::write(
                out.join(format!("{index:03}-engineer-binary.bin")),
                binary_frame,
            )
            .unwrap();
            fs::write(
                out.join(format!("{index:03}-engineer-json.bin")),
                engineer_json_frame.unwrap(),
            )
            .unwrap();
            binary_engine.commit(candidate).unwrap();
        }
        if parity_out.is_some() {
            parity.push(json!({
                "overlay": overlay_payload.unwrap(),
                "engineer": engineer_payload.unwrap(),
                "strategy": strategy_payload.unwrap(),
                "facts": facts_payload,
            }));
        }
        assert_eq!(
            assembler.engine().current().unwrap().cursor.sequence,
            u64::try_from(index + 1).unwrap()
        );
    }
    if let Some(out) = parity_out {
        fs::create_dir_all(&out).unwrap();
        fs::write(
            Path::new(&out).join("rust-products.json"),
            serde_json::to_vec(&parity).unwrap(),
        )
        .unwrap();
    }
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
