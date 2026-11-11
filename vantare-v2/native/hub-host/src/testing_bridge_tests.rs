use super::*;
use crate::protocol::{AccessView, HostError, Request};
use vantare_ipc::services_protocol::{self as services, report_document};

fn pipes() -> (Pipe, Pipe) {
    let (name, stop, _listener, mut server) = endpoint();
    let peer = connect(&name, stop, Duration::from_secs(5)).expect("local peer");
    server.accept().expect("local accept");
    (server, peer)
}
fn next(peer: &mut Pipe) -> HostToUi {
    let mut reader = frame::Reader::default();
    loop {
        if let Some(value) = reader.next(peer).expect("host reply") {
            return value;
        }
    }
}
#[test]
fn session_testing_request_distinguishes_rights_connection_and_busy() {
    for (verified, connected, busy, expected) in [
        (false, true, false, HostError::Denied),
        (true, false, false, HostError::CoreUnavailable),
        (true, true, true, HostError::Busy),
    ] {
        let root = Root::new();
        let mut session = restart_session(&root.path, "testing-local-unused");
        let services = session.core.isolate_services(connected);
        session.current.access.verified = verified;
        if busy {
            session
                .core
                .request(99, services::Command::Probe)
                .expect("first operation");
            assert!(services.incoming.try_recv().is_ok());
        }
        let (mut pipe, mut peer) = pipes();
        session
            .testing_request(&mut pipe, 7, &Request::DraftLoad {})
            .expect("handled");
        assert_eq!(
            next(&mut peer),
            HostToUi::Failure {
                id: 7,
                error: expected
            }
        );
        assert!(session.remote.is_none());
        assert!(services.incoming.try_recv().is_err());
    }
}
#[test]
fn session_testing_roundtrips_remove_prepare_and_send_and_ignores_late_ids() {
    let root = Root::new();
    let mut session = restart_session(&root.path, "testing-local-unused");
    let local = session.core.isolate_services(true);
    let (mut pipe, mut peer) = pipes();
    let fields = crate::testing::ReportFields {
        module: "hub".into(),
        ..Default::default()
    };
    let preview = report_document::Preview {id:"a".repeat(64),digest:"b".repeat(64),account_id:"private".into(),channel:"nightly".into(),retry:false,screenshots:vec![],payload:serde_json::json!({"p_module":"hub","p_action_text":"","p_expected_text":"","p_observed_text":"","p_context_text":"","p_app_version":"QA","p_os_version":"Windows"}).to_string()};
    for (id, request, reply, method) in [
        (
            1,
            Request::ReportRemoveScreenshot {
                id: "a".repeat(64),
                fields: fields.clone(),
            },
            services::Reply::Draft {
                draft: None,
                message: "Conservado".into(),
            },
            "report.removeScreenshot",
        ),
        (
            2,
            Request::ReportPrepare {},
            services::Reply::ReportPreview { preview },
            "report.prepare",
        ),
        (
            3,
            Request::ReportSend {
                preview_id: "a".repeat(64),
                consent: true,
            },
            services::Reply::ReportReceipt {
                receipt: report_document::Receipt {
                    report_id: "15350000-0000-0000-0000-000000000001".into(),
                    report_state: "received".into(),
                    created_at: "2026-11-10T12:00:00Z".into(),
                    idempotent: false,
                },
                draft_state: services::DraftState::CleanupPending,
            },
            "report.send",
        ),
    ] {
        session.current.access = AccessView {
            verified: true,
            ..Default::default()
        };
        session
            .testing_request(&mut pipe, id, &request)
            .expect("dispatch");
        let (actual, command) = local.incoming.try_recv().expect("closed core command");
        assert_eq!(actual, id);
        assert!(matches!(
            (id, command),
            (1, services::Command::ReportRemoveScreenshot { .. })
                | (2, services::Command::ReportPrepare)
                | (3, services::Command::ReportSend { .. })
        ));
        local
            .outgoing
            .send((id + 100, Ok(services::Reply::Closed)))
            .expect("late response");
        local
            .outgoing
            .send((id, Ok(reply)))
            .expect("matching response");
        session
            .tick(&args(&root.path), &mut pipe)
            .expect("complete");
        let value = serde_json::to_value(next(&mut peer)).expect("wire reply");
        assert_eq!(value["id"], id);
        assert_eq!(value["result"]["method"], method);
        if id == 3 {
            assert_eq!(value["result"]["value"]["draftState"], "cleanupPending");
        }
    }
    session.current.access.verified = true;
    session
        .testing_request(&mut pipe, 4, &Request::ReportCapture { fields })
        .expect("capture preflight");
    assert_eq!(
        next(&mut peer),
        HostToUi::Failure {
            id: 4,
            error: HostError::EvidencePending
        }
    );
    assert!(local.incoming.try_recv().is_err());
}

#[test]
fn a_reused_id_is_busy_until_the_cancelled_import_reply_is_retired() {
    let root = Root::new();
    let path = root.path.join("testing-center/editor-draft.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, br#"{"version":1,"fields":{"module":"hub","actionText":"old","expectedText":"","observedText":"","contextText":""}}"#).unwrap();
    let mut session = restart_session(&root.path, "testing-local-unused");
    let local = session.core.isolate_services(true);
    session.current.access.verified = true;
    session.current.services = crate::protocol::LinkState::Connected;
    let (mut pipe, mut peer) = pipes();
    session
        .testing_request(&mut pipe, 7, &Request::DraftLoad {})
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (7, services::Command::DraftLoad)
    ));
    local
        .outgoing
        .send((
            7,
            Ok(services::Reply::Draft {
                draft: None,
                message: String::new(),
            }),
        ))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(session.service_reply(id, result), Ok(None));
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (7, services::Command::DraftSave { .. })
    ));
    session.cancel_deferred(&mut pipe).unwrap();
    assert!(matches!(
        next(&mut peer),
        HostToUi::Failure {
            id: 7,
            error: HostError::CoreUnavailable
        }
    ));
    let fields = crate::testing::ReportFields {
        module: "hub".into(),
        action_text: "new".into(),
        ..Default::default()
    };
    session
        .testing_request(
            &mut pipe,
            7,
            &Request::DraftSave {
                fields: fields.clone(),
            },
        )
        .unwrap();
    assert!(matches!(
        next(&mut peer),
        HostToUi::Failure {
            id: 7,
            error: HostError::Busy
        }
    ));
    local
        .outgoing
        .send((7, Ok(services::Reply::Closed)))
        .unwrap();
    let (id, result) = session.core.reply().unwrap();
    assert_eq!(session.service_reply(id, result), Ok(None));
    session
        .testing_request(
            &mut pipe,
            7,
            &Request::DraftSave {
                fields: fields.clone(),
            },
        )
        .unwrap();
    assert!(matches!(
        local.incoming.try_recv().unwrap(),
        (7, services::Command::DraftSave { .. })
    ));
    local.outgoing.send((7, Ok(saved_draft(&fields)))).unwrap();
    let (id, result) = session.core.reply().unwrap();
    let result = session.service_reply(id, result);
    session.respond_service(&mut pipe, id, result).unwrap();
    assert!(
        matches!(next(&mut peer), HostToUi::Response { id: 7, result: crate::protocol::Reply::DraftSave { value } } if value.fields == fields)
    );
    assert!(
        path.exists(),
        "failed import never surfaced the legacy source"
    );
}

fn saved_draft(fields: &crate::testing::ReportFields) -> services::Reply {
    services::Reply::Draft {
        draft: Some(report_document::Draft {
            schema_version: 1,
            idempotency_key: "qa-only".into(),
            fields: fields.core(),
            screenshots: vec![],
        }),
        message: String::new(),
    }
}
