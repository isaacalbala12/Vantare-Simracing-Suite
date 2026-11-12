use super::*;
use serde_json::{Value, json};
use vantare_domain::widget_settings::fuel_strategy::Settings;

#[test]
fn fuel_content_writer_matches_native_and_undo_recovers_original_bytes() {
    for (look, version) in [("eficiencia", 0), ("eficiencia", 1), ("vantare", 0)] {
        for patch in [
            json!({"kind":"fuel-strategy","historyRows":1}),
            json!({"kind":"fuel-strategy","historyRows":8}),
            json!({"kind":"fuel-strategy","showProjection":false}),
        ] {
            let root = crate::test_support::Root::new();
            let path = root.path.join("layout.json");
            let settings = json!({"kind":"fuel-strategy","designSystem":look,
                "contentVersion":version,"historyRows":99,"showProjection":true,
                "source":"virtual-energy","units":"liters","unknown":{"z":1,"a":2}});
            let before = serde_json::to_vec(&json!({"version":1,"unknownRoot":42,
                "instances":[{"id":"fuel","x":12,"y":24,"settings":settings}]})).unwrap();
            std::fs::write(&path, &before).unwrap();
            let original = serde_json::from_value::<Settings>(settings.clone()).unwrap().normalized();
            let mut expected = original.clone();
            if let Some(rows) = patch.get("historyRows") {
                expected.history_rows = u8::try_from(rows.as_u64().unwrap()).unwrap();
            } else {
                expected.show_projection = false;
            }
            let no_change = expected.normalized() == original;
            let mut expected: Value = serde_json::from_str(&serde_json::to_string(&expected.normalized()).unwrap()).unwrap();
            expected["kind"] = json!("fuel-strategy");
            expected["unknown"] = settings["unknown"].clone();
            let access = Some(CatalogAccess::Pro);
            let mut state = State::new(path.clone());
            let current = state.view(access);
            let edit = || Edit::Instance("fuel".into(), InstancePatch::Settings(Box::new(
                serde_json::from_value(patch.clone()).unwrap(),
            )));
            let changed = state.edit(edit(), &current.revision, access).unwrap();
            if no_change {
                assert_eq!(std::fs::read(&path).unwrap(), before);
                assert!(!changed.can_undo);
                continue;
            }
            let saved = std::fs::read(&path).unwrap();
            let actual: Value = serde_json::from_slice(&saved).unwrap();
            assert_eq!(actual["instances"][0]["settings"], expected, "{look} v{version}: {patch}");
            assert_eq!(actual["unknownRoot"], 42);
            assert!(matches!(state.edit(edit(), &current.revision, access), Err(HostError::StudioConflict { .. })));
            assert_eq!(std::fs::read(&path).unwrap(), saved);
            let noop = state.edit(edit(), &changed.revision, access).unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), saved);
            state.edit(Edit::Undo, &noop.revision, access).unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), before);
        }
    }
}
