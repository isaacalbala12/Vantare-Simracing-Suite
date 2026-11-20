//! CPU-only installed-update regression fixtures; no product executable is launched.
use super::*;
use crate::installed::{ADOPTION_WAITS, adopt_recordings_with, apply, stage_with};
use std::{os::windows::process::CommandExt, path::Path, process::Command};

fn manifest(version: &str) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","version":version,"channel":"beta","data_schema":"opaque-v1","source_sha":"a".repeat(40),"source_dirty":false,"build_profile":"Debug","engine":2,"files":[{"path":"fixture.txt","size":5,"sha256":format!("{:x}", sha2::Sha256::digest(b"hello"))}]})).expect("manifest")
}
fn installed(root: &Path) -> Vec<u8> {
    let generation = "a".repeat(32);
    let directory = root.join("generations").join(&generation);
    fs::create_dir_all(directory.join("data")).expect("data directory");
    fs::write(directory.join("data/opaque.bin"), b"disposable opaque data").expect("data");
    fs::write(directory.join("fixture.txt"), b"hello").expect("installed member");
    let raw = manifest("0.0.989");
    fs::write(directory.join("manifest.json"), &raw).expect("active manifest");
    let state = serde_json::to_vec(&serde_json::json!({"schema":1,"product":"vantare-native","channel":"beta","active":{"generation":generation,"manifest_sha256":format!("{:x}", sha2::Sha256::digest(&raw))},"previous":null})).expect("state");
    fs::write(root.join("state.json"), &state).expect("active state");
    state
}
fn assert_preserved(root: &Path, state: &[u8]) {
    assert_eq!(fs::read(root.join("state.json")).expect("state"), state);
    assert_eq!(
        fs::read(
            root.join("generations")
                .join("a".repeat(32))
                .join("data/opaque.bin")
        )
        .expect("data"),
        b"disposable opaque data"
    );
}
#[test]
fn stage_publishes_only_after_the_extracted_total_matches_the_signed_offer() {
    for extra in [0, 1] {
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        let state = installed(&root);
        let source = root.join("package-source");
        fs::create_dir_all(&source).expect("source");
        let raw = manifest("0.0.990");
        fs::write(source.join("manifest.json"), &raw).expect("manifest");
        fs::write(source.join("fixture.txt"), b"hello").expect("member");
        let archive = root.join("package.zip");
        // The Windows system compression library creates a real tiny ZIP; no new Rust dependency.
        let output = Command::new(vantare_installer::engine::powershell().expect("system PowerShell"))
            .creation_flags(0x0800_0000)
            .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($env:VANTARE_TEST_ZIP_SOURCE,$env:VANTARE_TEST_ZIP)"])
            .env("VANTARE_TEST_ZIP_SOURCE", &source).env("VANTARE_TEST_ZIP", &archive)
            .output().expect("tiny ZIP fixture");
        assert!(output.status.success(), "{:?}", output.stderr);
        let mut candidate = offer();
        candidate.sha256 = hash_file(&archive).expect("ZIP hash");
        candidate.compressed_bytes = fs::metadata(&archive).expect("ZIP metadata").len();
        candidate.expanded_bytes = u64::try_from(raw.len()).expect("manifest length") + 5 + extra;
        let pending = signed(&candidate);
        let result = stage_with(&root, &AtomicBool::new(false), |current, staging, _, _| {
            assert_eq!(current, "0.0.989");
            fs::create_dir_all(staging)?;
            fs::copy(&archive, staging.join(format!("{}.zip", candidate.sha256)))?;
            Ok(Some(Downloaded {
                signed: pending.clone(),
                offer: candidate.clone(),
            }))
        });
        assert_eq!(
            result.is_ok(),
            extra == 0,
            "extra={extra}, result={result:?}"
        );
        assert_preserved(&root, &state);
        if extra == 0 {
            assert_eq!(
                fs::read(root.join("staging/pending.json")).expect("pending"),
                pending
            );
            let status: serde_json::Value =
                serde_json::from_slice(&fs::read(root.join("update-status.json")).expect("status"))
                    .expect("status JSON");
            assert_eq!(status["state"], "ready");
        } else {
            assert!(!root.join("staging/pending.json").exists());
            assert!(!root.join("update-status.json").exists());
        }
        assert!(
            !fs::read_dir(root.join("staging"))
                .expect("staging")
                .any(|item| item
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .starts_with("check-"))
        );
        fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn apply_rejects_legacy_pending_without_mutating_installation_or_data() {
    let root = qa_root();
    fs::create_dir_all(root.join("staging")).expect("staging");
    let state = installed(&root);
    let mut legacy = serde_json::to_value(offer()).expect("legacy fixture");
    legacy["schema"] = 1.into();
    legacy["product"] = "vantare-native".into();
    legacy["url"] = serde_json::json!(offer().url.replace("hub-beta-v", "native-beta-v"));
    let object = legacy.as_object_mut().expect("legacy object");
    object.remove("compressed_bytes");
    object.remove("expanded_bytes");
    let payload = serde_json::to_vec(&legacy).expect("legacy payload");
    let signature = SigningKey::from_bytes(&[42; 32]).sign(&payload);
    let pending = serde_json::to_vec(&serde_json::json!({"payload": STANDARD.encode(&payload), "signature": STANDARD.encode(signature.to_bytes())})).expect("legacy envelope");
    #[cfg(feature = "hub-update-qa")]
    assert_eq!(
        vantare_services::update_manifest::verify_hub_update(&pending)
            .expect("valid isolated TEST signature"),
        payload
    );
    fs::write(root.join("staging/pending.json"), &pending).expect("pending");
    let archive = root.join("staging").join(format!("{}.zip", offer().sha256));
    fs::write(&archive, b"preserve staged archive").expect("archive");
    assert!(apply(&root).is_err());
    assert_eq!(
        fs::read(root.join("staging/pending.json")).expect("preserved pending"),
        pending
    );
    assert_eq!(
        fs::read(root.join("state.json")).expect("preserved state"),
        state
    );
    assert_eq!(
        fs::read(
            root.join("generations")
                .join("a".repeat(32))
                .join("data/opaque.bin")
        )
        .expect("preserved data"),
        b"disposable opaque data"
    );
    assert_eq!(
        fs::read(&archive).expect("preserved archive"),
        b"preserve staged archive"
    );
    assert!(!root.join("update-status.json").exists());
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn the_session_brings_its_recordings_waits_its_turn_and_never_fails() {
    use vantare_installer::engine::write_fs::lock;
    let root = qa_root();
    fs::create_dir_all(&root).expect("root");
    installed(&root);
    fs::write(root.join(".vantare-native"), b"offline-candidate-v1").expect("marker");
    let generation = root.join("generations").join("a".repeat(32));
    let source = generation.join("data/hub/recordings");
    fs::create_dir_all(&source).expect("recordings of the generation");
    let [first, later] = ["series-1-1.duckdb", "series-2-2.duckdb"];
    fs::write(source.join(first), b"recording").expect("recording");
    // Already in the single folder: the session neither compares nor removes.
    let (single, repeated) = (root.join("recordings"), "series-0-0.duckdb");
    fs::create_dir(&single).expect("single folder");
    for folder in [&source, &single] {
        fs::write(folder.join(repeated), b"same").expect("repeated recording");
    }
    let (single, log) = (root.join("recordings"), root.join("installer-log.txt"));
    let lines = || fs::read_to_string(&log).map_or(0, |text| text.lines().count());
    // The launcher renews the registration under the same lock: the session waits its turn.
    let mut held = Some(lock(&root, ".operation.lock").expect("another operation"));
    let mut waits = 0;
    adopt_recordings_with(&root, &mut |_| {
        waits += 1;
        if waits == 3 {
            held.take();
        }
    });
    assert_eq!(waits, 3);
    assert_eq!(fs::read(single.join(first)).expect("adopted"), b"recording");
    assert!(!source.join(first).exists() && source.join(repeated).exists());
    assert_eq!(lines(), 2, "what stays and what arrived");
    // Never released: after its two seconds it starts anyway and says so in the log.
    fs::write(source.join(later), b"later").expect("recording");
    let held = lock(&root, ".operation.lock").expect("another operation");
    let mut waits = 0;
    adopt_recordings_with(&root, &mut |_| {
        waits += 1;
        assert!(waits <= ADOPTION_WAITS, "it must not wait for ever");
    });
    drop(held);
    assert_eq!(waits, ADOPTION_WAITS);
    assert!(source.join(later).exists() && !single.join(later).exists() && lines() == 3);
    // A refusal is not waited for, and is written once however many starts repeat it.
    fs::rename(&single, root.join("apartada")).expect("the single folder, set aside");
    fs::write(&single, b"not a folder").expect("a file in its place");
    for _ in 0..2 {
        adopt_recordings_with(&root, &mut |_| panic!("a refusal is not busy"));
        assert!(source.join(later).exists() && lines() == 4);
    }
    fs::remove_dir_all(root).expect("cleanup");
}
