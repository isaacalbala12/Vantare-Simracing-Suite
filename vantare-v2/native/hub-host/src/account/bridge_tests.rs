//! Production dispatch and polling with an in-memory pipe; no OS or network effects.
use super::*;
use vantare_ipc::services_protocol::{Command, Reply as CoreReply, Session as CoreSession};
fn configured(session: &mut Session) {
    let now = Instant::now();
    session
        .account
        .complete(
            crate::account::Operation::Status,
            &CoreReply::Status {
                account_configured: true,
                message: String::new(),
            },
            true,
            now,
        )
        .unwrap();
    session.core.available = true;
}
#[test]
fn email_cancel_during_an_active_request_is_prioritized_and_late_reply_cannot_restore_the_form() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    configured(&mut session);
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            1,
            &Request::AccountEmail {
                action: crate::account::EmailIntent::Open {
                    mode: crate::account::EmailMode::SignInCode,
                },
            },
        )
        .unwrap();
    session
        .request(
            &mut pipe,
            2,
            &Request::AccountEmail {
                action: crate::account::EmailIntent::Begin {
                    mode: crate::account::EmailMode::SignInCode,
                    email: "qa@example.invalid".into(),
                    password: String::new(),
                },
            },
        )
        .unwrap();
    session
        .request(
            &mut pipe,
            3,
            &Request::AccountEmail {
                action: crate::account::EmailIntent::Cancel {},
            },
        )
        .unwrap();
    assert!(matches!(
        session.core.sent.last(),
        Some((3, Command::AccountCancel))
    ));
    assert!(session.account_view().email.is_none());
    session
        .service_reply(
            2,
            Ok(CoreReply::Email {
                stage: vantare_ipc::services_protocol::EmailStage::Code,
                retry_after_seconds: 30,
                message: "late".into(),
                error: None,
            }),
        )
        .unwrap();
    assert!(session.account_view().email.is_none());
    assert_eq!(session.account_view().gate, crate::account::Gate::Canceling);
    session
        .service_reply(
            3,
            Ok(CoreReply::Account {
                session: CoreSession::SignedOut,
                copy_link: false,
                signed_in: false,
                profile: None,
                expires_at: None,
                pending: false,
                message: String::new(),
                error: None,
            }),
        )
        .unwrap();
    assert_eq!(session.account_view().gate, crate::account::Gate::Choose);
}
#[test]
fn host_polling_uses_a_private_id_and_publishes_only_account_events() {
    const BACKGROUND_ID: u32 = crate::account::BACKGROUND_ID;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.core.available = true;
    session.current.services = protocol::LinkState::Connected;
    let mut pipe = Pipe::new(Vec::new());
    session.subscriptions.insert(Topic::Account);
    account_tick::tick(&mut session, &mut pipe).unwrap();
    assert!(matches!(
        session.core.sent.first(),
        Some((BACKGROUND_ID, Command::Status))
    ));
    let result = session.service_reply(
        BACKGROUND_ID,
        Ok(CoreReply::Status {
            account_configured: true,
            message: String::new(),
        }),
    );
    session
        .respond_service(&mut pipe, BACKGROUND_ID, result)
        .unwrap();
    let before = session.core.sent.len();
    session
        .request(&mut pipe, BACKGROUND_ID, &Request::AccountBegin {})
        .unwrap();
    assert_eq!(session.core.sent.len(), before);
    pipe.set_position(0);
    let mut reader = frame::Reader::default();
    let mut events = 0;
    while pipe.position() < u64::try_from(pipe.get_ref().len()).unwrap() {
        match reader
            .next::<HostToUi>(&mut pipe)
            .unwrap()
            .expect("complete frame")
        {
            HostToUi::Event {
                event: Event::Account { .. },
            } => events += 1,
            HostToUi::Failure {
                id: BACKGROUND_ID,
                error: HostError::Busy,
            } => {}
            other => panic!("private poll leaked a response: {other:?}"),
        }
    }
    assert_eq!(events, 1);
}
#[test]
fn out_of_stage_email_is_rejected_before_the_service_queue() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    configured(&mut session);
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(
            &mut pipe,
            1,
            &Request::AccountEmail {
                action: crate::account::EmailIntent::Verify {
                    code: "123456".into(),
                },
            },
        )
        .unwrap();
    assert!(session.core.sent.is_empty());
    pipe.set_position(0);
    assert_eq!(
        frame::Reader::default()
            .next::<HostToUi>(&mut pipe)
            .unwrap(),
        Some(HostToUi::Failure {
            id: 1,
            error: HostError::AccountInvalid
        })
    );
}

#[test]
fn a_late_copy_link_after_cancel_is_denied_before_any_clipboard_access() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    configured(&mut session);
    session
        .account
        .complete(
            crate::account::Operation::Poll,
            &CoreReply::Account {
                session: CoreSession::Pending,
                copy_link: true,
                signed_in: false,
                profile: None,
                expires_at: None,
                pending: true,
                message: String::new(),
                error: None,
            },
            true,
            Instant::now(),
        )
        .unwrap();
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 10, &Request::AccountCopyLink {})
        .unwrap();
    session
        .request(&mut pipe, 11, &Request::AccountCancel {})
        .unwrap();
    let result = session.service_reply(
        10,
        Ok(CoreReply::AccountLink {
            url: vantare_ipc::services_protocol::LoginLink(
                "https://issuer.invalid/authorize?state=private-qa".into(),
            ),
        }),
    );
    assert_eq!(result, Err(HostError::Denied));
    assert!(
        !serde_json::to_string(&session.account_view())
            .unwrap()
            .contains("https://")
    );
}
#[test]
fn a_manual_retry_cannot_duplicate_an_active_login_even_with_a_different_reply_method() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    configured(&mut session);
    let mut pipe = Pipe::new(Vec::new());
    session
        .request(&mut pipe, 1, &Request::AccountBegin {})
        .unwrap();
    session
        .request(&mut pipe, 2, &Request::AccountRetry {})
        .unwrap();
    assert_eq!(session.core.sent.len(), 1);
    assert!(matches!(
        session.core.sent.first(),
        Some((1, Command::AccountBegin))
    ));
    session.service_reply(1, Err(HostError::Busy)).unwrap_err();
    account_tick::tick(&mut session, &mut pipe).unwrap();
    assert_eq!(session.core.sent.len(), 1);
}
