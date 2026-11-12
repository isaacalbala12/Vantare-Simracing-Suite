use super::*;
use crate::calendar::{
    CalendarBand, CalendarBandMode, CalendarDays, CalendarSlot, POLL_MONDAY_MS, POLL_NORMAL_MS,
};
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
        s.tick(&view, &alerts, (now - 1000, clock), true, false, &Utc)
            .is_empty()
    );
    let notices = s.tick(
        &view,
        &alerts,
        (now, clock + Duration::from_secs(1)),
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
            (now - 1000, clock + Duration::from_secs(2)),
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
            (now, clock + Duration::from_secs(3)),
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
    s.tick(&view, &alerts, (now - 1000, clock), true, false, &Utc);
    assert!(
        s.tick(&view, &alerts, (now, clock), false, false, &Utc)
            .is_empty()
    );
    assert!(
        s.tick(&view, &alerts, (now + 1000, clock), true, false, &Utc)
            .is_empty()
    );
}
#[test]
fn windows_channel_and_valid_current_schedule_are_required() {
    let (mut view, mut alerts, now) = setup();
    let clock = Instant::now();
    alerts.channels.windows = false;
    let mut s = Scheduler::default();
    s.tick(&view, &alerts, (now - 1000, clock), true, false, &Utc);
    assert!(
        s.tick(
            &view,
            &alerts,
            (now, clock + Duration::from_secs(1)),
            true,
            false,
            &Utc
        )
        .is_empty()
    );
    alerts.channels.windows = true;
    view.previous = view.official.take();
    let mut s = Scheduler::default();
    s.tick(&view, &alerts, (now - 1000, clock), true, false, &Utc);
    assert!(
        s.tick(
            &view,
            &alerts,
            (now, clock + Duration::from_secs(1)),
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
        at: (now + 600_000) / 1000,
    }];
    alerts.channels.sound = true;
    for in_track in [false, true] {
        let mut s = Scheduler::default();
        let clock = Instant::now();
        s.tick(&view, &alerts, (now - 1000, clock), true, in_track, &Utc);
        let events = s.tick(
            &view,
            &alerts,
            (now, clock + Duration::from_secs(1)),
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
fn bands_use_injected_local_zone_days_and_first_departure() {
    let (view, mut alerts, now) = setup();
    let schedule = view.official.as_ref().unwrap();
    let zone = chrono::FixedOffset::east_opt(2 * 3600).unwrap();
    alerts.bands[0].from = 15 * 60;
    alerts.bands[0].to = 16 * 60;
    alerts.bands[0].days = CalendarDays::Weekdays;
    alerts.bands[0].mode = CalendarBandMode::First;
    assert_eq!(
        due_in(schedule, &alerts, now, now - 1, false, &zone).len(),
        1
    );
    assert!(due_in(schedule, &alerts, now, now - 1, false, &Utc).is_empty());
    alerts.bands[0].days = CalendarDays::Weekend;
    assert!(due_in(schedule, &alerts, now, now - 1, false, &zone).is_empty());
}
#[test]
fn history_is_bounded_and_test_notice_silence_is_explicit() {
    let mut scheduler = Scheduler::default();
    for n in 0..NOTICE_HISTORY_LIMIT {
        assert!(scheduler.accept(&n.to_string(), 1000));
    }
    assert!(!scheduler.accept("overflow", 1000));
    assert!(!scheduler.accept("0", 1000));
    let clock = Instant::now();
    assert!(matches!(
        scheduler.test(1, 0, clock, true).unwrap(),
        CalendarNotice::Test { silent: true, .. }
    ));
}
#[test]
fn protected_or_unavailable_documents_cannot_emit_default_notifications() {
    for document in [
        CalendarDocumentState::Protected,
        CalendarDocumentState::Unavailable,
    ] {
        let (view, alerts, now) = setup();
        let mut state = State::new(std::path::PathBuf::new());
        state.view = view;
        state.config_view.alerts = alerts;
        state.config_view.documents.alerts = document;
        let clock = Instant::now();
        assert!(state.notice_tick(now - 1000, clock, true, false).is_empty());
        assert!(
            state
                .notice_tick(now, clock + Duration::from_secs(1), true, false)
                .is_empty()
        );
    }
}
struct Root(std::path::PathBuf);
impl Root {
    fn new() -> Self {
        let base = std::env::var_os("VANTARE_HUB_QA_ROOT")
            .map_or_else(std::env::temp_dir, std::path::PathBuf::from);
        std::fs::create_dir_all(&base).unwrap();
        let path = base.join(format!(
            "calendar-notices-{}",
            vantare_services::random_id().unwrap()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn state(&self) -> State {
        State::new(self.0.clone())
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn raw(schedule: &CalendarSchedule) -> String {
    serde_json::to_string(schedule).unwrap()
}
#[test]
fn stale_disk_bootstrap_is_quiet_but_a_later_refresh_announces_once_without_persistence() {
    let root = Root::new();
    let (view, _, now) = setup();
    let current = view.official.unwrap();
    let mut old = current.clone();
    old.valid_from = "2026-11-02T00:00:00Z".into();
    old.valid_until = "2026-11-09T00:00:00Z".into();
    let bytes = raw(&old);
    std::fs::write(root.0.join("official-schedule.json"), &bytes).unwrap();
    let clock = Instant::now();
    let mut state = root.state();
    state.load();
    state.config();
    state.notice_tick(now - 1000, clock, true, false);
    state
        .refresh_notices(Some(raw(&current)), None, now, true, false)
        .unwrap();
    assert!(
        state
            .notice_tick(now, clock + Duration::from_secs(1), true, false)
            .is_empty()
    );
    let mut next = current.clone();
    next.valid_from = "2026-11-16T00:00:00Z".into();
    next.valid_until = "2026-11-23T00:00:00Z".into();
    let arrival = date_millis("2026-11-16T00:00:01Z").unwrap();
    state
        .refresh_notices(Some(raw(&next)), None, arrival, true, false)
        .unwrap();
    assert!(matches!(
        state
            .notice_tick(arrival, clock + Duration::from_secs(2), true, false)
            .as_slice(),
        [CalendarNotice::Week { .. }]
    ));
    state
        .refresh_notices(Some(raw(&next)), None, arrival + 1000, true, false)
        .unwrap();
    assert!(
        state
            .notice_tick(arrival + 1000, clock + Duration::from_secs(3), true, false)
            .is_empty()
    );
    assert_eq!(
        std::fs::read_to_string(root.0.join("official-schedule.json")).unwrap(),
        bytes
    );
    let mut restarted = root.state();
    restarted
        .refresh_notices(Some(raw(&current)), None, now, true, false)
        .unwrap();
    restarted.notice_tick(now, clock, true, false);
    assert!(
        restarted
            .notice_tick(now + 1000, clock + Duration::from_secs(1), true, false)
            .is_empty()
    );
}
#[test]
fn future_publications_and_clock_crossings_never_create_week_notices() {
    let root = Root::new();
    let (view, _, now) = setup();
    let current = view.official.unwrap();
    std::fs::write(root.0.join("official-schedule.json"), raw(&current)).unwrap();
    let mut state = root.state();
    let mut future = current.clone();
    future.valid_from = "2026-11-16T00:00:00Z".into();
    future.valid_until = "2026-11-23T00:00:00Z".into();
    let result = state
        .refresh_notices(Some(raw(&future)), None, now, true, false)
        .unwrap();
    assert_eq!(result.official, Some(current));
    let clock = Instant::now();
    state.notice_tick(now, clock, true, false);
    let crossed = date_millis("2026-11-16T00:00:01Z").unwrap();
    assert!(
        state
            .notice_tick(crossed, clock + Duration::from_secs(1), true, false)
            .is_empty()
    );
    state
        .refresh_notices(Some(raw(&future)), None, crossed, true, false)
        .unwrap();
    assert!(matches!(
        state
            .notice_tick(crossed + 1000, clock + Duration::from_secs(2), true, false)
            .as_slice(),
        [CalendarNotice::Week { .. }]
    ));
}
#[test]
fn pruning_removes_expired_keys_and_preserves_live_keys() {
    let (view, alerts, now) = setup();
    let mut s = Scheduler::default();
    let clock = Instant::now();
    s.accept("expired", now - 1);
    s.accept("live", now + 1000);
    s.tick(&view, &alerts, (now, clock), true, false, &Utc);
    assert!(!s.seen.contains_key("expired"));
    assert!(s.seen.contains_key("live"));
    s.tick(
        &view,
        &alerts,
        (now + 1001, clock + Duration::from_secs(1)),
        false,
        false,
        &Utc,
    );
    assert!(!s.seen.contains_key("live"));
}
#[test]
fn a_transient_authority_drop_before_the_due_instant_does_not_erase_the_window() {
    let (view, alerts, now) = setup();
    let mut s = Scheduler::default();
    let clock = Instant::now();
    s.tick(&view, &alerts, (now - 1000, clock), true, false, &Utc);
    s.tick(
        &view,
        &alerts,
        (now - 500, clock + Duration::from_millis(500)),
        false,
        false,
        &Utc,
    );
    assert_eq!(
        s.tick(
            &view,
            &alerts,
            (now, clock + Duration::from_secs(1)),
            true,
            false,
            &Utc
        )
        .len(),
        1
    );
}
#[test]
fn a_suspension_only_delivers_departures_that_are_still_future() {
    let (view, alerts, _) = setup();
    let now = date_millis("2026-11-12T11:55:00Z").unwrap();
    let mut s = Scheduler::default();
    let clock = Instant::now();
    s.tick(&view, &alerts, (now, clock), true, false, &Utc);
    let events = s.tick(
        &view,
        &alerts,
        (now + 3_600_000, clock + Duration::from_secs(1)),
        true,
        false,
        &Utc,
    );
    assert!(matches!(events.as_slice(),[CalendarNotice::Start{at,..}] if *at==now+3_900_000));
}
#[test]
fn each_tick_is_capped_and_continuous_overflow_is_reported_once() {
    let (mut view, mut alerts, now) = setup();
    alerts.lead_min = 30;
    let base = view.official.as_ref().unwrap().series[0].clone();
    view.official.as_mut().unwrap().series.clear();
    alerts.bands.clear();
    for n in 0..9 {
        let mut series = base.clone();
        series.id = format!("qa{n}");
        series.recurrence.interval_minutes = 1;
        alerts.bands.push(CalendarBand {
            series_id: series.id.clone(),
            from: 0,
            to: 1440,
            days: CalendarDays::All,
            mode: CalendarBandMode::Each,
        });
        view.official.as_mut().unwrap().series.push(series);
    }
    let clock = Instant::now();
    let mut s = Scheduler::default();
    s.tick(&view, &alerts, (now - 3_600_000, clock), true, false, &Utc);
    assert_eq!(
        s.tick(
            &view,
            &alerts,
            (now, clock + Duration::from_secs(1)),
            true,
            false,
            &Utc
        )
        .len(),
        NOTICE_BATCH_LIMIT
    );
    assert!(s.limit_reported);
    assert_eq!(
        s.tick(
            &view,
            &alerts,
            (now + 3_600_000, clock + Duration::from_secs(2)),
            true,
            false,
            &Utc
        )
        .len(),
        NOTICE_BATCH_LIMIT
    );
    assert!(s.limit_reported);
}
#[test]
fn host_poll_cadence_is_utc_and_backoff_is_injected() {
    let mut state = State::new(std::path::PathBuf::new());
    let monday = date_millis("2026-11-09T11:00:00Z").unwrap();
    let clock = Instant::now();
    assert!(state.poll_due(monday));
    state.poll_started(monday);
    assert!(!state.poll_due(monday + POLL_MONDAY_MS - 1));
    assert!(state.poll_due(monday + POLL_MONDAY_MS));
    let afternoon = date_millis("2026-11-09T12:00:00Z").unwrap();
    state.poll_started(afternoon);
    assert!(!state.poll_due(afternoon + POLL_NORMAL_MS - 1));
    assert!(state.poll_due(afternoon + POLL_NORMAL_MS));
    assert!(!state.poll_due(-1));
    assert!(state.poll_retry_ready(clock));
    state.poll_attempted(clock);
    assert!(!state.poll_retry_ready(clock + Duration::from_millis(999)));
    assert!(state.poll_retry_ready(clock + Duration::from_secs(1)));
}
