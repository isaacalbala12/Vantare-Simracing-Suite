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
