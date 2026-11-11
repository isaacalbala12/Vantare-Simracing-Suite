use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::calendar::CalendarHistoryTrack>(&mut text);
    declare::<crate::calendar::CalendarHistoryWeek>(&mut text);
    declare::<crate::calendar::CalendarHistoryView>(&mut text);
    constants!(
        &mut text,
        "calendarHistoryWeeksLimit",
        crate::calendar::HISTORY_WEEKS_LIMIT
    );
    declare::<crate::calendar::CalendarDays>(&mut text);
    declare::<crate::calendar::CalendarBandMode>(&mut text);
    declare::<crate::calendar::CalendarBand>(&mut text);
    declare::<crate::calendar::CalendarSlot>(&mut text);
    declare::<crate::calendar::CalendarChannels>(&mut text);
    declare::<crate::calendar::CalendarAlerts>(&mut text);
    declare::<crate::calendar::CalendarDocumentState>(&mut text);
    declare::<crate::calendar::CalendarDocumentStates>(&mut text);
    declare::<crate::calendar::CalendarConfigView>(&mut text);

    declare::<crate::calendar::CalendarRecurrence>(&mut text);
    declare::<crate::calendar::CalendarPhase>(&mut text);
    declare::<crate::calendar::CalendarClass>(&mut text);
    declare::<crate::calendar::CalendarSeries>(&mut text);
    declare::<crate::calendar::CalendarSchedule>(&mut text);
    declare::<crate::calendar::CalendarView>(&mut text);

    constants!(
        &mut text,
        "calendarDocumentLimit",
        crate::calendar::DOCUMENT_LIMIT
    );
    constants!(
        &mut text,
        "calendarSeriesLimit",
        crate::calendar::SERIES_LIMIT
    );
    constants!(
        &mut text,
        "calendarStartsLimit",
        crate::calendar::STARTS_LIMIT
    );
    constants!(&mut text, "calendarDateLimit", crate::calendar::DATE_LIMIT);
    constants!(&mut text, "calendarTextLimit", crate::calendar::TEXT_LIMIT);
    constants!(&mut text, "calendarListLimit", crate::calendar::LIST_LIMIT);
    constants!(
        &mut text,
        "calendarMinuteLimit",
        crate::calendar::MINUTE_LIMIT
    );
    constants!(
        &mut text,
        "calendarTimestampLimit",
        crate::calendar::TIMESTAMP_LIMIT
    );
    constants!(&mut text, "calendarWeekdays", crate::calendar::WEEKDAYS);
    config_constants(&mut text);
    text
}
fn config_constants(text: &mut String) {
    constants!(
        text,
        "calendarRevisionLength",
        crate::calendar::config::REVISION_LENGTH
    );
    constants!(
        text,
        "calendarConfigLimit",
        crate::calendar::config::CONFIG_LIMIT
    );
    constants!(
        text,
        "calendarAlertLeads",
        crate::calendar::config::ALERT_LEADS
    );
    constants!(
        text,
        "calendarBandsLimit",
        crate::calendar::config::BANDS_LIMIT
    );
    constants!(
        text,
        "calendarDayMinutes",
        crate::calendar::config::DAY_MINUTES
    );
    constants!(
        text,
        "calendarSlotsLimit",
        crate::calendar::config::SLOTS_LIMIT
    );
    constants!(
        text,
        "calendarDays",
        [
            crate::calendar::CalendarDays::All,
            crate::calendar::CalendarDays::Weekdays,
            crate::calendar::CalendarDays::Weekend
        ]
    );
    constants!(
        text,
        "calendarBandModes",
        [
            crate::calendar::CalendarBandMode::Each,
            crate::calendar::CalendarBandMode::First
        ]
    );
    constants!(
        text,
        "calendarEmptyRevision",
        crate::calendar::config::empty_revision()
    );
    constants!(
        text,
        "calendarDefaultAlerts",
        crate::calendar::CalendarAlerts::default()
    );
    constants!(
        text,
        "calendarDocumentStates",
        [
            crate::calendar::CalendarDocumentState::Ready,
            crate::calendar::CalendarDocumentState::Protected,
            crate::calendar::CalendarDocumentState::Unavailable
        ]
    );
}
fn history_sample() -> HostToUi {
    sample_response(Reply::CalendarHistoryLoad {
        value: Box::new(crate::calendar::CalendarHistoryView {
            weeks: vec![crate::calendar::CalendarHistoryWeek {
                from: 1_791_244_800,
                until: 1_791_849_600,
                seen_at: 1_791_187_200,
                tracks: vec![crate::calendar::CalendarHistoryTrack {
                    series_id: "weekly-wec-weekly".into(),
                    name: "WEC Weekly".into(),
                    track: "Sebring".into(),
                }],
            }],
            invalid_cache: false,
        }),
    })
}
fn sample_config() -> crate::calendar::CalendarConfigView {
    crate::calendar::CalendarConfigView {
        utc: false,
        prefs_revision: Some(vantare_services::content_hash(&[0])),
        following: vec![],
        following_revision: Some(vantare_services::content_hash(&[0])),
        alerts: crate::calendar::CalendarAlerts::default(),
        alerts_revision: Some(vantare_services::content_hash(&[0])),
        documents: crate::calendar::CalendarDocumentStates {
            prefs: crate::calendar::CalendarDocumentState::Ready,
            following: crate::calendar::CalendarDocumentState::Ready,
            alerts: crate::calendar::CalendarDocumentState::Ready,
        },
    }
}
fn samples() -> (Vec<HostToUi>, Vec<UiToHost>) {
    let config = sample_config();
    let host = vec![
        history_sample(),
        HostToUi::Failure {
            id: 1,
            error: HostError::CalendarScheduleUnavailable,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::CalendarConflict {
                current: Box::new(config.clone()),
            },
        },
        sample_response(Reply::CalendarConfigLoad {
            value: Box::new(config.clone()),
        }),
        sample_response(Reply::CalendarUtcSet {
            value: Box::new(config.clone()),
        }),
        sample_response(Reply::CalendarNotifyWeekSet {
            value: Box::new(config.clone()),
        }),
        sample_response(Reply::CalendarFollowSet {
            value: Box::new(config.clone()),
        }),
        sample_response(Reply::CalendarLoad {
            value: Box::default(),
        }),
        sample_response(Reply::CalendarRefresh {
            value: Box::new(crate::calendar::CalendarView {
                official: Some(
                    crate::calendar::CalendarSchedule::parse(include_bytes!(concat!(
                        env!("CARGO_MANIFEST_DIR"),
                        "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
                    )))
                    .expect("public QA schedule"),
                ),
                ..Default::default()
            }),
        }),
        sample_response(Reply::CalendarConfigLoad {
            value: Box::new(crate::calendar::CalendarConfigView {
                documents: crate::calendar::CalendarDocumentStates {
                    prefs: crate::calendar::CalendarDocumentState::Protected,
                    ..Default::default()
                },
                ..Default::default()
            }),
        }),
    ];
    let ui = vec![
        UiToHost::Request {
            id: 1,
            request: Request::CalendarHistoryLoad {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarConfigLoad {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarUtcSet {
                utc: true,
                expected_revision: config.prefs_revision.expect("sample prefs revision"),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarNotifyWeekSet {
                enabled: false,
                expected_revision: config.alerts_revision.expect("sample alerts revision"),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarFollowSet {
                series_id: "qa".into(),
                followed: true,
                expected_revision: config
                    .following_revision
                    .expect("sample following revision"),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarLoad {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarRefresh {},
        },
    ];
    (host, ui)
}

pub(crate) fn corpus() -> serde_json::Value {
    let (host, ui) = samples();
    serde_json::json!({"host":host,"ui":ui})
}
