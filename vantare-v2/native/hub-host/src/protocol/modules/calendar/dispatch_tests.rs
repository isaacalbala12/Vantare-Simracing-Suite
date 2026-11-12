use super::*;
fn response(pipe: &mut Pipe) -> HostToUi {
    pipe.set_position(0);
    frame::Reader::default().next(pipe).unwrap().unwrap()
}
#[test]
fn calendar_permission_prevents_reads_and_remote_requests() {
    let fixture = Fixture::new();
    let mut s = fixture.session();
    let mut pipe = Pipe::new(Vec::new());
    s.current.access.verified = true;
    s.current.access.tester = true;
    s.request(&mut pipe, 4, &Request::CalendarLoad {}).unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 4,
            error: HostError::Denied
        }
    );
    let mut pipe = Pipe::new(Vec::new());
    s.request(
        &mut pipe,
        5,
        &Request::CalendarAlertsSave {
            alerts: Box::default(),
            expected_revision: "a".repeat(64),
        },
    )
    .unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 5,
            error: HostError::Denied
        }
    );
    assert_eq!(s.core.requests, 0);
}
#[test]
fn calendar_load_is_read_only_and_refresh_distinguishes_busy_and_transport() {
    let fixture = Fixture::new();
    let mut s = fixture.session();
    s.current.access.verified = true;
    s.current.access.calendar = true;
    let mut pipe = Pipe::new(Vec::new());
    s.request(&mut pipe, 5, &Request::CalendarLoad {}).unwrap();
    assert!(matches!(
        response(&mut pipe),
        HostToUi::Response {
            id: 5,
            result: Reply::CalendarLoad { .. }
        }
    ));
    assert!(!fixture.0.join("hub/official-schedule.json").exists());
    for (busy, error) in [(false, HostError::CoreUnavailable), (true, HostError::Busy)] {
        s.core.busy = busy;
        let mut pipe = Pipe::new(Vec::new());
        s.request(&mut pipe, 6, &Request::CalendarRefresh {})
            .unwrap();
        assert_eq!(response(&mut pipe), HostToUi::Failure { id: 6, error });
    }
}

#[test]
fn calendar_completion_checks_permission_family_and_request_identity() {
    let fixture = Fixture::new();
    let mut s = fixture.session();
    s.current.access.verified = true;
    s.current.access.calendar = true;
    let reply = || {
        Ok(vantare_ipc::services_protocol::Reply::Calendar {
            schedule: None,
            fallback: None,
        })
    };
    assert!(matches!(
        super::calendar::complete(&mut s, Some((7, RemoteKind::CalendarRefresh)), 7, reply()),
        Ok(Reply::CalendarRefresh { .. })
    ));
    assert_eq!(
        super::calendar::complete(&mut s, Some((7, RemoteKind::CalendarRefresh)), 8, reply()),
        Err(HostError::Rejected)
    );
    assert_eq!(
        super::calendar::complete(
            &mut s,
            Some((7, RemoteKind::CalendarRefresh)),
            7,
            Ok(vantare_ipc::services_protocol::Reply::Error {
                message: "private service detail".into()
            })
        ),
        Err(HostError::Rejected)
    );
    assert_eq!(
        super::calendar::complete(
            &mut s,
            Some((7, RemoteKind::CalendarRefresh)),
            7,
            Err(HostError::CoreUnavailable)
        ),
        Err(HostError::CoreUnavailable)
    );
    s.current.access.calendar = false;
    assert_eq!(
        super::calendar::complete(&mut s, Some((7, RemoteKind::CalendarRefresh)), 7, reply()),
        Err(HostError::Denied)
    );
}

#[test]
fn duplicate_calendar_refresh_is_busy_in_the_shared_queue() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.core.available = true;
    let mut first = Pipe::new(Vec::new());
    session
        .request(&mut first, 41, &Request::CalendarRefresh {})
        .unwrap();
    assert!(first.get_ref().is_empty());
    let mut duplicate = Pipe::new(Vec::new());
    session
        .request(&mut duplicate, 42, &Request::CalendarRefresh {})
        .unwrap();
    assert_eq!(
        response(&mut duplicate),
        HostToUi::Failure {
            id: 42,
            error: HostError::Busy
        }
    );
    assert_eq!(session.core.requests, 1);
}

#[test]
fn calendar_preference_dispatch_enforces_rights_and_cas_without_services() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.access.verified = true;
    let requests = [
        Request::CalendarConfigLoad {},
        Request::CalendarUtcSet {
            utc: true,
            expected_revision: "a".repeat(64),
        },
        Request::CalendarNotifyWeekSet {
            enabled: false,
            expected_revision: "a".repeat(64),
        },
        Request::CalendarFollowSet {
            series_id: "qa".into(),
            followed: true,
            expected_revision: "a".repeat(64),
        },
    ];
    for request in requests {
        let mut pipe = Pipe::new(Vec::new());
        session.request(&mut pipe, 9, &request).unwrap();
        assert_eq!(
            response(&mut pipe),
            HostToUi::Failure {
                id: 9,
                error: HostError::Denied
            }
        );
    }
    session.current.access.calendar = true;
    session.core.busy = true;
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 10, &Request::CalendarConfigLoad {})
        .unwrap();
    let HostToUi::Response {
        result: Reply::CalendarConfigLoad { value },
        ..
    } = response(&mut pipe)
    else {
        panic!("config response")
    };
    let revision = value.prefs_revision.expect("ready prefs revision");
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            11,
            &Request::CalendarUtcSet {
                utc: true,
                expected_revision: revision.clone(),
            },
        )
        .unwrap();
    assert!(
        matches!(response(&mut pipe),HostToUi::Response {result:Reply::CalendarUtcSet {value},..} if value.utc)
    );
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            12,
            &Request::CalendarUtcSet {
                utc: false,
                expected_revision: revision,
            },
        )
        .unwrap();
    assert!(
        matches!(response(&mut pipe),HostToUi::Failure {error:HostError::CalendarConflict {current},..} if current.utc)
    );
    assert_eq!(session.core.requests, 0);
}

#[test]
fn calendar_follow_reports_the_missing_current_schedule_without_calling_services() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.access.verified = true;
    session.current.access.calendar = true;
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 20, &Request::CalendarConfigLoad {})
        .unwrap();
    let HostToUi::Response {
        result: Reply::CalendarConfigLoad { value },
        ..
    } = response(&mut pipe)
    else {
        panic!("config")
    };
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            21,
            &Request::CalendarFollowSet {
                series_id: "qa".into(),
                followed: true,
                expected_revision: value.following_revision.unwrap(),
            },
        )
        .unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 21,
            error: HostError::CalendarScheduleUnavailable
        }
    );
    assert_eq!(session.core.requests, 0);
}

#[test]
fn history_dispatch_requires_calendar_rights_and_does_not_contact_services() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    for (verified, blocked, calendar) in [
        (false, false, true),
        (true, true, true),
        (true, false, false),
    ] {
        session.current.access.verified = verified;
        session.current.access.blocked = blocked;
        session.current.access.calendar = calendar;
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(&mut pipe, 31, &Request::CalendarHistoryLoad {})
            .unwrap();
        assert_eq!(
            response(&mut pipe),
            HostToUi::Failure {
                id: 31,
                error: HostError::Denied
            }
        );
    }
    session.current.access.verified = true;
    session.current.access.blocked = false;
    session.current.access.calendar = true;
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 32, &Request::CalendarHistoryLoad {})
        .unwrap();
    assert!(matches!(
        response(&mut pipe),
        HostToUi::Response {
            id: 32,
            result: Reply::CalendarHistoryLoad { .. }
        }
    ));
    assert_eq!(session.core.requests, 0);
    assert!(!fixture.0.join("hub/calendar-history.json").exists());
}

#[test]
fn calendar_tick_uses_live_host_authority_and_clears_on_every_permission_loss() {
    let fixture = Fixture::new();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(data.join("official-schedule.json"),br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap();
    std::fs::write(
        data.join("calendar-alerts.json"),
        br#"{"bands":[{"seriesId":"qa","from":0,"to":1440}]}"#,
    )
    .unwrap();
    let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let mut session = fixture.session();
    let valid = protocol::CoreStatus {
        rights: protocol::LinkState::Connected,
        access: protocol::AccessView {
            verified: true,
            calendar: true,
            ..Default::default()
        },
        ..Default::default()
    };
    let path = fixture.0.join("session-alerts-feed.json");
    let count = || {
        serde_json::from_slice::<vantare_ipc::session_alerts::Feed>(&std::fs::read(&path).unwrap())
            .unwrap()
            .events
            .len()
    };
    let mut clock = Instant::now();
    for case in 0..5 {
        session.current = valid.clone();
        super::calendar_tick::tick_at(&mut session, now, clock);
        assert_eq!(
            count(),
            2,
            "calendar capability works independently of tester and services connectivity"
        );
        match case {
            0 => session.current.access.verified = false,
            1 => session.current.access.blocked = true,
            2 => session.current.access.calendar = false,
            3 => session.current.rights = protocol::LinkState::Unavailable,
            _ => session.current.rights = protocol::LinkState::Incompatible,
        }
        clock += Duration::from_millis(100);
        super::calendar_tick::tick_at(&mut session, now, clock);
        assert_eq!(count(), 0);
    }
    assert_eq!(session.core.requests, 0);
}

#[test]
fn calendar_ics_is_denied_before_reading_and_export_paths_are_main_only() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    for request in [
        Request::CalendarIcsPrepare {
            scope: crate::calendar::CalendarIcsScope::All,
            alarm: true,
        },
        Request::CalendarIcsExport {
            prepared_hash: "a".repeat(64),
        },
    ] {
        let mut pipe = Pipe::new(Vec::new());
        session.request(&mut pipe, 41, &request).unwrap();
        assert_eq!(
            response(&mut pipe),
            HostToUi::Failure {
                id: 41,
                error: HostError::Denied
            }
        );
    }
    session.current.access.verified = true;
    session.current.access.calendar = true;
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            42,
            &Request::CalendarIcsExport {
                prepared_hash: "a".repeat(64),
            },
        )
        .unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 42,
            error: HostError::Unsupported
        }
    );
    assert_eq!(session.core.requests, 0);
}

#[test]
fn calendar_notice_test_is_closed_guarded_and_rate_limited_without_core_calls() {
    for (verified, calendar, blocked, connected) in [
        (false, true, false, true),
        (true, false, false, true),
        (true, true, true, true),
        (true, true, false, false),
    ] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        session.current.access.verified = verified;
        session.current.access.calendar = calendar;
        session.current.access.blocked = blocked;
        session.current.rights = if connected {
            protocol::LinkState::Connected
        } else {
            protocol::LinkState::Unavailable
        };
        let mut pipe = Pipe::new(Vec::new());
        session
            .request(&mut pipe, 70, &Request::CalendarNoticeTest {})
            .unwrap();
        assert_eq!(
            response(&mut pipe),
            HostToUi::Failure {
                id: 70,
                error: HostError::Denied
            }
        );
        assert_eq!(session.core.requests, 0);
    }
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.current.rights = protocol::LinkState::Connected;
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 71, &Request::CalendarNoticeTest {})
        .unwrap();
    pipe.set_position(0);
    let mut reader = frame::Reader::default();
    assert!(matches!(
        reader.next::<HostToUi>(&mut pipe).unwrap().unwrap(),
        HostToUi::Event {
            event: Event::CalendarNotice {
                value: crate::calendar::CalendarNotice::Test { request_id: 71, .. }
            }
        }
    ));
    assert_eq!(
        reader.next::<HostToUi>(&mut pipe).unwrap().unwrap(),
        HostToUi::Response {
            id: 71,
            result: Reply::CalendarNoticeTest { accepted: true }
        }
    );
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 72, &Request::CalendarNoticeTest {})
        .unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 72,
            error: HostError::Busy
        }
    );
    assert_eq!(session.core.requests, 0);
    assert!(
        serde_json::from_value::<Request>(
            serde_json::json!({"method":"calendar.noticeTest","title":"injected"})
        )
        .is_err()
    );
}
#[test]
fn calendar_notice_test_does_not_ignore_protected_alerts() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.current.rights = protocol::LinkState::Connected;
    let path = fixture.0.join("hub/calendar-alerts.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, b"not JSON").unwrap();
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 73, &Request::CalendarNoticeTest {})
        .unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 73,
            error: HostError::Protected
        }
    );
}

#[test]
fn calendar_notice_tick_emits_only_with_current_authority_and_readable_alerts() {
    for blocked in ["none", "rights", "calendar", "blocked", "document"] {
        let fixture = Fixture::new();
        let base = fixture.0.join("hub");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("official-schedule.json"),br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap();
        let mut alerts = crate::calendar::CalendarAlerts::default();
        alerts.bands.push(crate::calendar::CalendarBand {
            series_id: "qa".into(),
            from: 0,
            to: 1440,
            days: crate::calendar::CalendarDays::All,
            mode: crate::calendar::CalendarBandMode::Each,
        });
        std::fs::write(
            base.join("calendar-alerts.json"),
            serde_json::to_vec(&alerts).unwrap(),
        )
        .unwrap();
        let mut session = fixture.session();
        session.current.access.verified = true;
        session.current.access.calendar = true;
        session.current.rights = protocol::LinkState::Connected;
        session.calendar_state =
            crate::calendar::State::new(base.clone()).with_layout(fixture.0.join("layout.json"));
        let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T12:50:00Z")
            .unwrap()
            .timestamp_millis();
        let clock = Instant::now();
        let mut pipe = Pipe::new(Vec::new());
        super::calendar_tick::tick_with_clock(&mut session, &mut pipe, now - 1000, clock).unwrap();
        assert!(pipe.get_ref().is_empty());
        match blocked {
            "rights" => session.current.rights = protocol::LinkState::Unavailable,
            "calendar" => session.current.access.calendar = false,
            "blocked" => session.current.access.blocked = true,
            "document" => {
                std::fs::write(base.join("calendar-alerts.json"), b"protected JSON").unwrap();
            }
            _ => {}
        }
        super::calendar_tick::tick_with_clock(
            &mut session,
            &mut pipe,
            now,
            clock + Duration::from_secs(1),
        )
        .unwrap();
        if blocked == "none" {
            assert!(matches!(
                response(&mut pipe),
                HostToUi::Event {
                    event: Event::CalendarNotice {
                        value: crate::calendar::CalendarNotice::Start { .. }
                    }
                }
            ));
        } else {
            assert!(pipe.get_ref().is_empty(), "{blocked}");
        }
        assert_eq!(session.core.requests, 0);
    }
}
