//! `AccountCancel`, OAuth/FAPI y errores de acceso sin revocación (#1827 paso 6).
use super::*;
use crate::protocol::{EmailAction, EmailMode, EmailStage, Session};

#[derive(Clone, Copy)]
enum Attempt {
    OAuth,
    EmailCode,
    EmailPoll,
}

#[test]
fn cancel_and_failed_login_preserve_every_account_state_and_candidate() {
    for state in [Session::SignedOut, Session::SignedIn, Session::NeedsSignIn] {
        for attempt in [Attempt::OAuth, Attempt::EmailCode, Attempt::EmailPoll] {
            cancel_attempt(state, attempt);
        }
    }
}

fn cancel_attempt(state: Session, attempt: Attempt) {
    let polling = matches!(attempt, Attempt::EmailPoll);
    let server =
        crate::test_http::Server::start_native_observed(|base| email_responses(base, polling));
    let (root, store) = crate::test_store("cancel-session");
    let mut account = crate::account::fixture(&server.base, &store);
    match state {
        Session::SignedOut => account.logout(&store).expect("fixture SignedOut"),
        Session::NeedsSignIn => account
            .require_sign_in(&store)
            .expect("fixture NeedsSignIn"),
        _ => {}
    }
    let saved = store
        .load::<serde_json::Value>("account")
        .expect("saved account");
    let identity = account.identity().cloned();
    let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
    let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
    let mut app = App::with_clock(
        BuildConfig {
            supabase: None,
            anon_key: None,
            license_keys: Some(keys),
            channel: None,
            native_oauth: None,
        },
        root.clone(),
        || Ok(100),
    );
    app.account = Some(account);
    app.store = Some(store);
    let candidate = crate::license_remote::Candidate {
        account_id: credential.claims.subject.clone(),
        device: device.clone(),
        credential,
    };
    app.candidate_store()
        .expect("candidate store")
        .save("license-candidate", &candidate)
        .expect("candidate");
    let (link, core) = core_fixture(device, keys, vec![CoreStep::Read]);
    app.attach_core(link);
    if matches!(attempt, Attempt::OAuth) {
        let account = app.account.as_mut().expect("account");
        let url = account.begin_login().expect("pending PKCE");
        account.offer_login_link(&url).expect("copy link");
        assert_eq!(account.session(), Session::Pending);
    } else {
        prepare_email_without_changing_session(&mut app, state, &server, polling);
    }
    let reply = crate::host::fixture_request(&mut app, Command::AccountCancel);
    assert!(
        matches!(reply, Reply::Account { session, pending: false, copy_link: false, .. } if session == state)
    );
    let account = app.account.as_ref().expect("account");
    assert!(account.identity() == identity.as_ref(), "identity retained");
    assert!(!account.login_pending() && !account.email_pending());
    assert!(matches!(account.login_link(), Err(Error::Canceled)));
    assert_eq!(account.session(), state);
    assert_eq!(account.refresh().is_ok(), state == Session::SignedIn);
    assert_documents_retained(&mut app, &saved, &candidate);
    let reply = crate::host::fixture_request(&mut app, Command::AccountPoll);
    assert!(matches!(reply, Reply::Account { session, pending: false, .. } if session == state));
    app.execute(Command::LicenseStatus)
        .expect("only Read, never Invalidate");
    core.join()
        .expect("AccountCancel never sends a core mutation");
    let requests = server.finish_observed();
    if polling {
        assert_eq!(requests.len(), 1, "only end the temporary FAPI session");
        assert!(requests[0].starts_with("POST /v1/client/sessions/sess_fixture/end"));
    } else {
        assert!(requests.is_empty(), "no HTTP during cancellation");
    }
    drop(app);
    crate::cleanup_store(&root, "cancel-session", &[]);
}

fn assert_documents_retained(
    app: &mut App,
    saved: &serde_json::Value,
    candidate: &crate::license_remote::Candidate,
) {
    assert_eq!(
        &app.store
            .as_ref()
            .expect("store")
            .load::<serde_json::Value>("account")
            .expect("saved account"),
        saved
    );
    let retained = app
        .candidate_store()
        .expect("candidate store")
        .load::<crate::license_remote::Candidate>("license-candidate")
        .expect("retained candidate");
    assert_eq!(
        retained.credential.signature,
        candidate.credential.signature
    );
    assert_eq!(retained.account_id, candidate.account_id);
    assert_eq!(retained.device, candidate.device);
}

fn prepare_email_without_changing_session(
    app: &mut App,
    state: Session,
    server: &crate::test_http::Server,
    polling: bool,
) {
    let begin = app.handle(Command::AccountEmail {
        action: EmailAction::Begin {
            mode: EmailMode::SignInCode,
            email: "pilot@example.invalid".into(),
            password: String::new(),
        },
    });
    assert!(matches!(
        begin,
        Reply::Email {
            stage: EmailStage::Code,
            error: None,
            ..
        }
    ));
    let verified = app.handle(Command::AccountEmail {
        action: EmailAction::Verify {
            code: "000000".into(),
        },
    });
    if polling {
        assert!(matches!(
            verified,
            Reply::Email {
                stage: EmailStage::Consent,
                error: None,
                ..
            }
        ));
        assert!(matches!(
            app.handle(Command::AccountEmail {
                action: EmailAction::Finish {}
            }),
            Reply::Email {
                stage: EmailStage::Authorizing,
                error: None,
                ..
            }
        ));
    } else {
        assert!(matches!(verified, Reply::Email { error: Some(_), .. }));
    }
    assert_eq!(app.account.as_ref().expect("account").session(), state);
    for _ in 0..if polling { 8 } else { 5 } {
        server
            .requests
            .recv_timeout(std::time::Duration::from_secs(2))
            .expect("expected FAPI request within fixture deadline");
    }
}

fn email_responses(base: &url::Url, polling: bool) -> Vec<(u16, String)> {
    let attempt = serde_json::json!({"response": {"id":"sia_fixture","status":"needs_first_factor",
        "supported_first_factors":[{"strategy":"email_code","email_address_id":"idn_fixture"}]}})
    .to_string();
    let mut responses = vec![
        (200, serde_json::json!({"issuer":base,"device_authorization_endpoint":base.join("oauth/device_authorization").expect("device"),"grant_types_supported":["urn:ietf:params:oauth:grant-type:device_code"]}).to_string()),
        (200, "{}".into()), (200, attempt.clone()), (200, attempt),
    ];
    if polling {
        responses.extend([
            (200, serde_json::json!({"response":{"id":"sia_fixture","status":"complete","created_session_id":"sess_fixture"},
                "client":{"sessions":[{"id":"sess_fixture","status":"active","tasks":[],"user":{"id":"user_fixture"}}]}}).to_string()),
            (200, serde_json::json!({"device_code":"fixture-device","user_code":"TEST-CODE","expires_in":300,"interval":5}).to_string()),
            (200, "{}".into()),
            (400, r#"{"error":"authorization_pending"}"#.into()),
            (200, "{}".into()),
        ]);
    } else {
        responses.push((400, r#"{"errors":[{"code":"form_code_incorrect"}]}"#.into()));
    }
    responses
}
