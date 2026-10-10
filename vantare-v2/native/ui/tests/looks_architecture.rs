//! Los consumidores reciben capacidades; ningún helper debe clasificar un Look.
use std::{fs, path::Path};
fn violations(source: &str) -> Vec<String> {
    let compact = |text: &str| {
        text.chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
    };
    let production = compact(source.split("#[cfg(test)]").next().expect("fuente"));
    let mut violations = Vec::new();
    for look in vantare_ui::look::Look::ALL {
        for type_name in ["DesignSystem", "Look"] {
            let token = format!("{type_name}::{look:?}");
            if production.contains(&token) {
                violations.push(token);
            }
        }
    }
    // Prohibidos también tras un módulo de tests: quitar cfg(test) no permite
    // esconder una llamada indirecta a estos discriminadores de estilo.
    let all = compact(source);
    for token in [".has_variants(", ".legacy("] {
        if all.contains(token) {
            violations.push(token.into());
        }
    }
    violations
}
fn allowed(path: &Path, ui: &Path) -> bool {
    path == ui.join("look.rs")
        || ["standings", "relative", "delta", "fuel_strategy"]
            .iter()
            .any(|widget| path.starts_with(ui.join(widget)))
}
fn check(path: &Path, ui: &Path) {
    if path.is_dir() {
        for entry in fs::read_dir(path).expect("directorio de fuentes") {
            check(&entry.expect("archivo").path(), ui);
        }
    } else if path.extension().is_some_and(|e| e == "rs") && !allowed(path, ui) {
        let source = fs::read_to_string(path).expect("fuente UTF-8");
        assert!(
            violations(&source).is_empty(),
            "{}: estilo concreto o discriminador indirecto fuera de UI de widget: {:?}",
            path.display(),
            violations(&source)
        );
    }
}
#[test]
fn concrete_looks_are_confined_to_widget_ui_and_look_rs() {
    let native = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("native");
    let ui = native.join("ui/src");
    check(&ui, &ui);
    check(&native.join("hub/src"), &ui);
    check(&native.join("domain/src"), &ui);
}
#[test]
fn guard_rejects_indirect_style_predicates_and_whitespace_variants() {
    for source in [
        "if style.has_variants() {}",
        "if style . legacy () {}",
        "match Look :: Vantare {}",
        "#[cfg(test)] mod tests {} fn later() { style.legacy(); }",
    ] {
        assert!(!violations(source).is_empty(), "no se acepta {source}");
    }
    assert!(violations("settings.appearance(); settings.editable_columns();").is_empty());
    let ui = Path::new("native/ui/src");
    assert!(allowed(Path::new("native/ui/src/standings/vantare.rs"), ui));
    assert!(!allowed(
        Path::new("native/domain/src/standings/plan.rs"),
        ui
    ));
}
