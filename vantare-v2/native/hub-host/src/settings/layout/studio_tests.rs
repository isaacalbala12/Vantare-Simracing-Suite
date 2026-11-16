use super::*;

#[test]
fn driving_content_writer_matches_native_normalization_and_undo_bytes() {
    use serde_json::{Value, json};
    use vantare_domain::widget_settings as native;
    for legacy in [false, true] {
        for patch in [
            json!({"kind":"delta","reference":"leader"}),
            json!({"kind":"delta","showSectors":false}),
            json!({"kind":"pedals","showBrakePeak":false}),
            json!({"kind":"pedals","gap":2.7}),
        ] {
            let root = crate::test_support::Root::new();
            let path = root.path.join("layout.json");
            let kind = patch["kind"].as_str().unwrap();
            let mut settings = if kind == "delta" {
                json!({"kind":"delta","designSystem":"vantare","size":"expanded",
                    "reference":"optimal","showSectors":true})
            } else {
                json!({"kind":"pedals","designSystem":"vantare","gap":2.7,
                    "showBrakePeak":true})
            };
            if !legacy && kind == "delta" {
                settings["contentVersion"] = json!(1);
            }
            if patch.get("gap").is_some() {
                settings["gap"] = json!(1.5);
            }
            if legacy && kind == "pedals" {
                settings.as_object_mut().unwrap().remove("designSystem");
            }
            settings["future"] = json!({"z":1,"a":[2,3]});
            let before = serde_json::to_vec(&json!({"version":1,"futureRoot":42,
                "instances":[{"id":"widget-1","x":12,"y":24,"settings":settings}]}))
            .unwrap();
            std::fs::write(&path, &before).unwrap();
            // Independent GPUI operation: normalize, assign the chosen field,
            // normalize again and serialize through the native struct.
            let mut expected: Value = if kind == "delta" {
                let mut data: native::delta::Settings =
                    serde_json::from_value(settings.clone()).unwrap();
                data = data.normalized();
                if patch.get("reference").is_some() {
                    data.reference = "leader".into();
                } else {
                    data.show_sectors = false;
                }
                serde_json::from_str(&serde_json::to_string(&data.normalized()).unwrap()).unwrap()
            } else {
                let mut data: native::pedals::Settings =
                    serde_json::from_value(settings.clone()).unwrap();
                data = data.normalized();
                if patch.get("gap").is_some() {
                    data.gap = 2.7;
                } else {
                    data.show_brake_peak = false;
                }
                serde_json::from_str(&serde_json::to_string(&data.normalized()).unwrap()).unwrap()
            };
            expected["kind"] = json!(kind);
            expected["future"] = settings["future"].clone();
            let access = Some(CatalogAccess::Pro);
            let mut state = State::new(path.clone());
            let current = state.view(access);
            let edit = || {
                Edit::Instance(
                    "widget-1".into(),
                    InstancePatch::Settings(Box::new(
                        serde_json::from_value(patch.clone()).unwrap(),
                    )),
                )
            };
            let changed = state.edit(edit(), &current.revision, access).unwrap();
            let saved = std::fs::read(&path).unwrap();
            let actual: Value = serde_json::from_slice(&saved).unwrap();
            assert_eq!(
                actual["instances"][0]["settings"], expected,
                "{patch}, legacy={legacy}"
            );
            assert_eq!(actual["futureRoot"], 42);
            assert_eq!(actual["instances"][0]["x"], 12);
            if kind == "pedals" {
                assert!(std::str::from_utf8(&saved).unwrap().contains("\"gap\":2.7"));
            }
            assert!(state.edit(edit(), &current.revision, access).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), saved);
            let noop = state.edit(edit(), &changed.revision, access).unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), saved);
            state.edit(Edit::Undo, &noop.revision, access).unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), before);
        }
    }
}

pub(super) fn fixture() -> (crate::test_support::Root, std::path::PathBuf, Vec<u8>) {
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    let bytes=br#"{"version":1,"instances":[{"id":"widget-1","x":48.5,"y":62.0,"settings":{"kind":"standings","private":{"a":  1.00}},"geometry":{"size":{"width":338.0,"height":304.0},"aspectLocked":true},"future":{"path":"C:/Users/private"}}],"futureRoot":{"x":  2.50}}"#.to_vec();
    std::fs::write(&path, &bytes).expect("layout fixture");
    (root, path, bytes)
}
#[test]
fn visibility_undo_redo_preserves_opaque_fields_and_projects_only_closed_geometry() {
    let (_root, path, before) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    assert_eq!(view.state, StudioState::Ready);
    assert_eq!(f64::from(view.instances[0].size.width), 338.0);
    assert_eq!(f64::from(view.instances[0].x), 48.5);
    assert_eq!(f64::from(view.instances[0].y), 62.0);
    assert!(view.instances[0].aspect_locked);
    let projected = serde_json::to_string(&view).unwrap();
    for private in ["Users", "futureRoot", "private"] {
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
    let opened = Open::read(&path, crate::studio::monitor::snapshot, None).unwrap();
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

pub(super) fn layout(path: &Path) -> serde_json::Value {
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}
pub(super) fn replace_layout(path: &Path, value: &serde_json::Value) {
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
    assert_eq!(removed.instances, [] as [crate::studio::OverlayInstance; 0]);
    assert_eq!(
        layout(&path)["instances"].as_array().unwrap().as_slice(),
        [] as [serde_json::Value; 0]
    );
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
        assert_eq!(view.state, StudioState::Protected);
        assert_eq!(
            state.add(
                WidgetKind::Delta,
                &vantare_services::content_hash(&bytes),
                access
            ),
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
            width: 3840_u32.into(),
            height: 2160_u32.into()
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

#[test]
fn typed_settings_read_never_seeds_and_sparse_write_uses_existing_cas() {
    let (_root, path, before) = fixture();
    let access = Some(CatalogAccess::Pro);
    let mut state = State::new(path.clone());
    let view = state.view(access);
    assert!(view.instances[0].settings.is_some());
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let update = InstancePatch::Settings(Box::new(
        serde_json::from_value(serde_json::json!({"kind":"standings","rowCount":21})).unwrap(),
    ));
    assert!(matches!(
        state.edit(
            Edit::Instance("widget-1".into(), update.clone()),
            &"f".repeat(64),
            access
        ),
        Err(HostError::StudioConflict { .. })
    ));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let changed = state
        .edit(
            Edit::Instance("widget-1".into(), update),
            &view.revision,
            access,
        )
        .unwrap();
    assert_ne!(changed.revision, view.revision);
    let saved: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let settings = &saved["instances"][0]["settings"];
    let native: vantare_domain::widget_settings::standings::Settings =
        serde_json::from_value(settings.clone()).unwrap();
    assert_eq!(native.row_count, 21);
    assert_eq!(settings["private"]["a"], 1.0);
    assert!(settings.get("brandVisible").is_none());
    let undo = state.edit(Edit::Undo, &changed.revision, access).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert_eq!(undo.revision, view.revision);
}
#[test]
fn projected_settings_that_exceed_the_transport_become_protected() {
    let (_root, path, _) = fixture();
    let mut document: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    document["instances"][0]["settings"]["columns"] =
        serde_json::json!([{"id":"x".repeat(crate::frame::LIMIT+1),"metricId":"driverName"}]);
    let bytes = serde_json::to_vec(&document).unwrap();
    std::fs::write(&path, &bytes).unwrap();
    let view = State::new(path.clone()).view(Some(CatalogAccess::Pro));
    assert_eq!(view.state, StudioState::Protected);
    assert_eq!(view.instances, [] as [crate::studio::OverlayInstance; 0]);
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    assert!(crate::studio::widget_settings::fits_view(&view));
    let mut state = State::new(path.clone());
    let update = InstancePatch::Settings(Box::new(
        serde_json::from_value(serde_json::json!({"kind":"standings","rowCount":21})).unwrap(),
    ));
    assert!(matches!(
        state.edit(
            Edit::Instance("widget-1".into(), update),
            &vantare_services::content_hash(&bytes),
            Some(CatalogAccess::Pro)
        ),
        Err(HostError::Protected)
    ));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
}

#[test]
fn native_serialization_and_host_projection_round_trip_all_five_families() {
    use vantare_domain::widget_settings as native;
    fn round_trip<T: Serialize + DeserializeOwned>(kind: WidgetKind, settings: T) {
        let mut stored = serde_json::to_value(&settings).unwrap();
        stored["kind"] = serde_json::to_value(kind).unwrap();
        let raw: Fields = serde_json::from_value(stored).unwrap();
        let projected = typed_settings(kind, &raw).unwrap().unwrap();
        let decoded: T = serde_json::from_value(serde_json::to_value(projected).unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(decoded).unwrap(),
            serde_json::to_value(settings).unwrap()
        );
    }
    macro_rules! family {
        ($kind:expr,$ty:ty) => {{
            round_trip($kind, <$ty>::default().normalized());
            let fixture = crate::widget_defaults::get($kind.id()).unwrap();
            round_trip(
                $kind,
                serde_json::from_str::<$ty>(fixture.settings.get()).unwrap(),
            );
        }};
    }
    family!(WidgetKind::Standings, native::standings::Settings);
    family!(WidgetKind::Relative, native::relative::Settings);
    family!(WidgetKind::Delta, native::delta::Settings);
    family!(WidgetKind::Pedals, native::pedals::Settings);
    family!(WidgetKind::FuelStrategy, native::fuel_strategy::Settings);
}
#[test]
fn absence_preserves_session_inheritance_and_the_native_legacy_pedals_look() {
    let stored:Fields=serde_json::from_value(serde_json::json!({"kind":"standings","contentVersion":1,"columns":[{"id":"custom","metricId":"gap"}]})).unwrap();
    let value = serde_json::to_value(
        typed_settings(WidgetKind::Standings, &stored)
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert!(value.get("practiceColumns").is_none());
    assert!(value.get("qualifyingColumns").is_none());
    assert_eq!(value["columns"][0]["id"], "custom");
    let pedals: Fields = serde_json::from_value(serde_json::json!({"kind":"pedals"})).unwrap();
    let value = serde_json::to_value(
        typed_settings(WidgetKind::Pedals, &pedals)
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    let native: vantare_domain::widget_settings::pedals::Settings =
        serde_json::from_str("{}").unwrap();
    assert_eq!(
        value["designSystem"],
        serde_json::to_value(native.design_system).unwrap()
    );
}

fn complete_writer_fixture(document: &mut serde_json::Value, fixture: &str) -> String {
    // The families fixture contains Settings only, without required layout
    // coordinates. Keep that original protected; mount its exact settings
    // in a complete layout for the writer oracle, without changing fixtures.
    let missing_coordinates = document["instances"]
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item.get("x").is_none() || item.get("y").is_none());
    if missing_coordinates {
        let root = crate::test_support::Root::new();
        let path = root.path.join("layout.json");
        std::fs::write(&path, fixture).unwrap();
        assert_eq!(
            State::new(path.clone())
                .view(Some(CatalogAccess::Pro))
                .state,
            StudioState::Protected
        );
        assert_eq!(std::fs::read(&path).unwrap(), fixture.as_bytes());
        for item in document["instances"].as_array_mut().unwrap() {
            item["x"] = serde_json::json!(0.0);
            item["y"] = serde_json::json!(0.0);
        }
        serde_json::to_string(document).unwrap()
    } else {
        fixture.to_owned()
    }
}

#[test]
fn writer_matches_native_for_real_fixtures_and_noops_preserve_every_byte() {
    use vantare_domain::widget_settings as native;
    let mut look_families = std::collections::BTreeSet::new();
    for fixture in [
        include_str!("../../../../ui/fixtures/layouts/native-beta-v0.0.975.json"),
        include_str!("../../../../packaging/fixtures/layout.golden.json"),
        include_str!("../../../../ui/fixtures/layouts/widget-settings-families.json"),
    ] {
        let mut document: serde_json::Value = serde_json::from_str(fixture).unwrap();
        let input = complete_writer_fixture(&mut document, fixture);
        let mut processed = 0;
        for index in 0..document["instances"].as_array().unwrap().len() {
            let settings = &document["instances"][index]["settings"];
            let kind: WidgetKind = serde_json::from_value(settings["kind"].clone()).unwrap();
            // This oracle changes Look/accent, supported by the original five
            // families. D106's other controls have separate native writer vectors.
            if !matches!(
                kind,
                WidgetKind::Standings
                    | WidgetKind::Relative
                    | WidgetKind::Delta
                    | WidgetKind::Pedals
                    | WidgetKind::FuelStrategy
            ) {
                continue;
            }
            look_families.insert(kind.id());
            processed += 1;
            let root = crate::test_support::Root::new();
            let path = root.path.join("layout.json");
            std::fs::write(&path, &input).unwrap();
            let mut state = State::new(path.clone());
            let access = Some(CatalogAccess::Pro);
            let current = state.view(access);
            assert_eq!(current.state, StudioState::Ready);
            let id = document["instances"][index]["id"].as_str().unwrap();
            let empty = serde_json::from_value(serde_json::json!({"kind":kind})).unwrap();
            let noop = state
                .edit(
                    Edit::Instance(id.into(), InstancePatch::Settings(Box::new(empty))),
                    &current.revision,
                    access,
                )
                .unwrap();
            assert_eq!(std::fs::read(&path).unwrap(), input.as_bytes());
            assert!(!noop.can_undo && !noop.can_redo);
            let accent = if settings["accent"] == "white" {
                native::look::Accent::Red
            } else {
                native::look::Accent::White
            };
            macro_rules! oracle {
                ($ty:ty) => {{
                    let mut data = serde_json::from_value::<$ty>(settings.clone())
                        .unwrap()
                        .normalized();
                    data.accent = accent;
                    serde_json::from_str::<serde_json::Value>(
                        &serde_json::to_string(&data.normalized()).unwrap(),
                    )
                    .unwrap()
                }};
            }
            let mut expected = match kind {
                WidgetKind::Standings => oracle!(native::standings::Settings),
                WidgetKind::Relative => oracle!(native::relative::Settings),
                WidgetKind::Delta => oracle!(native::delta::Settings),
                WidgetKind::Pedals => oracle!(native::pedals::Settings),
                WidgetKind::FuelStrategy => oracle!(native::fuel_strategy::Settings),
                _ => unreachable!(),
            };
            expected["kind"] = settings["kind"].clone();
            let update =
                serde_json::from_value(serde_json::json!({"kind":kind,"accent":accent})).unwrap();
            state
                .edit(
                    Edit::Instance(id.into(), InstancePatch::Settings(Box::new(update))),
                    &current.revision,
                    access,
                )
                .unwrap();
            let mut actual: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert_eq!(actual["instances"][index]["settings"], expected);
            actual["instances"][index]["settings"] = settings.clone();
            assert_eq!(actual, document);
        }
        assert!(processed > 0, "fixture must exercise the writer");
    }
    assert_eq!(
        look_families.len(),
        5,
        "every original Look family remains covered"
    );
}
#[test]
fn unreadable_supported_settings_protect_the_whole_document_without_creating_files() {
    for bytes in [
        br#"{"version":1,"instances":[{"id":"widget-1","x":0,"y":0,"settings":{"kind":"pedals","gap":"broken"}}]}"#.as_slice(),
        br#"{"version":1,"instances":[],"instances":[]}"#.as_slice(),
    ] {
        let root = crate::test_support::Root::new();
        let path = root.path.join("layout.json");
        std::fs::write(&path, bytes).unwrap();
        let entries = || {
            let mut names: Vec<_> = std::fs::read_dir(&root.path)
                .unwrap()
                .map(|entry| entry.unwrap().file_name())
                .collect();
            names.sort();
            names
        };
        let before = entries();
        let mut state = State::new(path.clone());
        let access = Some(CatalogAccess::Pro);
        let view = state.view(access);
        assert_eq!(view.state, StudioState::Protected);
        assert_eq!(view.instances, [] as [crate::studio::OverlayInstance; 0]);
        let update = serde_json::from_value(serde_json::json!({"kind":"pedals","gap":2.7}))
            .unwrap();
        assert!(matches!(
            state.edit(
                Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))),
                &vantare_services::content_hash(bytes),
                access,
            ),
            Err(HostError::Protected)
        ));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(before, entries());
    }
}

#[test]
fn free_plan_cannot_edit_paid_fuel_settings() {
    let (_root, path, _) = fixture();
    let mut doc: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    doc["instances"][0]["settings"] = serde_json::json!({"kind":"fuel-strategy"});
    let bytes = serde_json::to_vec(&doc).unwrap();
    std::fs::write(&path, &bytes).unwrap();
    let mut state = State::new(path.clone());
    let view = state.view(Some(CatalogAccess::Free));
    assert!(view.instances[0].locked);
    let update =
        serde_json::from_value(serde_json::json!({"kind":"fuel-strategy","historyRows":3}))
            .unwrap();
    assert!(matches!(
        state.edit(
            Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))),
            &view.revision,
            Some(CatalogAccess::Free)
        ),
        Err(HostError::Denied)
    ));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
}

#[test]
fn writer_bytes_studio_retains_opaque_objects_and_sorts_owned_fields() {
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    std::fs::write(&path,br#"{"version":1,"future":{"z":0, "a":1},"instances":[{"id":"widget-1","x":1.0,"y":2.0,"future":{"z":0, "a":1},"settings":{"kind":"standings","private":{"z":0, "a":1}}}]}"#).unwrap();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let current = state.view(access);
    assert_eq!(current.state, StudioState::Ready);
    state
        .edit(
            Edit::Instance("widget-1".into(), InstancePatch::Opacity(50)),
            &current.revision,
            access,
        )
        .unwrap();
    assert_eq!(
        std::fs::read(&path).unwrap(),
        include_bytes!("../../../fixtures/writer-bytes/studio-opacity.json")
    );
}

#[test]
fn writer_bytes_studio_typed_settings_keep_native_float_and_unknown_object_bytes() {
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    std::fs::write(&path,br#"{"version":1,"instances":[{"id":"widget-1","x":1.0,"y":2.0,"settings":{"kind":"pedals","designSystem":"vantare","style":"neo","accent":"red","transparentBackground":false,"showBrakePeak":true,"gap":2.0,"future":{"z":0, "a":1}}}]}"#).unwrap();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    let update = serde_json::from_str(r#"{"kind":"pedals","gap":2.7}"#).unwrap();
    state
        .edit(
            Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))),
            &view.revision,
            access,
        )
        .unwrap();
    assert_eq!(
        std::fs::read(&path).unwrap(),
        include_bytes!("../../../fixtures/writer-bytes/studio-settings.json")
    );
}

#[test]
fn design_system_patch_matches_native_set_look_for_all_families_and_legacy() {
    use vantare_domain::widget_settings as native;
    let cases: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../../fixtures/studio-look-cases.json")).unwrap();
    assert_eq!(cases.len(), 13);
    for case in cases {
        let settings = &case["settings"];
        let kind: WidgetKind = serde_json::from_value(settings["kind"].clone()).unwrap();
        let look: native::look::Look = serde_json::from_value(case["look"].clone()).unwrap();
        // Independent oracle: GPUI set_look assigns only design_system to the
        // normalized settings read from disk, then its writer normalizes again.
        macro_rules! oracle {
            ($ty:ty) => {{
                let mut value = serde_json::from_value::<$ty>(settings.clone())
                    .unwrap()
                    .normalized();
                value.design_system = look;
                serde_json::from_str::<serde_json::Value>(
                    &serde_json::to_string(&value.normalized()).unwrap(),
                )
                .unwrap()
            }};
        }
        let mut expected = match kind {
            WidgetKind::Standings => oracle!(native::standings::Settings),
            WidgetKind::Relative => oracle!(native::relative::Settings),
            WidgetKind::Delta => oracle!(native::delta::Settings),
            WidgetKind::Pedals => oracle!(native::pedals::Settings),
            WidgetKind::FuelStrategy => oracle!(native::fuel_strategy::Settings),
            _ => panic!("unsupported golden kind"),
        };
        expected["kind"] = settings["kind"].clone();
        let (_root, path, bytes) = fixture();
        let mut document: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        document["instances"][0]["settings"] = settings.clone();
        document["instances"][0]["settings"]["futureLookMember"] = serde_json::json!({"keep":17});
        std::fs::write(&path, serde_json::to_vec(&document).unwrap()).unwrap();
        let access = Some(CatalogAccess::Pro);
        let mut state = State::new(path.clone());
        let before = state.view(access);
        assert_eq!(before.state, StudioState::Ready, "{}", case["name"]);
        let update =
            serde_json::from_value(serde_json::json!({"kind":kind,"designSystem":look})).unwrap();
        let saved = state
            .edit(
                Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))),
                &before.revision,
                access,
            )
            .unwrap();
        assert!(saved.can_undo, "{}", case["name"]);
        let mut actual: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        expected["futureLookMember"] = serde_json::json!({"keep":17});
        assert_eq!(
            actual["instances"][0]["settings"], expected,
            "{}",
            case["name"]
        );
        actual["instances"][0]["settings"] = document["instances"][0]["settings"].clone();
        assert_eq!(actual, document, "other layout members: {}", case["name"]);
    }
}

#[test]
fn duplicate_preserves_opaque_fields_and_native_rates_with_one_undo() {
    use serde_json::{Value, json};
    for hz in [None, Some(0_u16), Some(40), Some(60)] {
        let (_root, path, bytes) = fixture();
        let source_rate = hz.map_or_else(String::new, |hz| format!("\"widget-1\":{hz},"));
        let text = String::from_utf8(bytes).expect("fixture").replace(
            "\"futureRoot\"", &format!("\"performance\":{{\"level\":\"balanced\",\"widgets\":{{{source_rate}\"widget-2\":15}}}},\"futureRoot\""),
        );
        let before = text.into_bytes();
        std::fs::write(&path, &before).expect("fixture with orphan rate");
        let mut state = State::new(path.clone());
        let access = Some(CatalogAccess::Pro);
        let view = state.view(access);
        assert_eq!(view.state, StudioState::Ready, "supported layout fixture");
        let (changed, added) = state
            .duplicate("widget-1", &view.revision, access)
            .expect("duplicate");
        assert_eq!(added, "widget-3", "do not inherit an orphan override");
        assert_eq!(changed.instances.len(), 2);
        let copy = changed
            .instances
            .iter()
            .find(|item| item.id == added)
            .expect("added widget");
        assert_eq!((f64::from(copy.x), f64::from(copy.y)), (68.5, 82.0));
        assert_eq!(copy.frequency.override_hz, hz);
        let saved = std::fs::read(&path).expect("saved copy");
        let actual: Value = serde_json::from_slice(&saved).expect("layout");
        let mut expected = actual["instances"][0].clone();
        expected["id"] = json!(added);
        expected["x"] = json!(68.5);
        expected["y"] = json!(82.0);
        assert_eq!(actual["instances"][1], expected);
        assert_eq!(actual["performance"]["widgets"]["widget-2"], 15);
        let text = std::str::from_utf8(&saved).expect("utf8");
        assert_eq!(text.matches(r#"{"a":  1.00}"#).count(), 2);
        assert!(text.contains(r#"{"x":  2.50}"#));
        assert!(
            !serde_json::to_string(&changed)
                .expect("closed view")
                .contains("Users")
        );
        assert_eq!(state.undo.len(), 1);
        assert!(matches!(
            state.duplicate("widget-1", &view.revision, access),
            Err(HostError::StudioConflict { .. })
        ));
        assert_eq!(std::fs::read(&path).expect("no retry"), saved);
        assert_eq!(state.undo.len(), 1);
        let undone = state
            .edit(Edit::Undo, &changed.revision, access)
            .expect("undo");
        assert_eq!(std::fs::read(&path).expect("original bytes"), before);
        state
            .edit(Edit::Redo, &undone.revision, access)
            .expect("redo");
        assert_eq!(std::fs::read(&path).expect("same copy bytes"), saved);
    }
}

#[test]
fn duplicate_uses_existing_bounds_for_offsets_at_the_edge_and_custom_canvases() {
    use serde_json::{Value, json};
    for (position, canvas, expected) in [
        ((1900.0, 1060.0), (1920.0, 1080.0), (1582.0, 776.0)),
        ((-60.0, -50.0), (1920.0, 1080.0), (0.0, 0.0)),
        ((700.0, 500.0), (800.0, 600.0), (462.0, 296.0)),
    ] {
        let (_root, path, bytes) = fixture();
        let mut document: Value = serde_json::from_slice(&bytes).expect("layout");
        document["instances"][0]["x"] = json!(position.0);
        document["instances"][0]["y"] = json!(position.1);
        document["canvasResolution"] = json!({"width":canvas.0,"height":canvas.1});
        std::fs::write(&path, serde_json::to_vec(&document).expect("fixture")).expect("write");
        let mut state = State::new(path);
        let access = Some(CatalogAccess::Pro);
        let before = state.view(access);
        let (after, added) = state
            .duplicate("widget-1", &before.revision, access)
            .expect("clamped duplicate");
        let copy = after
            .instances
            .iter()
            .find(|item| item.id == added)
            .expect("copy");
        assert_eq!((f64::from(copy.x), f64::from(copy.y)), expected);
        assert_eq!(
            copy.canvas_placement,
            crate::studio::CanvasPlacement::Inside
        );
        assert_eq!(state.undo.len(), 1);
    }
}

#[test]
fn duplicate_rejects_missing_or_locked_sources_and_instance_limit() {
    use serde_json::{Value, json};
    let (_root, path, bytes) = fixture();
    let mut document: Value = serde_json::from_slice(&bytes).expect("layout");
    document["instances"][0]["settings"] = serde_json::from_str(
        crate::widget_defaults::get("radar")
            .expect("native defaults")
            .settings
            .get(),
    )
    .expect("settings");
    let before = serde_json::to_vec(&document).expect("fixture");
    std::fs::write(&path, &before).expect("write");
    let mut state = State::new(path.clone());
    let view = state.view(Some(CatalogAccess::Free));
    assert!(view.instances[0].locked);
    for (source, access) in [
        ("widget-1", Some(CatalogAccess::Free)),
        ("widget-1", None),
        ("absent", Some(CatalogAccess::Pro)),
    ] {
        assert_eq!(
            state.duplicate(source, &view.revision, access),
            Err(HostError::Denied)
        );
        assert_eq!(std::fs::read(&path).expect("unchanged"), before);
        assert_eq!(state.undo, Vec::<Vec<u8>>::new());
    }
    let original = document["instances"][0].clone();
    document["instances"] = Value::Array(
        (1..=INSTANCE_LIMIT)
            .map(|n| {
                let mut item = original.clone();
                item["id"] = json!(format!("widget-{n}"));
                item
            })
            .collect(),
    );
    std::fs::write(&path, serde_json::to_vec(&document).expect("limit fixture")).expect("write");
    let mut opened =
        Open::read(&path, crate::studio::monitor::snapshot, None).expect("read bounded layout");
    assert_eq!(
        duplicate(&mut opened, "widget-1", Some(CatalogAccess::Pro)),
        Err(HostError::Denied)
    );
}

#[test]
fn duplicate_session_alerts_remains_two_to_four_through_the_canonical_reader() {
    use serde_json::{Value, json};
    use vantare_ipc::layout::Layout;
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    let settings: Value = serde_json::from_str(
        crate::widget_defaults::get("session-alerts")
            .expect("defaults")
            .settings
            .get(),
    )
    .expect("settings");
    let seed = serde_json::to_vec(
        &json!({"version":1,"instances":[{"id":"widget-1","x":48.5,"y":62.0,"settings":settings}]}),
    )
    .expect("seed");
    let mut original = Layout::from_json(&seed).expect("canonical parent and mini");
    assert_eq!(original.instances.len(), 2);
    original.instances[1].x = 1400.0;
    original.instances[1].y = 100.0;
    let before = serde_json::to_vec(&original).expect("original layout");
    std::fs::write(&path, &before).expect("write");
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    let (after, added) = state
        .duplicate("widget-1", &view.revision, access)
        .expect("copy parent only");
    assert_eq!(after.instances.len(), 2, "only selectable instances");
    let saved = std::fs::read(&path).expect("saved");
    let raw: Value = serde_json::from_slice(&saved).expect("raw document");
    assert_eq!(
        raw["instances"].as_array().expect("instances").len(),
        3,
        "host does not normalize"
    );
    let effective = Layout::from_json(&saved).expect("existing normalizer creates mini");
    assert_eq!(effective.instances.len(), 4);
    let mini = effective
        .instances
        .iter()
        .find(|item| item.id == format!("{added}-mini"))
        .expect("new mini");
    assert_eq!((mini.x, mini.y), (1694.0, 92.0));
    let serialized = serde_json::to_value(&mini.settings).expect("settings");
    assert_eq!(serialized["companionFor"], added);
    assert_eq!(
        (effective.instances[1].x, effective.instances[1].y),
        (1400.0, 100.0)
    );
    state
        .edit(Edit::Undo, &after.revision, access)
        .expect("one undo");
    assert_eq!(std::fs::read(&path).expect("original bytes"), before);
}

#[test]
fn duplicate_session_alerts_reserves_the_implicit_mini_identity() {
    use serde_json::{Value, json};
    use vantare_ipc::layout::Layout;
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    let settings: Value = serde_json::from_str(
        crate::widget_defaults::get("session-alerts")
            .expect("defaults")
            .settings
            .get(),
    )
    .expect("settings");
    let other: Value = serde_json::from_str(
        crate::widget_defaults::get("radar")
            .expect("defaults")
            .settings
            .get(),
    )
    .expect("settings");
    let seed = serde_json::to_vec(&json!({"version":1,"instances":[
        {"id":"widget-1","x":48.5,"y":62.0,"settings":settings},
        {"id":"widget-2-mini","x":100,"y":200,"settings":other}
    ]}))
    .expect("seed");
    let original = Layout::from_json(&seed).expect("canonical layout");
    std::fs::write(&path, serde_json::to_vec(&original).expect("layout")).expect("write");
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    let (_, added) = state
        .duplicate("widget-1", &view.revision, access)
        .expect("unused parent and mini pair");
    assert_eq!(added, "widget-3");
    let effective =
        Layout::from_json(&std::fs::read(&path).expect("saved")).expect("effective layout");
    assert_eq!(effective.instances.len(), 5);
    assert!(
        effective
            .instances
            .iter()
            .any(|item| item.id == "widget-3-mini")
    );
    assert_eq!(
        effective
            .instances
            .iter()
            .filter(|item| item.id == "widget-2-mini")
            .count(),
        1
    );
    assert_eq!(
        effective
            .instances
            .iter()
            .find(|item| item.id == "widget-2-mini")
            .expect("untouched")
            .settings,
        original.instances[1].settings
    );
}

#[test]
fn column_format_vectors_write_through_state_and_restore_exact_bytes() {
    use serde_json::{Value, json};
    let access = Some(CatalogAccess::Pro);
    for key in ["columns", "practiceColumns", "qualifyingColumns"] {
        for metric in ["lastLap", "bestLap"] {
            for case in crate::studio::widget_settings::column_format_cases()
                .as_array()
                .unwrap()
            {
                let root = crate::test_support::Root::new();
                let path = root.path.join("layout.json");
                let column = json!({"id":"saved","metricId":metric,"format":{
                    "mode":"surname","maxChars":null,"display":"compact","decimals":1,"future":7}});
                let before = serde_json::to_vec(&json!({"version":1,"instances":[{
                    "id":"widget-1","x":10,"y":20,"settings":{"kind":"standings",
                    "columns":[column.clone()],"practiceColumns":[column.clone()],
                    "qualifyingColumns":[column]}}]}))
                .unwrap();
                std::fs::write(&path, &before).unwrap();
                let mut state = State::new(path.clone());
                let view = state.view(access);
                let update =
                    json!({"kind":"standings",key:[{"metric":metric,"format":case["format"]}]});
                let parsed = serde_json::from_value::<crate::studio::WidgetSettingsPatch>(update);
                let result = parsed.map_err(|_| HostError::Denied).and_then(|p| {
                    state.edit(
                        Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(p))),
                        &view.revision,
                        access,
                    )
                });
                assert_eq!(
                    result.is_ok(),
                    case["accepted"].as_bool().unwrap(),
                    "{case}"
                );
                let saved = std::fs::read(&path).unwrap();
                if result.is_err() {
                    assert_eq!(saved, before);
                    assert!(!state.view(access).can_undo);
                    continue;
                }
                let actual: Value = serde_json::from_slice(&saved).unwrap();
                let mut expected: Value = serde_json::from_slice(&before).unwrap();
                for (field, value) in case["format"].as_object().unwrap() {
                    expected["instances"][0]["settings"][key][0]["format"][field] =
                        if field == "mode" && value.is_null() {
                            json!("")
                        } else {
                            value.clone()
                        };
                }
                for list in ["columns", "practiceColumns", "qualifyingColumns"] {
                    assert_eq!(
                        actual["instances"][0]["settings"][list][0]["format"],
                        expected["instances"][0]["settings"][list][0]["format"]
                    );
                }
                if saved != before {
                    let revision = state.view(access).revision;
                    state.edit(Edit::Undo, &revision, access).unwrap();
                    assert_eq!(std::fs::read(&path).unwrap(), before);
                    let revision = state.view(access).revision;
                    state.edit(Edit::Redo, &revision, access).unwrap();
                    assert_eq!(std::fs::read(&path).unwrap(), saved);
                }
            }
        }
    }
}

#[test]
fn column_formats_fail_closed_without_writing_or_history() {
    use serde_json::json;
    let (_root, path, before) = fixture();
    let access = Some(CatalogAccess::Pro);
    let mut state = State::new(path.clone());
    let view = state.view(access);
    let edit = || {
        Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(
        serde_json::from_value(json!({"kind":"standings","columns":[{"metric":"lastLap","format":{"display":"compact","decimals":2}}]})).unwrap())))
    };
    assert!(matches!(
        state.edit(edit(), &"0".repeat(64), access),
        Err(HostError::StudioConflict { .. })
    ));
    assert!(matches!(
        state.edit(edit(), &view.revision, None),
        Err(HostError::Denied)
    ));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert!(!state.view(access).can_undo);
    std::fs::write(&path, b"broken").unwrap();
    assert!(matches!(
        state.edit(edit(), &vantare_services::content_hash(b"broken"), access),
        Err(HostError::Protected)
    ));
    assert_eq!(std::fs::read(&path).unwrap(), b"broken");
}

#[test]
fn time_format_override_detaches_only_the_chosen_session() {
    use serde_json::{Value, json};
    let root = crate::test_support::Root::new();
    let path = root.path.join("layout.json");
    let bytes = serde_json::to_vec(
        &json!({"version":1,"instances":[{"id":"widget-1","x":10,"y":20,
        "settings":{"kind":"standings","columns":[{"id":"saved","metricId":"lastLap",
        "format":{"mode":"","maxChars":null,"display":"compact","decimals":1,"future":7}}]}}]}),
    )
    .unwrap();
    std::fs::write(&path, &bytes).unwrap();
    let access = Some(CatalogAccess::Pro);
    let mut state = State::new(path.clone());
    let initial = state.view(access);
    assert_eq!(initial.state, StudioState::Ready);
    let revision = initial.revision;
    let update = serde_json::from_value(json!({"kind":"standings","practiceColumns":[{
        "metric":"lastLap","format":{"display":null,"decimals":null,"mode":null}}]}))
    .unwrap();
    let after = state
        .edit(
            Edit::Instance("widget-1".into(), InstancePatch::Settings(Box::new(update))),
            &revision,
            access,
        )
        .unwrap();
    let actual: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let settings = &actual["instances"][0]["settings"];
    assert_eq!(settings["columns"][0]["format"]["display"], "compact");
    assert!(settings["qualifyingColumns"].is_null());
    let format = &settings["practiceColumns"][0]["format"];
    let native = vantare_domain::widget_settings::columns::Format::default();
    assert_eq!(format["mode"], native.mode);
    assert_eq!(
        format["display"],
        serde_json::to_value(native.display).unwrap()
    );
    assert_eq!(
        format["decimals"],
        serde_json::to_value(native.decimals).unwrap()
    );
    assert_eq!(format["future"], 7);
    state.edit(Edit::Undo, &after.revision, access).unwrap();
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
