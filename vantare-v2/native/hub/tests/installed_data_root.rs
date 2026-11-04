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

fn run(exe: &Path, data: Option<&Path>, qa: &Path) -> Output {
    let mut command = Command::new(exe);
    command
        .arg("--version")
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .env("LOCALAPPDATA", qa.join("localappdata"))
        .env("APPDATA", qa.join("appdata"))
        .env("TEMP", qa.join("temp"))
        .env("TMP", qa.join("temp"))
        .env("VANTARE_STEP10_LAUNCH_PROBE", qa.join("launcher-started"));
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
fn installed_hub_redirects_to_root_and_keeps_qa_clean() {
    if let Some(marker) = std::env::var_os("VANTARE_STEP10_LAUNCH_PROBE") {
        let marker = PathBuf::from(marker);
        vantare_installer::engine::context::qa_path(&marker).expect("QA probe guard");
        fs::write(marker, b"started").expect("launcher probe");
        return;
    }
    let qa = qa_root();
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
    fs::copy(
        std::env::current_exe().expect("test executable"),
        root.join("Vantare.exe"),
    )
    .expect("QA launcher probe");
    let marker = qa.join("launcher-started");
    let before = entries(&qa);

    for (exe, supplied) in [(&hub, None), (&hub, Some(qa.join("other")))] {
        let result = run(exe, supplied.as_deref(), &qa);
        assert!(result.status.success());
        wait_for(&marker);
        fs::remove_file(&marker).expect("reset launcher probe");
        assert_eq!(entries(&qa), before, "Hub wrote before redirect");
        assert!(!root.join("hub-ready").exists());
    }
    let uppercase_bin = root.join("generations/ABCDEF0123456789ABCDEF0123456789/bin");
    fs::create_dir_all(
        uppercase_bin
            .parent()
            .expect("uppercase generation")
            .join("data"),
    )
    .expect("uppercase QA data");
    fs::create_dir_all(&uppercase_bin).expect("uppercase QA bin");
    let uppercase_exe = uppercase_bin.join("VANTARE-HUB.EXE");
    fs::copy(env!("CARGO_BIN_EXE_vantare-hub"), &uppercase_exe).expect("uppercase QA Hub");
    let before = entries(&qa);
    assert!(run(&uppercase_exe, None, &qa).status.success());
    wait_for(&marker);
    fs::remove_file(&marker).expect("reset launcher probe");
    assert_eq!(entries(&qa), before);

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
        let result = run(&hub, Some(&variant), &qa);
        assert!(result.status.success(), "{variant:?}: {result:?}");
        assert!(!result.stdout.is_empty());
        assert!(!marker.exists(), "correct root relaunched Vantare");
    }

    fs::remove_file(root.join("Vantare.exe")).expect("remove QA launcher");
    assert!(!run(&hub, None, &qa).status.success());
    let log_path = data.join("hub-startup.log");
    let log = fs::read_to_string(&log_path).expect("generation data log");
    assert!(log.contains("abre Vantare desde su acceso directo"));
    fs::copy(
        std::env::current_exe().expect("test executable"),
        root.join("Vantare.exe"),
    )
    .expect("restore QA launcher probe");
    fs::remove_file(log_path).expect("remove QA log");
    fs::remove_dir(&data).expect("remove QA data root");
    assert!(run(&hub, None, &qa).status.success());
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
    for _ in 0..30 {
        if fs::remove_dir_all(&qa).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    fs::remove_dir_all(&qa).expect("clean QA fixture");
}
