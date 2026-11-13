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
        Request::CalendarIcsReplace {
            confirmation_id: "b".repeat(64),
            replace: true,
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
        set_calendar_windows(&mut session, true);
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
    set_calendar_windows(&mut session, true);
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
    set_calendar_windows(&mut session, true);
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
    for blocked in [
        "none",
        "general",
        "windows",
        "both",
        "rights",
        "calendar",
        "blocked",
        "document",
        "handshake",
    ] {
        let fixture = Fixture::new();
        let base = fixture.0.join("hub");
        std::fs::create_dir_all(&base).unwrap();
        std::fs::write(base.join("official-schedule.json"),br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap();
        let mut alerts = crate::calendar::CalendarAlerts::default();
        alerts.channels.windows = !matches!(blocked, "windows" | "both");
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
        set_calendar_windows(&mut session, true);
        session.handshaken = true;
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
            "general" | "both" => set_calendar_windows(&mut session, false),
            "handshake" => session.handshaken = false,
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
        if matches!(blocked, "general" | "both") {
            let feed: vantare_ipc::session_alerts::Feed = serde_json::from_slice(
                &std::fs::read(fixture.0.join("session-alerts-feed.json")).unwrap(),
            )
            .unwrap();
            assert!(
                !feed.events.is_empty(),
                "overlay feed must ignore General: {blocked}"
            );
        }
        assert_eq!(session.core.requests, 0);
    }
}

#[test]
fn calendar_host_poll_uses_the_shared_background_lane_without_a_mounted_screen() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    set_calendar_windows(&mut session, true);
    session.handshaken = true;
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.current.rights = protocol::LinkState::Connected;
    session.current.services = protocol::LinkState::Connected;
    session.core.available = true;
    let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let clock = Instant::now();
    let mut pipe = Pipe::new(Vec::new());
    assert!(session.subscriptions.is_empty());
    super::calendar_tick::tick_with_clock(&mut session, &mut pipe, now, clock).unwrap();
    assert!(
        matches!(session.core.sent.as_slice(),[(id,vantare_ipc::services_protocol::Command::CalendarRefresh)] if *id==crate::account::BACKGROUND_ID)
    );
    assert!(matches!(
        session.remotes.get(&crate::account::BACKGROUND_ID),
        Some(RemoteKind::CalendarBackground)
    ));
    let mut duplicate = Pipe::new(Vec::new());
    session
        .request(&mut duplicate, 101, &Request::CalendarRefresh {})
        .unwrap();
    assert_eq!(
        response(&mut duplicate),
        HostToUi::Failure {
            id: 101,
            error: HostError::Busy
        }
    );
    super::calendar_tick::tick_with_clock(
        &mut session,
        &mut pipe,
        now + crate::calendar::POLL_NORMAL_MS,
        clock + Duration::from_mins(15),
    )
    .unwrap();
    assert_eq!(session.core.requests, 1);
    let remote = session
        .remotes
        .remove(&crate::account::BACKGROUND_ID)
        .map(|kind| (crate::account::BACKGROUND_ID, kind));
    let result = super::calendar::complete_at(
        &mut session,
        remote,
        crate::account::BACKGROUND_ID,
        Ok(vantare_ipc::services_protocol::Reply::Calendar {
            schedule: None,
            fallback: None,
        }),
        now + 1000,
    )
    .map(Some);
    session
        .respond_service(&mut pipe, crate::account::BACKGROUND_ID, result)
        .unwrap();
    assert!(pipe.get_ref().is_empty());
    super::calendar_tick::tick_with_clock(
        &mut session,
        &mut pipe,
        now + 2000,
        clock + Duration::from_secs(901),
    )
    .unwrap();
    assert!(matches!(
        response(&mut pipe),
        HostToUi::Event {
            event: Event::CalendarRefreshed { error: None, .. }
        }
    ));
    assert_eq!(
        session.core.requests, 1,
        "a completed refresh must restart the cadence"
    );
}
#[test]
fn calendar_poll_obeys_guards_and_user_refresh_exclusion_and_retries_busy_without_flooding() {
    let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T12:00:00Z")
        .unwrap()
        .timestamp_millis();
    let clock = Instant::now();
    for missing in [
        "calendar",
        "verified",
        "blocked",
        "rights",
        "services",
        "handshake",
        "closing",
        "manual_refresh",
    ] {
        let fixture = Fixture::new();
        let mut s = fixture.session();
        s.handshaken = true;
        s.current.access.verified = true;
        s.current.access.calendar = true;
        s.current.rights = protocol::LinkState::Connected;
        s.current.services = protocol::LinkState::Connected;
        s.core.available = true;
        match missing {
            "calendar" => s.current.access.calendar = false,
            "verified" => s.current.access.verified = false,
            "blocked" => s.current.access.blocked = true,
            "rights" => s.current.rights = protocol::LinkState::Unavailable,
            "services" => s.current.services = protocol::LinkState::Unavailable,
            "handshake" => s.handshaken = false,
            "closing" => s.closing = Some((protocol::CloseReason::Window, clock)),
            "manual_refresh" => {
                s.remotes.insert(123, RemoteKind::CalendarRefresh);
            }
            _ => unreachable!(),
        }
        super::calendar_tick::tick_with_clock(&mut s, &mut Pipe::new(Vec::new()), now, clock)
            .unwrap();
        assert_eq!(s.core.requests, 0, "{missing}");
    }
    let fixture = Fixture::new();
    let mut s = fixture.session();
    s.handshaken = true;
    s.current.access.verified = true;
    s.current.access.calendar = true;
    s.current.rights = protocol::LinkState::Connected;
    s.current.services = protocol::LinkState::Connected;
    s.core.available = true;
    s.core.busy = true;
    super::calendar_tick::tick_with_clock(&mut s, &mut Pipe::new(Vec::new()), now, clock).unwrap();
    assert_eq!(s.core.requests, 1);
    assert!(s.remotes.is_empty());
    super::calendar_tick::tick_with_clock(
        &mut s,
        &mut Pipe::new(Vec::new()),
        now + 100,
        clock + Duration::from_millis(100),
    )
    .unwrap();
    assert_eq!(s.core.requests, 1);
    s.core.busy = false;
    super::calendar_tick::tick_with_clock(
        &mut s,
        &mut Pipe::new(Vec::new()),
        now + 1000,
        clock + Duration::from_secs(1),
    )
    .unwrap();
    assert_eq!(s.core.requests, 2);
}
#[test]
fn calendar_refresh_failures_are_closed_events_and_do_not_make_background_responses_public() {
    let fixture = Fixture::new();
    let mut s = fixture.session();
    s.current.access.verified = true;
    s.current.access.calendar = true;
    s.current.rights = protocol::LinkState::Connected;
    let result = super::calendar::complete_at(
        &mut s,
        Some((
            crate::account::BACKGROUND_ID,
            RemoteKind::CalendarBackground,
        )),
        crate::account::BACKGROUND_ID,
        Err(HostError::CoreUnavailable),
        1_000,
    )
    .map(Some);
    let mut pipe = Pipe::new(Vec::new());
    s.respond_service(&mut pipe, crate::account::BACKGROUND_ID, result)
        .unwrap();
    assert!(pipe.get_ref().is_empty());
    assert!(matches!(
        s.calendar_state.take_refresh(),
        Some((
            _,
            Some(crate::calendar::CalendarRefreshFailure::CoreUnavailable)
        ))
    ));
}

#[test]
fn calendar_offline_refresh_still_loads_local_departure_notices() {
    let fixture = Fixture::new();
    let base = fixture.0.join("calendar-offline");
    std::fs::create_dir(&base).unwrap();
    std::fs::write(base.join("official-schedule.json"), br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap();
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
    set_calendar_windows(&mut session, true);
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.current.rights = protocol::LinkState::Connected;
    session.calendar_state = crate::calendar::State::new(base);
    let now = chrono::DateTime::parse_from_rfc3339("2026-11-12T12:50:00Z")
        .unwrap()
        .timestamp_millis();
    assert_eq!(
        super::calendar::complete_at(
            &mut session,
            Some((41, RemoteKind::CalendarRefresh)),
            41,
            Err(HostError::CoreUnavailable),
            now
        ),
        Err(HostError::CoreUnavailable)
    );
    let clock = Instant::now();
    assert!(
        session
            .calendar_state
            .notice_tick(now - 1000, clock, true, false)
            .is_empty()
    );
    assert!(matches!(
        session
            .calendar_state
            .notice_tick(now, clock + Duration::from_secs(1), true, false)
            .as_slice(),
        [crate::calendar::CalendarNotice::Start { .. }]
    ));
}
#[test]
fn calendar_refresh_completion_never_queues_a_week_notice_without_current_authority() {
    for revoked in ["none", "rights", "closing", "general", "windows", "both"] {
        let fixture = Fixture::new();
        let mut session = fixture.session();
        set_calendar_windows(&mut session, true);
        session.current.access.verified = true;
        session.current.access.calendar = true;
        session.current.rights = protocol::LinkState::Connected;
        let now = chrono::DateTime::parse_from_rfc3339("2026-11-09T08:00:00Z")
            .unwrap()
            .timestamp_millis();
        let old = r#"{"version":1,"timezone":"UTC","validFrom":"2026-11-02T00:00:00Z","validUntil":"2026-11-09T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#;
        let base = fixture.0.join("calendar-authority");
        std::fs::create_dir(&base).unwrap();
        std::fs::write(base.join("official-schedule.json"), old).unwrap();
        let mut alerts = crate::calendar::CalendarAlerts::default();
        alerts.channels.windows = !matches!(revoked, "windows" | "both");
        std::fs::write(
            base.join("calendar-alerts.json"),
            serde_json::to_vec(&alerts).unwrap(),
        )
        .unwrap();
        session.calendar_state = crate::calendar::State::new(base);
        session
            .calendar_state
            .refresh_notices(None, None, now, true, false)
            .unwrap();
        let clock = Instant::now();
        session.calendar_state.notice_tick(now, clock, true, false);
        if revoked == "rights" {
            session.current.rights = protocol::LinkState::Unavailable;
        } else if revoked == "closing" {
            session.closing = Some((protocol::CloseReason::Window, clock));
        }
        if matches!(revoked, "general" | "both") {
            set_calendar_windows(&mut session, false);
        }
        let next = r#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#;
        super::calendar::complete_at(
            &mut session,
            Some((42, RemoteKind::CalendarRefresh)),
            42,
            Ok(vantare_ipc::services_protocol::Reply::Calendar {
                schedule: Some(next.into()),
                fallback: None,
            }),
            now + 1000,
        )
        .unwrap();
        // Authority may return before the next tick. The completion itself must not queue a notice.
        assert!(
            session
                .calendar_state
                .notice_tick(now + 1000, clock + Duration::from_secs(1), true, false)
                .is_empty()
                == (revoked != "none"),
            "{revoked}"
        );
    }
}

fn set_calendar_windows(session: &mut Session, enabled: bool) {
    let revision = session.settings.view().revision;
    session
        .settings
        .update(crate::settings::SettingsPatch::Toasts(enabled), &revision)
        .unwrap();
}
#[test]
fn calendar_test_follows_general_live_without_changing_calendar_channels() {
    for general in [false, true] {
        for windows in [false, true] {
            let fixture = Fixture::new();
            let base = fixture.0.join("hub");
            std::fs::create_dir_all(&base).unwrap();
            let mut alerts = crate::calendar::CalendarAlerts::default();
            alerts.channels.windows = windows;
            let bytes = serde_json::to_vec(&alerts).unwrap();
            std::fs::write(base.join("calendar-alerts.json"), &bytes).unwrap();
            let mut session = fixture.session();
            session.current.access.verified = true;
            session.current.access.calendar = true;
            session.current.rights = protocol::LinkState::Connected;
            set_calendar_windows(&mut session, general);
            let mut pipe = Pipe::new(Vec::new());
            session
                .request(&mut pipe, 401, &Request::CalendarNoticeTest {})
                .unwrap();
            pipe.set_position(0);
            let mut reader = frame::Reader::default();
            if general {
                assert!(matches!(
                    reader.next::<HostToUi>(&mut pipe).unwrap().unwrap(),
                    HostToUi::Event {
                        event: Event::CalendarNotice { .. }
                    }
                ));
            }
            assert_eq!(
                reader.next::<HostToUi>(&mut pipe).unwrap().unwrap(),
                HostToUi::Response {
                    id: 401,
                    result: Reply::CalendarNoticeTest { accepted: general }
                }
            );
            assert_eq!(
                usize::try_from(pipe.position()).unwrap(),
                pipe.get_ref().len()
            );
            assert_eq!(
                std::fs::read(base.join("calendar-alerts.json")).unwrap(),
                bytes
            );
            if !general {
                // Settings update takes effect in this same Session and the refused
                // test did not consume the host's five-second interval.
                set_calendar_windows(&mut session, true);
                let mut pipe = Pipe::new(Vec::new());
                session
                    .request(&mut pipe, 402, &Request::CalendarNoticeTest {})
                    .unwrap();
                assert!(matches!(
                    response(&mut pipe),
                    HostToUi::Event {
                        event: Event::CalendarNotice { .. }
                    }
                ));
            }
            assert_eq!(session.core.requests, 0);
        }
    }
}

#[test]
fn calendar_general_off_then_on_never_catches_up_a_departure_from_the_disabled_interval() {
    let fixture = Fixture::new();
    let base = fixture.0.join("hub");
    std::fs::create_dir_all(&base).unwrap();
    std::fs::write(base.join("official-schedule.json"), br#"{"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]}"#).unwrap();
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
    session.handshaken = true;
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.current.rights = protocol::LinkState::Connected;
    session.calendar_state = crate::calendar::State::new(base);
    let at = chrono::DateTime::parse_from_rfc3339("2026-11-12T12:50:00Z")
        .unwrap()
        .timestamp_millis();
    let clock = Instant::now();
    let mut pipe = Pipe::new(Vec::new());
    set_calendar_windows(&mut session, true);
    super::calendar_tick::tick_with_clock(&mut session, &mut pipe, at - 2000, clock).unwrap();
    set_calendar_windows(&mut session, false);
    super::calendar_tick::tick_with_clock(
        &mut session,
        &mut pipe,
        at - 1000,
        clock + Duration::from_secs(1),
    )
    .unwrap();
    assert!(pipe.get_ref().is_empty());
    set_calendar_windows(&mut session, true);
    super::calendar_tick::tick_with_clock(
        &mut session,
        &mut pipe,
        at + 1000,
        clock + Duration::from_secs(3),
    )
    .unwrap();
    assert!(
        pipe.get_ref().is_empty(),
        "reenabling must not publish the departure that became due while off"
    );
    super::calendar_tick::tick_with_clock(
        &mut session,
        &mut pipe,
        at + 3_599_000,
        clock + Duration::from_secs(3601),
    )
    .unwrap();
    assert!(pipe.get_ref().is_empty());
    super::calendar_tick::tick_with_clock(
        &mut session,
        &mut pipe,
        at + 3_600_000,
        clock + Duration::from_secs(3602),
    )
    .unwrap();
    assert!(matches!(
        response(&mut pipe),
        HostToUi::Event {
            event: Event::CalendarNotice {
                value: crate::calendar::CalendarNotice::Start { .. }
            }
        }
    ));
    assert_eq!(session.core.requests, 0);
}

#[test]
fn calendar_launch_requests_cannot_bypass_calendar_rights_or_an_observed_account() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let arm = Request::CalendarLaunchArm {
        profile: "qa".into(),
        base_revision: "a".repeat(64),
        armed_generation: "b".repeat(64),
        mode: crate::calendar::CalendarLaunchMode::Alerts {
            expected_revision: "c".repeat(64),
        },
    };
    for request in [
        &arm,
        &Request::CalendarLaunchCancel {
            arm_id: "d".repeat(64),
        },
    ] {
        let mut pipe = Pipe::new(Vec::new());
        session.request(&mut pipe, 90, request).unwrap();
        assert_eq!(
            response(&mut pipe),
            HostToUi::Failure {
                id: 90,
                error: HostError::Denied
            }
        );
    }
    session.current.rights = protocol::LinkState::Connected;
    session.current.access.verified = true;
    session.current.access.calendar = true;
    session.current.account_generation = Some("b".repeat(64));
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 91, &arm).unwrap();
    assert_eq!(
        response(&mut pipe),
        HostToUi::Failure {
            id: 91,
            error: HostError::CoreUnavailable
        }
    );
    assert_eq!(
        session.calendar_launch.view(),
        crate::calendar::CalendarLaunchView::default()
    );
    assert_eq!(session.core.requests, 0);
}
