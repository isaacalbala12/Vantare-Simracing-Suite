#![cfg(windows)]
use serde_json::json;
use sha2::{Digest, Sha256};
use std::os::windows::{fs::OpenOptionsExt, io::AsRawHandle, process::CommandExt};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicBool, Ordering},
};
use vantare_installer::{
    engine::{
        self, Installation,
        context::qa_path,
        operations::{self, Control},
        write_fs as disk,
    },
    model::Mode,
};
const CANDIDATE: &[u8] = include_bytes!("../../packaging/candidate.ps1");

struct Fixture {
    path: PathBuf,
    root: PathBuf,
}
struct Package {
    path: PathBuf,
    sha: String,
    version: String,
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
impl Package {
    fn borrowed(&self) -> operations::Package<'_> {
        operations::Package {
            archive: &self.path,
            sha256: &self.sha,
            version: &self.version,
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
        let executable = fs::read(
            PathBuf::from(std::env::var_os("WINDIR").expect("Windows root"))
                .join("System32/cmd.exe"),
        )
        .expect("inert PE fixture");
        let executable_hash = format!("{:x}", Sha256::digest(&executable));
        let mut entries = Vec::new();
        for name in test_members() {
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
            } else if name == "candidate.ps1" {
                CANDIDATE.to_vec()
            } else {
                b"fixture".to_vec()
            };
            entries.push((name.clone(), bytes));
        }
        if let Some((name, bytes)) = extra {
            entries.push((name.to_owned(), bytes.to_vec()));
        }
        let files: Vec<_> = entries.iter().map(|(name, bytes)| json!({"path":name,"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})).collect();
        let manifest = json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","data_schema":"opaque-v1","source_sha":"0".repeat(40),"source_dirty":false,"build_profile":"Debug","version":version,"channel":"beta","engine":engine,"files":files});
        entries.push((
            "manifest.json".into(),
            serde_json::to_vec(&manifest).expect("manifest"),
        ));
        let path = self.path.join(format!("package-{version}.zip"));
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
    assert_eq!(
        operations::rollback(&fixture.root).unwrap(),
        operations::BootRecovery::Restored
    );
    assert_eq!(fixture.active(), old);
    assert!(!marker.exists());
    fixture
        .install(&fixture.package("1.0.2"), Mode::Auto, false, false)
        .unwrap();
    operations::confirm(&fixture.root).unwrap();
    assert!(!marker.exists());
    assert!(operations::confirm(&fixture.root).is_err());
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
#[allow(unsafe_code)] // Wait only on the owned Child handle, never a PID lookup.
fn powershell_feed_and_rust_writer_exchange_the_same_state_format() {
    let fixture = Fixture::new();
    fixture
        .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
        .expect("Rust install");
    fixture.write_data();
    let before = disk::data_index(&fixture.data()).expect("data before");
    let incoming = fixture.package("1.0.1");
    let source = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packaging");
    let script = fixture.path.join("feed.ps1");
    fs::write(&script,br"param($Root,$Archive,$Sha,$Source,$Hive,$ShellRoot)
$ErrorActionPreference='Stop'
. (Join-Path $Source 'matrix/guard.ps1')
foreach($path in @($Root,$Archive,$ShellRoot)){$null=Assert-MatrixRoot $path}
if($Hive -cnotmatch '^HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\[a-f0-9]{32}$'){throw 'TEST_HIVE_REJECTED'}
$key='Registry::'+$Hive
New-Item -Path $key -Force|Out-Null
Remove-PSDrive HKCU
New-PSDrive HKCU Registry $Hive -Scope Global|Out-Null
try{
    . (Join-Path $Source 'candidate.ps1') -Library -Root $Root -Channel beta
    function Get-NativeShortcutFolder([string]$Name){Join-Path $ShellRoot $Name}
    $before=Read-NativeState $Root
    if($before.schema -ne 1){throw 'RUST_STATE_UNREADABLE'}
    $null=Update-NativeCandidate $Root $Archive $Sha
}finally{
    Remove-PSDrive HKCU
    New-PSDrive HKCU Registry HKEY_CURRENT_USER -Scope Global|Out-Null
    Remove-Item -LiteralPath $key -Recurse -Force
}
").expect("guarded feed fixture");
    let temp = fixture.path.join("temp");
    fs::create_dir(&temp).expect("isolated temp");
    let host = PathBuf::from(std::env::var_os("WINDIR").expect("Windows root"))
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut owned = OwnedChild(
        Command::new(host)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
            .arg(script)
            .arg("-Root")
            .arg(&fixture.root)
            .arg("-Archive")
            .arg(&incoming.path)
            .arg("-Sha")
            .arg(&incoming.sha)
            .arg("-Source")
            .arg(source)
            .arg("-Hive")
            .arg(format!(
                "HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\{}",
                disk::id().expect("hive ID")
            ))
            .arg("-ShellRoot")
            .arg(fixture.path.join("shell"))
            .env("TEMP", &temp)
            .env("TMP", &temp)
            .env("LOCALAPPDATA", fixture.path.join("LocalAppData"))
            .creation_flags(0x0800_0000)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("owned feed child"),
    );
    let waited = unsafe {
        windows::Win32::System::Threading::WaitForSingleObject(
            windows::Win32::Foundation::HANDLE(owned.0.as_raw_handle()),
            30000,
        )
    };
    assert_eq!(
        waited,
        windows::Win32::Foundation::WAIT_OBJECT_0,
        "finite feed deadline"
    );
    let status = owned.0.wait().expect("reap feed child");
    let mut stderr = String::new();
    std::io::Read::read_to_string(&mut owned.0.stderr.take().expect("stderr"), &mut stderr)
        .expect("feed diagnostics");
    assert!(status.success(), "{stderr}");
    assert_eq!(
        verified(&fixture.root)
            .expect("Rust reads PS state")
            .installed_version(),
        Some("1.0.1")
    );
    fixture
        .install(&fixture.package("1.0.2"), Mode::Auto, false, false)
        .expect("Rust advances PS generation");
    assert_eq!(
        disk::data_index(&fixture.data()).expect("data after roundtrip"),
        before
    );
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
        let error = operations::uninstall(&fixture.root, &mut control, |_| {
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
    assert!(operations::uninstall(&fixture.root, &mut control, |_| Ok(())).is_err());
    assert!(fixture.root.join("state.json").is_file());
    let mut control = Control {
        cancel: &cancel,
        progress: &mut |_| {},
        checkpoint: &mut |_| Ok(()),
        warning: &mut |_| {},
    };
    operations::uninstall(&fixture.root, &mut control, |_| Ok(())).expect("resume");
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
                for _ in 0..3 {
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

#[test]
fn abrupt_process_exit_on_both_sides_of_commit_never_leaves_torn_state() {
    let executable = std::env::current_exe().expect("owned libtest child");
    for point in ["before-commit", "after-commit"] {
        let fixture = Fixture::new();
        fixture
            .install(&fixture.package("1.0.0"), Mode::Auto, false, false)
            .expect("initial install");
        fixture.write_data();
        let old = fs::read(fixture.root.join("state.json")).expect("old state bytes");
        let package = fixture.package("1.0.1");
        let payload_directory = fixture.path.join("engine");
        fs::create_dir(&payload_directory).expect("payload dir");
        fs::copy(&package.path, payload_directory.join("package.zip")).expect("package fixture");
        let temp = fixture.path.join("temp");
        fs::create_dir(&temp).expect("isolated temp");
        let input = fixture.path.join("request.json");
        fs::write(&input,serde_json::to_vec(&json!({"root":fixture.root,"archive":package.path,"sha256":package.sha,"version":package.version,"stopAt":point})).expect("guarded request")).expect("request file");
        let output = Command::new(&executable)
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
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let view = verified(&fixture.root).expect("fully valid state after abrupt exit");
        assert_eq!(
            view.installed_version(),
            Some(if point == "before-commit" {
                "1.0.0"
            } else {
                "1.0.1"
            })
        );
        if point == "before-commit" {
            assert_eq!(
                fs::read(fixture.root.join("state.json")).expect("old bytes untouched"),
                old
            );
        }
        assert_eq!(
            fs::read(fixture.data().join("opaque.bin")).expect("data ready before activation"),
            b"opaque\0user\xffbytes"
        );
    }
}

// Deliberately not a standalone gate: the parent test runs this helper twice
// with an owned process and asserts its abrupt exit and committed disk bytes.
#[test]
#[ignore = "subprocess fixture for abrupt_process_exit_on_both_sides_of_commit"]
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
    assert!(["before-commit", "after-commit"].contains(&point));
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
    };
    operations::update(&root, &package, false, &mut control).expect("update reaches checkpoint");
    panic!("requested checkpoint was not reached");
}

// Captured package metadata from the guarded p5a campaign; this fixture is
// not a production allowlist. Keeping the real inventory also exercises the
// still-live PS feed with its current package, until that consumer moves in p6.
fn test_members() -> Vec<String> {
    let manifest: serde_json::Value =
        serde_json::from_slice(include_bytes!("../fixtures/manifest-full.json"))
            .expect("full QA manifest");
    manifest["files"]
        .as_array()
        .expect("manifest files")
        .iter()
        .map(|file| file["path"].as_str().expect("manifest path").to_owned())
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
    operations::uninstall(&fixture.root, &mut control, |_| Ok(())).unwrap();
    assert!(!fixture.root.join("state.json").exists());
    assert_eq!(fs::read(&executable).unwrap(), b"unreferenced own bytes");
    assert!(orphan.join("manifest.json").is_file());
    assert!(orphan.join("data/empty").is_dir());
    assert_eq!(
        fs::read(active.join("bin/foreign.dll")).unwrap(),
        b"foreign bytes"
    );
    assert_eq!(disk::data_index(&active.join("data")).unwrap(), before);
    assert!(
        diagnostics
            .iter()
            .any(|message| message.contains(&orphan.display().to_string())
                && message.contains("sin referencia SHA")
                && message.contains("paso 8"))
    );
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
    assert!(!warnings.is_empty());
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
    operations::uninstall(&fixture.root, &mut control, |_| Ok(())).unwrap();
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
