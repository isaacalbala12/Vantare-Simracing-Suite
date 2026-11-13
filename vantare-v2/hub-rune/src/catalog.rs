use serde_json::Value;
use std::sync::OnceLock;
pub fn catalog() -> &'static Value {
    static CATALOG: OnceLock<Value> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("catalog.json")).expect("generated catalog")
    })
}
pub fn text(key: &str) -> &'static str {
    catalog()["strings"][key].as_str().expect("catalog key")
}
#[cfg(test)]
pub fn launch_profile(name: &str) -> String {
    catalog()["launchProfile"]
        .as_str()
        .expect("template")
        .replace("__VANTARE_NAME__", name)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generated_catalog_and_icons_match_electron_sources() {
        let version = std::process::Command::new("node")
            .arg("--version")
            .output()
            .expect("El catálogo necesita Node >= 22.18.0 en PATH y rustup con Rust 1.99.1 (rustfmt). Instala Node y repite cargo test.");
        assert!(
            version.status.success(),
            "No se pudo ejecutar node --version"
        );
        let version = String::from_utf8_lossy(&version.stdout);
        let parts: Vec<u32> = version
            .trim()
            .trim_start_matches('v')
            .split('.')
            .map(|part| part.parse().expect("Versión de Node no reconocida"))
            .collect();
        assert!(
            parts.as_slice() >= [22, 18, 0].as_slice(),
            "El catálogo necesita Node >= 22.18.0; instalado: {version}"
        );
        let rustfmt = std::process::Command::new("rustup")
            .args(["run", "1.99.1", "rustfmt", "--version"])
            .output()
            .expect("El catálogo necesita rustup en PATH y Rust 1.99.1 con rustfmt");
        assert!(
            rustfmt.status.success(),
            "Instala Rust 1.99.1 con rustfmt mediante rustup para comprobar el catálogo"
        );
        let result = std::process::Command::new("node")
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../hub-web/scripts/rune-catalog.mjs"
            ))
            .arg("--check")
            .status()
            .expect("El catálogo necesita Node >= 22.18.0 en PATH");
        assert!(
            result.success(),
            "Falló el catálogo compartido. Comprueba el diagnóstico y rustup con Rust 1.99.1 (rustfmt)."
        );
    }
    #[test]
    fn dynamic_text_matches_electron_cases() {
        for case in catalog()["cases"].as_array().unwrap() {
            assert_eq!(
                launch_profile(case["input"].as_str().unwrap()),
                case["output"].as_str().unwrap()
            );
        }
    }
}
