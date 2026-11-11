use super::*;
fn fixture() -> (crate::test_support::Root, std::path::PathBuf, Vec<u8>) {
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    let bytes=br#"{"version":1,"instances":[{"id":"widget-1","x":48.5,"y":62.0,"settings":{"kind":"standings","private":{"a":  1.00}},"geometry":{"size":{"width":338.0,"height":304.0},"aspectLocked":true},"future":{"path":"C:/Users/private"}}],"futureRoot":{"x":  2.50}}"#.to_vec();
    std::fs::write(&path, &bytes).expect("layout fixture");
    (root, path, bytes)
}
#[test]
fn visibility_undo_redo_preserves_opaque_fields_and_never_projects_position() {
    let (_root, path, before) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    assert_eq!(view.state, StudioState::Ready);
    assert_eq!(view.instances[0].size.width, 338);
    let projected = serde_json::to_string(&view).unwrap();
    for private in ["Users", "futureRoot", "aspectLocked", "\"x\":", "\"y\":"] {
        assert!(!projected.contains(private));
    }
    let changed = state
        .edit(
            Edit::Visibility("widget-1".into(), false),
            &view.revision,
            access,
        )
        .unwrap();
    assert!(!changed.instances[0].visible);
    let saved = std::fs::read(&path).unwrap();
    let text = std::str::from_utf8(&saved).unwrap();
    assert!(text.contains(r#"{"a":  1.00}"#));
    assert!(text.contains(r#"{"x":  2.50}"#));
    let undone = state.edit(Edit::Undo, &changed.revision, access).unwrap();
    assert!(undone.instances[0].visible);
    assert_eq!(std::fs::read(&path).unwrap(), before);
    state.edit(Edit::Redo, &undone.revision, access).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), saved);
}
#[test]
fn malformed_missing_future_and_duplicate_layouts_are_protected_without_writes() {
    for bytes in [
        None,
        Some(b"{".as_slice()),
        Some(br#"{"version":999,"instances":[]}"#.as_slice()),
        Some(br#"{"version":1,"instances":[{"id":"x","settings":{"kind":"standings"}}]}"#.as_slice()),
        Some(br#"{"version":1,"instances":[{"id":"x","x":"bad","y":0,"settings":{"kind":"standings"}}]}"#.as_slice()),
        Some(br#"{"version":1,"instances":[{"id":"x","x":1e100,"y":0,"settings":{"kind":"standings"}}]}"#.as_slice()),
        Some(br#"{"version":1,"version":1,"instances":[]}"#.as_slice()),
    ] {
        let root = crate::test_support::Root::new();
        let path = root.path.join("layout.json");
        if let Some(bytes) = bytes {
            std::fs::write(&path, bytes).unwrap();
        }
        let mut state = State::new(path.clone());
        let view = state.view(None);
        assert_eq!(
            view.state,
            if bytes.is_none() {
                StudioState::Missing
            } else {
                StudioState::Protected
            }
        );
        assert!(
            state
                .edit(
                    Edit::Add(WidgetKind::Standings),
                    &view.revision,
                    Some(CatalogAccess::Pro)
                )
                .is_err()
        );
        assert!(state.track(true, Some(CatalogAccess::Pro)).is_err());
        if let Some(bytes) = bytes {
            assert_eq!(std::fs::read(path).unwrap(), bytes);
        } else {
            assert!(!path.exists());
        }
    }
}
#[test]
fn stale_revision_and_denied_pro_widget_never_change_the_layout() {
    let (_root, path, bytes) = fixture();
    let mut state = State::new(path.clone());
    let view = state.view(Some(CatalogAccess::Free));
    assert!(matches!(
        state.edit(
            Edit::Visibility("widget-1".into(), false),
            &"f".repeat(64),
            Some(CatalogAccess::Pro)
        ),
        Err(HostError::StudioConflict { .. })
    ));
    assert_eq!(
        state.edit(
            Edit::Add(WidgetKind::Radar),
            &view.revision,
            Some(CatalogAccess::Free)
        ),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.edit(
            Edit::Instance("widget-1".into(), InstancePatch::Opacity(19)),
            &view.revision,
            Some(CatalogAccess::Pro)
        ),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
#[test]
fn adding_uses_versioned_native_settings_and_a_free_identity() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    let added = state
        .edit(Edit::Add(WidgetKind::Delta), &view.revision, access)
        .unwrap();
    assert_eq!(added.instances.len(), 2);
    assert_eq!(added.instances[1].id, "widget-2");
    let opened = Open::read(&path).unwrap();
    let x: f64 = read(&opened.instances[1], "x").unwrap();
    let y: f64 = read(&opened.instances[1], "y").unwrap();
    // GPUI free_spot: 2% margin, 1% steps and 12 px between occupied rectangles.
    assert!((x - 403.2).abs() < 0.001);
    assert!((y - 38.4).abs() < 0.001);
    let settings: Fields = read(&opened.instances[1], "settings").unwrap();
    let native = crate::widget_defaults::get("delta").unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(native.settings.get()).unwrap(),
        serde_json::to_value(&settings.0).unwrap()
    );
    let removed = state
        .edit(Edit::Remove("widget-2".into()), &added.revision, access)
        .unwrap();
    assert_eq!(removed.instances.len(), 1);
}
#[test]
fn an_external_write_invalidates_history_instead_of_overwriting_the_winner() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    let saved = state
        .edit(
            Edit::Visibility("widget-1".into(), false),
            &view.revision,
            access,
        )
        .unwrap();
    let mut bytes = std::fs::read(&path).unwrap();
    bytes.push(b' ');
    std::fs::write(&path, &bytes).unwrap();
    assert!(matches!(
        state.edit(Edit::Undo, &saved.revision, access),
        Err(HostError::StudioConflict { .. })
    ));
    assert!(!state.view(access).can_undo);
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
#[test]
fn track_requests_use_the_native_counter_and_hide_removes_the_request() {
    let (_root, path, bytes) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    assert!(state.track(true, access).unwrap().showing);
    assert_eq!(
        std::fs::read(path.with_extension("show.json")).unwrap(),
        b"1"
    );
    assert!(state.track(true, access).unwrap().showing);
    assert_eq!(
        std::fs::read(path.with_extension("show.json")).unwrap(),
        b"1"
    );
    assert!(!state.track(false, access).unwrap().showing);
    assert!(!path.with_extension("show.json").exists());
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}

#[test]
fn redo_cannot_restore_a_pro_addition_after_access_is_downgraded() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let pro = Some(CatalogAccess::Pro);
    let view = state.view(pro);
    let added = state
        .edit(Edit::Add(WidgetKind::Radar), &view.revision, pro)
        .unwrap();
    let undone = state.edit(Edit::Undo, &added.revision, pro).unwrap();
    let before = std::fs::read(&path).unwrap();
    assert_eq!(
        state.edit(Edit::Redo, &undone.revision, Some(CatalogAccess::Free)),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert!(state.edit(Edit::Redo, &undone.revision, pro).is_ok());
}

#[test]
fn partial_session_defaults_and_opaque_session_fields_survive_a_patch() {
    let (_root, path, _) = fixture();
    let mut root: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    root["instances"][0]["showIn"] = serde_json::json!({"practice":false,"future":{"a":1}});
    std::fs::write(&path, serde_json::to_vec(&root).unwrap()).unwrap();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    assert_eq!(
        view.instances[0].show_in,
        ShowIn {
            practice: false,
            qualifying: true,
            race: true
        }
    );
    state
        .edit(
            Edit::Instance(
                "widget-1".into(),
                InstancePatch::ShowIn(ShowIn {
                    practice: true,
                    qualifying: false,
                    race: true,
                }),
            ),
            &view.revision,
            access,
        )
        .unwrap();
    let saved: serde_json::Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(
        saved["instances"][0]["showIn"]["future"],
        serde_json::json!({"a":1})
    );
    assert_eq!(saved["instances"][0]["showIn"]["qualifying"], false);
}

#[test]
fn showing_and_hiding_share_the_native_presentation_lock() {
    let (_root, path, bytes) = fixture();
    let mut state = State::new(path.clone());
    let show = path.with_extension("show.json");
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(show.with_extension("json.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    assert_eq!(
        state.track(true, Some(CatalogAccess::Pro)),
        Err(HostError::Busy)
    );
    assert_eq!(
        state.track(false, Some(CatalogAccess::Pro)),
        Err(HostError::Busy)
    );
    assert!(!show.exists());
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    drop(lock);
    assert!(state.track(true, Some(CatalogAccess::Pro)).unwrap().showing);
}

fn layout(path: &Path) -> serde_json::Value {
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}
fn replace_layout(path: &Path, value: &serde_json::Value) {
    std::fs::write(path, serde_json::to_vec(value).unwrap()).unwrap();
}
#[test]
fn removing_and_readding_a_reused_identity_does_not_inherit_frequency() {
    let (_root, path, _) = fixture();
    let bytes = std::fs::read_to_string(&path).unwrap();
    let bytes = bytes.replacen(
        '{',
        r#"{"performance":{"widgets":{"z":10,"widget-1":4,"a":5},"level":"balanced"},"#,
        1,
    );
    // Use the real enum spelling and valid supported frequencies.
    let mut value: serde_json::Value = serde_json::from_str(&bytes).unwrap();
    value["performance"]["level"] =
        serde_json::json!(crate::settings::track::PerformanceLevel::default());
    replace_layout(&path, &value);
    // Preserve an intentionally non-alphabetical order in the nested map.
    let text = std::fs::read_to_string(&path).unwrap().replace(
        r#""widgets":{"a":5,"widget-1":4,"z":10}"#,
        r#""widgets":{"z":10,"widget-1":4,"a":5}"#,
    );
    std::fs::write(&path, text).unwrap();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let removed = state
        .edit(Edit::Remove("widget-1".into()), &before.revision, access)
        .unwrap();
    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(raw.contains(r#""widgets":{"z":10,"a":5}"#));
    let (added, id) = state
        .add(WidgetKind::Delta, &removed.revision, access)
        .unwrap();
    assert_eq!(id, "widget-1");
    assert_eq!(added.instances[0].id, id);
    assert!(layout(&path)["performance"]["widgets"].get(&id).is_none());
}
#[test]
fn companions_are_hidden_and_follow_visibility_and_removal_without_being_fabricated() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    let parent =
        serde_json::json!({"id":"alerts","x":1,"y":1,"settings":{"kind":"session-alerts"}});
    let mini = serde_json::json!({"id":"alerts-mini","x":2,"y":2,"visible":true,"settings":{"kind":"session-alerts","companionFor":"alerts"}});
    value["instances"] = serde_json::json!([parent, mini]);
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let initial = state.view(access);
    assert_eq!(initial.instances.len(), 1);
    assert_eq!(initial.instances[0].id, "alerts");
    let hidden = state
        .edit(
            Edit::Visibility("alerts".into(), false),
            &initial.revision,
            access,
        )
        .unwrap();
    assert!(
        layout(&path)["instances"]
            .as_array()
            .unwrap()
            .iter()
            .all(|v| v["visible"] == false)
    );
    assert_eq!(
        state.edit(Edit::Remove("alerts-mini".into()), &hidden.revision, access),
        Err(HostError::Denied)
    );
    let removed = state
        .edit(Edit::Remove("alerts".into()), &hidden.revision, access)
        .unwrap();
    assert!(removed.instances.is_empty());
    assert!(layout(&path)["instances"].as_array().unwrap().is_empty());
    let (added, id) = state
        .add(WidgetKind::SessionAlerts, &removed.revision, access)
        .unwrap();
    assert_eq!(added.instances.len(), 1);
    assert_eq!(added.instances[0].id, id);
    assert_eq!(layout(&path)["instances"].as_array().unwrap().len(), 1);
}
#[test]
fn hide_needs_no_rights_or_valid_layout_and_any_request_content_counts_as_showing() {
    let (_root, path, _) = fixture();
    let show = path.with_extension("show.json");
    for bytes in [b"".as_slice(), b"invalid counter".as_slice()] {
        std::fs::write(&show, bytes).unwrap();
        std::fs::write(&path, b"invalid layout").unwrap();
        let mut state = State::new(path.clone());
        assert!(state.view(None).showing);
        assert!(!state.track(false, None).unwrap().showing);
        assert!(!show.exists());
        assert_eq!(std::fs::read(&path).unwrap(), b"invalid layout");
        assert_eq!(state.track(true, None), Err(HostError::Denied));
    }
}
#[test]
fn polling_is_subscription_scoped_and_never_duplicates_the_initial_event() {
    use std::time::{Duration, Instant};
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let now = Instant::now();
    let first = state.changed(true, now, access).unwrap();
    assert!(state.changed(true, now, access).is_none());
    let mut bytes = std::fs::read(&path).unwrap();
    bytes.push(b' ');
    std::fs::write(&path, &bytes).unwrap();
    assert!(
        state
            .changed(true, now + Duration::from_millis(499), access)
            .is_none()
    );
    assert_ne!(
        state
            .changed(true, now + Duration::from_millis(500), access)
            .unwrap()
            .revision,
        first.revision
    );
    assert!(
        state
            .changed(true, now + Duration::from_secs(1), access)
            .is_none()
    );
    let revision = state.revision.clone();
    bytes.push(b' ');
    std::fs::write(&path, bytes).unwrap();
    assert!(
        state
            .changed(false, now + Duration::from_millis(1500), access)
            .is_none()
    );
    assert_eq!(state.revision, revision);
    let observed = state.observed(now + Duration::from_millis(1501), access);
    assert!(
        state
            .changed(true, now + Duration::from_millis(2001), access)
            .is_none()
    );
    assert_eq!(state.view(access), observed);
}
#[test]
fn history_keeps_exactly_fifty_reversible_steps() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let mut view = state.view(access);
    for n in 0..60 {
        view = state
            .edit(
                Edit::Visibility("widget-1".into(), n % 2 != 0),
                &view.revision,
                access,
            )
            .unwrap();
    }
    for _ in 0..HISTORY_LIMIT {
        view = state.edit(Edit::Undo, &view.revision, access).unwrap();
    }
    assert!(!view.can_undo);
    assert_eq!(
        state.edit(Edit::Undo, &view.revision, access),
        Err(HostError::Denied)
    );
}
#[test]
fn instance_limit_unknown_removal_and_outside_catalog_add_have_no_effects() {
    let (_small_root, small_path, _) = fixture();
    let mut small = State::new(small_path);
    let revision = small.view(Some(CatalogAccess::Pro)).revision;
    assert_eq!(
        small.add(
            WidgetKind::CarDamageNumbers,
            &revision,
            Some(CatalogAccess::Pro)
        ),
        Err(HostError::Denied)
    );

    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    let template = value["instances"][0].clone();
    value["instances"] = serde_json::json!(
        (0..INSTANCE_LIMIT)
            .map(|n| {
                let mut item = template.clone();
                item["id"] = serde_json::json!(format!("widget-{n}"));
                item
            })
            .collect::<Vec<_>>()
    );
    replace_layout(&path, &value);
    let bytes = std::fs::read(&path).unwrap();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    for edit in [
        Edit::Add(WidgetKind::Delta),
        Edit::Remove("missing".into()),
        Edit::Add(WidgetKind::CarDamageNumbers),
    ] {
        assert_eq!(
            state.edit(edit, &view.revision, access),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
}
#[test]
fn a_full_canvas_uses_the_native_fallback_and_invalid_canvas_does_not_write() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["canvasResolution"] = serde_json::json!({"width":64,"height":64});
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    state
        .add(WidgetKind::Delta, &view.revision, access)
        .unwrap();
    let saved = layout(&path);
    assert_eq!(saved["instances"][1]["x"], 0.0);
    assert_eq!(saved["instances"][1]["y"], 14.0);
    for canvas in [
        serde_json::json!({"width":0,"height":1080}),
        serde_json::json!({"width":1920,"height":40000}),
        serde_json::json!({"width":"bad","height":1080}),
    ] {
        let mut invalid = saved.clone();
        invalid["canvasResolution"] = canvas;
        replace_layout(&path, &invalid);
        let bytes = std::fs::read(&path).unwrap();
        let view = state.view(access);
        assert_eq!(
            state.add(WidgetKind::Delta, &view.revision, access),
            Err(HostError::Protected)
        );
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
}
#[test]
fn undo_cannot_restore_a_removed_pro_without_the_current_right() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["settings"]["kind"] = serde_json::json!("radar");
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    let pro = Some(CatalogAccess::Pro);
    let view = state.view(pro);
    let removed = state
        .edit(Edit::Remove("widget-1".into()), &view.revision, pro)
        .unwrap();
    let bytes = std::fs::read(&path).unwrap();
    assert_eq!(
        state.edit(Edit::Undo, &removed.revision, Some(CatalogAccess::Free)),
        Err(HostError::Denied)
    );
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
#[test]
fn off_track_is_saved_in_native_spelling_and_projection_clamps_without_rewriting() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["opacity"] = serde_json::json!(2.5);
    value["instances"][0]["geometry"]["size"] = serde_json::json!({"width":40000,"height":50000});
    replace_layout(&path, &value);
    let before = std::fs::read(&path).unwrap();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    assert_eq!(view.state, StudioState::Ready);
    assert_eq!(view.instances[0].opacity, 100);
    assert_eq!(
        view.instances[0].size,
        OverlaySize {
            width: 3840,
            height: 2160
        }
    );
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let changed = state
        .edit(
            Edit::Instance(
                "widget-1".into(),
                InstancePatch::OffTrack(OffTrack::AlwaysVisible),
            ),
            &view.revision,
            access,
        )
        .unwrap();
    assert_eq!(changed.instances[0].off_track, OffTrack::AlwaysVisible);
    assert_eq!(layout(&path)["instances"][0]["offTrack"], "always_visible");
}
