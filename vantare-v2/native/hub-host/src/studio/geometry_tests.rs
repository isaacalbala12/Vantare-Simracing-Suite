use super::*;

#[test]
fn every_resize_handle_keeps_opposite_edges_fixed_at_limits() {
    let size = (338.0, 364.0);
    for locked in [false, true] {
        for handle in [
            (-1, -1),
            (0, -1),
            (1, -1),
            (1, 0),
            (1, 1),
            (0, 1),
            (-1, 1),
            (-1, 0),
        ] {
            for delta in [
                (35.0, 22.0),
                (-100_000.0, -100_000.0),
                (100_000.0, 100_000.0),
            ] {
                let (p, n) = resize((48.0, 62.0), size, handle, delta, locked).expect("resize");
                assert!((64.0..=3840.0).contains(&n.0));
                assert!(n.1 >= 32.0 - 1e-9 && n.1 <= 2160.0 + 1e-9);
                if handle.0 < 0 {
                    assert!((p.0 + n.0 - 386.0).abs() < 1e-9);
                } else {
                    assert_eq!(p.0, 48.0);
                }
                if handle.1 < 0 {
                    assert!((p.1 + n.1 - 426.0).abs() < 1e-9);
                } else {
                    assert_eq!(p.1, 62.0);
                }
                if locked {
                    assert!((n.0 / n.1 - size.0 / size.1).abs() < 1e-9);
                }
            }
        }
    }
}
#[test]
fn snap_uses_native_priority_and_strict_threshold() {
    let snapped = snap((496.0, 398.0), (200.0, 100.0), (1000.0, 800.0), &[], 8.0).expect("snap");
    assert_eq!(snapped.position, (400.0, 350.0));
    assert_eq!(snapped.guides, (Some(500.0), Some(400.0)));
    let boundary = snap((492.0, 200.0), (200.0, 100.0), (1000.0, 800.0), &[], 8.0).expect("strict");
    assert_eq!(boundary.position.0, 392.0);
    assert_eq!(boundary.guides.0, None);
    let other = snap(
        (154.0, 160.0),
        (100.0, 100.0),
        (1000.0, 800.0),
        &[(105.0, 500.0, 100.0, 100.0)],
        8.0,
    )
    .expect("other");
    assert_eq!(other.position.0, 105.0);
}
#[test]
fn anchors_nudges_fit_and_free_spot_match_frozen_oracles() {
    assert_eq!(
        anchor((300.0, 200.0), (1920.0, 1080.0), 2, 2),
        Some((1620.0, 880.0))
    );
    assert_eq!(
        anchor((300.0, 200.0), (64.0, 64.0), 1, 1),
        Some((-118.0, -68.0))
    );
    assert_eq!(nudge((0.0, 0.0), (-1, 1), true), Some((-8.0, 8.0)));
    assert_eq!(
        nudge((100_000.0, -100_000.0), (1, -1), true),
        Some((100_000.0, -100_000.0))
    );
    for (ms, expected) in [
        (0, 1.0),
        (299, 1.0),
        (300, 1.0),
        (330, 2.0),
        (900, 21.0),
        (1800, 141.0),
        (1830, 149.0),
    ] {
        assert_eq!(held_nudge_distance(ms, false), expected);
        assert_eq!(held_nudge_distance(ms, true), expected * 8.0);
    }
    assert_eq!(fit((960.0, 540.0), (1920.0, 1080.0)), Some(0.5));
    assert_eq!(
        preview_origin((1000.0, 800.0), (1920.0, 1080.0), 0.5),
        Some((20.0, 130.0))
    );
    assert_eq!(
        free_spot((1920.0, 1080.0), (300.0, 200.0), &[]),
        Some((38.4, 38.4))
    );
    assert_eq!(
        free_spot((64.0, 64.0), (100.0, 36.0), &[]),
        Some((0.0, 14.0))
    );
}
#[test]
fn invalid_math_and_nonfinite_wire_coordinates_fail_closed() {
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, f64::MAX] {
        assert!(Coordinate::try_from(value).is_err());
    }
    assert!(resize((0.0, 0.0), (338.0, 364.0), (1, 1), (f64::NAN, 0.0), true).is_none());
    assert!(resize((0.0, 0.0), (338.0, 364.0), (0, 0), (1.0, 0.0), true).is_none());
    assert!(anchor((300.0, 200.0), (1920.0, 1080.0), 3, 0).is_none());
    assert!(snap((0.0, 0.0), (0.0, 100.0), (1920.0, 1080.0), &[], 8.0).is_none());
    assert!(fit((0.0, 0.0), (1920.0, 1080.0)).is_none());
    assert!(free_spot((f64::MIN_POSITIVE, 1000.0), (1.0, 1.0), &[]).is_none());
}
#[test]
fn geometry_wire_is_closed_and_v36_add_bytes_remain_readable() {
    #[derive(serde::Deserialize)]
    #[serde(tag = "method", deny_unknown_fields)]
    enum FrozenV36 {
        #[serde(rename = "studio.add")]
        Add {
            kind: String,
            #[serde(rename = "baseRevision")]
            base_revision: String,
        },
    }
    let legacy = crate::protocol::Request::StudioAdd {
        kind: crate::studio::WidgetKind::Delta,
        at: None,
        base_revision: "a".repeat(64),
    };
    let bytes = serde_json::to_vec(&legacy).expect("serialize");
    let FrozenV36::Add {
        kind,
        base_revision,
    } = serde_json::from_slice(&bytes).expect("frozen decoder");
    assert_eq!(kind, "delta");
    assert_eq!(base_revision, "a".repeat(64));
    let modern = crate::protocol::Request::StudioAdd {
        kind: crate::studio::WidgetKind::Delta,
        at: Some(Point::default()),
        base_revision: "a".repeat(64),
    };
    assert!(
        serde_json::from_slice::<FrozenV36>(&serde_json::to_vec(&modern).expect("serialize"))
            .is_err()
    );
    for change in [
        serde_json::json!({"kind":"move","x":"bad","y":1}),
        serde_json::json!({"kind":"move","x":1,"y":1,"command":"never"}),
        serde_json::json!({"kind":"unknown"}),
    ] {
        let request = serde_json::json!({"method":"studio.geometry","id":"widget-1","change":change,"baseRevision":"a".repeat(64)});
        assert!(serde_json::from_value::<crate::protocol::Request>(request).is_err());
    }
}

#[test]
fn snap_stays_inside_and_extreme_aspects_can_be_resized() {
    let snapped = snap(
        (50.0, 200.0),
        (100.0, 100.0),
        (1000.0, 800.0),
        &[(-3.0, 500.0, 100.0, 100.0)],
        8.0,
    )
    .expect("snap");
    assert_eq!(snapped.position, (0.0, 150.0));
    assert_eq!(snapped.guides.0, None);
    for (size, expected) in [
        ((100_000.0, 1.0), (3840.0, 32.0)),
        ((1.0, 100_000.0), (64.0, 2160.0)),
    ] {
        let (_, next) =
            resize((0.0, 0.0), size, (1, 1), (10.0, 10.0), true).expect("closest feasible aspect");
        assert!((MIN_SIZE.0..=MAX_SIZE.0).contains(&next.0));
        assert!(next.1 >= MIN_SIZE.1 - EPSILON && next.1 <= MAX_SIZE.1 + EPSILON);
        assert!(near(next.0, expected.0) && near(next.1, expected.1));
    }
    assert!(position_valid((100_000.0, -100_000.0)));
    assert!(!position_valid((100_001.0, 0.0)));
}
