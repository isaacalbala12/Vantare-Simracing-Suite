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
        let result = std::process::Command::new("node")
            .arg(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../hub-web/scripts/rune-catalog.mjs"
            ))
            .arg("--check")
            .status()
            .expect("Node for shared catalog check");
        assert!(result.success());
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
