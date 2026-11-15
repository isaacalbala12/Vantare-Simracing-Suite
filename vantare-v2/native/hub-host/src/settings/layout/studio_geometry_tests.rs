use super::tests::{fixture, layout, replace_layout};
use super::*;
use crate::studio::{CanvasChoice, Coordinate, GeometryChange, Point, SizeMode};
fn n(value: f64) -> Coordinate {
    value.try_into().expect("finite coordinate")
}
fn edit(
    state: &mut State,
    change: GeometryChange,
    revision: &str,
) -> Result<StudioView, HostError> {
    state.edit(
        Edit::Geometry("widget-1".into(), change),
        revision,
        Some(CatalogAccess::Pro),
    )
}
#[test]
fn one_geometry_order_is_one_cas_and_one_undo_preserving_unknown_bytes() {
    let (_root, path, before) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let initial = state.view(access);
    let moved = edit(
        &mut state,
        GeometryChange::Move {
            x: n(120.25),
            y: n(-12.5),
        },
        &initial.revision,
    )
    .expect("move");
    assert_eq!(f64::from(moved.instances[0].x), 120.25);
    assert_eq!(
        moved.instances[0].canvas_placement,
        crate::studio::CanvasPlacement::Outside
    );
    assert_eq!(state.undo.len(), 1);
    let saved = std::fs::read(&path).expect("saved");
    let text = std::str::from_utf8(&saved).expect("UTF8");
    for raw in [
        r#"{"a":  1.00}"#,
        r#"{"x":  2.50}"#,
        r#"{"path":"C:/Users/private"}"#,
    ] {
        assert!(text.contains(raw));
    }
    let unchanged = edit(
        &mut state,
        GeometryChange::Move {
            x: n(120.25),
            y: n(-12.5),
        },
        &moved.revision,
    )
    .expect("no-op");
    assert_eq!(unchanged.revision, moved.revision);
    assert_eq!(state.undo.len(), 1);
    let undone = state
        .edit(Edit::Undo, &moved.revision, access)
        .expect("undo");
    assert_eq!(std::fs::read(&path).expect("bytes"), before);
    state
        .edit(Edit::Redo, &undone.revision, access)
        .expect("redo");
    assert_eq!(std::fs::read(&path).expect("bytes"), saved);
}
#[test]
fn stale_revision_conflicts_without_replay_or_mutation() {
    let (_root, path, _) = fixture();
    let mut a = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let old = a.view(access);
    let mut b = State::new(path.clone());
    let current = edit(
        &mut b,
        GeometryChange::Move {
            x: n(500.0),
            y: n(200.0),
        },
        &old.revision,
    )
    .expect("other writer");
    let bytes = std::fs::read(&path).expect("bytes");
    assert!(
        matches!(edit(&mut a,GeometryChange::Move{x:n(10.0),y:n(10.0)},&old.revision),Err(HostError::StudioConflict{current:conflict}) if conflict.revision==current.revision)
    );
    assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
    assert_eq!(a.undo.len(), 0);
}
#[test]
fn resize_enforces_aspect_and_limits_and_auto_preserves_extensions() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["geometry"]["future"] = serde_json::json!({"keep":[1,2]});
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let initial = state.view(access);
    let aspect = 338.0 / 304.0;
    let sized = edit(
        &mut state,
        GeometryChange::Resize {
            x: n(48.5),
            y: n(62.0),
            width: n(676.0),
            height: n(608.0),
        },
        &initial.revision,
    )
    .expect("resize");
    let item = &sized.instances[0];
    assert_eq!(item.size_mode, SizeMode::Explicit);
    assert!(f64::from(item.size.width) <= 3840.0 && f64::from(item.size.height) <= 2160.0 + 1e-9);
    assert!((f64::from(item.size.width) / f64::from(item.size.height) - aspect).abs() < 1e-9);
    let unlocked = edit(
        &mut state,
        GeometryChange::AspectLocked { value: false },
        &sized.revision,
    )
    .expect("unlock");
    let stretched = edit(
        &mut state,
        GeometryChange::Resize {
            x: n(48.5),
            y: n(62.0),
            width: n(64.0),
            height: n(2160.0),
        },
        &unlocked.revision,
    )
    .expect("bounded");
    assert_eq!(stretched.instances[0].size.width, 64_u32.into());
    assert_eq!(stretched.instances[0].size.height, 2160_u32.into());
    let auto = edit(&mut state, GeometryChange::AutoSize, &stretched.revision).expect("auto");
    assert_eq!(auto.instances[0].size_mode, SizeMode::Auto);
    assert!(!auto.instances[0].aspect_locked);
    assert_eq!(
        layout(&path)["instances"][0]["geometry"]["future"],
        serde_json::json!({"keep":[1,2]})
    );
}
#[test]
fn canvas_selection_and_anchors_are_durable_and_undoable() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    assert_eq!(before.canvas.expect("canvas").size(), (1920.0, 1080.0));
    let custom = state
        .edit(
            Edit::Canvas(CanvasChoice::Custom {
                width: n(2560.5),
                height: n(1440.0),
            }),
            &before.revision,
            access,
        )
        .expect("canvas");
    assert_eq!(custom.canvas.expect("canvas").size(), (2560.5, 1440.0));
    let anchored = edit(
        &mut state,
        GeometryChange::Anchor { column: 2, row: 2 },
        &custom.revision,
    )
    .expect("anchor");
    assert_eq!(f64::from(anchored.instances[0].x), 2560.5 - 338.0);
    assert_eq!(f64::from(anchored.instances[0].y), 1440.0 - 304.0);
    let monitor = state
        .edit(
            Edit::Canvas(CanvasChoice::Monitor),
            &anchored.revision,
            access,
        )
        .expect("follow monitor");
    assert!(layout(&path).get("canvasResolution").is_none());
    let undo = state
        .edit(Edit::Undo, &monitor.revision, access)
        .expect("undo canvas");
    assert_eq!(undo.canvas.expect("canvas").size(), (2560.5, 1440.0));
}
fn left_monitor() -> Vec<crate::studio::monitor::Monitor> {
    vec![crate::studio::monitor::Monitor {
        origin: (-1920.0, 0.0),
        size: (1920.0, 1080.0),
        primary: true,
    }]
}
#[test]
fn coordinates_are_canvas_local_and_explicit_drop_outside_has_no_effect() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["x"] = serde_json::json!(-1800.0);
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    state.monitor_source = left_monitor;
    let access = Some(CatalogAccess::Pro);
    let current = state.view(access);
    assert_eq!(f64::from(current.instances[0].x), 120.0);
    let moved = edit(
        &mut state,
        GeometryChange::Move {
            x: n(80.5),
            y: n(90.0),
        },
        &current.revision,
    )
    .expect("move");
    assert_eq!(
        layout(&path)["instances"][0]["x"],
        serde_json::json!(-1839.5)
    );
    let bytes = std::fs::read(&path).expect("bytes");
    assert_eq!(
        state.add_at(
            WidgetKind::Delta,
            Some(Point {
                x: n(-1.0),
                y: n(20.0)
            }),
            &moved.revision,
            access
        ),
        Err(HostError::Rejected)
    );
    assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
    let (added, id) = state
        .add_at(
            WidgetKind::Delta,
            Some(Point {
                x: n(400.25),
                y: n(70.0),
            }),
            &moved.revision,
            access,
        )
        .expect("drop");
    let item = added
        .instances
        .iter()
        .find(|item| item.id == id)
        .expect("added");
    assert_eq!(f64::from(item.x), 400.25);
    assert_eq!(
        layout(&path)["instances"][1]["x"],
        serde_json::json!(-1519.75)
    );
}
#[test]
fn bad_geometry_no_rights_and_missing_monitor_never_write() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let initial = state.view(access);
    let bytes = std::fs::read(&path).expect("bytes");
    for change in [
        GeometryChange::Anchor { column: 3, row: 0 },
        GeometryChange::Resize {
            x: n(1.0),
            y: n(1.0),
            width: n(0.0),
            height: n(20.0),
        },
    ] {
        assert_eq!(
            edit(&mut state, change, &initial.revision),
            Err(HostError::Rejected)
        );
        assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
    }
    assert_eq!(
        state.edit(
            Edit::Geometry("widget-1".into(), GeometryChange::AutoSize),
            &initial.revision,
            None
        ),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.edit(Edit::Canvas(CanvasChoice::Monitor), &initial.revision, None),
        Err(HostError::Denied)
    );
    let mut state = State::new(path.clone());
    state.monitor_source = Vec::new;
    assert_eq!(state.view(access).state, StudioState::Protected);
    assert_eq!(
        edit(
            &mut state,
            GeometryChange::Move {
                x: n(1.0),
                y: n(1.0)
            },
            &initial.revision
        ),
        Err(HostError::Protected)
    );
    assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
}
#[test]
fn resetting_a_component_with_unknown_fields_preserves_it_instead_of_dropping_data() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["geometry"]["size"]["future"] = serde_json::json!({"keep":true});
    value["canvasResolution"] =
        serde_json::json!({"width":1920,"height":1080,"future":{"keep":true}});
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let current = state.view(access);
    let bytes = std::fs::read(&path).expect("bytes");
    assert_eq!(
        edit(&mut state, GeometryChange::AutoSize, &current.revision),
        Err(HostError::Protected)
    );
    assert_eq!(
        state.edit(
            Edit::Canvas(CanvasChoice::Monitor),
            &current.revision,
            access
        ),
        Err(HostError::Protected)
    );
    assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
}

fn two_monitors() -> Vec<crate::studio::monitor::Monitor> {
    vec![
        crate::studio::monitor::Monitor {
            origin: (0.0, 0.0),
            size: (1920.0, 1080.0),
            primary: true,
        },
        crate::studio::monitor::Monitor {
            origin: (1920.0, 0.0),
            size: (2560.0, 1440.0),
            primary: false,
        },
    ]
}
#[test]
fn crossing_to_another_monitor_keeps_the_session_canvas_and_other_coordinates() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    let mut second = value["instances"][0].clone();
    second["id"] = serde_json::json!("widget-2");
    second["x"] = serde_json::json!(200);
    value["instances"]
        .as_array_mut()
        .expect("instances")
        .push(second);
    replace_layout(&path, &value);
    let mut state = State::new(path);
    state.monitor_source = two_monitors;
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    state.monitor_source = || panic!("a pinned session must not query monitors again");
    let moved = edit(
        &mut state,
        GeometryChange::Move {
            x: n(2100.0),
            y: n(100.0),
        },
        &before.revision,
    )
    .expect("move");
    assert_eq!(moved.canvas, before.canvas);
    assert_eq!(moved.instances[1], before.instances[1]);
    assert_eq!(
        moved.instances[0].canvas_placement,
        crate::studio::CanvasPlacement::Outside
    );
    assert_eq!(state.view(access), moved);
    let undone = state
        .edit(Edit::Undo, &moved.revision, access)
        .expect("undo");
    assert_eq!(undone.instances, before.instances);
    assert_eq!(undone.canvas, before.canvas);
    let redone = state
        .edit(Edit::Redo, &undone.revision, access)
        .expect("redo");
    assert_eq!(redone.instances, moved.instances);
    assert_eq!(state.view(access), redone);
}
#[test]
fn revision_precedes_invalid_document_and_resize_rejects_adjusted_size() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let bytes = std::fs::read(&path).expect("bytes");
    for change in [
        GeometryChange::Resize {
            x: n(0.0),
            y: n(0.0),
            width: n(40000.0),
            height: n(50000.0),
        },
        GeometryChange::Move {
            x: n(100_001.0),
            y: n(0.0),
        },
    ] {
        assert_eq!(
            edit(&mut state, change, &before.revision),
            Err(HostError::Rejected)
        );
        assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
    }
    std::fs::write(&path, b"{broken").expect("protected");
    assert!(matches!(
        edit(&mut state, GeometryChange::AutoSize, &before.revision),
        Err(HostError::StudioConflict { .. })
    ));
    assert_eq!(
        edit(
            &mut state,
            GeometryChange::AutoSize,
            &vantare_services::content_hash(b"{broken")
        ),
        Err(HostError::Protected)
    );
}
#[test]
fn floating_point_aspect_drift_does_not_write_or_create_undo() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["geometry"]["size"] = serde_json::json!({"width":84.0,"height":42.0});
    replace_layout(&path, &value);
    let mut state = State::new(path.clone());
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let bytes = std::fs::read(&path).expect("bytes");
    let item = &before.instances[0];
    let after = edit(
        &mut state,
        GeometryChange::Resize {
            x: item.x,
            y: item.y,
            width: n(84.000_000_000_000_06),
            height: n(42.0),
        },
        &before.revision,
    )
    .expect("equivalent resize");
    assert_eq!(after.revision, before.revision);
    assert_eq!(std::fs::read(&path).expect("bytes"), bytes);
    assert_eq!(state.undo.len(), 0);
}
