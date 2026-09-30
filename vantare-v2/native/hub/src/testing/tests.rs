use super::{
    diagnostic::{self, Diagnostic, Module, Observed},
    store::{self, Draft, Store},
};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};
use vantare_domain::{Snapshot, SourceKind, SourceState};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "vantare-testing-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).expect("crear directorio aislado");
        Self(path)
    }
    fn draft(&self) -> PathBuf {
        self.0.join("testing-center/report-draft.json")
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("limpiar directorio aislado de prueba");
    }
}
fn diagnostic(temp: &Temp, observed: &Observed) -> Diagnostic {
    Diagnostic::collect(&temp.0, &temp.0, observed, Instant::now())
}

#[test]
fn whitelist_drops_personal_paths_names_tokens_and_snapshot_content() {
    let temp = Temp::new();
    let private = "María García C:\\Users\\María\\secret.txt /home/Maria token=eyJhbGciOiJIUzI1NiJ9 Bearer sk-private";
    let mut observed = Observed::default();
    observed.error(Module::Engineer, private);
    let mut snapshot = Snapshot::default();
    snapshot.origin.source.simulator = "Bearer sk-private";
    snapshot.origin.source.kind = SourceKind::Replay;
    snapshot.state.source_state = SourceState::Stale;
    snapshot.state.cars.push(vantare_domain::Car {
        driver: vantare_domain::Driver {
            name: private.into(),
            ..Default::default()
        },
        ..Default::default()
    });
    observed.snapshot(&snapshot);
    let mut draft = Draft::new();
    draft.fields = std::array::from_fn(|_| private.into());
    let diagnostic = Diagnostic::collect(
        &temp.0,
        Path::new("C:/Users/María/secret.txt"),
        &observed,
        Instant::now(),
    );
    let bytes = store::export_bytes(&draft, &diagnostic).expect("exportar");
    let text = String::from_utf8(bytes.clone()).expect("UTF-8");
    for secret in [
        "María",
        "García",
        "Maria",
        "Users",
        "secret.txt",
        "eyJ",
        "Bearer",
        "sk-private",
    ] {
        assert!(!text.contains(secret), "filtra {secret}");
    }
    let value: serde_json::Value = serde_json::from_slice(&bytes).expect("JSON");
    assert_eq!(value["privateText"], "omitted_for_privacy");
    assert_eq!(
        value["privateFieldsPresent"],
        serde_json::json!([true, true, true, true])
    );
    let mut keys: Vec<_> = value
        .as_object()
        .expect("objeto")
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();
    assert_eq!(
        keys,
        [
            "diagnostic",
            "module",
            "privateFieldsPresent",
            "privateText",
            "schemaVersion"
        ]
    );
    assert_eq!(value["diagnostic"]["source"]["simulator"], "unknown");
    assert_eq!(value["diagnostic"]["source"]["kind"], "replay");
    assert_eq!(value["diagnostic"]["source"]["state"], "stale");
    assert_eq!(
        value["diagnostic"]["sectionErrors"][0]["code"],
        "local_error"
    );
    assert!(value["diagnostic"].get("snapshot").is_none());
    assert!(value["diagnostic"].get("pipe").is_none());
    let mut diagnostic_keys: Vec<_> = value["diagnostic"]
        .as_object()
        .expect("diagnóstico")
        .keys()
        .map(String::as_str)
        .collect();
    diagnostic_keys.sort_unstable();
    assert_eq!(
        diagnostic_keys,
        [
            "arch",
            "binaries",
            "core",
            "dataPaths",
            "generatedAtUtc",
            "os",
            "schemaVersion",
            "sectionErrors",
            "source",
            "uninstrumentedSections",
            "version"
        ]
    );
}

#[test]
fn observed_core_silence_does_not_invent_connection_or_source_freshness() {
    let temp = Temp::new();
    let now = Instant::now();
    let mut observed = Observed::default();
    let get = |observed: &Observed, now| {
        serde_json::to_value(Diagnostic::collect(&temp.0, &temp.0, observed, now)).expect("JSON")
    };
    assert_eq!(get(&observed, now)["core"], "unobserved");
    observed.activity(0, now);
    assert_eq!(get(&observed, now)["core"], "unobserved");
    observed.activity(1, now);
    assert_eq!(get(&observed, now)["core"], "recent_messages");
    assert!(get(&observed, now)["source"].is_null());
    observed.activity(1, now + Duration::from_secs(3));
    assert_eq!(
        get(&observed, now + Duration::from_secs(3))["core"],
        "silent"
    );
    observed.activity(2, now + Duration::from_secs(4));
    assert_eq!(
        get(&observed, now + Duration::from_secs(4))["core"],
        "recent_messages"
    );
}

#[test]
fn private_draft_roundtrips_and_byte_conflicts_preserve_both_edits() {
    let temp = Temp::new();
    let mut first = Store::new(&temp.0);
    first.reload().expect("sin archivo");
    first.draft.fields[0] = "Abrí Studio".into();
    first.save().expect("guardar");
    let mut second = Store::new(&temp.0);
    second.reload().expect("cargar");
    assert_eq!(second.draft.fields[0], "Abrí Studio");
    first.draft.fields[2] = "Error al guardar".into();
    first.save().expect("guardar segunda edición");
    let saved = fs::read(temp.draft()).expect("leer");
    second.draft.fields[2] = "Mi edición sin guardar".into();
    assert!(second.save().is_err());
    assert_eq!(fs::read(temp.draft()).expect("leer"), saved);
    assert_eq!(second.draft.fields[2], "Mi edición sin guardar");
    second.reload().expect("recargar explícitamente");
    assert_eq!(second.draft.fields[2], "Error al guardar");
    let mut whitespace_edit = saved.clone();
    whitespace_edit.push(b'\n');
    fs::write(temp.draft(), &whitespace_edit).expect("cambio externo solo de bytes");
    assert!(second.save().is_err());
    assert_eq!(fs::read(temp.draft()).expect("leer"), whitespace_edit);
}

#[test]
fn corrupt_unknown_and_oversized_drafts_are_preserved_and_never_exported() {
    let temp = Temp::new();
    fs::create_dir(temp.0.join("testing-center")).expect("directorio");
    for bytes in [b"{".to_vec(), b"{\"schemaVersion\":1,\"module\":\"hub\",\"fields\":[\"\",\"\",\"\",\"\"],\"token\":\"private\"}".to_vec(), vec![b' '; 16385]] {
        fs::write(temp.draft(), &bytes).expect("corrupto");
        let mut store = Store::new(&temp.0);
        assert!(store.reload().is_err());
        store.draft.fields[0] = "Mi edición".into();
        assert!(store.save().is_err());
        assert_eq!(fs::read(temp.draft()).expect("leer"), bytes);
    }
    let mut draft = Draft::new();
    draft.fields[0] = "a".repeat(2049);
    assert!(store::export_bytes(&draft, &diagnostic(&temp, &Observed::default())).is_err());
    draft.fields[0] = "á".repeat(1024);
    draft.validate().expect("UTF-8 dentro del límite");
    draft.fields[0].push('á');
    assert!(draft.validate().is_err());
}

#[test]
fn failed_atomic_save_and_existing_export_never_overwrite_user_files() {
    let temp = Temp::new();
    let mut store = Store::new(&temp.0);
    store.draft.fields[0] = "Antes".into();
    store.save().expect("guardar");
    let before = fs::read(temp.draft()).expect("leer");
    fs::write(
        temp.0.join("testing-center/report-draft.json.tmp"),
        b"temporal ajeno",
    )
    .expect("temporal");
    store.draft.fields[0] = "Después".into();
    assert!(store.save().is_err());
    assert_eq!(fs::read(temp.draft()).expect("leer"), before);
    let bytes = store::export_bytes(&store.draft, &diagnostic(&temp, &Observed::default()))
        .expect("exportar");
    let export = temp.0.join("report.json");
    store::export(&export, &bytes).expect("crear exportación");
    assert!(store::export(&export, b"replacement").is_err());
    assert_eq!(fs::read(export).expect("leer exportación"), bytes);
    assert!(store::export(&temp.0.join("report.zip"), &bytes).is_err());
}

#[test]
fn unc_and_device_paths_are_rejected_before_io() {
    for path in [
        r"\\server\share\report.json",
        "//server/share/report.json",
        r"\\?\UNC\server\share\report.json",
        r"\\.\pipe\secret",
    ] {
        assert!(!diagnostic::local_path(Path::new(path)));
        assert!(store::export(Path::new(path), b"{}").is_err());
        assert!(Store::new(Path::new(path)).reload().is_err());
        assert!(
            diagnostic::binaries(Path::new(path))
                .iter()
                .all(|binary| binary.state == "unavailable")
        );
    }
}

#[cfg(windows)]
#[test]
fn bcrypt_hash_matches_known_vector_and_inventory_ignores_unlisted_files() {
    let temp = Temp::new();
    fs::write(temp.0.join("vantare-hub.exe"), b"abc").expect("binario de prueba");
    fs::write(temp.0.join("private-token.exe"), b"secreto de prueba")
        .expect("archivo fuera de lista");
    let binaries = diagnostic::binaries(&temp.0);
    assert_eq!(binaries.len(), 9);
    assert_eq!(binaries[0].state, "present");
    assert_eq!(
        binaries[0].sha256.as_deref(),
        Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    );
    assert!(
        binaries[1..]
            .iter()
            .all(|binary| binary.state == "missing" && binary.sha256.is_none())
    );
    fs::write(temp.0.join("vantare-hub.exe"), vec![b'a'; 1_000_000]).expect("streaming");
    assert_eq!(
        diagnostic::binaries(&temp.0)[0].sha256.as_deref(),
        Some("cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0")
    );
    let large = fs::File::create(temp.0.join("vantare-core.exe")).expect("crear sparse");
    large.set_len(512 * 1024 * 1024 + 1).expect("límite");
    drop(large);
    assert_eq!(diagnostic::binaries(&temp.0)[2].state, "unreadable");
}
