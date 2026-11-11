use super::*;
use std::path::PathBuf;
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "vantare-calendar-cas-{}",
            vantare_services::random_id().expect("QA id")
        ));
        std::fs::create_dir(&p).unwrap();
        Self(p)
    }
}
impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
#[test]
fn stale_hub_cannot_overwrite_and_unknown_fields_survive() {
    let root = Root::new();
    let path = root.0.join("calendar-prefs.json");
    std::fs::write(&path, br#"{"utc":false,"future":{"keep":[1,2]}}"#).unwrap();
    let mut a = State::new(root.0.clone());
    let mut b = State::new(root.0.clone());
    let revision = a.config().unwrap().prefs_revision;
    let saved = a.utc_set(true, &revision).unwrap();
    assert!(saved.utc);
    assert_ne!(saved.prefs_revision, revision);
    assert!(
        matches!(b.utc_set(false,&revision),Err(HostError::CalendarConflict {current}) if current.utc)
    );
    let document: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(document["future"], json!({"keep":[1,2]}));
    assert_eq!(document["utc"], true);
    assert!(!root.0.join("calendar-following.json").exists());
    assert!(!root.0.join("calendar-alerts.json").exists());
}
#[test]
fn notify_week_preserves_nested_unknown_fields_and_other_settings() {
    let root = Root::new();
    let path = root.0.join("calendar-alerts.json");
    std::fs::write(
        &path,
        br#"{"channels":{"sound":true,"future":"keep"},"notifyWeek":true,"future":[1]}"#,
    )
    .unwrap();
    let state = State::new(root.0.clone());
    let revision = state.config().unwrap().alerts_revision;
    let saved = state.notify_week_set(false, &revision).unwrap();
    assert!(!saved.alerts.notify_week);
    assert!(saved.alerts.channels.sound);
    let document: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(document["channels"]["future"], "keep");
    assert_eq!(document["future"], json!([1]));
}
#[test]
fn malformed_or_future_documents_are_never_overwritten() {
    for bytes in [
        b"corrupt".to_vec(),
        br#"{"version":2,"utc":false}"#.to_vec(),
        vec![b' '; usize::try_from(CONFIG_LIMIT).unwrap() + 1],
    ] {
        let root = Root::new();
        let path = root.0.join("calendar-prefs.json");
        std::fs::write(&path, &bytes).unwrap();
        let mut state = State::new(root.0.clone());
        assert_eq!(
            state.utc_set(true, &"a".repeat(REVISION_LENGTH)),
            Err(HostError::Protected)
        );
        assert_eq!(std::fs::read(path).unwrap(), bytes);
    }
}
#[test]
fn a_missing_preference_is_created_only_after_an_explicit_action() {
    let root = Root::new();
    let mut state = State::new(root.0.clone());
    let view = state.config().unwrap();
    assert!(!root.0.join("calendar-prefs.json").exists());
    assert!(
        !state
            .utc_set(true, &view.prefs_revision)
            .unwrap()
            .prefs_revision
            .is_empty()
    );
    assert!(root.0.join("calendar-prefs.json").exists());
}

#[test]
fn following_requires_a_known_series_but_can_remove_a_retired_one() {
    let root = Root::new();
    let path = root.0.join("calendar-following.json");
    std::fs::write(
        &path,
        br#"{"seriesIds":["retired"],"future":{"keep":true}}"#,
    )
    .unwrap();
    let mut state = State::new(root.0.clone());
    let before = std::fs::read(&path).unwrap();
    let revision = state.config().unwrap().following_revision;
    assert_eq!(
        state.follow_set("absent", true, &revision),
        Err(HostError::Rejected)
    );
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let removed = state.follow_set("retired", false, &revision).unwrap();
    assert!(removed.following.is_empty());
    let schedule = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
    ));
    let view = state.refreshed(Some(schedule.into()), None).unwrap();
    let id = view.official.unwrap().series[0].id.clone();
    let saved = state
        .follow_set(&id, true, &removed.following_revision)
        .unwrap();
    assert_eq!(saved.following, vec![id.clone()]);
    assert!(matches!(
        state.follow_set(&id, false, &removed.following_revision),
        Err(HostError::CalendarConflict { .. })
    ));
    let document: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    assert_eq!(document["future"], json!({"keep":true}));
    assert_eq!(document["seriesIds"], json!([id]));
}
#[test]
fn invalid_follow_identity_cannot_create_a_document() {
    let root = Root::new();
    let mut state = State::new(root.0.clone());
    let revision = state.config().unwrap().following_revision;
    for id in ["", "\u{feff}", "bad\n"] {
        assert_eq!(
            state.follow_set(id, true, &revision),
            Err(HostError::Rejected)
        );
    }
    assert!(!root.0.join("calendar-following.json").exists());
}
