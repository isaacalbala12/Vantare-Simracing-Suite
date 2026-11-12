use super::*;
use serde_json::{Value, json};

// Remove only future members for comparison with the independent UI serializer.
// Never normalize the host output: that would mask missing native migrations.
fn known_settings(mut value: Value, expected: &Value) -> Value {
    value.as_object_mut().unwrap().retain(|key, _| expected.get(key).is_some());
    for key in ["columns", "practiceColumns", "qualifyingColumns"] {
        if let Some(reference) = expected[key].as_array() {
            let actual = value.get_mut(key).and_then(Value::as_array_mut).expect("native columns");
            for (column, sample) in actual.iter_mut().zip(reference) {
                column.as_object_mut().unwrap().retain(|name, _| sample.get(name).is_some());
                for nested in ["format", "style"] {
                    if let Some(fields) = column[nested].as_object_mut() {
                        fields.retain(|name, _| sample[nested].get(name).is_some());
                    }
                }
            }
        }
    }
    value
}
#[test]
fn native_table_presets_match_the_ui_writer_and_undo_recovers_custom_columns() {
    let oracle: Value = serde_json::from_str(include_str!("../../../fixtures/studio-table-preset-golden.json")).unwrap();
    let cases = oracle["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 18);
    for case in cases {
        let root = crate::test_support::Root::new();
        let path = root.path.join("layout.json");
        let document = json!({"version":1,"futureRoot":{"keep":41},"instances":[{"id":"widget-1","x":3,"y":7,"futureInstance":43,"settings":case["input"]}]});
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let access = Some(CatalogAccess::Free);
        let mut state = State::new(path.clone());
        let before = state.view(access);
        assert_eq!(before.state, StudioState::Ready, "{}", case["name"]);
        let update = serde_json::from_value(json!({"kind":case["kind"],"tablePreset":case["size"]})).unwrap();
        let edited = state.edit(Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))), &before.revision, access).unwrap();
        let saved = std::fs::read(&path).unwrap();
        let mut actual: Value = serde_json::from_slice(&saved).unwrap();
        let settings = &actual["instances"][0]["settings"];
        assert_eq!(known_settings(settings.clone(), &case["expected"]), case["expected"], "{}", case["name"]);
        assert!(settings.get("tablePreset").is_none());
        if case["name"].as_str().unwrap().contains("custom") {
            assert_eq!(settings["futureSetting"], json!({"keep":11}));
            let driver = settings["columns"].as_array().unwrap().iter().find(|column| column["metricId"] == "driverName").unwrap();
            assert_eq!(driver["futureColumn"], json!({"keep":23}));
            assert_eq!(driver["format"]["futureFormat"], json!({"keep":29}));
            assert_eq!(driver["style"]["futureStyle"], json!({"keep":31}));
            assert!(!settings["columns"].as_array().unwrap().iter().any(|column| column["metricId"] == "custom-metric"));
        }
        actual["instances"][0]["settings"] = document["instances"][0]["settings"].clone();
        assert_eq!(actual, document, "non-settings members: {}", case["name"]);
        // Reapplying a recipe is a byte-preserving no-op with no extra history.
        let update = serde_json::from_value(json!({"kind":case["kind"],"tablePreset":case["size"]})).unwrap();
        let repeated = state.edit(Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))), &edited.revision, access).unwrap();
        assert_eq!(repeated.revision, edited.revision);
        assert_eq!(std::fs::read(&path).unwrap(), saved);
        if edited.revision != before.revision {
            let undone = state.edit(Edit::Undo, &edited.revision, access).unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), bytes, "undo: {}", case["name"]);
            state.edit(Edit::Redo, &undone.revision, access).unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), saved);
        }
    }
}

#[test]
fn recipe_conflicts_unverified_access_and_mixed_fields_never_write() {
    for kind in ["standings", "relative"] {
        for extra in [json!({"columns":null}), json!({"style":"neo"}), json!({})] {
            let root = crate::test_support::Root::new();
            let path = root.path.join("layout.json");
            let bytes = serde_json::to_vec(&json!({"version":1,"instances":[{"id":"widget-1","x":0,"y":0,"settings":{"kind":kind}}]})).unwrap();
            std::fs::write(&path, &bytes).unwrap();
            let mut state = State::new(path.clone());
            let before = state.view(Some(CatalogAccess::Free));
            let mut command = json!({"kind":kind,"tablePreset":"expanded"});
            command.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
            let update: crate::studio::WidgetSettingsPatch = serde_json::from_value(command).unwrap();
            let (revision, access) = if extra.as_object().unwrap().is_empty() {
                ("f".repeat(64), Some(CatalogAccess::Free))
            } else { (before.revision.clone(), Some(CatalogAccess::Free)) };
            assert!(state.edit(Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))), &revision, access).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
            assert!(!state.view(access).can_undo);
            let update = serde_json::from_value(json!({"kind":kind,"tablePreset":"compact"})).unwrap();
            assert!(state.edit(Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))), &before.revision, None).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), bytes);
        }
    }
}

#[test]
fn recipe_never_recovers_a_protected_document_or_changes_eficiencia() {
    for content in [
        None,
        Some("{"),
        Some(r#"{"version":999,"instances":[]}"#),
        Some(r#"{"version":1,"instances":[{"id":"widget-1","x":0,"y":0,"settings":{"kind":"standings","columns":42}}]}"#),
        Some(r#"{"version":1,"instances":[{"id":"widget-1","x":0,"y":0,"settings":{"kind":"standings","designSystem":"eficiencia"}}]}"#),
    ] {
        let root = crate::test_support::Root::new();
        let path = root.path.join("layout.json");
        if let Some(content) = content {
            std::fs::write(&path, content).unwrap();
        }
        let initial: Vec<_> = std::fs::read_dir(&root.path).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        let access = Some(CatalogAccess::Pro);
        let mut state = State::new(path.clone());
        let before = state.view(access);
        let update = serde_json::from_value(json!({"kind":"standings","tablePreset":"compact"})).unwrap();
        assert!(state.edit(Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))), &before.revision, access).is_err());
        assert_eq!(std::fs::read(&path).ok(), content.map(|text| text.as_bytes().to_vec()));
        let after: Vec<_> = std::fs::read_dir(&root.path).unwrap().map(|entry| entry.unwrap().file_name()).collect();
        assert_eq!(after, initial);
        assert!(!state.view(access).can_undo);
    }
}
