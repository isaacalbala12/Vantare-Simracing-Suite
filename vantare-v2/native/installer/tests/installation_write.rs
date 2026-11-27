#![cfg(windows)]
use serde_json::json;
use sha2::{Digest, Sha256};
use std::os::windows::{fs::OpenOptionsExt, process::CommandExt};
use std::{
    collections::BTreeMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
};
use vantare_installer::{
    args::Args,
    engine::{
        self, Installation,
        context::{Context, qa_path},
        operations::{self, Control},
        write_fs as disk,
    },
    model::Mode,
};

struct Fixture {
    path: PathBuf,
    root: PathBuf,
}
struct Package {
    path: PathBuf,
    sha: String,
    version: String,
    channel: &'static str,
}
struct OwnedChild(std::process::Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() {
            let _ = self.0.kill();
        }
        let _ = self.0.wait();
    }
}
impl Drop for Fixture {
    // A passing test leaves nothing in the shared QA root; a failed one keeps its tree.
    fn drop(&mut self) {
        if !std::thread::panicking() {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}
impl Package {
    fn borrowed(&self) -> operations::Package<'_> {
        operations::Package {
            archive: &self.path,
            sha256: &self.sha,
            version: &self.version,
            channel: self.channel,
        }
    }
}
impl Fixture {
    fn new() -> Self {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI isolated root"))
        } else {
            PathBuf::from("D:/VantareServer/qa/isa-1840")
        };
        let path = parent
            .join("p4-rust-tests")
            .join(disk::id().expect("unique ID"));
        qa_path(&path).expect("QA guard");
        fs::create_dir_all(&path).expect("fixture root");
        Self {
            root: path.join("instalación con espacios"),
            path,
        }
    }
    fn package(&self, version: &str) -> Package {
        self.package_with_resource(version, None)
    }
    fn package_with_resource(&self, version: &str, extra: Option<(&str, &[u8])>) -> Package {
        self.package_with_engine(version, extra, 2)
    }
    fn package_with_engine(
        &self,
        version: &str,
        extra: Option<(&str, &[u8])>,
        engine: u32,
    ) -> Package {
        self.build("package", version, test_members(), extra, engine)
    }
    /// The same package declared for another channel (#2812).
    fn package_for(&self, channel: &'static str, version: &str) -> Package {
        self.build_for(
            channel,
            &format!("package-{channel}"),
            version,
            test_members(),
            None,
            2,
        )
    }
    /// Electron generation: the Rust host keeps `bin/vantare-hub.exe` and the
    /// sealed `hub-ui` tree travels beside `bin`, as `build-candidate.ps1` emits it.
    fn electron(&self, version: &str) -> Package {
        self.build("electron", version, electron_members(), None, 2)
    }
    fn build(
        &self,
        tag: &str,
        version: &str,
        members: Vec<String>,
        extra: Option<(&str, &[u8])>,
        engine: u32,
    ) -> Package {
        self.build_for("beta", tag, version, members, extra, engine)
    }
    fn build_for(
        &self,
        channel: &'static str,
        tag: &str,
        version: &str,
        members: Vec<String>,
        extra: Option<(&str, &[u8])>,
        engine: u32,
    ) -> Package {
        let mut executable = inert_pe();
        // A trailing overlay keeps the PE valid and tells one package's launcher from another's.
        executable.extend_from_slice(format!("{tag}-{version}").as_bytes());
        let executable_hash = format!("{:x}", Sha256::digest(&executable));
        let mut entries = Vec::new();
        for name in members {
            let bytes = if Path::new(&name)
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
            {
                executable.clone()
            } else if let Some(exe) = name.strip_suffix(".sha256") {
                format!(
                    "{executable_hash}  {}\n",
                    Path::new(exe)
                        .file_name()
                        .expect("PE basename")
                        .to_string_lossy()
                )
                .into_bytes()
            } else {
                b"fixture".to_vec()
            };
            entries.push((name.clone(), bytes));
        }
        if let Some((name, bytes)) = extra {
            entries.push((name.to_owned(), bytes.to_vec()));
        }
        let files: Vec<_> = entries.iter().map(|(name, bytes)| json!({"path":name,"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})).collect();
        let manifest = json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","data_schema":"opaque-v1","source_sha":"0".repeat(40),"source_dirty":false,"build_profile":"Debug","version":version,"channel":channel,"engine":engine,"files":files});
        entries.push((
            "manifest.json".into(),
            serde_json::to_vec(&manifest).expect("manifest"),
        ));
        let path = self.path.join(format!("{tag}-{version}.zip"));
        let mut writer = zip::ZipWriter::new(fs::File::create(&path).expect("archive"));
        for (name, bytes) in entries {
            writer
                .start_file(
                    name,
                    zip::write::SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Stored),
                )
                .expect("ZIP member");
            writer.write_all(&bytes).expect("ZIP bytes");
        }
        writer.finish().expect("ZIP finish");
        let sha = format!(
            "{:x}",
            Sha256::digest(fs::read(&path).expect("archive bytes"))
        );
        Package {
            path,
            sha,
            version: version.into(),
            channel,
        }
    }
    fn install(
        &self,
        package: &Package,
        mode: Mode,
        fail_finalize: bool,
        cancel_at_copy: bool,
    ) -> disk::Result<()> {
        let cancel = AtomicBool::new(false);
        let can_cancel = std::cell::Cell::new(true);
        let mut progress = |event: vantare_installer::model::Progress| {
            can_cancel.set(event.can_cancel);
            if cancel_at_copy && event.step == "copy" {
                cancel.store(true, Ordering::Release);
            }
        };
        let mut checkpoint = |_: &str| {
            assert!(
                !can_cancel.get(),
                "transaction must disable UI cancellation"
            );
            Ok(())
        };
        let mut warning = |message: &str| eprintln!("{message}");
        let mut control = Control {
            cancel: &cancel,
            progress: &mut progress,
            checkpoint: &mut checkpoint,
            warning: &mut warning,
        };
        let mut restored = false;
        let result = operations::install(
            &self.root,
            &package.borrowed(),
            mode,
            &mut control,
            |_, restoring, _| {
                restored |= restoring;
                if fail_finalize && !restoring {
                    Err(engine::WriteError::new(1, "injected finalizer failure"))
                } else {
                    Ok(())
                }
            },
            || Ok(()),
        );
        if fail_finalize {
            assert!(
                restored,
                "Failed projection must be called again after restoring state"
            );
        }
        result
    }
    fn active(&self) -> PathBuf {
        let state = verified(&self.root)
            .expect("verified installation")
            .state
            .expect("state");
        self.root.join("generations").join(state.active.generation)
    }
    fn data(&self) -> PathBuf {
        self.active().join("data")
    }
    fn write_data(&self) {
        let data = self.data();
        fs::create_dir_all(data.join("empty/child")).expect("empty user folders");
        fs::write(data.join("opaque.bin"), b"opaque\0user\xffbytes").expect("user bytes");
    }
}

#[test]
fn first_motor_two_failure_requires_repair_and_keeps_motor_one_data() {
    let fixture = Fixture::new();
    fixture
        .install(
            &fixture.package_with_engine("1.0.0", None, 1),
            Mode::Auto,
            false,
            false,
        )
        .unwrap();
    fixture.write_data();
    let old = fixture.active();
    let before = disk::data_index(&old.join("data")).unwrap();
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    let new = fixture.active();
    assert_ne!(old, new);
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::RepairRequired
    );
    assert_eq!(fixture.active(), new);
    assert_eq!(disk::data_index(&old.join("data")).unwrap(), before);
    assert!(!fixture.root.join("boot-pending.json").exists());
    let status = disk::read_json(&fixture.root.join("update-status.json"), None).unwrap();
    assert_eq!(status["state"], "repair");
}

#[test]
fn motor_two_boot_confirmation_and_rollback_are_bound_to_the_active_version() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let old = fixture.active();
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    let marker = fixture.root.join("boot-pending.json");
    let mut changed = disk::read_json(&marker, None).unwrap();
    changed["version"] = "9.9.9".into();
    fs::write(&marker, changed.to_string()).unwrap();
    assert!(operations::confirm(&fixture.root).is_err());
    assert!(operations::rollback(&fixture.root).is_err());
    changed["version"] = "1.0.1".into();
    fs::write(&marker, changed.to_string()).unwrap();
    fs::write(fixture.root.join("Vantare.exe"), b"bad launcher").unwrap();
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.active(), old);
    assert_eq!(
        fs::read(fixture.root.join("Vantare.exe")).unwrap(),
        fs::read(old.join("bin/vantare.exe")).unwrap()
    );
    let status = disk::read_json(&fixture.root.join("update-status.json"), None).unwrap();
    assert_eq!(status["version"], "1.0.1");
    assert_eq!(status["rejectedVersion"], "1.0.1");
    operations::status(&fixture.root, "current", "retry query", "1.0.0").unwrap();
    let status = disk::read_json(&fixture.root.join("update-status.json"), None).unwrap();
    assert_eq!(status["rejectedVersion"], "1.0.1");
    assert!(!marker.exists());
    fixture
        .install(&fixture.package("1.0.2"), Mode::Auto, false, false)
        .unwrap();
    operations::confirm(&fixture.root).unwrap();
    assert!(!marker.exists());
    assert!(operations::confirm(&fixture.root).is_err());
}

#[test]
fn stale_boot_marker_after_committed_rollback_is_removed_without_a_second_rollback() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    let marker = fixture.root.join("boot-pending.json");
    let bytes = fs::read(&marker).unwrap();
    assert!(!operations::discard_stale_boot_marker(&fixture.root).unwrap());
    assert!(marker.exists());
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    let restored = fixture.active();
    fs::write(&marker, &bytes).unwrap();
    assert!(operations::discard_stale_boot_marker(&fixture.root).unwrap());
    assert!(!marker.exists());
    assert_eq!(fixture.active(), restored);
    assert!(!operations::discard_stale_boot_marker(&fixture.root).unwrap());
    let state = disk::read_json(&fixture.root.join("state.json"), None).unwrap();
    let failed_generation = state["previous"]["generation"].as_str().unwrap();
    fs::write(
        fixture
            .root
            .join("generations")
            .join(failed_generation)
            .join("manifest.json"),
        b"corrupt",
    )
    .unwrap();
    fs::write(&marker, &bytes).unwrap();
    assert!(operations::discard_stale_boot_marker(&fixture.root).unwrap());
    assert!(!marker.exists());
}

#[test]
fn interrupted_rollback_recovers_rejected_version_after_state_commit() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let restored = fixture.active();
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    let marker_path = fixture.root.join("boot-pending.json");
    let mut marker = disk::read_json(&marker_path, None).unwrap();
    marker["rejectOnRollback"] = true.into();
    disk::publish_json(&marker_path, &marker).unwrap();
    let state_path = fixture.root.join("state.json");
    let mut state = disk::read_json(&state_path, None).unwrap();
    let failed = state["active"].clone();
    state["active"] = state["previous"].clone();
    state["previous"] = failed;
    disk::publish_json(&state_path, &state).unwrap();
    fs::remove_file(fixture.root.join("update-status.json")).unwrap();

    assert!(operations::discard_stale_boot_marker(&fixture.root).unwrap());
    assert_eq!(fixture.active(), restored);
    let status = disk::read_json(&fixture.root.join("update-status.json"), None).unwrap();
    assert_eq!(status["rejectedVersion"], "1.0.1");
    assert!(!marker_path.exists());
}

#[test]
fn rollback_restores_state_even_when_status_cannot_be_published() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let previous = fixture.active();
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    let status = fixture.root.join("update-status.json");
    fs::remove_file(&status).unwrap();
    fs::create_dir(&status).unwrap();
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.active(), previous);
    assert!(!fixture.root.join("boot-pending.json").exists());
}

#[test]
fn update_copies_exact_opaque_data_and_preserves_both_old_generations() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let original = fixture.active();
    let before = disk::data_index(&original.join("data")).expect("source data");
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .expect("update");
    let view = verified(&fixture.root).expect("verified update");
    assert_eq!(view.installed_version(), Some("1.0.1"));
    assert_eq!(disk::data_index(&fixture.data()).expect("new data"), before);
    assert_eq!(
        disk::data_index(&original.join("data")).expect("old data"),
        before
    );
    assert_eq!(
        fs::metadata(fixture.data().join("opaque.bin"))
            .expect("new metadata")
            .modified()
            .expect("new mtime"),
        fs::metadata(original.join("data/opaque.bin"))
            .expect("old metadata")
            .modified()
            .expect("old mtime")
    );
    assert_eq!(
        view.state
            .expect("state")
            .previous
            .expect("previous")
            .generation,
        original.file_name().expect("generation").to_string_lossy()
    );
    assert!(fixture.root.join("boot-pending.json").is_file());
}

#[test]
fn failed_shell_finalization_restores_the_logical_state_and_data() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let state = fs::read(fixture.root.join("state.json")).expect("state bytes");
    let data = disk::data_index(&fixture.data()).expect("data before");
    let result = fixture.install(&fixture.package("1.0.1"), Mode::Auto, true, false);
    assert!(result.is_err());
    assert_eq!(
        fs::read(fixture.root.join("state.json")).expect("restored bytes"),
        state
    );
    assert_eq!(
        disk::data_index(&fixture.data()).expect("restored data"),
        data
    );
    assert_eq!(
        fs::read_dir(fixture.root.join("generations"))
            .expect("generations")
            .count(),
        1
    );
    assert!(!fixture.root.join("boot-pending.json").exists());
    assert!(!fixture.root.join("update-status.json").exists());
}

#[test]
fn rejected_pending_upgrade_preserves_the_previous_reference() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .expect("upgrade");
    let path = fixture.root.join("state.json");
    let before: serde_json::Value =
        serde_json::from_slice(&fs::read(&path).expect("state")).expect("JSON");
    assert!(before["previous"].is_object());
    assert!(
        fixture
            .install(&fixture.package("1.0.2"), Mode::Auto, false, false)
            .is_err()
    );
    let after: serde_json::Value =
        serde_json::from_slice(&fs::read(path).expect("state")).expect("JSON");
    assert_eq!(after, before);
}

#[test]
fn corrupt_auxiliary_metadata_is_rejected_without_erasing_it() {
    for name in [
        "boot-pending.json",
        "update-status.json",
        "retained-data.json",
    ] {
        let fixture = Fixture::new();
        fixture
            .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
            .expect("install");
        let state = fs::read(fixture.root.join("state.json")).expect("state");
        let path = fixture.root.join(name);
        fs::write(&path, b"{ corrupt metadata").expect("corrupt fixture");
        assert!(
            fixture
                .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
                .is_err()
        );
        assert_eq!(
            fs::read(&path).expect("preserved metadata"),
            b"{ corrupt metadata"
        );
        assert_eq!(
            fs::read(fixture.root.join("state.json")).expect("preserved state"),
            state
        );
    }
}

#[test]
fn cancel_at_the_last_copy_checkpoint_never_activates_a_generation() {
    let fixture = Fixture::new();
    let result = fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, true)
        .expect_err("cancelled");
    assert_eq!(result.code, 5);
    assert!(!fixture.root.join("state.json").exists());
    assert!(!fixture.root.join("generations").exists());
}

#[test]
fn failed_atomic_replacements_remove_owned_temporaries_and_preserve_targets() {
    let fixture = Fixture::new();
    fs::create_dir(&fixture.root).expect("owned root");
    for name in ["state.json", "update-status.json"] {
        let target = fixture.root.join(name);
        fs::write(&target, b"original bytes").expect("original target");
        let handle = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&target)
            .expect("deny replace");
        if name == "state.json" {
            assert!(disk::commit_raw(&fixture.root, b"replacement", &mut |_| Ok(())).is_err());
        } else {
            let temporary = fixture.root.join("beta-owned.tmp");
            disk::write_new(&temporary, b"replacement").expect("owned temporary");
            assert!(disk::replace_temporary(&temporary, &target).is_err());
        }
        drop(handle);
        assert_eq!(
            fs::read(&target).expect("preserved target"),
            b"original bytes"
        );
        assert!(
            fs::read_dir(&fixture.root)
                .expect("root files")
                .all(|entry| {
                    entry
                        .expect("entry")
                        .path()
                        .extension()
                        .is_none_or(|extension| extension != "tmp")
                })
        );
    }
}

#[test]
fn external_hash_failure_cannot_change_existing_state_or_data() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let before = fs::read(fixture.root.join("state.json")).expect("old state");
    let mut incoming = fixture.package("1.0.1");
    incoming.sha = "0".repeat(64);
    assert!(
        fixture
            .install(&incoming, Mode::Auto, false, false)
            .is_err()
    );
    assert_eq!(
        fs::read(fixture.root.join("state.json")).expect("state unchanged"),
        before
    );
    assert_eq!(
        fs::read(fixture.data().join("opaque.bin")).expect("data unchanged"),
        b"opaque\0user\xffbytes"
    );
}

#[test]
fn uninstall_probe_uses_manifest_or_a_neutral_absence_never_a_retained_version() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    let context = engine::context::Context::isolated(
        fixture.path.join("LocalAppData"),
        format!(
            "Software\\VantareInstallerMatrix\\{}",
            disk::id().expect("hive ID")
        ),
        fixture.path.join("shell"),
    )
    .and_then(|context| context.for_channel("beta"))
    .expect("isolated context");
    let request = engine::Request::new(
        &vantare_installer::args::Args {
            root: Some(fixture.root.clone()),
            uninstall: true,
            ..Default::default()
        },
        vantare_installer::engine::Operation::Probe,
    );
    assert_eq!(
        context
            .probe(&request)
            .expect("complete uninstall probe")
            .installed_version
            .as_deref(),
        Some("1.0.0")
    );
    let manifest_path = fixture.active().join("manifest.json");
    let bound = fs::read(&manifest_path).unwrap();
    let mut unbound = bound.clone();
    unbound.push(b' ');
    fs::write(&manifest_path, unbound).unwrap();
    assert_eq!(context.probe(&request).unwrap().installed_version, None);
    fs::write(&manifest_path, bound).unwrap();
    fs::remove_file(manifest_path).expect("simulate already removed manifest");
    fs::write(
        fixture.root.join("retained-data.json"),
        serde_json::to_vec(&json!({"schema":1,"generation":"a".repeat(32),"version":"9.9.9"}))
            .expect("retained JSON"),
    )
    .expect("untrusted display fixture");
    assert_eq!(
        context
            .probe(&request)
            .expect("partial uninstall stays usable")
            .installed_version,
        None
    );
}

#[test]
fn qa_context_cannot_fall_back_to_product_registry_or_escape_its_folders() {
    for empty in ["", " ", "\t"] {
        assert!(disk::path(Path::new(empty)).is_err());
    }
    let fixture = Fixture::new();
    for bad in [
        "C:/Users/matrix/Programs/Vantare",
        "D:/VantareServer/qa/../installed",
        "D:/VantareServer/qa-other/install",
    ] {
        assert!(qa_path(Path::new(bad)).is_err());
    }
    assert!(disk::path(&fixture.path.join(".env-never-read/file")).is_err());
    assert!(
        engine::context::Context::isolated(
            fixture.path.join("LocalAppData"),
            "Software\\Microsoft\\Windows\\CurrentVersion".into(),
            fixture.path.join("shell")
        )
        .is_err()
    );
    assert!(
        engine::context::Context::isolated(
            fixture.path.join("LocalAppData"),
            format!(
                "Software\\VantareInstallerMatrix\\{}",
                disk::id().expect("hive ID")
            ),
            PathBuf::from("C:/Users/matrix/Desktop")
        )
        .is_err()
    );
    let key = format!(
        "Software\\VantareInstallerMatrix\\{}",
        disk::id().expect("hive ID")
    );
    assert!(
        engine::context::Context::isolated(
            fixture.path.join("LocalAppData"),
            key.clone(),
            fixture.path.join("LocalAppData/child"),
        )
        .is_err()
    );
    let context = engine::context::Context::isolated(
        fixture.path.join("LocalAppData"),
        key,
        fixture.path.join("shell"),
    )
    .unwrap();
    assert!(
        context
            .validate_root(&fixture.path.join("LocalAppData/installation"))
            .is_err()
    );
    assert!(context.validate_root(&fixture.root).is_ok());
}

#[test]
fn repair_replaces_corrupt_active_without_referencing_it_for_rollback() {
    let fixture = Fixture::new();
    let package = fixture.package("1.0.0");
    fixture
        .install(&package, Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let old = fixture.active();
    fs::write(old.join("bin/vantare.exe"), b"corrupt PE").expect("damage only QA binary");
    assert!(verified(&fixture.root).is_err());
    fixture
        .install(&package, Mode::Repair, false, false)
        .expect("repair");
    let view = verified(&fixture.root).expect("repaired");
    assert_eq!(view.installed_version(), Some("1.0.0"));
    assert!(view.state.expect("state").previous.is_none());
    assert_eq!(
        fs::read(fixture.data().join("opaque.bin")).expect("new data"),
        fs::read(old.join("data/opaque.bin")).expect("old data")
    );
    assert_eq!(
        disk::read_json(&fixture.root.join("boot-pending.json"), None).expect("boot marker")["previous"],
        ""
    );
}

#[test]
fn repair_and_update_renew_stale_root_launcher() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let launcher = fixture.root.join("Vantare.exe");
    fs::write(&launcher, b"stale root image").unwrap();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Repair, false, false)
        .unwrap();
    assert_eq!(
        fs::read(&launcher).unwrap(),
        fs::read(fixture.active().join("bin/vantare.exe")).unwrap()
    );
    operations::confirm(&fixture.root).unwrap();

    fs::write(&launcher, b"stale after repair").unwrap();
    let package = fixture.package("1.0.1");
    let cancel = AtomicBool::new(false);
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut |_| {},
    };
    operations::update(&fixture.root, &package.borrowed(), false, &mut control).unwrap();
    assert_eq!(
        fs::read(&launcher).unwrap(),
        fs::read(fixture.active().join("bin/vantare.exe")).unwrap()
    );
}

#[test]
fn user_junction_is_readable_for_start_but_blocks_data_copy() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let target = fixture.path.join("junction-target");
    fs::create_dir_all(&target).unwrap();
    let link = fixture.data().join("user-junction");
    std::os::windows::fs::symlink_dir(&target, &link).unwrap();
    assert_eq!(
        Installation::read(&fixture.root)
            .unwrap()
            .installed_version(),
        Some("1.0.0")
    );
    let package = fixture.package("1.0.1");
    let cancel = AtomicBool::new(false);
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut |_| {},
    };
    assert!(operations::update(&fixture.root, &package.borrowed(), false, &mut control).is_err());
    assert_eq!(
        Installation::read(&fixture.root)
            .unwrap()
            .installed_version(),
        Some("1.0.0")
    );
    fs::remove_dir(&link).unwrap();
}

#[test]
fn retirement_uses_the_shared_reader_and_rejects_invalid_references_before_deleting() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let data = fixture.data();
    let before_data = disk::data_index(&data).expect("data index");
    let path = fixture.root.join("state.json");
    let before = disk::read_json(&path, None).expect("original state");
    for fault in [
        "schema",
        "active-reference",
        "active-hash",
        "previous-missing",
        "previous-hash",
        "channel",
    ] {
        let mut value = before.clone();
        match fault {
            "previous-missing" => {
                value.as_object_mut().unwrap().remove("previous");
            }
            "previous-hash" => {
                value["previous"] = value["active"].clone();
                value["previous"]["manifest_sha256"] = json!("invalid");
            }
            "schema" => value["schema"] = json!(2),
            "active-reference" => value["active"]["generation"] = json!("../outside"),
            "active-hash" => value["active"]["manifest_sha256"] = json!("invalid"),
            "channel" => value["channel"] = json!("nightly"),
            _ => unreachable!(),
        }
        let bytes = serde_json::to_vec(&value).expect("invalid fixture");
        fs::write(&path, &bytes).expect("isolated state fault");
        if fault == "previous-hash" {
            assert_eq!(
                Installation::read(&fixture.root).unwrap().previous_warning,
                Some("previous-corrupt")
            );
        } else {
            assert!(Installation::read(&fixture.root).is_err(), "{fault}");
        }
        let cancel = AtomicBool::new(false);
        let mut control = Control {
            cancel: &cancel,
            progress: &mut |_| {},
            checkpoint: &mut |_| Ok(()),
            warning: &mut |_| {},
        };
        let error = operations::uninstall(&fixture.root, "beta", &mut control, |_| {
            panic!("invalid state cannot reach finalization")
        })
        .expect_err("invalid retirement state");
        assert_eq!(error.code, 1, "{fault}");
        assert_eq!(fs::read(&path).expect("state retained"), bytes, "{fault}");
        assert_eq!(
            disk::data_index(&data).expect("data retained"),
            before_data,
            "{fault}"
        );
        assert!(!fixture.root.join("retained-data.json").exists(), "{fault}");
    }
}

#[test]
fn downgrade_and_pending_boot_rejections_leave_current_state_and_data_intact() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.1"), Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let state = fs::read(fixture.root.join("state.json")).expect("state");
    assert_eq!(
        fixture
            .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
            .expect_err("downgrade")
            .code,
        3
    );
    fs::write(fixture.root.join("boot-pending.json"), b"{}").expect("pending fixture");
    assert_eq!(
        fixture
            .install(&fixture.package("1.0.2"), Mode::Auto, false, false)
            .expect_err("pending boot")
            .code,
        4
    );
    assert_eq!(
        fs::read(fixture.root.join("state.json")).expect("state unchanged"),
        state
    );
    assert_eq!(
        fs::read(fixture.data().join("opaque.bin")).expect("data intact"),
        b"opaque\0user\xffbytes"
    );
}

#[test]
fn interrupted_uninstall_resumes_and_preserves_data_empty_folders_and_foreign_files() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("install");
    fixture.write_data();
    let active = fixture.active();
    let data = disk::data_index(&active.join("data")).expect("data before");
    fs::write(active.join("bin/foreign.dll"), b"foreign bytes").expect("foreign file");
    let cancel = AtomicBool::new(false);
    let mut count = 0;
    let mut checkpoint = |point: &str| {
        if point == "uninstall-member" {
            count += 1;
        }
        if count == 3 {
            Err(engine::WriteError::new(1, "injected interruption"))
        } else {
            Ok(())
        }
    };
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut checkpoint,
        warning: &mut |_| {},
    };
    assert!(operations::uninstall(&fixture.root, "beta", &mut control, |_| Ok(())).is_err());
    assert!(fixture.root.join("state.json").is_file());
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut |_| {},
    };
    operations::uninstall(&fixture.root, "beta", &mut control, |_| Ok(())).expect("resume");
    assert!(!fixture.root.join("state.json").exists());
    assert_eq!(
        disk::data_index(&active.join("data")).expect("retained data"),
        data
    );
    assert_eq!(
        fs::read(active.join("bin/foreign.dll")).expect("foreign preserved"),
        b"foreign bytes"
    );
    assert!(active.join("data/empty/child").is_dir());
    assert_eq!(
        disk::read_json(&fixture.root.join("retained-data.json"), None).expect("retained marker")["version"],
        "1.0.0"
    );
}

#[test]
fn session_lock_and_running_image_block_mutation_without_killing_the_process() {
    let fixture = Fixture::new();
    let package = fixture.package("1.0.0");
    fixture
        .install(&package, Mode::Auto, false, false)
        .expect("install");
    let lock = disk::lock(&fixture.root, "beta-session.lock").expect("held session");
    assert_eq!(
        fixture
            .install(&package, Mode::Auto, false, false)
            .expect_err("locked")
            .code,
        2
    );
    drop(lock);
    let mut owned = OwnedChild(
        Command::new(fixture.active().join("bin/vantare.exe"))
            .args(["/D", "/Q", "/C", "echo READY&set /p value="])
            .creation_flags(0x0800_0000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .expect("owned inert QA child"),
    );
    let child = &mut owned.0;
    let mut ready = String::new();
    BufReader::new(child.stdout.take().expect("child stdout"))
        .read_line(&mut ready)
        .expect("explicit ready handshake");
    let result = fixture.install(&package, Mode::Auto, false, false);
    let alive = child.try_wait().expect("owned child status").is_none();
    child
        .stdin
        .as_mut()
        .expect("owned stdin")
        .write_all(b"continue\r\n")
        .expect("release child");
    drop(child.stdin.take());
    let status = child.wait().expect("reap owned child");
    assert_eq!(ready.trim(), "READY");
    assert!(alive, "writer must never kill the application");
    assert!(status.success());
    assert_eq!(result.expect_err("running image guard").code, 2);
}

#[test]
fn retained_data_adoption_requires_one_copy_or_byte_identical_copies() {
    for identical in [true, false] {
        let fixture = Fixture::new();
        disk::open_root(&fixture.root, true).expect("recognized retained root");
        for (id, bytes) in [
            ("a".repeat(32), b"first".as_slice()),
            ("b".repeat(32), if identical { b"first" } else { b"other" }),
        ] {
            let data = fixture.root.join("generations").join(id).join("data");
            fs::create_dir_all(data.join("empty")).expect("retained folders");
            fs::write(data.join("user.bin"), bytes).expect("retained bytes");
        }
        let result = fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, false);
        assert_eq!(result.is_ok(), identical);
        if identical {
            assert_eq!(
                fs::read(fixture.data().join("user.bin")).expect("adopted data"),
                b"first"
            );
        } else {
            assert!(!fixture.root.join("state.json").exists());
        }
        assert_eq!(
            fs::read(
                fixture
                    .root
                    .join("generations")
                    .join("b".repeat(32))
                    .join("data/user.bin")
            )
            .expect("old data preserved"),
            if identical { b"first" } else { b"other" }
        );
    }
}

#[test]
fn zip_links_duplicates_traversal_and_uncompressed_limits_are_rejected_before_activation() {
    for fault in [
        "windows-link",
        "unix-link",
        "traversal",
        "duplicate",
        "member-limit",
        "total-limit",
    ] {
        let fixture = Fixture::new();
        let mut package = fixture.package("1.0.0");
        let mut bytes = fs::read(&package.path).expect("ZIP bytes");
        let eocd = bytes
            .windows(4)
            .rposition(|v| v == b"PK\x05\x06")
            .expect("end of directory");
        let directory = usize::try_from(u32::from_le_bytes(
            bytes[eocd + 16..eocd + 20].try_into().expect("offset"),
        ))
        .expect("directory offset");
        match fault {
            "windows-link" => {
                bytes[directory + 38..directory + 42].copy_from_slice(&0x400_u32.to_le_bytes());
            }
            "unix-link" => bytes[directory + 38..directory + 42]
                .copy_from_slice(&0xa000_0000_u32.to_le_bytes()),
            "traversal" => bytes[directory + 46..directory + 49].copy_from_slice(b"../"),
            "member-limit" => bytes[directory + 24..directory + 28]
                .copy_from_slice(&(256_u32 * 1024 * 1024 + 1).to_le_bytes()),
            "total-limit" => {
                let mut offset = directory;
                for _ in 0..4 {
                    bytes[offset + 24..offset + 28]
                        .copy_from_slice(&(250_u32 * 1024 * 1024).to_le_bytes());
                    let length: usize = [28, 30, 32]
                        .into_iter()
                        .map(|i| {
                            usize::from(u16::from_le_bytes([
                                bytes[offset + i],
                                bytes[offset + i + 1],
                            ]))
                        })
                        .sum();
                    offset += 46 + length;
                }
            }
            "duplicate" => {
                let length: usize = [28, 30, 32]
                    .into_iter()
                    .map(|i| {
                        usize::from(u16::from_le_bytes([
                            bytes[directory + i],
                            bytes[directory + i + 1],
                        ]))
                    })
                    .sum();
                let record = bytes[directory..directory + 46 + length].to_vec();
                let size = u32::from_le_bytes(
                    bytes[eocd + 12..eocd + 16]
                        .try_into()
                        .expect("directory size"),
                );
                let count =
                    u16::from_le_bytes(bytes[eocd + 10..eocd + 12].try_into().expect("count")) + 1;
                bytes[eocd + 8..eocd + 10].copy_from_slice(&count.to_le_bytes());
                bytes[eocd + 10..eocd + 12].copy_from_slice(&count.to_le_bytes());
                bytes[eocd + 12..eocd + 16].copy_from_slice(
                    &(size + u32::try_from(record.len()).expect("record size")).to_le_bytes(),
                );
                drop(bytes.splice(eocd..eocd, record));
            }
            _ => unreachable!(),
        }
        fs::write(&package.path, &bytes).expect("isolated invalid ZIP");
        package.sha = format!("{:x}", Sha256::digest(&bytes));
        let sentinel = fixture.path.join("sentinel");
        fs::write(&sentinel, b"outside install").expect("sentinel");
        assert!(
            fixture.install(&package, Mode::Auto, false, false).is_err(),
            "{fault}"
        );
        assert!(!fixture.root.join("state.json").exists(), "{fault}");
        assert_eq!(
            fs::read(sentinel).expect("untouched sentinel"),
            b"outside install"
        );
    }
}

#[test]
fn zip_uncompressed_size_is_a_streaming_limit_even_if_the_directory_lies() {
    let fixture = Fixture::new();
    let package = fixture.package("1.0.0");
    let mut source = zip::ZipArchive::new(fs::File::open(&package.path).expect("source ZIP"))
        .expect("source directory");
    let path = fixture.path.join("understated-deflate.zip");
    let mut writer = zip::ZipWriter::new(fs::File::create(&path).expect("deflated ZIP"));
    for index in 0..source.len() {
        let mut member = source.by_index(index).expect("source member");
        writer
            .start_file(
                member.name().to_owned(),
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated),
            )
            .expect("deflated member");
        std::io::copy(&mut member, &mut writer).expect("repack fixture");
    }
    writer.finish().expect("ZIP finish");
    let mut bytes = fs::read(&path).expect("deflated bytes");
    let eocd = bytes
        .windows(4)
        .rposition(|value| value == b"PK\x05\x06")
        .expect("EOCD");
    let directory = usize::try_from(u32::from_le_bytes(
        bytes[eocd + 16..eocd + 20]
            .try_into()
            .expect("directory offset"),
    ))
    .expect("directory position");
    assert_eq!(&bytes[..4], b"PK\x03\x04");
    // Both headers agree on one byte; the real Deflate stream contains an inert
    // PE fixture. The external SHA is valid, so this tests the extraction bound.
    bytes[22..26].copy_from_slice(&1_u32.to_le_bytes());
    bytes[directory + 24..directory + 28].copy_from_slice(&1_u32.to_le_bytes());
    fs::write(&path, &bytes).expect("isolated malformed ZIP");
    let sha = format!("{:x}", Sha256::digest(&bytes));
    let destination = fixture.path.join("partial");
    assert!(engine::package::expand(&path, &sha, &destination, "beta").is_err());
    let written = fs::metadata(destination.join(&test_members()[0])).expect("streaming started");
    assert!(
        written.len() <= 2,
        "declared one byte, wrote {} bytes",
        written.len()
    );
}

/// The feed update of `package` in an owned child that exits abruptly at
/// `point`, as a power cut or a killed session would leave it.
fn cut_update_at(fixture: &Fixture, package: &Package, point: &str) {
    let temp = fixture.path.join(format!("temp-{point}"));
    fs::create_dir(&temp).expect("isolated temp");
    let input = fixture.path.join(format!("request-{point}.json"));
    fs::write(&input,serde_json::to_vec(&json!({"root":fixture.root,"archive":package.path,"sha256":package.sha,"version":package.version,"stopAt":point})).expect("guarded request")).expect("request file");
    let output = Command::new(std::env::current_exe().expect("owned libtest child"))
        .args([
            "--exact",
            "checkpoint_process_worker",
            "--ignored",
            "--nocapture",
        ])
        .env("VANTARE_P4_CRASH_REQUEST", input)
        .env("TEMP", &temp)
        .env("TMP", &temp)
        .env("LOCALAPPDATA", fixture.path.join("LocalAppData"))
        .creation_flags(0x0800_0000)
        .output()
        .expect("owned crash fixture child");
    assert_eq!(
        output.status.code(),
        Some(90),
        "{point}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn abrupt_process_exit_at_staged_and_commit_never_leaves_torn_state() {
    for point in ["staged", "before-commit", "after-commit"] {
        let fixture = Fixture::new();
        fixture
            .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
            .expect("initial install");
        fixture.write_data();
        let old = fs::read(fixture.root.join("state.json")).expect("old state bytes");
        let package = fixture.package("1.0.1");
        cut_update_at(&fixture, &package, point);
        let view = verified(&fixture.root).expect("fully valid state after abrupt exit");
        assert_eq!(
            view.installed_version(),
            Some(if point == "after-commit" {
                "1.0.1"
            } else {
                "1.0.0"
            })
        );
        if point != "after-commit" {
            assert_eq!(
                fs::read(fixture.root.join("state.json")).expect("old bytes untouched"),
                old
            );
        }
        assert_eq!(
            fs::read(fixture.data().join("opaque.bin")).expect("data ready before activation"),
            b"opaque\0user\xffbytes"
        );
        if point != "after-commit" {
            let marker = fixture.root.join("boot-pending.json");
            assert!(marker.exists(), "crash left a pending trial before commit");
            let pending = disk::read_json(&marker, Some(4096)).unwrap();
            let orphan = fixture
                .root
                .join("generations")
                .join(pending["stagedGeneration"].as_str().unwrap());
            assert!(orphan.exists(), "staged generation reached disk");
            let locked = if point == "before-commit" {
                Some(
                    fs::OpenOptions::new()
                        .read(true)
                        .share_mode(0)
                        .open(orphan.join(&test_members()[0]))
                        .expect("lock one orphan member"),
                )
            } else {
                None
            };
            assert!(operations::discard_stale_boot_marker(&fixture.root).unwrap());
            assert!(!marker.exists(), "startup clears the uncommitted trial");
            assert_eq!(
                orphan.exists(),
                locked.is_some(),
                "failed cleanup is best effort"
            );
            drop(locked);
            let cancel = AtomicBool::new(false);
            let mut control = Control {
                cancel: &cancel,
                progress: &mut |_| {},
                checkpoint: &mut |_| Ok(()),
                warning: &mut |_| {},
            };
            operations::update(&fixture.root, &package.borrowed(), false, &mut control)
                .expect("next update succeeds");
            assert_eq!(
                verified(&fixture.root).unwrap().installed_version(),
                Some("1.0.1")
            );
        }
    }
}

// Deliberately not a standalone gate: the parent test runs this helper three times
// with an owned process and asserts its abrupt exit and committed disk bytes.
#[test]
#[ignore = "subprocess fixture for abrupt_process_exit_at_staged_and_commit"]
fn checkpoint_process_worker() {
    let input = PathBuf::from(
        std::env::var_os("VANTARE_P4_CRASH_REQUEST").expect("explicit child request"),
    );
    qa_path(&input).expect("guarded child input");
    let value = disk::read_json(&input, Some(65536)).expect("finite QA request");
    let root = PathBuf::from(value["root"].as_str().expect("root"));
    let archive = PathBuf::from(value["archive"].as_str().expect("archive"));
    qa_path(&root).expect("guarded root");
    qa_path(&archive).expect("guarded archive");
    let point = value["stopAt"].as_str().expect("checkpoint");
    assert!(["staged", "before-commit", "after-commit"].contains(&point));
    let cancel = AtomicBool::new(false);
    let mut checkpoint = |actual: &str| {
        if actual == point {
            std::process::exit(90);
        }
        Ok(())
    };
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut checkpoint,
        warning: &mut |_| {},
    };
    let package = operations::Package {
        archive: &archive,
        sha256: value["sha256"].as_str().expect("sha"),
        version: value["version"].as_str().expect("version"),
        channel: "beta",
    };
    operations::update(&root, &package, false, &mut control).expect("update reaches checkpoint");
    panic!("requested checkpoint was not reached");
}

// Captured package metadata remains a fixture, never a production allowlist.
fn test_members() -> Vec<String> {
    let manifest: serde_json::Value =
        serde_json::from_slice(include_bytes!("../fixtures/manifest-full.json"))
            .expect("full QA manifest");
    manifest["files"]
        .as_array()
        .expect("manifest files")
        .iter()
        .map(|file| file["path"].as_str().expect("manifest path").to_owned())
        .filter(|name| name != "candidate.ps1")
        .collect()
}

#[test]
fn authenticated_package_accepts_a_resource_unknown_to_the_installed_engine() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let grown = fixture.package_with_resource(
        "1.0.1",
        Some(("assets/future-resource.bin", b"future resource")),
    );
    fixture.install(&grown, Mode::Auto, false, false).unwrap();
    assert_eq!(
        fs::read(fixture.active().join("assets/future-resource.bin")).unwrap(),
        b"future resource"
    );
}

#[test]
fn uninstall_keeps_unreferenced_binaries_with_their_path_and_reason_in_the_log() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    fixture.write_data();
    let active = fixture.active();
    let before = disk::data_index(&active.join("data")).unwrap();
    let orphan = disk::path(&fixture.root.join("generations").join("d".repeat(32))).unwrap();
    fs::create_dir_all(orphan.join("bin")).unwrap();
    fs::create_dir_all(orphan.join("data/empty")).unwrap();
    let executable = orphan.join("bin/orphan.exe");
    fs::write(&executable, b"unreferenced own bytes").unwrap();
    fs::write(
        orphan.join("manifest.json"),
        include_bytes!("../fixtures/manifest-rc.json"),
    )
    .unwrap();
    fs::write(active.join("bin/foreign.dll"), b"foreign bytes").unwrap();
    let cancel = AtomicBool::new(false);
    let mut diagnostics = Vec::new();
    let mut warning = |message: &str| diagnostics.push(message.to_owned());
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut warning,
    };
    operations::uninstall(&fixture.root, "beta", &mut control, |_| Ok(())).unwrap();
    assert!(!fixture.root.join("state.json").exists());
    assert_eq!(fs::read(&executable).unwrap(), b"unreferenced own bytes");
    assert!(orphan.join("manifest.json").is_file());
    assert!(orphan.join("data/empty").is_dir());
    assert_eq!(
        fs::read(active.join("bin/foreign.dll")).unwrap(),
        b"foreign bytes"
    );
    assert_eq!(disk::data_index(&active.join("data")).unwrap(), before);
    // Its manifest does not list that binary, so nothing proves it is ours.
    assert!(noted(
        &diagnostics,
        &executable,
        "no figura en el manifiesto"
    ));
}

#[test]
fn activation_passes_cached_metadata_without_reopening_the_old_manifest() {
    use std::os::windows::fs::OpenOptionsExt;
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let old_manifest = fixture.active().join("manifest.json");
    let incoming = fixture.package("1.0.1");
    let mut held = None;
    let mut checkpoint = |point: &str| {
        if point == "staged" {
            held = Some(
                fs::OpenOptions::new()
                    .read(true)
                    .share_mode(0)
                    .open(&old_manifest)?,
            );
        }
        Ok(())
    };
    let cancel = AtomicBool::new(false);
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut checkpoint,
        warning: &mut |_| {},
    };
    operations::install(
        &fixture.root,
        &incoming.borrowed(),
        Mode::Auto,
        &mut control,
        |_, restoring, projection| {
            assert!(!restoring);
            assert_eq!(projection.unwrap().1, "1.0.1");
            Ok(())
        },
        || Ok(()),
    )
    .unwrap();
    assert!(held.is_some());
    drop(held);
    assert_eq!(
        verified(&fixture.root).unwrap().installed_version(),
        Some("1.0.1")
    );
}

fn verified(root: &Path) -> Result<Installation, engine::ReadError> {
    let mut view = Installation::read(root)?;
    view.verify(root)?;
    Ok(view)
}

#[test]
fn denied_state_restoration_preserves_committed_state_and_does_not_project_an_old_snapshot() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let incoming = fixture.package("1.0.1");
    let mut state_lock = None;
    let mut projected_old = false;
    let cancel = AtomicBool::new(false);
    let mut warnings = Vec::new();
    let mut warning = |message: &str| warnings.push(message.to_owned());
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut warning,
    };
    let result = operations::install(
        &fixture.root,
        &incoming.borrowed(),
        Mode::Auto,
        &mut control,
        |_, restoring, _| {
            projected_old |= restoring;
            if !restoring {
                state_lock = Some(
                    fs::OpenOptions::new()
                        .read(true)
                        .share_mode(1)
                        .open(fixture.root.join("state.json"))?,
                );
            }
            Err(engine::WriteError::new(1, "injected projection failure"))
        },
        || Ok(()),
    );
    assert!(result.is_err());
    assert!(!projected_old);
    drop(state_lock);
    assert_eq!(
        verified(&fixture.root).unwrap().installed_version(),
        Some("1.0.1")
    );
    assert!(fixture.root.join("boot-pending.json").is_file());
    assert_ne!(warnings, [] as [std::string::String; 0]);
}

#[test]
fn integrity_checks_reject_a_sidecar_reparse_before_attempting_to_read_it() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    let mut view = Installation::read(&fixture.root).unwrap();
    let sidecar = fixture.active().join("bin/vantare.exe.sha256");
    let canary = fixture.path.join("unread-canary.bin");
    fs::write(&canary, b"must not be opened").unwrap();
    let _held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&canary)
        .unwrap();
    fs::remove_file(&sidecar).unwrap();
    std::os::windows::fs::symlink_file(&canary, &sidecar).unwrap();
    assert!(matches!(
        view.verify(&fixture.root),
        Err(engine::ReadError::Invalid(_))
    ));
}

#[test]
fn repair_without_active_state_rejects_before_touching_a_pending_cleanup() {
    let fixture = Fixture::new();
    let package = fixture.package("1.0.0");
    fixture.install(&package, Mode::Auto, false, false).unwrap();
    fixture.write_data();
    let data = fixture.data();
    let before = disk::data_index(&data).unwrap();
    let cancel = AtomicBool::new(false);
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut |_| {},
    };
    operations::uninstall(&fixture.root, "beta", &mut control, |_| Ok(())).unwrap();
    let marker = fixture.root.join("installer-cleanup.json");
    fs::write(&marker, b"pending cleanup sentinel").unwrap();
    let error = operations::install(
        &fixture.root,
        &package.borrowed(),
        Mode::Repair,
        &mut control,
        |_, _, _| panic!("invalid repair cannot finalize"),
        || panic!("invalid repair cannot prepare or mutate pending cleanup"),
    )
    .expect_err("repair needs active state before pending-cleanup handling");
    assert_eq!(error.code, 3);
    assert_eq!(fs::read(&marker).unwrap(), b"pending cleanup sentinel");
    assert_eq!(disk::data_index(&data).unwrap(), before);
    assert!(!fixture.root.join("state.json").exists());
}

// Electron generation (ISA-2737, P4 of #1995). Paths of the sealed Electron
// 45.2.3 tree in the P3 candidate receipt; only names travel here and the bytes
// are inert fixtures: no Electron, host or window is ever started.
const HUB_UI: [&str; 21] = [
    "LICENSE",
    "LICENSES.chromium.html",
    "chrome_100_percent.pak",
    "chrome_200_percent.pak",
    "d3dcompiler_47.dll",
    "dxcompiler.dll",
    "electron_wer.dll",
    "ffmpeg.dll",
    "icudtl.dat",
    "locales/en-US.pak",
    "locales/es.pak",
    "resources.pak",
    "resources/app.asar",
    "snapshot_blob.bin",
    "v8_context_snapshot.bin",
    "vantare-hub-ui.exe",
    "vantare-hub-ui.exe.sha256",
    "version",
    "vk_swiftshader.dll",
    "vk_swiftshader_icd.json",
    "vulkan-1.dll",
];
const ELECTRON: &str = "hub-ui/vantare-hub-ui.exe";
const ASAR: &str = "hub-ui/resources/app.asar";
type Index = BTreeMap<PathBuf, Option<(u64, String)>>;

fn inert_pe() -> Vec<u8> {
    let system = PathBuf::from(std::env::var_os("WINDIR").expect("Windows root"));
    fs::read(system.join("System32/cmd.exe")).expect("inert PE fixture")
}
fn electron_members() -> Vec<String> {
    let added = [
        "bin/vantare-overlays-rune.exe",
        "bin/vantare-overlays-rune.exe.sha256",
        "licenses/hub-web-notices.txt",
    ];
    test_members()
        .into_iter()
        .chain(added.map(String::from))
        .chain(HUB_UI.iter().map(|name| format!("hub-ui/{name}")))
        .collect()
}
fn index(path: &Path) -> Index {
    disk::data_index(path).expect("content index")
}
fn children(path: &Path) -> usize {
    fs::read_dir(path).expect("directory").count()
}
fn utf16(text: &str) -> Vec<u8> {
    text.encode_utf16().flat_map(u16::to_le_bytes).collect()
}
fn contains(bytes: &[u8], needle: &[u8]) -> bool {
    bytes.windows(needle.len()).any(|window| window == needle)
}
/// Another program keeps the file open for reading, as a mapped image or a scanner does.
fn hold(path: &Path) -> fs::File {
    fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(path)
        .expect("held file")
}
struct Sink(
    fn(vantare_installer::model::Progress),
    fn(&str) -> disk::Result<()>,
    fn(&str),
);
impl Sink {
    fn new() -> Self {
        Self(|_| {}, |_| Ok(()), |message| eprintln!("{message}"))
    }
    fn control<'a>(&'a mut self, cancel: &'a AtomicBool) -> Control<'a> {
        Control {
            cancel,
            progress: &mut self.0,
            checkpoint: &mut self.1,
            warning: &mut self.2,
        }
    }
}

/// Injected Windows projection: a QA HKCU prefix and shell folders, never the real ones.
struct Shell {
    context: Context,
    payload: PathBuf,
    registry: String,
    folders: PathBuf,
}
impl Drop for Shell {
    fn drop(&mut self) {
        let _ = windows_registry::CURRENT_USER.remove_tree(&self.registry);
    }
}
/// Real `ACCESS_DENIED` when reading one QA file; the ACE is always removed.
/// A file on purpose: a session holding the backup and restore privileges
/// renames and creates directories regardless of a deny ACE on the folder.
struct Denied(PathBuf);
impl Denied {
    fn new(path: &Path) -> Self {
        Self::icacls(path, "/deny", "*S-1-1-0:(RD)");
        Self(path.to_path_buf())
    }
    fn icacls(path: &Path, action: &str, entry: &str) {
        qa_path(path).expect("QA guard");
        let system = PathBuf::from(std::env::var_os("WINDIR").expect("Windows root"));
        let status = Command::new(system.join("System32/icacls.exe"))
            .arg(path)
            .args([action, entry])
            .creation_flags(0x0800_0000)
            .stdout(Stdio::null())
            .status()
            .expect("icacls");
        assert!(status.success(), "icacls {action}");
    }
}
impl Drop for Denied {
    fn drop(&mut self) {
        Self::icacls(&self.0, "/remove:d", "*S-1-1-0");
    }
}

impl Fixture {
    fn shell(&self) -> Shell {
        self.shell_in(self.path.join("shell"))
    }
    fn shell_in(&self, folders: PathBuf) -> Shell {
        let registry = format!(
            "Software\\VantareInstallerMatrix\\{}",
            disk::id().expect("hive ID")
        );
        self.shell_with("beta", folders, registry)
    }
    /// A product context over the given injected HKCU subkey and shell folders,
    /// so two products can share the same simulated user (#2812).
    fn shell_with(&self, channel: &str, folders: PathBuf, registry: String) -> Shell {
        let payload = self.path.join("payload");
        fs::create_dir_all(&payload).expect("payload");
        fs::write(payload.join("Uninstall.exe"), inert_pe()).expect("inert uninstaller");
        fs::write(payload.join("installer-notices.txt"), b"notices").expect("notices");
        Shell {
            context: Context::isolated(
                self.path.join("LocalAppData"),
                registry.clone(),
                folders.clone(),
            )
            .and_then(|context| context.for_channel(channel))
            .expect("isolated context"),
            payload,
            registry,
            folders,
        }
    }
    /// Same composition as the product `Session`: Probe carries the stored
    /// options, then one engine transaction ends in the real `shell::sync`.
    fn setup(
        &self,
        shell: &Shell,
        package: &Package,
        mode: Mode,
        autostart: Option<bool>,
    ) -> disk::Result<()> {
        let root = disk::path(&self.root)?;
        let arguments = Args {
            root: Some(root.clone()),
            ..Args::default()
        };
        let mut request = engine::Request::new(&arguments, engine::Operation::Install);
        let found = shell.context.probe(&request)?;
        (request.mode, request.desktop) = (mode, found.desktop);
        request.autostart = autostart.unwrap_or(found.autostart);
        let previous = engine::context::options(&root, false)?;
        let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
        operations::install(
            &root,
            &package.borrowed(),
            mode,
            &mut sink.control(&cancel),
            |control, restoring, projection| {
                let options = engine::shell::Options {
                    request: &request,
                    previous: previous.as_ref(),
                    payload: &shell.payload,
                    restoring,
                };
                engine::shell::sync(
                    &root,
                    &shell.context,
                    projection,
                    &options,
                    control.progress,
                    control.warning,
                )
            },
            || Ok(()),
        )
    }
    fn remove(&self, shell: &Shell) -> disk::Result<()> {
        let root = disk::path(&self.root)?;
        let arguments = Args {
            root: Some(root.clone()),
            uninstall: true,
            ..Args::default()
        };
        let request = engine::Request::new(&arguments, engine::Operation::Uninstall);
        let previous = engine::context::options(&root, true)?;
        let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
        let channel = shell.context.product()?.channel;
        operations::uninstall(&root, channel, &mut sink.control(&cancel), |control| {
            let options = engine::shell::Options {
                request: &request,
                previous: previous.as_ref(),
                payload: &shell.payload,
                restoring: false,
            };
            engine::shell::sync(
                &root,
                &shell.context,
                None,
                &options,
                control.progress,
                control.warning,
            )
        })
    }
    /// Opaque user tree as the Electron Hub leaves it: a damaged ("protected")
    /// document, unknown and read-only files, Chromium-like names, empty folders.
    fn write_documents(&self) {
        let data = self.data();
        let documents: [(&str, &[u8]); 6] = [
            ("hub/hub-settings.json", b"{protected-after-start"),
            ("hub/hub-ui/Local State", b"{\"profile\":1}"),
            ("hub/hub-ui/Local Storage/leveldb/3.log", b"\0leveldb\xff"),
            ("Vantare/native/layout.json", b"{\"revision\":7}"),
            ("Vantare/native/rights.bin", b"read-only"),
            ("desconocido sin extensión", b""),
        ];
        for (name, bytes) in documents {
            let path = data.join(name);
            fs::create_dir_all(path.parent().expect("parent")).expect("user folders");
            fs::write(path, bytes).expect("user document");
        }
        fs::create_dir_all(data.join("hub/hub-ui/Cache/vacía")).expect("empty folder");
        let path = data.join("Vantare/native/rights.bin");
        let mut permissions = fs::metadata(&path).expect("metadata").permissions();
        permissions.set_readonly(true);
        fs::set_permissions(path, permissions).expect("read-only document");
    }
}

/// Start menu and Startup run the root launcher of this root, never the host or Electron.
fn assert_launcher_links(fixture: &Fixture, shell: &Shell, startup: bool) {
    let root = disk::path(&fixture.root).expect("root");
    let launch = format!("--root -Root \"{}\"", root.display());
    let mut links = vec![(
        "Programs/Vantare/Vantare Simracing Suite.lnk",
        launch.clone(),
    )];
    if startup {
        links.push(("Startup/Vantare.lnk", format!("{launch} --background")));
    }
    for (name, arguments) in links {
        let bytes = fs::read(shell.folders.join(name)).expect("own link");
        assert!(contains(&bytes, &utf16(&arguments)), "{name}");
        for foreign in ["vantare-hub", "hub-ui"] {
            assert!(
                !contains(&bytes, &utf16(foreign)) && !contains(&bytes, foreign.as_bytes()),
                "{name}: {foreign}"
            );
        }
    }
}

#[test]
fn fresh_setup_installs_the_electron_tree_behind_the_root_launcher() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    fixture
        .setup(&shell, &fixture.electron("1.0.0"), Mode::Auto, Some(true))
        .unwrap();
    let view = verified(&fixture.root).unwrap();
    assert_eq!(view.installed_version(), Some("1.0.0"));
    assert_eq!(view.manifest.as_ref().unwrap().engine(), 2);
    let active = fixture.active();
    for name in HUB_UI {
        assert!(active.join("hub-ui").join(name).is_file(), "{name}");
    }
    assert_eq!(children(&active.join("data")), 0);
    assert!(!fixture.root.join("boot-pending.json").exists());
    assert_eq!(
        fs::read(fixture.root.join("Vantare.exe")).unwrap(),
        fs::read(active.join("bin/vantare.exe")).unwrap()
    );
    assert_launcher_links(&fixture, &shell, true);
    assert_eq!(
        shell.context.install_location().unwrap(),
        Some(disk::path(&fixture.root).unwrap().display().to_string())
    );
}

#[test]
fn relay_from_a_gpui_motor_two_generation_copies_data_and_keeps_options_and_links() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    fixture
        .setup(&shell, &fixture.package("1.0.0"), Mode::Auto, Some(true))
        .unwrap();
    fixture.write_documents();
    let old = fixture.active();
    let before = index(&old.join("data"));
    let options = fs::read(fixture.root.join("installer-ui.json")).unwrap();
    fixture
        .setup(&shell, &fixture.electron("1.0.1"), Mode::Auto, None)
        .unwrap();
    let view = verified(&fixture.root).unwrap();
    assert_eq!(view.installed_version(), Some("1.0.1"));
    let new = fixture.active();
    assert!(new.join(ELECTRON).is_file() && !old.join("hub-ui").exists());
    assert_eq!(index(&new.join("data")), before);
    assert_eq!(index(&old.join("data")), before);
    let copied = fs::metadata(new.join("data/Vantare/native/rights.bin")).unwrap();
    assert!(copied.permissions().readonly());
    assert_eq!(
        view.state.unwrap().previous.unwrap().generation,
        old.file_name().unwrap().to_string_lossy()
    );
    assert_eq!(
        fs::read(fixture.root.join("installer-ui.json")).unwrap(),
        options
    );
    let launcher = fs::read(fixture.root.join("Vantare.exe")).unwrap();
    assert_eq!(launcher, fs::read(new.join("bin/vantare.exe")).unwrap());
    assert_ne!(launcher, fs::read(old.join("bin/vantare.exe")).unwrap());
    assert_launcher_links(&fixture, &shell, true);
    let marker = disk::read_json(&fixture.root.join("boot-pending.json"), None).unwrap();
    assert_eq!(marker["version"], "1.0.1");
}

#[test]
fn rollback_after_the_relay_returns_to_gpui_and_keeps_both_data_snapshots_apart() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    fixture.write_documents();
    let old = fixture.active();
    let before = index(&old.join("data"));
    fixture
        .install(&fixture.electron("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    let new = fixture.active();
    // B wrote its own documents before failing to confirm its boot.
    fs::write(new.join("data/hub/hub-settings.json"), b"{\"by\":\"B\"}").unwrap();
    fs::write(new.join("data/hub/hub-ui/Preferences"), b"{}").unwrap();
    let diverged = index(&new.join("data"));
    assert_ne!(diverged, before);
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.active(), old);
    assert_eq!(index(&old.join("data")), before);
    assert_eq!(index(&new.join("data")), diverged);
    let launcher = fs::read(fixture.root.join("Vantare.exe")).unwrap();
    assert_eq!(launcher, fs::read(old.join("bin/vantare.exe")).unwrap());
    assert_ne!(launcher, fs::read(new.join("bin/vantare.exe")).unwrap());
    let status = disk::read_json(&fixture.root.join("update-status.json"), None).unwrap();
    assert_eq!(status["state"], "rollback");
    assert_eq!(status["rejectedVersion"], "1.0.1");
}

#[test]
fn repair_restores_a_damaged_electron_tree_and_keeps_the_data() {
    let fixture = Fixture::new();
    let package = fixture.electron("1.0.0");
    fixture.install(&package, Mode::Auto, false, false).unwrap();
    fixture.write_documents();
    let old = fixture.active();
    let before = index(&old.join("data"));
    fs::write(old.join(ASAR), b"tampered").unwrap();
    fs::remove_file(old.join("hub-ui/locales/es.pak")).unwrap();
    assert!(verified(&fixture.root).is_err());
    let other = fixture.electron("1.0.1");
    assert_eq!(
        fixture
            .install(&other, Mode::Repair, false, false)
            .unwrap_err()
            .code,
        3
    );
    fixture
        .install(&package, Mode::Repair, false, false)
        .unwrap();
    let view = verified(&fixture.root).unwrap();
    assert_eq!(view.installed_version(), Some("1.0.0"));
    assert!(view.state.unwrap().previous.is_none());
    let new = fixture.active();
    assert_ne!(new, old);
    assert_eq!(fs::read(new.join(ASAR)).unwrap(), b"fixture");
    assert_eq!(index(&new.join("data")), before);
    assert_eq!(index(&old.join("data")), before);
}

#[test]
fn older_setup_is_rejected_over_electron_without_touching_the_generation() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.electron("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    fixture.write_documents();
    let tree = index(&fixture.root.join("generations"));
    let state = fs::read(fixture.root.join("state.json")).unwrap();
    for older in [fixture.package("1.0.0"), fixture.electron("1.0.0")] {
        assert_eq!(
            fixture
                .install(&older, Mode::Auto, false, false)
                .unwrap_err()
                .code,
            3
        );
    }
    assert_eq!(fs::read(fixture.root.join("state.json")).unwrap(), state);
    assert_eq!(index(&fixture.root.join("generations")), tree);
    assert_eq!(children(&fixture.root.join("staging")), 0);
}

/// One fault while Setup relays GPUI to Electron: the GPUI generation stays
/// active, nothing of the failed attempt remains and a retry succeeds.
fn relay_fault(fault: &str) {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("GPUI generation");
    fixture.write_documents();
    let old = fixture.active();
    let before = index(&old.join("data"));
    let state = fs::read(fixture.root.join("state.json")).expect("state");
    let electron = fixture.electron("1.0.1");
    // Either document fault stops the data copy once the new generation is
    // already in place, so the rollback has a half-built generation to retire.
    let document = old.join("data/hub/hub-settings.json");
    let denied = (fault == "access-denied").then(|| Denied::new(&document));
    let busy = (fault == "busy-document").then(|| {
        fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&document)
            .expect("exclusive document")
    });
    let cancel = AtomicBool::new(false);
    // ERROR_DISK_FULL once the data copy has finished. A volume that is
    // really full is not reproduced on the server or in CI.
    let mut checkpoint = |point: &str| {
        if fault == "disk-full" && point == "staged" {
            return Err(engine::WriteError::from(std::io::Error::from_raw_os_error(
                112,
            )));
        }
        Ok(())
    };
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut checkpoint,
        warning: &mut |message| eprintln!("{message}"),
    };
    let error = operations::install(
        &fixture.root,
        &electron.borrowed(),
        Mode::Auto,
        &mut control,
        |_, _, _| panic!("a failed relay cannot reach the Windows projection"),
        || Ok(()),
    )
    .expect_err(fault);
    drop((denied, busy));
    assert_eq!(error.code, 1, "{fault}");
    let after = fs::read(fixture.root.join("state.json")).expect("state");
    assert_eq!(after, state, "{fault}");
    assert_eq!(fixture.active(), old, "{fault}");
    assert_eq!(index(&old.join("data")), before, "{fault}");
    assert_eq!(children(&fixture.root.join("generations")), 1, "{fault}");
    assert_eq!(children(&fixture.root.join("staging")), 0, "{fault}");
    assert!(!fixture.root.join("boot-pending.json").exists(), "{fault}");
    fixture
        .install(&electron, Mode::Auto, false, false)
        .expect(fault);
    assert_eq!(index(&fixture.data()), before, "{fault}");
}

#[test]
fn injected_disk_full_during_the_relay_keeps_gpui_active_and_can_be_retried() {
    relay_fault("disk-full");
}

#[test]
fn denied_document_during_the_relay_keeps_gpui_active_and_can_be_retried() {
    relay_fault("access-denied");
}

#[test]
fn busy_document_during_the_relay_keeps_gpui_active_and_can_be_retried() {
    relay_fault("busy-document");
}

#[test]
fn open_electron_image_blocks_setup_repair_and_uninstall_before_any_change() {
    let fixture = Fixture::new();
    let package = fixture.electron("1.0.0");
    fixture.install(&package, Mode::Auto, false, false).unwrap();
    fixture.write_documents();
    let tree = index(&fixture.root.join("generations"));
    let state = fs::read(fixture.root.join("state.json")).unwrap();
    let image = hold(&fixture.active().join(ELECTRON));
    for (incoming, mode) in [
        (fixture.electron("1.0.1"), Mode::Auto),
        (package, Mode::Repair),
    ] {
        assert_eq!(
            fixture
                .install(&incoming, mode, false, false)
                .unwrap_err()
                .code,
            2
        );
    }
    let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
    let error = operations::uninstall(&fixture.root, "beta", &mut sink.control(&cancel), |_| {
        panic!("a blocked uninstall cannot reach the Windows projection")
    })
    .unwrap_err();
    assert_eq!(error.code, 2);
    drop(image);
    assert_eq!(fs::read(fixture.root.join("state.json")).unwrap(), state);
    assert_eq!(index(&fixture.root.join("generations")), tree);
    assert!(!fixture.root.join("retained-data.json").exists());
}

#[test]
fn startup_and_foreign_links_survive_the_relay_and_uninstall() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    // Another installation of the same user owns its accesses in the same folders.
    let other = Fixture::new();
    let other_shell = other.shell_in(shell.folders.clone());
    other
        .setup(
            &other_shell,
            &other.electron("1.0.0"),
            Mode::Auto,
            Some(true),
        )
        .unwrap();
    let mut foreign: Vec<_> = [
        "Programs/Vantare/Vantare Simracing Suite.lnk",
        "Programs/Vantare/Desinstalar.lnk",
        "DesktopDirectory/Vantare Simracing Suite.lnk",
        "Startup/Vantare.lnk",
    ]
    .into_iter()
    .map(|name| shell.folders.join(name))
    .map(|path| (fs::read(&path).unwrap(), path))
    .collect();
    let intact = |foreign: &[(Vec<u8>, PathBuf)]| {
        for (bytes, path) in foreign {
            assert_eq!(&fs::read(path).unwrap(), bytes, "{}", path.display());
        }
    };
    // Its mandatory accesses stop this Setup before anything is activated.
    assert!(
        fixture
            .setup(&shell, &fixture.electron("1.0.0"), Mode::Auto, Some(true))
            .is_err()
    );
    assert!(!fixture.root.join("state.json").exists());
    intact(&foreign);
    // Only its desktop and Startup accesses remain from here on.
    for (_, path) in foreign.drain(..2) {
        fs::remove_file(path).unwrap();
    }
    fixture
        .setup(&shell, &fixture.package("1.0.0"), Mode::Auto, Some(false))
        .unwrap();
    fixture
        .setup(&shell, &fixture.electron("1.0.1"), Mode::Auto, None)
        .unwrap();
    assert_launcher_links(&fixture, &shell, false);
    intact(&foreign);
    // Asking for autostart cannot take the foreign access over: Setup fails and restores.
    operations::confirm(&fixture.root).unwrap();
    assert!(
        fixture
            .setup(&shell, &fixture.electron("1.0.2"), Mode::Auto, Some(true))
            .is_err()
    );
    assert_eq!(
        verified(&fixture.root).unwrap().installed_version(),
        Some("1.0.1")
    );
    intact(&foreign);
    fixture.remove(&shell).unwrap();
    intact(&foreign);
    assert!(!shell.folders.join("Programs/Vantare").exists());
    assert_eq!(
        verified(&other.root).unwrap().installed_version(),
        Some("1.0.0")
    );
}

#[test]
fn uninstall_retires_every_own_electron_member_and_keeps_data_and_foreign_files() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    fixture
        .setup(&shell, &fixture.package("1.0.0"), Mode::Auto, Some(true))
        .unwrap();
    fixture.write_documents();
    let old = fixture.active();
    fixture
        .setup(&shell, &fixture.electron("1.0.1"), Mode::Auto, None)
        .unwrap();
    let new = fixture.active();
    fs::write(new.join("data/hub/hub-settings.json"), b"{\"by\":\"B\"}").unwrap();
    let data = [&old, &new].map(|generation| index(&generation.join("data")));
    assert_ne!(data[0], data[1]);
    let foreign = [
        "hub-ui/debug.log",
        "hub-ui/resources/ajeno.bin",
        "bin/foreign.dll",
    ];
    for name in foreign {
        fs::write(new.join(name), name).unwrap();
    }
    // The shared reader of Setup and Repair refuses a generation with unlisted
    // files; uninstalling and installing again (below) keeps the data.
    assert!(matches!(
        Installation::read(&fixture.root),
        Err(engine::ReadError::Invalid(_))
    ));
    // A member kept open by another program stops the retirement; it can be resumed.
    let asar = hold(&new.join(ASAR));
    assert!(fixture.remove(&shell).is_err());
    assert!(fixture.root.join("state.json").is_file());
    assert!(shell.context.has_registration().unwrap());
    drop(asar);
    fixture.remove(&shell).unwrap();
    for (generation, members) in [(&old, test_members()), (&new, electron_members())] {
        for member in members.iter().map(String::as_str).chain(["manifest.json"]) {
            assert!(!generation.join(member).exists(), "{member}");
        }
    }
    assert!(!old.join("bin").exists() && !new.join("hub-ui/locales").exists());
    for name in foreign {
        assert_eq!(fs::read(new.join(name)).unwrap(), name.as_bytes(), "{name}");
    }
    assert_eq!(
        [&old, &new].map(|generation| index(&generation.join("data"))),
        data
    );
    let retained = disk::read_json(&fixture.root.join("retained-data.json"), None).unwrap();
    assert_eq!(retained["version"], "1.0.1");
    assert_eq!(
        retained["generation"],
        *new.file_name().unwrap().to_string_lossy()
    );
    assert!(!fixture.root.join("state.json").exists());
    assert!(!fixture.root.join("Vantare.exe").exists());
    assert!(!shell.context.has_registration().unwrap());
    assert!(!shell.folders.join("Programs/Vantare").exists());
    assert!(!shell.folders.join("Startup/Vantare.lnk").exists());
    // Installing again adopts the newest retained copy; an older Setup is refused.
    assert_eq!(
        fixture
            .install(&fixture.electron("1.0.0"), Mode::Auto, false, false)
            .unwrap_err()
            .code,
        3
    );
    fixture
        .install(&fixture.electron("1.0.1"), Mode::Auto, false, false)
        .unwrap();
    assert_eq!(index(&fixture.data()), data[1]);
    assert_eq!(index(&old.join("data")), data[0]);
}

#[test]
fn motor_one_relay_never_returns_to_the_old_launcher_and_repair_keeps_the_data() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    fixture
        .install(
            &fixture.package_with_engine("1.0.0", None, 1),
            Mode::Auto,
            false,
            false,
        )
        .unwrap();
    fixture.write_documents();
    let old = fixture.active();
    let before = index(&old.join("data"));
    assert!(!fixture.root.join("Vantare.exe").exists());
    let electron = fixture.electron("1.0.1");
    fixture
        .setup(&shell, &electron, Mode::Auto, Some(false))
        .unwrap();
    let new = fixture.active();
    assert_eq!(index(&new.join("data")), before);
    // The Electron generation never confirms its boot.
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::RepairRequired
    );
    assert_eq!(fixture.active(), new);
    let launcher = fs::read(fixture.root.join("Vantare.exe")).unwrap();
    assert_eq!(launcher, fs::read(new.join("bin/vantare.exe")).unwrap());
    assert_ne!(launcher, fs::read(old.join("bin/vantare.exe")).unwrap());
    assert_launcher_links(&fixture, &shell, false);
    let status = disk::read_json(&fixture.root.join("update-status.json"), None).unwrap();
    assert_eq!(status["state"], "repair");
    assert_eq!(index(&old.join("data")), before);
    fixture
        .setup(&shell, &electron, Mode::Repair, None)
        .unwrap();
    let repaired = fixture.active();
    assert_ne!(repaired, new);
    assert_eq!(
        verified(&fixture.root).unwrap().installed_version(),
        Some("1.0.1")
    );
    assert_eq!(index(&repaired.join("data")), before);
    assert_eq!(index(&old.join("data")), before);
}

// Generations left without a reference (#2740, PR 1 of 2). Confirm and
// Uninstall retire their binaries, by content, and never their `data`.
impl Fixture {
    fn confirm(&self) -> Vec<String> {
        let mut notes = Vec::new();
        operations::confirm_reporting(&self.root, &mut |note| notes.push(note.to_owned()))
            .expect("confirmed boot");
        notes
    }
    fn upgrade(&self, version: &str, mode: Mode) -> PathBuf {
        self.install(&self.electron(version), mode, false, false)
            .expect(version);
        self.active()
    }
    /// A (1.0.0) is `previous` and B (1.0.1) is active with its boot confirmed;
    /// each keeps its own snapshot of the documents. One more update leaves A
    /// without a reference.
    fn two_generations(&self) -> [PathBuf; 2] {
        let a = self.upgrade("1.0.0", Mode::Auto);
        self.write_documents();
        let b = self.upgrade("1.0.1", Mode::Auto);
        assert_eq!(self.confirm(), [] as [String; 0]);
        fs::write(a.join("data/solo en A.bin"), b"only in A").expect("unique document");
        [a, b]
    }
}
fn names(directory: &Path) -> Vec<String> {
    let mut names: Vec<_> = fs::read_dir(directory)
        .expect("directory")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .into_string()
                .expect("name")
        })
        .collect();
    names.sort();
    names
}
/// The ways a note may name a path: the notes of Confirm, Uninstall and the
/// adoption name it from the root of its installation (`<raíz>`).
fn shown(path: &Path) -> [String; 2] {
    let path = disk::path(path).expect("path");
    let text = path.display().to_string();
    let root = path
        .ancestors()
        .find(|ancestor| ancestor.join(".vantare-native").is_file());
    let relative = root.map_or_else(|| text.clone(), |root| disk::relative(root, &text));
    [text, relative]
}
fn noted(notes: &[String], path: &Path, reason: &str) -> bool {
    notes.iter().any(|note| {
        shown(path).iter().any(|path| note.contains(path.as_str())) && note.contains(reason)
    })
}

#[test]
fn confirm_retires_the_binaries_of_the_generation_without_reference_and_keeps_its_data() {
    let fixture = Fixture::new();
    let [a, b] = fixture.two_generations();
    let (whole_a, data_a) = (index(&a), index(&a.join("data")));
    let c = fixture.upgrade("1.0.2", Mode::Auto);
    assert_eq!(index(&a), whole_a, "applying an update retires nothing");
    let whole_b = index(&b);
    let notes = fixture.confirm();
    assert_eq!(names(&a), ["data"]);
    assert_eq!(index(&a.join("data")), data_a);
    assert_eq!(index(&b), whole_b, "previous keeps the way back");
    let view = verified(&fixture.root).unwrap();
    assert_eq!(fixture.active(), c);
    assert!(view.usable_previous().is_some());
    assert!(noted(&notes, &a, "retirados") && notes.len() == 1);
    // Repairing a healthy C keeps it as `previous`: B is the next one retired,
    // and nothing is said again about A, which only holds data.
    let whole_c = index(&c);
    let repaired = fixture.upgrade("1.0.2", Mode::Repair);
    assert_eq!(index(&b), whole_b);
    let notes = fixture.confirm();
    assert_eq!([names(&a), names(&b)], [["data"], ["data"]]);
    assert_eq!(index(&a.join("data")), data_a);
    assert_eq!(index(&c), whole_c);
    assert_eq!(fixture.active(), repaired);
    assert!(noted(&notes, &b, "retirados") && notes.len() == 1);
}

#[test]
fn confirm_after_repair_retires_the_damaged_generation_except_what_no_longer_matches() {
    let fixture = Fixture::new();
    let damaged = fixture.upgrade("1.0.0", Mode::Auto);
    fixture.write_documents();
    fs::write(damaged.join(ASAR), b"tampered").unwrap();
    fs::remove_file(damaged.join("hub-ui/locales/es.pak")).unwrap();
    let (whole, data) = (index(&damaged), index(&damaged.join("data")));
    let repaired = fixture.upgrade("1.0.0", Mode::Repair);
    assert_eq!(index(&damaged), whole, "repairing retires nothing");
    let notes = fixture.confirm();
    assert_eq!(names(&damaged), ["data", "hub-ui", "manifest.json"]);
    assert_eq!(
        index(&damaged.join("hub-ui"))
            .into_keys()
            .collect::<Vec<_>>(),
        [
            PathBuf::from("resources"),
            PathBuf::from("resources/app.asar")
        ]
    );
    assert_eq!(fs::read(damaged.join(ASAR)).unwrap(), b"tampered");
    assert!(noted(&notes, &damaged.join(ASAR), "SHA-256"));
    assert_eq!(index(&damaged.join("data")), data);
    assert_eq!(fixture.active(), repaired);
    let view = verified(&fixture.root).unwrap();
    assert!(view.state.unwrap().previous.is_none());
}

#[test]
fn a_failed_generation_survives_the_rollback_and_is_retired_at_the_next_confirm() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    fixture.write_documents();
    let a = fixture.active();
    let b = fixture.upgrade("1.0.1", Mode::Auto);
    // B wrote its own documents before failing to confirm its boot.
    fs::write(b.join("data/hub/hub-settings.json"), b"{\"by\":\"B\"}").unwrap();
    let (whole_b, data_b) = (index(&b), index(&b.join("data")));
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.active(), a);
    assert_eq!(index(&b), whole_b, "the rollback retires nothing");
    let c = fixture.upgrade("1.0.2", Mode::Auto);
    assert_eq!(index(&b), whole_b, "nor does the next update");
    let whole_a = index(&a);
    let notes = fixture.confirm();
    assert_eq!(names(&b), ["data"]);
    assert_eq!(index(&b.join("data")), data_b, "what B wrote is kept");
    assert_eq!(index(&a), whole_a);
    assert_eq!(fixture.active(), c);
    assert!(verified(&fixture.root).is_ok() && noted(&notes, &b, "retirados"));
}

#[test]
fn a_rejected_confirmation_a_rollback_or_an_unreadable_reference_retire_nothing() {
    let fixture = Fixture::new();
    let [a, b] = fixture.two_generations();
    let c = fixture.upgrade("1.0.2", Mode::Auto);
    let whole = [&a, &b, &c].map(|generation| index(generation));
    let unchanged = |step: &str| {
        assert_eq!(
            [&a, &b, &c].map(|generation| index(generation)),
            whole,
            "{step}"
        );
    };
    let marker = fixture.root.join("boot-pending.json");
    let pending = fs::read(&marker).unwrap();
    let mut foreign = disk::read_json(&marker, None).unwrap();
    foreign["version"] = "9.9.9".into();
    fs::write(&marker, foreign.to_string()).unwrap();
    let mut notes = Vec::new();
    let mut note = |text: &str| notes.push(text.to_owned());
    assert!(operations::confirm_reporting(&fixture.root, &mut note).is_err());
    unchanged("rejected confirmation");
    assert_eq!(notes, [] as [String; 0]);
    // C never confirms: going back to B leaves A, already without a reference, alone.
    fs::write(&marker, pending).unwrap();
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    unchanged("rollback");
    // `previous` can no longer be decoded: nobody knows which folder it meant.
    fixture.upgrade("1.0.3", Mode::Auto);
    let path = fixture.root.join("state.json");
    let mut state = disk::read_json(&path, None).unwrap();
    state["previous"]["manifest_sha256"] = json!(5);
    fs::write(&path, state.to_string()).unwrap();
    let notes = fixture.confirm();
    unchanged("unreadable previous reference");
    assert!(noted(
        &notes,
        &fixture.root.join("generations"),
        "state.json"
    ));
    assert!(!marker.exists());
}

#[test]
fn foreign_folders_inside_generations_are_left_alone_and_logged() {
    let fixture = Fixture::new();
    let [a, _] = fixture.two_generations();
    let generations = fixture.root.join("generations");
    let foreign = [
        ("copia de seguridad", "nombre"),
        ("ABCDEFABCDEFABCDEFABCDEFABCDEFAB", "nombre"),
        ("ffffffffffffffffffffffffffffffff", "manifiesto"),
    ]
    .map(|(name, reason)| (generations.join(name), reason));
    // Two are whole copies of A, manifest included, under a name that is not
    // a generation's; the third has the right name and no manifest.
    for (folder, _) in &foreign[..2] {
        disk::copy_data(&a, folder).unwrap();
    }
    let unknown = &foreign[2].0;
    fs::create_dir_all(unknown.join("bin")).unwrap();
    fs::create_dir_all(unknown.join("data")).unwrap();
    fs::write(unknown.join("bin/tool.exe"), inert_pe()).unwrap();
    fs::write(unknown.join("data/user.bin"), b"user bytes").unwrap();
    fs::write(generations.join("nota.txt"), b"loose file").unwrap();
    let before: Vec<_> = foreign.iter().map(|(folder, _)| index(folder)).collect();
    fixture.upgrade("1.0.2", Mode::Auto);
    let notes = fixture.confirm();
    for ((folder, reason), before) in foreign.iter().zip(before) {
        assert_eq!(index(folder), before, "{}", folder.display());
        assert!(noted(&notes, folder, reason), "{reason}: {notes:?}");
    }
    assert_eq!(
        fs::read(generations.join("nota.txt")).unwrap(),
        b"loose file"
    );
    assert_eq!(names(&a), ["data"], "the real orphan is still retired");
}

#[test]
fn an_orphan_without_a_trustworthy_manifest_is_kept_whole_and_logged() {
    for fault in ["corrupt", "other-channel", "missing"] {
        let fixture = Fixture::new();
        let [a, _] = fixture.two_generations();
        fixture.upgrade("1.0.2", Mode::Auto);
        let manifest = a.join("manifest.json");
        match fault {
            "corrupt" => fs::write(&manifest, b"{ not a manifest").unwrap(),
            "missing" => fs::remove_file(&manifest).unwrap(),
            _ => {
                let mut other = disk::read_json(&manifest, None).unwrap();
                other["channel"] = "nightly".into();
                fs::write(&manifest, other.to_string()).unwrap();
            }
        }
        let whole = index(&a);
        let notes = fixture.confirm();
        assert_eq!(index(&a), whole, "{fault}");
        assert!(noted(&notes, &a, "manifiesto"), "{fault}: {notes:?}");
    }
}

#[test]
fn altered_and_unlisted_files_of_an_orphan_are_kept_and_logged() {
    let fixture = Fixture::new();
    let [a, _] = fixture.two_generations();
    fixture.upgrade("1.0.2", Mode::Auto);
    let data = index(&a.join("data"));
    // Same size as the declared member: the size alone proves nothing.
    let kept = [
        ("hub-ui/version", b"FIXTURE".as_slice(), "SHA-256"),
        (ASAR, b"edited by someone", "SHA-256"),
        (
            "hub-ui/debug.log",
            b"unlisted",
            "no figura en el manifiesto",
        ),
    ];
    for (name, bytes, _) in kept {
        fs::write(a.join(name), bytes).unwrap();
    }
    let notes = fixture.confirm();
    for (name, bytes, reason) in kept {
        assert_eq!(fs::read(a.join(name)).unwrap(), bytes, "{name}");
        assert!(noted(&notes, &a.join(name), reason), "{name}: {notes:?}");
    }
    assert_eq!(names(&a), ["data", "hub-ui", "manifest.json"]);
    assert_eq!(index(&a.join("hub-ui")).len(), 4, "three files, one folder");
    assert_eq!(index(&a.join("data")), data);
}

/// One member of the orphan cannot be retired now. The sweep keeps and logs
/// it without failing the confirmation, and the next sweep finishes the job.
fn orphan_fault(fault: &str) {
    let fixture = Fixture::new();
    let [a, _] = fixture.two_generations();
    fixture.upgrade("1.0.2", Mode::Auto);
    let (whole, data) = (index(&a), index(&a.join("data")));
    let member = a.join(if fault == "open-image" {
        ELECTRON
    } else {
        ASAR
    });
    let denied = (fault == "access-denied").then(|| Denied::new(&member));
    let busy = (fault != "access-denied").then(|| hold(&member));
    let notes = fixture.confirm();
    drop((denied, busy));
    assert!(noted(&notes, &member, "motivo"), "{fault}: {notes:?}");
    if fault == "open-image" {
        assert_eq!(index(&a), whole, "a live image keeps the whole generation");
    } else {
        assert_eq!(names(&a), ["data", "hub-ui", "manifest.json"], "{fault}");
        assert_eq!(fs::read(&member).expect("member"), b"fixture", "{fault}");
    }
    assert_eq!(index(&a.join("data")), data, "{fault}");
    fixture.upgrade("1.0.2", Mode::Repair);
    fixture.confirm();
    assert_eq!(names(&a), ["data"], "{fault}");
    assert_eq!(index(&a.join("data")), data, "{fault}");
}

#[test]
fn busy_member_of_an_orphan_is_kept_until_the_next_sweep() {
    orphan_fault("busy-member");
}

#[test]
fn denied_member_of_an_orphan_is_kept_until_the_next_sweep() {
    orphan_fault("access-denied");
}

#[test]
fn open_image_keeps_the_whole_orphan_until_the_next_sweep() {
    orphan_fault("open-image");
}

#[test]
fn a_sweep_cut_short_is_finished_by_the_next_one() {
    // What an interruption leaves on disk: some members already gone, or all
    // of them and their folders; the manifest is always the last to go.
    for cut in ["half", "all-but-manifest"] {
        let fixture = Fixture::new();
        let [a, _] = fixture.two_generations();
        fixture.upgrade("1.0.2", Mode::Auto);
        let data = index(&a.join("data"));
        let step = if cut == "half" { 2 } else { 1 };
        for member in electron_members().iter().step_by(step) {
            fs::remove_file(a.join(member)).unwrap();
        }
        if cut == "all-but-manifest" {
            for folder in names(&a) {
                if a.join(&folder).is_dir() && folder != "data" {
                    fs::remove_dir_all(a.join(folder)).unwrap();
                }
            }
            assert_eq!(names(&a), ["data", "manifest.json"]);
        }
        assert_eq!(fixture.confirm().len(), usize::from(cut == "half"), "{cut}");
        assert_eq!(names(&a), ["data"], "{cut}");
        assert_eq!(index(&a.join("data")), data, "{cut}");
    }
}

#[test]
fn uninstall_retires_orphan_binaries_and_never_touches_a_data_folder() {
    let fixture = Fixture::new();
    let [a, b] = fixture.two_generations();
    let c = fixture.upgrade("1.0.2", Mode::Auto);
    fs::write(a.join("bin/ajeno.dll"), b"foreign bytes").unwrap();
    let data = [&a, &b, &c].map(|generation| index(&generation.join("data")));
    let cancel = AtomicBool::new(false);
    let (mut count, mut notes) = (0, Vec::new());
    // The first attempt is interrupted while it retires the referenced members.
    let mut checkpoint = |_: &str| {
        count += 1;
        if count == 3 {
            return Err(engine::WriteError::new(1, "injected interruption"));
        }
        Ok(())
    };
    let mut warning = |note: &str| notes.push(note.to_owned());
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut checkpoint,
        warning: &mut warning,
    };
    assert!(operations::uninstall(&fixture.root, "beta", &mut control, |_| Ok(())).is_err());
    operations::uninstall(&fixture.root, "beta", &mut control, |_| Ok(())).expect("resumed");
    assert!(!fixture.root.join("state.json").exists());
    assert_eq!(names(&a), ["bin", "data", "manifest.json"]);
    assert_eq!(names(&a.join("bin")), ["ajeno.dll"]);
    assert_eq!(fs::read(a.join("bin/ajeno.dll")).unwrap(), b"foreign bytes");
    assert_eq!([names(&b), names(&c)], [["data"], ["data"]]);
    assert_eq!(
        [&a, &b, &c].map(|generation| index(&generation.join("data"))),
        data
    );
    assert!(noted(
        &notes,
        &a.join("bin/ajeno.dll"),
        "no figura en el manifiesto"
    ));
    assert!(noted(&notes, &a, "retirados"));
}

// Installation log (#2752, point 1). The launcher has no console, so the notes
// of the engine are also written inside the installation: capped, with paths
// relative to the root, and never able to fail Confirm or Uninstall.
const LOG: &str = "installer-log.txt";
const OLD_LOG: &str = "installer-log.old.txt";
/// The notes of the log, once each line proves its `YYYY-MM-DD hh:mm:ssZ` stamp.
fn logged(root: &Path) -> Vec<String> {
    let text = fs::read_to_string(root.join(LOG)).expect("installation log");
    let note = |line: &str| {
        let (stamp, note) = line.split_at(21);
        let shape = stamp.replace(|digit: char| digit.is_ascii_digit(), "0");
        assert_eq!(shape, "0000-00-00 00:00:00Z ", "{line}");
        note.to_owned()
    };
    text.lines().map(note).collect()
}

#[test]
fn confirm_and_uninstall_write_their_notes_to_the_installation_log() {
    let fixture = Fixture::new();
    let [a, _] = fixture.two_generations();
    assert!(!fixture.root.join(LOG).exists(), "nothing to say, no log");
    fixture.upgrade("1.0.2", Mode::Auto);
    fs::write(a.join("hub-ui/debug.log"), b"unlisted").unwrap();
    // The entry point of the launcher: nobody receives the notes.
    operations::confirm(&fixture.root).expect("confirmed boot");
    let notes = logged(&fixture.root);
    assert_eq!(notes.len(), 2, "{notes:?}");
    assert!(notes[0].contains("debug.log") && notes[0].contains("no figura en el manifiesto"));
    assert!(notes[1].contains("retirados"));
    // Nothing of the machine outside the installation reaches the log.
    let outside = disk::path(&fixture.path).unwrap().display().to_string();
    for note in &notes {
        assert!(
            note.contains("<raíz>") && !note.contains(&outside),
            "{note}"
        );
    }
    // Uninstall keeps writing to the same log, which stays with the user data.
    let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
    operations::uninstall(
        &fixture.root,
        "beta",
        &mut sink.control(&cancel),
        |_| Ok(()),
    )
    .unwrap();
    let notes = logged(&fixture.root);
    assert_eq!(notes.len(), 3, "{notes:?}");
    assert!(notes[2].contains("debug.log"));
    assert!(!fixture.root.join("state.json").exists());
    fixture
        .install(&fixture.electron("1.0.2"), Mode::Auto, false, false)
        .expect("a new installation accepts the log it finds");
    assert_eq!(logged(&fixture.root).len(), 3);
}

#[test]
fn a_log_that_cannot_be_written_never_fails_confirm_or_uninstall() {
    let fixture = Fixture::new();
    let [a, b] = fixture.two_generations();
    fixture.upgrade("1.0.2", Mode::Auto);
    let log = fixture.root.join(LOG);
    fs::create_dir(&log).unwrap();
    let notes = fixture.confirm();
    assert!(noted(&notes, &a, "retirados"), "{notes:?}");
    assert_eq!(names(&a), ["data"]);
    fixture.upgrade("1.0.3", Mode::Auto);
    let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
    operations::uninstall(
        &fixture.root,
        "beta",
        &mut sink.control(&cancel),
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(names(&b), ["data"]);
    assert!(log.is_dir() && children(&log) == 0);
}

#[test]
fn the_installation_log_is_capped_at_two_files_and_keeps_one_note_per_line() {
    let fixture = Fixture::new();
    let root = disk::path(&fixture.root).unwrap();
    fs::create_dir_all(&root).unwrap();
    let (log, old) = (root.join(LOG), root.join(OLD_LOG));
    disk::log(
        &root,
        &format!("uno\r\ndos\ttres {}", root.join("a b").display()),
    );
    assert_eq!(logged(&root), [r"uno  dos tres <raíz>\a b"]);
    // A full log becomes the old one, replacing the previous old one.
    let limit = usize::try_from(disk::LOG_LIMIT).unwrap();
    for fill in *b"xy" {
        fs::write(&log, vec![fill; limit]).unwrap();
        disk::log(&root, "nota nueva");
        assert_eq!(fs::read(&old).unwrap(), vec![fill; limit]);
        assert_eq!(logged(&root), ["nota nueva"]);
    }
    // A note is never longer than a line that fits many times in the log.
    disk::log(&root, &"ñ".repeat(limit));
    let notes = logged(&root);
    assert!(notes[1].len() < limit / 16 && notes[1].starts_with('ñ'));
    // Whatever blocks the log or its rotation is left alone: nothing is written.
    let held = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(&log)
        .unwrap();
    disk::log(&root, "ocupado");
    drop(held);
    assert_eq!(logged(&root).len(), 2);
    fs::remove_file(&old).unwrap();
    fs::create_dir(&old).unwrap();
    fs::write(old.join("ajeno"), b"foreign").unwrap();
    fs::write(&log, vec![b'z'; limit]).unwrap();
    disk::log(&root, "sin rotar no se crece");
    assert_eq!(fs::read(&log).unwrap(), vec![b'z'; limit]);
    assert_eq!(fs::read(old.join("ajeno")).unwrap(), b"foreign");
    // Nor is a link in its place ever followed.
    fs::remove_file(&log).unwrap();
    let target = fixture.path.join("outside.txt");
    fs::write(&target, b"outside").unwrap();
    std::os::windows::fs::symlink_file(&target, &log).unwrap();
    disk::log(&root, "enlace");
    assert_eq!(fs::read(&target).unwrap(), b"outside");
    fs::remove_file(&log).unwrap();
}

// Adopting recordings (ADR 0111 §4; T1 of §12). The operation is not wired to
// the session, Confirm or Uninstall yet: these tests call the engine directly.
use operations::{Adoption, Duplicates};
const STATUS: &str = "recording-status.json";
fn recordings(generation: &Path) -> PathBuf {
    generation.join("data/hub/recordings")
}
/// Files with the names the recorder, or anybody else, left in a folder.
fn record(directory: &Path, files: &[(&str, &[u8])]) {
    fs::create_dir_all(directory).expect("recordings folder");
    for (name, bytes) in files {
        fs::write(directory.join(name), bytes).expect("recording");
    }
}
/// Another handle on the file, with the sharing a scanner or a writer asks for.
fn opened(path: &Path, write: bool, share: u32) -> fs::File {
    fs::OpenOptions::new()
        .read(true)
        .write(write)
        .share_mode(share)
        .open(path)
        .expect("held file")
}
/// The note that keeps exactly this path, with its reason.
fn keeps(notes: &[String], path: &Path, reason: &str) -> bool {
    shown(path).iter().any(|path| {
        let start = format!("se conserva {path}; motivo: ");
        notes
            .iter()
            .any(|note| note.contains(&start) && note.contains(reason))
    })
}
/// The single note of the session for all it keeps of a folder for one reason.
fn summarized(notes: &[String], source: &Path, names: &[&str], reason: &str) -> bool {
    shown(source).iter().any(|source| {
        let start = format!(
            "Grabaciones de {source}: se conservan {} ({}",
            names.len(),
            names[..names.len().min(5)].join(", ")
        );
        notes
            .iter()
            .any(|note| note.starts_with(&start) && note.contains(reason))
    })
}
fn adopted(moved: usize, duplicates: usize, kept: usize) -> Adoption {
    Adoption {
        moved,
        duplicates,
        kept,
    }
}
impl Fixture {
    /// One installation whose only generation is the active one.
    fn installed(&self) -> (PathBuf, PathBuf, PathBuf) {
        self.install(&self.package("1.0.0"), Mode::Auto, false, false)
            .expect("installation");
        let active = self.active();
        (recordings(&active), self.root.join("recordings"), active)
    }
    fn adopt(&self, generation: &Path, duplicates: Duplicates) -> (Adoption, Vec<String>) {
        let (result, notes) = self.adopt_until(generation, duplicates, &mut |_| Ok(()));
        (result.expect("adoption"), notes)
    }
    fn adopt_until(
        &self,
        generation: &Path,
        duplicates: Duplicates,
        checkpoint: &mut dyn FnMut(&str) -> disk::Result<()>,
    ) -> (disk::Result<Adoption>, Vec<String>) {
        let mut notes = Vec::new();
        let id = generation.file_name().expect("generation");
        let result = operations::adopt_recordings(
            &self.root,
            &id.to_string_lossy(),
            duplicates,
            checkpoint,
            &mut |note| notes.push(note.to_owned()),
        );
        (result, notes)
    }
    /// The whole installation except the two folders an adoption may touch
    /// and the log where it writes its notes.
    fn elsewhere(&self, source: &Path) -> Index {
        let root = disk::path(&self.root).expect("root");
        let own = [
            disk::path(source).expect("source"),
            root.join("recordings"),
            root.join(LOG),
        ];
        let mut rest = index(&root);
        rest.retain(|path, _| !own.iter().any(|folder| root.join(path).starts_with(folder)));
        rest
    }
}

#[test]
fn adoption_moves_the_recordings_of_an_orphan_keeps_their_dates_and_can_be_repeated() {
    use std::os::windows::fs::FileTimesExt;
    let fixture = Fixture::new();
    let [a, _] = fixture.two_generations();
    fixture.upgrade("1.0.2", Mode::Auto);
    fixture.confirm();
    assert_eq!(names(&a), ["data"], "an orphan already without binaries");
    let (source, single) = (recordings(&a), fixture.root.join("recordings"));
    let files: [(&str, &[u8]); 2] = [
        ("series-1700000000000-4242.duckdb", b"first recording"),
        ("series-1700000360000-77.duckdb", b"second\0recording\xff"),
    ];
    record(&source, &files);
    record(&source, &[(STATUS, b"{}")]);
    let old = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000);
    for (name, _) in files {
        let times = fs::FileTimes::new().set_modified(old).set_created(old);
        opened(&source.join(name), true, 0)
            .set_times(times)
            .unwrap();
    }
    let elsewhere = fixture.elsewhere(&source);
    assert!(!single.exists());
    let (adoption, notes) = fixture.adopt(&a, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(2, 0, 0));
    assert_eq!(names(&source), [STATUS], "the state of the recorder stays");
    assert_eq!(names(&single), files.map(|(name, _)| name));
    for (name, bytes) in files {
        let moved = fs::metadata(single.join(name)).unwrap();
        assert_eq!(fs::read(single.join(name)).unwrap(), bytes, "{name}");
        assert_eq!(moved.modified().unwrap(), old, "the pruning order");
        assert_eq!(moved.created().unwrap(), old, "the date shown before #2749");
    }
    assert_eq!(fixture.elsewhere(&source), elsewhere);
    assert!(noted(&notes, &source, "adoptadas 2") && notes.len() == 1);
    let log = logged(&fixture.root);
    assert!(log.last().unwrap().contains("adoptadas 2"), "{log:?}");
    // Twice in a row: nothing left to do and nothing to say.
    let whole = index(&fixture.root);
    assert_eq!(
        fixture.adopt(&a, Duplicates::RemoveIdentical),
        (Adoption::default(), Vec::new())
    );
    assert_eq!(index(&fixture.root), whole);
}

#[test]
fn a_repeated_name_loses_its_copy_only_when_size_and_hash_are_identical() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let copies: [(&str, &[u8], &[u8]); 3] = [
        ("series-1-1.duckdb", b"same bytes", b"same bytes"),
        ("series-2-2.duckdb", b"same size A", b"same size B"),
        ("series-3-3.duckdb", b"short", b"longer than its copy"),
    ];
    for (name, copy, twin) in copies {
        record(&source, &[(name, copy)]);
        record(&single, &[(name, twin)]);
    }
    let (before, twins) = (index(&source), index(&single));
    let elsewhere = fixture.elsewhere(&source);
    // The session only moves: it neither compares nor removes.
    let (adoption, notes) = fixture.adopt(&active, Duplicates::Keep);
    assert_eq!(adoption, adopted(0, 0, 3));
    assert_eq!(
        [index(&source), index(&single)],
        [&before, &twins].map(Clone::clone)
    );
    let repeated = copies.map(|(name, ..)| name);
    assert!(
        summarized(&notes, &source, &repeated, "ya existe") && notes.len() == 1,
        "{notes:?}"
    );
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(0, 1, 2));
    assert_eq!(index(&single), twins, "never overwritten");
    assert_eq!(names(&source), ["series-2-2.duckdb", "series-3-3.duckdb"]);
    for (name, copy, _) in &copies[1..] {
        assert_eq!(fs::read(source.join(name)).unwrap(), *copy, "{name}");
        assert!(keeps(&notes, &source.join(name), "distinto"), "{notes:?}");
    }
    assert!(noted(&notes, &source, "retiradas 1") && notes.len() == 3);
    assert_eq!(fixture.elsewhere(&source), elsewhere);
}

#[test]
fn recordings_in_use_stay_where_they_are_until_released() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let files = [
        "series-1-1.duckdb",
        "series-2-2.duckdb",
        "series-3-3.duckdb",
        "series-4-4.duckdb",
    ];
    for name in files {
        record(&source, &[(name, name.as_bytes())]);
    }
    for name in &files[2..] {
        record(&single, &[(name, name.as_bytes())]);
    }
    let (before, twins) = (index(&source), index(&single));
    // Held exclusively; by a reader that would even let it be renamed; a copy
    // being read; and a recording of the single folder that is being written.
    let held = [
        opened(&source.join(files[0]), false, 0),
        opened(&source.join(files[1]), false, 7),
        opened(&source.join(files[2]), false, 7),
        opened(&single.join(files[3]), true, 7),
    ];
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    drop(held);
    assert_eq!(adoption, adopted(0, 0, 4));
    assert_eq!([index(&source), index(&single)], [before, twins]);
    for name in files {
        assert!(keeps(&notes, &source.join(name), "en uso"), "{notes:?}");
    }
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(2, 2, 0));
    assert!(names(&source).is_empty() && names(&single) == files && notes.len() == 1);
}

#[test]
fn recordings_without_read_permission_stay_until_they_can_be_read() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let files = [
        "series-1-1.duckdb",
        "series-2-2.duckdb",
        "series-3-3.duckdb",
    ];
    for name in files {
        record(&source, &[(name, name.as_bytes())]);
    }
    for name in &files[1..] {
        record(&single, &[(name, name.as_bytes())]);
    }
    let (before, twins) = (index(&source), index(&single));
    // A new recording, a copy, and the recording a copy would be compared with.
    let denied = [
        Denied::new(&source.join(files[0])),
        Denied::new(&source.join(files[1])),
        Denied::new(&single.join(files[2])),
    ];
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    drop(denied);
    assert_eq!(adoption, adopted(0, 0, 3));
    assert_eq!([index(&source), index(&single)], [before, twins]);
    for name in files {
        let unreadable = keeps(&notes, &source.join(name), "no se puede leer");
        assert!(unreadable, "{notes:?}");
    }
    let (adoption, _) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(1, 2, 0));
    assert!(names(&source).is_empty() && names(&single) == files);
}

#[test]
fn unfinished_recordings_and_foreign_names_are_never_adopted() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let finished = "series-11-11.duckdb";
    let kept: [(&str, &str); 11] = [
        ("series-1-1.duckdb", "en curso"),
        ("series-1-1.duckdb.wal", "nombre"),
        ("series-2-2.duckdb.wal", "nombre"),
        ("series-3-3.duckdb", "en curso"),
        ("series-4-4.duckdb", "carpeta única"),
        ("series-5.duckdb", "nombre"),
        ("series-a-6.duckdb", "nombre"),
        ("series-7-7.duckdb.bak", "nombre"),
        ("Series-8-8.duckdb", "nombre"),
        ("copia de series-9-9.duckdb", "nombre"),
        ("notas.txt", "nombre"),
    ];
    for (name, _) in kept {
        record(&source, &[(name, name.as_bytes())]);
    }
    record(&source, &[(finished, b"finished"), (STATUS, b"{}")]);
    // The temporary of a publication that was cut, and a folder named as a recording.
    let folders = ["series-3-3.duckdb.creating-99-0", "series-12-12.duckdb"];
    for folder in folders {
        record(&source.join(folder), &[("recording.duckdb", b"inside")]);
    }
    record(
        &single,
        &[
            ("series-4-4.duckdb.wal", b"wal of somebody else"),
            ("series-99-99.duckdb", b"already here"),
            ("mis notas.txt", b"foreign"),
        ],
    );
    record(&single.join("carpeta"), &[("dentro.bin", b"foreign")]);
    let (mut before, mut twins) = (index(&source), index(&single));
    let elsewhere = fixture.elsewhere(&source);
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(1, 0, 13));
    let moved = before.remove(Path::new(finished)).expect("finished");
    twins.insert(finished.into(), moved);
    assert_eq!([index(&source), index(&single)], [before, twins]);
    for (name, reason) in kept {
        assert!(
            keeps(&notes, &source.join(name), reason),
            "{name}: {notes:?}"
        );
    }
    for folder in folders {
        assert!(keeps(&notes, &source.join(folder), "archivo"), "{notes:?}");
    }
    assert!(notes.len() == 14 && !notes.iter().any(|note| note.contains(STATUS)));
    assert_eq!(fixture.elsewhere(&source), elsewhere);
}

#[test]
fn links_in_the_source_or_in_the_single_folder_are_never_followed() {
    use std::os::windows::fs::{symlink_dir, symlink_file};
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let name = "series-1-1.duckdb";
    let outside = fixture.path.join("fuera");
    // Same bytes inside and outside: a followed link would pass any comparison.
    record(&outside, &[(name, b"recording")]);
    let before = index(&outside);
    for place in ["source", "single", "entry", "twin"] {
        let link = match place {
            "source" => source.clone(),
            "single" => single.clone(),
            "entry" => source.join("series-2-2.duckdb"),
            _ => single.join(name),
        };
        if place == "source" {
            fs::create_dir_all(source.parent().unwrap()).unwrap();
        } else {
            record(&source, &[(name, b"recording")]);
        }
        if place == "twin" {
            record(&single, &[]);
        }
        let folder = matches!(place, "source" | "single");
        if folder {
            symlink_dir(&outside, &link).unwrap();
        } else {
            symlink_file(outside.join(name), &link).unwrap();
            assert!(disk::open_recording(&link, false).is_err(), "{place}");
            assert!(disk::open_recording(&link, true).is_err(), "{place}");
        }
        let (result, notes) =
            fixture.adopt_until(&active, Duplicates::RemoveIdentical, &mut |_| Ok(()));
        if place == "twin" {
            // Nothing inside the single folder stops the engine: the link is
            // not read and the copy that bears its name stays where it is.
            assert_eq!(result.expect("adoption"), adopted(0, 0, 1), "{notes:?}");
            assert!(keeps(&notes, &source.join(name), "no se puede leer"));
        } else {
            assert!(result.is_err() && notes.is_empty(), "{place}: {notes:?}");
        }
        assert_eq!(index(&outside), before, "{place}");
        if folder {
            fs::remove_dir(&link).unwrap();
        } else {
            fs::remove_file(&link).unwrap();
            assert_eq!(fs::read(source.join(name)).unwrap(), b"recording");
        }
        assert!(!single.exists() || children(&single) == 0, "{place}");
    }
    assert!(disk::open_recording(&source, false).is_err(), "a folder");
    assert!(disk::open_recording(&source.join(name), true).is_ok());
}

#[test]
fn adoption_refuses_the_previous_generation_a_foreign_folder_and_a_doubtful_state() {
    let fixture = Fixture::new();
    let [a, b] = fixture.two_generations();
    let foreign = fixture.root.join("generations/copia de seguridad");
    for generation in [&a, &b, &foreign] {
        record(
            &recordings(generation),
            &[("series-1-1.duckdb", b"recorded")],
        );
    }
    let generations = fixture.root.join("generations");
    let whole = index(&generations);
    let refused = |id: &str, step: &str| {
        let result = operations::adopt_recordings(
            &fixture.root,
            id,
            Duplicates::RemoveIdentical,
            &mut |_| Ok(()),
            &mut |note| panic!("{step}: {note}"),
        );
        assert!(result.is_err(), "{step}");
        assert_eq!(index(&generations), whole, "{step}");
        assert!(!fixture.root.join("recordings").exists(), "{step}");
    };
    let id = |generation: &Path| {
        generation
            .file_name()
            .unwrap()
            .to_string_lossy()
            .into_owned()
    };
    // `previous` is the copy a failed version goes back to.
    refused(&id(&a), "previous");
    refused(&id(&a).to_uppercase(), "previous in capitals");
    for name in [
        "copia de seguridad".to_owned(),
        String::new(),
        "..".to_owned(),
        format!("../generations/{}", id(&b)),
        format!("{}/data", id(&b)),
        disk::path(&b).unwrap().display().to_string(),
    ] {
        refused(&name, &name);
    }
    // Nobody knows which generation is the previous one.
    let path = fixture.root.join("state.json");
    let state = disk::read_json(&path, None).unwrap();
    let mut doubtful = [state.clone(), state.clone(), state.clone()];
    doubtful[0].as_object_mut().unwrap().remove("previous");
    doubtful[1]["previous"]["manifest_sha256"] = json!(5);
    doubtful[2]["product"] = "otro-producto".into();
    let steps = [
        "without previous",
        "undecodable previous",
        "foreign product",
    ];
    for (document, step) in doubtful.iter().zip(steps) {
        fs::write(&path, document.to_string()).unwrap();
        refused(&id(&b), step);
    }
    fs::write(&path, b"{ not a state").unwrap();
    refused(&id(&b), "unreadable state");
    fs::remove_file(&path).unwrap();
    refused(&id(&b), "no state");
    // With its state back, the active generation is adopted and `previous` is not.
    fs::write(&path, state.to_string()).unwrap();
    let (adoption, _) = fixture.adopt(&b, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(1, 0, 0));
    assert_eq!(names(&recordings(&a)), ["series-1-1.duckdb"]);
    assert_eq!(names(&recordings(&foreign)), ["series-1-1.duckdb"]);
}

#[test]
fn an_empty_or_missing_source_changes_nothing_and_a_file_as_single_folder_stops_it() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let whole = index(&fixture.root);
    let nothing = (Adoption::default(), Vec::new());
    assert_eq!(fixture.adopt(&active, Duplicates::RemoveIdentical), nothing);
    let unknown = fixture.root.join("generations").join("f".repeat(32));
    assert_eq!(
        fixture.adopt(&unknown, Duplicates::RemoveIdentical),
        nothing
    );
    assert_eq!(index(&fixture.root), whole, "a missing source");
    for files in [&[][..], &[(STATUS, b"{}".as_slice())][..]] {
        record(&source, files);
        assert_eq!(fixture.adopt(&active, Duplicates::RemoveIdentical), nothing);
        assert!(
            !single.exists(),
            "the single folder is only made to receive"
        );
    }
    record(&source, &[("series-1-1.duckdb", b"recording")]);
    fs::write(&single, b"not a folder").unwrap();
    let (result, notes) =
        fixture.adopt_until(&active, Duplicates::RemoveIdentical, &mut |_| Ok(()));
    assert!(result.is_err() && notes.is_empty());
    assert_eq!(names(&source), [STATUS, "series-1-1.duckdb"]);
    assert_eq!(fs::read(&single).unwrap(), b"not a folder");
}

#[test]
fn more_than_256_recordings_are_adopted_without_losing_any() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    for number in 0..300_u64 {
        let name = format!("series-{}-{number}.duckdb", 1_700_000_000_000 + number);
        record(&source, &[(&name, name.as_bytes())]);
    }
    let before = index(&source);
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(300, 0, 0));
    assert_eq!(index(&single), before);
    assert!(names(&source).is_empty() && notes.len() == 1);
}

#[test]
fn an_adoption_cut_short_loses_nothing_and_the_next_one_finishes() {
    // A cut, or a full disk (injected: a volume really full is not reproduced),
    // before the third move or before the third removal of a repeated copy.
    for (fault, point) in [
        ("cut", "adopt-move"),
        ("disk-full", "adopt-move"),
        ("cut", "adopt-remove"),
    ] {
        let fixture = Fixture::new();
        let (source, single, active) = fixture.installed();
        for number in 0..6 {
            let name = format!("series-1-{number}.duckdb");
            record(&source, &[(&name, name.as_bytes())]);
        }
        for number in 0..4 {
            let name = format!("series-2-{number}.duckdb");
            record(&source, &[(&name, name.as_bytes())]);
            record(&single, &[(&name, name.as_bytes())]);
        }
        let every = index(&source);
        let mut reached = 0;
        let mut checkpoint = |at: &str| {
            reached += usize::from(at == point);
            if at == point && reached == 3 {
                return Err(if fault == "cut" {
                    engine::WriteError::new(1, "injected cut")
                } else {
                    engine::WriteError::from(std::io::Error::from_raw_os_error(112))
                });
            }
            Ok(())
        };
        let (result, _) =
            fixture.adopt_until(&active, Duplicates::RemoveIdentical, &mut checkpoint);
        assert!(result.is_err(), "{fault} at {point}");
        // Whole in the source or whole in the single folder; a new one, never in both.
        let (left, arrived) = (index(&source), index(&single));
        for (name, recording) in &every {
            let places = [&left, &arrived].map(|folder| folder.get(name));
            assert!(places.iter().flatten().all(|found| *found == recording));
            let expected = if name.to_string_lossy().starts_with("series-1-") {
                1
            } else {
                1 + usize::from(left.contains_key(name))
            };
            assert_eq!(places.iter().flatten().count(), expected, "{name:?}");
        }
        assert!(
            !left.is_empty(),
            "{fault} at {point}: the cut left work to do"
        );
        let (adoption, _) = fixture.adopt(&active, Duplicates::RemoveIdentical);
        assert_eq!(adoption.moved + adoption.duplicates, left.len());
        assert_eq!(index(&single), every, "{fault} at {point}");
        assert!(names(&source).is_empty(), "{fault} at {point}");
    }
}

// The gap between checking a recording and moving it (P1-1 of the data review
// of T1, #2746). DuckDB opens its files letting others rename or delete them.
fn written(path: &Path) -> std::io::Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).share_mode(7).open(path)
}

#[test]
fn a_writer_cannot_slip_in_between_the_check_and_the_move() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let name = "series-1-1.duckdb";
    record(&source, &[(name, b"recording")]);
    // The writer arrives once the adoption has checked that nobody has it open.
    let mut writer = None;
    let (result, notes) = fixture.adopt_until(&active, Duplicates::RemoveIdentical, &mut |_| {
        let opening = written(&source.join(name));
        if opening.is_ok() {
            record(&source, &[("series-1-1.duckdb.wal", b"pending")]);
        }
        writer = Some(opening);
        Ok(())
    });
    let refused = writer.expect("reached the move").err();
    let sharing_violation = refused.and_then(|error| error.raw_os_error());
    assert_eq!(
        sharing_violation,
        Some(32),
        "held from the check to the move"
    );
    assert_eq!(result.expect("adoption"), adopted(1, 0, 0));
    assert!(names(&source).is_empty() && names(&single) == [name]);
    assert!(notes.len() == 1, "{notes:?}");
}

#[test]
fn what_appears_after_the_list_was_taken_keeps_the_recording_in_place() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let files = [1, 2, 3, 4, 5].map(|number| format!("series-{number}-{number}.duckdb"));
    for name in &files {
        record(&source, &[(name, name.as_bytes())]);
    }
    let before = index(&source);
    // While the first one is held: a `.wal` beside it, a writer on the second,
    // a `.wal` beside the third, one in the single folder with the name of the
    // fourth, and a recording with the name of the fifth already there.
    let mut writer = None;
    let mut appear = |_: &str| {
        if writer.is_none() {
            writer = Some(written(&source.join(&files[1])).expect("writer"));
            for name in [&files[0], &files[2]] {
                record(&source, &[(&format!("{name}.wal"), b"pending")]);
            }
            record(&single, &[(&format!("{}.wal", files[3]), b"foreign")]);
            record(&single, &[(&files[4], b"another recording")]);
        }
        Ok(())
    };
    let (result, notes) = fixture.adopt_until(&active, Duplicates::RemoveIdentical, &mut appear);
    assert_eq!(result.expect("adoption"), adopted(0, 0, 5));
    for (name, recording) in &before {
        assert_eq!(index(&source).get(name), Some(recording), "{name:?}");
    }
    assert_eq!(
        fs::read(single.join(&files[4])).unwrap(),
        b"another recording"
    );
    assert_eq!(children(&single), 2, "nothing arrived");
    let reasons = ["en curso", "en uso", "en curso", "carpeta única", "mover"];
    for (name, reason) in files.iter().zip(reasons) {
        assert!(
            keeps(&notes, &source.join(name), reason),
            "{name}: {notes:?}"
        );
    }
    // Once the writer and the leftovers are gone, the next adoption brings them.
    drop(writer);
    for name in [&files[0], &files[2]] {
        fs::remove_file(source.join(format!("{name}.wal"))).unwrap();
    }
    fs::remove_file(single.join(format!("{}.wal", files[3]))).unwrap();
    let (adoption, _) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(4, 0, 1));
    assert_eq!(names(&source), [files[4].as_str()], "a different one stays");
}

#[test]
fn the_session_tells_what_stays_once_per_reason_and_does_not_repeat_it() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let loose =
        [1, 2, 3, 4, 5, 6, 7, 8].map(|number| format!("series-{number}-{number}.duckdb.wal"));
    let loose = loose.each_ref().map(String::as_str);
    for name in loose {
        record(&source, &[(name, b"pending")]);
    }
    let repeated = "series-9-9.duckdb";
    record(&source, &[(repeated, b"copy")]);
    record(&single, &[(repeated, b"another recording")]);
    let (adoption, notes) = fixture.adopt(&active, Duplicates::Keep);
    assert_eq!(adoption, adopted(0, 0, 9));
    assert!(notes.len() == 2, "one note per reason: {notes:?}");
    assert!(summarized(&notes, &source, &loose, "nombre"), "{notes:?}");
    assert!(
        summarized(&notes, &source, &[repeated], "ya existe"),
        "{notes:?}"
    );
    assert!(
        notes[0].contains("y 3 más") && !notes[0].contains(loose[5]),
        "{notes:?}"
    );
    assert_eq!(logged(&fixture.root).len(), 2);
    // At every start the caller hears it again; the log does not grow.
    for _ in 0..3 {
        assert_eq!(fixture.adopt(&active, Duplicates::Keep).1, notes);
    }
    assert_eq!(logged(&fixture.root).len(), 2);
    // Only what changes is written.
    record(&source, &[("notas.txt", b"foreign")]);
    let (adoption, _) = fixture.adopt(&active, Duplicates::Keep);
    assert_eq!(adoption, adopted(0, 0, 10));
    let log = logged(&fixture.root);
    assert!(
        log.len() == 3 && log[2].contains("se conservan 9 ("),
        "{log:?}"
    );
    // Confirm and Uninstall keep one note per file, as many times as they run.
    for lines in [13, 23] {
        let (_, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
        assert!(notes.len() == 10 && keeps(&notes, &source.join("notas.txt"), "nombre"));
        assert_eq!(logged(&fixture.root).len(), lines);
    }
}

#[test]
fn two_adoptions_at_once_never_work_on_the_same_installation() {
    use std::sync::mpsc;
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    let files = ["series-1-1.duckdb", "series-2-2.duckdb"];
    for name in files {
        record(&source, &[(name, name.as_bytes())]);
    }
    let (reached, waiting) = mpsc::channel();
    let (resume, paused) = mpsc::channel::<()>();
    let (installation, generation) = (&fixture, &active);
    let (second, first, between) = std::thread::scope(|scope| {
        // The first one stops in the middle of its first move, holding the lock.
        let first = scope.spawn(move || {
            let mut pause = |_: &str| {
                let _ = reached.send(());
                let _ = paused.recv();
                Ok(())
            };
            installation.adopt_until(generation, Duplicates::Keep, &mut pause)
        });
        waiting.recv().expect("the first adoption reached its move");
        let second =
            installation.adopt_until(generation, Duplicates::RemoveIdentical, &mut |_| Ok(()));
        let between = (names(&source), single.exists());
        drop(resume);
        (second, first.join().expect("first adoption"), between)
    });
    // Busy, code 2: the session can tell it from a refusal and wait for its turn.
    assert_eq!(second.0.map_err(|error| error.code), Err(2));
    assert!(second.1.is_empty(), "{:?}", second.1);
    assert_eq!(between, (files.map(str::to_owned).to_vec(), false));
    assert_eq!(first.0.expect("first adoption"), adopted(2, 0, 0));
    assert!(names(&source).is_empty() && names(&single) == files);
    // Only a lock that somebody holds is busy: one that cannot be opened for any
    // other reason is a refusal, which nobody waits for.
    let lock = fixture.root.join(".operation.lock");
    fs::remove_file(&lock).unwrap();
    fs::create_dir(&lock).unwrap();
    let (unusable, _) = fixture.adopt_until(&active, Duplicates::Keep, &mut |_| Ok(()));
    assert_eq!(unusable.map_err(|error| error.code), Err(1));
}

#[test]
fn a_repeated_copy_beside_a_wal_is_never_compared_or_removed() {
    let fixture = Fixture::new();
    let (source, single, active) = fixture.installed();
    // Identical to the one in the single folder, but one of the two has
    // changes that never reached the file: nothing proves they are the same.
    let [unclosed, twin] = ["series-1-1.duckdb", "series-2-2.duckdb"];
    record(&source, &[(unclosed, b"same"), (twin, b"same")]);
    record(&source, &[("series-1-1.duckdb.wal", b"pending")]);
    record(&single, &[(unclosed, b"same"), (twin, b"same")]);
    record(&single, &[("series-2-2.duckdb.wal", b"pending")]);
    let (before, twins) = (index(&source), index(&single));
    let (adoption, notes) = fixture.adopt(&active, Duplicates::RemoveIdentical);
    assert_eq!(adoption, adopted(0, 0, 3));
    assert_eq!([index(&source), index(&single)], [before, twins]);
    assert!(
        keeps(&notes, &source.join(unclosed), "en curso"),
        "{notes:?}"
    );
    assert!(
        keeps(&notes, &source.join(twin), "carpeta única"),
        "{notes:?}"
    );
}

// `<root>\recordings` is the user's (ADR 0111, T2b, #2777): a link, a junction
// or a file in its place never stops the engine, and the engine never enters
// it, follows it or removes anything through it.
fn junction(link: &Path, target: &Path) {
    let made = Command::new(std::env::var_os("COMSPEC").expect("Windows shell"))
        .args(["/D", "/C", "mklink", "/J"])
        .args([link, target])
        .creation_flags(0x0800_0000)
        .output()
        .expect("mklink");
    assert!(made.status.success(), "{made:?}");
}
fn recordings_that_are_not_a_folder(kind: &str) {
    use std::os::windows::fs::symlink_file;
    let fixture = Fixture::new();
    let shell = fixture.shell();
    let setup = |version: &str, mode| fixture.setup(&shell, &fixture.electron(version), mode, None);
    let outside = fixture.path.join("otro disco");
    let files: [(&str, &[u8]); 2] = [("series-1-1.duckdb", b"recorded"), ("notas.txt", b"mine")];
    record(&outside, &files);
    setup("1.0.0", Mode::Auto).expect("first installation");
    let single = fixture.root.join("recordings");
    match kind {
        "junction" => junction(&single, &outside),
        "broken junction" => {
            let gone = fixture.path.join("ya no está");
            fs::create_dir(&gone).expect("fixture");
            junction(&single, &gone);
            fs::remove_dir(&gone).expect("fixture");
        }
        "file link" => symlink_file(outside.join(files[0].0), &single).expect("file link"),
        _ => fs::write(&single, b"not a folder").expect("file"),
    }
    let (behind, points) = (index(&outside), fs::read_link(&single).ok());
    let intact = |step: &str| {
        assert_eq!(index(&outside), behind, "{kind}, {step}: what is behind it");
        assert_eq!(fs::read_link(&single).ok(), points, "{kind}, {step}");
        assert!(fs::symlink_metadata(&single).is_ok(), "{kind}, {step}");
    };
    let root = disk::open_root(&fixture.root, false).expect("the installation opens");
    setup("1.0.1", Mode::Auto).expect("update");
    intact("update");
    fixture.confirm();
    intact("confirm");
    setup("1.0.1", Mode::Repair).expect("repair");
    intact("repair");
    let restored = operations::rollback(&root).expect("rollback");
    assert_eq!(restored, operations::BootRecovery::Restored);
    intact("rollback");
    setup("1.0.2", Mode::Auto).expect("another update");
    assert!(!operations::discard_stale_boot_marker(&root).expect("marker"));
    let retired = fixture.confirm();
    assert!(
        retired.iter().any(|note| note.contains("retirados")),
        "{retired:?}"
    );
    intact("generations without reference");
    engine::shell::sync_running_with_context(&root, &shell.context, None).expect("registration");
    intact("registration");
    // The adoption is the only operation that writes there: it brings nothing.
    let source = recordings(&fixture.active());
    record(
        &source,
        &[("series-9-9.duckdb", b"stays in its generation")],
    );
    let (adoption, notes) =
        fixture.adopt_until(&fixture.active(), Duplicates::Keep, &mut |_| Ok(()));
    assert!(adoption.is_err() && notes.is_empty(), "{kind}: {notes:?}");
    assert_eq!(names(&source), ["series-9-9.duckdb"], "{kind}");
    intact("adoption");
    fixture.remove(&shell).expect("uninstall");
    intact("uninstall");
    setup("1.0.3", Mode::Auto).expect("installation over the kept data");
    intact("install");
}
#[test]
fn a_junction_as_recordings_never_stops_the_engine_and_is_never_followed() {
    recordings_that_are_not_a_folder("junction");
}
#[test]
fn a_broken_junction_as_recordings_never_stops_the_engine() {
    recordings_that_are_not_a_folder("broken junction");
}
#[test]
fn a_file_link_as_recordings_never_stops_the_engine_and_is_never_followed() {
    recordings_that_are_not_a_folder("file link");
}
#[test]
fn a_file_as_recordings_never_stops_the_engine() {
    recordings_that_are_not_a_folder("file");
}

#[test]
fn only_the_entry_named_recordings_at_the_root_is_left_alone() {
    use std::os::windows::fs::{symlink_dir, symlink_file};
    let fixture = Fixture::new();
    let (_, single, active) = fixture.installed();
    let outside = fixture.path.join("fuera");
    record(&outside, &[("series-1-1.duckdb", b"recorded")]);
    let opens = || disk::open_root(&fixture.root, false).is_ok();
    // Any other name, and the same name anywhere else, is refused as before.
    for place in [
        fixture.root.join("grabaciones"),
        fixture.root.join("recordings 2"),
        fixture.root.join("generations/recordings"),
        active.join("recordings"),
        active.join("data/recordings"),
        active.join("data/hub/recordings"),
    ] {
        fs::create_dir_all(place.parent().expect("a parent")).unwrap();
        symlink_dir(&outside, &place).unwrap();
        assert!(!opens(), "{place:?}");
        fs::remove_dir(&place).unwrap();
    }
    // The name as Windows compares it; and nothing inside it is looked at.
    symlink_dir(&outside, fixture.root.join("RECORDINGS")).unwrap();
    assert!(opens(), "in capitals");
    fs::remove_dir(&single).unwrap();
    record(&single.join("carpeta"), &[]);
    symlink_dir(&outside, single.join("carpeta/enlace")).unwrap();
    symlink_file(
        outside.join("series-1-1.duckdb"),
        single.join("series-1-1.duckdb"),
    )
    .unwrap();
    assert!(opens(), "a normal folder with links inside");
}

// ---------------------------------------------------------------------------
// #2812: cada canal instalable es un producto separado. Nightly tiene registro,
// carpetas y accesos propios y nunca lee, actualiza ni borra lo de beta.

const BETA_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeBeta";
const NIGHTLY_KEY: &str =
    "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\VantareNativeNightly";
const REGISTRATION: [&str; 5] = [
    "InstallLocation",
    "DisplayName",
    "DisplayVersion",
    "DisplayIcon",
    "UninstallString",
];
const BETA_LINKS: [&str; 4] = [
    "Programs/Vantare/Vantare Simracing Suite.lnk",
    "Programs/Vantare/Desinstalar.lnk",
    "DesktopDirectory/Vantare Simracing Suite.lnk",
    "Startup/Vantare.lnk",
];
const NIGHTLY_LINKS: [&str; 4] = [
    "Programs/Vantare Nightly/Vantare Nightly.lnk",
    "Programs/Vantare Nightly/Desinstalar.lnk",
    "DesktopDirectory/Vantare Nightly.lnk",
    "Startup/Vantare Nightly.lnk",
];

fn registered(shell: &Shell, key: &str, name: &str) -> Option<String> {
    windows_registry::CURRENT_USER
        .open(format!("{}\\{key}", shell.registry))
        .and_then(|key| key.get_string(name))
        .ok()
}
fn files_below(directory: &Path, prefix: &str, into: &mut BTreeMap<String, Vec<u8>>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries {
        let entry = entry.expect("entry");
        let name = format!("{prefix}/{}", entry.file_name().to_string_lossy());
        if entry.file_type().expect("type").is_dir() {
            into.insert(format!("{name}/"), Vec::new());
            files_below(&entry.path(), &name, into);
        } else {
            into.insert(name, fs::read(entry.path()).expect("bytes"));
        }
    }
}
/// What the other product may own in the shared shell folders.
const BETA_PATHS: [&str; 4] = [
    "Programs/Vantare/",
    "Programs/Vantare Native Beta",
    "DesktopDirectory/Vantare Simracing Suite.lnk",
    "Startup/Vantare.lnk",
];
const NIGHTLY_PATHS: [&str; 3] = [
    "Programs/Vantare Nightly",
    "DesktopDirectory/Vantare Nightly.lnk",
    "Startup/Vantare Nightly.lnk",
];
const RUN: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
/// Everything in the shared simulated user except what the other product owns:
/// this product's whole root (data included), every file and folder in the
/// shell folders (foreign ones too), its registry values and the Run values,
/// byte for byte.
fn product_snapshot(
    fixture: &Fixture,
    shell: &Shell,
    key: &str,
    other: &[&str],
) -> BTreeMap<String, Vec<u8>> {
    let mut snapshot = BTreeMap::new();
    files_below(&fixture.root, "root", &mut snapshot);
    let mut folders = BTreeMap::new();
    files_below(&shell.folders, "link", &mut folders);
    snapshot.extend(folders.into_iter().filter(|(name, _)| {
        !other
            .iter()
            .any(|path| name.starts_with(&format!("link/{path}")))
    }));
    for name in REGISTRATION {
        if let Some(value) = registered(shell, key, name) {
            snapshot.insert(format!("registry/{name}"), value.into_bytes());
        }
    }
    let hive = windows_registry::CURRENT_USER.open(format!("{}\\{key}", shell.registry));
    for name in ["NoModify", "NoRepair"] {
        if let Some(value) = hive.as_ref().ok().and_then(|key| key.get_u32(name).ok()) {
            snapshot.insert(format!("registry/{name}"), value.to_le_bytes().to_vec());
        }
    }
    for name in ["VantareNative.Hub", "Ajeno"] {
        if let Some(value) = registered(shell, RUN, name) {
            snapshot.insert(format!("run/{name}"), value.into_bytes());
        }
    }
    snapshot
}
fn channel_of(fixture: &Fixture) -> String {
    verified(&fixture.root)
        .expect("verified installation")
        .state
        .expect("state")
        .channel
}
fn hive() -> String {
    format!(
        "Software\\VantareInstallerMatrix\\{}",
        disk::id().expect("hive ID")
    )
}

#[test]
fn nightly_installs_repairs_updates_and_uninstalls_with_its_own_names() {
    let fixture = Fixture::new();
    let shell = fixture.shell_with("nightly", fixture.path.join("shell"), hive());
    fixture
        .setup(
            &shell,
            &fixture.package_for("nightly", "1.0.0"),
            Mode::Auto,
            Some(true),
        )
        .unwrap();
    assert_eq!(channel_of(&fixture), "nightly");
    let root = disk::path(&fixture.root).unwrap().display().to_string();
    assert_eq!(
        registered(&shell, NIGHTLY_KEY, "InstallLocation"),
        Some(root)
    );
    assert_eq!(
        registered(&shell, NIGHTLY_KEY, "DisplayName").as_deref(),
        Some("Vantare Simracing Suite (Nightly)")
    );
    assert_eq!(registered(&shell, BETA_KEY, "InstallLocation"), None);
    for link in NIGHTLY_LINKS {
        assert!(shell.folders.join(link).is_file(), "{link}");
    }
    for link in BETA_LINKS {
        assert!(!shell.folders.join(link).exists(), "{link}");
    }
    assert!(!shell.folders.join("Programs/Vantare").exists());
    let menu = fs::read(shell.folders.join(NIGHTLY_LINKS[0])).unwrap();
    assert!(contains(&menu, &utf16("Vantare.SimracingSuite.Nightly")));

    fixture.write_data();
    fixture
        .setup(
            &shell,
            &fixture.package_for("nightly", "1.0.0"),
            Mode::Repair,
            None,
        )
        .unwrap();
    // Repair leaves a boot to check, as every Setup over an installation does.
    operations::confirm(&fixture.root).unwrap();
    assert_eq!(
        fs::read(fixture.data().join("opaque.bin")).unwrap(),
        b"opaque\0user\xffbytes"
    );
    fixture
        .setup(
            &shell,
            &fixture.package_for("nightly", "1.0.1"),
            Mode::Auto,
            None,
        )
        .unwrap();
    operations::confirm(&fixture.root).unwrap();
    assert_eq!(
        verified(&fixture.root).unwrap().installed_version(),
        Some("1.0.1")
    );
    assert_eq!(
        registered(&shell, NIGHTLY_KEY, "DisplayVersion").as_deref(),
        Some("1.0.1")
    );

    fixture.remove(&shell).unwrap();
    assert_eq!(registered(&shell, NIGHTLY_KEY, "InstallLocation"), None);
    for link in NIGHTLY_LINKS {
        assert!(!shell.folders.join(link).exists(), "{link}");
    }
    assert!(!fixture.root.join("state.json").exists());
    let retained = fixture
        .root
        .join("generations")
        .read_dir()
        .unwrap()
        .filter_map(|entry| fs::read(entry.unwrap().path().join("data/opaque.bin")).ok())
        .collect::<Vec<_>>();
    assert!(!retained.is_empty(), "user data is kept");
    assert!(
        retained
            .iter()
            .all(|bytes| bytes.as_slice() == b"opaque\0user\xffbytes")
    );
}

#[test]
fn beta_and_nightly_share_one_user_and_never_touch_each_other() {
    let (beta_fixture, nightly_fixture) = (Fixture::new(), Fixture::new());
    let folders = beta_fixture.path.join("shell");
    let registry = hive();
    let beta = beta_fixture.shell_with("beta", folders.clone(), registry.clone());
    let nightly = nightly_fixture.shell_with("nightly", folders, registry);
    let beta_state = || product_snapshot(&beta_fixture, &beta, BETA_KEY, &NIGHTLY_PATHS);
    let nightly_state = || product_snapshot(&nightly_fixture, &nightly, NIGHTLY_KEY, &BETA_PATHS);

    beta_fixture
        .setup(
            &beta,
            &beta_fixture.package("1.0.0"),
            Mode::Auto,
            Some(true),
        )
        .unwrap();
    beta_fixture.write_data();
    // Foreign files beside the links and a foreign Run value must survive too.
    for name in ["Programs/Vantare/ajeno.txt", "DesktopDirectory/ajeno.txt"] {
        fs::write(beta.folders.join(name), b"ajeno").unwrap();
    }
    windows_registry::CURRENT_USER
        .create(format!("{}\\{RUN}", beta.registry))
        .and_then(|key| key.set_string("Ajeno", "C:\\Ajeno\\ajeno.exe"))
        .unwrap();
    let before = beta_state();
    for key in [
        "registry/InstallLocation",
        "registry/NoModify",
        "registry/NoRepair",
        "run/Ajeno",
        "link/Startup/Vantare.lnk",
        "link/Programs/Vantare/ajeno.txt",
        "link/DesktopDirectory/ajeno.txt",
    ] {
        assert!(before.contains_key(key), "{key}");
    }

    let package = |version| nightly_fixture.package_for("nightly", version);
    nightly_fixture
        .setup(&nightly, &package("1.0.0"), Mode::Auto, Some(true))
        .unwrap();
    assert_eq!(beta_state(), before, "nightly install");
    nightly_fixture.write_data();
    nightly_fixture
        .setup(&nightly, &package("1.0.0"), Mode::Repair, None)
        .unwrap();
    assert_eq!(beta_state(), before, "nightly repair");
    operations::confirm(&nightly_fixture.root).unwrap();
    assert_eq!(beta_state(), before, "nightly repair confirmation");
    nightly_fixture
        .setup(&nightly, &package("1.0.1"), Mode::Auto, None)
        .unwrap();
    operations::confirm(&nightly_fixture.root).unwrap();
    assert_eq!(beta_state(), before, "nightly update");

    // Each product finds its own installation, never the other one.
    let probe = |shell: &Shell| {
        let mut request = engine::Request::new(&Args::default(), engine::Operation::Probe);
        request.qa = false; // Discovery through the registry, as the product Setup does.
        shell.context.probe(&request).unwrap().root
    };
    assert_eq!(probe(&nightly), disk::path(&nightly_fixture.root).unwrap());
    assert_eq!(probe(&beta), disk::path(&beta_fixture.root).unwrap());

    nightly_fixture.remove(&nightly).unwrap();
    assert_eq!(beta_state(), before, "nightly uninstall");
    assert_eq!(registered(&nightly, NIGHTLY_KEY, "InstallLocation"), None);

    // And the other way round: beta leaves nightly untouched.
    nightly_fixture
        .setup(&nightly, &package("1.0.1"), Mode::Auto, Some(true))
        .unwrap();
    let nightly_before = nightly_state();
    beta_fixture
        .setup(&beta, &beta_fixture.package("1.0.0"), Mode::Repair, None)
        .unwrap();
    operations::confirm(&beta_fixture.root).unwrap();
    assert_eq!(
        nightly_state(),
        nightly_before,
        "beta repair and confirmation"
    );
    beta_fixture.remove(&beta).unwrap();
    assert_eq!(nightly_state(), nightly_before, "beta repair and uninstall");
    assert_eq!(registered(&beta, BETA_KEY, "InstallLocation"), None);
}

#[test]
fn another_channel_is_rejected_before_anything_changes() {
    let fixture = Fixture::new();
    let registry = hive();
    let nightly = fixture.shell_with("nightly", fixture.path.join("shell"), registry.clone());

    // A nightly Setup whose embedded ZIP declares beta fails at authentication.
    let mut forged = fixture.package("1.0.0");
    forged.channel = "nightly";
    // The authenticated manifest is the arbiter, even with no Windows projection
    // behind it to catch the mismatch later.
    let stage = fixture.path.join("forged-stage");
    assert!(engine::package::expand(&forged.path, &forged.sha, &stage, "nightly").is_err());
    assert!(!stage.join("manifest.json").exists());
    assert!(fixture.install(&forged, Mode::Auto, false, false).is_err());
    assert!(!fixture.root.join("state.json").exists());
    assert!(
        fixture
            .setup(&nightly, &forged, Mode::Auto, Some(true))
            .is_err()
    );
    // A beta package projected with nightly names is restored, never registered.
    assert!(
        fixture
            .setup(&nightly, &fixture.package("1.0.0"), Mode::Auto, Some(true))
            .is_err()
    );
    assert!(!fixture.root.join("state.json").exists());
    for key in [NIGHTLY_KEY, BETA_KEY] {
        assert_eq!(registered(&nightly, key, "InstallLocation"), None, "{key}");
    }
    for link in NIGHTLY_LINKS.iter().chain(&BETA_LINKS) {
        assert!(!nightly.folders.join(link).exists(), "{link}");
    }

    // An existing beta installation is never adopted, updated or removed by nightly.
    let beta = fixture.shell_with("beta", fixture.path.join("shell"), registry);
    fixture
        .setup(&beta, &fixture.package("1.0.0"), Mode::Auto, Some(true))
        .unwrap();
    fixture.write_data();
    let before = product_snapshot(&fixture, &beta, BETA_KEY, &NIGHTLY_PATHS);
    // The nightly Setup probe already refuses the beta installation.
    let mut probe = engine::Request::new(
        &Args {
            root: Some(disk::path(&fixture.root).unwrap()),
            ..Args::default()
        },
        engine::Operation::Probe,
    );
    probe.qa = false;
    assert!(nightly.context.probe(&probe).is_err());
    assert!(beta.context.probe(&probe).is_ok());
    for mode in [Mode::Auto, Mode::Repair] {
        assert!(
            fixture
                .setup(
                    &nightly,
                    &fixture.package_for("nightly", "1.0.0"),
                    mode,
                    None
                )
                .is_err()
        );
    }
    // Without the Setup probe in front, the engine itself refuses the other channel.
    for mode in [Mode::Auto, Mode::Repair] {
        let package = fixture.package_for("nightly", "1.0.0");
        assert!(fixture.install(&package, mode, false, false).is_err());
    }
    let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
    let update = fixture.package_for("nightly", "1.0.1");
    assert!(
        operations::update(
            &fixture.root,
            &update.borrowed(),
            false,
            &mut sink.control(&cancel)
        )
        .is_err()
    );
    let mut beta_update = fixture.package("1.0.1");
    beta_update.channel = "nightly";
    assert!(
        operations::update(
            &fixture.root,
            &beta_update.borrowed(),
            false,
            &mut sink.control(&cancel)
        )
        .is_err()
    );
    let error = operations::uninstall(&fixture.root, "nightly", &mut sink.control(&cancel), |_| {
        panic!("another channel's uninstall must not reach Windows")
    })
    .unwrap_err();
    assert!(error.to_string().contains("canal"), "{error}");
    assert!(nightly.context.install_location().unwrap().is_none());
    assert_eq!(
        product_snapshot(&fixture, &beta, BETA_KEY, &NIGHTLY_PATHS),
        before
    );
}

#[test]
fn testers_and_master_have_no_installer_yet() {
    for channel in ["testers", "master"] {
        let fixture = Fixture::new();
        let package = fixture.package_for(channel, "1.0.0");
        assert!(
            fixture
                .install(&package, Mode::Auto, false, false)
                .unwrap_err()
                .to_string()
                .contains("Canal sin producto")
        );
        assert!(!fixture.root.exists(), "{channel}: nothing is created");
        assert!(
            Context::isolated(
                fixture.path.join("LocalAppData"),
                hive(),
                fixture.path.join("shell"),
            )
            .unwrap()
            .for_channel(channel)
            .is_err()
        );
    }
}

#[test]
fn a_context_without_product_never_falls_back_to_beta_names() {
    let fixture = Fixture::new();
    let registry = hive();
    let unbound = Context::isolated(
        fixture.path.join("LocalAppData"),
        registry.clone(),
        fixture.path.join("shell"),
    )
    .unwrap();
    assert!(unbound.install_location().is_err());
    assert!(unbound.has_registration().is_err());
    assert!(engine::Session::with_context(unbound.clone()).is_err());
    assert!(
        unbound
            .clone()
            .for_channel("beta")
            .unwrap()
            .for_channel("nightly")
            .is_err()
    );

    // The running Hub and launcher take the names of the installation itself.
    let nightly = fixture.shell_with("nightly", fixture.path.join("shell"), registry);
    fixture
        .setup(
            &nightly,
            &fixture.package_for("nightly", "1.0.0"),
            Mode::Auto,
            Some(false),
        )
        .unwrap();
    let root = disk::path(&fixture.root).unwrap();
    engine::shell::sync_running_with_context(&root, &unbound, Some(true)).unwrap();
    assert!(nightly.folders.join(NIGHTLY_LINKS[3]).is_file());
    assert!(!nightly.folders.join(BETA_LINKS[3]).exists());
    let beta = unbound.for_channel("beta").unwrap();
    assert!(engine::shell::sync_running_with_context(&root, &beta, Some(false)).is_err());
    assert!(nightly.folders.join(NIGHTLY_LINKS[3]).is_file());
    assert_eq!(registered(&nightly, BETA_KEY, "InstallLocation"), None);
}

#[test]
fn a_build_without_channel_has_no_product_and_never_installs_as_beta() {
    if !vantare_installer::CHANNEL.is_empty() {
        eprintln!("omitido: build con canal {}", vantare_installer::CHANNEL);
        return;
    }
    assert_eq!(vantare_installer::channel_label(), "sin canal");
    let error = engine::Session::new()
        .err()
        .expect("a build without channel has no product");
    #[cfg(not(feature = "test-installer"))]
    assert!(error.contains("Canal sin producto"), "{error}");
    let _ = error;
}

/// Installs, writes data and uninstalls one product, leaving its retained data.
fn retained_residue(fixture: &Fixture, channel: &'static str) -> Shell {
    let shell = fixture.shell_with(channel, fixture.path.join("shell"), hive());
    fixture
        .setup(
            &shell,
            &fixture.package_for(channel, "1.0.0"),
            Mode::Auto,
            None,
        )
        .expect("install");
    fixture.write_data();
    fixture.remove(&shell).expect("uninstall");
    assert!(fixture.root.join("retained-data.json").is_file());
    shell
}
fn root_tree(fixture: &Fixture) -> BTreeMap<String, Vec<u8>> {
    let mut tree = BTreeMap::new();
    files_below(&fixture.root, "root", &mut tree);
    tree
}

#[test]
fn retained_data_name_their_channel_and_beta_keeps_its_published_format() {
    let beta = Fixture::new();
    retained_residue(&beta, "beta");
    let saved = disk::read_json(&beta.root.join("retained-data.json"), None).unwrap();
    assert!(
        saved.get("channel").is_none(),
        "beta format unchanged: {saved}"
    );
    let nightly = Fixture::new();
    retained_residue(&nightly, "nightly");
    let saved = disk::read_json(&nightly.root.join("retained-data.json"), None).unwrap();
    assert_eq!(saved["channel"], "nightly");
    // Each product adopts its own data again.
    for (fixture, channel) in [(&beta, "beta"), (&nightly, "nightly")] {
        let shell = fixture.shell_with(channel, fixture.path.join("shell"), hive());
        fixture
            .setup(
                &shell,
                &fixture.package_for(channel, "1.0.0"),
                Mode::Auto,
                None,
            )
            .unwrap();
        assert_eq!(
            fs::read(fixture.data().join("opaque.bin")).unwrap(),
            b"opaque\0user\xffbytes"
        );
        assert!(!fixture.root.join("retained-data.json").exists());
    }
}

#[test]
fn retained_data_of_another_channel_are_never_adopted_moved_or_removed() {
    for (owner, intruder) in [("beta", "nightly"), ("nightly", "beta")] {
        let fixture = Fixture::new();
        let _owner = retained_residue(&fixture, owner);
        let before = root_tree(&fixture);
        let shell = fixture.shell_with(intruder, fixture.path.join("other-shell"), hive());
        for mode in [Mode::Auto, Mode::Repair] {
            assert!(
                fixture
                    .setup(&shell, &fixture.package_for(intruder, "1.0.0"), mode, None)
                    .is_err(),
                "{intruder} over {owner}"
            );
            let package = fixture.package_for(intruder, "1.0.0");
            assert!(fixture.install(&package, mode, false, false).is_err());
        }
        // The residue of an interrupted uninstall belongs to its own channel too.
        let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
        let error =
            operations::uninstall(&fixture.root, intruder, &mut sink.control(&cancel), |_| {
                panic!("another channel's residue must not reach Windows")
            })
            .unwrap_err();
        assert!(error.to_string().contains("otro canal"), "{error}");
        assert!(operations::residue_owned(&fixture.root, intruder).is_err());
        operations::residue_owned(&fixture.root, owner).unwrap();
        assert_eq!(root_tree(&fixture), before, "{intruder} over {owner}");
        assert_eq!(registered(&shell, NIGHTLY_KEY, "InstallLocation"), None);
        assert_eq!(registered(&shell, BETA_KEY, "InstallLocation"), None);
    }
}

#[test]
fn unreferenced_old_data_are_only_adopted_by_beta() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    fixture.write_data();
    // A generation with data and neither state nor retained-data: pre-#2812 residue.
    fs::remove_file(fixture.root.join("state.json")).unwrap();
    let before = root_tree(&fixture);
    let package = fixture.package_for("nightly", "1.0.0");
    let error = fixture
        .install(&package, Mode::Auto, false, false)
        .unwrap_err();
    assert!(error.to_string().contains("otra instalación"), "{error}");
    assert_eq!(root_tree(&fixture), before);
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    assert_eq!(
        fs::read(fixture.data().join("opaque.bin")).unwrap(),
        b"opaque\0user\xffbytes"
    );
}

#[test]
fn update_never_turns_a_nightly_root_into_beta() {
    let fixture = Fixture::new();
    let shell = fixture.shell_with("nightly", fixture.path.join("shell"), hive());
    fixture
        .setup(
            &shell,
            &fixture.package_for("nightly", "1.0.0"),
            Mode::Auto,
            None,
        )
        .unwrap();
    fixture.write_data();
    let before = product_snapshot(&fixture, &shell, NIGHTLY_KEY, &BETA_PATHS);
    // A beta ZIP announced as nightly: only the authenticated manifest stops it,
    // because update copies the incoming channel into state.json.
    let mut forged = fixture.package("1.0.1");
    forged.channel = "nightly";
    // A beta package announced as beta: the state of the root stops it.
    let beta = fixture.package("1.0.1");
    for package in [&forged, &beta] {
        let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
        assert!(
            operations::update(
                &fixture.root,
                &package.borrowed(),
                false,
                &mut sink.control(&cancel)
            )
            .is_err()
        );
        assert_eq!(channel_of(&fixture), "nightly");
        assert_eq!(
            product_snapshot(&fixture, &shell, NIGHTLY_KEY, &BETA_PATHS),
            before
        );
    }
    // The running Hub still projects nightly names only.
    let root = disk::path(&fixture.root).unwrap();
    engine::shell::sync_running_with_context(&root, &shell.context, None).unwrap();
    assert_eq!(registered(&shell, BETA_KEY, "InstallLocation"), None);
    assert!(registered(&shell, NIGHTLY_KEY, "InstallLocation").is_some());
}

#[test]
fn foreign_data_are_refused_before_the_orphan_marker_or_any_staging() {
    for (owner, intruder) in [("beta", "nightly"), ("nightly", "beta")] {
        let fixture = Fixture::new();
        let _owner = retained_residue(&fixture, owner);
        // Cleanup already removed Uninstall.exe and left its marker: an orphan
        // that the owner's next Setup would retire.
        fs::remove_file(fixture.root.join("Uninstall.exe")).unwrap();
        assert!(fixture.root.join("installer-cleanup.json").is_file());
        let before = root_tree(&fixture);
        let package = fixture.package_for(intruder, "1.0.0");
        let prepared = std::cell::Cell::new(false);
        let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
        let error = operations::install(
            &fixture.root,
            &package.borrowed(),
            Mode::Auto,
            &mut sink.control(&cancel),
            |_, _, _| panic!("another channel's data must not reach Windows"),
            || {
                prepared.set(true);
                Ok(())
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("otro canal"), "{error}");
        assert!(!prepared.get(), "{intruder} over {owner}: orphan untouched");
        assert_eq!(root_tree(&fixture), before, "{intruder} over {owner}");
    }
}

// ADR 0111 T3: Confirm and Uninstall gather the recordings of every generation:
// the active one first, then the orphans from the newest, never `previous` nor
// the generation an unconfirmed update staged; a recording moves only if whole.
/// `DuckDB` checksum of what follows the first 8 bytes of a block: 5381, and
/// each further 8-byte word multiplied by a constant and xored in.
fn seal(block: &mut [u8]) {
    let sum = block[8..]
        .as_chunks::<8>()
        .0
        .iter()
        .fold(5381_u64, |sum, word| {
            sum ^ u64::from_le_bytes(*word).wrapping_mul(0xbf58_476d_1ce4_e5b9)
        });
    block[..8].copy_from_slice(&sum.to_le_bytes());
}
/// A recording as `DuckDB` leaves it: its mark, two database headers (the newest
/// counts `blocks` of 4 096 bytes; the older one, more than the file has) and
/// those blocks, filled with `fill`; every one sealed with its checksum.
fn duck(blocks: u64, fill: u8) -> Vec<u8> {
    let mut bytes = vec![0_u8; 3 * 4096];
    bytes[8..12].copy_from_slice(b"DUCK");
    for (at, iteration, count) in [(4096, 1_u64, blocks + 7), (8192, 2, blocks)] {
        for (offset, value) in [(8, iteration), (32, count), (40, 4096)] {
            bytes[at + offset..at + offset + 8].copy_from_slice(&value.to_le_bytes());
        }
    }
    for header in bytes.as_chunks_mut::<4096>().0 {
        seal(header);
    }
    for _ in 0..blocks {
        let mut block = vec![fill; 4096];
        seal(&mut block);
        bytes.extend(block);
    }
    bytes
}
/// A real recording of the `DuckDB` in use: five blocks of 16 384 bytes.
/// A copy of `hub-host/src/analysis/fixtures/session-v1.duckdb` (same SHA-256).
const SESSION: &[u8] = include_bytes!("fixtures/session-v1.duckdb");
fn born(path: &Path, seconds: u64) -> std::time::SystemTime {
    use std::os::windows::fs::FileTimesExt;
    let at = std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds);
    // FILE_WRITE_ATTRIBUTES, and FILE_FLAG_BACKUP_SEMANTICS for a folder.
    fs::OpenOptions::new()
        .access_mode(0x100)
        .custom_flags(0x0200_0000)
        .open(path)
        .expect("dates")
        .set_times(fs::FileTimes::new().set_created(at).set_modified(at))
        .expect("dates");
    at
}
impl Fixture {
    /// A (1.0.0) without a reference, B (1.0.1) `previous` and C (1.0.2)
    /// active, with its boot still to confirm.
    fn three_generations(&self) -> [PathBuf; 3] {
        let [a, b] = self.two_generations();
        [a, b, self.upgrade("1.0.2", Mode::Auto)]
    }
    fn uninstall_cut(
        &self,
        cut: &mut dyn FnMut(&str) -> disk::Result<()>,
    ) -> (disk::Result<()>, Vec<String>) {
        self.uninstall_as("beta", cut)
    }
    fn uninstall_as(
        &self,
        channel: &str,
        cut: &mut dyn FnMut(&str) -> disk::Result<()>,
    ) -> (disk::Result<()>, Vec<String>) {
        let cancel = AtomicBool::new(false);
        let mut notes = Vec::new();
        let mut warning = |note: &str| notes.push(note.to_owned());
        let mut control = Control {
            cancel: &cancel,
            progress: &mut |_| {},
            checkpoint: cut,
            warning: &mut warning,
        };
        let result = operations::uninstall(&self.root, channel, &mut control, |_| Ok(()));
        (result, notes)
    }
}
fn read(path: &Path) -> Vec<u8> {
    fs::read(path).unwrap_or_else(|error| panic!("{}: {error}", path.display()))
}
fn read_only(path: &Path, value: bool) {
    let mut permissions = fs::metadata(path).expect("file").permissions();
    permissions.set_readonly(value);
    fs::set_permissions(path, permissions).expect("attribute");
}
fn root_text(fixture: &Fixture) -> String {
    disk::path(&fixture.root)
        .expect("root")
        .display()
        .to_string()
}

#[test]
fn confirm_moves_what_is_missing_keeps_its_dates_and_never_takes_from_previous() {
    let fixture = Fixture::new();
    let [a, b, c] = fixture.three_generations();
    let single = fixture.root.join("recordings");
    let (from_c, from_a, in_b) = (
        ("series-3-3.duckdb", duck(2, 3)),
        ("series-1-1.duckdb", SESSION.to_vec()),
        ("series-2-2.duckdb", duck(1, 2)),
    );
    record(&recordings(&c), &[(from_c.0, &from_c.1)]);
    record(&recordings(&a), &[(from_a.0, &from_a.1), (STATUS, b"{}")]);
    record(&recordings(&b), &[(in_b.0, &in_b.1), (from_a.0, &from_a.1)]);
    let dates = [
        born(&recordings(&c).join(from_c.0), 1_700_000_000),
        born(&recordings(&a).join(from_a.0), 1_700_000_100),
    ];
    let previous = index(&b);
    let notes = fixture.confirm();
    assert_eq!(names(&single), [from_a.0, from_c.0]);
    assert_eq!(read(&single.join(from_c.0)), from_c.1);
    assert_eq!(
        read(&single.join(from_a.0)),
        from_a.1,
        "a real recording is whole"
    );
    for (name, at) in [from_c.0, from_a.0].into_iter().zip(dates) {
        let moved = fs::metadata(single.join(name)).unwrap();
        let got = (moved.created().unwrap(), moved.modified().unwrap());
        assert_eq!(got, (at, at), "moved, never copied: {name}");
    }
    assert_eq!(names(&recordings(&c)), [] as [String; 0]);
    assert_eq!(names(&recordings(&a)), [STATUS]);
    assert_eq!(
        index(&b),
        previous,
        "previous keeps its copy for the way back"
    );
    assert!(noted(&notes, &recordings(&a), "adoptadas 1"), "{notes:?}");
    let log = logged(&fixture.root);
    assert!(
        log.iter().any(|line| line.contains("adoptadas 1")),
        "{log:?}"
    );
    assert!(log.iter().all(|line| !line.contains(&root_text(&fixture))));
}

#[test]
fn confirm_removes_a_copy_only_when_its_hash_matches_the_single_folder() {
    let fixture = Fixture::new();
    let [a, _, _] = fixture.three_generations();
    let (source, single) = (recordings(&a), fixture.root.join("recordings"));
    let same = ("series-1-1.duckdb", duck(1, 1));
    let other = ("series-2-2.duckdb", duck(1, 2)); // the same size, other bytes
    let longer = ("series-3-3.duckdb", duck(2, 3));
    let linked = ("series-4-4.duckdb", duck(1, 4));
    let busy = ("series-5-5.duckdb", duck(1, 5));
    record(
        &single,
        &[
            (same.0, &same.1),
            (other.0, &duck(1, 0x20)),
            (longer.0, &duck(1, 3)),
            (linked.0, &linked.1),
            (busy.0, &busy.1),
        ],
    );
    record(
        &source,
        &[
            (same.0, &same.1),
            (other.0, &other.1),
            (longer.0, &longer.1),
            (busy.0, &busy.1),
        ],
    );
    // Two names of one file: it cannot be held alone, so it stays.
    fs::hard_link(single.join(linked.0), source.join(linked.0)).unwrap();
    let twins = index(&single);
    let writer = opened(&single.join(busy.0), true, 1);
    let notes = fixture.confirm();
    drop(writer);
    assert_eq!(index(&single), twins, "the single folder is never written");
    assert_eq!(names(&source), [other.0, longer.0, linked.0, busy.0]);
    for (name, bytes) in [&other, &longer, &linked, &busy] {
        assert_eq!(&read(&source.join(name)), bytes, "{name}");
    }
    let differs = "su contenido es distinto";
    assert!(
        summarized(&notes, &source, &[other.0, longer.0], differs),
        "{notes:?}"
    );
    assert!(summarized(
        &notes,
        &source,
        &[linked.0],
        "la copia está en uso"
    ));
    let unread = "la de la carpeta única está en uso";
    assert!(summarized(&notes, &source, &[busy.0], unread), "{notes:?}");
}

#[test]
fn a_reverted_orphan_gives_its_whole_recordings_and_keeps_the_broken_ones() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .unwrap();
    fixture.write_documents();
    let a = fixture.active();
    let b = fixture.upgrade("1.0.1", Mode::Auto);
    // B recorded before its boot failed to confirm; a power cut left pieces.
    let whole = duck(3, 0xB);
    // What a cut `CopyFileW` leaves on NTFS: the final size, with zeros after
    // the part that was written.
    let zeros_after_header = [&SESSION[..3 * 4096], &vec![0_u8; 5 * 16_384][..]].concat();
    let last_block_zeros = [&SESSION[..SESSION.len() - 16_384], &[0_u8; 16_384][..]].concat();
    let mut flipped = whole.clone();
    flipped[3 * 4096 + 4096 + 100] ^= 1;
    let mut older_header_flipped = whole.clone();
    older_header_flipped[4096 + 200] ^= 1;
    let files: [(&str, Vec<u8>); 10] = [
        ("series-1-1.duckdb", whole.clone()),
        ("series-2-2.duckdb", SESSION.to_vec()),
        ("series-3-3.duckdb", whole[..whole.len() - 1].to_vec()),
        (
            "series-4-4.duckdb",
            SESSION[..SESSION.len() - 16_384].to_vec(),
        ),
        ("series-5-5.duckdb", vec![0; whole.len()]),
        ("series-6-6.duckdb", whole[..3 * 4096 - 1].to_vec()),
        ("series-7-8.duckdb", zeros_after_header),
        ("series-7-9.duckdb", last_block_zeros),
        ("series-8-8.duckdb", flipped),
        ("series-8-9.duckdb", older_header_flipped),
    ];
    let listed = files
        .each_ref()
        .map(|(name, bytes)| (*name, bytes.as_slice()));
    record(&recordings(&b), &listed);
    let restored = operations::rollback(&fixture.root).unwrap();
    assert_eq!(restored, operations::BootRecovery::Restored);
    assert_eq!(fixture.active(), a);
    let c = fixture.upgrade("1.0.2", Mode::Auto);
    // The active copy of one name is the broken one; the orphan has it whole.
    let half = &whole[..whole.len() / 2];
    record(&recordings(&c), &[("series-7-7.duckdb", half)]);
    record(&recordings(&b), &[("series-7-7.duckdb", &whole)]);
    let notes = fixture.confirm();
    let single = fixture.root.join("recordings");
    let moved = [
        "series-1-1.duckdb",
        "series-2-2.duckdb",
        "series-7-7.duckdb",
    ];
    assert_eq!(names(&single), moved);
    assert_eq!(read(&single.join(moved[0])), whole);
    assert_eq!(read(&single.join(moved[1])), SESSION);
    assert_eq!(read(&single.join(moved[2])), whole);
    let broken: Vec<&str> = files[2..].iter().map(|(name, _)| *name).collect();
    assert_eq!(names(&recordings(&b)), broken);
    for (name, bytes) in &files[2..] {
        assert_eq!(&read(&recordings(&b).join(name)), bytes, "{name}");
    }
    assert_eq!(read(&recordings(&c).join(moved[2])), half);
    let reason = "no es una grabación completa";
    assert!(
        summarized(&notes, &recordings(&b), &broken, reason),
        "{notes:?}"
    );
    assert!(summarized(&notes, &recordings(&c), &[moved[2]], reason));
}

#[test]
fn confirm_takes_the_active_first_then_the_newest_orphan() {
    use std::os::windows::fs::FileTimesExt;
    let fixture = Fixture::new();
    fixture.two_generations();
    for version in ["1.0.2", "1.0.3"] {
        fixture.upgrade(version, Mode::Auto);
        fixture.confirm();
    }
    let active = fixture.upgrade("1.0.4", Mode::Auto);
    let view = verified(&fixture.root).unwrap().state.unwrap();
    let referenced = [view.active.generation, view.previous.unwrap().generation];
    let generations = fixture.root.join("generations");
    let mut orphans: Vec<_> = names(&generations)
        .into_iter()
        .filter(|id| !referenced.contains(id))
        .collect();
    assert_eq!(orphans.len(), 3);
    // Neither the name nor the date of modification says which one is newer:
    // only the date the folder was created does.
    let at = |seconds: u64| std::time::UNIX_EPOCH + std::time::Duration::from_secs(seconds);
    let [newest, middle, oldest] =
        [("8", 3_u8, 2), ("0", 2, 3), ("f", 1, 1)].map(|(id, born_at, touched)| {
            let path = generations.join(id.repeat(32));
            fs::rename(generations.join(orphans.pop().unwrap()), &path).unwrap();
            record(
                &recordings(&path),
                &[("series-1-1.duckdb", &duck(1, born_at))],
            );
            let times = fs::FileTimes::new()
                .set_created(at(1_600_000_000 + u64::from(born_at)))
                .set_modified(at(1_700_000_000 + touched));
            fs::OpenOptions::new()
                .access_mode(0x100)
                .custom_flags(0x0200_0000)
                .open(&path)
                .unwrap()
                .set_times(times)
                .unwrap();
            path
        });
    let all = "series-2-2.duckdb";
    record(&recordings(&newest), &[(all, &duck(1, 0xB))]);
    record(&recordings(&active), &[(all, &duck(1, 0xC))]);
    fixture.confirm();
    let single = fixture.root.join("recordings");
    assert_eq!(
        read(&single.join(all)),
        duck(1, 0xC),
        "the active one first"
    );
    let first = read(&single.join("series-1-1.duckdb"));
    assert_eq!(first, duck(1, 3), "then the newest orphan");
    assert_eq!(names(&recordings(&newest)), [all]);
    for older in [&middle, &oldest] {
        assert_eq!(names(&recordings(older)), ["series-1-1.duckdb"]);
    }
    assert_eq!(names(&recordings(&active)), [] as [String; 0]);
}

#[test]
fn confirm_keeps_recordings_with_a_wal_together_where_they_are() {
    let fixture = Fixture::new();
    let [a, _, _] = fixture.three_generations();
    let (source, single) = (recordings(&a), fixture.root.join("recordings"));
    let (pair, beside) = ("series-1-1.duckdb", "series-3-3.duckdb");
    let (pair_wal, beside_wal) = (format!("{pair}.wal"), format!("{beside}.wal"));
    record(
        &source,
        &[
            (pair, &duck(1, 1)),
            (&pair_wal, b"last changes"),
            ("series-2-2.duckdb.wal", b"a wal without its recording"),
            (beside, &duck(1, 3)),
        ],
    );
    record(&single, &[(&beside_wal, b"written by the core")]);
    let (before, twins) = (index(&source), index(&single));
    let notes = fixture.confirm();
    assert_eq!(index(&source), before, "nothing leaves the generation");
    assert_eq!(index(&single), twins);
    assert!(
        summarized(&notes, &source, &[pair], "tiene al lado un .wal"),
        "{notes:?}"
    );
    let wal_there = "en la carpeta única hay un .wal";
    assert!(
        summarized(&notes, &source, &[beside], wal_there),
        "{notes:?}"
    );
}

#[test]
fn uninstall_never_gathers_from_a_staged_generation_nor_with_a_doubtful_marker() {
    let gathered = |marker: &dyn Fn(&Path, &str)| {
        let fixture = Fixture::new();
        let [a, _, c] = fixture.three_generations();
        record(&recordings(&a), &[("series-1-1.duckdb", &duck(1, 1))]);
        record(&recordings(&c), &[("series-3-3.duckdb", &duck(1, 3))]);
        let id = a.file_name().unwrap().to_string_lossy().into_owned();
        marker(&fixture.root.join("boot-pending.json"), &id);
        let (result, notes) = fixture.uninstall_cut(&mut |_| Ok(()));
        result.expect("uninstalled");
        let single = fixture.root.join("recordings");
        let moved = if single.exists() {
            names(&single)
        } else {
            Vec::new()
        };
        (moved, notes)
    };
    // The update to C was never confirmed: C is the staged generation.
    let (moved, _) = gathered(&|_, _| {});
    assert_eq!(moved, ["series-1-1.duckdb"]);
    // A marker that stages another generation keeps that one instead.
    let (moved, _) = gathered(&|path, id| {
        let mut marker = disk::read_json(path, None).unwrap();
        marker["stagedGeneration"] = id.into();
        fs::write(path, marker.to_string()).unwrap();
    });
    assert_eq!(moved, ["series-3-3.duckdb"]);
    // A marker nobody can read, or one without its generation: nothing at all.
    for broken in [
        b"{roto".as_slice(),
        b"{\"schema\":1}".as_slice(),
        b"{\"schema\":1,\"stagedGeneration\":\"no es hexadecimal\"}".as_slice(),
    ] {
        let (moved, notes) = gathered(&|path, _| fs::write(path, broken).unwrap());
        assert!(moved.is_empty(), "{moved:?}");
        let said = notes.iter().any(|note| note.contains("boot-pending.json"));
        assert!(said, "{notes:?}");
    }
}

#[test]
fn a_gathering_cut_short_loses_nothing_and_the_next_one_finishes() {
    let fixture = Fixture::new();
    let [a, _, _] = fixture.three_generations();
    let (source, single) = (recordings(&a), fixture.root.join("recordings"));
    let files = [
        ("series-1-1.duckdb", duck(1, 1)),
        ("series-2-2.duckdb", duck(1, 2)),
        ("series-3-3.duckdb", duck(1, 3)),
        ("series-4-4.duckdb", duck(1, 4)),
    ];
    let listed = files
        .each_ref()
        .map(|(name, bytes)| (*name, bytes.as_slice()));
    record(&source, &listed);
    record(&single, &[listed[3]]);
    let before = index(&source);
    // No time left: Confirm still confirms, and touches nothing.
    let mut notes = Vec::new();
    let mut note = |text: &str| notes.push(text.to_owned());
    operations::confirm_within(&fixture.root, std::time::Duration::ZERO, &mut note)
        .expect("confirmed");
    assert!(!fixture.root.join("boot-pending.json").exists());
    assert_eq!(index(&source), before);
    assert_eq!(names(&single), [files[3].0]);
    let later = notes
        .iter()
        .any(|note| note.contains("se sigue en la siguiente"));
    assert!(later, "{notes:?}");
    // Uninstall is cut before its second move, and then resumed.
    let mut moves = 0;
    let (result, _) = fixture.uninstall_cut(&mut |point| {
        moves += usize::from(point == "adopt-move");
        disk::ensure(moves < 2, "corte inyectado")
    });
    assert!(result.is_err());
    assert!(
        fixture.root.join("state.json").exists(),
        "nothing else was done"
    );
    assert_eq!(names(&single), [files[0].0, files[3].0]);
    assert_eq!(names(&source), [files[1].0, files[2].0, files[3].0]);
    let (result, _) = fixture.uninstall_cut(&mut |_| Ok(()));
    result.expect("resumed");
    assert_eq!(names(&source), [] as [String; 0]);
    assert_eq!(names(&single), files.each_ref().map(|(name, _)| *name));
    for (name, bytes) in &files {
        assert_eq!(&read(&single.join(name)), bytes, "{name}");
    }
}

#[test]
fn confirm_notes_what_stays_once_per_reason_and_never_fails_for_it() {
    let fixture = Fixture::new();
    let [a, _, _] = fixture.three_generations();
    let source = recordings(&a);
    let broken: Vec<String> = (1..=7).map(|n| format!("series-{n}-{n}.duckdb")).collect();
    for name in &broken {
        record(&source, &[(name, b"no es DuckDB")]);
    }
    let (short, denied) = ("SERIES~1.DUC", "series-9-9.duckdb");
    record(&source, &[(short, &duck(1, 8)), (denied, &duck(1, 9))]);
    let guard = Denied::new(&source.join(denied));
    let notes = fixture.confirm();
    drop(guard);
    let shown: Vec<&str> = broken.iter().map(String::as_str).collect();
    let reason = "no es una grabación completa";
    assert!(summarized(&notes, &source, &shown, reason), "{notes:?}");
    assert!(notes.iter().any(|note| note.contains(" y 2 más")));
    let foreign = "el nombre no es de una grabación";
    assert!(summarized(&notes, &source, &[short], foreign), "{notes:?}");
    assert!(summarized(&notes, &source, &[denied], "no se puede leer"));
    let kept = notes
        .iter()
        .filter(|note| note.starts_with("Grabaciones de") && note.contains("se conservan"))
        .count();
    assert_eq!(kept, 3, "one note per reason: {notes:?}");
    let log = logged(&fixture.root);
    assert!(
        log.iter().any(|line| line.contains("se conservan 7")),
        "{log:?}"
    );
    assert!(log.iter().all(|line| !line.contains(&root_text(&fixture))));
    // A file where the single folder should be: said once, and Confirm confirms.
    fixture.upgrade("1.0.3", Mode::Auto);
    let single = fixture.root.join("recordings");
    fs::write(&single, b"not a folder").unwrap();
    let before = index(&source);
    let notes = fixture.confirm();
    assert_eq!(index(&source), before);
    assert_eq!(read(&single), b"not a folder");
    let said = notes
        .iter()
        .filter(|note| note.contains("no es una carpeta"));
    assert_eq!(said.count(), 1, "{notes:?}");
}

#[test]
fn an_update_flushes_its_copy_of_the_data_and_keeps_read_only_files_read_only() {
    let fixture = Fixture::new();
    let first = fixture.upgrade("1.0.0", Mode::Auto);
    let file = first.join("data/solo lectura.bin");
    fs::write(&file, b"kept read-only").unwrap();
    read_only(&file, true);
    let second = fixture.upgrade("1.0.1", Mode::Auto);
    let copy = second.join("data/solo lectura.bin");
    assert_eq!(read(&copy), b"kept read-only");
    let locked = |path: &Path| fs::metadata(path).unwrap().permissions().readonly();
    assert!(locked(&copy) && locked(&file));
    read_only(&file, false);
    read_only(&copy, false);
    // The flush writes through its own handle: a copy nobody may write fails.
    let held = opened(&copy, false, 1);
    assert!(disk::flush(&copy).is_err());
    drop(held);
    disk::flush(&copy).expect("flushed");
}

#[test]
fn the_gathering_stays_inside_the_product_of_its_root() {
    // Beta, as before: an uninstall in the name of nightly is refused before it
    // brings or removes anything.
    let beta = Fixture::new();
    let [a, b, c] = beta.three_generations();
    record(&recordings(&a), &[("series-1-1.duckdb", &duck(1, 1))]);
    record(&recordings(&c), &[("series-3-3.duckdb", &duck(1, 3))]);
    let before = index(&beta.root);
    let (result, notes) = beta.uninstall_as("nightly", &mut |_| Ok(()));
    assert!(result.is_err(), "{notes:?}");
    assert_eq!(index(&beta.root), before, "nothing of beta was touched");
    // As beta it gathers as before: the orphan's recording comes; the active
    // one is still the generation an unconfirmed update staged, so it stays.
    let (result, _) = beta.uninstall_cut(&mut |_| Ok(()));
    result.expect("uninstalled as beta");
    assert_eq!(names(&beta.root.join("recordings")), ["series-1-1.duckdb"]);
    assert_eq!(names(&recordings(&c)), ["series-3-3.duckdb"]);
    assert!(fs::read_dir(recordings(&b)).is_err(), "previous had none");
    // Nightly, with its own root: the same rules, bound to its own state.
    let nightly = Fixture::new();
    let install = |version: &str| {
        nightly
            .install(
                &nightly.package_for("nightly", version),
                Mode::Auto,
                false,
                false,
            )
            .expect(version);
        nightly.active()
    };
    let orphan = install("1.0.0");
    install("1.0.1");
    nightly.confirm();
    let active = install("1.0.2");
    assert_eq!(channel_of(&nightly), "nightly");
    let previous = nightly.root.join("generations").join(
        verified(&nightly.root)
            .unwrap()
            .state
            .unwrap()
            .previous
            .unwrap()
            .generation,
    );
    record(&recordings(&orphan), &[("series-1-1.duckdb", &duck(1, 1))]);
    record(
        &recordings(&previous),
        &[("series-2-2.duckdb", &duck(1, 2))],
    );
    record(&recordings(&active), &[("series-3-3.duckdb", &duck(1, 3))]);
    nightly.confirm();
    let single = nightly.root.join("recordings");
    assert_eq!(names(&single), ["series-1-1.duckdb", "series-3-3.duckdb"]);
    assert_eq!(names(&recordings(&previous)), ["series-2-2.duckdb"]);
    // And a beta uninstall never reaches the recordings of nightly.
    let before = index(&nightly.root);
    let (result, _) = nightly.uninstall_as("beta", &mut |_| Ok(()));
    assert!(result.is_err());
    assert_eq!(index(&nightly.root), before);
}

/// Cost of what T3 adds, measured by hand: `--run-ignored only`.
#[test]
#[ignore = "medición: coste de comprobar una grabación y de forzar copias a disco"]
fn measure_the_cost_of_checking_a_recording_and_of_the_flush() {
    let fixture = Fixture::new();
    let [a, _, _] = fixture.three_generations();
    // 64 MiB: about three hours of track.
    let big = duck(16_384, 0x5A);
    record(&recordings(&a), &[("series-1-1.duckdb", &big)]);
    let started = std::time::Instant::now();
    fixture.confirm();
    let checked = started.elapsed();
    assert_eq!(
        names(&fixture.root.join("recordings")),
        ["series-1-1.duckdb"]
    );
    let folder = fixture.path.join("flush");
    fs::create_dir_all(&folder).unwrap();
    let small: Vec<_> = (0..500)
        .map(|n| {
            let path = folder.join(format!("{n}.bin"));
            fs::write(&path, [7_u8; 4096]).unwrap();
            path
        })
        .collect();
    let started = std::time::Instant::now();
    for path in &small {
        disk::flush(path).unwrap();
    }
    let flushed_small = started.elapsed();
    let large = folder.join("grande.bin");
    fs::write(&large, &big).unwrap();
    let started = std::time::Instant::now();
    disk::flush(&large).unwrap();
    let flushed_large = started.elapsed();
    println!(
        "MEDIDA: Confirm con una grabación de 64 MiB comprobada y movida: {checked:?}; \
         flush de 500 archivos de 4 KiB: {flushed_small:?}; \
         flush de 64 MiB recién escritos: {flushed_large:?}"
    );
}

// ---------------------------------------------------------------------------
// P7-1 (#2822): A→B→C de paquetes Electron por el camino del feed
// (`operations::update`, el mismo que usa `vantare.exe` al aplicar), con un
// Confirm o un rollback en cada salto. Cada generación escribe lo suyo.

const IN_A: &str = "series-1700000000000-1.duckdb";
const IN_B: &str = "series-1700000360000-2.duckdb";
const IN_C: &str = "series-1700000720000-3.duckdb";

impl Fixture {
    /// The feed applies an authenticated package after every child exited.
    fn feed(&self, package: &Package) -> disk::Result<()> {
        let (cancel, mut sink) = (AtomicBool::new(false), Sink::new());
        operations::update(
            &self.root,
            &package.borrowed(),
            false,
            &mut sink.control(&cancel),
        )
    }
    fn feed_to(&self, version: &str) -> PathBuf {
        self.feed(&self.electron(version)).expect(version);
        self.active()
    }
    fn status(&self) -> serde_json::Value {
        disk::read_json(&self.root.join("update-status.json"), None).expect("update status")
    }
    /// A, installed by Setup with a recording, and B, applied by the feed and
    /// confirmed, which then writes documents and a recording of its own.
    fn chain_to_b(&self, shell: &Shell) -> [PathBuf; 2] {
        self.setup(shell, &self.electron("1.0.0"), Mode::Auto, Some(true))
            .expect("A");
        self.write_documents();
        let a = self.active();
        record(&recordings(&a), &[(IN_A, &duck(1, 0xA1))]);
        let b = self.feed_to("1.0.1");
        self.confirm();
        fs::write(b.join("data/hub/hub-settings.json"), b"{\"by\":\"B\"}").expect("B settings");
        fs::write(b.join("data/hub/hub-ui/Preferences"), b"{}").expect("B profile");
        record(&recordings(&b), &[(IN_B, &duck(1, 0xB2))]);
        [a, b]
    }
}
/// The index of a data folder without its recordings, which Confirm gathers.
fn without_recordings(mut index: Index) -> Index {
    index.retain(|path, _| !path.starts_with("hub/recordings"));
    index
}

#[test]
fn the_feed_takes_a_to_b_to_c_copying_each_from_the_confirmed_generation() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    let [a, b] = fixture.chain_to_b(&shell);
    let single = fixture.root.join("recordings");
    // B's Confirm brought the copy of A's recording; `previous` keeps its own.
    assert_eq!(names(&single), [IN_A]);
    assert_eq!(names(&recordings(&a)), [IN_A]);
    // A stale write in A after B took over must never reach C.
    fs::write(a.join("data/escrito en A tras B.bin"), b"stale").unwrap();
    let (data_a, data_b, whole_b) = (index(&a.join("data")), index(&b.join("data")), index(&b));
    let location = shell.context.install_location().unwrap();

    let c = fixture.feed_to("1.0.2");
    assert_eq!(
        index(&c.join("data")),
        data_b,
        "C starts from B, not from A"
    );
    assert_eq!(index(&a.join("data")), data_a);
    assert_eq!(index(&b), whole_b);
    let view = verified(&fixture.root).unwrap();
    assert_eq!(view.installed_version(), Some("1.0.2"));
    assert_eq!(
        view.state.unwrap().previous.unwrap().generation,
        b.file_name().unwrap().to_string_lossy()
    );
    assert_eq!(
        fs::read(fixture.root.join("Vantare.exe")).unwrap(),
        fs::read(c.join("bin/vantare.exe")).unwrap()
    );
    assert_launcher_links(&fixture, &shell, true);
    assert_eq!(shell.context.install_location().unwrap(), location);

    let notes = fixture.confirm();
    assert!(!fixture.root.join("boot-pending.json").exists());
    // A, without a reference, loses its binaries; its documents stay and its
    // copy of a recording already in the single folder goes as identical.
    assert_eq!(names(&a), ["data"]);
    assert!(noted(&notes, &a, "retirados"), "{notes:?}");
    assert_eq!(
        without_recordings(index(&a.join("data"))),
        without_recordings(data_a)
    );
    assert_eq!(names(&recordings(&a)), [] as [String; 0]);
    assert_eq!(index(&b), whole_b, "previous keeps the way back");
    assert_eq!(names(&single), [IN_A, IN_B]);
    assert_eq!(names(&recordings(&c)), [] as [String; 0]);
    assert_eq!(
        without_recordings(index(&c.join("data"))),
        without_recordings(data_b)
    );
}

#[test]
fn a_failed_c_goes_back_to_b_untouched_and_c_keeps_what_it_wrote() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    let [a, b] = fixture.chain_to_b(&shell);
    let (whole_b, data_b) = (index(&b), index(&b.join("data")));
    let c = fixture.feed_to("1.0.2");
    // C wrote before its window failed to confirm the boot (P6).
    fs::write(c.join("data/hub/hub-settings.json"), b"{\"by\":\"C\"}").unwrap();
    fs::write(c.join("data/solo en C.bin"), b"only in C").unwrap();
    record(&recordings(&c), &[(IN_C, &duck(1, 0xC3))]);
    let data_c = index(&c.join("data"));

    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.active(), b);
    assert_eq!(index(&b), whole_b, "B and its data, as before C");
    assert_eq!(index(&c.join("data")), data_c, "what C wrote stays in C");
    assert_eq!(
        fs::read(fixture.root.join("Vantare.exe")).unwrap(),
        fs::read(b.join("bin/vantare.exe")).unwrap()
    );
    assert_launcher_links(&fixture, &shell, true);
    let status = fixture.status();
    assert_eq!(status["state"], "rollback");
    assert_eq!(status["rejectedVersion"], "1.0.2");
    assert!(!fixture.root.join("boot-pending.json").exists());

    // The next version starts again from B; the feed and Confirm keep C rejected.
    let d = fixture.feed_to("1.0.3");
    assert_eq!(index(&d.join("data")), data_b);
    assert_eq!(fixture.status()["rejectedVersion"], "1.0.2");
    fixture.confirm();
    assert_eq!(fixture.status()["rejectedVersion"], "1.0.2");
    assert_eq!([names(&a), names(&c)], [["data"], ["data"]]);
    // C's recording is not lost: it reaches the single folder, and its other
    // documents stay in C for an explicit recovery.
    assert_eq!(names(&fixture.root.join("recordings")), [IN_A, IN_B, IN_C]);
    assert_eq!(
        without_recordings(index(&c.join("data"))),
        without_recordings(data_c)
    );
    assert!(!d.join("data/solo en C.bin").exists());
}

#[test]
fn a_cut_at_every_point_of_the_b_to_c_hop_leaves_b_or_a_c_to_confirm() {
    for point in ["staged", "before-commit", "after-commit"] {
        let fixture = Fixture::new();
        let shell = fixture.shell();
        let [_, b] = fixture.chain_to_b(&shell);
        let state = fs::read(fixture.root.join("state.json")).unwrap();
        let (whole_b, data_b) = (index(&b), index(&b.join("data")));
        let package = fixture.electron("1.0.2");
        cut_update_at(&fixture, &package, point);
        let view = verified(&fixture.root).expect("valid state after the cut");
        assert_eq!(index(&b), whole_b, "{point}: B untouched");
        if point == "after-commit" {
            // C is active and its boot still to confirm: the next start tries it.
            assert_eq!(view.installed_version(), Some("1.0.2"));
            assert!(!operations::discard_stale_boot_marker(&fixture.root).unwrap());
            let c = fixture.active();
            assert_eq!(index(&c.join("data")), data_b);
            let marker = fs::read(fixture.root.join("boot-pending.json")).unwrap();
            fixture.confirm();
            // Confirm cut before its marker went away: the next start confirms
            // again, with no rollback and nothing more retired.
            fs::write(fixture.root.join("boot-pending.json"), &marker).unwrap();
            assert!(!operations::discard_stale_boot_marker(&fixture.root).unwrap());
            let whole = index(&fixture.root.join("generations"));
            fixture.confirm();
            assert_eq!(fixture.active(), c);
            assert_eq!(index(&fixture.root.join("generations")), whole);
            assert!(!fixture.root.join("boot-pending.json").exists());
        } else {
            assert_eq!(view.installed_version(), Some("1.0.1"), "{point}");
            assert_eq!(fs::read(fixture.root.join("state.json")).unwrap(), state);
            assert!(
                operations::discard_stale_boot_marker(&fixture.root).unwrap(),
                "{point}"
            );
            assert_eq!(fixture.active(), b);
            assert_eq!(index(&b), whole_b);
            // And the retry starts from B again.
            fixture.feed(&package).expect("retry");
            assert_eq!(index(&fixture.data()), data_b, "{point}");
            fixture.confirm();
        }
        assert_eq!(
            verified(&fixture.root).unwrap().installed_version(),
            Some("1.0.2")
        );
    }
}

#[test]
fn once_c_is_confirmed_neither_setup_nor_feed_nor_rollback_goes_back_to_b() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    fixture.chain_to_b(&shell);
    fixture.feed_to("1.0.2");
    fixture.confirm();
    let seen = || {
        let json = |name: &str| disk::read_json(&fixture.root.join(name), None).unwrap();
        (
            json("state.json"),
            json("update-status.json"),
            fs::read(fixture.root.join("Vantare.exe")).unwrap(),
            index(&fixture.root.join("generations")),
        )
    };
    let before = seen();
    let older = fixture.electron("1.0.1");
    for mode in [Mode::Auto, Mode::Repair] {
        assert_eq!(
            fixture.setup(&shell, &older, mode, None).unwrap_err().code,
            3
        );
    }
    assert!(fixture.feed(&older).is_err(), "the feed only goes up");
    assert!(
        fixture.feed(&fixture.electron("1.0.2")).is_err(),
        "nor sideways"
    );
    assert!(
        operations::rollback(&fixture.root).is_err(),
        "no manual way back"
    );
    assert!(seen() == before, "a refused way back changes nothing");
    assert_eq!(children(&fixture.root.join("staging")), 0);
}

/// CARACTERIZACIÓN (#2822, caso 5), no un contrato: lo que pasa hoy con la
/// versión rechazada, que `installed::stage` no vuelve a ofrecer. El feed y
/// Confirm la conservan (`a_failed_c_goes_back_to_b_*`); un Setup sobre la
/// instalación reescribe `update-status.json` sin ella, así que tras Reparar
/// B el feed volvería a ofrecer C una vez. Pendiente de decisión.
#[test]
fn characterization_a_setup_repair_forgets_the_rejected_version() {
    let fixture = Fixture::new();
    let shell = fixture.shell();
    let [_, b] = fixture.chain_to_b(&shell);
    fixture.feed_to("1.0.2");
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.status()["rejectedVersion"], "1.0.2");
    let data_b = index(&b.join("data"));
    fixture
        .setup(&shell, &fixture.electron("1.0.1"), Mode::Repair, None)
        .unwrap();
    assert_eq!(index(&fixture.data()), data_b, "the repair keeps B's data");
    assert_eq!(fixture.status()["state"], "applied");
    assert!(
        fixture.status()["rejectedVersion"].is_null(),
        "forgotten by Setup"
    );
    fixture.confirm();
    assert!(fixture.status()["rejectedVersion"].is_null());
}

#[test]
fn the_beta_feed_chain_and_the_nightly_setup_chain_never_touch_each_other() {
    let (beta_fixture, nightly_fixture) = (Fixture::new(), Fixture::new());
    let folders = beta_fixture.path.join("shell");
    let registry = hive();
    let beta = beta_fixture.shell_with("beta", folders.clone(), registry.clone());
    let nightly = nightly_fixture.shell_with("nightly", folders, registry);
    let nightly_package = |version| {
        nightly_fixture.build_for(
            "nightly",
            "electron-nightly",
            version,
            electron_members(),
            None,
            2,
        )
    };
    nightly_fixture
        .setup(&nightly, &nightly_package("1.0.0"), Mode::Auto, Some(true))
        .unwrap();
    nightly_fixture.write_documents();
    let nightly_state = || product_snapshot(&nightly_fixture, &nightly, NIGHTLY_KEY, &BETA_PATHS);
    let nightly_before = nightly_state();

    // Beta: A by Setup, B and C by the feed, C fails and goes back to B.
    beta_fixture.chain_to_b(&beta);
    beta_fixture.feed_to("1.0.2");
    assert_eq!(
        operations::rollback(&beta_fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(nightly_state(), nightly_before, "beta chain");
    // A beta package never enters the nightly root through the feed.
    assert!(
        nightly_fixture
            .feed(&nightly_fixture.electron("1.0.1"))
            .is_err()
    );
    assert_eq!(nightly_state(), nightly_before, "refused feed");

    // Nightly has no feed: its Setup takes it 1.0.0 → 1.0.1 → 1.0.2.
    let beta_state = || product_snapshot(&beta_fixture, &beta, BETA_KEY, &NIGHTLY_PATHS);
    let beta_before = beta_state();
    let mut data = index(&nightly_fixture.data());
    for version in ["1.0.1", "1.0.2"] {
        nightly_fixture
            .setup(&nightly, &nightly_package(version), Mode::Auto, None)
            .unwrap();
        assert_eq!(index(&nightly_fixture.data()), data, "{version}");
        operations::confirm(&nightly_fixture.root).unwrap();
        fs::write(
            nightly_fixture.data().join(format!("{version}.bin")),
            version,
        )
        .unwrap();
        data = index(&nightly_fixture.data());
    }
    assert_eq!(beta_state(), beta_before, "nightly chain");
    assert_eq!(channel_of(&nightly_fixture), "nightly");
    assert_eq!(channel_of(&beta_fixture), "beta");
}
