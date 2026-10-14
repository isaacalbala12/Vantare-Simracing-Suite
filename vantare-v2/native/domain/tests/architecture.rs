//! Dirección de dependencias de ADR 0099 §6: `runtime → domain, ipc`,
//! `ipc → domain`, `ui → domain, ipc`. Comprueba el grafo completo (también
//! transitivo) con `cargo tree`, así que un simulador o `runtime` no puede
//! colarse en `domain` ni en `ui` por una dependencia intermedia.

use std::process::Command;

const FORBIDDEN: &[(&str, &[&str])] = &[
    ("vantare-ipc", &["vantare-runtime", "vantare-ui"]),
    ("vantare-ui", &["vantare-runtime"]),
    ("vantare-runtime", &["vantare-ui"]),
];

fn workspace_packages() -> Vec<String> {
    let output = Command::new(env!("CARGO"))
        .args([
            "tree",
            "--offline",
            "--workspace",
            "--depth",
            "0",
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
    let packages = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.split_whitespace().next().map(str::to_owned))
        .collect::<Vec<_>>();
    assert!(
        packages.iter().any(|package| package == "vantare-domain"),
        "workspace domain root"
    );
    packages
}

#[test]
fn dependencies_follow_the_architecture() {
    let workspace = workspace_packages();
    let domain_forbidden = workspace
        .iter()
        .map(String::as_str)
        .filter(|name| *name != "vantare-domain")
        .collect::<Vec<_>>();
    assert!(
        !domain_forbidden.is_empty(),
        "workspace members must be discovered"
    );
    for (package, forbidden) in std::iter::once(("vantare-domain", domain_forbidden.as_slice()))
        .chain(FORBIDDEN.iter().copied())
    {
        let output = Command::new(env!("CARGO"))
            .args([
                "tree",
                "--offline",
                "--package",
                package,
                "--edges",
                "all",
                "--prefix",
                "none",
            ])
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .output()
            .expect("cargo tree must run");
        assert!(
            output.status.success(),
            "cargo tree -p {package}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let tree = String::from_utf8_lossy(&output.stdout);
        for line in tree.lines() {
            let name = line.split_whitespace().next().unwrap_or_default();
            assert!(
                !forbidden.contains(&name),
                "{package} no puede depender de {name}"
            );
        }
    }
}
