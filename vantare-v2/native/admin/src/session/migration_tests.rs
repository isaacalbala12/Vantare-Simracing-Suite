use super::*;
use vantare_services::{
    config::{BuildConfig, OAuthBuild},
    test_http::Server,
};

fn config(base: &url::Url, active: bool) -> crate::config::Config {
    let hub = OAuthBuild {
        issuer: base.clone(),
        client_id: "hub-fixture".into(),
        redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("callback"),
    };
    let admin = OAuthBuild {
        issuer: hub.issuer.clone(),
        client_id: if active {
            "admin-fixture"
        } else {
            "hub-fixture"
        }
        .into(),
        redirect_uri: hub.redirect_uri.clone(),
    };
    crate::config::Config {
        build: BuildConfig {
            supabase: Some(base.clone()),
            anon_key: None,
            license_keys: None,
            channel: Some("nightly"),
            native_oauth: Some(admin),
        },
        context: if active {
            "admin-fixture-v2"
        } else {
            "hub-fixture-v1"
        }
        .into(),
        legacy: active.then(|| ("hub-fixture-v1".into(), hub)),
    }
}

fn metadata(base: &url::Url, client: &str) -> OAuth {
    serde_json::from_value(serde_json::json!({
        "issuer":base, "client_id":client, "redirect":"http://127.0.0.1:0/callback",
        "authorization":base.join("authorize").expect("URL"),
        "token":base.join("token").expect("URL"),
        "userinfo":base.join("userinfo").expect("URL")
    }))
    .expect("metadata")
}

fn prepare(base: &url::Url, active: bool, damaged: bool) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "admin-r10-{}",
        vantare_services::random_id().expect("ID")
    ));
    let store = Store::open(&root, "hub-fixture-v1").expect("synthetic Store");
    let saved = if damaged {
        serde_json::json!({"damaged":true})
    } else {
        serde_json::json!({"state":"SignedIn","version":1,"session":{
            "identity":{"issuer":base,"subject":"user_fixture"},"client_id":"hub-fixture",
            "access":"synthetic-access","refresh":"synthetic-refresh","expires_at":4_000_000_000_u64
        }})
    };
    store.save("account", &saved).expect("synthetic account");
    store
        .save("account-profile", &serde_json::json!({"private":"fixture"}))
        .expect("profile");
    store
        .save("oauth-metadata", &metadata(base, "hub-fixture"))
        .expect("metadata");
    drop(store);
    if active {
        let store = Store::open(&root, "admin-fixture-v2").expect("synthetic admin Store");
        store
            .save("oauth-metadata", &metadata(base, "admin-fixture"))
            .expect("metadata");
    }
    root
}

fn open(
    root: &std::path::Path,
    server: &Server,
    active: bool,
) -> std::result::Result<Session, OpenError> {
    let mut http = Http::default();
    http.enable_loopback_for_test();
    Session::open_config(
        root,
        config(&server.base, active),
        http,
        crate::client::tests::loopback_client(server.base.as_str().trim_end_matches('/')),
    )
}

#[test]
fn r10_admin_startup_revokes_legacy_refresh_without_restoring_in_either_mode() {
    for active in [false, true] {
        let server = Server::start_observed(vec![(200, String::new())]);
        let root = prepare(&server.base, active, false);
        let mut session = open(&root, &server, active).expect("retired");
        assert!(matches!(
            session.handle(Command::Restore),
            Ok(Reply::LoggedOut)
        ));
        assert!(session.account.identity().is_none());
        let requests = server.finish_observed();
        assert_eq!(requests.len(), 1);
        assert!(requests[0].starts_with("POST /oauth/token/revoke "));
        drop(session);
        let old = Store::open(&root, "hub-fixture-v1").expect("Store");
        assert!(matches!(
            old.read::<serde_json::Value>("account"),
            Ok(Stored::Missing)
        ));
        assert!(matches!(
            old.read::<serde_json::Value>("account-profile"),
            Ok(Stored::Missing)
        ));
        drop(old);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn r10_admin_failed_revocation_blocks_open_and_retries_only_on_new_startup() {
    for active in [false, true] {
        let server = Server::start_observed(vec![(503, "{}".into()), (200, String::new())]);
        let root = prepare(&server.base, active, false);
        assert!(matches!(
            open(&root, &server, active),
            Err(OpenError::Migration(Error::Offline))
        ));
        let mut state = crate::state::State::new(true, crate::state::Screen::Users);
        state.migration_pending();
        assert!(!state.signed_in && !state.busy && state.users.is_empty());
        assert!(state.message.contains("Reinicia Gestión"));
        let mut session = open(&root, &server, active).expect("next startup succeeds");
        assert!(matches!(
            session.handle(Command::Restore),
            Ok(Reply::LoggedOut)
        ));
        drop(session);
        assert_eq!(server.finish_observed().len(), 2);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn r10_admin_damaged_blob_blocks_open_without_network_or_restoration() {
    for active in [false, true] {
        let server = Server::start_observed(vec![]);
        let root = prepare(&server.base, active, true);
        assert!(matches!(
            open(&root, &server, active),
            Err(OpenError::Migration(Error::Storage))
        ));
        assert!(server.finish_observed().is_empty());
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn r10_admin_diagnosis_logs_in_interactively_and_logout_revokes_once() {
    for revoke_status in [200, 503] {
        let server = Server::start_observed(vec![
        (200,String::new()),
        (200,serde_json::json!({"access_token":"synthetic-access","refresh_token":"synthetic-new-refresh","expires_in":300,"token_type":"Bearer"}).to_string()),
        (200,"{\"sub\":\"user_fixture\"}".into()),
        (revoke_status,String::new()),
    ]);
        let root = prepare(&server.base, true, false);
        let mut session = open(&root, &server, true).expect("session");
        let mut callback_socket = None;
        session
            .login_interactive(|url| {
                let login = url::Url::parse(url).expect("login URL");
                let params = login
                    .query_pairs()
                    .collect::<std::collections::BTreeMap<_, _>>();
                assert_eq!(
                    params.get("client_id").map(AsRef::as_ref),
                    Some("admin-fixture")
                );
                let mut callback = url::Url::parse(&params["redirect_uri"]).expect("redirect");
                callback
                    .query_pairs_mut()
                    .append_pair("state", &params["state"])
                    .append_pair("code", "fixture-code");
                let mut socket =
                    std::net::TcpStream::connect(("127.0.0.1", callback.port().expect("port")))
                        .expect("callback");
                write!(
                    socket,
                    "GET {}?{} HTTP/1.1\r\nHost: localhost\r\n\r\n",
                    callback.path(),
                    callback.query().expect("query")
                )
                .expect("request");
                callback_socket = Some(socket);
                Ok(())
            })
            .expect("interactive login");
        drop(callback_socket);
        assert!(matches!(session.handle(Command::Restore), Ok(Reply::Ready)));
        let reply = session.handle(Command::Logout).expect("logout");
        match (revoke_status, reply) {
            (200, Reply::LoggedOut) => {}
            (503, Reply::LogoutFailed(Error::Offline)) => {
                let mut state = crate::state::State::new(true, crate::state::Screen::Users);
                state.logout_failed(Error::Offline);
                assert!(!state.signed_in && state.users.is_empty() && !state.busy);
                assert!(state.message.contains("No se confirmó la revocación"));
            }
            _ => panic!("logout must report the actual revocation outcome"),
        }
        assert!(session.account.identity().is_none());
        let requests = server.finish_observed();
        assert_eq!(requests.len(), 4);
        assert!(requests[3].contains("token=synthetic-new-refresh"));
        drop(session);
        let store = Store::open(&root, "admin-fixture-v2").expect("synthetic Store");
        assert!(matches!(
            store.read::<serde_json::Value>("account"),
            Ok(Stored::Missing)
        ));
        drop(store);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
