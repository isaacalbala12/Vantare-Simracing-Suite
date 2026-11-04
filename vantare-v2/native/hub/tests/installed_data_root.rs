#![cfg(windows)]

use std::{fs, path::PathBuf, process::Command};

fn qa_root() -> PathBuf {
    let base = if std::env::var_os("CI").is_some() {
        PathBuf::from(std::env::var_os("RUNNER_TEMP").expect("RUNNER_TEMP"))
    } else {
        PathBuf::from("D:/VantareServer/qa/isa-1840")
    };
    assert!(base.is_absolute());
    base.join(format!("hub-step10-{}", std::process::id()))
}

fn run(executable: &std::path::Path, data: Option<&std::path::Path>) -> String {
    let mut command = Command::new(executable);
    command
        .arg("--invalid-step10-test")
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .env("LOCALAPPDATA", qa_root().join("localappdata"));
    if let Some(data) = data {
        command.env("VANTARE_NATIVE_DATA_ROOT", data);
    }
    let output = command.output().expect("Hub subprocess");
    assert!(!output.status.success());
    String::from_utf8_lossy(&output.stderr).into_owned()
}

fn entries(root: &std::path::Path) -> Vec<PathBuf> {
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

#[test]
fn installed_hub_requires_its_own_data_before_any_write() {
    let qa = qa_root();
    let generation = qa.join("root/generations/0123456789abcdef0123456789abcdef");
    let bin = generation.join("bin");
    let data = generation.join("data");
    fs::create_dir_all(&bin).expect("QA bin");
    fs::create_dir_all(&data).expect("QA data");
    fs::create_dir_all(qa.join("other")).expect("QA other data");
    let installed = bin.join("vantare-hub.exe");
    fs::copy(env!("CARGO_BIN_EXE_vantare-hub"), &installed).expect("QA Hub");
    let before = entries(&qa);
    assert!(!qa.join("localappdata").exists());

    for supplied in [None, Some(qa.join("other"))] {
        let error = run(&installed, supplied.as_deref());
        assert!(
            error.contains("abre Vantare desde su acceso directo"),
            "{error}"
        );
        assert_eq!(entries(&qa), before);
        assert!(!qa.join("localappdata").exists());
    }
    let version = Command::new(&installed)
        .arg("--version")
        .env_remove("VANTARE_NATIVE_DATA_ROOT")
        .output()
        .expect("installed version guard");
    assert!(version.stdout.is_empty());
    assert!(
        String::from_utf8_lossy(&version.stderr).contains("abre Vantare desde su acceso directo")
    );
    assert_eq!(entries(&qa), before);
    let allowed = run(&installed, Some(&data));
    assert!(allowed.contains("uso: vantare-hub"), "{allowed}");
    assert!(!allowed.contains("abre Vantare desde su acceso directo"));
    let version_ok = Command::new(&installed)
        .arg("--version")
        .env("VANTARE_NATIVE_DATA_ROOT", &data)
        .output()
        .expect("installed version");
    assert!(version_ok.status.success());
    assert!(!version_ok.stdout.is_empty());

    let development = qa.join("vantare-hub.exe");
    fs::copy(env!("CARGO_BIN_EXE_vantare-hub"), &development).expect("QA dev Hub");
    let fallback = run(&development, None);
    assert!(fallback.contains("uso: vantare-hub"), "{fallback}");
    let expected = qa.join("localappdata/VantareNative/hub");
    let resolved = vantare_ipc::paths::Root::resolve_fixture("windows", |key| {
        (key == "LOCALAPPDATA").then(|| qa.join("localappdata").into_os_string())
    })
    .expect("development fallback");
    assert_eq!(resolved.hub(), expected);
}
