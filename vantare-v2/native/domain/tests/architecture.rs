//! Dirección de dependencias de ADR 0099 §6: `runtime → domain, ipc`,
//! `ipc → domain`, `ui → domain, ipc`. Comprueba el grafo completo (también
//! transitivo) con `cargo tree`, así que un simulador o `runtime` no puede
//! colarse en `domain` ni en `ui` por una dependencia intermedia.

use std::process::Command;

const FORBIDDEN: &[(&str, &[&str])] = &[
    (
        "vantare-domain",
        &["vantare-ipc", "vantare-runtime", "vantare-ui"],
    ),
    ("vantare-ipc", &["vantare-runtime", "vantare-ui"]),
    ("vantare-ui", &["vantare-runtime"]),
    ("vantare-runtime", &["vantare-ui"]),
];

#[test]
fn dependencies_follow_the_architecture() {
    for (package, forbidden) in FORBIDDEN {
        let output = Command::new(env!("CARGO"))
            .args([
                "tree",
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
