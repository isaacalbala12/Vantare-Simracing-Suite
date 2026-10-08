//! Paridad contra el pipeline Go congelado, con corpus y goldens obligatorios.
//! La lista de excepciones es exacta: desaparecer o cambiar también falla.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use vantare_domain::{Adapter, Gap, Quality, SessionKind, Snapshot};
use vantare_runtime::{adapter::open_replay, core::Core};

const MANIFEST_SHA256: &str = "b53373be4ebe61ded864c63f860998e5f40dff9340e81dee68c02cf58cd0f6b9";
const EXCEPTIONS_SHA256: &str = "dbf34205236ee51a039846b4c4212affc3171205cbaf1ea7af2dcc67d5eaf665";
// Go stores source durations at nanosecond precision; the common contract
// displays milliseconds. 1 ms also bounds gaps, with no relative tolerance.
const TIME_TOLERANCE_MS: f64 = 1.0;

fn oracle_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/oracle")
}

fn verify_hash(content: &[u8], expected: &str) -> Result<(), String> {
    let actual = format!("{:x}", Sha256::digest(content));
    if actual == expected {
        Ok(())
    } else {
        Err(format!("SHA-256 {actual}; esperado {expected}"))
    }
}

fn verified_bytes(path: &Path, expected: &str) -> Result<Vec<u8>, String> {
    let bytes = fs::read(path).map_err(|error| format!("{}: {error}", path.display()))?;
    verify_hash(&bytes, expected).map_err(|error| format!("{}: {error}", path.display()))?;
    Ok(bytes)
}

fn load_json(path: &Path, expected: &str) -> Value {
    let bytes = verified_bytes(path, expected).expect("entrada obligatoria congelada");
    serde_json::from_slice(&bytes).expect("JSON del oráculo")
}

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value[key].as_str().expect("campo de texto obligatorio")
}

// Go quality measures freshness; Rust Estimated measures authority. Both
// Reliable and Estimated are current, hence fresh in the comparison view.
// Invalid is not folded into missing here: every such difference is audited.
fn cell<T>(quality: &Quality<T>, value: impl FnOnce(&T) -> Value) -> Value {
    match quality {
        Quality::Reliable(v) | Quality::Estimated(v) => json!({"q": "fresh", "v": value(v)}),
        Quality::Stale(v) => json!({"q": "stale", "v": value(v)}),
        Quality::Unavailable => json!({"q": "missing", "v": null}),
    }
}

fn gap(quality: &Quality<Gap>) -> Value {
    cell(quality, |gap| match gap {
        Gap::Time { seconds } => json!({"time_ms": seconds * 1000.0}),
        Gap::Laps { count } => json!({"laps": count}),
    })
}

fn common_values(snapshot: &Snapshot) -> Value {
    let session = &snapshot.state.session;
    let mut cars: Vec<_> = snapshot.state.cars.iter().collect();
    cars.sort_by_key(|car| car.position.current().copied().unwrap_or(u32::MAX));
    let cars: Vec<Value> = cars
        .into_iter()
        .map(|car| {
            json!({
                "ordinal": car.id.0,
                "number": car.number,
                "driver": car.driver.name,
                "class": car.class.as_ref().map_or("", |class| class.name.as_str()),
                "position": cell(&car.position, |v| json!(v)),
                "class_position": cell(&car.class_position, |v| json!(v)),
                "laps": cell(&car.laps, |v| json!(v)),
                "last_lap_ms": cell(&car.last_lap_s, |v| json!(v * 1000.0)),
                "best_lap_ms": cell(&car.best_lap_s, |v| json!(v * 1000.0)),
                "gap_leader": gap(&car.gap_leader),
                "gap_ahead": gap(&car.gap_ahead),
                "in_pits": cell(&car.in_pits, |v| json!(v)),
            })
        })
        .collect();
    json!({
        "go_rejection": "",
        "session": {
            "kind": cell(&session.kind, |kind| json!(match kind {
                SessionKind::Practice => "practice",
                SessionKind::Qualifying => "qualifying",
                SessionKind::Race => "race",
                SessionKind::Other(name) => name,
            })),
            "remaining_ms": cell(&session.remaining_s, |v| json!(v * 1000.0)),
            "track": cell(&session.track_name, |v| json!(v)),
        },
        "cars": cars,
    })
}

fn close(expected: &Value, actual: &Value, path: &str) -> bool {
    if (path.ends_with("_ms.v") || path.ends_with(".time_ms"))
        && let (Some(a), Some(b)) = (expected.as_f64(), actual.as_f64())
    {
        return a.is_finite() && b.is_finite() && (a - b).abs() <= TIME_TOLERANCE_MS;
    }
    expected == actual
}

fn differences(expected: &Value, actual: &Value, path: &str, out: &mut Vec<Value>) {
    match (expected, actual) {
        (Value::Object(a), Value::Object(b))
            if a.len() == b.len() && a.keys().all(|key| b.contains_key(key)) =>
        {
            for (key, value) in a {
                differences(
                    value,
                    b.get(key).expect("campo nativo obligatorio"),
                    &format!("{path}.{key}"),
                    out,
                );
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{path}: número de coches distinto");
            for (index, (a, b)) in a.iter().zip(b).enumerate() {
                differences(a, b, &format!("{path}[{index}]"), out);
            }
        }
        _ if !close(expected, actual, path) => {
            out.push(json!({"path": path, "go": expected, "native": actual}));
        }
        _ => {}
    }
}

fn compare(entry: &Value, snapshot: &Snapshot, out: &mut Vec<Value>) {
    let file = text(entry, "file");
    let mut expected = load_json(&oracle_dir().join(file), text(entry, "sha256"));
    for row in expected["cars"].as_array_mut().expect("coches Go") {
        // The full Go ID is retained in each golden. Its ordinal is the
        // namespace-independent first-appearance identity, checked above all
        // other fields, including when classification order changes.
        let id = text(row, "id");
        assert!(
            id.starts_with("lmu-slot-") && id.contains("-generation-"),
            "identidad Go inválida"
        );
        row.as_object_mut().expect("fila Go").remove("id");
    }
    differences(&expected, &common_values(snapshot), file, out);
}

#[test]
fn lmu_standings_match_the_frozen_go_oracle() {
    let dir = oracle_dir();
    let manifest = load_json(&dir.join("manifest.json"), MANIFEST_SHA256);
    assert_eq!(manifest["schema"], "vantare.native-lmu-oracle.v1");
    assert_eq!(
        manifest["go_commit"],
        "3ced668f22aa79819aefae059d28b15d52452274"
    );
    let entries = manifest["entries"].as_array().expect("lista de goldens");
    assert_eq!(entries.len(), 72, "12 fixtures y 60 muestras obligatorios");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let mut observed = Vec::new();
    let mut corpus_entries = BTreeMap::new();
    let mut fixtures = 0;
    for entry in entries {
        let input = text(entry, "input");
        if input.ends_with(".tar.gz") {
            let event = entry["event"].as_u64().expect("índice de evento");
            assert!(
                corpus_entries.insert(event, entry).is_none(),
                "muestra duplicada"
            );
        } else {
            fixtures += 1;
            verified_bytes(&root.join(input), text(entry, "input_sha256"))
                .expect("hash de fixture");
            let mut replay = open_replay(&root.join(input), Some(text(entry, "build")))
                .expect("fixture LMU obligatorio");
            let mut core = Core::new(1);
            core.step(&mut replay, Duration::ZERO)
                .expect("fixture adaptador + núcleo");
            let snapshot = core.snapshot();
            assert_eq!(snapshot.sequence, 1, "fixture sin observación");
            compare(entry, &snapshot, &mut observed);
        }
    }
    assert_eq!((fixtures, corpus_entries.len()), (12, 60));
    let first = *corpus_entries.values().next().expect("muestras del corpus");
    let input = root.join(text(first, "input"));
    verified_bytes(&input, text(first, "input_sha256")).expect("hash del corpus real");
    let mut replay = open_replay(&input, None).expect("corpus temporal obligatorio");
    let mut core = Core::new(1);
    let schedule = manifest["corpus_schedule_ns"]
        .as_array()
        .expect("horario completo");
    assert_eq!(schedule.len(), 3839);
    let mut compared = 0;
    for (index, instant) in schedule.iter().enumerate() {
        let index = u64::try_from(index).expect("índice acotado");
        let now = Duration::from_nanos(instant.as_u64().expect("instante no negativo"));
        core.step(&mut replay, now)
            .expect("corpus adaptador + núcleo");
        let snapshot = core.snapshot();
        assert_eq!(
            snapshot.sequence,
            index + 1,
            "evento {index} sin observación (corpus truncado)"
        );
        if let Some(entry) = corpus_entries.get(&index) {
            compare(entry, &snapshot, &mut observed);
            compared += 1;
        }
    }
    assert_eq!(compared, 60);
    // Optional diagnostic artifact; it does not approve or change exceptions.
    if let Ok(path) = std::env::var("NATIVE_ORACLE_DIFF_OUT") {
        fs::write(
            path,
            serde_json::to_vec_pretty(&observed).expect("informe JSON"),
        )
        .expect("escribir informe solicitado");
    }
    let exceptions = load_json(&dir.join("exceptions.json"), EXCEPTIONS_SHA256);
    let allowed = exceptions.as_array().expect("excepciones explícitas");
    let mut expected: BTreeMap<_, _> = allowed
        .iter()
        .map(|exception| {
            assert!(
                !text(exception, "reason").is_empty(),
                "excepción sin explicación"
            );
            (
                text(exception, "path").to_owned(),
                json!({"path": exception["path"], "go": exception["go"], "native": exception["native"]}),
            )
        })
        .collect();
    assert_eq!(expected.len(), allowed.len(), "excepciones duplicadas");
    let unexpected: Vec<_> = observed
        .into_iter()
        .filter(|difference| expected.remove(text(difference, "path")).as_ref() != Some(difference))
        .collect();
    assert!(
        unexpected.is_empty() && expected.is_empty(),
        "{} diferencias no autorizadas; {} excepciones que ya no aplican.\n{}",
        unexpected.len(),
        expected.len(),
        serde_json::to_string_pretty(&unexpected).expect("diagnóstico JSON")
    );
}

#[test]
fn the_lmu_adapter_preserves_the_four_real_lap_deficits() {
    let manifest = load_json(&oracle_dir().join("manifest.json"), MANIFEST_SHA256);
    let entry = manifest["entries"]
        .as_array()
        .expect("goldens")
        .iter()
        .find(|entry| entry["file"] == "lmu-1.4.1.3-track-fixture.json")
        .expect("fixture con vueltas perdidas obligatorio");
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(text(entry, "input"));
    verified_bytes(&path, text(entry, "input_sha256")).expect("fixture pinneado");
    let mut replay = open_replay(&path, Some(text(entry, "build"))).expect("replay real");
    let observation = replay
        .poll(Duration::ZERO)
        .expect("adaptador LMU")
        .expect("observación");
    let cars: Vec<_> = observation
        .state
        .cars
        .iter()
        .filter(|car| car.position.current().is_some_and(|p| (9..=12).contains(p)))
        .collect();
    assert_eq!(cars.len(), 4);
    for car in cars {
        assert_eq!(car.gap_leader, Quality::Reliable(Gap::Laps { count: 1 }));
    }
}

#[test]
fn json_member_order_does_not_change_parity() {
    // The full workspace enables serde_json/preserve_order via GPUI; this
    // must compare exactly like the runtime alone, which sorts object keys.
    let expected: Value =
        serde_json::from_str(r#"{"gap_ahead":{"v":{"time_ms":0},"q":"fresh"},"ordinal":30}"#)
            .expect("JSON Go");
    let actual: Value =
        serde_json::from_str(r#"{"ordinal":30,"gap_ahead":{"q":"fresh","v":{"time_ms":0.0}}}"#)
            .expect("JSON nativo");
    let mut observed = Vec::new();
    differences(&expected, &actual, "row", &mut observed);
    assert!(observed.is_empty(), "el orden de claves no es un dato");
}

#[test]
fn integrity_checks_reject_missing_and_changed_goldens() {
    assert!(verified_bytes(&oracle_dir().join("missing-golden.json"), MANIFEST_SHA256).is_err());
    let digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    assert!(verify_hash(b"abc", digest).is_ok());
    assert!(verify_hash(b"abd", digest).is_err());
}

#[test]
fn tolerance_is_absolute_and_never_masks_absence_or_lap_counts() {
    assert!(close(&json!(100_000.0), &json!(100_000.9), "last_lap_ms.v"));
    assert!(!close(
        &json!(100_000.0),
        &json!(100_002.0),
        "last_lap_ms.v"
    ));
    assert!(!close(&json!(0), &Value::Null, "gap_leader.v.time_ms"));
    assert!(!close(&json!(1), &json!(2), "gap_leader.v.laps"));
}
