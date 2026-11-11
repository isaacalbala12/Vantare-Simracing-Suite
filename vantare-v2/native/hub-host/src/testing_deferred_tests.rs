//! Exercises the generated service route and production response/close effects.
use super::*;
use crate::testing::{LegacyMigration, Operation, ReportFields};
use vantare_ipc::services_protocol::{Reply as CoreReply, report_document::Draft};

fn legacy(fixture: &Fixture) -> PathBuf {
    let path = fixture.0.join("hub/testing-center/editor-draft.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, br#"{"version":1,"fields":{"module":"hub","actionText":"old","expectedText":"","observedText":"","contextText":""}}"#).unwrap();
    path
}
fn empty() -> CoreReply {
    CoreReply::Draft {
        draft: None,
        message: String::new(),
    }
}
fn begin(session: &mut Session, pipe: &mut Pipe) {
    session.current.services = protocol::LinkState::Connected;
    session.testing_state.begin(Operation::Load);
    session.remote = Some((7, RemoteKind::Testing(Operation::Load)));
    let result = session.service_reply(7, Ok(empty()));
    assert_eq!(result, Ok(None));
    session.respond_service(pipe, 7, result).unwrap();
    assert!(pipe.get_ref().is_empty(), "no premature renderer response");
    assert!(session.deferred.is_some());
}
fn receive(pipe: &mut Pipe) -> HostToUi {
    pipe.set_position(0);
    frame::Reader::default().next(pipe).unwrap().unwrap()
}
#[test]
fn deferred_import_sends_the_confirmed_draft_once() {
    let fixture = Fixture::new();
    let path = legacy(&fixture);
    let mut session = fixture.session();
    session.core.available = true;
    let mut pipe = Pipe::new(Vec::new());
    begin(&mut session, &mut pipe);
    assert!(path.exists());
    let fields = ReportFields {
        module: "hub".into(),
        action_text: "old".into(),
        ..Default::default()
    };
    let result = session.service_reply(
        7,
        Ok(CoreReply::Draft {
            draft: Some(Draft {
                schema_version: 1,
                idempotency_key: "local-qa".into(),
                fields: fields.core(),
                screenshots: vec![],
            }),
            message: String::new(),
        }),
    );
    session.respond_service(&mut pipe, 7, result).unwrap();
    assert!(
        matches!(receive(&mut pipe), HostToUi::Response { id: 7, result: Reply::DraftLoad { value } } if value.legacy == LegacyMigration::Imported && value.fields == fields)
    );
    assert!(session.deferred.is_none());
    assert!(!path.exists() && path.with_extension("json.imported").exists());
}
#[test]
fn deferred_import_failure_answers_with_a_closed_error_and_preserves_source() {
    let fixture = Fixture::new();
    let path = legacy(&fixture);
    let mut session = fixture.session();
    session.core.available = true;
    let mut pipe = Pipe::new(Vec::new());
    begin(&mut session, &mut pipe);
    let result = session.service_reply(
        7,
        Ok(CoreReply::Error {
            message: "private".into(),
        }),
    );
    session.respond_service(&mut pipe, 7, result).unwrap();
    assert!(matches!(
        receive(&mut pipe),
        HostToUi::Failure {
            id: 7,
            error: HostError::Rejected
        }
    ));
    assert!(session.deferred.is_none() && path.exists());
}
#[test]
fn disconnected_core_finishes_the_deferred_request_and_drops_its_late_reply() {
    let fixture = Fixture::new();
    let path = legacy(&fixture);
    let mut session = fixture.session();
    session.core.available = true;
    let mut pipe = Pipe::new(Vec::new());
    begin(&mut session, &mut pipe);
    session.current.services = protocol::LinkState::Unavailable;
    session.expire_deferred(&mut pipe, Instant::now()).unwrap();
    assert!(matches!(
        receive(&mut pipe),
        HostToUi::Failure {
            id: 7,
            error: HostError::CoreUnavailable
        }
    ));
    assert_eq!(session.service_reply(7, Ok(empty())), Ok(None));
    assert!(session.deferred.is_none() && path.exists());
}
#[test]
fn deferred_transport_error_is_answered_without_waiting_for_a_timeout() {
    let fixture = Fixture::new();
    let path = legacy(&fixture);
    let mut session = fixture.session();
    session.core.available = true;
    let mut pipe = Pipe::new(Vec::new());
    begin(&mut session, &mut pipe);
    let result = session.service_reply(7, Err(HostError::CoreUnavailable));
    session.respond_service(&mut pipe, 7, result).unwrap();
    assert!(matches!(
        receive(&mut pipe),
        HostToUi::Failure {
            id: 7,
            error: HostError::CoreUnavailable
        }
    ));
    assert!(session.deferred.is_none() && path.exists());
}
#[test]
fn closing_and_timeout_finish_deferred_requests_without_sleeping() {
    for close in [false, true] {
        let fixture = Fixture::new();
        let path = legacy(&fixture);
        let mut session = fixture.session();
        session.core.available = true;
        let mut pipe = Pipe::new(Vec::new());
        begin(&mut session, &mut pipe);
        if close {
            session
                .request_close(&mut pipe, CloseReason::Window)
                .unwrap();
        } else {
            let deadline = session.deferred.unwrap().1
                + Duration::from_millis(u64::from(protocol::REQUEST_TIMEOUT_MS));
            session.expire_deferred(&mut pipe, deadline).unwrap();
        }
        assert!(matches!(
            receive(&mut pipe),
            HostToUi::Failure {
                id: 7,
                error: HostError::CoreUnavailable
            }
        ));
        assert!(session.deferred.is_none() && path.exists());
    }
}
#[test]
fn import_dispatch_busy_and_unavailable_never_archive_unseen_sources() {
    for busy in [false, true] {
        let fixture = Fixture::new();
        let path = legacy(&fixture);
        let mut session = fixture.session();
        session.core.busy = busy;
        session.testing_state.begin(Operation::Load);
        session.remote = Some((7, RemoteKind::Testing(Operation::Load)));
        let result = session.service_reply(7, Ok(empty()));
        assert!(matches!(
            (busy, result),
            (true, Err(HostError::Busy)) | (false, Err(HostError::CoreUnavailable))
        ));
        session.testing_state.begin(Operation::Discard);
        session.remote = Some((8, RemoteKind::Testing(Operation::Discard)));
        assert!(
            matches!(session.service_reply(8, Ok(empty())), Ok(Some(Reply::DraftDiscard { value })) if value.legacy == LegacyMigration::Preserved)
        );
        assert!(path.exists() && !path.with_extension("json.imported").exists());
    }
}

#[test]
fn another_module_keeps_its_immediate_reply_and_closed_error() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.remote = Some((9, RemoteKind::MailGet));
    assert!(
        matches!(session.service_reply(9, Ok(CoreReply::MailConsent { consent: true, locale: None, revision: 1 })), Ok(Some(Reply::MailGet { value })) if value.consent)
    );
    assert!(session.deferred.is_none());
    session.remote = Some((10, RemoteKind::MailGet));
    assert_eq!(
        session.service_reply(10, Err(HostError::CoreUnavailable)),
        Err(HostError::CoreUnavailable)
    );
}

#[test]
fn a_module_cannot_leave_a_request_unregistered_when_it_defers() {
    let fixture = Fixture::new();
    for (deferred, remote) in [(false, false), (false, true), (true, false)] {
        let mut session = fixture.session();
        session.deferred = deferred.then_some((7, Instant::now()));
        session.remote = remote.then_some((7, RemoteKind::Testing(Operation::Load)));
        assert_eq!(
            session.validate_service_completion(Ok(None)),
            Err(HostError::Rejected)
        );
        assert!(session.deferred.is_none());
    }
    let mut session = fixture.session();
    session.deferred = Some((7, Instant::now()));
    session.remote = Some((7, RemoteKind::Testing(Operation::Load)));
    assert_eq!(session.validate_service_completion(Ok(None)), Ok(None));
}
#[test]
fn a_closed_pipe_during_cleanup_keeps_the_restart_exit_code() {
    let mut cancelled = false;
    let result = session_effects::finish_session(10, || {
        cancelled = true;
        Err(io::ErrorKind::BrokenPipe.into())
    });
    assert_eq!(result, 10);
    assert!(cancelled);
}
