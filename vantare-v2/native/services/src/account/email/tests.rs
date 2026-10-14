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
