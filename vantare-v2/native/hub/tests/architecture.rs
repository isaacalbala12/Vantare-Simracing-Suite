use std::process::Command;

#[test]
fn hub_reuses_ui_without_acquiring_runtime_or_services() {
    let output = Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "-p",
            "vantare-hub",
            "--prefix",
            "none",
            "--edges",
            "normal",
        ])
        .output()
        .expect("cargo tree");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let tree = String::from_utf8_lossy(&output.stdout);
    assert!(tree.lines().any(|line| line.starts_with("vantare-ui ")));
    assert!(
        !tree
            .lines()
            .any(|line| line.starts_with("vantare-runtime "))
    );
}

#[test]
fn every_current_hub_section_has_an_honest_entry_point() {
    use vantare_hub::Section;
    assert_eq!(Section::ALL.len(), 14);
    for (index, section) in Section::ALL.iter().enumerate() {
        assert!(!section.label().is_empty());
        assert!(!section.subtitle().is_empty());
        assert!(!Section::ALL[..index].contains(section));
    }
}

#[test]
fn invalid_cli_arguments_fail_before_opening_a_window() {
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .arg("--unknown")
        .output()
        .expect("arrancar proceso Hub");
    assert_eq!(output.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&output.stderr).contains("uso:"));
}

#[test]
fn a_missing_scene_fails_without_creating_or_overwriting_user_data() {
    let path = std::env::temp_dir().join(format!("vantare-hub-preflight-{}", std::process::id()));
    assert!(!path.exists());
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .args(["--workshop", "--data-dir"])
        .arg(&path)
        .arg("--layout")
        .arg(path.join("layout.json"))
        .args(["--scene", "missing.snapshot.json"])
        .output()
        .expect("arrancar Hub");
    assert_eq!(output.status.code(), Some(1));
    assert!(!path.exists());
}

#[test]
fn corrupt_common_layout_fails_before_window_without_replacing_it() {
    let path = std::env::temp_dir().join(format!(
        "vantare-hub-layout-preflight-{}",
        std::process::id()
    ));
    std::fs::create_dir(&path).expect("temporal exclusivo");
    let layout = path.join("layout.json");
    std::fs::write(&layout, b"{").expect("layout inválido");
    let output = Command::new(env!("CARGO_BIN_EXE_vantare-hub"))
        .args(["--studio", "--data-dir"])
        .arg(&path)
        .arg("--layout")
        .arg(&layout)
        .output()
        .expect("arrancar Hub");
    assert_eq!(output.status.code(), Some(1));
    assert_eq!(std::fs::read(&layout).expect("documento preservado"), b"{");
    assert!(!path.join("workshop-selection.json").exists());
    std::fs::remove_file(layout).expect("limpiar archivo propio");
    std::fs::remove_dir(path).expect("limpiar directorio propio");
}
