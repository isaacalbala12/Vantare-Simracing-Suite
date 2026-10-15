use super::*;
fn practice(seconds: f64) -> SessionInput {
    SessionInput {
        epoch: 1,
        id: 1,
        kind: SessionKind::Practice,
        state: None,
        remaining_s: Some(seconds),
        position: Some(3),
        best_lap_ms: None,
        phase: None,
        distance_m: None,
    }
}
fn race(id: &str, starts_at_ms: u64) -> CalendarInput {
    CalendarInput {
        id: id.into(),
        label: id.into(),
        starts_at_ms,
    }
}
#[test]
fn configurable_thresholds_fire_once_skip_old_thresholds_and_keep_mini() {
    let mut m = Machine::default();
    let o = Options::default();
    m.session(Some(practice(301.0)), 0, &o);
    assert!(m.tick(0, &o).active.is_none());
    m.session(Some(practice(300.0)), 1000, &o);
    assert_eq!(
        m.tick(1000, &o).active.expect("5 min").kind,
        Kind::Threshold(5)
    );
    // Cada foto renueva la frescura, sin volver a disparar el umbral.
    for t in (2000..=10_000).step_by(1000) {
        m.session(Some(practice((301_000 - t) as f64 / 1000.0)), t, &o);
        m.tick(t, &o);
    }
    let view = m.tick(10_000, &o);
    assert!(view.active.is_none());
    assert_eq!(view.minis[0].seconds, 291);
    assert_eq!(view.minis[0].tone(), Tone::Mild);
    assert_eq!(view.sound_revision, 1);
    m.session(Some(practice(60.0)), 11_000, &o);
    let view = m.tick(11_000, &o);
    assert_eq!(view.active.expect("final").tone(), Tone::Final);
    assert_eq!(view.sound_revision, 2);
    assert_eq!(m.tick(11_000, &o).sound_revision, 2);
}
#[test]
fn telemetry_loss_epoch_change_and_unknown_source_never_fabricate_finishes() {
    let mut m = Machine::default();
    let o = Options::default();
    m.session(Some(practice(250.0)), 0, &o);
    m.tick(0, &o);
    assert!(m.tick(1501, &o).active.is_none());
    m.session(None, 2000, &o);
    let mut q = practice(600.0);
    q.id = 2;
    q.kind = SessionKind::Qualifying;
    m.session(Some(q.clone()), 2100, &o);
    assert!(m.tick(2100, &o).active.is_none());
    q.epoch = 2;
    q.id = 3;
    q.kind = SessionKind::Race;
    m.session(Some(q), 2200, &o);
    assert!(m.tick(2200, &o).active.is_none());
    assert!(project(&Snapshot::default()).is_none());
}
#[test]
fn observed_change_reports_previous_result_but_zero_clock_is_not_finished() {
    let mut m = Machine::default();
    let o = Options::default();
    m.session(Some(practice(2.0)), 0, &o);
    m.session(Some(practice(0.0)), 1000, &o);
    assert!(m.tick(1000, &o).active.is_none());
    let mut q = practice(900.0);
    q.id = 2;
    q.kind = SessionKind::Qualifying;
    m.session(Some(q.clone()), 1250, &o);
    assert_eq!(
        m.tick(1250, &o).active.expect("fin real").kind,
        Kind::Finished {
            qualifying: false,
            position: Some(3),
            best_lap_ms: None
        }
    );
    q.state = Some(SessionState::Finished);
    m.session(Some(q.clone()), 1500, &o);
    let view = m.tick(1500, &o);
    assert_eq!(view.queued, 1);
    m.session(Some(q), 1600, &o);
    assert_eq!(m.tick(1600, &o).queued, 1);
}
#[test]
fn calendar_without_game_uses_same_thresholds_and_cancellation_clears_all() {
    let mut m = Machine::default();
    let o = Options::default();
    let races = [race("spa:123", 300_000)];
    m.calendar(&races, 0, &o);
    assert!(m.tick(0, &o).active.expect("cal").calendar);
    m.calendar(&races, 9000, &o);
    assert_eq!(m.tick(9000, &o).minis[0].value(), "04:51");
    m.calendar(&[], 10_000, &o);
    assert_eq!(m.tick(10_000, &o).minis.len(), 0);
    assert!(m.tick(10_000, &o).active.is_none());
}
#[test]
fn priority_shortens_current_to_two_seconds_and_discards_expired_queue() {
    let mut m = Machine::default();
    let o = Options::default();
    m.calendar(&[race("cal", 300_000)], 0, &o);
    assert!(m.tick(0, &o).active.expect("cal").calendar);
    m.session(Some(practice(60.0)), 100, &o);
    m.session(Some(practice(59.0)), 1000, &o);
    assert_eq!(m.tick(1999, &o).active.expect("minimo 2 s").priority(), 3);
    m.session(Some(practice(58.0)), 2000, &o);
    let view = m.tick(2000, &o);
    assert_eq!(view.active.expect("final primero").priority(), 1);
    assert_eq!(view.minis.len(), 1);
    let mut q = Machine::default();
    q.calendar(&[race("later", 300_000), race("expired", 1000)], 0, &o);
    assert_eq!(
        q.tick(0, &o).active.expect("final").event,
        "calendar:expired"
    );
    assert_eq!(
        q.tick(9000, &o).active.expect("leve válido").event,
        "calendar:later"
    );
}
#[test]
fn mini_turns_red_at_last_minute_then_ya_for_one_and_half_seconds() {
    let mut m = Machine::default();
    let o = Options {
        thresholds: vec![5],
        ..Options::default()
    };
    let races = [race("race", 90_000)];
    m.calendar(&races, 0, &o);
    m.tick(0, &o);
    assert_eq!(m.tick(10_000, &o).minis[0].tone(), Tone::Mild);
    assert_eq!(m.tick(30_000, &o).minis[0].tone(), Tone::Final);
    assert_eq!(m.tick(90_000, &o).minis[0].value(), "YA");
    assert_eq!(m.tick(90_000, &o).zero_revision, 1);
    assert_eq!(m.tick(91_000, &o).zero_revision, 1);
    assert!(m.tick(91_500, &o).minis.is_empty());
}
#[test]
fn mini_limit_sorts_nearest_first_and_independent_toggles_apply() {
    let mut m = Machine::default();
    let mut o = Options::default();
    let races = [
        race("c", 270_000),
        race("b", 260_000),
        race("a", 250_000),
        race("d", 280_000),
    ];
    m.calendar(&races, 0, &o);
    for t in [0, 8000, 16_000, 24_000, 32_000] {
        m.tick(t, &o);
    }
    let v = m.tick(33_000, &o);
    assert_eq!(v.minis.len(), 3);
    assert!(v.minis.windows(2).all(|w| w[0].seconds <= w[1].seconds));
    o.mini_calendar = false;
    assert!(m.tick(33_001, &o).minis.is_empty());
}
#[test]
fn verified_start_inputs_show_metres_and_racing_clears_without_green_notice() {
    let mut m = Machine::default();
    let o = Options::default();
    let mut s = practice(0.0);
    s.kind = SessionKind::Race;
    s.phase = Some(Phase::Formation);
    m.session(Some(s.clone()), 0, &o);
    assert_eq!(
        m.tick(0, &o).active.expect("formación").kind,
        Kind::Formation
    );
    s.phase = Some(Phase::Start);
    s.distance_m = Some(620.0);
    m.session(Some(s.clone()), 1000, &o);
    for t in 2..=10 {
        m.session(Some(s.clone()), t * 1000, &o);
        m.tick(t * 1000, &o);
    }
    let v = m.tick(10_000, &o);
    assert_eq!(v.minis[0].value(), "620 m");
    s.phase = Some(Phase::Racing);
    s.distance_m = Some(0.0);
    m.session(Some(s), 11_000, &o);
    assert!(m.tick(11_000, &o).minis.is_empty());
    assert!(m.tick(11_000, &o).active.is_none());
}
