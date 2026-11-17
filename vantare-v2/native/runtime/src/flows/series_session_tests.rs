#![allow(clippy::unwrap_used)]
use super::series_session::{SessionEvent, SessionTracker};
use serde_json::{Value, json};
use std::time::Duration;
use vantare_domain::{
    Car, CarId, Class, ClassId, Player, Quality, SessionId, SessionKind, Snapshot,
};

fn snapshot(session: u64, car: u32, laps: u32, source_ms: u64) -> Snapshot {
    let mut snapshot = Snapshot {
        epoch: 7,
        sequence: source_ms + 1,
        ..Snapshot::default()
    };
    snapshot.origin.source_time = Some(Duration::from_millis(source_ms));
    snapshot.origin.received_at = Duration::from_millis(source_ms);
    snapshot.state.session.id = SessionId(session);
    snapshot.state.session.kind = Quality::Reliable(SessionKind::Practice);
    snapshot.state.session.track_name = Quality::Stale("Spa".into());
    snapshot.state.session.elapsed_s =
        Quality::Reliable(Duration::from_millis(source_ms).as_secs_f64());
    snapshot.state.player = Some(Player {
        car: CarId(car),
        ..Player::default()
    });
    snapshot.state.cars.push(Car {
        id: CarId(car),
        vehicle: "Porsche".into(),
        class: Some(Class {
            id: ClassId(1),
            name: "GTE".into(),
        }),
        position: Quality::Stale(3),
        class_position: Quality::Estimated(2),
        laps: Quality::Reliable(laps),
        last_lap_s: Quality::Reliable(90.0),
        best_lap_s: Quality::Reliable(89.5),
        last_sectors_s: vec![Quality::Reliable(30.0); 3],
        ..Car::default()
    });
    snapshot
}
fn commands(events: &[SessionEvent]) -> Vec<Value> {
    events.iter().map(SessionEvent::command).collect()
}

#[test]
fn opening_has_exact_identity_metadata_and_unchanged_photos_have_no_events() {
    let mut tracker = SessionTracker::default();
    let first = snapshot(1, 7, 0, 0);
    assert_eq!(
        commands(&tracker.observe(&first, 100)),
        [json!(["session-open", {
        "epoch":7,"session":1,"kind":"practice","kindText":"","trackName":"Spa",
        "vehicle":"Porsche","className":"GTE","startedAtMs":100}])]
    );
    for wall in 101..1100 {
        let events = tracker.observe(&first, wall);
        assert!(events.is_empty());
        assert_eq!(events.capacity(), 0);
    }
}

#[test]
fn immediate_and_delayed_official_times_belong_to_the_completed_sample_lap() {
    for delayed in [false, true] {
        let mut tracker = SessionTracker::default();
        tracker.observe(&snapshot(1, 7, 0, 0), 100);
        let mut crossed = snapshot(1, 7, 1, 1000);
        if delayed {
            assert!(tracker.observe(&crossed, 200).is_empty());
        }
        crossed.origin.source_time = Some(Duration::from_millis(2000));
        crossed.state.cars[0].last_lap_s = Quality::Reliable(91.234);
        crossed.state.cars[0].last_sectors_s = vec![
            Quality::Reliable(31.0),
            Quality::Reliable(32.0),
            Quality::Reliable(28.234),
        ];
        assert_eq!(
            commands(&tracker.observe(&crossed, 300)),
            [json!(["lap",{
            "epoch":7,"session":1,"car":7,"lap":0,"officialMs":91_234,"sectorMs":[31_000,32_000,28_234]}])]
        );
        assert!(tracker.observe(&crossed, 400).is_empty());
    }
}

#[test]
fn pending_lap_times_out_on_source_clock_at_three_seconds_not_wall_clock() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    assert!(tracker.observe(&snapshot(1, 7, 1, 1000), 200).is_empty());
    assert!(
        tracker
            .observe(&snapshot(1, 7, 1, 3999), u64::MAX)
            .is_empty()
    );
    assert_eq!(
        commands(&tracker.observe(&snapshot(1, 7, 1, 4000), 400)),
        [json!(["lap",{
        "epoch":7,"session":1,"car":7,"lap":0,"officialMs":null,"sectorMs":null}])]
    );
    assert!(tracker.observe(&snapshot(1, 7, 1, 5000), 500).is_empty());
}

#[test]
fn non_reliable_last_time_waits_and_a_non_reliable_sector_makes_sectors_null() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    let mut next = snapshot(1, 7, 1, 1000);
    next.state.cars[0].last_lap_s = Quality::Stale(91.0);
    assert!(tracker.observe(&next, 200).is_empty());
    next.origin.source_time = Some(Duration::from_millis(2000));
    next.state.cars[0].last_lap_s = Quality::Reliable(91.0);
    next.state.cars[0].last_sectors_s[1] = Quality::Estimated(30.0);
    let event = commands(&tracker.observe(&next, 300));
    assert_eq!(event[0][1]["officialMs"], 91_000);
    assert_eq!(event[0][1]["sectorMs"], Value::Null);
}

#[test]
fn session_change_flushes_lap_before_close_and_uses_the_previous_frame_values() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    let mut last = snapshot(1, 7, 1, 1000);
    last.state.cars[0].position = Quality::Stale(8);
    last.state.cars[0].class_position = Quality::Stale(4);
    assert!(tracker.observe(&last, 200).is_empty());
    let events = commands(&tracker.observe(&snapshot(2, 7, 0, 2000), 900));
    assert_eq!(events.len(), 3);
    assert_eq!(events[0][0], "lap");
    assert_eq!(events[0][1]["officialMs"], Value::Null);
    assert_eq!(
        events[1],
        json!(["session-close",{"epoch":7,"session":1,"endedAtMs":200,
        "simElapsedS":1.0,"finalPosition":8,"finalClassPosition":4,"lapsCompleted":1,
        "bestLapMs":89_500,"endReason":"sessionChanged"}])
    );
    assert_eq!(events[2][0], "session-open");
    assert_eq!(events[2][1]["session"], 2);
    assert_eq!(events[2][1]["startedAtMs"], 900);
}

#[test]
fn car_change_keeps_the_summary_and_resets_both_lap_baselines() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    assert!(tracker.observe(&snapshot(1, 7, 1, 1000), 200).is_empty());
    let mut other = snapshot(1, 9, 50, 2000);
    other.state.cars[0].vehicle = "Ferrari".into();
    other.state.cars[0].last_lap_s = Quality::Reliable(120.0);
    let events = commands(&tracker.observe(&other, 300));
    assert_eq!(events.len(), 1);
    assert_eq!(events[0][0], "lap");
    assert_eq!(events[0][1]["car"], 7);
    assert_eq!(events[0][1]["officialMs"], Value::Null);
    assert!(tracker.observe(&other, 400).is_empty());
    other.origin.source_time = Some(Duration::from_secs(3));
    other.state.cars[0].laps = Quality::Reliable(51);
    other.state.cars[0].last_lap_s = Quality::Reliable(121.0);
    other.state.cars[0].position = Quality::Stale(5);
    other.state.cars[0].best_lap_s = Quality::Reliable(119.0);
    let events = commands(&tracker.observe(&other, 500));
    assert_eq!(events.len(), 1);
    assert_eq!(events[0][1]["car"], 9);
    assert_eq!(events[0][1]["lap"], 50);
    assert_eq!(events[0][1]["officialMs"], 121_000);
    let close = commands(&tracker.finish(600));
    assert_eq!(close.len(), 1);
    assert_eq!(close[0][1]["finalPosition"], 5);
    assert_eq!(close[0][1]["bestLapMs"], 119_000);
    assert_eq!(close[0][1]["lapsCompleted"], 51);
    assert_eq!(close[0][1]["endReason"], "coreStopped");
}

#[test]
fn kind_quality_and_warmup_and_missing_class_are_explicit() {
    for (kind, expected, text) in [
        (
            Quality::Reliable(SessionKind::Other("warmup".into())),
            "other",
            "warmup",
        ),
        (Quality::Estimated(SessionKind::Race), "unknown", ""),
        (Quality::Stale(SessionKind::Qualifying), "unknown", ""),
        (Quality::Reliable(SessionKind::Race), "race", ""),
        (Quality::Reliable(SessionKind::Qualifying), "qualifying", ""),
    ] {
        let mut frame = snapshot(1, 7, 0, 0);
        frame.state.session.kind = kind;
        frame.state.cars[0].class = None;
        let event = commands(&SessionTracker::default().observe(&frame, 100));
        assert_eq!(event[0][1]["kind"], expected);
        assert_eq!(event[0][1]["kindText"], text);
        assert_eq!(event[0][1]["className"], "");
        assert_eq!(event[0][1]["trackName"], "Spa");
    }
}

#[test]
fn no_player_or_missing_player_car_never_opens_a_summary() {
    let mut tracker = SessionTracker::default();
    let mut frame = snapshot(1, 7, 0, 0);
    frame.state.player = None;
    assert!(tracker.observe(&frame, 100).is_empty());
    frame.state.player = Some(Player {
        car: CarId(9),
        ..Player::default()
    });
    assert!(tracker.observe(&frame, 200).is_empty());
    assert!(tracker.finish(300).is_empty());
}

#[test]
fn finish_flushes_pending_before_sealing_and_zero_best_lap_is_absent() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    let mut frame = snapshot(1, 7, 1, 1000);
    frame.state.cars[0].best_lap_s = Quality::Reliable(0.0);
    assert!(tracker.observe(&frame, 200).is_empty());
    let events = commands(&tracker.finish(900));
    assert_eq!(events.len(), 2);
    assert_eq!(events[0][0], "lap");
    assert_eq!(events[1][0], "session-close");
    assert_eq!(events[1][1]["bestLapMs"], Value::Null);
    assert_eq!(events[1][1]["endedAtMs"], 900);
    assert!(tracker.finish(1000).is_empty());
}

#[test]
fn a_last_frame_without_the_player_still_sets_the_session_end_clock() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    let mut last = snapshot(1, 7, 0, 2000);
    last.state.player = None;
    assert!(tracker.observe(&last, 300).is_empty());
    let events = commands(&tracker.observe(&snapshot(2, 7, 0, 3000), 900));
    assert_eq!(events[0][1]["endedAtMs"], 300);
    assert_eq!(events[0][1]["simElapsedS"], 2.0);
    assert_eq!(events[0][1]["finalPosition"], 3);
}

#[test]
fn epoch_changes_close_and_open_even_when_the_session_id_is_unchanged() {
    let mut tracker = SessionTracker::default();
    let mut frame = snapshot(1, 7, 0, 0);
    tracker.observe(&frame, 100);
    frame.epoch = 8;
    let events = commands(&tracker.observe(&frame, 200));
    assert_eq!(events.len(), 2);
    assert_eq!(events[0][0], "session-close");
    assert_eq!(events[0][1]["epoch"], 7);
    assert_eq!(events[0][1]["endedAtMs"], 100);
    assert_eq!(events[1][1]["epoch"], 8);
}

#[test]
fn received_clock_is_used_when_source_clock_is_absent_and_text_is_bounded_utf8() {
    let mut tracker = SessionTracker::default();
    let mut frame = snapshot(1, 7, 0, 0);
    frame.origin.source_time = None;
    frame.state.cars[0].vehicle = "€".repeat(200);
    let opened = commands(&tracker.observe(&frame, 100));
    let vehicle = opened[0][1]["vehicle"].as_str().unwrap();
    assert_eq!(vehicle, "€".repeat(85));
    frame.state.cars[0].laps = Quality::Reliable(1);
    frame.origin.received_at = Duration::from_secs(1);
    assert!(tracker.observe(&frame, 100).is_empty());
    frame.origin.received_at = Duration::from_secs(4);
    let events = commands(&tracker.observe(&frame, 100));
    assert_eq!(events[0][0], "lap");
    assert_eq!(events[0][1]["officialMs"], Value::Null);
}


#[test]
fn reliable_zero_last_time_and_sectors_remain_values_but_zero_best_is_null() {
    let mut tracker = SessionTracker::default();
    tracker.observe(&snapshot(1, 7, 0, 0), 100);
    let mut next = snapshot(1, 7, 1, 1000);
    next.state.cars[0].last_lap_s = Quality::Reliable(0.0);
    next.state.cars[0].last_sectors_s = vec![Quality::Reliable(0.0); 3];
    next.state.cars[0].best_lap_s = Quality::Reliable(0.0);
    let events = commands(&tracker.observe(&next, 200));
    assert_eq!(events[0][1]["officialMs"], 0);
    assert_eq!(events[0][1]["sectorMs"], json!([0,0,0]));
    assert_eq!(commands(&tracker.finish(300))[0][1]["bestLapMs"], Value::Null);
}
