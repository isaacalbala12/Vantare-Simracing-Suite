use super::*;
fn document() -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]})).expect("fixture")
}
#[test]
fn validates_schedule_and_rejects_invalid_untrusted_fields() {
    assert!(CalendarSchedule::parse(&document()).is_ok());
    for (key, value) in [
        ("timezone", serde_json::json!("Europe/Madrid")),
        ("version", serde_json::json!(2)),
        ("validUntil", serde_json::json!("2026-11-01T00:00:00Z")),
        ("validFrom", serde_json::json!("invalid")),
    ] {
        let mut v: serde_json::Value = serde_json::from_slice(&document()).unwrap();
        v[key] = value;
        assert_eq!(
            CalendarSchedule::parse(&serde_json::to_vec(&v).unwrap()).unwrap_err(),
            HostError::Rejected
        );
    }
    for (key, value) in [
        ("name", serde_json::json!("x".repeat(TEXT_LIMIT + 1))),
        ("id", serde_json::json!("bad\n")),
        ("raceDurationMin", serde_json::json!(MINUTE_LIMIT + 1)),
        (
            "recurrence",
            serde_json::json!({"kind":"weekly-slots","days":["Mon"],"timesUTC":["25:00"]}),
        ),
    ] {
        let mut v: serde_json::Value = serde_json::from_slice(&document()).unwrap();
        v["series"][0][key] = value;
        assert!(CalendarSchedule::parse(&serde_json::to_vec(&v).unwrap()).is_err());
    }
    assert!(CalendarSchedule::parse(&vec![b' '; DOCUMENT_LIMIT + 1]).is_err());
}
#[test]
fn malformed_refresh_preserves_both_protected_snapshots() {
    let mut state = State::new(PathBuf::new());
    let input = String::from_utf8(document()).unwrap();
    let before = state.refreshed(Some(input.clone()), None).unwrap();
    assert!(state.refreshed(Some(input), Some("bad".into())).is_err());
    assert_eq!(state.view, before);
}
#[test]
fn calendar_capability_is_required_independently_of_tester() {
    let mut access = AccessView::default();
    assert!(!allowed(&access));
    access.verified = true;
    access.tester = true;
    assert!(!allowed(&access));
    access.calendar = true;
    assert!(allowed(&access));
    access.blocked = true;
    assert!(!allowed(&access));
}
#[test]
fn cache_load_keeps_original_bytes_and_reports_corruption_without_writes() {
    let base = std::env::temp_dir().join(format!(
        "vantare-calendar-read-{}",
        vantare_services::random_id().expect("QA id")
    ));
    std::fs::create_dir(&base).unwrap();
    let path = base.join("official-schedule.json");
    let original = document();
    std::fs::write(&path, &original).unwrap();
    let mut state = State::new(base.clone());
    assert!(state.load().official.is_some());
    assert_eq!(std::fs::read(&path).unwrap(), original);
    std::fs::write(&path, b"corrupt").unwrap();
    let view = state.load();
    assert!(view.invalid_cache);
    assert!(view.official.is_some());
    assert_eq!(std::fs::read(&path).unwrap(), b"corrupt");
    assert_eq!(std::fs::read_dir(&base).unwrap().count(), 1);
    std::fs::remove_dir_all(base).unwrap();
}

struct Root(std::path::PathBuf);
impl Root {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "vantare-calendar-review-{}",
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
fn publication(from: &str, until: &str) -> Vec<u8> {
    let mut v: serde_json::Value = serde_json::from_slice(&document()).unwrap();
    v["validFrom"] = from.into();
    v["validUntil"] = until.into();
    serde_json::to_vec(&v).unwrap()
}
#[test]
fn refresh_survives_load_of_an_older_cache_and_rotates_previous_without_a_clock() {
    let root = Root::new();
    let old = publication("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z");
    std::fs::write(root.0.join("official-schedule.json"), &old).unwrap();
    std::fs::write(
        root.0.join("calendar-stamps.json"),
        br#"{"checked":123,"updated":100}"#,
    )
    .unwrap();
    let mut state = State::new(root.0.clone());
    state.load();
    let refreshed = state
        .refreshed(Some(String::from_utf8(document()).unwrap()), None)
        .unwrap();
    assert_eq!(refreshed.checked, 123);
    assert_eq!(refreshed.updated, 100);
    assert_eq!(
        refreshed.previous.as_ref().unwrap().valid_from,
        "2026-11-02T00:00:00Z"
    );
    assert_eq!(state.load(), refreshed);
    assert_eq!(
        state
            .refreshed(Some(String::from_utf8(old).unwrap()), None)
            .unwrap(),
        refreshed
    );
    assert_eq!(state.refreshed(None, None).unwrap(), refreshed);
}
#[test]
fn disk_publications_never_roll_back_but_removed_files_are_cleared() {
    let root = Root::new();
    let path = root.0.join("official-schedule.json");
    std::fs::write(&path, document()).unwrap();
    let mut state = State::new(root.0.clone());
    state.load();
    std::fs::write(
        &path,
        publication("2026-11-02T00:00:00Z", "2026-11-09T00:00:00Z"),
    )
    .unwrap();
    assert_eq!(
        state.load().official.unwrap().valid_from,
        "2026-11-09T00:00:00Z"
    );
    std::fs::remove_file(path).unwrap();
    assert!(state.load().official.is_none());
}
#[test]
fn oversized_files_bad_stamps_and_duplicate_following_are_reported_without_writes() {
    for (name, bytes) in [
        ("official-schedule.json", vec![b' '; DOCUMENT_LIMIT + 1]),
        (
            "calendar-stamps.json",
            br#"{"checked":-1,"updated":1}"#.to_vec(),
        ),
        (
            "calendar-stamps.json",
            format!("{{\"checked\":{},\"updated\":1}}", TIMESTAMP_LIMIT + 1).into_bytes(),
        ),
        (
            "calendar-following.json",
            br#"{"seriesIds":["qa","qa"]}"#.to_vec(),
        ),
    ] {
        let root = Root::new();
        let path = root.0.join(name);
        std::fs::write(&path, &bytes).unwrap();
        let mut state = State::new(root.0.clone());
        assert!(state.load().invalid_cache);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
}
#[test]
fn linked_cache_is_not_followed() {
    let root = Root::new();
    let target = root.0.join("target.json");
    std::fs::write(&target, document()).unwrap();
    let link = root.0.join("official-schedule.json");
    #[cfg(windows)]
    let created = std::os::windows::fs::symlink_file(&target, &link);
    #[cfg(unix)]
    let created = std::os::unix::fs::symlink(&target, &link);
    if created.is_err() {
        eprintln!("QA symlink test omitted: privilege unavailable");
        return;
    }
    let mut state = State::new(root.0.clone());
    let view = state.load();
    assert!(view.invalid_cache);
    assert!(view.official.is_none());
    assert_eq!(std::fs::read(target).unwrap(), document());
}
#[test]
fn strict_dates_and_identities_match_the_shared_validation_corpus() {
    let corpus: serde_json::Value = serde_json::from_slice(include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../hub-web/fixtures/calendar-validation.json"
    )))
    .unwrap();
    for row in corpus["dates"].as_array().unwrap() {
        let value = row["value"].as_str().unwrap();
        assert_eq!(
            date_millis(value).is_some(),
            row["valid"].as_bool().unwrap(),
            "{value}"
        );
    }
    for row in corpus["identities"].as_array().unwrap() {
        let value = row["value"].as_str().unwrap();
        assert_eq!(
            text(value) && nonblank(value),
            row["valid"].as_bool().unwrap(),
            "{value:?}"
        );
    }
}
