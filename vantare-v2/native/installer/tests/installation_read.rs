use sha2::{Digest, Sha256};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
use vantare_installer::engine::{Installation, ReadError, Rejection, State, validation};

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
fn real_975_and_rc_metadata_share_one_reader_and_preserve_bytes() {
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
        let view = Installation::read(&fixture.0).expect("bound metadata");
        assert_eq!(view.installed_version(), Some(expected));
        assert_eq!(view.data_path, fixture.generation().join("data"));
        assert_eq!(fs::read(fixture.0.join("state.json")).unwrap(), state);
        assert_eq!(
            fs::read(fixture.generation().join("manifest.json")).unwrap(),
            manifest
        );
        assert_eq!(
            fs::read(view.data_path.join("user.bin")).unwrap(),
            b"opaque user data"
        );
    }
}

#[test]
fn absent_corrupt_and_future_schema_do_not_mutate_the_installation() {
    let fixture = Fixture::new();
    for profile in [false, true] {
        assert!(read(&fixture.0, profile).unwrap().state.is_none());
    }
    for raw in [
        include_bytes!("../fixtures/state-corrupt.json").as_slice(),
        include_bytes!("../fixtures/state-future.json").as_slice(),
        b"[]",
        b"null",
        b"true",
        b"{}",
        b"{\"active\":null}",
        b"{\"active\":[]}",
    ] {
        fixture.load(raw, RC);
        for profile in [false, true] {
            assert!(read(&fixture.0, profile).is_err());
            assert_eq!(fs::read(fixture.0.join("state.json")).unwrap(), raw);
        }
        assert!(State::read(&fixture.0).is_err());
    }
}

#[test]
fn display_authenticates_metadata_and_verified_also_checks_binary_bytes() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    // Metadata can be displayed before program files are available.
    assert!(Installation::read(&fixture.0).is_ok());
    assert!(verified(&fixture.0).is_err());
    fs::write(fixture.generation().join("candidate.ps1"), b"fixture").unwrap();
    assert!(Installation::read(&fixture.0).is_ok());
    assert!(verified(&fixture.0).is_ok());
    fs::write(fixture.generation().join("candidate.ps1"), b"damaged").unwrap();
    assert!(Installation::read(&fixture.0).is_ok());
    assert!(verified(&fixture.0).is_err());
    let mut changed = RC.to_vec();
    changed.push(b' ');
    fs::write(fixture.generation().join("manifest.json"), changed).unwrap();
    for profile in [false, true] {
        assert!(matches!(
            read(&fixture.0, profile),
            Err(ReadError::Rejected(Rejection::Binding))
        ));
    }
}

#[test]
fn both_profiles_use_bom_support_strict_fields_and_the_same_document_bound() {
    let fixture = Fixture::new();
    let mut bom = vec![0xef, 0xbb, 0xbf];
    bom.extend_from_slice(RC);
    let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).unwrap();
    state["active"]["manifest_sha256"] = format!("{:x}", Sha256::digest(&bom)).into();
    fixture.load(state.to_string().as_bytes(), &bom);
    fs::write(fixture.generation().join("candidate.ps1"), b"fixture").unwrap();
    for profile in [false, true] {
        assert!(read(&fixture.0, profile).is_ok());
    }
    for fault in [
        "unknown-state",
        "unknown-reference",
        "unknown-manifest",
        "oversized-state",
        "oversized-manifest",
    ] {
        fixture.load(STATE_RC, RC);
        let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).unwrap();
        match fault {
            "unknown-state" => state["future"] = true.into(),
            "unknown-reference" => state["active"]["future"] = true.into(),
            "unknown-manifest" => {
                fixture.change_manifest(|manifest| manifest["future"] = true.into());
            }
            "oversized-state" => {
                let mut raw = STATE_RC.to_vec();
                raw.extend(vec![b' '; 65536]);
                fs::write(fixture.0.join("state.json"), raw).unwrap();
            }
            "oversized-manifest" => {
                let mut raw = RC.to_vec();
                raw.extend(vec![b' '; 65536]);
                fs::write(fixture.generation().join("manifest.json"), raw).unwrap();
            }
            _ => unreachable!(),
        }
        if fault.starts_with("unknown-") && fault != "unknown-manifest" {
            fs::write(fixture.0.join("state.json"), state.to_string()).unwrap();
        }
        for profile in [false, true] {
            assert!(read(&fixture.0, profile).is_err(), "{fault}");
        }
    }
}

#[test]
fn inventory_paths_duplicates_and_data_binding_are_not_optional() {
    for fault in [
        "foreign",
        "duplicate",
        "traversal",
        "hash",
        "data",
        "previous",
    ] {
        let fixture = Fixture::new();
        fixture.load(STATE_RC, RC);
        match fault {
            "foreign" => fs::write(fixture.generation().join("unlisted.txt"), b"foreign").unwrap(),
            "duplicate" => fixture.change_manifest(|manifest| {
                let file = manifest["files"][0].clone();
                manifest["files"].as_array_mut().unwrap().push(file);
            }),
            "traversal" => fixture
                .change_manifest(|manifest| manifest["files"][0]["path"] = "../outside".into()),
            "hash" => fixture
                .change_manifest(|manifest| manifest["files"][0]["sha256"] = "INVALID".into()),
            "data" => fs::remove_dir_all(fixture.generation().join("data")).unwrap(),
            "previous" => {
                let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).unwrap();
                state.as_object_mut().unwrap().remove("previous");
                fs::write(fixture.0.join("state.json"), state.to_string()).unwrap();
            }
            _ => unreachable!(),
        }
        assert!(Installation::read(&fixture.0).is_err(), "{fault}");
    }
}

#[test]
fn version_has_one_numeric_contract_for_display_and_operations() {
    for version in ["0.0.975", "0.0.988", "1.2.3", "65535.0.0"] {
        assert!(validation::version(version).is_ok());
    }
    for version in [
        "",
        "1.2",
        "01.2.3",
        "99999.0.0",
        "1.2.3.4",
        "1.2.3-local",
        "1.2.3-A1",
    ] {
        assert!(validation::version(version).is_err());
    }
}

#[test]
fn retained_data_and_structural_retirement_share_the_state_decoder() {
    let fixture = Fixture::new();
    fs::write(
        fixture.0.join("retained-data.json"),
        serde_json::json!({"schema":1,"generation":"c".repeat(32),"version":"0.0.975"}).to_string(),
    )
    .unwrap();
    let view = Installation::read(&fixture.0).unwrap();
    assert!(view.installed_version().is_none());
    assert_eq!(
        view.data_path,
        fixture
            .0
            .join("generations")
            .join("c".repeat(32))
            .join("data")
    );
    for raw in [
        include_bytes!("../fixtures/state-partial-uninstall.json").as_slice(),
        STATE_RC,
    ] {
        fs::write(fixture.0.join("state.json"), raw).unwrap();
        assert_eq!(
            State::read(&fixture.0).unwrap().unwrap().active.generation,
            "a".repeat(32)
        );
        assert_eq!(fs::read(fixture.0.join("state.json")).unwrap(), raw);
        assert!(Installation::read(&fixture.0).is_err());
    }
}

#[test]
fn previous_requires_pe_x64_and_exact_sidecar_even_with_matching_hashes() {
    for fault in ["none", "mz", "machine", "sidecar"] {
        let fixture = Fixture::new();
        fixture.load(STATE_RC, RC);
        fs::write(fixture.generation().join("candidate.ps1"), b"fixture").unwrap();
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
        let view = verified(&fixture.0).expect("active remains valid");
        assert_eq!(view.usable_previous().is_some(), fault == "none", "{fault}");
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

fn read(root: &std::path::Path, verify: bool) -> Result<Installation, ReadError> {
    let mut view = Installation::read(root)?;
    if verify {
        view.verify(root)?;
    }
    Ok(view)
}
fn verified(root: &std::path::Path) -> Result<Installation, ReadError> {
    read(root, true)
}

#[test]
fn previous_equal_to_active_is_corrupt_and_never_an_actionable_rollback() {
    let fixture = Fixture::new();
    fixture.load(STATE_RC, RC);
    let mut state: serde_json::Value = serde_json::from_slice(STATE_RC).unwrap();
    state["previous"] = state["active"].clone();
    fs::write(fixture.0.join("state.json"), state.to_string()).unwrap();
    let view = Installation::read(&fixture.0).unwrap();
    assert_eq!(view.previous_warning, Some("previous-corrupt"));
    assert!(view.usable_previous().is_none());
    assert_eq!(view.installed_version(), Some("0.0.988"));
}
