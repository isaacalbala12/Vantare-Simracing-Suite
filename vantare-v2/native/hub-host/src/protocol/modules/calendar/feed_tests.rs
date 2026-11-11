use super::{FeedError, build, publish};
use crate::calendar::{
    CalendarAlerts, CalendarBand, CalendarBandMode, CalendarDays, CalendarSchedule, CalendarSlot,
    CalendarView, State, agenda,
};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use vantare_ipc::session_alerts::Feed;
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let base =
            std::env::var_os("VANTARE_HUB_QA_ROOT").map_or_else(std::env::temp_dir, PathBuf::from);
        std::fs::create_dir_all(&base).unwrap();
        let path = base.join(format!(
            "calendar-feed-{}",
            vantare_services::random_id().unwrap()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn layout(&self) -> PathBuf {
        self.0.join("layout.json")
    }
    fn saved(&self) -> Feed {
        serde_json::from_slice(&std::fs::read(self.0.join("session-alerts-feed.json")).unwrap())
            .unwrap()
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn schedule() -> CalendarSchedule {
    CalendarSchedule::parse(br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap()
}
fn millis(value: i64) -> u64 {
    u64::try_from(value).unwrap()
}
fn now() -> i64 {
    chrono::DateTime::parse_from_rfc3339("2026-11-12T12:00:00Z")
        .unwrap()
        .timestamp_millis()
}
fn view() -> CalendarView {
    CalendarView {
        official: Some(schedule()),
        ..Default::default()
    }
}
fn alerts() -> CalendarAlerts {
    CalendarAlerts {
        bands: vec![CalendarBand {
            series_id: "qa".into(),
            from: 0,
            to: 1440,
            days: CalendarDays::All,
            mode: CalendarBandMode::Each,
        }],
        ..Default::default()
    }
}
#[test]
fn only_current_alerted_departures_are_published_and_bands_are_silent_in_track() {
    let view = view();
    let alerts = alerts();
    let feed = build(&view, &alerts, now(), true, false).unwrap();
    assert_eq!(feed.events.len(), 2);
    assert_eq!(feed.events[0].starts_at_ms, millis(now()));
    assert_eq!(feed.events[0].label, "QA · Spa");
    assert!(feed.events[0].id.starts_with("qa:"));
    for (enabled, in_track) in [(false, false), (true, true)] {
        assert!(
            build(&view, &alerts, now(), enabled, in_track)
                .unwrap()
                .events
                .is_empty()
        );
    }
    assert!(
        build(&view, &CalendarAlerts::default(), now(), true, false)
            .unwrap()
            .events
            .is_empty()
    );
    assert!(
        build(&view, &alerts, now() + 7 * 86_400_000, true, false)
            .unwrap()
            .events
            .is_empty()
    );
    let previous = CalendarView {
        previous: view.official.clone(),
        ..Default::default()
    };
    assert!(
        build(&previous, &alerts, now(), true, false)
            .unwrap()
            .events
            .is_empty()
    );
}
#[test]
fn a_specific_weekly_slot_remains_visible_in_track_and_channels_disable_it() {
    let mut schedule = schedule();
    schedule.series[0].recurrence.kind = "weekly-slots".into();
    schedule.series[0].recurrence.days = vec!["Thu".into()];
    schedule.series[0].recurrence.times_utc = vec!["12:30".into()];
    let view = CalendarView {
        official: Some(schedule),
        ..Default::default()
    };
    let mut alerts = CalendarAlerts {
        slots: vec![CalendarSlot {
            series_id: "qa".into(),
            at: (now() + 1_800_000) / 1000,
        }],
        ..Default::default()
    };
    let feed = build(&view, &alerts, now(), true, true).unwrap();
    assert_eq!(feed.events.len(), 1);
    assert_eq!(feed.events[0].starts_at_ms, millis(now() + 1_800_000));
    alerts.channels.in_track = false;
    assert!(
        build(&view, &alerts, now(), true, true)
            .unwrap()
            .events
            .is_empty()
    );
}
#[test]
fn malformed_clock_and_excessive_expansion_fail_closed() {
    assert_eq!(
        build(&view(), &alerts(), -1, true, false),
        Err(FeedError::Clock)
    );
    let mut view = view();
    let source = view.official.as_mut().unwrap();
    source.series[0].recurrence.interval_minutes = 1;
    let mut alerts = alerts();
    for i in 1..5 {
        let mut series = source.series[0].clone();
        series.id = format!("qa-{i}");
        source.series.push(series);
        let mut band = alerts.bands[0].clone();
        band.series_id = format!("qa-{i}");
        alerts.bands.push(band);
    }
    assert_eq!(
        build(&view, &alerts, now(), true, false),
        Err(FeedError::Limit)
    );
    let source = view.official.as_ref().unwrap();
    assert_eq!(
        agenda::starts(
            source,
            &source.series[0],
            super::super::date_millis(&source.valid_from).unwrap(),
            super::super::date_millis(&source.valid_until).unwrap()
        ),
        Err(agenda::AgendaError::Expansion)
    );
}
#[test]
fn official_wins_over_backup_by_id_or_normalized_name() {
    let mut view = view();
    let mut fallback = schedule();
    fallback.series[0].id = "other-id".into();
    fallback.series[0].name = "Q-A".into();
    fallback.series[0].track = "Monza".into();
    let mut extra = fallback.series[0].clone();
    extra.id = "backup".into();
    extra.name = "Backup".into();
    fallback.series.push(extra);
    view.fallback = Some(fallback);
    let current = agenda::current(&view, now()).unwrap();
    assert_eq!(current.series.len(), 2);
    assert_eq!(current.series[0].track, "Spa");
    assert_eq!(current.series[1].source, "racecontrol");
}
#[test]
fn unchanged_feed_uses_five_second_heartbeat_and_clock_rollback_is_immediate() {
    let root = Root::new();
    let mut feed = build(&view(), &alerts(), now(), true, false).unwrap();
    assert!(publish(&root.layout(), &feed).unwrap());
    let lock = std::fs::OpenOptions::new()
        .write(true)
        .open(root.0.join("session-alerts-feed.json.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    for millis in [1, 1000, 4999] {
        feed.updated_at_ms = u64::try_from(now() + millis).unwrap();
        assert!(!publish(&root.layout(), &feed).unwrap());
    }
    drop(lock);
    feed.updated_at_ms = millis(now() + 5000);
    assert!(publish(&root.layout(), &feed).unwrap());
    assert_eq!(root.saved(), feed);
    feed.updated_at_ms = millis(now());
    assert!(publish(&root.layout(), &feed).unwrap());
    assert_eq!(root.saved(), feed);
    assert_eq!(feed.current(feed.updated_at_ms).len(), 2);
    assert!(feed.current(feed.updated_at_ms + 10_001).is_empty());
}
#[test]
fn tick_reads_calendar_without_visiting_the_section_and_clears_on_lost_rights() {
    let root = Root::new();
    let schedule = schedule();
    let original = serde_json::to_vec(&alerts()).unwrap();
    std::fs::write(
        root.0.join("official-schedule.json"),
        serde_json::to_vec(&schedule).unwrap(),
    )
    .unwrap();
    std::fs::write(root.0.join("calendar-alerts.json"), &original).unwrap();
    let mut state = State::new(root.0.clone()).with_layout(root.layout());
    let tick = Instant::now();
    state.tick_feed(now(), tick, true, false);
    assert_eq!(root.saved().events.len(), 2);
    state.tick_feed(now() + 100, tick + Duration::from_millis(100), false, false);
    assert!(root.saved().events.is_empty());
    assert_eq!(
        std::fs::read(root.0.join("calendar-alerts.json")).unwrap(),
        original
    );
}
#[test]
fn protected_alert_preferences_clear_previous_feed_without_rewriting_them() {
    let root = Root::new();
    publish(
        &root.layout(),
        &build(&view(), &alerts(), now(), true, false).unwrap(),
    )
    .unwrap();
    let bad = br#"{"version":1}"#;
    std::fs::write(root.0.join("calendar-alerts.json"), bad).unwrap();
    std::fs::write(
        root.0.join("official-schedule.json"),
        serde_json::to_vec(&schedule()).unwrap(),
    )
    .unwrap();
    let mut state = State::new(root.0.clone()).with_layout(root.layout());
    state.tick_feed(now() + 1000, Instant::now(), true, false);
    assert!(root.saved().events.is_empty());
    assert_eq!(
        std::fs::read(root.0.join("calendar-alerts.json")).unwrap(),
        bad
    );
}
#[test]
fn publishing_never_overwrites_an_oversized_or_non_file_destination() {
    let root = Root::new();
    let path = root.0.join("session-alerts-feed.json");
    std::fs::write(&path, vec![b'x'; 65_537]).unwrap();
    let feed = build(&view(), &alerts(), now(), true, false).unwrap();
    assert_eq!(publish(&root.layout(), &feed), Err(FeedError::Io));
    assert_eq!(std::fs::metadata(&path).unwrap().len(), 65_537);
    std::fs::remove_file(&path).unwrap();
    std::fs::create_dir(&path).unwrap();
    assert_eq!(publish(&root.layout(), &feed), Err(FeedError::Protected));
}

#[test]
fn an_oversized_serialized_feed_is_not_written() {
 let root=Root::new();let mut feed=build(&view(),&alerts(),now(),true,false).unwrap();feed.events=vec![feed.events[0].clone();256];for event in &mut feed.events {event.label="x".repeat(300);}
 assert_eq!(publish(&root.layout(),&feed),Err(FeedError::Limit));assert!(!root.0.join("session-alerts-feed.json").exists());
}
#[test]
fn a_busy_writer_preserves_the_old_feed_and_can_retry_without_waiting() {
 let root=Root::new();let mut feed=build(&view(),&alerts(),now(),true,false).unwrap();publish(&root.layout(),&feed).unwrap();let original=root.saved();
 let lock=std::fs::OpenOptions::new().write(true).open(root.0.join("session-alerts-feed.json.lock")).unwrap();lock.try_lock().unwrap();feed.events.clear();assert_eq!(publish(&root.layout(),&feed),Err(FeedError::Io));assert_eq!(root.saved(),original);drop(lock);assert!(publish(&root.layout(),&feed).unwrap());assert!(root.saved().events.is_empty());
}
#[cfg(windows)]
#[test]
fn a_symbolic_feed_destination_never_changes_its_target() {
 let root=Root::new();let target=root.0.join("other.json");std::fs::write(&target,b"keep").unwrap();let link=root.0.join("session-alerts-feed.json");
 if let Err(error)=std::os::windows::fs::symlink_file(&target,&link) {if error.kind()==std::io::ErrorKind::PermissionDenied || error.raw_os_error()==Some(1314) {eprintln!("QA symlink privilege unavailable; case skipped");return;}panic!("QA symlink setup: {error:?}");}
 assert_eq!(publish(&root.layout(),&build(&view(),&alerts(),now(),true,false).unwrap()),Err(FeedError::Protected));assert_eq!(std::fs::read(&target).unwrap(),b"keep");
}
