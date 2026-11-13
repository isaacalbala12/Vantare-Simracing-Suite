use vantare_ipc::{
    control::{AccessState, Policy, VERSION},
    launcher::{
        self, Request,
        checked::{LaunchChecked, LaunchReceipt},
        execution::*,
    },
};
fn request() -> LaunchChecked {
    LaunchChecked {
        request: "a"
            .repeat(32)
            .try_into()
            .expect("valid checked request fixture"),
        instance: "b"
            .repeat(64)
            .try_into()
            .expect("valid checked request fixture"),
        profile: "creator".into(),
        revision: "c".repeat(64),
        account: "d"
            .repeat(64)
            .try_into()
            .expect("valid checked request fixture"),
    }
}
#[test]
fn checked_wire_is_closed_and_legacy_launch_bytes_remain_identical() {
    let bytes = serde_json::to_vec(&Request::Launch {
        profile: "creator".into(),
    })
    .unwrap();
    assert_eq!(bytes, br#"{"launch-v1":{"profile":"creator"}}"#);
    let value = serde_json::to_value(Request::LaunchChecked(request())).unwrap();
    assert_eq!(value["launch-v2"].as_object().unwrap().len(), 5);
    assert_eq!(value["launch-v2"]["request"], "a".repeat(32));
    assert!(matches!(
        serde_json::from_value::<Request>(value.clone()).unwrap(),
        Request::LaunchChecked(_)
    ));
    for (field, bad) in [
        ("profile", String::new()),
        ("profile", "x".repeat(257)),
        ("profile", "bad\0id".into()),
        ("revision", "e".repeat(63)),
        ("revision", "g".repeat(64)),
        ("request", "f".repeat(31)),
        ("instance", "f".repeat(63)),
        ("account", "e".repeat(63)),
        ("path", "forbidden".into()),
        ("command", "forbidden".into()),
    ] {
        let mut invalid = value.clone();
        invalid["launch-v2"][field] = bad.into();
        assert!(
            serde_json::from_value::<Request>(invalid).is_err(),
            "{field}"
        );
    }
    let mut invalid = value.clone();
    invalid["launch-v2"]
        .as_object_mut()
        .unwrap()
        .remove("account");
    assert!(serde_json::from_value::<Request>(invalid).is_err());
    let text = serde_json::to_string(&value)
        .unwrap()
        .replace("\"profile\":", "\"profile\":\"duplicate\",\"profile\":");
    assert!(serde_json::from_str::<Request>(&text).is_err());
}
#[test]
fn received_and_finished_share_the_same_bounded_cursor_and_deduplicate_retained_requests() {
    let req = request();
    let mut ring = ExecutionStatus::new(req.instance.clone());
    let run = ring.accept(req.request.clone()).unwrap();
    assert!(ring.contains_request(&req.request));
    ring.record(EventKind::Finished {
        run,
        outcome: ChainOutcome::Completed,
    })
    .unwrap();
    assert_eq!(ring.events.len(), 2);
    assert!(matches!(ring.events[0].kind, EventKind::Received {
        receipt: LaunchReceipt::Accepted { run: observed }, .. } if observed == run));
    for _ in 0..32 {
        ring.begin().unwrap();
    }
    assert_eq!(ring.events.len(), 32);
    assert!(
        !ring.contains_request(&req.request),
        "retention is not durable deduplication"
    );
    let status = launcher::Status {
        version: launcher::VERSION,
        updated_ms: 10,
        extension: Some(ring),
        ..Default::default()
    };
    assert!(
        serde_json::from_slice::<launcher::Status>(&launcher::status_bytes(&status).unwrap())
            .unwrap()
            .extension
            .is_some()
    );
}
#[test]
fn launch_permission_covers_grace_no_credential_live_denials_and_time_boundaries() {
    let now = 10_000;
    let mut policy = Policy {
        version: VERSION,
        epoch: 1,
        revision: 1,
        checked_at_ms: now,
        state: AccessState::Active,
        ..Default::default()
    };
    assert!(policy.permits_launch(now));
    policy.epoch = 0;
    assert!(
        !policy.permits_launch(now),
        "missing authority is not launch permission"
    );
    policy.epoch = 1;
    policy.live = true;
    assert!(!policy.permits_launch(now));
    policy.live = false;
    policy.state = AccessState::Grace;
    policy.signed_until_ms = Some(now - 1);
    policy.grace_until_ms = Some(now + 1);
    assert!(policy.permits_launch(now));
    assert!(!policy.permits_launch(now + 1));
    policy.grace_until_ms = None;
    policy.signed_until_ms = None;
    for state in [
        AccessState::NoCredential,
        AccessState::Unavailable,
        AccessState::Revoked,
        AccessState::Expired,
        AccessState::RecoveryRequired,
    ] {
        policy.state = state;
        assert!(!policy.permits_launch(now));
    }
    policy.state = AccessState::Active;
    assert!(!policy.permits_launch(now - 1));
    assert!(!policy.permits_launch(now + 2_000));
}
#[test]
fn silent_authority_has_a_total_deadline_without_sleep_or_a_real_service() {
    use std::{
        sync::{Arc, mpsc},
        time::{Duration, Instant},
    };
    use vantare_ipc::{
        account_session::{self, AuthorityLink},
        control,
        transport::{Event, Listener},
    };
    let link = AuthorityLink {
        pipe: format!("checked-silent-{}", std::process::id()),
        image: std::env::current_exe().unwrap(),
    };
    let stop = Arc::new(Event::new().unwrap());
    let mut listener = Listener::new(&link.pipe, stop, Duration::from_secs(1)).unwrap();
    let mut pipe = listener.instance().unwrap();
    let (release, waiting) = mpsc::channel::<()>();
    let (ready, listening) = mpsc::channel::<()>();
    let worker = std::thread::spawn(move || {
        ready.send(()).unwrap();
        pipe.accept().unwrap();
        let request = control::read_request(&mut pipe).unwrap();
        assert!(request.nonce.is_empty());
        assert!(matches!(
            request.command,
            control::Command::ReadAccountSession {}
        ));
        waiting.recv().unwrap();
    });
    listening.recv().unwrap();
    // This wait tests the real consume-time deadline; no sleep is used by the double.
    let started = Instant::now();
    let result = account_session::read_account_session(&link, Duration::from_millis(750));
    let elapsed = started.elapsed();
    release.send(()).unwrap();
    worker.join().unwrap();
    assert_eq!(result.unwrap_err().kind(), std::io::ErrorKind::TimedOut);
    assert!(
        elapsed < Duration::from_secs(2),
        "consume must not inherit 5s + 5s timeouts"
    );
}

#[test]
fn both_account_observers_reject_a_different_peer_image_before_writing() {
    use std::{
        sync::{Arc, mpsc},
        time::Duration,
    };
    use vantare_ipc::{
        account_session::{self, AuthorityLink},
        transport::{Event, Listener},
    };
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    for consume in [false, true] {
        let link = AuthorityLink {
            pipe: format!("checked-impostor-{}-{nonce}-{consume}", std::process::id()),
            image: std::env::current_exe()
                .unwrap()
                .with_file_name("not-the-authority.exe"),
        };
        let stop = Arc::new(Event::new().unwrap());
        let mut listener =
            Listener::new(&link.pipe, Arc::clone(&stop), Duration::from_secs(1)).unwrap();
        let mut pipe = listener.instance().unwrap();
        let (ready, listening) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            ready.send(()).unwrap();
            match pipe.accept() {
                Ok(()) => vantare_ipc::control::read_request(&mut pipe).is_ok(),
                // Rejection closes the client before accept may finish. Windows
                // ERROR_NO_DATA (232) is BrokenPipe; Unix credentials may see ENOTCONN.
                Err(error)
                    if error.kind() == std::io::ErrorKind::BrokenPipe
                        || (cfg!(unix) && error.kind() == std::io::ErrorKind::NotConnected) =>
                {
                    false
                }
                Err(error) => panic!("unexpected accept failure: {error:?}"),
            }
        });
        listening.recv().unwrap();
        let result = if consume {
            account_session::read_account_session(&link, Duration::from_secs(1))
        } else {
            account_session::request_cancelled(&link, &stop)
        };
        let received = worker.join().unwrap();
        assert!(!received, "untrusted peer must receive no request");
        assert_eq!(
            result.unwrap_err().kind(),
            std::io::ErrorKind::PermissionDenied
        );
    }
}
// Frozen wire shape from before launch-v2; never decode through current Request.
#[derive(serde::Deserialize)]
#[allow(dead_code)]
enum LegacyRequest {
    #[serde(rename = "launch-v1")]
    Launch { profile: String },
    #[serde(rename = "answer-v2")]
    Answer { decision: u64, action: String },
}
#[test]
fn old_request_decoder_rejects_checked_launch_before_dispatch() {
    let decode_and_dispatch = |bytes: &[u8], effects: &mut usize| {
        let request = serde_json::from_slice::<LegacyRequest>(bytes)?;
        *effects += 1;
        Ok::<_, serde_json::Error>(request)
    };
    let mut effects = 0;
    assert!(decode_and_dispatch(br#"{"launch-v1":{"profile":"qa"}}"#, &mut effects).is_ok());
    assert!(
        decode_and_dispatch(
            br#"{"answer-v2":{"decision":1,"action":"trust"}}"#,
            &mut effects
        )
        .is_ok()
    );
    let bytes = serde_json::to_vec(&Request::LaunchChecked(request())).unwrap();
    assert!(decode_and_dispatch(&bytes, &mut effects).is_err());
    assert_eq!(effects, 2);
}
