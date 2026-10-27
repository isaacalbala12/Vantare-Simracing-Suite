use super::super::Saved;
use super::*;
use crate::test_http::Server;
use serde_json::json;

fn oauth(base: &Url) -> OAuth {
    OAuth {
        issuer: base.clone(),
        client_id: "public-fixture".into(),
        redirect: Url::parse("http://127.0.0.1:0/callback").expect("fixture"),
        authorization: base.join("oauth/authorize").expect("fixture"),
        token: base.join("oauth/token").expect("fixture"),
        userinfo: base.join("oauth/userinfo").expect("fixture"),
    }
}
fn metadata(base: &Url) -> (u16, String) {
    (200, json!({"issuer":base.as_str(), "device_authorization_endpoint":base.join("oauth/device_authorization").expect("fixture"), "grant_types_supported":[DEVICE_GRANT]}).to_string())
}
fn attempt(status: &str, signup: bool) -> (u16, String) {
    (200, json!({"response": {"id": if signup {"sua_fixture"} else {"sia_fixture"}, "status": status,
        "missing_fields":[], "unverified_fields":["email_address"],
        "supported_first_factors":[{"strategy":"email_code","email_address_id":"idn_fixture"},{"strategy":"reset_password_email_code","email_address_id":"idn_fixture"}],
        "created_session_id": if status == "complete" {Some("sess_fixture")} else {None}},
        "client":{"sessions":[{"id":"sess_fixture","status":"active","tasks":[],"user":{"id":"user_fixture"}}]}}).to_string())
}
fn start(mode: EmailMode) -> EmailAction {
    EmailAction::Begin {
        mode,
        email: "pilot@example.invalid".into(),
        password: if matches!(mode, EmailMode::SignInPassword | EmailMode::SignUpPassword) {
            "generated-password-fixture"
        } else {
            ""
        }
        .into(),
    }
}
fn complete_responses() -> Vec<(u16, String)> {
    vec![(200,json!({"device_code":"fixture-device","user_code":"TEST-CODE","expires_in":300,"interval":5}).to_string()),
        (200,"{}".into()), (200,json!({"access_token":"fixture-oauth","refresh_token":"fixture-refresh","token_type":"Bearer","expires_in":300}).to_string()),
        (200,json!({"sub":"user_fixture"}).to_string())]
}
fn requests(server: &Server) -> Vec<String> {
    server.requests.try_iter().collect()
}

fn flow_responses(base: &Url, mode: EmailMode) -> Vec<(u16, String)> {
    let signup = matches!(mode, EmailMode::SignUpCode | EmailMode::SignUpPassword);
    let mut responses = vec![
        metadata(base),
        (200, "{}".into()),
        attempt(
            if signup {
                "missing_requirements"
            } else if mode == EmailMode::SignInPassword {
                "complete"
            } else {
                "needs_first_factor"
            },
            signup,
        ),
    ];
    if mode != EmailMode::SignInPassword {
        responses.push(attempt(
            if signup {
                "missing_requirements"
            } else {
                "needs_first_factor"
            },
            signup,
        ));
        responses.push(attempt(
            if mode == EmailMode::Recovery {
                "needs_new_password"
            } else {
                "complete"
            },
            signup,
        ));
        if mode == EmailMode::Recovery {
            responses.push(attempt("complete", false));
        }
    }
    responses.extend(complete_responses());
    responses
}
fn assert_native_requests(server: &Server, signup: bool, mode: EmailMode) {
    let wire = requests(server);
    assert!(
        wire.iter()
            .any(|r| r.contains("/oauth/token") && r.contains("device_code=fixture-device"))
    );
    assert!(
        wire.iter()
            .filter(|r| r.contains("/v1/"))
            .all(|r| r.contains("_is_native=true")
                && !r.to_lowercase().contains("cookie:")
                && !r.to_lowercase().contains("origin:")
                && !r.to_lowercase().contains("apikey:"))
    );
    assert!(
        wire.iter()
            .filter(|r| r.contains("/v1/") && !r.starts_with("POST /v1/client?"))
            .all(|r| r
                .to_lowercase()
                .contains("authorization: bearer fixture-client-token"))
    );
    if signup {
        assert!(
            wire.iter()
                .any(|r| r.contains("/prepare_verification?") && r.contains("strategy=email_code"))
        );
    }
    if mode == EmailMode::Recovery {
        assert!(wire.iter().any(
            |r| r.contains("/reset_password?") && r.contains("sign_out_of_other_sessions=true")
        ));
    }
    let native: Vec<_> = wire.iter().filter(|r| r.starts_with("POST /v1/")).collect();
    for (index, request) in native.iter().enumerate().skip(1) {
        assert!(
            request.to_lowercase().contains(&format!(
                "authorization: bearer fixture-client-token-{index}\r\n"
            )),
            "FAPI must use latest rotated client token"
        );
    }
}

#[test]
fn every_email_flow_finishes_as_existing_oauth_session_and_restores() {
    for mode in [
        EmailMode::SignInCode,
        EmailMode::SignInPassword,
        EmailMode::SignUpCode,
        EmailMode::SignUpPassword,
        EmailMode::Recovery,
    ] {
        let signup = matches!(mode, EmailMode::SignUpCode | EmailMode::SignUpPassword);
        let server = Server::start_native(|base| flow_responses(base, mode));
        let (root, store) = crate::test_store("email-flow");
        let config = oauth(&server.base);
        let mut account = Account::restore(config.clone(), &store).expect("restore");
        assert!(
            account
                .email_action(&Http::default(), start(mode), 100)
                .expect("begin")
                .is_none()
        );
        assert!(
            account.identity().is_none(),
            "FAPI alone gives no durable identity"
        );
        if mode != EmailMode::SignInPassword {
            assert!(
                account
                    .email_action(
                        &Http::default(),
                        EmailAction::Verify {
                            code: "123456".into()
                        },
                        101
                    )
                    .expect("verify")
                    .is_none()
            );
            if mode == EmailMode::Recovery {
                assert!(matches!(
                    account.email_reply(101, None),
                    Reply::Email {
                        stage: EmailStage::NewPassword,
                        ..
                    }
                ));
                account
                    .email_action(
                        &Http::default(),
                        EmailAction::Reset {
                            password: "new-generated-password".into(),
                            sign_out_of_other_sessions: true,
                        },
                        102,
                    )
                    .expect("reset");
            }
        }
        assert!(matches!(
            account.email_reply(103, None),
            Reply::Email {
                stage: EmailStage::Consent,
                ..
            }
        ));
        let ticket = account
            .email_action(&Http::default(), EmailAction::Finish {}, 103)
            .expect("grant")
            .expect("ticket");
        assert!(
            account.identity().is_none(),
            "approval alone does not persist"
        );
        account
            .complete(ticket.run(&Http::default(), 103).expect("exchange"), &store)
            .expect("persist");
        assert_eq!(
            account.identity().expect("identity").subject,
            "user_fixture"
        );
        assert_native_requests(&server, signup, mode);
        let saved =
            serde_json::to_string(&store.load::<Saved>("account").expect("saved OAuth")).ok();
        // On Unix store format is plaintext; no transient credential belongs there.
        if let Some(saved) = saved {
            for secret in [
                "fixture-client-token",
                "generated-password-fixture",
                "123456",
                "fixture-device",
                "TEST-CODE",
            ] {
                assert!(!saved.contains(secret));
            }
        }
        let restored = Account::restore(config, &store).expect("restored");
        assert!(restored.identity() == account.identity());
        assert!(!restored.email_pending());
        account.logout(&store).expect("logout");
        assert!(account.identity().is_none());
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "email-flow", &["account", "account-profile"]);
    }
}

#[test]
fn wrong_code_can_retry_resend_is_manual_and_cancel_invalidates_grant() {
    let server = Server::start_native(|base| {
        let mut r=vec![metadata(base),(200,"{}".into()),attempt("needs_first_factor",false),attempt("needs_first_factor",false),
            (422,json!({"errors":[{"code":"form_code_incorrect","message":"do not display provider body"}]}).to_string()),
            attempt("needs_first_factor",false),attempt("complete",false)];
        r.extend(complete_responses());
        r
    });
    let (root, store) = crate::test_store("email-retry");
    let mut account = Account::restore(oauth(&server.base), &store).expect("restore");
    account
        .email_action(&Http::default(), start(EmailMode::SignInCode), 100)
        .expect("begin");
    assert!(matches!(
        account.email_action(&Http::default(), EmailAction::Resend {}, 110),
        Err(Error::Busy)
    ));
    assert!(matches!(
        account.email_action(
            &Http::default(),
            EmailAction::Verify {
                code: "123456".into()
            },
            111
        ),
        Err(Error::InvalidCredential)
    ));
    assert!(matches!(
        account.email_reply(111, Some(Error::InvalidCredential)),
        Reply::Email {
            stage: EmailStage::Code,
            retry_after_seconds: 19,
            ..
        }
    ));
    account
        .email_action(&Http::default(), EmailAction::Resend {}, 130)
        .expect("resend");
    account
        .email_action(
            &Http::default(),
            EmailAction::Verify {
                code: "123456".into(),
            },
            131,
        )
        .expect("retry");
    let ticket = account
        .email_action(&Http::default(), EmailAction::Finish {}, 132)
        .expect("grant")
        .expect("ticket");
    let completion = ticket.run(&Http::default(), 132).expect("exchange");
    account
        .email_action(&Http::default(), EmailAction::Cancel {}, 133)
        .expect("cancel");
    assert!(matches!(
        account.complete(completion, &store),
        Err(Error::Canceled)
    ));
    assert!(account.identity().is_none());
    let wire = requests(&server);
    assert_eq!(
        wire.iter()
            .filter(|r| r.contains("/prepare_first_factor?"))
            .count(),
        2
    );
    assert!(
        !serde_json::to_string(&account.email_reply(133, None))
            .expect("reply")
            .contains("fixture-client-token")
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-retry", &[]);
}

#[test]
fn additional_factors_tasks_and_signup_requirements_never_grant_access() {
    for response in [attempt("needs_second_factor",false),attempt("needs_client_trust",false),attempt("needs_protect_check",false),
        (200,json!({"response":{"id":"sia_fixture","status":"complete","created_session_id":"sess_fixture"},"client":{"sessions":[{"id":"sess_fixture","status":"active","tasks":[{"key":"choose_organization"}],"user":{"id":"user_fixture"}}]}}).to_string())] {
        let server=Server::start_native(|base| vec![metadata(base),(200,"{}".into()),response]);
        let (root,store)=crate::test_store("email-requirements");
        let mut account=Account::restore(oauth(&server.base),&store).expect("account");
        assert!(matches!(account.email_action(&Http::default(),start(EmailMode::SignInPassword),100),Err(Error::Unsupported)));
        assert!(matches!(account.email_reply(100,Some(Error::Unsupported)),Reply::Email{stage:EmailStage::HostedRequired,..}));
        assert!(matches!(account.email_action(&Http::default(),EmailAction::Finish {},101),Err(Error::Protocol)));
        assert!(account.identity().is_none());server.finish();drop(store);crate::cleanup_store(&root,"email-requirements",&[]);
    }
    let server = Server::start_native(|base| {
        vec![metadata(base),(200,"{}".into()),(200,json!({"response":{"id":"sua_fixture","status":"missing_requirements","missing_fields":["password"],"unverified_fields":["email_address"]}}).to_string())]
    });
    let (root, store) = crate::test_store("email-missing");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    assert!(matches!(
        account.email_action(&Http::default(), start(EmailMode::SignUpCode), 100),
        Err(Error::Unsupported)
    ));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-missing", &[]);
}

#[test]
fn invalid_credentials_expiry_rate_limit_and_untrusted_metadata_fail_closed() {
    let server = Server::start(vec![]);
    let (root, store) = crate::test_store("email-invalid");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    assert!(matches!(
        account.email_action(
            &Http::default(),
            EmailAction::Begin {
                mode: EmailMode::SignInCode,
                email: "bad\n@example.invalid".into(),
                password: String::new()
            },
            100
        ),
        Err(Error::InvalidCredential)
    ));
    assert!(matches!(
        account.email_action(&Http::default(), EmailAction::Finish {}, 100),
        Err(Error::Canceled)
    ));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-invalid", &[]);
    let server = Server::start_native(|base| {
        vec![
            metadata(base),
            (200, "{}".into()),
            attempt("needs_first_factor", false),
            (429, "{}".into()),
        ]
    });
    let (root, store) = crate::test_store("email-rate");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    assert!(matches!(
        account.email_action(&Http::default(), start(EmailMode::SignInCode), 100),
        Err(Error::Busy)
    ));
    assert!(matches!(
        account.email_action(&Http::default(), EmailAction::Resend {}, 101),
        Err(Error::Busy)
    ));
    assert!(matches!(
        account.email_action(
            &Http::default(),
            EmailAction::Verify {
                code: "123456".into()
            },
            701
        ),
        Err(Error::Expired)
    ));
    assert!(!account.email_pending());
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-rate", &[]);
    let server = Server::start_native(|base| {
        vec![(200,json!({"issuer":base.as_str(),"device_authorization_endpoint":"https://attacker.example.invalid/oauth/device_authorization","grant_types_supported":[DEVICE_GRANT]}).to_string())]
    });
    let (root, store) = crate::test_store("email-origin");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    assert!(matches!(
        account.email_action(&Http::default(), start(EmailMode::SignInCode), 100),
        Err(Error::Unconfigured)
    ));
    assert_eq!(
        requests(&server).len(),
        1,
        "no credential sent before capability validation"
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-origin", &[]);
}

#[test]
fn oauth_identity_mismatch_or_pending_response_never_persists_fapi_session() {
    for pending in [false, true] {
        let server = Server::start_native(|base| {
            let mut r = vec![
                metadata(base),
                (200, "{}".into()),
                attempt("complete", false),
            ];
            let mut completion = complete_responses();
            if pending {
                completion.truncate(3);
                completion[2] = (400, json!({"error":"authorization_pending"}).to_string());
            } else {
                completion[3] = (200, json!({"sub":"user_other"}).to_string());
            }
            r.extend(completion);
            r
        });
        let (root, store) = crate::test_store("email-no-authority");
        let mut account = Account::restore(oauth(&server.base), &store).expect("account");
        account
            .email_action(&Http::default(), start(EmailMode::SignInPassword), 100)
            .expect("begin");
        let ticket = account
            .email_action(&Http::default(), EmailAction::Finish {}, 101)
            .expect("grant")
            .expect("ticket");
        assert!(ticket.run(&Http::default(), 101).is_err());
        assert!(account.identity().is_none());
        assert!(matches!(
            store.load::<Saved>("account"),
            Err(Error::NotFound)
        ));
        assert_eq!(
            requests(&server)
                .iter()
                .filter(|r| r.starts_with("POST /oauth/token "))
                .count(),
            1,
            "no polling or retry loop"
        );
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "email-no-authority", &[]);
    }
}

type Ready = (Server, std::path::PathBuf, crate::storage::Store, Account);
fn ready_to_finish(name: &str, tail: Vec<(u16, String)>) -> Ready {
    let server = Server::start_native(|base| {
        let mut r = vec![
            metadata(base),
            (200, "{}".into()),
            attempt("complete", false),
        ];
        r.extend(tail);
        r
    });
    let (root, store) = crate::test_store(name);
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    account
        .email_action(&Http::default(), start(EmailMode::SignInPassword), 100)
        .expect("begin");
    (server, root, store, account)
}

fn pending() -> (u16, String) {
    (400, json!({"error":"authorization_pending"}).to_string())
}

#[test]
fn expired_code_or_restarted_service_returns_to_form_with_clear_message() {
    let server = Server::start_native(|base| {
        vec![
            metadata(base),
            (200, "{}".into()),
            attempt("needs_first_factor", false),
            attempt("needs_first_factor", false),
        ]
    });
    let (root, store) = crate::test_store("email-expired");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    account
        .email_action(&Http::default(), start(EmailMode::SignInCode), 100)
        .expect("begin");
    let verify = || EmailAction::Verify {
        code: "123456".into(),
    };
    let error = account
        .email_action(&Http::default(), verify(), 701)
        .err()
        .expect("expired");
    assert_eq!(error, Error::Expired);
    for error in [error, Error::Canceled] {
        let Reply::Email {
            stage,
            message,
            error: shown,
            ..
        } = account.email_reply(702, Some(error))
        else {
            panic!("email reply");
        };
        assert_eq!(stage, EmailStage::Form);
        assert!(shown.is_some());
        assert!(message.contains("Pide otro código"), "{message}");
    }
    // Servicios reiniciado: no hay login, y el siguiente intento también cae a Form.
    for action in [verify(), EmailAction::Resend {}] {
        let error = account
            .email_action(&Http::default(), action, 703)
            .err()
            .expect("canceled");
        assert_eq!(error, Error::Canceled);
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-expired", &[]);
}

#[test]
fn pending_authorization_retries_with_bounded_injected_clock() {
    let mut tail = vec![
        (200,json!({"device_code":"fixture-device","user_code":"TEST-CODE","expires_in":300,"interval":5}).to_string()),
        (200, "{}".into()),
        pending(),
        (400, json!({"error":"slow_down"}).to_string()),
    ];
    tail.extend(complete_responses().split_off(2));
    tail.push((200, "{}".into())); // end de la sesión FAPI
    let (server, root, store, mut account) = ready_to_finish("email-pending-ok", tail);
    let ticket = account
        .email_action(&Http::default(), EmailAction::Finish {}, 101)
        .expect("grant");
    assert!(
        account
            .exchange_email(&Http::default(), ticket, 101)
            .expect("pending")
            .is_none()
    );
    assert!(matches!(
        account.email_reply(102, None),
        Reply::Email {
            stage: EmailStage::Authorizing,
            ..
        }
    ));
    assert!(
        account
            .exchange_email(&Http::default(), None, 105)
            .expect("not due")
            .is_none()
    );
    assert!(
        account
            .exchange_email(&Http::default(), None, 106)
            .expect("slow down")
            .is_none()
    );
    assert!(
        account
            .exchange_email(&Http::default(), None, 115)
            .expect("not due")
            .is_none()
    );
    let completion = account
        .exchange_email(&Http::default(), None, 116)
        .expect("ready")
        .expect("completion");
    assert_eq!(completion.identity().subject, "user_fixture");
    let wire = requests(&server);
    assert_eq!(
        wire.iter()
            .filter(|r| r.starts_with("POST /oauth/device_authorization "))
            .count(),
        1,
        "reutiliza el mismo grant"
    );
    assert_eq!(
        wire.iter()
            .filter(|r| r.starts_with("POST /oauth/token "))
            .count(),
        3,
        "respeta 5s y slow_down +5s"
    );
    server.finish();
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "email-pending-ok", &[]);
}

#[test]
fn pending_authorization_exhaustion_and_cancellation_leave_no_oauth_session() {
    for cancel in [false, true] {
        let mut tail = vec![
            (200,json!({"device_code":"fixture-device","user_code":"TEST-CODE","expires_in":300,"interval":5}).to_string()),
            (200, "{}".into()),
            pending(),
        ];
        if !cancel {
            tail.extend(std::iter::repeat_n(pending(), 6));
        }
        tail.push((200, "{}".into())); // cancel/logout cierran FAPI
        let (server, root, store, mut account) = ready_to_finish("email-pending-stop", tail);
        let ticket = account
            .email_action(&Http::default(), EmailAction::Finish {}, 101)
            .expect("grant");
        account
            .exchange_email(&Http::default(), ticket, 101)
            .expect("pending");
        if cancel {
            account
                .email_action(&Http::default(), EmailAction::Cancel {}, 102)
                .expect("cancelar sin esperar");
            assert_eq!(
                account.exchange_email(&Http::default(), None, 106).err(),
                Some(Error::Canceled)
            );
            assert!(!account.email_pending());
        } else {
            for now in [106, 111, 116, 121, 126] {
                assert!(
                    account
                        .exchange_email(&Http::default(), None, now)
                        .expect("pending")
                        .is_none()
                );
            }
            assert_eq!(
                account.exchange_email(&Http::default(), None, 131).err(),
                Some(Error::Pending)
            );
            assert!(matches!(
                account.email_reply(131, Some(Error::Pending)),
                Reply::Email {
                    stage: EmailStage::Consent,
                    ..
                }
            ));
            assert!(
                account.email.as_ref().expect("login").session.is_some(),
                "aún puede reintentar Autorizar"
            );
            account.end_email_session(&Http::default());
        }
        let wire = requests(&server);
        assert_eq!(
            wire.iter()
                .filter(|r| r.starts_with("POST /oauth/token "))
                .count(),
            if cancel { 1 } else { 7 }
        );
        assert!(
            wire.last()
                .expect("end")
                .starts_with("POST /v1/client/sessions/sess_fixture/end?")
        );
        assert!(account.identity().is_none());
        assert!(matches!(
            store.load::<Saved>("account"),
            Err(Error::NotFound)
        ));
        server.finish();
        drop(account);
        drop(store);
        crate::cleanup_store(&root, "email-pending-stop", &[]);
    }
}

#[test]
fn failed_persistence_after_exchange_restarts_instead_of_reauthorizing_closed_fapi() {
    let mut tail = complete_responses();
    tail.push((200, "{}".into()));
    let (server, root, store, mut account) = ready_to_finish("email-save-failed", tail);
    let ticket = account
        .email_action(&Http::default(), EmailAction::Finish {}, 101)
        .expect("grant")
        .expect("ticket");
    let completion = account
        .exchange_email(&Http::default(), Some(ticket), 101)
        .expect("exchange")
        .expect("completed");
    // Un directorio en el destino impide el reemplazo atómico en Windows/Unix.
    let namespace = std::fs::read_dir(&root)
        .expect("root")
        .next()
        .expect("namespace")
        .expect("entry")
        .path();
    std::fs::create_dir(namespace.join(if cfg!(windows) {
        "account.dpapi"
    } else {
        "account.json"
    }))
    .expect("block account persistence");
    let error = account
        .complete(completion, &store)
        .expect_err("storage failure");
    assert_eq!(error, Error::Storage);
    assert!(account.identity().is_none());
    let Reply::Email { stage, message, .. } = account.email_reply(102, Some(error)) else {
        panic!("email reply");
    };
    assert_eq!(stage, EmailStage::Form);
    assert!(
        message.contains("Vuelve a iniciar"),
        "restart guidance: {message}"
    );
    assert_eq!(
        account
            .email_action(&Http::default(), EmailAction::Finish {}, 102)
            .err(),
        Some(Error::Canceled),
        "Autorizar no puede reutilizar una sesión FAPI cerrada"
    );
    let wire = requests(&server);
    assert_eq!(
        wire.iter()
            .filter(|r| r.starts_with("POST /oauth/device_authorization "))
            .count(),
        1
    );
    assert_eq!(
        wire.iter()
            .filter(|r| r.starts_with("POST /oauth/token "))
            .count(),
        1
    );
    assert!(
        wire.last()
            .expect("end")
            .starts_with("POST /v1/client/sessions/sess_fixture/end?")
    );
    server.finish();
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "email-save-failed", &[]);
}

#[test]
fn fapi_session_is_ended_and_weak_password_has_its_own_error() {
    let mut tail = complete_responses();
    tail.push((200, "{}".into()));
    let (server, root, store, mut account) = ready_to_finish("email-end-session", tail.clone());
    let ticket = account
        .email_action(&Http::default(), EmailAction::Finish {}, 101)
        .expect("grant")
        .expect("ticket");
    account
        .exchange_email(&Http::default(), Some(ticket), 101)
        .expect("exchange")
        .expect("completed");
    assert!(
        requests(&server)
            .iter()
            .any(|r| r.starts_with("POST /v1/client/sessions/sess_fixture/end")),
        "la sesión FAPI se cierra tras canjear el token"
    );
    server.finish();
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "email-end-session", &[]);

    let server = Server::start_native(|base| {
        vec![
            metadata(base),
            (200, "{}".into()),
            (
                422,
                json!({"errors":[{"code":"form_password_pwned"}]}).to_string(),
            ),
        ]
    });
    let (root, store) = crate::test_store("email-weak");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    assert_eq!(
        account
            .email_action(&Http::default(), start(EmailMode::SignUpPassword), 100)
            .err(),
        Some(Error::CompromisedPassword)
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-weak", &[]);
}

#[test]
fn short_password_and_wrong_password_have_distinct_messages() {
    for (code, expected) in [
        ("form_password_length_too_short", Error::WeakPassword),
        ("form_password_incorrect", Error::InvalidCredential),
    ] {
        let server = Server::start_native(|base| {
            vec![
                metadata(base),
                (200, "{}".into()),
                (422, json!({"errors":[{"code":code}]}).to_string()),
            ]
        });
        let (root, store) = crate::test_store("email-password-policy");
        let mut account = Account::restore(oauth(&server.base), &store).expect("account");
        let error = account
            .email_action(&Http::default(), start(EmailMode::SignUpPassword), 100)
            .err()
            .expect("rejected");
        assert_eq!(error, expected);
        let Reply::Email { message, .. } = account.email_reply(100, Some(error)) else {
            panic!("email");
        };
        assert_eq!(message.contains("débil"), expected == Error::WeakPassword);
        server.finish();
        drop(account);
        drop(store);
        crate::cleanup_store(&root, "email-password-policy", &[]);
    }
}

#[test]
fn local_rate_limit_survives_going_back() {
    let server = Server::start_native(|base| {
        vec![
            metadata(base),
            (200, "{}".into()),
            attempt("needs_first_factor", false),
            (429, "{}".into()),
        ]
    });
    let (root, store) = crate::test_store("email-block");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    assert_eq!(
        account
            .email_action(&Http::default(), start(EmailMode::SignInCode), 100)
            .err(),
        Some(Error::Busy)
    );
    account
        .email_action(&Http::default(), EmailAction::Cancel {}, 101)
        .expect("back");
    assert_eq!(
        account
            .email_action(&Http::default(), start(EmailMode::SignInCode), 102)
            .err(),
        Some(Error::Busy),
        "«Volver» no reinicia el límite"
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "email-block", &[]);
}

#[test]
fn blocked_device_grant_does_not_repeat_the_device_authorization_call() {
    let server = Server::start_native(|base| {
        vec![
            metadata(base),
            (200, "{}".into()),
            attempt("complete", false),
            (200, json!({"device_code":"fixture-device","user_code":"TEST-CODE","expires_in":300,"interval":5}).to_string()),
            (429, "{}".into()),
        ]
    });
    let (root, store) = crate::test_store("email-device-block");
    let mut account = Account::restore(oauth(&server.base), &store).expect("account");
    account
        .email_action(&Http::default(), start(EmailMode::SignInPassword), 100)
        .expect("begin");
    assert_eq!(
        account
            .email_action(&Http::default(), EmailAction::Finish {}, 101)
            .err(),
        Some(Error::Busy),
        "el endpoint de dispositivo responde 429"
    );
    // Bloqueo activo: el clic repetido de «Autorizar» no vuelve a llamar.
    assert_eq!(
        account
            .email_action(&Http::default(), EmailAction::Finish {}, 102)
            .err(),
        Some(Error::Busy)
    );
    assert_eq!(
        requests(&server)
            .iter()
            .filter(|r| r.starts_with("POST /oauth/device_authorization "))
            .count(),
        1,
        "una sola llamada al endpoint de dispositivo durante el bloqueo"
    );
    server.finish();
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "email-device-block", &[]);
}

/// Sonda manual autorizada: solo prepara OTP para una cuenta QA existente.
#[test]
#[ignore = "requires explicit QA account and Clerk Production network access"]
fn production_qa_email_code_probe() {
    let base =
        Url::parse(&std::env::var("VANTARE_QA_ISSUER").expect("QA issuer")).expect("issuer URL");
    assert_eq!(base.as_str(), "https://clerk.vantare.app/");
    let email = std::env::var("VANTARE_QA_EMAIL").expect("QA email");
    let (root, store) = crate::test_store("production-email-probe");
    let mut account = Account::restore(oauth(&base), &store).expect("restore");
    let result = account.email_action(
        &Http::default(),
        EmailAction::Begin {
            mode: EmailMode::SignInCode,
            email,
            password: String::new(),
        },
        100,
    );
    println!(
        "production-email-probe: result={:?}",
        result.as_ref().map(|_| ())
    );
    assert!(result.is_ok());
    assert!(matches!(
        account.email_reply(100, None),
        Reply::Email {
            stage: EmailStage::Code,
            ..
        }
    ));
    assert!(account.identity().is_none());
    account.cancel_login().expect("cancel");
    let missing = format!(
        "vantare-qa-{}@example.com",
        &crate::random_id().expect("QA entropy")[..12]
    );
    let result = account.email_action(
        &Http::default(),
        EmailAction::Begin {
            mode: EmailMode::SignInCode,
            email: missing,
            password: String::new(),
        },
        101,
    );
    assert!(matches!(result, Err(Error::NotFound)));
    assert!(account.identity().is_none());
    println!("production-email-probe: unknown_account=NotFound no_identity=true");
    account.cancel_login().expect("cancel");
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "production-email-probe", &[]);
}

#[test]
fn missing_account_and_service_rejection_have_actionable_messages() {
    for (status, code, expected, text) in [
        (
            422,
            "form_identifier_not_found",
            Error::NotFound,
            "Esta cuenta no existe: crea una cuenta",
        ),
        (
            400,
            "unexpected_provider_error",
            Error::Denied,
            "El servicio de acceso",
        ),
        (
            403,
            "native_api_disabled",
            Error::Denied,
            "El servicio de acceso",
        ),
    ] {
        let server = Server::start_native(|base| {
            vec![
                metadata(base),
                (200, "{}".into()),
                (
                    status,
                    json!({"errors":[{"code":code,"message":"private-provider-body@example.com"}]})
                        .to_string(),
                ),
            ]
        });
        let (root, store) = crate::test_store("email-errors");
        let mut account = Account::restore(oauth(&server.base), &store).expect("restore");
        assert!(
            matches!(account.email_action(&Http::default(), start(EmailMode::SignInCode), 100), Err(error) if error == expected)
        );
        assert!(
            matches!(account.email_reply(100, Some(expected)), Reply::Email { stage: EmailStage::Form, message, .. } if message.contains(text) && !message.contains("private-provider"))
        );
        assert!(account.identity().is_none());
        drop(account);
        drop(store);
        crate::cleanup_store(&root, "email-errors", &[]);
        server.finish();
    }
}

#[test]
fn extra_device_verification_requires_browser_and_never_authenticates() {
    for state in [
        "needs_second_factor",
        "needs_client_trust",
        "needs_protect_check",
    ] {
        let server = Server::start_native(|base| {
            vec![metadata(base), (200, "{}".into()), attempt(state, false)]
        });
        let (root, store) = crate::test_store("email-device-verification");
        let mut account = Account::restore(oauth(&server.base), &store).expect("restore");
        assert!(matches!(
            account.email_action(&Http::default(), start(EmailMode::SignInCode), 100),
            Err(Error::Unsupported)
        ));
        assert!(matches!(
            account.email_reply(100, Some(Error::Unsupported)),
            Reply::Email {
                stage: EmailStage::HostedRequired,
                ..
            }
        ));
        assert!(account.identity().is_none());
        drop(account);
        drop(store);
        crate::cleanup_store(&root, "email-device-verification", &[]);
        server.finish();
    }
}

#[test]
fn email_diagnostic_excludes_remote_text_and_identifiers() {
    for code in ["form_identifier_not_found", "private@example.com\nsecret"] {
        let response = crate::http::Response { status: 422,
            body: json!({"errors":[{"code":code,"message":"secret password OTP 123456","meta":{"email":"private@example.com"}}]}).to_string().into_bytes(),
            client_token: Some(Secret::new("secret-client-token".into())), retry_after: None, server_time: None };
        let line = diagnostic(
            "v1/client/sign_ins/sia_private/prepare_first_factor",
            &response,
        );
        assert!(line.contains("stage=prepare_first_factor status=422"));
        assert!(line.contains(if code == "form_identifier_not_found" {
            "clerk_code=form_identifier_not_found"
        } else {
            "clerk_code=unrecognized"
        }));
        for private in ["private", "secret", "123456", "@", "\n"] {
            assert!(!line.contains(private));
        }
    }
}

/// Usa el ejecutable instalado con IPC y almacenamiento exclusivamente de QA.
#[test]
#[ignore = "requires explicit installed binary and QA account against Production"]
fn installed_binary_qa_email_code_probe() {
    let binary = std::path::PathBuf::from(std::env::var("VANTARE_QA_BINARY").expect("QA binary"));
    let email = std::env::var("VANTARE_QA_EMAIL").expect("QA email");
    let instance = format!(
        "vantare-qa-{}",
        &crate::random_id().expect("QA entropy")[..12]
    );
    let root = std::env::temp_dir().join(&instance);
    let core = vantare_ipc::control::CoreLink {
        pipe: vantare_ipc::control::pipe_name(&instance),
        image: std::env::current_exe().expect("QA parent"),
        nonce: crate::random_id().expect("QA nonce"),
    };
    let mut client =
        crate::process::Client::start_managed(&binary, Some(&root), &core).expect("QA process");
    let reply = client
        .request(crate::protocol::Command::AccountEmail {
            action: EmailAction::Begin {
                mode: EmailMode::SignInCode,
                email,
                password: String::new(),
            },
        })
        .expect("QA reply");
    assert!(matches!(
        reply,
        Reply::Email {
            stage: EmailStage::Code,
            error: None,
            ..
        }
    ));
    println!("installed-email-probe: qa_existing=Code error=none");
    client
        .request(crate::protocol::Command::AccountEmail {
            action: EmailAction::Cancel {},
        })
        .expect("cancel");
    let reply = client
        .request(crate::protocol::Command::AccountEmail {
            action: EmailAction::Begin {
                mode: EmailMode::SignInCode,
                email: format!(
                    "vantare-qa-{}@example.com",
                    &crate::random_id().expect("QA entropy")[..12]
                ),
                password: String::new(),
            },
        })
        .expect("QA missing reply");
    assert!(
        matches!(reply, Reply::Email { stage: EmailStage::Form, message, error: Some(_), .. }
        if message == "Revisa el email, la contrase\u{00f1}a o el c\u{00f3}digo. No se pudo verificar el acceso.")
    );
    println!("installed-email-probe: qa_missing=original_generic_error");
    drop(client);
    std::fs::remove_dir_all(root).expect("QA cleanup");
}
