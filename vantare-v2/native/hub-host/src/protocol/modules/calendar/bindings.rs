use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    notice_types(&mut text);
    launch_types(&mut text);
    declare::<crate::calendar::CalendarIcsScope>(&mut text);
    declare::<crate::calendar::CalendarIcsStatus>(&mut text);
    constants!(
        &mut text,
        "calendarIcsConfirmationMaxAgeMs",
        crate::calendar::ics::ICS_CONFIRMATION_MAX_AGE_MS
    );
    declare::<crate::calendar::CalendarIcsEntry>(&mut text);
    declare::<crate::calendar::CalendarIcsView>(&mut text);
    constants!(
        &mut text,
        "calendarIcsLimit",
        crate::calendar::ics::ICS_LIMIT
    );
    constants!(&mut text, "calendarIcsName", "vantare-calendario-lmu.ics");
    constants!(
        &mut text,
        "calendarIcsPreparedMaxAgeMs",
        crate::calendar::ics::ICS_PREPARED_MAX_AGE_MS
    );
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
    let (mut host, mut ui) = samples();
    host.push(sample_response(Reply::CalendarLaunchArm {
        value: Box::default(),
        config: None,
    }));
    host.push(sample_response(Reply::CalendarLaunchCancel {
        value: Box::default(),
    }));
    host.push(HostToUi::Event {
        event: crate::protocol::Event::CalendarLaunch {
            value: Box::default(),
        },
    });
    for mode in [
        crate::calendar::CalendarLaunchMode::Once {
            series_id: "beginner-lmgt3-fixed".into(),
            start_at: 1_800_000_180_000,
        },
        crate::calendar::CalendarLaunchMode::Alerts {
            expected_revision: "c".repeat(64),
        },
    ] {
        ui.push(UiToHost::Request {
            id: 1,
            request: Request::CalendarLaunchArm {
                profile: "lmu".into(),
                base_revision: "a".repeat(64),
                armed_generation: "b".repeat(64),
                mode,
            },
        });
    }
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::CalendarLaunchCancel {
            arm_id: "d".repeat(64),
        },
    });
    ui.push(UiToHost::Subscribe {
        topic: crate::protocol::Topic::CalendarLaunch,
    });

    let mut config = sample_config();
    config.alerts = sample_alerts();
    host.push(sample_response(Reply::CalendarAlertsSave {
        value: Box::new(config.clone()),
    }));
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::CalendarAlertsSave {
            alerts: Box::new(config.alerts),
            expected_revision: config.alerts_revision.expect("sample alerts revision"),
        },
    });
    host.push(sample_response(Reply::CalendarNoticeTest {
        accepted: true,
    }));
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::CalendarNoticeTest {},
    });
    for value in [
        crate::calendar::CalendarNotice::Start {
            id: "a".repeat(64),
            issued_at: 1_791_489_000_000,
            expires_at: 1_791_489_060_000,
            series: "WEC Weekly".into(),
            track: "Sebring".into(),
            at: 1_791_489_600_000,
            race_minutes: 100,
            silent: true,
        },
        crate::calendar::CalendarNotice::Week {
            id: "b".repeat(64),
            issued_at: 1_791_849_600_000,
            expires_at: 1_791_849_660_000,
            from: 1_791_849_600_000,
            until: 1_792_454_400_000,
            silent: false,
        },
        crate::calendar::CalendarNotice::Test {
            id: "c".repeat(64),
            issued_at: 1_791_489_000_000,
            expires_at: 1_791_489_060_000,
            request_id: 1,
            silent: true,
        },
    ] {
        host.push(HostToUi::Event {
            event: crate::protocol::Event::CalendarNotice { value },
        });
    }
    for error in [
        None,
        Some(crate::calendar::CalendarRefreshFailure::Busy),
        Some(crate::calendar::CalendarRefreshFailure::CoreUnavailable),
        Some(crate::calendar::CalendarRefreshFailure::Denied),
        Some(crate::calendar::CalendarRefreshFailure::Rejected),
    ] {
        host.push(HostToUi::Event {
            event: crate::protocol::Event::CalendarRefreshed {
                value: Box::default(),
                error,
            },
        });
    }
    let (ics_host, ics_ui) = ics_samples();
    host.extend(ics_host);
    ui.extend(ics_ui);
    serde_json::json!({"host":host,"ui":ui})
}

fn sample_alerts() -> crate::calendar::CalendarAlerts {
    let mut alerts = crate::calendar::CalendarAlerts::default();
    alerts.bands.push(crate::calendar::CalendarBand {
        series_id: "beginner-lmgt3-fixed".into(),
        from: 1200,
        to: 1380,
        days: crate::calendar::CalendarDays::All,
        mode: crate::calendar::CalendarBandMode::Each,
    });
    alerts.slots.push(crate::calendar::CalendarSlot {
        series_id: "weekly-wec-weekly".into(),
        at: 1_791_489_600,
    });
    alerts
}

fn ics_samples() -> (Vec<HostToUi>, Vec<UiToHost>) {
    (
        vec![
            sample_response(Reply::CalendarIcsPrepare {
                value: Box::new(crate::calendar::CalendarIcsView {
                    calendar: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n".into(),
                    prepared_hash: "a".repeat(64),
                    entries: vec![],
                    total: 0,
                    valid_until: "2026-10-13T00:00:00Z".into(),
                }),
            }),
            sample_response(Reply::CalendarIcsExport {
                status: crate::calendar::CalendarIcsStatus::Saved,
                confirmation_id: None,
            }),
            sample_response(Reply::CalendarIcsExport {
                status: crate::calendar::CalendarIcsStatus::Cancelled,
                confirmation_id: None,
            }),
            sample_response(Reply::CalendarIcsReplace {
                status: crate::calendar::CalendarIcsStatus::ReplacementRequired,
                confirmation_id: Some("b".repeat(64)),
            }),
            sample_response(Reply::CalendarIcsExport {
                status: crate::calendar::CalendarIcsStatus::Conflict,
                confirmation_id: None,
            }),
            HostToUi::Failure {
                id: 1,
                error: HostError::CalendarExportExtension,
            },
            HostToUi::Failure {
                id: 1,
                error: HostError::CalendarExportTooLarge,
            },
        ],
        vec![
            UiToHost::Request {
                id: 1,
                request: Request::CalendarIcsPrepare {
                    scope: crate::calendar::CalendarIcsScope::Favs,
                    alarm: true,
                },
            },
            UiToHost::Request {
                id: 1,
                request: Request::CalendarIcsPrepare {
                    scope: crate::calendar::CalendarIcsScope::Events,
                    alarm: false,
                },
            },
            UiToHost::Request {
                id: 1,
                request: Request::CalendarIcsPrepare {
                    scope: crate::calendar::CalendarIcsScope::All,
                    alarm: true,
                },
            },
            UiToHost::Request {
                id: 1,
                request: Request::CalendarIcsReplace {
                    confirmation_id: "b".repeat(64),
                    replace: true,
                },
            },
            UiToHost::Request {
                id: 1,
                request: Request::CalendarIcsExport {
                    prepared_hash: "a".repeat(64),
                },
            },
        ],
    )
}

fn notice_types(text: &mut String) {
    declare::<crate::calendar::CalendarNotice>(text);
    declare::<crate::calendar::CalendarRefreshFailure>(text);
    constants!(
        text,
        "calendarNoticeClockSkewMs",
        crate::calendar::NOTICE_CLOCK_SKEW_MS
    );
    constants!(
        text,
        "calendarPollNormalMs",
        crate::calendar::POLL_NORMAL_MS
    );
    constants!(
        text,
        "calendarPollMondayMs",
        crate::calendar::POLL_MONDAY_MS
    );
    constants!(
        text,
        "calendarRefreshFailures",
        ["busy", "coreUnavailable", "denied", "rejected"]
    );
    constants!(text, "calendarNoticeTtlMs", crate::calendar::NOTICE_TTL_MS);
    constants!(
        text,
        "calendarNoticeHistoryLimit",
        crate::calendar::NOTICE_HISTORY_LIMIT
    );
    constants!(
        text,
        "calendarNoticePresentationLimit",
        crate::calendar::NOTICE_PRESENTATION_LIMIT
    );
    constants!(
        text,
        "calendarNoticeBatchLimit",
        crate::calendar::NOTICE_BATCH_LIMIT
    );
    constants!(
        text,
        "calendarNoticeTestIntervalMs",
        crate::calendar::NOTICE_TEST_INTERVAL_MS
    );
}

fn launch_types(text: &mut String) {
    declare::<crate::calendar::CalendarLaunchMode>(text);
    declare::<crate::calendar::CalendarLaunchStop>(text);
    declare::<crate::calendar::CalendarLaunchUnknown>(text);
    declare::<crate::calendar::CalendarLaunchPlan>(text);
    declare::<crate::calendar::CalendarLaunchProgress>(text);
    declare::<crate::calendar::CalendarLaunchAttempt>(text);
    declare::<crate::calendar::CalendarLaunchChange>(text);
    declare::<crate::calendar::CalendarLaunchView>(text);
    constants!(
        text,
        "calendarLaunchLeadMs",
        crate::calendar::launch_types::LEAD_MS
    );
    constants!(
        text,
        "calendarLaunchReceiptMs",
        crate::calendar::launch_types::RECEIPT_MS
    );
    constants!(
        text,
        "calendarLaunchClockSkewMs",
        crate::calendar::launch_types::CLOCK_SKEW_MS
    );
    constants!(
        text,
        "calendarLaunchMaxFutureMs",
        crate::calendar::launch_types::MAX_FUTURE_MS
    );
    constants!(
        text,
        "calendarLaunchArmIdLength",
        crate::calendar::launch_types::ARM_ID_LENGTH
    );
    constants!(
        text,
        "calendarLaunchStops",
        [
            "user",
            "replaced",
            "accountChanged",
            "rightsLost",
            "live",
            "coreDisconnected",
            "hubClosed",
            "clockChanged",
            "residentUnavailable",
            "revisionChanged",
            "alertsUnavailable",
            "disabled",
            "scheduleUnavailable",
            "expired",
            "busy",
            "io"
        ]
    );
    constants!(
        text,
        "calendarLaunchUnknowns",
        [
            "noReceipt",
            "ringGap",
            "residentRestarted",
            "residentUnavailable",
            "scopeLost",
            "unconfirmedWrite"
        ]
    );
}
