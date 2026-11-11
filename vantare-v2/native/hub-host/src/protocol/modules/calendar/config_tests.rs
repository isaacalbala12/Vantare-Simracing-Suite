use super::*;
use std::{fs::OpenOptions, path::PathBuf};
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let base =
            std::env::var_os("VANTARE_HUB_QA_ROOT").map_or_else(std::env::temp_dir, PathBuf::from);
        std::fs::create_dir_all(&base).unwrap();
        let path = base.join(format!(
            "calendar-cas-{}",
            vantare_services::random_id().unwrap()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn state(&self) -> State {
        State::new(self.0.clone())
    }
    fn bytes(&self, name: &str) -> Vec<u8> {
        std::fs::read(self.0.join(name)).unwrap()
    }
    fn seed(&self, name: &str, bytes: &[u8]) {
        std::fs::write(self.0.join(name), bytes).unwrap();
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn publication(state: &mut State) -> (String, i64) {
    let source = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
    ));
    let view = state.refreshed(Some(source.into()), None).unwrap();
    let schedule = view.official.unwrap();
    (
        schedule.series[0].id.clone(),
        date_millis(&schedule.valid_from).unwrap() + 1,
    )
}
#[test]
fn stale_hub_cannot_overwrite_and_unknown_prefs_fields_survive() {
    let root = Root::new();
    root.seed(
        "calendar-prefs.json",
        br#"{"utc":false,"future":{"keep":[1,2]}}"#,
    );
    let mut a = root.state();
    let mut b = root.state();
    let revision = a.config().prefs_revision.unwrap();
    let saved = a.utc_set(true, &revision).unwrap();
    assert!(saved.utc);
    assert_ne!(saved.prefs_revision.as_deref(), Some(revision.as_str()));
    assert!(
        matches!(b.utc_set(false,&revision),Err(HostError::CalendarConflict {current}) if current.utc)
    );
    let document: Value = serde_json::from_slice(&root.bytes("calendar-prefs.json")).unwrap();
    assert_eq!(document["future"], json!({"keep":[1,2]}));
    assert!(!root.0.join("calendar-following.json").exists());
    assert!(!root.0.join("calendar-alerts.json").exists());
}
#[test]
fn newly_created_documents_match_gpui_initial_content() {
    // Frozen GPUI: calendar/alerts.rs:99-140, calendar.rs:72-85 and toggle_fav.
    let root = Root::new();
    let mut state = root.state();
    let initial = state.config();
    state
        .utc_set(true, initial.prefs_revision.as_deref().unwrap())
        .unwrap();
    state
        .notify_week_set(false, initial.alerts_revision.as_deref().unwrap())
        .unwrap();
    let (id, now) = publication(&mut state);
    state
        .follow_set_at(
            &id,
            true,
            initial.following_revision.as_deref().unwrap(),
            now,
        )
        .unwrap();
    assert_eq!(
        serde_json::from_slice::<Value>(&root.bytes("calendar-prefs.json")).unwrap(),
        json!({"utc":true})
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&root.bytes("calendar-following.json")).unwrap(),
        json!({"seriesIds":[id]})
    );
    assert_eq!(
        serde_json::from_slice::<Value>(&root.bytes("calendar-alerts.json")).unwrap(),
        json!({"leadMin":10,"bands":[],"slots":[],"channels":{"windows":true,"inTrack":true,"sound":false},"autoLaunch":false,"notifyWeek":false})
    );
}
#[test]
fn strict_following_matches_load_and_never_rewrites_protected_content() {
    for bytes in [
        b"{}".as_slice(),
        br#"{"seriesIds":[],"version":1}"#,
        br#"{"seriesIds":[],"future":1}"#,
        br#"{"seriesIds":["dup","dup"]}"#,
    ] {
        let root = Root::new();
        root.seed("calendar-following.json", bytes);
        let mut state = root.state();
        let config = state.config();
        assert_eq!(config.documents.following, CalendarDocumentState::Protected);
        assert!(config.following_revision.is_none());
        let read = state.load();
        assert!(read.invalid_cache);
        assert!(read.following.is_empty());
        assert_eq!(
            state.follow_set("unknown", false, &empty_revision()),
            Err(HostError::Protected)
        );
        assert_eq!(root.bytes("calendar-following.json"), bytes);
    }
}
#[test]
fn alerts_reject_unknown_fields_and_partial_channels_like_gpui() {
    for value in [
        json!({"version":1}),
        json!({"future":1}),
        json!({"channels":{}}),
        json!({"channels":{"windows":true,"sound":false}}),
        json!({"channels":{"windows":true,"inTrack":true,"sound":false,"extra":1}}),
        json!({"bands":[{"seriesId":"qa","from":1,"to":2,"extra":1}]}),
        json!({"slots":[{"seriesId":"qa","at":1,"extra":1}]}),
        json!({"leadMin":7}),
        json!({"bands":[{"seriesId":"qa","from":2,"to":1}]}),
    ] {
        let root = Root::new();
        let bytes = serde_json::to_vec(&value).unwrap();
        root.seed("calendar-alerts.json", &bytes);
        let mut state = root.state();
        let config = state.config();
        assert_eq!(config.documents.alerts, CalendarDocumentState::Protected);
        assert!(config.alerts_revision.is_none());
        assert_eq!(
            state.notify_week_set(false, &empty_revision()),
            Err(HostError::Protected)
        );
        assert_eq!(root.bytes("calendar-alerts.json"), bytes);
    }
}
#[test]
fn protected_documents_do_not_block_writes_to_other_documents() {
    let root = Root::new();
    root.seed("calendar-alerts.json", b"corrupt");
    root.seed("calendar-following.json", b"{}");
    let mut state = root.state();
    let config = state.config();
    assert_eq!(config.documents.alerts, CalendarDocumentState::Protected);
    assert_eq!(config.documents.following, CalendarDocumentState::Protected);
    let saved = state
        .utc_set(true, config.prefs_revision.as_deref().unwrap())
        .unwrap();
    assert!(saved.utc);
    assert_eq!(saved.documents.alerts, CalendarDocumentState::Protected);
    assert_eq!(root.bytes("calendar-alerts.json"), b"corrupt");
    assert_eq!(root.bytes("calendar-following.json"), b"{}");
    root.seed("calendar-prefs.json", b"invalid prefs");
    root.seed("calendar-alerts.json", br#"{"notifyWeek":true}"#);
    let config = state.config();
    assert!(
        !state
            .notify_week_set(false, config.alerts_revision.as_deref().unwrap())
            .unwrap()
            .alerts
            .notify_week
    );
    assert_eq!(root.bytes("calendar-prefs.json"), b"invalid prefs");
    root.seed("calendar-prefs.json", br#"{"utc":true}"#);
    // A write without configLoad reads only its own document.
    let mut fresh = root.state();
    let fresh_revision = revision(Some(br#"{"utc":true}"#));
    assert!(!fresh.utc_set(false, &fresh_revision).unwrap().utc);
}
#[test]
fn noops_keep_missing_files_missing_and_do_not_take_the_write_lock() {
    let root = Root::new();
    let mut state = root.state();
    let initial = state.config();
    assert_eq!(
        state
            .utc_set(false, initial.prefs_revision.as_deref().unwrap())
            .unwrap(),
        initial
    );
    assert_eq!(
        state
            .notify_week_set(true, initial.alerts_revision.as_deref().unwrap())
            .unwrap(),
        initial
    );
    assert_eq!(
        state
            .follow_set(
                "unknown",
                false,
                initial.following_revision.as_deref().unwrap()
            )
            .unwrap(),
        initial
    );
    assert_eq!(std::fs::read_dir(&root.0).unwrap().count(), 0);
    root.seed("calendar-alerts.json", br#"{"notifyWeek":false}"#);
    let alerts_revision = state.config().alerts_revision.unwrap();
    assert_eq!(
        state
            .notify_week_set(false, &alerts_revision)
            .unwrap()
            .alerts_revision
            .as_deref(),
        Some(alerts_revision.as_str())
    );
    assert_eq!(
        root.bytes("calendar-alerts.json"),
        br#"{"notifyWeek":false}"#
    );
    root.seed("calendar-prefs.json", br#"{"utc":true,"future":1}"#);
    let config = state.config();
    let revision = config.prefs_revision.unwrap();
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(root.0.join("calendar-prefs.json.lock"))
        .unwrap();
    lock.try_lock().unwrap();
    assert_eq!(
        state
            .utc_set(true, &revision)
            .unwrap()
            .prefs_revision
            .as_deref(),
        Some(revision.as_str())
    );
    assert_eq!(state.utc_set(false, &revision), Err(HostError::Busy));
    assert_eq!(
        root.bytes("calendar-prefs.json"),
        br#"{"utc":true,"future":1}"#
    );
    drop(lock);
}
#[test]
fn following_noops_preserve_revision_and_can_remove_retired_series() {
    let root = Root::new();
    root.seed("calendar-following.json", br#"{"seriesIds":["retired"]}"#);
    let mut state = root.state();
    let revision = state.config().following_revision.unwrap();
    assert_eq!(
        state
            .follow_set("retired", true, &revision)
            .unwrap()
            .following_revision
            .as_deref(),
        Some(revision.as_str())
    );
    assert_eq!(
        root.bytes("calendar-following.json"),
        br#"{"seriesIds":["retired"]}"#
    );
    assert!(
        state
            .follow_set("retired", false, &revision)
            .unwrap()
            .following
            .is_empty()
    );
}
#[test]
fn new_favorites_require_a_loaded_current_publication_not_previous() {
    let root = Root::new();
    let mut state = root.state();
    let revision = state.config().following_revision.unwrap();
    assert_eq!(
        state.follow_set_at("unknown", true, &revision, 1),
        Err(HostError::CalendarScheduleUnavailable)
    );
    let (id, now) = publication(&mut state);
    assert_eq!(
        state.follow_set_at("absent", true, &revision, now),
        Err(HostError::Rejected)
    );
    let saved = state.follow_set_at(&id, true, &revision, now).unwrap();
    assert_eq!(saved.following, vec![id.clone()]);
    assert!(matches!(
        state.follow_set_at(&id, false, &revision, now),
        Err(HostError::CalendarConflict { .. })
    ));
    let revision = saved.following_revision.unwrap();
    state.follow_set_at(&id, false, &revision, now).unwrap();
    let revision = state.config().following_revision.unwrap();
    let mut previous = state.view.official.clone().unwrap();
    previous.series[0].id = "previous-only".into();
    state.view.previous = Some(previous);
    assert_eq!(
        state.follow_set_at("previous-only", true, &revision, now),
        Err(HostError::Rejected)
    );
    state.view.previous = state.view.official.take();
    assert_eq!(
        state.follow_set_at(&id, true, &revision, now),
        Err(HostError::CalendarScheduleUnavailable)
    );
    state.view.official = state.view.previous.take();
    assert_eq!(
        state.follow_set_at(&id, true, &revision, now + 8 * 86_400_000),
        Err(HostError::CalendarScheduleUnavailable)
    );
    state.view.fallback = state.view.official.take();
    assert!(state.follow_set_at(&id, true, &revision, now).is_ok());
}
#[test]
fn a_new_favorite_cannot_exceed_the_256_series_limit() {
    let root = Root::new();
    root.seed("calendar-following.json",&serde_json::to_vec(&json!({"seriesIds":(0..SERIES_LIMIT).map(|i|format!("retired-{i}")).collect::<Vec<_>>()})).unwrap());
    let before = root.bytes("calendar-following.json");
    let mut state = root.state();
    let revision = state.config().following_revision.unwrap();
    let (id, now) = publication(&mut state);
    assert_eq!(
        state.follow_set_at(&id, true, &revision, now),
        Err(HostError::Rejected)
    );
    assert_eq!(root.bytes("calendar-following.json"), before);
}
#[test]
fn invalid_and_oversized_prefs_are_protected_without_modifying_them() {
    for bytes in [
        b"corrupt".to_vec(),
        br#"{"utc":"false"}"#.to_vec(),
        vec![b' '; usize::try_from(CONFIG_LIMIT).unwrap() + 1],
    ] {
        let root = Root::new();
        root.seed("calendar-prefs.json", &bytes);
        let mut state = root.state();
        let config = state.config();
        assert_eq!(config.documents.prefs, CalendarDocumentState::Protected);
        assert_eq!(
            state.utc_set(true, &empty_revision()),
            Err(HostError::Protected)
        );
        assert_eq!(root.bytes("calendar-prefs.json"), bytes);
    }
}
#[cfg(any(windows, unix))]
#[test]
fn symlink_documents_are_protected_and_the_target_is_untouched() {
    let root = Root::new();
    let target = root.0.join("original.json");
    std::fs::write(&target, br#"{"utc":false}"#).unwrap();
    let link = root.0.join("calendar-prefs.json");
    #[cfg(windows)]
    let result = std::os::windows::fs::symlink_file(&target, &link);
    #[cfg(unix)]
    let result = std::os::unix::fs::symlink(&target, &link);
    if let Err(error) = result {
        if error.kind() == std::io::ErrorKind::PermissionDenied
            || error.raw_os_error() == Some(1314)
        {
            eprintln!("QA symlink skipped: OS privilege unavailable");
            return;
        }
        panic!("QA symlink setup: {error}");
    }
    let mut state = root.state();
    assert_eq!(
        state.config().documents.prefs,
        CalendarDocumentState::Protected
    );
    assert_eq!(
        state.utc_set(true, &empty_revision()),
        Err(HostError::Protected)
    );
    assert_eq!(std::fs::read(target).unwrap(), br#"{"utc":false}"#);
}

#[test]
fn alerts_save_keeps_noops_absent_and_uses_the_same_observed_cas() {
    let root = Root::new();
    let mut state = root.state();
    let initial = state.config();
    let revision = initial.alerts_revision.unwrap();
    assert_eq!(state.alerts_save_at(&CalendarAlerts::default(), &revision, 0).unwrap().alerts_revision, Some(revision.clone()));
    assert!(!root.0.join("calendar-alerts.json").exists());
    let mut alerts = CalendarAlerts::default();
    alerts.channels.sound = true;
    let saved = state.alerts_save_at(&alerts, &revision, 0).unwrap();
    assert_eq!(saved.alerts, alerts);
    assert_eq!(serde_json::from_slice::<CalendarAlerts>(&root.bytes("calendar-alerts.json")).unwrap(), alerts);
    let bytes = root.bytes("calendar-alerts.json");
    alerts.lead_min = 15;
    assert!(matches!(state.alerts_save_at(&alerts, &revision, 0), Err(HostError::CalendarConflict { .. })));
    assert_eq!(root.bytes("calendar-alerts.json"), bytes);
}
#[test]
fn alerts_save_isolates_protected_documents_and_never_enables_auto_launch() {
    let root = Root::new();
    root.seed("calendar-prefs.json", b"broken");
    root.seed("calendar-following.json", b"{}");
    let mut state = root.state();
    let revision = state.config().alerts_revision.unwrap();
    let mut alerts = CalendarAlerts::default();
    alerts.auto_launch = true;
    assert_eq!(state.alerts_save_at(&alerts, &revision, 0), Err(HostError::Rejected));
    assert!(!root.0.join("calendar-alerts.json").exists());
    alerts.auto_launch = false;
    alerts.lead_min = 15;
    state.alerts_save_at(&alerts, &revision, 0).unwrap();
    assert_eq!(root.bytes("calendar-prefs.json"), b"broken");
    assert_eq!(root.bytes("calendar-following.json"), b"{}");
    root.seed("calendar-alerts.json", br#"{"autoLaunch":true}"#);
    let config = state.config();
    let revision = config.alerts_revision.unwrap();
    alerts = config.alerts;
    alerts.notify_week = false;
    state.alerts_save_at(&alerts, &revision, 0).unwrap();
    let revision = state.config().alerts_revision.unwrap();
    alerts.auto_launch = false;
    assert!(!state.alerts_save_at(&alerts, &revision, 0).unwrap().alerts.auto_launch);
    root.seed("calendar-alerts.json", br#"{"version":1}"#);
    assert_eq!(state.alerts_save_at(&alerts, &revision, 0), Err(HostError::Protected));
}
#[test]
fn alerts_save_requires_published_series_and_an_exact_future_departure() {
    let root = Root::new();
    let mut state = root.state();
    let revision = state.config().alerts_revision.unwrap();
    let mut alerts = CalendarAlerts::default();
    alerts.bands.push(CalendarBand { series_id: "missing".into(), from: 1200, to: 1380, days: CalendarDays::All, mode: CalendarBandMode::Each });
    assert_eq!(state.alerts_save_at(&alerts, &revision, 0), Err(HostError::CalendarScheduleUnavailable));
    let (id, now) = publication(&mut state);
    assert_eq!(state.alerts_save_at(&alerts, &revision, now), Err(HostError::Rejected));
    alerts.bands[0].series_id.clone_from(&id);
    let saved = state.alerts_save_at(&alerts, &revision, now).unwrap();
    let revision = saved.alerts_revision.unwrap();
    let at = (now / 1000 / 900 + 1) * 900;
    alerts.slots.push(CalendarSlot { series_id: id, at });
    let saved = state.alerts_save_at(&alerts, &revision, now).unwrap();
    let revision = saved.alerts_revision.unwrap();
    alerts.slots[0].at += 1;
    assert_eq!(state.alerts_save_at(&alerts, &revision, now), Err(HostError::Rejected));
    alerts.slots[0].at = now / 1000 - 1;
    assert_eq!(state.alerts_save_at(&alerts, &revision, now), Err(HostError::Rejected));
    state.view.official = None;
    state.view.fallback = None;
    alerts.bands.clear();
    alerts.slots.clear();
    state.alerts_save_at(&alerts, &revision, now).unwrap();
}
#[test]
fn alerts_save_reports_busy_and_does_not_lock_a_noop() {
    let root = Root::new();
    let mut state = root.state();
    let revision = state.config().alerts_revision.unwrap();
    let lock = OpenOptions::new().write(true).create(true).truncate(false).open(root.0.join("calendar-alerts.json.lock")).unwrap();
    lock.try_lock().unwrap();
    let mut alerts = CalendarAlerts::default();
    state.alerts_save_at(&alerts, &revision, 0).unwrap();
    alerts.lead_min = 15;
    assert_eq!(state.alerts_save_at(&alerts, &revision, 0), Err(HostError::Busy));
    assert!(!root.0.join("calendar-alerts.json").exists());
    drop(lock);
}
