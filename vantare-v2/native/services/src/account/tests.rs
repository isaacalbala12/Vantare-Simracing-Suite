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
fn callback_waits_for_a_browser_that_connects_before_sending() {
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
    // Sleep justificado: reproduce el hueco real entre conectar y enviar.
    let writer = std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        write!(
            socket,
            "GET /callback?state={state}&code=c HTTP/1.1\r\nHost: x\r\n\r\n"
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
        (200, "{\"sub\":\"user_fixture\"}".into()),
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
