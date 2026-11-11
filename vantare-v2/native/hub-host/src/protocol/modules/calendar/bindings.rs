use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::calendar::CalendarDays>(&mut text);
    declare::<crate::calendar::CalendarBandMode>(&mut text);
    declare::<crate::calendar::CalendarBand>(&mut text);
    declare::<crate::calendar::CalendarSlot>(&mut text);
    declare::<crate::calendar::CalendarChannels>(&mut text);
    declare::<crate::calendar::CalendarAlerts>(&mut text);
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
    constants!(
        &mut text,
        "calendarRevisionLength",
        crate::calendar::config::REVISION_LENGTH
    );
    constants!(
        &mut text,
        "calendarConfigLimit",
        crate::calendar::config::CONFIG_LIMIT
    );
    constants!(
        &mut text,
        "calendarAlertLeads",
        crate::calendar::config::ALERT_LEADS
    );
    constants!(
        &mut text,
        "calendarBandsLimit",
        crate::calendar::config::BANDS_LIMIT
    );
    constants!(
        &mut text,
        "calendarDayMinutes",
        crate::calendar::config::DAY_MINUTES
    );
    constants!(
        &mut text,
        "calendarSlotsLimit",
        crate::calendar::config::SLOTS_LIMIT
    );
    constants!(
        &mut text,
        "calendarDays",
        [
            crate::calendar::CalendarDays::All,
            crate::calendar::CalendarDays::Weekdays,
            crate::calendar::CalendarDays::Weekend
        ]
    );
    constants!(
        &mut text,
        "calendarBandModes",
        [
            crate::calendar::CalendarBandMode::Each,
            crate::calendar::CalendarBandMode::First
        ]
    );
    constants!(
        &mut text,
        "calendarEmptyRevision",
        crate::calendar::config::empty_revision()
    );
    constants!(
        &mut text,
        "calendarDefaultAlerts",
        crate::calendar::CalendarAlerts::default()
    );
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let config = crate::calendar::CalendarConfigView {
        utc: false,
        prefs_revision: vantare_services::content_hash(&[0]),
        following: vec![],
        following_revision: vantare_services::content_hash(&[0]),
        alerts: crate::calendar::CalendarAlerts::default(),
        alerts_revision: vantare_services::content_hash(&[0]),
    };
    let host = vec![
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
    ];
    let ui = vec![
        UiToHost::Request {
            id: 1,
            request: Request::CalendarConfigLoad {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarUtcSet {
                utc: true,
                expected_revision: config.prefs_revision,
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarNotifyWeekSet {
                enabled: false,
                expected_revision: config.alerts_revision,
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::CalendarFollowSet {
                series_id: "qa".into(),
                followed: true,
                expected_revision: config.following_revision,
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
    serde_json::json!({"host":host,"ui":ui})
}
