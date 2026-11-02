use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use vantare_installer::engine::{Installation, ReadError, ReadProfile, complete_probe, validation};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "vantare-read-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&root).expect("exclusive fixture");
        Self(root)
    }
    fn generation(&self) -> PathBuf {
        self.0.join("generations").join("a".repeat(32))
    }
    fn load(&self, state: &[u8], manifest: &[u8]) {
        let generation = self.generation();
        fs::create_dir_all(generation.join("data")).expect("data");
        fs::write(generation.join("data/user.bin"), b"opaque user data").expect("data bytes");
        fs::write(generation.join("manifest.json"), manifest).expect("manifest");
        fs::write(self.0.join("state.json"), state).expect("state");
    }
    fn change_manifest(&self, change: impl FnOnce(&mut serde_json::Value)) {
        let path = self.generation().join("manifest.json");
        let mut value = serde_json::from_slice(&fs::read(&path).expect("manifest")).expect("json");
        change(&mut value);
        let raw = serde_json::to_vec(&value).expect("manifest bytes");
        fs::write(path, &raw).expect("manifest write");
        let path = self.0.join("state.json");
        let mut state: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).expect("state")).expect("json");
        state["active"]["manifest_sha256"] = format!("{:x}", Sha256::digest(raw)).into();
        fs::write(path, serde_json::to_vec(&state).expect("state bytes")).expect("state write");
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("remove own fixture");
    }
}

const RC: &[u8] = include_bytes!("../fixtures/manifest-rc.json");
const STATE_RC: &[u8] = include_bytes!("../fixtures/state-rc.json");

#[test]
fn public_975_and_rc_use_the_active_manifest_without_writing_anything() {
    for (state, manifest, expected) in [
        (
            include_bytes!("../fixtures/state-975.json").as_slice(),
            include_bytes!("../../packaging/fixtures/manifest-beta-0.0.975.json").as_slice(),
            "0.0.975",
        ),
        (STATE_RC, RC, "0.0.988"),
    ] {
        let fixture = Fixture::new();
        fixture.load(state, manifest);
        for profile in [ReadProfile::Probe, ReadProfile::Hub] {
            let view = Installation::read(&fixture.0, profile).expect("installed");
            assert_eq!(view.installed_version(), Some(expected));
            assert_eq!(view.data_path, fixture.generation().join("data"));
            assert_eq!(
                fs::read(fixture.0.join("state.json")).expect("state unchanged"),
                state
            );
            assert_eq!(
                fs::read(fixture.generation().join("manifest.json")).expect("manifest unchanged"),
                manifest
            );
            assert_eq!(
                fs::read(view.data_path.join("user.bin")).expect("data unchanged"),
                b"opaque user data"
            );
        }
    }
}

#[test]
fn absent_corrupt_and_future_schema_are_distinct_and_preserve_their_bytes() {
    let fixture = Fixture::new();
    assert!(
        Installation::read(&fixture.0, ReadProfile::Probe)
            .expect("absent")
            .state
            .is_none()
    );
    assert!(
        matches!(Installation::read(&fixture.0, ReadProfile::Hub), Err(ReadError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound)
    );
    for state in [
        include_bytes!("../fixtures/state-corrupt.json").as_slice(),
        include_bytes!("../fixtures/state-future.json").as_slice(),
    ] {
        fixture.load(state, RC);
        for profile in [ReadProfile::Probe, ReadProfile::Hub] {
            assert!(Installation::read(&fixture.0, profile).is_err());
            assert_eq!(
                fs::read(fixture.0.join("state.json")).expect("unchanged"),
                state
            );
        }
    }
}

#[test]
fn probe_authenticates_manifest_but_keeps_the_existing_no_active_rehash_profile() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    // The declared script need not exist in a read-only Probe, exactly as before.
    assert!(Installation::read(&fixture.0, ReadProfile::Probe).is_ok());
    fs::write(fixture.generation().join("candidate.ps1"), b"modified")
        .expect("changed program bytes");
    assert!(Installation::read(&fixture.0, ReadProfile::Probe).is_ok());
    let mut changed = RC.to_vec();
    changed.push(b' ');
    fs::write(fixture.generation().join("manifest.json"), changed)
        .expect("different manifest bytes");
    assert!(Installation::read(&fixture.0, ReadProfile::Probe).is_err());
    assert_eq!(
        Installation::read(&fixture.0, ReadProfile::Hub)
            .expect("informational")
            .installed_version(),
        Some("0.0.988")
    );
}

#[test]
fn optional_previous_is_fully_validated_for_probe_and_only_structural_for_hub() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    let previous = fixture.0.join("generations").join("b".repeat(32));
    fs::create_dir_all(previous.join("data")).expect("previous data");
    fs::write(previous.join("manifest.json"), RC).expect("previous manifest");
    fs::write(previous.join("candidate.ps1"), b"fixture").expect("previous bytes");
    let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).expect("state");
    state["previous"] = serde_json::json!({"generation":"b".repeat(32),"manifest_sha256":format!("{:x}",Sha256::digest(RC))});
    let raw = serde_json::to_vec(&state).expect("raw");
    fs::write(fixture.0.join("state.json"), &raw).expect("previous reference");
    assert!(
        Installation::read(&fixture.0, ReadProfile::Probe)
            .expect("complete previous")
            .state
            .expect("state")
            .previous
            .is_some()
    );
    fs::write(previous.join("candidate.ps1"), b"damaged").expect("damage previous");
    let view = Installation::read(&fixture.0, ReadProfile::Probe).expect("active survives");
    assert_eq!(view.previous_warning, Some("previous-corrupt"));
    assert!(view.state.expect("state").previous.is_none());
    assert!(
        Installation::read(&fixture.0, ReadProfile::Hub)
            .expect("structural previous")
            .state
            .expect("state")
            .previous
            .is_some()
    );
    fs::remove_file(previous.join("candidate.ps1")).expect("missing previous");
    assert_eq!(
        Installation::read(&fixture.0, ReadProfile::Probe)
            .expect("active survives missing")
            .previous_warning,
        Some("previous-unreadable")
    );
    assert_eq!(
        fs::read(fixture.0.join("state.json")).expect("no rewrite"),
        raw
    );
}

#[test]
fn probe_rejects_unknown_disk_members_bad_inventory_hash_and_missing_data() {
    for mutation in ["unknown", "duplicate", "traversal", "hash", "data"] {
        let fixture = Fixture::new();
        fixture.load(STATE_RC, RC);
        match mutation {
            "unknown" => fs::write(fixture.generation().join("unlisted.txt"), b"foreign")
                .expect("foreign file"),
            "duplicate" => fixture.change_manifest(|v| {
                let f = v["files"][0].clone();
                v["files"].as_array_mut().expect("files").push(f);
            }),
            "traversal" => fixture.change_manifest(|v| v["files"][0]["path"] = "../outside".into()),
            "hash" => fixture.change_manifest(|v| v["files"][0]["sha256"] = "INVALID".into()),
            "data" => {
                fs::remove_dir_all(fixture.generation().join("data")).expect("remove fixture data");
            }
            _ => unreachable!(),
        }
        assert!(
            Installation::read(&fixture.0, ReadProfile::Probe).is_err(),
            "{mutation}"
        );
    }
}

#[test]
fn profiles_preserve_unknown_fields_and_version_rules() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).expect("state");
    state["future"] = true.into();
    fs::write(
        fixture.0.join("state.json"),
        serde_json::to_vec(&state).expect("state bytes"),
    )
    .expect("state write");
    assert!(Installation::read(&fixture.0, ReadProfile::Probe).is_ok());
    assert!(Installation::read(&fixture.0, ReadProfile::Hub).is_err());
    state
        .as_object_mut()
        .expect("state object")
        .remove("future");
    state
        .as_object_mut()
        .expect("state object")
        .remove("previous");
    fs::write(fixture.0.join("state.json"), state.to_string()).expect("missing previous");
    assert!(Installation::read(&fixture.0, ReadProfile::Probe).is_err());
    assert!(Installation::read(&fixture.0, ReadProfile::Hub).is_ok());
    for value in [
        "1.2.3",
        "0.0.975",
        "1.2.3.4-nightly.11",
        "01.2.3",
        "99999.0.0",
    ] {
        assert!(validation::package_version(value));
    }
    for value in [
        "",
        "1.2",
        "1.2.3-",
        "1.2.3-.local",
        "1.2.3--local",
        "1.2.3-TEST",
    ] {
        assert!(!validation::package_version(value));
    }
    for value in ["01.2.3", "99999.0.0", "1.2.3.4", "1.2.3-local"] {
        assert!(validation::setup_version(value).is_err());
    }
    assert!(validation::setup_version("65535.0.0").is_ok());
    assert!(!validation::hub_version(&format!(
        "{}1.2.3",
        "0".repeat(101)
    )));
}

#[test]
fn retained_and_interrupted_uninstall_keep_their_existing_presentation() {
    let fixture = Fixture::new();
    fs::write(
        fixture.0.join("retained-data.json"),
        serde_json::json!({"schema":1,"generation":"c".repeat(32),"version":"0.0.975"}).to_string(),
    )
    .expect("retained");
    let view = Installation::read(&fixture.0, ReadProfile::Probe).expect("retained data");
    assert!(view.installed_version().is_none());
    assert_eq!(
        view.data_path,
        fixture
            .0
            .join("generations")
            .join("c".repeat(32))
            .join("data")
    );
    // No manifest/hash/previous is required after a partial uninstall.
    let partial = include_bytes!("../fixtures/state-partial-uninstall.json");
    fs::write(fixture.0.join("state.json"), partial).expect("partial");
    let partial_view =
        Installation::read(&fixture.0, ReadProfile::Uninstall).expect("partial state");
    assert!(
        partial_view
            .state
            .expect("structural state")
            .active
            .manifest_sha256
            .is_none()
    );
    assert_eq!(
        fs::read(fixture.0.join("state.json")).expect("unchanged partial state"),
        partial
    );
    let info = vantare_installer::model::Info {
        root: fixture.0.clone(),
        version: "0.0.989".into(),
        installed_version: Some("0.0.988".into()),
        data_path: Path::new("unused").into(),
        desktop: false,
        autostart: false,
        size: 1,
        reduced_motion: false,
    };
    assert_eq!(
        complete_probe(info.clone(), true)
            .expect("partial recovery")
            .installed_version,
        Some("0.0.988".into())
    );
    assert!(complete_probe(info, false).is_err());
    // A real binding remains unchanged even if manifest/bin have been removed.
    fs::write(fixture.0.join("state.json"), STATE_RC).expect("bound partial state");
    let original: serde_json::Value = serde_json::from_slice(STATE_RC).expect("original state");
    let partial_view =
        Installation::read(&fixture.0, ReadProfile::Uninstall).expect("real binding");
    assert_eq!(
        partial_view
            .state
            .expect("state")
            .active
            .manifest_sha256
            .as_deref(),
        original["active"]["manifest_sha256"].as_str()
    );
    assert_eq!(
        fs::read(fixture.0.join("state.json")).expect("unchanged bound state"),
        STATE_RC
    );
}

#[test]
fn hub_state_remains_bounded_while_probe_preserves_legacy_unbounded_state() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    let mut raw = STATE_RC.to_vec();
    raw.extend(vec![b' '; 16 * 1024]);
    fs::write(fixture.0.join("state.json"), &raw).expect("large state");
    assert!(Installation::read(&fixture.0, ReadProfile::Probe).is_ok());
    assert!(Installation::read(&fixture.0, ReadProfile::Hub).is_err());
}

#[test]
fn malformed_state_shapes_are_errors_and_never_panic_or_write() {
    let fixture = Fixture::new();
    for raw in [
        b"[]".as_slice(),
        b"null",
        b"true",
        b"{}",
        b"{\"active\":null}",
        b"{\"active\":[]}",
    ] {
        fixture.load(raw, RC);
        for profile in [ReadProfile::Hub, ReadProfile::Probe, ReadProfile::Uninstall] {
            assert!(Installation::read(&fixture.0, profile).is_err());
            assert_eq!(
                fs::read(fixture.0.join("state.json")).expect("unchanged"),
                raw
            );
        }
    }
}

#[test]
fn probe_ignores_unknown_reference_fields_but_disables_malformed_previous() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    let previous = fixture.0.join("generations").join("b".repeat(32));
    fs::create_dir_all(previous.join("data")).expect("previous data");
    fs::write(previous.join("manifest.json"), RC).expect("previous manifest");
    fs::write(previous.join("candidate.ps1"), b"fixture").expect("previous bytes");
    let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).expect("state");
    state["active"]["ignored"] = true.into();
    state["previous"] = serde_json::json!({"generation":"b".repeat(32),"manifest_sha256":format!("{:x}",Sha256::digest(RC)),"ignored":true});
    fs::write(fixture.0.join("state.json"), state.to_string()).expect("state");
    let view =
        Installation::read(&fixture.0, ReadProfile::Probe).expect("unknown fields tolerated");
    assert!(view.state.expect("state").previous.is_some());
    assert_eq!(view.previous_warning, None);
    state["previous"] = false.into();
    fs::write(fixture.0.join("state.json"), state.to_string()).expect("state");
    let view = Installation::read(&fixture.0, ReadProfile::Probe)
        .expect("active survives malformed previous");
    assert_eq!(view.previous_warning, Some("previous-corrupt"));
    assert!(view.state.expect("state").previous.is_none());
    for version in ["1.2.3-A1", "1.2.3-Ab", "1.2.3-aB"] {
        assert!(!validation::package_version(version));
    }
}

#[test]
fn previous_requires_pe_x64_and_exact_sidecar_even_with_matching_hashes() {
    for fault in ["none", "mz", "machine", "sidecar"] {
        let fixture = Fixture::new();
        fixture.load(STATE_RC, RC);
        let previous = fixture.0.join("generations").join("b".repeat(32));
        fs::create_dir_all(previous.join("bin")).expect("bin");
        fs::create_dir(previous.join("data")).expect("data");
        let mut pe = vec![0_u8; 70];
        pe[..2].copy_from_slice(b"MZ");
        pe[60..64].copy_from_slice(&64_u32.to_le_bytes());
        pe[64..].copy_from_slice(b"PE\0\0\x64\x86");
        if fault == "mz" {
            pe[0] = 0;
        }
        if fault == "machine" {
            pe[68] = 0;
        }
        let exe_hash = format!("{:x}", Sha256::digest(&pe));
        let sidecar = if fault == "sidecar" {
            format!("{exe_hash}  wrong.exe\n")
        } else {
            format!("{exe_hash}  vantare.exe\n")
        };
        fs::write(previous.join("bin/vantare.exe"), &pe).expect("PE");
        fs::write(previous.join("bin/vantare.exe.sha256"), &sidecar).expect("sidecar");
        let mut manifest: serde_json::Value = serde_json::from_slice(RC).expect("manifest");
        manifest["files"] = serde_json::json!([
            {"path":"bin/vantare.exe","size":pe.len(),"sha256":exe_hash},
            {"path":"bin/vantare.exe.sha256","size":sidecar.len(),"sha256":format!("{:x}",Sha256::digest(sidecar.as_bytes()))}
        ]);
        let raw = serde_json::to_vec(&manifest).expect("manifest bytes");
        fs::write(previous.join("manifest.json"), &raw).expect("manifest");
        let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).expect("state");
        state["previous"] = serde_json::json!({"generation":"b".repeat(32),"manifest_sha256":format!("{:x}",Sha256::digest(raw))});
        fs::write(fixture.0.join("state.json"), state.to_string()).expect("state");
        let view =
            Installation::read(&fixture.0, ReadProfile::Probe).expect("active remains valid");
        assert_eq!(
            view.state.expect("state").previous.is_some(),
            fault == "none",
            "{fault}"
        );
        assert_eq!(
            view.previous_warning,
            if fault == "none" {
                None
            } else {
                Some("previous-corrupt")
            },
            "{fault}"
        );
    }
}
