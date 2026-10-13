//! Los consumidores reciben capacidades; ningún helper debe clasificar un Look.
use std::{fs, path::Path};

#[test]
fn saved_efficiency_layout_preserves_tone_and_accent_byte_for_byte() {
    let saved = br#"{"version":1,"instances":[
        {"id":"standings","x":20,"y":30,"visible":true,"settings":{"kind":"standings","designSystem":"eficiencia","style":"neutro","accent":"amber"}},
        {"id":"relative","x":40,"y":50,"visible":true,"settings":{"kind":"relative","designSystem":"eficiencia","style":"neutro","accent":"green"}},
        {"id":"delta","x":60,"y":70,"visible":true,"settings":{"kind":"delta","designSystem":"eficiencia","style":"neutro","accent":"white"}},
        {"id":"fuel","x":80,"y":90,"visible":true,"settings":{"kind":"fuel-strategy","designSystem":"eficiencia","style":"neutro","accent":"amber"}}
    ]}"#;
    let layout = vantare_ui::layout::Layout::from_json(saved).expect("layout guardado");
    assert_eq!(layout.instances.len(), 4);
    for (instance, accent) in layout
        .instances
        .iter()
        .zip(["amber", "green", "white", "amber"])
    {
        let settings = serde_json::to_value(&instance.settings).expect("settings");
        assert_eq!(settings["designSystem"], "eficiencia");
        assert_eq!(settings["style"], "neutro");
        assert_eq!(settings["accent"], accent);
    }
    // JSON canónico exportado por 22fe7490 (serializador de la base b2186f82).
    // No regenerar esta referencia con el serializador bajo prueba.
    let bytes = serde_json::to_vec_pretty(&layout).expect("guardar");
    assert_eq!(
        bytes.as_slice(),
        include_bytes!("looks-canonical-22fe7490.json")
    );
    let restored = vantare_ui::layout::Layout::from_json(&bytes).expect("releer");
    assert_eq!(
        serde_json::to_vec_pretty(&restored).expect("guardar otra vez"),
        bytes
    );
    assert_eq!(restored, layout);
}
#[test]
fn saved_appearance_names_defaults_and_unknown_fields_preserve_the_contract() {
    use vantare_ui::look::{Accent, Look, Tone};
    assert_eq!(
        serde_json::to_value([Look::Eficiencia, Look::Vantare]).expect("Looks"),
        serde_json::json!(["eficiencia", "vantare"])
    );
    assert_eq!(
        serde_json::to_value([Tone::Neutro, Tone::Neo]).expect("tones"),
        serde_json::json!(["neutro", "neo"])
    );
    assert_eq!(
        serde_json::to_value([Accent::Amber, Accent::Green, Accent::White, Accent::Red])
            .expect("accents"),
        serde_json::json!(["amber", "green", "white", "red"])
    );
    assert_eq!(Look::default(), Look::Vantare);
    assert_eq!(Tone::default(), Tone::Neo);
    assert_eq!(Accent::default(), Accent::Red);
    for kind in ["standings", "relative", "delta", "fuel-strategy"] {
        for input in [
            serde_json::json!({"kind": kind}),
            serde_json::json!({"kind": kind, "designSystem": "unknown", "style": "unknown", "accent": "unknown"}),
            serde_json::json!({"kind": kind, "designSystem": "vantare", "style": "neo", "accent": "red"}),
        ] {
            let settings: vantare_ui::Settings = serde_json::from_value(input).expect("settings");
            let saved = serde_json::to_value(settings).expect("guardar settings");
            assert_eq!(saved["designSystem"], "vantare", "{kind}");
            assert_eq!(saved["style"], "neo", "{kind}");
            assert_eq!(saved["accent"], "red", "{kind}");
        }
    }
}
fn violations(source: &str) -> Vec<String> {
    let compact = |text: &str| {
        text.chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
    };
    let production = compact(source.split("#[cfg(test)]").next().expect("fuente"));
    let mut violations = Vec::new();
    for look in vantare_ui::look::Look::ALL {
        let token = format!("Look::{look:?}");
        if production.contains(&token) {
            violations.push(token);
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
        || path == ui.join("pedals.rs")
        || ["standings", "relative", "delta", "fuel_strategy", "pedals"]
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
