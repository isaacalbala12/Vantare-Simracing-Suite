use super::*;
use crate::calendar::{CalendarBand, CalendarBandMode, CalendarDays, CalendarSlot};
use chrono::Utc;
fn setup() -> (CalendarView, CalendarAlerts, i64) {
    let schedule=CalendarSchedule::parse(br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap();
    let view = CalendarView {
        official: Some(schedule),
        ..Default::default()
    };
    let alerts = CalendarAlerts {
        bands: vec![CalendarBand {
            series_id: "qa".into(),
            from: 0,
            to: 1440,
            days: CalendarDays::All,
            mode: CalendarBandMode::Each,
        }],
        ..Default::default()
    };
    (view, alerts, date_millis("2026-11-12T12:50:00Z").unwrap())
}
#[test]
fn due_window_is_open_on_left_and_closed_on_right() {
    let (view, alerts, now) = setup();
    let schedule = view.official.as_ref().unwrap();
    assert_eq!(
        due_in(schedule, &alerts, now, now - 1, false, &Utc).len(),
        1
    );
    assert!(due_in(schedule, &alerts, now, now, false, &Utc).is_empty());
    assert!(due_in(schedule, &alerts, now - 1, now - 2, false, &Utc).is_empty());
    assert!(due_in(schedule, &alerts, now, now - 1, true, &Utc).is_empty());
}
#[test]
fn initial_tick_does_not_replay_and_clock_rollback_does_not_duplicate() {
    let (view, alerts, now) = setup();
    let mut s = Scheduler::default();
    let clock = Instant::now();
    assert!(
        s.tick(&view, &alerts, now - 1000, clock, true, false, &Utc)
            .is_empty()
    );
    let notices = s.tick(
        &view,
        &alerts,
        now,
        clock + Duration::from_secs(1),
        true,
        false,
        &Utc,
    );
    assert_eq!(notices.len(), 1);
    assert!(
        matches!(&notices[0],CalendarNotice::Start{series,track,silent:true,..} if series=="QA"&&track=="Spa")
    );
    assert!(
        s.tick(
            &view,
            &alerts,
            now - 1000,
            clock + Duration::from_secs(2),
            true,
            false,
            &Utc
        )
        .is_empty()
    );
    assert!(
        s.tick(
            &view,
            &alerts,
            now,
            clock + Duration::from_secs(3),
            true,
            false,
            &Utc
        )
        .is_empty()
    );
}
#[test]
fn loss_of_authority_resets_the_due_window_without_replaying() {
    let (view, alerts, now) = setup();
    let mut s = Scheduler::default();
    let clock = Instant::now();
    s.tick(&view, &alerts, now - 1000, clock, true, false, &Utc);
    assert!(
        s.tick(&view, &alerts, now, clock, false, false, &Utc)
            .is_empty()
    );
    assert!(
        s.tick(&view, &alerts, now + 1000, clock, true, false, &Utc)
            .is_empty()
    );
}
#[test]
fn windows_channel_and_valid_current_schedule_are_required() {
    let (mut view, mut alerts, now) = setup();
    let clock = Instant::now();
    alerts.channels.windows = false;
    let mut s = Scheduler::default();
    s.tick(&view, &alerts, now - 1000, clock, true, false, &Utc);
    assert!(
        s.tick(
            &view,
            &alerts,
            now,
            clock + Duration::from_secs(1),
            true,
            false,
            &Utc
        )
        .is_empty()
    );
    alerts.channels.windows = true;
    view.previous = view.official.take();
    let mut s = Scheduler::default();
    s.tick(&view, &alerts, now - 1000, clock, true, false, &Utc);
    assert!(
        s.tick(
            &view,
            &alerts,
            now,
            clock + Duration::from_secs(1),
            true,
            false,
            &Utc
        )
        .is_empty()
    );
}
#[test]
fn explicit_weekly_slot_is_silent_in_track_but_uses_sound_outside() {
    let (mut view, mut alerts, now) = setup();
    let series = &mut view.official.as_mut().unwrap().series[0];
    series.recurrence.kind = "weekly-slots".into();
    series.recurrence.days = vec!["Thu".into()];
    series.recurrence.times_utc = vec!["13:00".into()];
    alerts.bands.clear();
    alerts.slots = vec![CalendarSlot {
        series_id: "qa".into(),
        at: now + 600_000,
    }];
    alerts.channels.sound = true;
    for in_track in [false, true] {
        let mut s = Scheduler::default();
        let clock = Instant::now();
        s.tick(&view, &alerts, now - 1000, clock, true, in_track, &Utc);
        let events = s.tick(
            &view,
            &alerts,
            now,
            clock + Duration::from_secs(1),
            true,
            in_track,
            &Utc,
        );
        assert!(
            matches!(events.as_slice(),[CalendarNotice::Start{silent,..}] if *silent==in_track)
        );
    }
}
#[test]
fn test_notice_has_fixed_shape_clock_limits_and_rate_limit() {
    let mut s = Scheduler::default();
    let clock = Instant::now();
    assert_eq!(s.test(1, -1, clock, true), Err(HostError::Rejected));
    let event = s.test(7, 1000, clock, false).unwrap();
    assert!(matches!(
        &event,
        CalendarNotice::Test {
            request_id: 7,
            issued_at: 1000,
            expires_at: 61000,
            silent: false,
            ..
        }
    ));
    assert_eq!(event.id().len(), 64);
    assert_eq!(s.test(8, 1001, clock, true), Err(HostError::Busy));
    assert!(
        s.test(8, 6000, clock + Duration::from_secs(5), true)
            .is_ok()
    );
    let mut json = serde_json::to_value(event).unwrap();
    json["title"] = "renderer text".into();
    assert!(serde_json::from_value::<CalendarNotice>(json).is_err());
}
#[test]
fn new_week_requires_observed_transition_and_only_emits_once() {
    let (mut view, mut alerts, now) = setup();
    alerts.notify_week = true;
    let mut s = Scheduler::default();
    let clock = Instant::now();
    s.tick(&view, &alerts, now, clock, true, false, &Utc);
    let schedule = view.official.as_mut().unwrap();
    schedule.valid_from = "2026-11-16T00:00:00Z".into();
    schedule.valid_until = "2026-11-23T00:00:00Z".into();
    let next = date_millis("2026-11-16T00:00:00Z").unwrap();
    let events = s.tick(
        &view,
        &alerts,
        next,
        clock + Duration::from_secs(1),
        true,
        false,
        &Utc,
    );
    assert!(matches!(events.as_slice(), [CalendarNotice::Week { .. }]));
    assert!(
        s.tick(
            &view,
            &alerts,
            next + 1000,
            clock + Duration::from_secs(2),
            true,
            false,
            &Utc
        )
        .is_empty()
    );
}
