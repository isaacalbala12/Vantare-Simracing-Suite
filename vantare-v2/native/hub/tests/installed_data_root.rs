#![cfg(windows)]

use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Output},
    time::{Duration, Instant},
};

fn qa_root() -> PathBuf {
    let base = if std::env::var("CI").as_deref() == Ok("true") {
        PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("RUNNER_TEMP"))
    } else {
        PathBuf::from("D:/VantareServer/qa/isa-1840")
    };
    let root = base.join(format!("hub-step10-{}", std::process::id()));
    vantare_installer::engine::context::qa_path(&root).expect("QA guard");
    root
}

struct QaFixture(PathBuf);
impl Drop for QaFixture {
    fn drop(&mut self) {
        for _ in 0..30 {
            if fs::remove_dir_all(&self.0).is_ok() || !self.0.exists() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        assert!(
            std::thread::panicking(),
            "could not clean QA fixture: {}",
            self.0.display()
        );
    }
}

fn run(exe: &Path, data: Option<&Path>, qa: &Path, redirected: bool) -> Output {
    let mut command = Command::new(exe);
    command
        .arg("--version")
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .env("LOCALAPPDATA", qa.join("localappdata"))
        .env("APPDATA", qa.join("appdata"))
        .env("TEMP", qa.join("temp"))
        .env("TMP", qa.join("temp"))
        .env("VANTARE_BOOT_TOKEN", "0123456789abcdef0123456789abcdef")
        .env("VANTARE_BETA_ROOT", qa.join("other"))
        .env("VANTARE_APPEARANCE_FILE", qa.join("appearance.json"))
        .env("VANTARE_BACKGROUND_STARTUP", "1")
        .env("VANTARE_INTERACTIVE_STARTUP", "1")
        .env("VANTARE_STEP10_LAUNCH_PROBE", qa.join("launcher-started"));
    if redirected {
        command.env("VANTARE_HUB_REDIRECTED", "1");
    } else {
        command.env_remove("VANTARE_HUB_REDIRECTED");
    }
    if let Some(data) = data {
        command.env("VANTARE_NATIVE_DATA_ROOT", data);
    }
    command.output().expect("Hub subprocess")
}

fn entries(root: &Path) -> Vec<PathBuf> {
    let mut pending = vec![root.to_path_buf()];
    let mut found = Vec::new();
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(directory).expect("QA directory") {
            let entry = entry.expect("QA entry");
            if entry.file_type().expect("QA type").is_dir() {
                pending.push(entry.path());
            }
            found.push(entry.path());
        }
    }
    found.sort();
    found
}

fn wait_for(path: &Path) {
    let deadline = Instant::now() + Duration::from_secs(3);
    while !path.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(path.exists(), "root launcher was not started");
}

#[test]
#[allow(clippy::too_many_lines)] // Una raíz QA cubre redirección, equivalencias y logs.
fn installed_hub_redirects_to_root_and_keeps_qa_clean() {
    let qa = qa_root();
    let _cleanup = QaFixture(qa.clone());
    if qa.exists() {
        fs::remove_dir_all(&qa).expect("old QA fixture");
    }
    let root = qa.join("root");
    let generation = root.join("generations/0123456789abcdef0123456789abcdef");
    let bin = generation.join("bin");
    let data = generation.join("data");
    for dir in [&bin, &data, &qa.join("other"), &qa.join("temp")] {
        fs::create_dir_all(dir).expect("QA directory");
    }
    let hub = bin.join("vantare-hub.exe");
    fs::copy(env!("CARGO_BIN_EXE_vantare-hub"), &hub).expect("QA Hub");
    let verbatim_hub = PathBuf::from(format!(
        r"\\?\{}",
        hub.display().to_string().replace('/', "\\")
    ));
    let ordinary = vantare_hub::canonical_executable(&verbatim_hub).expect("canonical executable");
    assert!(!ordinary.to_string_lossy().starts_with(r"\\?\"));
    assert!(ordinary.is_absolute());
    fs::copy(
        env!("CARGO_BIN_EXE_root-launch-probe"),
        root.join("Vantare.exe"),
    )
    .expect("QA launcher probe");
    let marker = qa.join("launcher-started");
    let before = entries(&qa);

    for (exe, supplied) in [(&hub, None), (&hub, Some(qa.join("other")))] {
        let result = run(exe, supplied.as_deref(), &qa, false);
        assert!(result.status.success());
        wait_for(&marker);
        fs::remove_file(&marker).expect("reset launcher probe");
        assert_eq!(entries(&qa), before, "Hub wrote before redirect");
        assert!(!root.join("hub-ready").exists());
    }
    let uppercase_exe = PathBuf::from(hub.to_string_lossy().to_uppercase());
    let before = entries(&qa);
    assert!(run(&uppercase_exe, None, &qa, false).status.success());
    wait_for(&marker);
    fs::remove_file(&marker).expect("reset launcher probe");
    assert_eq!(entries(&qa), before);
    let short = Command::new("cmd")
        .args([
            "/C",
            &format!("for %I in (\"{}\") do @echo %~sI", hub.display()),
        ])
        .output()
        .expect("8.3 path probe");
    let short = PathBuf::from(String::from_utf8_lossy(&short.stdout).trim());
    if short.is_file() && short != hub {
        assert!(run(&short, None, &qa, false).status.success());
        wait_for(&marker);
        fs::remove_file(&marker).expect("reset launcher probe");
    }
    let junction = qa.join("generation-junction");
    let source = root.join("generations");
    let created = Command::new("cmd")
        .args([
            "/C",
            &format!(
                "mklink /J \"{}\" \"{}\"",
                junction.display(),
                source.display()
            ),
        ])
        .output()
        .expect("junction probe");
    if created.status.success() {
        let linked = junction.join("0123456789abcdef0123456789abcdef/bin/vantare-hub.exe");
        assert!(run(&linked, None, &qa, false).status.success());
        wait_for(&marker);
        fs::remove_file(&marker).expect("reset launcher probe");
        fs::remove_dir(&junction).expect("remove QA junction");
    }

    let variants = [
        data.clone(),
        PathBuf::from(data.to_string_lossy().to_uppercase()),
        PathBuf::from(format!("{}\\", data.display())),
        PathBuf::from(format!(
            r"\\?\{}",
            data.display().to_string().replace('/', "\\")
        )),
    ];
    for variant in variants {
        let result = run(&hub, Some(&variant), &qa, false);
        assert!(result.status.success(), "{variant:?}: {result:?}");
        assert!(!result.stdout.is_empty());
        assert!(!marker.exists(), "correct root relaunched Vantare");
    }

    assert!(!run(&hub, None, &qa, true).status.success());
    assert!(!marker.exists(), "second Hub launched the root again");
    assert!(
        fs::read_to_string(data.join("hub-startup.log"))
            .expect("redirect log")
            .contains("redirección repetida")
    );
    fs::remove_file(data.join("hub-startup.log")).expect("reset redirect log");
    fs::remove_file(root.join("Vantare.exe")).expect("remove QA launcher");
    assert!(!run(&hub, None, &qa, false).status.success());
    let log_path = data.join("hub-startup.log");
    let log = fs::read_to_string(&log_path).expect("generation data log");
    assert!(log.contains("abre Vantare desde su acceso directo"));
    fs::copy(
        env!("CARGO_BIN_EXE_root-launch-probe"),
        root.join("Vantare.exe"),
    )
    .expect("restore QA launcher probe");
    fs::remove_file(log_path).expect("remove QA log");
    fs::remove_dir(&data).expect("remove QA data root");
    assert!(run(&hub, None, &qa, false).status.success());
    wait_for(&marker);
    fs::remove_file(&marker).expect("reset launcher probe");
    let temp_log = fs::read_dir(qa.join("temp"))
        .expect("QA temp")
        .next()
        .expect("fallback error log")
        .expect("fallback entry")
        .path();
    assert!(
        fs::read_to_string(temp_log)
            .expect("data error log")
            .contains("raíz de datos:")
    );
}
