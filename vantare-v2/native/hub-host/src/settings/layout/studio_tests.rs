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
    assert_eq!(view.instances[0].size.as_ref().unwrap().width, 338);
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
fn adding_waits_for_native_defaults_without_creating_placeholder_settings() {
    let (_root, path, bytes) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let view = state.view(access);
    assert_eq!(
        state.edit(Edit::Add(WidgetKind::Delta), &view.revision, access),
        Err(HostError::Protected)
    );
    assert_eq!(std::fs::read(path).unwrap(), bytes);
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
        b"2"
    );
    assert!(!state.track(false, access).unwrap().showing);
    assert!(!path.with_extension("show.json").exists());
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}
