//! Oráculos de GPUI motion.rs:209–386,597–691,741–830 y view.rs.
use super::super::{control::Eficiencia, paint_tests};
use super::*;
use crate::widget::Widget;
use vantare_domain::{
    format::{Language, Preferences},
    standings::SelectedRow,
    widget_settings::standings::Settings,
};
fn row(id: u32, pos: i64) -> Row {
    let mut r = SelectedRow::unavailable(CarId(id), pos);
    r.position = pos;
    r.class_position = pos;
    let value = Arc::make_mut(&mut r.row);
    value.class = "GT3".into();
    value.best_lap_s = Some(100.0);
    r
}
fn plan(rows: Vec<Row>) -> ContentPlan {
    let mut p = ContentPlan::unavailable(Status::Ready);
    p.status = Status::Ready;
    p.race = true;
    p.identity = "s:1".into();
    p.sequence = 10;
    p.rows = rows;
    p.session_best = p
        .rows
        .iter()
        .filter_map(|r| Some((r.id, r.best_lap_s?)))
        .min_by(|a, b| a.1.total_cmp(&b.1));
    p
}
fn near(a: f32, b: f32) {
    assert!((a - b).abs() < 0.0001, "{a} != {b}");
}
fn ease(curve: [f32; 4], x: f32) -> f32 {
    rune::Easing::cubic(curve[0], curve[1], curve[2], curve[3]).eval(x)
}
fn update(m: &mut Motion, p: &ContentPlan, now: f64) {
    m.update(p, p.rows.len(), true, now);
}
#[test]
fn events_keep_gpui_thresholds_class_boundary_and_session_priority() {
    let before = plan(vec![row(1, 3)]);
    let mut next = before.clone();
    next.sequence += 1;
    next.rows[0].position = 1;
    assert_eq!(
        derive_events(&before, &next, true),
        vec![Event {
            row_id: CarId(1),
            kind: EventKind::Position,
            places: 2
        }]
    );
    Arc::make_mut(&mut next.rows[0].row).best_lap_s = Some(99.999);
    next.session_best = Some((CarId(1), 99.999));
    assert_eq!(
        derive_events(&before, &next, true)[0].kind,
        EventKind::SessionBest
    );
    next.rows[0].position = 3;
    next.session_best = before.session_best;
    assert_eq!(
        derive_events(&before, &next, true)[0].kind,
        EventKind::PersonalBest
    );
    Arc::make_mut(&mut next.rows[0].row).best_lap_s = Some(99.9996);
    assert!(derive_events(&before, &next, true).is_empty());
    Arc::make_mut(&mut next.rows[0].row).best_lap_s = Some(99.999);
    assert!(derive_events(&before, &next, false).is_empty());
    Arc::make_mut(&mut next.rows[0].row).class = "LMP2".into();
    assert!(derive_events(&before, &next, true).is_empty());
    assert_eq!(EventKind::SessionBest.priority(), 3);
    for kind in [EventKind::Position, EventKind::Lead, EventKind::Pit] {
        assert_eq!(kind.priority(), 2);
    }
    assert_eq!(EventKind::PersonalBest.priority(), 1);
}
#[test]
fn notice_capacity_replaces_only_a_lower_priority_and_clears_both_channels() {
    let before = plan((1..=4).map(|id| row(id, i64::from(id))).collect());
    let mut m = Motion::default();
    update(&mut m, &before, 0.0);
    for id in 1..=3 {
        m.admit(
            Event {
                row_id: CarId(id),
                kind: EventKind::Position,
                places: 2,
            },
            1.0,
        );
    }
    assert_eq!(m.notices.len(), 3);
    m.admit(
        Event {
            row_id: CarId(4),
            kind: EventKind::PersonalBest,
            places: 0,
        },
        1.1,
    );
    assert!(!m.notices.contains_key(&CarId(4)));
    m.admit(
        Event {
            row_id: CarId(4),
            kind: EventKind::SessionBest,
            places: 0,
        },
        1.1,
    );
    assert_eq!(m.notices.len(), 3);
    assert!(m.notices.contains_key(&CarId(4)));
    let evicted = (1..=3)
        .map(CarId)
        .find(|id| !m.notices.contains_key(id))
        .unwrap();
    assert!(!m.flash_tw.contains_key(&evicted));
    assert!(!m.chip_tw.contains_key(&evicted));
    m.clear_notice(CarId(4));
    assert!(!m.notices.contains_key(&CarId(4)));
}
#[test]
fn position_flash_grows_for_500_ms_chip_for_180_and_notice_expires_at_1200() {
    for (position, places) in [(1, 2), (4, -1)] {
        let before = plan(vec![row(1, 3)]);
        let mut after = before.clone();
        after.rows[0].position = position;
        let mut m = Motion::default();
        update(&mut m, &before, 0.0);
        update(&mut m, &after, 1.0);
        let start = m.frame_shared(1.0).row(CarId(1));
        near(start.flash, 0.0);
        assert_eq!(start.chip, Some((places, 0.0)));
        let half = m.frame_shared(1.09).row(CarId(1));
        near(half.chip.unwrap().1, ease([0.25, 0.1, 0.25, 1.0], 0.5));
        let chip = m.frame_shared(1.18).row(CarId(1));
        near(chip.chip.unwrap().1, 1.0);
        let flash = m.frame_shared(1.5).row(CarId(1));
        near(flash.flash, 1.0);
        assert_eq!(flash.flash_up, places > 0);
        assert!(matches!(m.wake(1.5),Wake::At(delay) if (delay-0.7).abs()<1e-9));
        m.frame_shared(2.2);
        assert_eq!(m.wake(2.2), Wake::Idle);
        assert!(m.next_wake(2.2, 60).is_none());
    }
}
#[test]
fn sweep_uses_eased_progress_not_320_ms_for_its_peak_and_ends_at_800() {
    let before = plan(vec![row(1, 1)]);
    let mut next = before.clone();
    Arc::make_mut(&mut next.rows[0].row).best_lap_s = Some(99.0);
    next.session_best = Some((CarId(1), 99.0));
    let mut m = Motion::default();
    update(&mut m, &before, 0.0);
    update(&mut m, &next, 1.0);
    let start = m.frame_shared(1.0).row(CarId(1)).sweep.unwrap();
    assert_eq!(start, (true, 0.0, -1.0));
    let p = ease([0.0, 0.0, 0.58, 1.0], 0.4);
    let k = (p - 0.4) / 0.6;
    let sample = m.frame_shared(1.320).row(CarId(1)).sweep.unwrap();
    near(sample.1, 0.7 * (1.0 - k));
    near(sample.2, k);
    let (mut lo, mut hi) = (0.0_f32, 1.0_f32);
    for _ in 0..30 {
        let mid = f32::midpoint(lo, hi);
        if ease([0.0, 0.0, 0.58, 1.0], mid) < 0.4 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    let peak = m
        .frame_shared(1.0 + f64::from(f32::midpoint(lo, hi)) * 0.8)
        .row(CarId(1))
        .sweep
        .unwrap();
    near(peak.1, 0.7);
    near(peak.2, 0.0);
    assert!(m.frame_shared(1.8).row(CarId(1)).sweep.is_none());
    assert!(matches!(m.wake(1.8), Wake::At(_)));
}
#[test]
fn battle_is_same_class_consecutive_with_hysteresis_and_player_preference() {
    let mut p = plan(vec![row(1, 1), row(2, 2)]);
    Arc::make_mut(&mut p.rows[0].row).battle_gap_seconds = Some(0.0);
    Arc::make_mut(&mut p.rows[1].row).battle_gap_seconds = Some(0.9);
    let ids = p.rows.iter().map(|r| r.id).collect();
    assert!(select_battle(&p, &ids, None).is_none());
    let old = Battle {
        ahead: CarId(1),
        behind: CarId(2),
        gap: 0.7,
        player: false,
    };
    assert_eq!(select_battle(&p, &ids, Some(&old)).unwrap().gap, 0.9);
    Arc::make_mut(&mut p.rows[1].row).battle_gap_seconds = Some(1.2001);
    assert!(select_battle(&p, &ids, Some(&old)).is_none());
    Arc::make_mut(&mut p.rows[1].row).battle_gap_seconds = Some(0.7);
    let mut m = Motion::default();
    update(&mut m, &p, 0.0);
    update(&mut m, &p, 1.0);
    near(m.frame_shared(1.2).row(CarId(1)).battle, 1.0);
    m.admit(
        Event {
            row_id: CarId(1),
            kind: EventKind::Position,
            places: 1,
        },
        1.2,
    );
    update(&mut m, &p, 1.2);
    near(m.frame_shared(1.4).row(CarId(1)).battle, 0.0);
    Arc::make_mut(&mut p.rows[1].row).in_pits = true;
    assert!(select_battle(&p, &ids, None).is_none());
    p.status = Status::Stale;
    assert!(select_battle(&p, &ids, None).is_none());
}
#[test]
fn best_marker_retargets_for_220_ms_and_pit_channels_for_200_ms() {
    let mut p = plan(vec![row(1, 1)]);
    let mut m = Motion::default();
    update(&mut m, &p, 0.0);
    near(m.frame_shared(0.0).row(CarId(1)).best_marker, 1.0);
    p.session_best = None;
    update(&mut m, &p, 1.0);
    near(
        m.frame_shared(1.11).row(CarId(1)).best_marker,
        1.0 - ease([0.25, 0.1, 0.25, 1.0], 0.5),
    );
    near(m.frame_shared(1.22).row(CarId(1)).best_marker, 0.0);
    Arc::make_mut(&mut p.rows[0].row).in_pits = true;
    update(&mut m, &p, 2.0);
    let start = m.frame_shared(2.0).row(CarId(1));
    near(start.pit_alpha, 0.0);
    near(start.pit_dx, -5.0);
    let end = m.frame_shared(2.2).row(CarId(1));
    near(end.pit_alpha, 1.0);
    near(end.pit_dx, 0.0);
    Arc::make_mut(&mut p.rows[0].row).in_pits = false;
    update(&mut m, &p, 3.0);
    let end = m.frame_shared(3.2).row(CarId(1));
    near(end.pit_alpha, 0.0);
    near(end.pit_dx, -5.0);
    m.admit(
        Event {
            row_id: CarId(1),
            kind: EventKind::Pit,
            places: 0,
        },
        4.0,
    );
    let forced = m.frame_shared(4.0).row(CarId(1));
    near(forced.pit_alpha, 1.0);
    near(forced.pit_dx, 0.0);
}
#[test]
fn reduced_always_returns_idle_without_even_a_notice_expiry_wake() {
    let settings = Settings::eficiencia();
    let mut w = Eficiencia::new(&settings, Preferences::default());
    let mut photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    w.policy(true, 60, 0.0);
    w.update(&photo, 0.0);
    photo.state.cars[0].position = vantare_domain::Quality::Reliable(3);
    w.update(&photo, 1.0);
    assert_eq!(*w.visual.frame, Frame::default());
    assert_eq!(w.motion.wake(1.0), Wake::Idle);
    assert!(w.motion.next_wake(1.0, 60).is_none());
    assert!(!w.animate(1.1).build);
    let size = w.size();
    let mut rt = rune::Runtime::with_text(
        w,
        |s, _| s.view(),
        (size.width, size.height),
        rune::Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::eficiencia::FONTS, ("Inter W400", "Inter W400")),
    );
    rt.poll = Some(|s, clock, tx| {
        let build = s.animate(clock).build;
        s.schedule(clock, tx);
        build
    });
    rt.frame(0.0);
    assert!(rt.wake_deadline().is_none());
    assert!(!rt.frame(1.2));
}
#[test]
fn painted_effects_copy_gpui_hex_geometry_glyph_and_layer_order() {
    let mut v = paint_tests::visual();
    let mut p = (*v.content_plan).clone();
    p.rows.truncate(1);
    p.status = Status::Ready;
    v.ingest(Arc::new(p.clone()));
    let id = p.rows[0].id;
    let mut frame = Frame::default();
    frame.vis.insert(
        id,
        Pose {
            flash: 1.0,
            flash_up: true,
            chip: Some((2, 1.0)),
            battle: 1.0,
            best_marker: 1.0,
            sweep: Some((true, 0.7, 0.0)),
            pit_alpha: 1.0,
            pit_dx: 0.0,
            ..Pose::default()
        },
    );
    v.frame = Arc::new(frame);
    let size = v.size();
    let mut rt = paint_tests::paint(v, Language::Es);
    crate::testdata::assert_inside_window(&mut rt, size);
    let es = rt.elements();
    let named = |key: &str| es.iter().find(|e| e.key.as_deref() == Some(key)).unwrap();
    assert_eq!(named("position-flash").fill.hex(), "#7fb6861f");
    assert_eq!(named("position-flash").rect, [0.0, 43.0, 440.0, 30.0]);
    assert_eq!(named("position-chip").text.as_deref(), Some("+2"));
    assert_eq!(named("best-marker").text.as_deref(), Some("◆"));
    assert_eq!(named("best-marker").text_color.unwrap().hex(), "#bd9be8ff");
    assert_eq!(named("battle-underline").rect[3], 2.0);
    assert!(es.iter().any(|e| e.key.as_deref() == Some("best-sweep")));
    let flash = es
        .iter()
        .position(|e| e.key.as_deref() == Some("position-flash"))
        .unwrap();
    let chip = es
        .iter()
        .position(|e| e.key.as_deref() == Some("position-chip"))
        .unwrap();
    assert!(flash < chip);
}
