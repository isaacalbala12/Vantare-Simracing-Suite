//! ADR 0107: the default overlay build resolves one published GPUI core.
use std::process::Command;

#[test]
fn workspace_default_graph_uses_one_published_gpui() {
    let output = Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "--locked",
            "--workspace",
            "--edges",
            "normal",
            "--prefix",
            "none",
        ])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo tree must run");
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let tree = String::from_utf8_lossy(&output.stdout);
    let core_versions: std::collections::BTreeSet<_> = tree
        .lines()
        .filter(|line| line.starts_with("gpui-pre v"))
        .filter_map(|line| line.split_whitespace().nth(1))
        .collect();
    assert_eq!(core_versions.len(), 1, "one published GPUI core: {tree}");
    assert!(
        !tree
            .lines()
            .any(|line| line.starts_with("gpui v") || line.starts_with("gpui-fast v")),
        "default must not compile a second core: {tree}"
    );
    assert!(
        !tree.contains("https://github.com/zed-industries/zed"),
        "default must not use Zed git: {tree}"
    );
}
