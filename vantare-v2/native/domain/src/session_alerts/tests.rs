use super::*;
fn practice(seconds: f64) -> SessionInput {
    SessionInput {
        epoch: 1,
        id: 1,
        kind: SessionKind::Practice,
        state: None,
        remaining_s: Some(seconds),
        elapsed_s: Some(0.0),
        started_at_s: None,
        finished_at_s: None,
        next_kind: None,
        next_starts_at_s: None,
        position: Some(3),
        best_lap_ms: None,
        phase: None,
        distance_m: None,
        distance_estimated: false,
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
fn id_kind_state_or_zero_clock_never_fabricate_real_finish() {
    let mut m = Machine::default();
    let o = Options::default();
    m.session(Some(practice(2.0)), 0, &o);
    m.session(Some(practice(0.0)), 1000, &o);
    assert!(m.tick(1000, &o).active.is_none());
    let mut q = practice(900.0);
    q.id = 2;
    q.kind = SessionKind::Qualifying;
    m.session(Some(q.clone()), 1250, &o);
    assert!(m.tick(1250, &o).active.is_none());
    q.state = Some(SessionState::Finished);
    m.session(Some(q), 1500, &o);
    assert!(m.tick(1500, &o).active.is_none());
}
#[test]
fn confirmed_finish_is_recent_deduplicated_and_not_replayed_after_reconnect() {
    let mut m = Machine::default();
    let o = Options::default();
    let mut p = practice(2.0);
    p.elapsed_s = Some(100.0);
    m.session(Some(p.clone()), 1_000_000, &o);
    p.elapsed_s = Some(101.0);
    p.finished_at_s = Some(101.0);
    m.session(Some(p.clone()), 1_001_000, &o);
    let view = m.tick(1_001_000, &o);
    assert_eq!(view.active.expect("fin confirmado").tone(), Tone::Finished);
    assert_eq!(view.sound_revision, 1);
    p.finished_at_s = None;
    m.session(Some(p.clone()), 1_001_100, &o);
    p.finished_at_s = Some(101.0);
    m.session(Some(p.clone()), 1_001_200, &o);
    assert_eq!(m.tick(1_001_200, &o).sound_revision, 1);
    m.session(None, 1_002_000, &o);
    m.session(Some(p), 1_002_100, &o);
    assert!(m.tick(1_002_100, &o).active.is_none());
}
#[test]
fn consecutive_practices_have_separate_thresholds_without_white_notice() {
    let mut m = Machine::default();
    let o = Options::default();
    m.session(Some(practice(300.0)), 0, &o);
    m.tick(0, &o);
    let mut second = practice(300.0);
    second.id = 2;
    m.session(Some(second), 250, &o);
    let view = m.tick(250, &o);
    let notice = view.active.expect("nuevo umbral práctica 2");
    assert_eq!(notice.tone(), Tone::Mild);
    assert!(notice.scheduled);
    assert_eq!(view.queued, 0);
}
#[test]
fn planned_zero_hides_without_ya_or_zero_sound_or_finished_notice() {
    let mut m = Machine::default();
    let o = Options::default();
    m.session(Some(practice(1.0)), 0, &o);
    m.tick(0, &o);
    m.session(Some(practice(0.0)), 1000, &o);
    let view = m.tick(1000, &o);
    assert!(view.active.is_none() && view.minis.is_empty());
    assert_eq!(view.zero_revision, 0);
}
#[test]
fn next_race_uses_session_clock_and_requires_both_announced_fields() {
    let mut m = Machine::default();
    let o = Options::default();
    let mut p = practice(900.0);
    p.elapsed_s = Some(100.0);
    p.next_kind = Some(SessionKind::Race);
    m.session(Some(p.clone()), 1_700_000_000_000, &o);
    assert!(m.tick(1_700_000_000_000, &o).active.is_none());
    p.next_starts_at_s = Some(400.0);
    m.session(Some(p), 1_700_000_000_250, &o);
    let notice = m
        .tick(1_700_000_000_250, &o)
        .active
        .expect("carrera anunciada");
    assert_eq!(notice.label, "CARRERA");
    assert!(!notice.scheduled);
    assert_eq!(
        m.countdown(&notice.event, 1_700_000_000_250)
            .expect("contador")
            .seconds,
        300
    );
}
#[test]
fn projection_uses_v11_quality_and_never_guesses_phase_from_state_or_distance() {
    use crate::{Quality, SessionTiming, StartPhase};
    let mut photo = Snapshot::default();
    photo.origin.source.simulator = "lmu";
    photo.state.source_state = SourceState::Live;
    photo.state.session.kind = Quality::Reliable(SessionKind::Practice);
    photo.state.session.state = Quality::Reliable(SessionState::Preparing);
    photo.state.session.elapsed_s = Quality::Reliable(100.0);
    photo.state.session.remaining_s = Quality::Reliable(999.0);
    photo.state.session.timing = SessionTiming {
        scheduled_end_s: Quality::Reliable(400.0),
        distance_to_start_line_m: Quality::Estimated(30.0),
        ..SessionTiming::default()
    };
    let input = project(&photo).expect("LMU");
    assert_eq!(input.remaining_s, Some(300.0));
    assert_eq!(input.phase, None);
    assert_eq!(input.distance_m, None);
    photo.state.session.timing.start_phase = Quality::Reliable(StartPhase::Grid);
    assert_eq!(project(&photo).expect("grid").phase, None);
    photo.state.session.timing.start_phase = Quality::Reliable(StartPhase::Countdown);
    let input = project(&photo).expect("countdown");
    assert_eq!(input.phase, Some(Phase::Start));
    assert_eq!(input.distance_m, Some(30.0));
    assert!(input.distance_estimated);
    photo.state.session.timing.next_kind = Quality::Reliable(SessionKind::Race);
    photo.state.session.timing.next_starts_at_s = Quality::Stale(200.0);
    assert_eq!(
        project(&photo)
            .expect("siguiente obsoleta")
            .next_starts_at_s,
        None
    );
    photo.state.session.timing.scheduled_end_s = Quality::Stale(400.0);
    assert_eq!(
        project(&photo).expect("sin reloj programado").remaining_s,
        None
    );
    photo.state.session.timing.start_phase = Quality::Stale(StartPhase::Countdown);
    assert_eq!(project(&photo).expect("fase obsoleta").distance_m, None);
    photo.state.session.kind = Quality::Stale(SessionKind::Practice);
    assert!(project(&photo).is_none());
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

#[test]
fn estimated_metres_stay_estimated_and_missing_phase_withdraws_start_notice() {
    let mut m = Machine::default();
    let o = Options::default();
    let mut s = practice(0.0);
    s.kind = SessionKind::Race;
    s.phase = Some(Phase::Start);
    s.distance_m = Some(620.0);
    s.distance_estimated = true;
    m.session(Some(s.clone()), 0, &o);
    let n = m.tick(0, &o).active.expect("salida verificada sintética");
    assert_eq!(m.countdown(&n.event, 0).expect("metros").value(), "≈620 m");
    s.phase = None;
    s.distance_m = None;
    m.session(Some(s), 250, &o);
    let view = m.tick(250, &o);
    assert!(view.active.is_none() && view.minis.is_empty());
}
