//! CPU-only installed-update regression fixtures; no product executable is launched.
use super::*;
use crate::installed::{apply, stage_with};
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
    // Solo el primer caso coincide con lo firmado: sobra un byte o cambia la versión empaquetada.
    for (extra, packaged) in [(0, "0.0.990"), (1, "0.0.990"), (0, "0.0.991")] {
        let accepted = extra == 0 && packaged == "0.0.990";
        let root = qa_root();
        fs::create_dir_all(&root).expect("root");
        let state = installed(&root);
        let source = root.join("package-source");
        fs::create_dir_all(&source).expect("source");
        let raw = manifest(packaged);
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
            accepted,
            "extra={extra}, packaged={packaged}, result={result:?}"
        );
        assert_preserved(&root, &state);
        if accepted {
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
fn apply_honours_a_qa_signed_pending_only_in_the_isolated_qa_build() {
    let root = qa_root();
    fs::create_dir_all(root.join("staging")).expect("staging");
    let state = installed(&root);
    // Oferta de la versión ya instalada: quien acepta su firma la retira; quien no, la conserva.
    let mut current = offer();
    current.version = "0.0.989".into();
    current.url = current.url.replace("0.0.990", "0.0.989");
    let pending = root.join("staging/pending.json");
    fs::write(&pending, signed(&current)).expect("pending");
    let qa = cfg!(feature = "hub-update-qa");
    assert_eq!(apply(&root).is_ok(), qa);
    assert_eq!(pending.exists(), !qa);
    assert_preserved(&root, &state);
    fs::remove_dir_all(root).expect("cleanup");
}

#[cfg(feature = "hub-update-qa")]
#[test]
fn qa_authority_stops_before_reading_a_root_without_the_isolated_context() {
    use crate::installed::{root as launch, session};
    use vantare_installer::engine::context::{Context, qa_path};
    let arguments = |mode: &str, root: &Path| -> Vec<String> {
        vec![
            mode.into(),
            "-Root".into(),
            root.to_string_lossy().into_owned(),
        ]
    };
    // Los errores esperados salen del propio guard, no de una lectura posterior:
    // compararlos distingue «se negó antes» de «falló después» sin fijar un texto.
    let outside = Path::new("D:/VantareServer/fuera-del-guard-qa");
    let guard = qa_path(outside)
        .expect_err("outside the QA guard")
        .to_string();
    assert_eq!(apply(outside).expect_err("apply").to_string(), guard);
    let staged = stage_with(outside, &AtomicBool::new(false), |_, _, _, _| {
        panic!("feed consulted outside the QA guard")
    });
    assert_eq!(staged.expect_err("stage").to_string(), guard);
    let inside = qa_root();
    let isolation = Context::from_qa_env(&inside)
        .expect_err("this test process carries no injected QA context")
        .to_string();
    for (root, expected) in [(outside, &guard), (inside.as_path(), &isolation)] {
        let launched = launch(&arguments("--root", root));
        assert_eq!(&launched.expect_err("root").to_string(), expected);
        let started = session(&arguments("--session", root));
        assert_eq!(&started.expect_err("session").to_string(), expected);
    }
    assert!(!outside.exists() && !inside.exists());
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
