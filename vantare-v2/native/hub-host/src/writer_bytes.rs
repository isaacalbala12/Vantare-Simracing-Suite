//! Fixed byte oracles, run in CI with both `serde_json` map representations.
use crate::{calendar, launcher, test_support::Root};
use std::collections::BTreeMap;
use vantare_launcher::{Document, Profile, Step, discovery, legacy, policy};

#[test]
fn writer_bytes_matrix_uses_the_expected_json_map_backend() {
    let mut value = serde_json::Map::new();
    value.insert("z".into(), serde_json::Value::Null);
    value.insert("a".into(), serde_json::Value::Null);
    // Workspace runs still exercise every byte oracle. The isolated CI jobs
    // additionally assert that their feature graph really differs as intended.
    if let Ok(expected) = std::env::var("VANTARE_EXPECT_JSON_ORDER") {
        let keys: Vec<_> = value.keys().map(String::as_str).collect();
        match expected.as_str() {
            "sorted" => assert_eq!(keys, ["a", "z"]),
            "insertion" => assert_eq!(keys, ["z", "a"]),
            _ => panic!("unknown writer matrix configuration"),
        }
    }
}

#[test]
fn writer_bytes_calendar_preserves_array_order_and_sorts_unknown_objects() {
    let root = Root::new();
    std::fs::write(
        root.path.join("calendar-prefs.json"),
        br#"{"utc":false,"future":{"z":0,"a":[{"z":2,"a":1},3]}}"#,
    )
    .unwrap();
    std::fs::write(
        root.path.join("calendar-following.json"),
        br#"{"seriesIds":["qa2","qa1"]}"#,
    )
    .unwrap();
    let mut state = calendar::State::new(root.path.clone());
    let view = state.config();
    state
        .utc_set(true, view.prefs_revision.as_deref().unwrap())
        .unwrap();
    state
        .follow_set("qa2", false, view.following_revision.as_deref().unwrap())
        .unwrap();
    assert_eq!(
        std::fs::read(root.path.join("calendar-prefs.json")).unwrap(),
        include_bytes!("../fixtures/writer-bytes/calendar-prefs.json")
    );
    assert_eq!(
        std::fs::read(root.path.join("calendar-following.json")).unwrap(),
        include_bytes!("../fixtures/writer-bytes/calendar-following.json")
    );
}

#[test]
fn writer_bytes_calendar_alerts_use_the_same_order_on_both_write_paths() {
    let root = Root::new();
    let expected = include_bytes!("../fixtures/writer-bytes/calendar-alerts.json");
    let mut alerts: calendar::CalendarAlerts = serde_json::from_slice(expected).unwrap();
    alerts.lead_min = 10;
    alerts.notify_week = true;
    std::fs::write(
        root.path.join("calendar-alerts.json"),
        serde_json::to_vec(&alerts).unwrap(),
    )
    .unwrap();
    let mut state = calendar::State::new(root.path.clone());
    let view = state.config();
    alerts.lead_min = 15;
    let view = state
        .alerts_save(&alerts, view.alerts_revision.as_deref().unwrap())
        .unwrap();
    state
        .notify_week_set(false, view.alerts_revision.as_deref().unwrap())
        .unwrap();
    assert_eq!(
        std::fs::read(root.path.join("calendar-alerts.json")).unwrap(),
        expected
    );
}

#[test]
fn writer_bytes_launcher_actions_and_editor_preserve_imports_with_identical_bytes() {
    for use_editor in [false, true] {
        let root = Root::new();
        let path = root.path.join("launcher.json");
        let mut document = Document::default();
        let mut profile = Profile::new("qa".into(), "QA".into());
        profile.steps.push(Step {
            app_id: "lmu".into(),
            delay_seconds: 0,
            args_override: None,
        });
        profile.set_policy(policy::Policy::default());
        document.profiles.push(profile);
        document.wails_import = Some(legacy::Import {
            source: "qa-legacy.json".into(),
            launcher: BTreeMap::from([(
                "future".into(),
                serde_json::from_str(r#"{"z":0,"a":[{"z":2,"a":1},3]}"#).unwrap(),
            )]),
        });
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        let revision = vantare_services::content_hash(&bytes);
        if use_editor {
            let mut draft = launcher::editor::draft(&document.profiles[0]);
            draft.favorite = true;
            let found = discovery::Discovery {
                apps: vec![discovery::Detected {
                    id: "lmu".into(),
                    executable: None,
                    availability: discovery::Availability {
                        launchable: true,
                        ..Default::default()
                    },
                }],
                ..Default::default()
            };
            launcher::editor::save(&path, &draft, &revision, &found, None, None).unwrap();
        } else {
            launcher::actions::favorite(&path, "qa", true, &revision).unwrap();
        }
        assert_eq!(
            std::fs::read(&path).unwrap(),
            include_bytes!("../fixtures/writer-bytes/launcher.json")
        );
    }
}
