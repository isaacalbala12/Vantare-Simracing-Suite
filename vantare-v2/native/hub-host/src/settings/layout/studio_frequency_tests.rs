use super::tests::{fixture, layout, replace_layout};
use super::*;
use serde_json::json;
fn frequency(hz: Option<u16>) -> Edit {
    let value = serde_json::from_value(json!({"field":"frequency","value":hz}))
        .expect("closed explicit frequency");
    Edit::Instance("widget-1".into(), value)
}
#[test]
fn changing_only_the_selected_rate_preserves_other_rates_and_level_and_undo_bytes() {
    let (_root, layout_path, _) = fixture();
    let source = std::fs::read_to_string(&layout_path).expect("source");
    let source = source.replacen(
        '{',
        r#"{"performance":{"widgets":{"z":40,"widget-1":0,"a":5},"level":"minimum"},"#,
        1,
    );
    std::fs::write(&layout_path, &source).expect("seed rates");
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    assert_eq!(before.instances[0].frequency.override_hz, Some(0));
    assert_eq!(before.instances[0].frequency.applied_hz, 0);
    let edited = state
        .edit(frequency(Some(60)), &before.revision, access)
        .expect("selected override");
    let actual = layout(&layout_path);
    assert_eq!(
        actual["performance"],
        json!({"level":"minimum","widgets":{"z":40,"widget-1":60,"a":5}})
    );
    assert_eq!(edited.instances[0].frequency.override_hz, Some(60));
    assert_eq!(edited.instances[0].frequency.applied_hz, 60);
    state
        .edit(Edit::Undo, &edited.revision, access)
        .expect("undo");
    assert_eq!(
        std::fs::read(&layout_path).expect("unchanged bytes"),
        source.as_bytes()
    );
    let before = state.view(access);
    let removed = state
        .edit(frequency(None), &before.revision, access)
        .expect("use global level");
    assert_eq!(removed.instances[0].frequency.override_hz, None);
    assert_eq!(removed.instances[0].frequency.applied_hz, 5);
    let actual = layout(&layout_path);
    assert_eq!(
        actual["performance"],
        json!({"level":"minimum","widgets":{"z":40,"a":5}})
    );
}
#[test]
fn absent_override_removal_does_not_seed_performance_or_history() {
    let (_root, layout_path, bytes) = fixture();
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let after = state
        .edit(frequency(None), &before.revision, access)
        .expect("already inherited");
    assert_eq!(before, after);
    assert_eq!(state.undo.len(), 0);
    assert_eq!(std::fs::read(&layout_path).expect("source bytes"), bytes);
}
#[test]
fn flags_never_accept_overrides_and_keep_their_ignored_legacy_value() {
    let (_root, layout_path, _) = fixture();
    let mut document = layout(&layout_path);
    document["instances"][0]["settings"] = json!({"kind":"racing-flags"});
    document["performance"] = json!({"widgets":{"widget-1":40}});
    replace_layout(&layout_path, &document);
    let bytes = std::fs::read(&layout_path).expect("original");
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    assert_eq!(before.instances[0].frequency.override_hz, Some(40));
    assert_eq!(before.instances[0].frequency.applied_hz, 0);
    for hz in [None, Some(1), Some(60)] {
        assert_eq!(
            state.edit(frequency(hz), &before.revision, access),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&layout_path).expect("no write"), bytes);
    }
}

#[test]
fn a_full_override_map_can_update_existing_but_never_add_a_257th_entry() {
    for existing in [false, true] {
        let (_root, layout_path, _) = fixture();
        let mut document = layout(&layout_path);
        let mut widgets = serde_json::Map::new();
        for n in 0..if existing { 255 } else { 256 } {
            widgets.insert(format!("other-{n}"), json!(40));
        }
        if existing {
            widgets.insert("widget-1".into(), json!(0));
        }
        document["performance"] = json!({"level":"economy","widgets":widgets});
        replace_layout(&layout_path, &document);
        let bytes = std::fs::read(&layout_path).expect("full map");
        let mut state = State::new(layout_path.clone());
        let access = Some(CatalogAccess::Pro);
        let before = state.view(access);
        assert_eq!(before.state, StudioState::Ready);
        let result = state.edit(frequency(Some(20)), &before.revision, access);
        if existing {
            let view = result.expect("existing entry can change");
            assert_eq!(view.instances[0].frequency.applied_hz, 20);
            assert_eq!(
                layout(&layout_path)["performance"]["widgets"]
                    .as_object()
                    .expect("map")
                    .len(),
                256
            );
            let removed = state
                .edit(frequency(None), &view.revision, access)
                .expect("remove from a full map");
            assert_eq!(removed.instances[0].frequency.override_hz, None);
            assert_eq!(removed.instances[0].frequency.applied_hz, 10);
            assert_eq!(
                layout(&layout_path)["performance"]["widgets"]
                    .as_object()
                    .expect("remaining overrides")
                    .len(),
                255
            );
        } else {
            assert_eq!(result, Err(HostError::Denied));
            assert_eq!(std::fs::read(&layout_path).expect("no new entry"), bytes);
            assert_eq!(state.undo.len(), 0);
        }
    }
}
#[test]
fn undo_cannot_change_a_locked_widgets_rate_after_the_plan_is_lost() {
    let (_root, layout_path, _) = fixture();
    let mut document = layout(&layout_path);
    document["instances"][0]["settings"] = json!({"kind":"radar"});
    replace_layout(&layout_path, &document);
    let mut state = State::new(layout_path.clone());
    let pro = Some(CatalogAccess::Pro);
    let before = state.view(pro);
    let after = state
        .edit(frequency(Some(20)), &before.revision, pro)
        .expect("permitted edit");
    let bytes = std::fs::read(&layout_path).expect("selected rate");
    assert_eq!(
        state.edit(Edit::Undo, &after.revision, Some(CatalogAccess::Free)),
        Err(HostError::Denied)
    );
    assert_eq!(
        std::fs::read(&layout_path).expect("no unauthorized undo"),
        bytes
    );
    assert_eq!(state.undo.len(), 1);
    state
        .edit(Edit::Undo, &after.revision, pro)
        .expect("permitted undo still available");
    assert!(layout(&layout_path).get("performance").is_none());
}
#[test]
fn conflicting_or_ambiguous_performance_never_writes_or_retries() {
    let (_root, layout_path, _) = fixture();
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    let old = state.view(access);
    let mut changed = std::fs::read(&layout_path).expect("old bytes");
    changed.push(b' ');
    std::fs::write(&layout_path, &changed).expect("external writer");
    for _ in 0..2 {
        assert!(matches!(
            state.edit(frequency(Some(20)), &old.revision, access),
            Err(HostError::StudioConflict { .. })
        ));
        assert_eq!(
            std::fs::read(&layout_path).expect("no automatic retry"),
            changed
        );
        assert_eq!(state.undo.len(), 0);
    }
    let source = std::str::from_utf8(&changed).expect("fixture");
    for performance in [
        r#"{"widgets":{"widget-1":20,"widget-1":40}}"#,
        r#"{"level":"future"}"#,
        r#"{"widgets":{"widget-1":17}}"#,
        r#"{"future":1}"#,
    ] {
        let protected = source.replacen('{', &format!("{{\"performance\":{performance},"), 1);
        std::fs::write(&layout_path, &protected).expect("ambiguous data");
        let revision = vantare_services::content_hash(protected.as_bytes());
        assert_eq!(
            state.edit(frequency(Some(20)), &revision, access),
            Err(HostError::Protected)
        );
        assert_eq!(
            std::fs::read(&layout_path).expect("preserved"),
            protected.as_bytes()
        );
    }
}

#[test]
fn selecting_a_rate_preserves_map_order_and_the_unrelated_encoded_level() {
    let (_root, layout_path, _) = fixture();
    let original = std::fs::read_to_string(&layout_path).expect("fixture");
    let source = original.replacen(
        '{',
        r#"{"performance":{"widgets":{"z":40,"widget-1":10,"a":5},"level":"\u0062alanced"},"#,
        1,
    );
    std::fs::write(&layout_path, &source).expect("encoded level");
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    state
        .edit(frequency(Some(20)), &before.revision, access)
        .expect("one rate");
    let after = std::fs::read_to_string(&layout_path).expect("saved");
    assert!(after.contains(r#""widgets":{"z":40,"widget-1":20,"a":5}"#));
    assert!(after.contains(r#""level":"\u0062alanced""#));
}

#[test]
fn frequency_uses_the_native_id_byte_limit_and_requires_current_access() {
    for (id, allowed) in [("é".repeat(64), true), ("é".repeat(65), false)] {
        let (_root, layout_path, _) = fixture();
        let mut document = layout(&layout_path);
        document["instances"][0]["id"] = json!(id);
        replace_layout(&layout_path, &document);
        let mut state = State::new(layout_path.clone());
        let access = Some(CatalogAccess::Pro);
        let before = state.view(access);
        let bytes = std::fs::read(&layout_path).expect("original");
        let edit = || {
            Edit::Instance(
                id.clone(),
                serde_json::from_value(json!({"field":"frequency","value":20})).expect("frequency"),
            )
        };
        assert_eq!(
            state.edit(edit(), &before.revision, None),
            Err(HostError::Denied)
        );
        assert_eq!(
            std::fs::read(&layout_path).expect("no unauthenticated edit"),
            bytes
        );
        let result = state.edit(edit(), &before.revision, access);
        if allowed {
            assert!(result.is_ok());
        } else {
            assert_eq!(result, Err(HostError::Denied));
            assert_eq!(std::fs::read(&layout_path).expect("id too long"), bytes);
        }
    }
}

#[test]
fn every_inspector_frequency_writes_the_exact_value_and_same_value_is_a_noop() {
    let (_root, layout_path, _) = fixture();
    let mut state = State::new(layout_path.clone());
    let access = Some(CatalogAccess::Pro);
    for hz in crate::studio::frequency::FREQUENCY_CHOICES {
        let before = state.view(access);
        let chosen = state
            .edit(frequency(Some(hz)), &before.revision, access)
            .expect("exact inspector choice");
        assert_eq!(chosen.instances[0].frequency.override_hz, Some(hz));
        assert_eq!(chosen.instances[0].frequency.applied_hz, hz);
        assert_eq!(
            layout(&layout_path)["performance"]["widgets"]["widget-1"],
            json!(hz)
        );
        let bytes = std::fs::read(&layout_path).expect("written bytes");
        let history = state.undo.len();
        let again = state
            .edit(frequency(Some(hz)), &chosen.revision, access)
            .expect("same value");
        assert_eq!(again, chosen);
        assert_eq!(state.undo.len(), history);
        assert_eq!(std::fs::read(&layout_path).expect("unchanged bytes"), bytes);
    }
}
