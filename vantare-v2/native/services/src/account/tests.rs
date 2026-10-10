use super::*;
use crate::test_http::Server;
use std::net::TcpStream;

fn oauth(server: &Server) -> OAuth {
    OAuth {
        issuer: server.base.clone(),
        client_id: "public-test-client".into(),
        redirect: Url::parse("http://127.0.0.1:0/callback").expect("test URL"),
        authorization: server.base.join("authorize").expect("test URL"),
        token: server.base.join("token").expect("test URL"),
        userinfo: server.base.join("userinfo").expect("test URL"),
    }
}

fn callback(url: &Url, state_override: Option<&str>) -> (TcpStream, String) {
    let params: std::collections::HashMap<_, _> = url
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let redirect = Url::parse(&params["redirect_uri"]).expect("test redirect");
    let mut socket = TcpStream::connect(("127.0.0.1", redirect.port().expect("port")))
        .expect("loopback callback");
    let state = state_override.unwrap_or(&params["state"]);
    write!(
        socket,
        "GET /callback?state={state}&code=local-generated-code HTTP/1.1\r\nHost: localhost\r\n\r\n"
    )
    .expect("callback");
    (socket, params["code_challenge"].clone())
}

#[test]
fn explicit_login_restart_releases_the_fixed_callback_port() {
    let server = Server::start(vec![]);
    let (root, store) = crate::test_store("login-restart");
    let reserved = TcpListener::bind(("127.0.0.1", 0)).expect("free port");
    let port = reserved.local_addr().expect("address").port();
    let mut config = oauth(&server);
    config.redirect.set_port(Some(port)).expect("fixed port");
    drop(reserved);
    let mut account = Account::restore(config, &store).expect("account");
    let first = account.begin_login().expect("first login");
    let (_socket, _) = callback(&first, Some("wrong-state"));
    assert!(matches!(account.poll_login(), Err(Error::Authentication)));
    let restarted = account
        .begin_login()
        .expect("explicit restart on same port");
    let (_socket, _) = callback(&first, None);
    assert!(
        matches!(account.poll_login(), Err(Error::Authentication)),
        "old state is rejected"
    );
    let (_socket, _) = callback(&restarted, None);
    assert!(account.poll_login().expect("new callback").is_some());
    assert!(
        TcpListener::bind(("127.0.0.1", port)).is_ok(),
        "completed attempt releases listener"
    );
    account.begin_login().expect("login before expiry");
    account.attempt.as_mut().expect("attempt").deadline = Instant::now();
    assert!(matches!(account.poll_login(), Err(Error::Canceled)));
    assert!(!account.login_pending());
    assert!(
        TcpListener::bind(("127.0.0.1", port)).is_ok(),
        "expired attempt releases listener"
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "login-restart", &[]);
}

#[test]
fn callback_waits_for_a_slow_browser_and_accepts_provider_extras() {
    let server = Server::start(vec![]);
    let (root, store) = crate::test_store("login-slow-browser");
    let mut account = Account::restore(oauth(&server), &store).expect("account");
    let login = account.begin_login().expect("login");
    let params: std::collections::HashMap<_, _> = login
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    let redirect = Url::parse(&params["redirect_uri"]).expect("test redirect");
    let mut socket =
        TcpStream::connect(("127.0.0.1", redirect.port().expect("port"))).expect("connect");
    let state = params["state"].clone();
    let iss = server.base.as_str().to_owned();
    // Sleep justificado: reproduce el hueco real entre conectar y enviar.
    let writer = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        write!(
            socket,
            "GET /callback?code=c&state={state}&iss={iss}&scope=openid HTTP/1.1\r\nHost: x\r\n\r\n"
        )
        .expect("callback");
        let mut reply = String::new();
        socket.read_to_string(&mut reply).expect("reply");
        reply
    });
    assert!(account.poll_login().expect("callback").is_some());
    assert!(
        writer
            .join()
            .expect("writer")
            .starts_with("HTTP/1.1 200 OK")
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "login-slow-browser", &[]);
}

#[test]
fn pkce_refresh_restore_logout_and_late_completion_are_bound_to_identity() {
    let access = crate::random_id().expect("test entropy");
    let refresh = crate::random_id().expect("test entropy");
    let tokens = serde_json::json!({"access_token":access,"refresh_token":refresh,"expires_in":60,"token_type":"Bearer"}).to_string();
    let server = Server::start(vec![
        (200, tokens.clone()),
        (200, "{\"sub\":\"user_fixture\",\"name\":\"Isaac Fixture\",\"picture\":\"file:///private.png\"}".into()),
        (200, tokens),
        (200, "{\"sub\":\"user_fixture\"}".into()),
    ]);
    let (root, store) = crate::test_store("account-test");
    let config = oauth(&server);
    let mut account = Account::restore(config.clone(), &store).expect("account");
    let login = account.begin_login().expect("login");
    let (_socket, _) = callback(&login, Some("wrong-state"));
    assert!(matches!(account.poll_login(), Err(Error::Authentication)));
    let (_socket, challenge) = callback(&login, None);
    let ticket = account.poll_login().expect("callback").expect("ticket");
    account
        .complete(ticket.run(&Http::default(), 100).expect("exchange"), &store)
        .expect("save");
    assert_eq!(
        account.identity().expect("identity").subject,
        "user_fixture"
    );
    assert_eq!(account.profile().expect("profile").name, "Isaac Fixture");
    assert!(account.profile().expect("profile").image_url.is_none());
    assert!(
        account
            .authorized(159, |bearer| Ok(bearer == access))
            .expect("access")
    );
    assert!(matches!(
        account.authorized(160, |_| Ok(())),
        Err(Error::Expired)
    ));
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("POST captured");
    let body = request.split("\r\n\r\n").nth(1).expect("body");
    let form: std::collections::HashMap<_, _> = url::form_urlencoded::parse(body.as_bytes())
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    assert_eq!(form["grant_type"], "authorization_code");
    assert_eq!(
        URL_SAFE_NO_PAD.encode(Sha256::digest(form["code_verifier"].as_bytes())),
        challenge
    );
    assert!(!form.contains_key("client_secret"));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("userinfo");
    let restored = Account::restore(config.clone(), &store).expect("restore");
    assert_eq!(restored.expires_at(), Some(160));
    let completion = account
        .refresh()
        .expect("refresh")
        .run(&Http::default(), 150)
        .expect("renew");
    account.logout(&store).expect("logout");
    assert!(matches!(
        account.complete(completion, &store),
        Err(Error::Canceled)
    ));
    assert!(
        Account::restore(config, &store)
            .expect("tombstone")
            .identity()
            .is_none()
    );
    assert!(account.authorized(100, |_| Ok(())).is_err());
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("refresh POST");
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("userinfo");
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "account-test", &["account"]);
}

#[test]
fn discovery_refuses_cross_origin_token_endpoint() {
    let server = Server::start_with(|base| {
        vec![(200,serde_json::json!({
        "issuer": base.as_str(), "authorization_endpoint": base.join("authorize").expect("test"),
        "token_endpoint": "https://other.invalid/token", "userinfo_endpoint": base.join("userinfo").expect("test"),
        "code_challenge_methods_supported": ["S256"]
    }).to_string())]
    });
    assert!(
        OAuth::discover(
            &Http::default(),
            server.base.clone(),
            "fixture".into(),
            Url::parse("http://127.0.0.1:0/callback").expect("test URL")
        )
        .is_err()
    );
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("discovery");
    server.finish();
}

#[test]
fn production_oauth_cache_is_bound_to_issuer_client_and_redirect() {
    let issuer = Url::parse("https://clerk.vantare.app/").expect("issuer");
    let redirect = Url::parse("http://127.0.0.1:47813/callback").expect("loopback");
    let mut oauth = OAuth {
        issuer: issuer.clone(),
        client_id: "public-production-client".into(),
        redirect: redirect.clone(),
        authorization: issuer.join("oauth/authorize").expect("endpoint"),
        token: issuer.join("oauth/token").expect("endpoint"),
        userinfo: issuer.join("oauth/userinfo").expect("endpoint"),
    };
    assert!(oauth.matches(&issuer, "public-production-client", &redirect));
    let dev = Url::parse("https://fixture.clerk.accounts.dev/").expect("dev");
    assert!(!oauth.matches(&dev, "public-production-client", &redirect));
    assert!(!oauth.matches(&issuer, "other-client", &redirect));
    assert!(!oauth.matches(
        &issuer,
        "public-production-client",
        &Url::parse("http://127.0.0.1:47814/callback").expect("other redirect")
    ));
    oauth.token = dev.join("oauth/token").expect("dev token");
    assert!(!oauth.matches(&issuer, "public-production-client", &redirect));
}

#[test]
fn development_session_cannot_be_restored_as_production_identity() {
    for change_client in [false, true] {
        let issuer = Url::parse("https://fixture.clerk.accounts.dev/").expect("dev");
        let (root, store) = crate::test_store("production-switch");
        let account = super::fixture(&issuer, &store);
        let mut prod = account.oauth.clone();
        if change_client {
            prod.client_id = "public-production-client".into();
        } else {
            prod.issuer = Url::parse("https://clerk.vantare.app/").expect("prod");
        }
        drop(account);
        let restored = Account::restore(prod, &store).expect("new environment");
        assert!(restored.identity().is_none());
        assert!(matches!(
            restored.authorized(1, |_| Ok(())),
            Err(Error::Authentication)
        ));
        drop(restored);
        drop(store);
        crate::cleanup_store(&root, "production-switch", &["account"]);
    }
}

#[test]
fn failed_refresh_is_not_retried_and_changed_subject_cannot_replace_account() {
    let server = Server::start(vec![(429,"{}".into()),(200,serde_json::json!({"access_token":crate::random_id().expect("entropy"),"refresh_token":crate::random_id().expect("entropy"),"expires_in":60,"token_type":"Bearer"}).to_string()),(200,"{\"sub\":\"different_user\"}".into())]);
    let (root, store) = crate::test_store("refresh-test");
    let config = oauth(&server);
    let saved = Saved::SignedIn {
        version: 1,
        session: Session {
            identity: Identity {
                issuer: config.issuer.to_string(),
                subject: "initial_user".into(),
            },
            client_id: config.client_id.clone(),
            access: Secret(crate::random_id().expect("entropy")),
            refresh: Secret(crate::random_id().expect("entropy")),
            expires_at: 100,
        },
    };
    store.save("account", &saved).expect("fixture session");
    let account = Account::restore(config, &store).expect("restore");
    assert!(matches!(
        account.refresh().expect("ticket").run(&Http::default(), 99),
        Err(Error::Offline)
    ));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("exactly one refresh");
    assert!(matches!(
        account.refresh().expect("ticket").run(&Http::default(), 99),
        Err(Error::Authentication)
    ));
    assert_eq!(
        account.identity().expect("identity").subject,
        "initial_user"
    );
    for _ in 0..2 {
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("captured");
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "refresh-test", &["account"]);
}

#[test]
fn successful_rotation_is_protected_before_restart() {
    let access = crate::random_id().expect("test entropy");
    let refresh = crate::random_id().expect("test entropy");
    let server=Server::start(vec![(200,serde_json::json!({"access_token":access,"refresh_token":refresh,"expires_in":60,"token_type":"Bearer"}).to_string()),(200,"{\"sub\":\"user_fixture\"}".into())]);
    let (root, store) = crate::test_store("rotation-test");
    let mut account = super::fixture(&server.base, &store);
    let oauth = account.oauth.clone();
    let completion = account
        .refresh()
        .expect("ticket")
        .run(&Http::default(), 900)
        .expect("rotate");
    account
        .complete(completion, &store)
        .expect("persist before ACK");
    drop(account);
    let restored = Account::restore(oauth, &store).expect("restart");
    assert!(
        restored
            .authorized(950, |bearer| Ok(bearer == access))
            .expect("rotated access")
    );
    assert!(restored.session.as_ref().expect("session").refresh.expose() == refresh);
    assert_eq!(restored.expires_at(), Some(960));
    for _ in 0..2 {
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("capture");
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "rotation-test", &["account"]);
}

#[test]
fn explicit_profile_refresh_restores_saved_photo_and_cannot_switch_identity() {
    let server = Server::start(vec![
        (200, r#"{"sub":"user_fixture","given_name":"Élise","family_name":"Fixture","image_url":"https://evil.invalid/photo"}"#.into()),
        (200, r#"{"sub":"another_user","name":"Impostor"}"#.into()),
        (500, "{}".into()),
    ]);
    let (root, store) = crate::test_store("profile-refresh");
    let mut account = super::fixture(&server.base, &store);
    let config = account.oauth.clone();
    let identity = account.identity().expect("identity").clone();
    let saved_before =
        serde_json::to_value(store.load::<Saved>("account").expect("sesión original"))
            .expect("JSON de test");
    let expiry = account.expires_at();
    let generation = account.generation();
    account
        .refresh_profile(&Http::default(), 100, &store)
        .expect("profile");
    assert_eq!(account.profile().expect("profile").name, "Élise Fixture");
    assert!(account.profile().expect("profile").image_url.is_none());
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("userinfo");
    assert!(request.starts_with("GET /userinfo "));
    assert!(account.identity() == Some(&identity));
    assert_eq!(account.expires_at(), expiry);
    assert_eq!(account.generation(), generation);
    let saved_after =
        serde_json::to_value(store.load::<Saved>("account").expect("sesión conservada"))
            .expect("JSON de test");
    assert!(
        saved_before == saved_after,
        "actualizar perfil no escribe ni cambia tokens OAuth"
    );
    assert!(matches!(
        account.refresh_profile(&Http::default(), 100, &store),
        Err(Error::Authentication)
    ));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("wrong subject");
    assert!(matches!(
        account.refresh_profile(&Http::default(), 100, &store),
        Err(Error::Offline)
    ));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("error");
    assert_eq!(account.profile().expect("preserved").name, "Élise Fixture");
    let mut restored = Account::restore(config, &store).expect("restore");
    assert_eq!(restored.profile().expect("saved").name, "Élise Fixture");
    restored.logout(&store).expect("logout");
    assert!(restored.profile().is_none());
    assert!(matches!(
        store.load::<serde_json::Value>("account-profile"),
        Err(Error::NotFound)
    ));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "profile-refresh", &["account"]);
}
