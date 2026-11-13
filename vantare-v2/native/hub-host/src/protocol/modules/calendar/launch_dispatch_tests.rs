//! Real dispatcher, checked mailbox and session-close wiring with isolated files.
use super::super::*;
use crate::calendar::{
    CalendarLaunchMode, CalendarLaunchProgress, CalendarLaunchStop, launch::Clock,
};
use vantare_ipc::{
    account_session::AccountObservation,
    control::{AccessState, Policy},
    launcher as mailbox,
};
fn configured(f: &Fixture) -> (Session, Clock, Request) {
    let mut s = f.session();
    let now = Clock {
        wall: chrono::Utc::now().timestamp_millis(),
        monotonic: Instant::now(),
    };
    s.current.rights = protocol::LinkState::Connected;
    s.current.access.verified = true;
    s.current.access.calendar = true;
    s.current.account_generation = Some("a".repeat(64));
    s.core.observation = Some(AccountObservation {
        generation: "a".repeat(64).try_into().unwrap(),
        policy: Policy {
            version: vantare_ipc::control::VERSION,
            epoch: 1,
            revision: 1,
            checked_at_ms: now.wall.try_into().unwrap(),
            state: AccessState::Active,
            ..Default::default()
        },
    });
    let doc = vantare_launcher::Document::fresh_install();
    let bytes = serde_json::to_vec(&doc).unwrap();
    std::fs::write(&s.launcher, &bytes).unwrap();
    let mut data: serde_json::Value = serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../hub/reference/fixtures/calendar-lmu-2026-10-06.json"
    )))
    .unwrap();
    for (key, ms) in [
        ("validFrom", now.wall - 86_400_000),
        ("validUntil", now.wall + 6 * 86_400_000),
    ] {
        data[key] = chrono::DateTime::from_timestamp_millis(ms)
            .unwrap()
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            .into();
    }
    s.calendar_state
        .refreshed(Some(data.to_string()), None)
        .unwrap();
    let mut at = (now.wall / 900_000 + 1) * 900_000;
    if at < now.wall + 180_000 {
        at += 900_000;
    }
    status(&s, "b", false);
    let request = Request::CalendarLaunchArm {
        profile: doc.profiles[0].id.clone(),
        base_revision: vantare_services::content_hash(&bytes),
        armed_generation: "a".repeat(64),
        mode: CalendarLaunchMode::Once {
            series_id: "beginner-lmgt3-fixed".into(),
            start_at: at,
        },
    };
    (s, now, request)
}
fn status(s: &Session, instance: &str, running: bool) {
    let mut extension =
        mailbox::execution::ExecutionStatus::new(instance.repeat(64).try_into().unwrap());
    extension
        .capabilities
        .push(mailbox::execution::Capability::RevisionCheckedLaunch);
    let value = mailbox::Status {
        version: mailbox::VERSION,
        updated_ms: mailbox::now_ms(),
        running,
        extension: Some(extension),
        ..Default::default()
    };
    std::fs::write(
        mailbox::status_path(&s.launcher),
        serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
}
fn dispatch(s: &mut Session, r: &Request, now: Clock) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    calendar::dispatch_with_clock(s, &mut pipe, 5, r, now).unwrap();
    pipe.set_position(0);
    frame::Reader::default().next(&mut pipe).unwrap().unwrap()
}
fn armed(s: &mut Session, r: &Request, now: Clock) {
    assert!(matches!(
        dispatch(s, r, now),
        HostToUi::Response {
            result: Reply::CalendarLaunchArm { .. },
            ..
        }
    ));
    assert!(s.calendar_launch.view().armed.is_some());
}
#[test]
fn arm_and_driver_tick_send_exactly_once_through_checked_launch() {
    let f = Fixture::new();
    let (mut s, now, r) = configured(&f);
    armed(&mut s, &r, now);
    let Request::CalendarLaunchArm {
        mode: CalendarLaunchMode::Once { start_at, .. },
        ..
    } = r
    else {
        unreachable!()
    };
    let delay = u64::try_from(start_at - 180_000 - now.wall).unwrap();
    let fire = Clock {
        wall: start_at - 180_000,
        monotonic: now.monotonic + Duration::from_millis(delay),
    };
    let mut pipe = Pipe::new(Vec::new());
    status(&s, "b", false);
    calendar::launch_tick(&mut s, &mut pipe, fire).unwrap();
    let bytes = std::fs::read(mailbox::request_path(&s.launcher)).unwrap();
    let message: mailbox::Request = serde_json::from_slice(&bytes).unwrap();
    let mailbox::Request::LaunchChecked(payload) = message else {
        panic!("no legacy launch")
    };
    assert_eq!(String::from(payload.account), "a".repeat(64));
    assert_eq!(String::from(payload.instance), "b".repeat(64));
    std::fs::remove_file(mailbox::request_path(&s.launcher)).unwrap();
    calendar::launch_tick(&mut s, &mut pipe, fire).unwrap();
    assert!(!mailbox::request_path(&s.launcher).exists());
    assert!(matches!(
        s.calendar_launch.view().latest.unwrap().progress,
        CalendarLaunchProgress::Queued { .. }
    ));
}
#[test]
fn changing_instance_between_cached_tick_and_send_never_enqueues() {
    let f = Fixture::new();
    let (mut s, now, r) = configured(&f);
    armed(&mut s, &r, now);
    let Request::CalendarLaunchArm {
        mode: CalendarLaunchMode::Once { start_at, .. },
        ..
    } = r
    else {
        unreachable!()
    };
    let delay = u64::try_from(start_at - 180_000 - now.wall).unwrap();
    let fire = Clock {
        wall: start_at - 180_000,
        monotonic: now.monotonic + Duration::from_millis(delay),
    };
    let old = s.launcher_resident_state.view();
    s.calendar_launch.resident(fire.monotonic, || old);
    status(&s, "c", false);
    calendar::launch_tick(&mut s, &mut Pipe::new(Vec::new()), fire).unwrap();
    assert!(!mailbox::request_path(&s.launcher).exists());
    assert!(matches!(
        s.calendar_launch.view().latest.unwrap().progress,
        CalendarLaunchProgress::NotSent {
            reason: CalendarLaunchStop::ResidentUnavailable
        }
    ));
}
#[test]
fn arm_rejects_conflict_empty_profile_and_busy_and_reports_ask_policy() {
    let f = Fixture::new();
    let (mut s, now, mut r) = configured(&f);
    status(&s, "b", true);
    assert!(matches!(
        dispatch(&mut s, &r, now),
        HostToUi::Failure {
            error: HostError::Busy,
            ..
        }
    ));
    status(&s, "b", false);
    if let Request::CalendarLaunchArm { base_revision, .. } = &mut r {
        *base_revision = "f".repeat(64);
    }
    assert!(matches!(
        dispatch(&mut s, &r, now),
        HostToUi::Failure {
            error: HostError::LauncherConflict { .. },
            ..
        }
    ));
    let mut doc = vantare_launcher::Document::fresh_install();
    doc.profiles[0].steps.clear();
    let bytes = serde_json::to_vec(&doc).unwrap();
    std::fs::write(&s.launcher, &bytes).unwrap();
    if let Request::CalendarLaunchArm { base_revision, .. } = &mut r {
        *base_revision = vantare_services::content_hash(&bytes);
    }
    assert!(matches!(
        dispatch(&mut s, &r, now),
        HostToUi::Failure {
            error: HostError::Denied,
            ..
        }
    ));
    let mut doc = vantare_launcher::Document::fresh_install();
    doc.profiles[0].set_policy(vantare_launcher::policy::Policy::default());
    let bytes = serde_json::to_vec(&doc).unwrap();
    std::fs::write(&s.launcher, &bytes).unwrap();
    if let Request::CalendarLaunchArm { base_revision, .. } = &mut r {
        *base_revision = vantare_services::content_hash(&bytes);
    }
    armed(&mut s, &r, now);
    assert!(s.calendar_launch.view().armed.unwrap().decision_required);
}
#[test]
fn requesting_window_close_disarms_and_publishes_before_close_requested() {
    let f = Fixture::new();
    let (mut s, now, r) = configured(&f);
    armed(&mut s, &r, now);
    s.subscriptions.insert(Topic::CalendarLaunch);
    let mut pipe = Pipe::new(Vec::new());
    s.request_close_at(&mut pipe, CloseReason::Window, now.monotonic)
        .unwrap();
    pipe.set_position(0);
    let mut reader = frame::Reader::default();
    assert!(
        matches!(reader.next::<HostToUi>(&mut pipe).unwrap().unwrap(),HostToUi::Event{event:Event::CalendarLaunch{value}} if value.armed.is_none() && value.change.as_ref().is_some_and(|change| change.reason==CalendarLaunchStop::HubClosed))
    );
    assert!(matches!(
        reader.next::<HostToUi>(&mut pipe).unwrap().unwrap(),
        HostToUi::CloseRequested {
            reason: CloseReason::Window,
            ..
        }
    ));
}

#[test]
fn every_individual_ask_policy_is_projected_by_the_real_arm_path() {
    use vantare_launcher::policy::{Close, Failure, Policy as LaunchPolicy, Retry, Running};
    let f = Fixture::new();
    let (mut session, now, mut request) = configured(&f);
    for field in 0..5 {
        let mut policy = LaunchPolicy {
            already_running: Running::Reuse,
            failure: Failure::Stop,
            cancel: Close::Leave,
            exit: Close::Leave,
            retry: Retry::Failed,
            ..Default::default()
        };
        match field {
            0 => policy.already_running = Running::Ask,
            1 => policy.failure = Failure::Ask,
            2 => policy.cancel = Close::Ask,
            3 => policy.exit = Close::Ask,
            _ => policy.retry = Retry::Ask,
        }
        let mut document = vantare_launcher::Document::fresh_install();
        document.profiles[0].set_policy(policy);
        let bytes = serde_json::to_vec(&document).unwrap();
        std::fs::write(&session.launcher, &bytes).unwrap();
        if let Request::CalendarLaunchArm { base_revision, .. } = &mut request {
            *base_revision = vantare_services::content_hash(&bytes);
        }
        status(&session, "b", false);
        armed(&mut session, &request, now);
        assert!(
            session
                .calendar_launch
                .view()
                .armed
                .unwrap()
                .decision_required
        );
    }
    if let Request::CalendarLaunchArm { profile, .. } = &mut request {
        profile.clear();
    }
    assert!(matches!(
        dispatch(&mut session, &request, now),
        HostToUi::Failure {
            error: HostError::Rejected,
            ..
        }
    ));
}
