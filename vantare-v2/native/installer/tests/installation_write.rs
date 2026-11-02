#![cfg(windows)]
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{fs, io::{BufRead, BufReader, Write}, path::{Path, PathBuf}, process::{Command, Stdio}, sync::atomic::{AtomicBool, Ordering}};
use vantare_installer::{engine::{self, Installation, ReadProfile, context::qa_path, operations::{self, Control}, write_fs as disk}, model::Mode, payload};

struct Fixture { path: PathBuf, root: PathBuf }
struct Package { path: PathBuf, sha: String, version: String }
struct OwnedChild(std::process::Child);
impl Drop for OwnedChild {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() { let _ = self.0.kill(); }
        let _ = self.0.wait();
    }
}
impl Package {
    fn borrowed(&self) -> operations::Package<'_> {
        operations::Package { archive: &self.path, sha256: &self.sha, version: &self.version, candidate: payload::CANDIDATE, beta: payload::BETA }
    }
}
impl Fixture {
    fn new() -> Self {
        let parent = if std::env::var("CI").as_deref() == Ok("true") {
            PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("CI isolated root"))
        } else { PathBuf::from("D:/VantareServer/qa/isa-1840") };
        let path = parent.join("p4-rust-tests").join(disk::id().expect("unique ID"));
        qa_path(&path).expect("QA guard");
        fs::create_dir_all(&path).expect("fixture root");
        Self { root: path.join("instalación con espacios"), path }
    }
    fn package(&self, version: &str) -> Package {
        let executable = fs::read(PathBuf::from(std::env::var_os("WINDIR").expect("Windows root")).join("System32/cmd.exe")).expect("inert PE fixture");
        let executable_hash = format!("{:x}", Sha256::digest(&executable));
        let mut entries = Vec::new();
        for name in engine::current_members("beta") {
            let bytes = if name.ends_with(".exe") { executable.clone() }
            else if let Some(exe) = name.strip_suffix(".sha256") {
                format!("{executable_hash}  {}\n", Path::new(exe).file_name().expect("PE basename").to_string_lossy()).into_bytes()
            } else if name == "candidate.ps1" { payload::CANDIDATE.to_vec() }
            else { b"fixture".to_vec() };
            entries.push((name.to_owned(), bytes));
        }
        let files: Vec<_> = entries.iter().map(|(name, bytes)| json!({"path":name,"size":bytes.len(),"sha256":format!("{:x}",Sha256::digest(bytes))})).collect();
        let manifest = json!({"schema":1,"product":"vantare-native","candidate":true,"architecture":"windows-x64","data_schema":"opaque-v1","source_sha":"0".repeat(40),"source_dirty":false,"build_profile":"Debug","version":version,"channel":"beta","files":files});
        entries.push(("manifest.json".into(), serde_json::to_vec(&manifest).expect("manifest")));
        let path = self.path.join(format!("package-{version}.zip"));
        let mut writer = zip::ZipWriter::new(fs::File::create(&path).expect("archive"));
        for (name, bytes) in entries {
            writer.start_file(name, zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored)).expect("ZIP member");
            writer.write_all(&bytes).expect("ZIP bytes");
        }
        writer.finish().expect("ZIP finish");
        let sha = format!("{:x}", Sha256::digest(fs::read(&path).expect("archive bytes")));
        Package { path, sha, version: version.into() }
    }
    fn install(&self, package: &Package, mode: Mode, fail_finalize: bool, cancel_at_copy: bool) -> disk::Result<()> {
        let cancel = AtomicBool::new(false);
        let mut progress = |event: vantare_installer::model::Progress| {
            if cancel_at_copy && event.step == "copy" { cancel.store(true, Ordering::Release); }
        };
        let mut checkpoint = |_: &str| Ok(());
        let mut warning = |message: &str| eprintln!("{message}");
        let mut control = Control { cancel: &cancel, progress: &mut progress, checkpoint: &mut checkpoint, warning: &mut warning };
        operations::install(&self.root, &package.borrowed(), mode, &mut control,
            |_| if fail_finalize { Err(engine::WriteError::new(1, "injected finalizer failure")) } else { Ok(()) }, || Ok(()))
    }
    fn active(&self) -> PathBuf {
        let state = Installation::read(&self.root, ReadProfile::Verified).expect("verified installation").state.expect("state");
        self.root.join("generations").join(state.active.generation)
    }
    fn data(&self) -> PathBuf { self.active().join("data") }
    fn write_data(&self) {
        let data = self.data();
        fs::create_dir_all(data.join("empty/child")).expect("empty user folders");
        fs::write(data.join("opaque.bin"), b"opaque\0user\xffbytes").expect("user bytes");
    }
}

#[test]
fn update_copies_exact_opaque_data_and_preserves_both_old_generations() {
    let fixture = Fixture::new();
    fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, false).expect("install");
    fixture.write_data();
    let original = fixture.active();
    let before = disk::data_index(&original.join("data")).expect("source data");
    fixture.install(&fixture.package("1.0.1"), Mode::Auto, false, false).expect("update");
    let view = Installation::read(&fixture.root, ReadProfile::Verified).expect("verified update");
    assert_eq!(view.installed_version(), Some("1.0.1"));
    assert_eq!(disk::data_index(&fixture.data()).expect("new data"), before);
    assert_eq!(disk::data_index(&original.join("data")).expect("old data"), before);
    assert_eq!(fs::metadata(fixture.data().join("opaque.bin")).expect("new metadata").modified().expect("new mtime"), fs::metadata(original.join("data/opaque.bin")).expect("old metadata").modified().expect("old mtime"));
    assert_eq!(view.state.expect("state").previous.expect("previous").generation, original.file_name().expect("generation").to_string_lossy());
    assert!(fixture.root.join("boot-pending.json").is_file());
}

#[test]
fn failed_shell_finalization_restores_exact_state_and_metadata_bytes() {
    let fixture = Fixture::new();
    fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, false).expect("install");
    fixture.write_data();
    let state = fs::read(fixture.root.join("state.json")).expect("state bytes");
    let data = disk::data_index(&fixture.data()).expect("data before");
    let result = fixture.install(&fixture.package("1.0.1"), Mode::Auto, true, false);
    assert!(result.is_err());
    assert_eq!(fs::read(fixture.root.join("state.json")).expect("restored bytes"), state);
    assert_eq!(disk::data_index(&fixture.data()).expect("restored data"), data);
    assert_eq!(fs::read_dir(fixture.root.join("generations")).expect("generations").count(), 1);
    assert!(!fixture.root.join("boot-pending.json").exists());
    assert!(!fixture.root.join("update-status.json").exists());
}

#[test]
fn cancel_at_the_last_copy_checkpoint_never_activates_a_generation() {
    let fixture = Fixture::new();
    let result = fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, true).expect_err("cancelled");
    assert_eq!(result.code, 5);
    assert!(!fixture.root.join("state.json").exists());
    assert!(!fixture.root.join("generations").exists());
}

#[test]
fn external_hash_failure_cannot_change_existing_state_or_data() {
    let fixture=Fixture::new();
    fixture.install(&fixture.package("1.0.0"),Mode::Auto,false,false).expect("install");
    fixture.write_data();
    let before=fs::read(fixture.root.join("state.json")).expect("old state");
    let mut incoming=fixture.package("1.0.1");incoming.sha="0".repeat(64);
    assert!(fixture.install(&incoming,Mode::Auto,false,false).is_err());
    assert_eq!(fs::read(fixture.root.join("state.json")).expect("state unchanged"),before);
    assert_eq!(fs::read(fixture.data().join("opaque.bin")).expect("data unchanged"),b"opaque\0user\xffbytes");
}

#[test]
fn uninstall_probe_uses_manifest_or_a_neutral_absence_never_a_retained_version() {
    let fixture=Fixture::new();
    fixture.install(&fixture.package("1.0.0"),Mode::Auto,false,false).expect("install");
    let context=engine::context::Context::isolated(fixture.path.join("LocalAppData"),format!("Software\\VantareInstallerMatrix\\{}",disk::id().expect("hive ID")),fixture.path.join("shell")).expect("isolated context");
    let request=engine::Request::new(&vantare_installer::args::Args {root:Some(fixture.root.clone()),uninstall:true,..Default::default()},"Probe");
    assert_eq!(context.probe(&request).expect("complete uninstall probe").installed_version.as_deref(),Some("1.0.0"));
    fs::remove_file(fixture.active().join("manifest.json")).expect("simulate already removed manifest");
    fs::write(fixture.root.join("retained-data.json"),serde_json::to_vec(&json!({"schema":1,"generation":"a".repeat(32),"version":"9.9.9"})).expect("retained JSON")).expect("untrusted display fixture");
    assert_eq!(context.probe(&request).expect("partial uninstall stays usable").installed_version,None);
}

#[test]
fn qa_context_cannot_fall_back_to_product_registry_or_escape_its_folders() {
    let fixture=Fixture::new();
    for bad in ["C:/Users/matrix/Programs/Vantare","D:/VantareServer/qa/../installed","D:/VantareServer/qa-other/install"] {
        assert!(qa_path(Path::new(bad)).is_err());
    }
    assert!(disk::path(&fixture.path.join(".env-never-read/file")).is_err());
    assert!(engine::context::Context::isolated(fixture.path.join("LocalAppData"),"Software\\Microsoft\\Windows\\CurrentVersion".into(),fixture.path.join("shell")).is_err());
    assert!(engine::context::Context::isolated(fixture.path.join("LocalAppData"),format!("Software\\VantareInstallerMatrix\\{}",disk::id().expect("hive ID")),PathBuf::from("C:/Users/matrix/Desktop")).is_err());
}

#[test]
#[allow(unsafe_code)] // Wait only on the owned Child handle, never a PID lookup.
fn powershell_feed_and_rust_writer_exchange_the_same_state_format() {
    use std::os::windows::{io::AsRawHandle, process::CommandExt};
    let fixture=Fixture::new();
    fixture.install(&fixture.package("1.0.0"),Mode::Auto,false,false).expect("Rust install");
    fixture.write_data();
    let before=disk::data_index(&fixture.data()).expect("data before");
    let incoming=fixture.package("1.0.1");
    let source=PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packaging");
    let script=fixture.path.join("feed.ps1");
    fs::write(&script,br#"param($Root,$Archive,$Sha,$Source,$Hive,$ShellRoot)
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
"#).expect("guarded feed fixture");
    let temp=fixture.path.join("temp");fs::create_dir(&temp).expect("isolated temp");
    let host=PathBuf::from(std::env::var_os("WINDIR").expect("Windows root")).join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let mut owned=OwnedChild(Command::new(host).args(["-NoProfile","-ExecutionPolicy","Bypass","-File"]).arg(script)
        .arg("-Root").arg(&fixture.root).arg("-Archive").arg(&incoming.path).arg("-Sha").arg(&incoming.sha).arg("-Source").arg(source)
        .arg("-Hive").arg(format!("HKEY_CURRENT_USER\\Software\\VantareInstallerMatrix\\{}",disk::id().expect("hive ID")))
        .arg("-ShellRoot").arg(fixture.path.join("shell")).env("TEMP",&temp).env("TMP",&temp).env("LOCALAPPDATA",fixture.path.join("LocalAppData"))
        .creation_flags(0x0800_0000).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().expect("owned feed child"));
    let waited=unsafe {windows::Win32::System::Threading::WaitForSingleObject(windows::Win32::Foundation::HANDLE(owned.0.as_raw_handle()),30000)};
    assert_eq!(waited,windows::Win32::Foundation::WAIT_OBJECT_0,"finite feed deadline");
    let status=owned.0.wait().expect("reap feed child");
    let mut stderr=String::new();
    std::io::Read::read_to_string(&mut owned.0.stderr.take().expect("stderr"),&mut stderr).expect("feed diagnostics");
    assert!(status.success(),"{stderr}");
    assert_eq!(Installation::read(&fixture.root,ReadProfile::Verified).expect("Rust reads PS state").installed_version(),Some("1.0.1"));
    fixture.install(&fixture.package("1.0.2"),Mode::Auto,false,false).expect("Rust advances PS generation");
    assert_eq!(disk::data_index(&fixture.data()).expect("data after roundtrip"),before);
}

#[test]
fn repair_replaces_corrupt_active_without_referencing_it_for_rollback() {
    let fixture = Fixture::new();
    let package = fixture.package("1.0.0");
    fixture.install(&package, Mode::Auto, false, false).expect("install");
    fixture.write_data();
    let old = fixture.active();
    fs::write(old.join("bin/vantare.exe"), b"corrupt PE").expect("damage only QA binary");
    assert!(Installation::read(&fixture.root, ReadProfile::Verified).is_err());
    fixture.install(&package, Mode::Repair, false, false).expect("repair");
    let view = Installation::read(&fixture.root, ReadProfile::Verified).expect("repaired");
    assert_eq!(view.installed_version(), Some("1.0.0"));
    assert!(view.state.expect("state").previous.is_none());
    assert_eq!(fs::read(fixture.data().join("opaque.bin")).expect("new data"), fs::read(old.join("data/opaque.bin")).expect("old data"));
    assert_eq!(disk::read_json(&fixture.root.join("boot-pending.json"), None).expect("boot marker")["previous"], "");
}

#[test]
fn downgrade_and_pending_boot_rejections_leave_current_state_and_data_intact() {
    let fixture = Fixture::new();
    fixture.install(&fixture.package("1.0.1"), Mode::Auto, false, false).expect("install");
    fixture.write_data();
    let state = fs::read(fixture.root.join("state.json")).expect("state");
    assert_eq!(fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, false).expect_err("downgrade").code, 3);
    fs::write(fixture.root.join("boot-pending.json"), b"{}").expect("pending fixture");
    assert_eq!(fixture.install(&fixture.package("1.0.2"), Mode::Auto, false, false).expect_err("pending boot").code, 4);
    assert_eq!(fs::read(fixture.root.join("state.json")).expect("state unchanged"), state);
    assert_eq!(fs::read(fixture.data().join("opaque.bin")).expect("data intact"), b"opaque\0user\xffbytes");
}

#[test]
fn interrupted_uninstall_resumes_and_preserves_data_empty_folders_and_foreign_files() {
    let fixture = Fixture::new();
    fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, false).expect("install");
    fixture.write_data();
    let active = fixture.active();
    let data = disk::data_index(&active.join("data")).expect("data before");
    fs::write(active.join("bin/foreign.dll"), b"foreign bytes").expect("foreign file");
    let cancel = AtomicBool::new(false);
    let mut count = 0;
    let mut checkpoint = |point: &str| {
        if point == "uninstall-member" { count += 1; }
        if count == 3 { Err(engine::WriteError::new(1, "injected interruption")) } else { Ok(()) }
    };
    let mut control = Control { cancel: &cancel, progress: &mut |_| {}, checkpoint: &mut checkpoint, warning: &mut |_| {} };
    assert!(operations::uninstall(&fixture.root, &mut control, |_| Ok(())).is_err());
    assert!(fixture.root.join("state.json").is_file());
    let mut control = Control { cancel: &cancel, progress: &mut |_| {}, checkpoint: &mut |_| Ok(()), warning: &mut |_| {} };
    operations::uninstall(&fixture.root, &mut control, |_| Ok(())).expect("resume");
    assert!(!fixture.root.join("state.json").exists());
    assert_eq!(disk::data_index(&active.join("data")).expect("retained data"), data);
    assert_eq!(fs::read(active.join("bin/foreign.dll")).expect("foreign preserved"), b"foreign bytes");
    assert!(active.join("data/empty/child").is_dir());
    assert_eq!(disk::read_json(&fixture.root.join("retained-data.json"), None).expect("retained marker")["version"], "1.0.0");
}

#[test]
fn session_lock_and_running_image_block_mutation_without_killing_the_process() {
    let fixture = Fixture::new();
    let package = fixture.package("1.0.0");
    fixture.install(&package, Mode::Auto, false, false).expect("install");
    let lock = disk::lock(&fixture.root, "beta-session.lock").expect("held session");
    assert_eq!(fixture.install(&package, Mode::Auto, false, false).expect_err("locked").code, 2);
    drop(lock);
    use std::os::windows::process::CommandExt;
    let mut owned = OwnedChild(Command::new(fixture.active().join("bin/vantare.exe")).args(["/D", "/Q", "/C", "echo READY&set /p value="])
        .creation_flags(0x0800_0000).stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().expect("owned inert QA child"));
    let child = &mut owned.0;
    let mut ready = String::new();
    BufReader::new(child.stdout.take().expect("child stdout")).read_line(&mut ready).expect("explicit ready handshake");
    let result = fixture.install(&package, Mode::Auto, false, false);
    let alive = child.try_wait().expect("owned child status").is_none();
    child.stdin.as_mut().expect("owned stdin").write_all(b"continue\r\n").expect("release child");
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
        for (id, bytes) in [("a".repeat(32), b"first".as_slice()), ("b".repeat(32), if identical { b"first" } else { b"other" })] {
            let data = fixture.root.join("generations").join(id).join("data");
            fs::create_dir_all(data.join("empty")).expect("retained folders");
            fs::write(data.join("user.bin"), bytes).expect("retained bytes");
        }
        let result = fixture.install(&fixture.package("1.0.0"), Mode::Auto, false, false);
        assert_eq!(result.is_ok(), identical);
        if identical { assert_eq!(fs::read(fixture.data().join("user.bin")).expect("adopted data"), b"first"); }
        else { assert!(!fixture.root.join("state.json").exists()); }
        assert_eq!(fs::read(fixture.root.join("generations").join("b".repeat(32)).join("data/user.bin")).expect("old data preserved"), if identical { b"first" } else { b"other" });
    }
}

#[test]
fn zip_links_duplicates_traversal_and_uncompressed_limits_are_rejected_before_activation() {
    for fault in ["windows-link", "unix-link", "traversal", "duplicate", "member-limit", "total-limit"] {
        let fixture = Fixture::new();
        let mut package = fixture.package("1.0.0");
        let mut bytes = fs::read(&package.path).expect("ZIP bytes");
        let eocd = bytes.windows(4).rposition(|v| v == b"PK\x05\x06").expect("end of directory");
        let directory = usize::try_from(u32::from_le_bytes(bytes[eocd+16..eocd+20].try_into().expect("offset"))).expect("directory offset");
        match fault {
            "windows-link" => bytes[directory+38..directory+42].copy_from_slice(&0x400_u32.to_le_bytes()),
            "unix-link" => bytes[directory+38..directory+42].copy_from_slice(&0xa000_0000_u32.to_le_bytes()),
            "traversal" => bytes[directory+46..directory+49].copy_from_slice(b"../"),
            "member-limit" => bytes[directory+24..directory+28].copy_from_slice(&(256_u32*1024*1024+1).to_le_bytes()),
            "total-limit" => {
                let mut offset = directory;
                for _ in 0..3 {
                    bytes[offset+24..offset+28].copy_from_slice(&(250_u32*1024*1024).to_le_bytes());
                    let length: usize = [28,30,32].into_iter().map(|i| usize::from(u16::from_le_bytes([bytes[offset+i],bytes[offset+i+1]]))).sum();
                    offset += 46+length;
                }
            }
            "duplicate" => {
                let length: usize = [28,30,32].into_iter().map(|i| usize::from(u16::from_le_bytes([bytes[directory+i],bytes[directory+i+1]]))).sum();
                let record = bytes[directory..directory+46+length].to_vec();
                let size = u32::from_le_bytes(bytes[eocd+12..eocd+16].try_into().expect("directory size"));
                let count = u16::from_le_bytes(bytes[eocd+10..eocd+12].try_into().expect("count"))+1;
                bytes[eocd+8..eocd+10].copy_from_slice(&count.to_le_bytes());
                bytes[eocd+10..eocd+12].copy_from_slice(&count.to_le_bytes());
                bytes[eocd+12..eocd+16].copy_from_slice(&(size+u32::try_from(record.len()).expect("record size")).to_le_bytes());
                bytes.splice(eocd..eocd,record);
            }
            _ => unreachable!(),
        }
        fs::write(&package.path,&bytes).expect("isolated invalid ZIP");
        package.sha=format!("{:x}",Sha256::digest(&bytes));
        let sentinel=fixture.path.join("sentinel");fs::write(&sentinel,b"outside install").expect("sentinel");
        assert!(fixture.install(&package,Mode::Auto,false,false).is_err(),"{fault}");
        assert!(!fixture.root.join("state.json").exists(),"{fault}");
        assert_eq!(fs::read(sentinel).expect("untouched sentinel"),b"outside install");
    }
}

#[test]
fn abrupt_process_exit_on_both_sides_of_commit_never_leaves_torn_state() {
    let executable=std::env::current_exe().expect("owned libtest child");
    for point in ["before-commit","after-commit"] {
        let fixture=Fixture::new();
        fixture.install(&fixture.package("1.0.0"),Mode::Auto,false,false).expect("initial install");
        fixture.write_data();
        let old=fs::read(fixture.root.join("state.json")).expect("old state bytes");
        let package=fixture.package("1.0.1");
        let payload_directory=fixture.path.join("engine");fs::create_dir(&payload_directory).expect("payload dir");
        fs::copy(&package.path,payload_directory.join("package.zip")).expect("package fixture");
        let temp=fixture.path.join("temp");fs::create_dir(&temp).expect("isolated temp");
        let input=fixture.path.join("request.json");
        fs::write(&input,serde_json::to_vec(&json!({"root":fixture.root,"archive":package.path,"sha256":package.sha,"version":package.version,"stopAt":point})).expect("guarded request")).expect("request file");
        use std::os::windows::process::CommandExt;
        let output=Command::new(&executable).args(["--exact","checkpoint_process_worker","--ignored","--nocapture"])
            .env("VANTARE_P4_CRASH_REQUEST",input).env("TEMP",&temp).env("TMP",&temp).env("LOCALAPPDATA",fixture.path.join("LocalAppData"))
            .creation_flags(0x0800_0000).output().expect("owned crash fixture child");
        assert_eq!(output.status.code(),Some(90),"{}",String::from_utf8_lossy(&output.stderr));
        let view=Installation::read(&fixture.root,ReadProfile::Verified).expect("fully valid state after abrupt exit");
        assert_eq!(view.installed_version(),Some(if point=="before-commit"{"1.0.0"}else{"1.0.1"}));
        if point=="before-commit" {assert_eq!(fs::read(fixture.root.join("state.json")).expect("old bytes untouched"),old);}
        assert_eq!(fs::read(fixture.data().join("opaque.bin")).expect("data ready before activation"),b"opaque\0user\xffbytes");
    }
}

// Deliberately not a standalone gate: the parent test runs this helper twice
// with an owned process and asserts its abrupt exit and committed disk bytes.
#[test]
#[ignore = "subprocess fixture for abrupt_process_exit_on_both_sides_of_commit"]
fn checkpoint_process_worker() {
    let input=PathBuf::from(std::env::var_os("VANTARE_P4_CRASH_REQUEST").expect("explicit child request"));
    qa_path(&input).expect("guarded child input");
    let value=disk::read_json(&input,Some(65536)).expect("finite QA request");
    let root=PathBuf::from(value["root"].as_str().expect("root"));
    let archive=PathBuf::from(value["archive"].as_str().expect("archive"));
    qa_path(&root).expect("guarded root");qa_path(&archive).expect("guarded archive");
    let point=value["stopAt"].as_str().expect("checkpoint");
    assert!(["before-commit","after-commit"].contains(&point));
    let cancel=AtomicBool::new(false);
    let mut checkpoint=|actual: &str| {if actual==point {std::process::exit(90)};Ok(())};
    let mut control=Control {cancel:&cancel,progress:&mut |_|{},checkpoint:&mut checkpoint,warning:&mut |_|{}};
    let package=operations::Package {archive:&archive,sha256:value["sha256"].as_str().expect("sha"),version:value["version"].as_str().expect("version"),candidate:payload::CANDIDATE,beta:payload::BETA};
    operations::update(&root,&package,false,&mut control).expect("update reaches checkpoint");
    panic!("requested checkpoint was not reached");
}
