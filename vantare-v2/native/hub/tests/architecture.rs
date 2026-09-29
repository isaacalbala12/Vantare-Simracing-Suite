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
        assert!(!section.pending().is_empty());
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
