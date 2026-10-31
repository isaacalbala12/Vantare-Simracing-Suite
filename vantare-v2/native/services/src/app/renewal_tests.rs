//! Paso 5: respuesta manual y conservación observable del acceso cacheado.
use super::tests::{CoreStep, core_fixture};
use super::*;

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
        let candidate = crate::license_remote::Candidate {
            credential: credential.clone(),
            account_id: credential.claims.subject.clone(),
            device: device.clone(),
        };
        app.candidate_store()
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
            .candidate_store()
            .expect("store")
            .load::<crate::license_remote::Candidate>("license-candidate")
            .expect("candidate retained");
        assert_eq!(
            serde_json::to_vec(&retained).expect("fixture bytes"),
            before
        );
        assert!(
            matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if policy.overlays_advanced)
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
    let candidate = crate::license_remote::Candidate {
        credential: credential.clone(),
        account_id: credential.claims.subject.clone(),
        device: device.clone(),
    };
    app.candidate_store()
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
        .candidate_store()
        .expect("store")
        .load::<crate::license_remote::Candidate>("license-candidate")
        .expect("same candidate");
    assert_eq!(
        serde_json::to_vec(&retained).expect("fixture bytes"),
        serde_json::to_vec(&candidate).expect("fixture bytes")
    );
    assert!(
        matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if policy.overlays_advanced)
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
