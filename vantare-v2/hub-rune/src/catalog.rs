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
    fn node_version(value: &str) -> Result<[u32; 3], String> {
        let invalid = || {
            format!(
                "Versión de Node no reconocida: {value:?}. Instala Node >= 22.18.0; node --version debe indicar vM.m.p, con sufijo opcional."
            )
        };
        let base = value
            .trim()
            .strip_prefix('v')
            .unwrap_or(value.trim())
            .split(['-', '+'])
            .next()
            .ok_or_else(invalid)?;
        let parts = base
            .split('.')
            .map(|part| part.parse::<u32>())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| invalid())?;
        parts.try_into().map_err(|_| invalid())
    }
    #[test]
    fn node_version_accepts_suffixes_and_reports_unrecognized_output() {
        assert_eq!(node_version("v22.18.0\n").unwrap(), [22, 18, 0]);
        assert_eq!(
            node_version("v24.1.2-nightly.20261113+build").unwrap(),
            [24, 1, 2]
        );
        for invalid in ["", "v22.18", "v22.18.x", "unknown", "v22.18.0.1"] {
            assert!(node_version(invalid).is_err());
        }
    }
    #[test]
    fn generated_catalog_and_icons_match_electron_sources() -> Result<(), String> {
        let version = std::process::Command::new("node")
            .arg("--version")
            .output()
            .map_err(|error| format!("El catálogo necesita Node >= 22.18.0 en PATH y rustup/Rust 1.99.1 con rustfmt. Instala Node y repite cargo test: {error}"))?;
        if !version.status.success() {
            return Err("No se pudo ejecutar node --version".into());
        }
        let version = String::from_utf8_lossy(&version.stdout);
        if node_version(&version)? < [22, 18, 0] {
            return Err(format!(
                "El catálogo necesita Node >= 22.18.0; instalado: {version}"
            ));
        }
        let rustfmt = std::process::Command::new("rustup")
            .args(["run", "1.99.1", "rustfmt", "--version"])
            .output()
            .map_err(|error| {
                format!("El catálogo necesita rustup en PATH y Rust 1.99.1 con rustfmt: {error}")
            })?;
        if !rustfmt.status.success() {
            return Err(
                "Instala Rust 1.99.1 con rustfmt mediante rustup para comprobar el catálogo".into(),
            );
        }
        let result = std::process::Command::new("node")
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../hub-web/scripts/rune-catalog.mjs"
            ))
            .arg("--check")
            .status()
            .map_err(|error| format!("El catálogo necesita Node >= 22.18.0 en PATH: {error}"))?;
        if !result.success() {
            return Err("Falló el catálogo compartido. Comprueba el diagnóstico y rustup con Rust 1.99.1 (rustfmt).".into());
        }
        Ok(())
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
