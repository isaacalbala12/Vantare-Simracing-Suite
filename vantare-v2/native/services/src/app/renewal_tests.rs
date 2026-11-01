//! Paso 5: respuesta manual y conservación observable del acceso cacheado.
use super::tests::{CoreStep, core_fixture};
use super::*;

struct AccessFixture {
    app: App,
    root: PathBuf,
    core: std::thread::JoinHandle<()>,
}

fn access_fixture(server: &crate::test_http::Server, steps: Vec<CoreStep>) -> AccessFixture {
    let device = crate::license::installation::legacy_fingerprint().expect("device");
    let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
    let (root, store) = crate::test_store("renewal-review");
    let account = crate::account::fixture(&server.base, &store);
    let config = BuildConfig {
        supabase: Some(server.base.clone()),
        anon_key: Some("fixture-public"),
        license_keys: Some(keys),
        channel: Some("test"),
        native_oauth: Some(crate::config::OAuthBuild {
            issuer: server.base.clone(),
            client_id: "public-fixture".into(),
            redirect_uri: "http://127.0.0.1:0/callback".parse().expect("redirect"),
        }),
    };
    let mut app = App::with_clock(config, root.clone(), || Ok(100));
    app.account = Some(account);
    app.store = Some(store);
    app.legacy_store()
        .expect("store")
        .save(
            "license-candidate",
            &crate::license_remote::tests::LegacyCandidate {
                account_id: credential.claims.subject.clone(),
                device: device.clone(),
                credential,
            },
        )
        .expect("candidate");
    let (link, core) = core_fixture(device, keys, steps);
    app.attach_core(link);
    AccessFixture { app, root, core }
}

impl AccessFixture {
    fn require_sign_in(&mut self) {
        self.app
            .account
            .as_mut()
            .expect("account")
            .require_sign_in(self.app.store.as_ref().expect("store"))
            .expect("NeedsSignIn");
    }
    fn finish(self) {
        self.core.join().expect("exact core commands");
        drop(self.app);
        crate::cleanup_store(&self.root, "renewal-review", &[]);
    }
}

#[test]
fn device_reset_in_needs_sign_in_preserves_every_local_document_without_http() {
    let server = crate::test_http::Server::start_observed(vec![]);
    let mut fixture = access_fixture(&server, vec![CoreStep::ReadLicensed]);
    fixture.require_sign_in();
    let store = fixture.app.store.as_ref().expect("store");
    let account_before = store
        .fixture::<serde_json::Value>("account")
        .expect("saved account");
    let candidate_before = fixture
        .app
        .legacy_store()
        .expect("store")
        .fixture::<serde_json::Value>("license-candidate")
        .expect("candidate");
    assert_eq!(
        fixture.app.execute(Command::DeviceReset).err(),
        Some(Error::Authentication)
    );
    assert_eq!(
        fixture
            .app
            .store
            .as_ref()
            .expect("store")
            .fixture::<serde_json::Value>("account")
            .expect("account"),
        account_before
    );
    assert_eq!(
        fixture
            .app
            .legacy_store()
            .expect("store")
            .fixture::<serde_json::Value>("license-candidate")
            .expect("candidate"),
        candidate_before
    );
    assert!(
        matches!(fixture.app.handle(Command::LicenseStatus), Reply::License { policy, .. } if policy.state.permits_access())
    );
    fixture.finish();
    assert!(
        server.finish_observed().is_empty(),
        "no refresh, authorize or device reset"
    );
}

#[test]
fn logout_from_needs_sign_in_still_requires_ack_and_clears_account() {
    for rejected in [false, true] {
        let server = crate::test_http::Server::start_observed(vec![]);
        let mut fixture = access_fixture(
            &server,
            vec![if rejected {
                CoreStep::RejectInvalidate
            } else {
                CoreStep::Invalidate
            }],
        );
        fixture.require_sign_in();
        let result = fixture.app.execute(Command::Logout);
        assert_eq!(result.is_err(), rejected);
        let account = fixture.app.account.as_ref().expect("account");
        assert_eq!(account.identity().is_some(), rejected);
        assert_eq!(account.needs_sign_in(), rejected);
        assert!(
            fixture
                .app
                .legacy_store()
                .expect("old store")
                .fixture::<serde_json::Value>("license-candidate")
                .is_ok(),
            "old files are ignored after either outcome"
        );
        let saved = fixture
            .app
            .store
            .as_ref()
            .expect("store")
            .fixture::<serde_json::Value>("account")
            .expect("durable account");
        assert_eq!(
            saved["state"],
            if rejected { "NeedsSignIn" } else { "SignedOut" }
        );
        fixture.finish();
        assert!(server.finish_observed().is_empty());
    }
}

#[test]
fn usable_device_reset_with_rejected_ack_preserves_candidate_and_never_calls_reset() {
    let server = crate::test_http::Server::start_observed(vec![(200,
        serde_json::json!({"version":1, "account_id":"12345678-1234-4234-8234-123456789abc", "data_access_token":"fixture-data", "expires_at":200}).to_string()
    )]);
    let mut fixture = access_fixture(&server, vec![CoreStep::RejectInvalidate]);
    fixture.app.bridge = Some(crate::bridge::Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("authorize"),
        supabase: server.base.clone(),
        anon_key: "fixture-public".into(),
    });
    assert_eq!(
        fixture.app.execute(Command::DeviceReset).err(),
        Some(Error::Core(vantare_ipc::control::Failure::UnknownLegacy))
    );
    assert!(
        fixture
            .app
            .legacy_store()
            .expect("store")
            .fixture::<serde_json::Value>("license-candidate")
            .is_ok()
    );
    fixture.finish();
    let requests = server.finish_observed();
    assert_eq!(requests.len(), 1, "no reset after a rejected ACK");
    assert!(requests[0].starts_with("POST /functions/v1/native-account-authorize "));
}

#[test]
fn token_403_and_userinfo_failures_after_refresh_remain_transient_and_durable_signed_in() {
    for status in [401, 403, 503] {
        for token_failure in [false, true] {
            if token_failure && status != 403 {
                continue;
            }
            let mut responses = vec![];
            if !token_failure {
                responses.push((200, serde_json::json!({"access_token":"rotated-access", "refresh_token":"rotated-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()));
            }
            responses.push((status, "{}".into()));
            let server = crate::test_http::Server::start_observed(responses);
            let mut fixture = access_fixture(&server, vec![]);
            let saved = fixture
                .app
                .store
                .as_ref()
                .expect("store")
                .fixture::<serde_json::Value>("account")
                .expect("before");
            assert_eq!(
                fixture.app.refresh_oauth_origin(1000, true),
                Err(Error::Offline)
            );
            assert!(
                !fixture
                    .app
                    .account
                    .as_ref()
                    .expect("account")
                    .needs_sign_in()
            );
            assert_eq!(
                fixture
                    .app
                    .store
                    .as_ref()
                    .expect("store")
                    .fixture::<serde_json::Value>("account")
                    .expect("after"),
                saved
            );
            assert!(matches!(
                App::automatic_failure(Error::Offline),
                Reply::LicenseFailure {
                    outcome: crate::protocol::RenewalOutcome::Transient,
                    ..
                }
            ));
            fixture.finish();
            let requests = server.finish_observed();
            assert_eq!(requests.len(), if token_failure { 1 } else { 2 });
            assert!(requests[0].starts_with("POST /token "));
            if !token_failure {
                assert!(requests[1].starts_with("GET /userinfo "));
            }
        }
    }
}

#[test]
fn pending_login_from_needs_sign_in_shows_progress_instead_of_stale_authentication_error() {
    let server = crate::test_http::Server::start_observed(vec![]);
    let mut fixture = access_fixture(&server, vec![]);
    fixture.require_sign_in();
    let account = fixture.app.account.as_mut().expect("account");
    // The same begin path as AccountBegin, without launching a real browser.
    account.begin_login().expect("pending PKCE login");
    assert!(
        matches!(App::account_reply(account, None), Reply::Account { pending: true, signed_in: false, error: None, message, .. } if message == "Complete el inicio de sesión en el navegador")
    );
    assert!(
        matches!(fixture.app.handle(Command::AccountPoll), Reply::Account { pending: true, signed_in: false, error: None, message, .. } if message == "Complete el inicio de sesión en el navegador")
    );
    fixture.finish();
    assert!(server.finish_observed().is_empty());
}

#[test]
fn manual_denial_is_definitive_and_preserves_cached_rights() {
    let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
    let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
    for status in [401, 403, 409] {
        let server = crate::test_http::Server::start_observed(vec![(status, "{}".into())]);
        let (root, store) = crate::test_store("manual-non-destructive");
        let account = crate::account::fixture(&server.base, &store);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test-key"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: None,
        };
        let mut app = App::with_clock(config, root.clone(), || Ok(100));
        app.account = Some(account);
        app.store = Some(store);
        let candidate = crate::license_remote::tests::LegacyCandidate {
            credential: credential.clone(),
            account_id: credential.claims.subject.clone(),
            device: device.clone(),
        };
        app.legacy_store()
            .expect("candidate store")
            .save("license-candidate", &candidate)
            .expect("candidate");
        let before = serde_json::to_vec(&candidate).expect("fixture bytes");
        let (link, core) = core_fixture(device.clone(), keys, vec![CoreStep::ReadLicensed]);
        app.attach_core(link);
        assert!(
            matches!(
                app.handle(Command::LicenseRenew),
                Reply::LicenseFailure {
                    outcome: crate::protocol::RenewalOutcome::Definitive,
                    ..
                }
            ),
            "manual server rejection must stop automatic renewal"
        );
        assert!(
            !app.account.as_ref().expect("account").needs_sign_in(),
            "license refusal is not an OAuth refresh refusal"
        );
        let retained = app
            .legacy_store()
            .expect("store")
            .fixture::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
            .expect("candidate retained");
        assert_eq!(
            serde_json::to_vec(&retained).expect("fixture bytes"),
            before
        );
        assert!(
            matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if policy.state.permits_access())
        );
        core.join().expect("only Read, no Invalidate or Install");
        let request = server.requests.recv().expect("HTTP observed");
        assert!(request.starts_with("POST /functions/v1/native-license "));
        assert!(
            server.finish_observed().is_empty(),
            "no automatic HTTP replay"
        );
        drop(app);
        crate::cleanup_store(&root, "manual-non-destructive", &[]);
    }
}

#[test]
fn fresh_login_with_same_identity_clears_needs_sign_in_without_revocation() {
    use std::{io::Write, net::TcpStream};
    let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
    let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
    let server = crate::test_http::Server::start_observed(vec![
        (200, serde_json::json!({"access_token":"fixture-fresh-access", "refresh_token":"fixture-fresh-refresh", "token_type":"Bearer", "expires_in":3600}).to_string()),
        (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
    ]);
    let (root, store) = crate::test_store("same-identity-recovery");
    let mut account = crate::account::fixture(&server.base, &store);
    account.require_sign_in(&store).expect("NeedsSignIn");
    let mut app = App::with_clock(BuildConfig::load(), root.clone(), || Ok(100));
    app.account = Some(account);
    app.store = Some(store);
    let candidate = crate::license_remote::tests::LegacyCandidate {
        credential: credential.clone(),
        account_id: credential.claims.subject.clone(),
        device: device.clone(),
    };
    app.legacy_store()
        .expect("store")
        .save("license-candidate", &candidate)
        .expect("candidate");
    let (link, core) = core_fixture(device, keys, vec![CoreStep::ReadLicensed]);
    app.attach_core(link);
    let url = app
        .account
        .as_mut()
        .expect("account")
        .begin_login()
        .expect("fresh PKCE login");
    let params: std::collections::HashMap<_, _> = url
        .query_pairs()
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();
    let redirect = url::Url::parse(&params["redirect_uri"]).expect("callback");
    let mut socket =
        TcpStream::connect(("127.0.0.1", redirect.port().expect("port"))).expect("callback socket");
    write!(
        socket,
        "GET /callback?state={}&code=fixture-code HTTP/1.1\r\nHost: localhost\r\n\r\n",
        params["state"]
    )
    .expect("callback request");
    assert!(matches!(
        app.handle(Command::AccountPoll),
        Reply::Account {
            signed_in: true,
            pending: false,
            error: None,
            ..
        }
    ));
    assert!(!app.account.as_ref().expect("account").needs_sign_in());
    let retained = app
        .legacy_store()
        .expect("store")
        .fixture::<crate::license_remote::tests::LegacyCandidate>("license-candidate")
        .expect("same candidate");
    assert_eq!(
        serde_json::to_vec(&retained).expect("fixture bytes"),
        serde_json::to_vec(&candidate).expect("fixture bytes")
    );
    assert!(
        matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if policy.state.permits_access())
    );
    core.join()
        .expect("same identity: only Read, no Invalidate");
    let token = server.requests.recv().expect("fresh token exchange");
    assert!(token.starts_with("POST /token "));
    let info = server.requests.recv().expect("fresh identity");
    assert!(info.starts_with("GET /userinfo "));
    assert!(
        server.finish_observed().is_empty(),
        "no refresh or license issuance while recovering identity"
    );
    drop(socket);
    drop(app);
    crate::cleanup_store(&root, "same-identity-recovery", &[]);
}

#[test]
fn automatic_renewal_without_identity_stays_signed_out_and_never_starts_http() {
    let server = crate::test_http::Server::start_observed(vec![]);
    let mut fixture = access_fixture(&server, vec![]);
    let app = &mut fixture.app;
    app.account
        .as_mut()
        .expect("account")
        .logout(app.store.as_ref().expect("store"))
        .expect("signed out fixture");
    assert!(matches!(
        app.handle(Command::LicenseRenewAutomatic),
        Reply::LicenseFailure {
            outcome: crate::protocol::RenewalOutcome::Transient,
            ..
        }
    ));
    assert_eq!(
        app.account.as_ref().expect("account").session(),
        crate::protocol::Session::SignedOut
    );
    fixture.finish();
    assert!(server.finish_observed().is_empty());
}
