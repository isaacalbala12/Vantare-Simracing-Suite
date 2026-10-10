use super::*;
use crate::session::Session;
use vantare_domain::{Quality, SessionKind};

#[test]
fn session_columns_project_and_keep_simulator_order() {
    let prefs = Preferences::default();
    let mut settings = Settings::default();
    settings.apply_session_presets();
    // Distinct lists make selection observable even though D7 practice/qualy coincide.
    for (session, metric) in [
        (Session::Practice, "lastLap"),
        (Session::Qualifying, "bestLap"),
        (Session::Race, "gap"),
    ] {
        *settings.session_columns_mut(session) = vec![options::ColumnSetting {
            metric_id: metric.into(),
            ..options::ColumnSetting::default()
        }];
    }
    let mut widget = Widget::new(&settings, prefs);
    let mut photo = crate::source::fixed();
    for (kind, session) in [
        (SessionKind::Practice, Session::Practice),
        (SessionKind::Qualifying, Session::Qualifying),
        (SessionKind::Race, Session::Race),
        (SessionKind::Other("warmup".into()), Session::Practice),
    ] {
        photo.state.session.kind = Quality::Reliable(kind);
        photo.sequence += 1;
        widget.ingest(&photo, prefs);
        assert_eq!(
            widget.settings.columns.as_ref(),
            settings.session_columns(session)
        );
        let plan =
            standings::Plan::new(widget.board.clone().unwrap(), String::new(), photo.sequence);
        assert!(
            plan.rows
                .windows(2)
                .all(|rows| rows[0].position <= rows[1].position)
        );
    }
    photo.state.session.kind = Quality::Reliable(SessionKind::Qualifying);
    widget.ingest(&photo, prefs);
    photo.state.session.kind = Quality::Stale(SessionKind::Qualifying);
    widget.ingest(&photo, prefs);
    assert_eq!(
        widget.settings.columns.as_ref(),
        settings.session_columns(Session::Qualifying)
    );
    let unknown = Widget::new(&settings, prefs);
    assert_eq!(
        unknown.settings.columns.as_ref(),
        settings.session_columns(Session::Race)
    );
}

#[test]
fn resetting_legacy_race_without_columns_preserves_other_rendered_tabs() {
    for look in crate::look::Look::ALL {
        let saved = Settings::for_look(*look);
        let mut settings = saved.clone();
        *settings.session_columns_mut(Session::Race) = session_preset(Session::Race);
        let prefs = Preferences::default();
        let mut photo = crate::source::fixed();
        for session in [Session::Practice, Session::Qualifying] {
            photo.state.session.kind = Quality::Reliable(session.kind());
            let mut before = Widget::new(&saved, prefs);
            let mut after = Widget::new(&settings, prefs);
            before.ingest(&photo, prefs);
            after.ingest(&photo, prefs);
            assert_eq!(before.size(), after.size(), "{look:?}/{session:?}");
            assert_eq!(before.content, after.content);
        }
    }
}

#[test]
fn migration_preserves_columns_when_any_tab_is_edited_first() {
    let saved: Settings = serde_json::from_str(r#"{"columns":[{"metricId":"driverName","format":{"mode":"surname","maxChars":9}},{"metricId":"gap","enabled":false,"widthPreset":"lg"}]}"#).unwrap();
    for edited in Session::ALL {
        let mut settings = saved.clone();
        for session in Session::ALL {
            assert_eq!(settings.session_columns(session), saved.columns.as_ref());
        }
        settings.session_columns_mut(edited)[0].format.mode = "initial".into();
        for session in Session::ALL
            .into_iter()
            .filter(|session| *session != edited)
        {
            assert_eq!(settings.session_columns(session), saved.columns.as_ref());
        }
        let json = serde_json::to_string(&settings).unwrap();
        let roundtrip: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(roundtrip, settings);
    }
}

#[test]
fn new_presets_and_reset_preserve_other_tabs() {
    let mut settings = Settings::default();
    settings.apply_session_presets();
    let enabled = |session| {
        session_preset(session)
            .into_iter()
            .filter(|c| c.enabled)
            .map(|c| c.metric_id)
            .collect::<Vec<_>>()
    };
    assert_eq!(
        enabled(Session::Practice),
        [
            "position",
            "driverNumber",
            "driverName",
            "bestLap",
            "gap",
            "lastLap",
            "sectors"
        ]
    );
    assert_eq!(enabled(Session::Qualifying), enabled(Session::Practice));
    assert_eq!(
        enabled(Session::Race),
        [
            "position",
            "driverNumber",
            "driverName",
            "gap",
            "interval",
            "lastLap",
            "pit",
            "positionsGained",
            "tireCompound"
        ]
    );
    for reset in Session::ALL {
        settings.session_columns_mut(reset)[0].enabled = false;
        let before = settings.clone();
        *settings.session_columns_mut(reset) = session_preset(reset);
        for other in Session::ALL.into_iter().filter(|session| *session != reset) {
            assert_eq!(
                settings.session_columns(other),
                before.session_columns(other)
            );
        }
        assert_eq!(
            settings.session_columns(reset),
            Some(&session_preset(reset))
        );
    }
}
