fn dependency_tree() -> String {
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
    String::from_utf8(output.stdout).expect("UTF-8 Cargo tree")
}
#[test]
fn host_has_no_gpui_dependency() {
    for line in dependency_tree().lines() {
        let name = line.split_whitespace().next().unwrap_or_default();
        assert!(
            !name.starts_with("gpui") && name != "vantare-ui",
            "host must not compile/link {name}"
        );
    }
}
#[test]
fn host_has_no_http_dependency() {
    for line in dependency_tree().lines() {
        let name = line.split_whitespace().next().unwrap_or_default();
        assert_ne!(name, "ureq", "host must not compile/link an HTTP client");
    }
}
