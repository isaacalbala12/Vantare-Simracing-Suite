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
    let disconnected = state.view(access);
    assert_eq!(disconnected.state, StudioState::MonitorUnavailable);
    assert_eq!(disconnected.monitor, None);
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
    // Live enumeration still contains both monitors; moving the first widget
    // must not reselect the canvas from its new position.
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

#[test]
fn disconnecting_the_pinned_monitor_protects_without_selecting_another() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    state.monitor_source = two_monitors;
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let bytes = std::fs::read(&path).expect("bytes");
    state.monitor_source = || two_monitors().into_iter().skip(1).collect();
    assert_eq!(state.view(access).state, StudioState::MonitorUnavailable);
    assert_eq!(
        edit(
            &mut state,
            GeometryChange::Move {
                x: n(100.0),
                y: n(100.0)
            },
            &before.revision
        ),
        Err(HostError::Protected)
    );
    assert_eq!(std::fs::read(&path).expect("unchanged bytes"), bytes);
    assert_eq!(state.undo.len(), 0);
    state.monitor_source = two_monitors;
    assert_eq!(state.view(access), before);
}

#[test]
fn decimal_size_round_tripped_through_f32_does_not_write_or_create_undo() {
    let (_root, path, _) = fixture();
    let mut value = layout(&path);
    value["instances"][0]["geometry"]["size"] = serde_json::json!({"width":84.3,"height":42.15});
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
            width: n(f64::from(84.3_f32)),
            height: n(f64::from(42.15_f32)),
        },
        &before.revision,
    )
    .expect("same native size");
    assert_eq!(after, before);
    assert_eq!(std::fs::read(&path).expect("unchanged bytes"), bytes);
    assert_eq!(state.undo.len(), 0);
    // A real representable resize remains a write, rather than being swallowed
    // by a fixed tolerance chosen just for 84.3.
    let changed = edit(
        &mut state,
        GeometryChange::Resize {
            x: item.x,
            y: item.y,
            width: n(f64::from(84.3_f32.next_up())),
            height: n(f64::from(42.15_f32.next_up())),
        },
        &before.revision,
    )
    .expect("different native size");
    assert_ne!(changed.revision, before.revision);
    assert_eq!(state.undo.len(), 1);
}

#[test]
fn native_rounding_does_not_change_locked_aspect_or_relax_size_limits() {
    for (stored_width, width, height) in [(84.3, 84.3_f32, 42.0_f32), (3840.0, 3840.0, 1920.0)] {
        let (_root, path, _) = fixture();
        let mut value = layout(&path);
        value["instances"][0]["geometry"]["size"] =
            serde_json::json!({"width":stored_width,"height":height});
        replace_layout(&path, &value);
        let mut state = State::new(path.clone());
        let access = Some(CatalogAccess::Pro);
        let before = state.view(access);
        let bytes = std::fs::read(&path).expect("bytes");
        let item = &before.instances[0];
        let same = GeometryChange::Resize {
            x: item.x,
            y: item.y,
            width: n(f64::from(width)),
            height: n(f64::from(height)),
        };
        assert_eq!(
            edit(&mut state, same, &before.revision).expect("same locked size"),
            before
        );
        if width > 100.0 {
            assert_eq!(
                edit(
                    &mut state,
                    GeometryChange::Resize {
                        x: item.x,
                        y: item.y,
                        width: n(3_840.000_01),
                        height: n(1_920.000_005),
                    },
                    &before.revision
                ),
                Err(HostError::Rejected)
            );
        }
        assert_eq!(std::fs::read(&path).expect("unchanged bytes"), bytes);
        assert_eq!(state.undo.len(), 0);
    }
}

#[test]
fn a_custom_canvas_never_replaces_the_pinned_monitor_size() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path.clone());
    state.monitor_source = two_monitors;
    let access = Some(CatalogAccess::Pro);
    let before = state.view(access);
    let detected = before.monitor.clone().expect("pinned monitor");
    assert_eq!(
        (f64::from(detected.width), f64::from(detected.height)),
        two_monitors()[0].size
    );
    let custom = state
        .edit(
            Edit::Canvas(CanvasChoice::Custom {
                width: n(1280.0),
                height: n(720.0),
            }),
            &before.revision,
            access,
        )
        .expect("preset");
    assert_eq!(custom.monitor.as_ref(), Some(&detected));
    assert_eq!(
        custom.canvas.expect("custom canvas").size(),
        (1280.0, 720.0)
    );
    assert_eq!(state.view(access).monitor.as_ref(), Some(&detected));
    let native = state
        .edit(
            Edit::Canvas(CanvasChoice::Monitor),
            &custom.revision,
            access,
        )
        .expect("use monitor");
    assert_eq!(native.monitor.as_ref(), Some(&detected));
    assert_eq!(
        native.canvas.expect("native canvas").size(),
        two_monitors()[0].size
    );
    state
        .edit(Edit::Undo, &native.revision, access)
        .expect("undo monitor choice");
    assert_eq!(state.view(access).monitor.as_ref(), Some(&detected));
    state.monitor_source = || two_monitors().into_iter().skip(1).collect();
    let missing = state.view(access);
    assert_eq!(missing.state, StudioState::MonitorUnavailable);
    assert_eq!(missing.monitor, None);
}

#[test]
fn settings_frame_guard_counts_the_detected_monitor_at_the_wire_boundary() {
    let (_root, path, _) = fixture();
    let mut state = State::new(path);
    let access = Some(CatalogAccess::Pro);
    let mut opened = open(&mut state).expect("valid document");
    let original = opened.projected[0].clone();
    let base = serde_json::to_value(original.settings.as_ref().expect("table settings"))
        .expect("settings");
    let probe = |length| {
        let mut settings = base.clone();
        settings["columns"] =
            serde_json::json!([{"id":"x".repeat(length),"metricId":"driverName"}]);
        let mut item = original.clone();
        item.locked = !item.kind.info(access).allowed;
        item.settings = Some(serde_json::from_value(settings).expect("normalized settings"));
        let without_monitor = StudioView {
            instances: vec![item.clone()],
            canvas: Some(opened.canvas),
            ..State::unavailable(StudioState::Ready, access)
        };
        (
            crate::studio::widget_settings::fits_view(&without_monitor),
            item,
        )
    };
    let (mut low, mut high) = (0, crate::frame::LIMIT);
    assert!(probe(low).0);
    assert!(!probe(high).0);
    while low < high {
        let middle = low + (high - low).div_ceil(2);
        if probe(middle).0 {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    assert!(probe(low).0);
    assert!(!probe(low + 1).0);
    opened.projected[0] = probe(low).1;
    assert!(
        !opened.fits_frame(access),
        "monitor metadata is part of the real frame"
    );
}

#[test]
fn unavailable_document_is_not_reported_as_a_missing_monitor() {
    for (bytes, expected) in [
        (None, StudioState::Missing),
        (Some(b"broken".as_slice()), StudioState::Protected),
        (
            Some(br#"{"version":1,"instances":null}"#.as_slice()),
            StudioState::Protected,
        ),
    ] {
        let root = crate::test_support::Root::new();
        let path = root.path.join("layout.json");
        if let Some(bytes) = bytes {
            std::fs::write(&path, bytes).expect("fixture");
        }
        let mut state = State::new(path.clone());
        state.monitor_source = Vec::new;
        let view = state.view(Some(CatalogAccess::Pro));
        assert_eq!(view.state, expected);
        assert!(view.canvas.is_none() && view.monitor.is_none());
        assert!(!view.can_undo && !view.can_redo);
        assert_eq!(std::fs::read(&path).ok().as_deref(), bytes);
    }
}

#[test]
fn monitor_and_document_failures_emit_distinct_events_and_recover_without_writes() {
    use std::time::{Duration, Instant};
    let (_root, path, original) = fixture();
    let access = Some(CatalogAccess::Pro);
    let mut state = State::new(path.clone());
    state.monitor_source = two_monitors;
    let start = Instant::now();
    let initial = state.observed(start, access);
    assert_eq!(initial.state, StudioState::Ready);
    state.monitor_source = Vec::new;
    let missing = state
        .changed(true, start + Duration::from_millis(500), access)
        .expect("disconnect event");
    assert_eq!(missing.state, StudioState::MonitorUnavailable);
    assert!(missing.canvas.is_none() && missing.monitor.is_none());
    assert_eq!(std::fs::read(&path).expect("no read-side write"), original);
    assert!(
        state
            .changed(true, start + Duration::from_secs(1), access)
            .is_none()
    );
    std::fs::write(&path, b"broken").expect("corrupt fixture");
    let protected = state
        .changed(true, start + Duration::from_millis(1500), access)
        .expect("document event");
    assert_eq!(protected.state, StudioState::Protected);
    assert_eq!(protected.canvas, missing.canvas);
    assert_eq!(protected.monitor, missing.monitor);
    assert_eq!(std::fs::read(&path).expect("no repair"), b"broken");
    std::fs::write(&path, &original).expect("restore fixture");
    assert_eq!(
        state
            .changed(true, start + Duration::from_secs(2), access)
            .expect("monitor still missing")
            .state,
        StudioState::MonitorUnavailable
    );
    state.monitor_source = two_monitors;
    assert_eq!(
        state
            .changed(true, start + Duration::from_millis(2500), access)
            .expect("reconnect event"),
        initial
    );
    assert_eq!(std::fs::read(&path).expect("no seed"), original);
    assert!(state.undo.is_empty() && state.redo.is_empty());
}

#[test]
fn missing_monitor_keeps_mutation_errors_and_hide_available() {
    let (_root, path, original) = fixture();
    let access = Some(CatalogAccess::Pro);
    let mut state = State::new(path.clone());
    state.monitor_source = Vec::new;
    assert!(matches!(
        state.edit(
            Edit::Canvas(CanvasChoice::Monitor),
            &vantare_services::content_hash(&original),
            access
        ),
        Err(HostError::Protected)
    ));
    assert!(
        matches!(state.edit(Edit::Canvas(CanvasChoice::Monitor), &"0".repeat(64), access), Err(HostError::StudioConflict { current }) if current.state == StudioState::MonitorUnavailable)
    );
    assert!(matches!(
        state.track(true, access),
        Err(HostError::Protected)
    ));
    let marker = path.with_extension("show.json");
    assert!(!marker.exists());
    std::fs::write(&marker, b"7").expect("show fixture");
    let hidden = state
        .track(false, None)
        .expect("hide never needs a monitor");
    assert!(!hidden.showing);
    assert_eq!(hidden.state, StudioState::MonitorUnavailable);
    assert!(!marker.exists());
    assert_eq!(std::fs::read(&path).expect("no mutation"), original);
    assert!(!state.view(access).can_undo);
}
