use super::tests::{fixture, layout, replace_layout};
use super::*;
use crate::studio::widget_settings::additional::cases;
use crate::studio::{WidgetSettings, WidgetSettingsPatch};
use serde_json::json;

#[test]
fn all_48_controls_match_native_vectors_with_one_write_and_undo() {
    let vectors = cases::vectors();
    assert_eq!(vectors.len(), 52);
    for case in vectors {
        let (_root, layout_path, _) = fixture();
        let mut document = layout(&layout_path);
        document["instances"][0]["settings"] = case["before"].clone();
        replace_layout(&layout_path, &document);
        let mut state = State::new(layout_path.clone());
        let access = Some(CatalogAccess::Pro);
        let before = state.view(access);
        let bytes = std::fs::read(&layout_path).expect("before bytes");
        let patch: WidgetSettingsPatch =
            serde_json::from_value(case["patch"].clone()).expect("closed patch");
        let next = state
            .edit(
                Edit::Instance(
                    "widget-1".into(),
                    InstancePatch::Settings(Box::new(patch.clone())),
                ),
                &before.revision,
                access,
            )
            .expect("one native edit");
        assert_eq!(
            serde_json::to_value(&next.instances[0].settings).expect("projected settings"),
            case["after"],
            "{}",
            case["patch"]
        );
        let changed = case["before"] != case["after"];
        assert_eq!(state.undo.len(), usize::from(changed));
        // Threshold slots are operations on a sorted list, never auto-retried.
        if case["patch"].get("threshold").is_none() {
            let unchanged = state
                .edit(
                    Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(patch))),
                    &next.revision,
                    access,
                )
                .expect("same normalized setting");
            assert_eq!(unchanged.revision, next.revision);
            assert_eq!(state.undo.len(), 1);
        }
        if changed {
            state
                .edit(Edit::Undo, &next.revision, access)
                .expect("undo single operation");
        }
        assert_eq!(std::fs::read(&layout_path).expect("restored bytes"), bytes);
    }
}

#[test]
fn additional_controls_preserve_internal_unsupported_and_unknown_raw_members() {
    for (source, patch) in [
        (
            r#"{"kind":"broadcast-tower","rowCount":99,"showSof":true,"future": {"z":  1.00}}"#,
            json!({"kind":"broadcast-tower","driverCarousel":true}),
        ),
        (
            r#"{"kind":"delta-trace","reference":"best","showSectors":false,"showTrackMap":false,"future": {"z":  1.00}}"#,
            json!({"kind":"delta-trace","windowSeconds":8}),
        ),
        (
            r#"{"kind":"session-alerts","companionFor":"opaque-parent","style":"neo","future": {"z":  1.00}}"#,
            json!({"kind":"session-alerts","soundZero":true}),
        ),
    ] {
        let mut instance = Fields::default();
        instance.0.insert(
            "settings".into(),
            RawValue::from_string(source.into()).expect("source"),
        );
        let original: Fields = read(&instance, "settings").expect("before");
        let patch: WidgetSettingsPatch = serde_json::from_value(patch).expect("patch");
        assert!(
            setting_edit::apply(&mut instance, &patch, Some(CatalogAccess::Pro))
                .expect("write selected field")
        );
        let saved: Fields = read(&instance, "settings").expect("after");
        let kind: WidgetKind = read(&saved, "kind").expect("kind");
        let projection =
            serde_json::to_string(&typed_settings(kind, &saved).expect("typed settings"))
                .expect("wire settings");
        assert!(!projection.contains("future"));
        let selected = serde_json::to_value(patch).expect("selected fields");
        for (key, value) in &original.0 {
            if key != "kind" && selected.get(key).is_none() {
                assert_eq!(
                    saved.0.get(key).expect("preserved").get(),
                    value.get(),
                    "{key}"
                );
            }
        }
    }
}

#[test]
fn stale_wrong_kind_missing_rights_and_protected_settings_never_retry_or_write() {
    let (_root, layout_path, _) = fixture();
    let mut document = layout(&layout_path);
    document["instances"][0]["settings"] = json!({"kind":"radar","showPhrases":true});
    replace_layout(&layout_path, &document);
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let bytes = std::fs::read(&layout_path).expect("bytes");
    let order = |patch| {
        Edit::Instance(
            "widget-1".into(),
            InstancePatch::Settings(Box::new(serde_json::from_value(patch).expect("patch"))),
        )
    };
    assert_eq!(
        state.edit(
            order(json!({"kind":"broadcast-tower","rowCount":3})),
            &before.revision,
            access
        ),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.edit(
            order(json!({"kind":"radar","showPhrases":false})),
            &before.revision,
            None
        ),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&layout_path).expect("bytes"), bytes);
    let mut changed = bytes.clone();
    changed.push(b' ');
    std::fs::write(&layout_path, &changed).expect("other writer");
    for _ in 0..2 {
        assert!(matches!(
            state.edit(
                order(json!({"kind":"radar","showPhrases":false})),
                &before.revision,
                access
            ),
            Err(HostError::StudioConflict { .. })
        ));
        assert_eq!(std::fs::read(&layout_path).expect("no retry"), changed);
        assert_eq!(state.undo.len(), 0);
    }
    document["instances"][0]["settings"] = json!({"kind":"radar","showPhrases":"bad"});
    replace_layout(&layout_path, &document);
    let protected = std::fs::read(&layout_path).expect("protected bytes");
    assert_eq!(
        state.edit(
            order(json!({"kind":"radar","showPhrases":false})),
            &vantare_services::content_hash(&protected),
            access
        ),
        Err(HostError::Protected)
    );
    assert_eq!(
        std::fs::read(&layout_path).expect("protected stays untouched"),
        protected
    );
}

#[test]
fn added_native_defaults_have_a_typed_projection_instead_of_null() {
    for kind in WidgetKind::ALL {
        let raw = crate::widget_defaults::get(kind.id()).expect("default");
        assert!(
            WidgetSettings::from_json(*kind, raw.settings.get())
                .expect("typed native default")
                .is_some()
        );
    }
}
