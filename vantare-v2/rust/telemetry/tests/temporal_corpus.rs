//! Diagnostic temporal replay of an externally audited, real LMU SHM corpus.
//! The Go corpus audit verifies SHM+REST hashes and correlation first; this
//! test checks the Rust admission, commit and three demanded products.

use std::fs;
use std::path::Path;

use serde::Deserialize;
use serde_json::{Value, json};
use vantare_telemetry::assembly::Assembler;
use vantare_telemetry::ipc::{self, Kind};
use vantare_telemetry::lmu::{OBJECT_OUT_SIZE, admit_v13};
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
    let configuration =
        ipc::encode(Kind::Configuration, &serde_json::to_vec(&config).unwrap()).unwrap();
    let mut assembler = Assembler::new(30, 15).unwrap();
    assembler.configure(&configuration).unwrap();
    let mut previous_source_ns = 0;
    let parity_out = std::env::var_os("LMU_TEMPORAL_PARITY_OUT");
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
        let frames = assembler
            .apply(
                &bytes,
                &manifest.build,
                received_ns,
                received_ns,
                100_000_000_000 + i64::try_from(index).unwrap() * 1_000_000_000,
            )
            .unwrap();
        let mut products = Vec::new();
        let mut engineer_player = None;
        let mut strategy_player = None;
        let mut engineer_payload = None;
        let mut strategy_payload = None;
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
                }
                if product == "engineer-v1" {
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
        }
        assert_eq!(products, ["overlay-v2", "engineer-v1", "strategy-v1"]);
        assert_eq!(engineer_player, strategy_player);
        assert!(engineer_player.is_some());
        if parity_out.is_some() {
            parity.push(json!({
                "engineer": engineer_payload.unwrap(),
                "strategy": strategy_payload.unwrap(),
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
