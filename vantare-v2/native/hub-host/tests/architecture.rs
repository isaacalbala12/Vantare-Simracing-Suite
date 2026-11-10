#[test]
fn host_has_no_gpui_dependency() {
    let output = std::process::Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "--locked",
            "--package",
            "vantare-hub-host",
            "--all-features",
            "--edges",
            "normal",
            "--prefix",
            "none",
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("Cargo metadata");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let name = line.split_whitespace().next().unwrap_or_default();
        assert!(
            !name.starts_with("gpui") && name != "vantare-ui",
            "host must not compile/link {name}"
        );
    }
}
