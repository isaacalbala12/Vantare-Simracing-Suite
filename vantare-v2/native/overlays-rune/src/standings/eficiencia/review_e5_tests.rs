//! Seguimientos de E5: política, pausa y pestaña con movimiento en curso.
use super::super::{model::Metric, motion::Wake};
use super::*;
use vantare_domain::{Quality::Reliable, SessionKind, widget_settings::columns::ColumnSetting};

fn photo() -> Snapshot {
    vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap()
}
fn settings() -> Options {
    Options {
        class_scope: "all-classes".into(),
        row_count: 10,
        ..Options::eficiencia()
    }
}
fn swap(photo: &mut Snapshot) {
    photo.state.cars[0].position = Reliable(2);
    photo.state.cars[0].class_position = Reliable(2);
    photo.state.cars[1].position = Reliable(1);
    photo.state.cars[1].class_position = Reliable(1);
}
fn active(settings: &Options) -> (Eficiencia, Snapshot) {
    let mut w = Eficiencia::new(settings, Preferences::default());
    let mut p = photo();
    w.update(&p, 0.0);
    swap(&mut p);
    w.update(&p, 1.0);
    w.animate(1.1);
    assert_ne!(w.visual.frame.row(p.state.cars[0].id).offset, 0.0);
    assert!(w.motion.next_wake(1.1, 60).is_some());
    (w, p)
}
#[test]
fn policy_false_true_false_discards_motion_and_reseeds_the_latest_reduced_photo() {
    let (mut w, _) = active(&settings());
    assert!(!w.reduced);
    assert!(w.policy(true, 20, 1.1).build);
    assert!(w.reduced);
    assert_eq!(w.motion.wake(1.1), Wake::Idle);
    assert!(w.motion.next_wake(1.1, 20).is_none());
    assert!(!w.policy(true, 20, 1.11).build);
    let latest = photo();
    assert!(w.update(&latest, 1.12).build);
    for r in &w.visual.content_plan.rows {
        let pose = w.visual.frame.row(r.id);
        assert_eq!(pose.offset, 0.0);
        assert_eq!(pose.alpha, 1.0);
    }
    w.policy(false, 30, 1.13);
    assert!(!w.reduced);
    assert_eq!(w.hz, 30);
    assert_eq!(w.motion.wake(1.13), Wake::Idle);
    assert!(w.motion.next_wake(1.13, 30).is_none());
    for r in &w.visual.content_plan.rows {
        let pose = w.visual.frame.row(r.id);
        assert_eq!(pose.offset, 0.0);
        assert_eq!(pose.alpha, 1.0);
    }
    assert!(!w.animate(1.14).build);
    assert!(!w.policy(false, 30, 1.15).build);
}
#[test]
fn pause_freezes_the_active_frame_and_both_animation_and_schedule_stay_empty() {
    let _fonts = rune::text::with_families("Inter W400", "Inter W400");
    let (mut w, mut p) = active(&settings());
    let frozen = w.visual.frame.clone();
    p.state.source_state = SourceState::Paused;
    assert!(w.update(&p, 1.1).build);
    assert!(!w.animate(1.2).build);
    assert!(Arc::ptr_eq(&frozen, &w.visual.frame));
    let size = w.size();
    let mut rt = rune::Runtime::with_text(
        w,
        |s, _| s.view(),
        (size.width, size.height),
        rune::Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::eficiencia::FONTS, ("Inter W400", "Inter W400")),
    );
    rt.poll = Some(|s, clock, tx| {
        let changed = s.animate(clock).build;
        s.schedule(clock, tx);
        changed
    });
    // frame recibe un delta: el primer tick se sitúa en1,2 s, el siguiente en11,2 s.
    rt.frame(1.2);
    assert!(rt.wake_deadline().is_none());
    assert!(Arc::ptr_eq(&frozen, &rt.state.visual.frame));
    assert!(!rt.frame(10.0));
    assert!(rt.wake_deadline().is_none());
    assert!(Arc::ptr_eq(&frozen, &rt.state.visual.frame));
    crate::testdata::assert_inside_window(&mut rt, (size.width, size.height));
}
#[test]
fn switch_session_keeps_motion_until_the_next_photo_then_reseeds_the_new_session() {
    let settings = Options {
        practice_columns: Some(
            ["driverName", "bestLap"]
                .into_iter()
                .map(|id| ColumnSetting {
                    metric_id: id.into(),
                    width_preset: "sm".into(),
                    ..ColumnSetting::default()
                })
                .collect(),
        ),
        ..settings()
    };
    let (mut w, mut p) = active(&settings);
    w.switch_session(Session::Practice);
    assert_eq!(w.session, Session::Practice);
    assert!(w.board.is_none());
    assert_eq!(
        w.visual.content_plan.status,
        super::super::model::Status::Disconnected
    );
    assert!(
        w.motion.next_wake(1.1, 60).is_some(),
        "switch_session conserva Motion como GPUI"
    );
    assert_eq!(
        w.visual
            .plan
            .columns
            .iter()
            .map(|c| c.metric)
            .collect::<Vec<_>>(),
        vec![Metric::DriverName, Metric::BestLap]
    );
    p.state.session.kind = Reliable(SessionKind::Practice);
    assert!(w.update(&p, 1.11).build);
    assert_eq!(w.session, Session::Practice);
    assert!(w.board.is_some());
    assert_eq!(w.motion.wake(1.11), Wake::Idle);
    assert!(w.motion.next_wake(1.11, 60).is_none());
    for r in &w.visual.content_plan.rows {
        let pose = w.visual.frame.row(r.id);
        assert_eq!(pose.offset, 0.0);
        assert_eq!(pose.alpha, 1.0);
    }
}
