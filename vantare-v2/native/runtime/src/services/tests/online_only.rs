//! Lost ACK with a real core, HTTP observation and injected scheduler clocks.
use super::*;
use vantare_ipc::transport::Listener;
use vantare_services::{app::App, config::BuildConfig, storage::Store, test_http::Server};

#[test]
fn lost_durable_ack_retries_one_http_after_minute_without_a_disk_handoff() {
    let root = std::env::temp_dir().join(format!(
        "vt-p8-{}",
        vantare_services::random_id().expect("id")
    ));
    let device = vantare_services::license::installation::legacy_fingerprint().expect("device");
    let (signed, keys) =
        signed_grant_for_device(chrono::TimeDelta::days(30), "vantare.plan.pro", &device);
    let response =
        serde_json::json!({"credential":signed.credential,"online_capabilities":[]}).to_string();
    let server = Server::start_observed(vec![(200, response.clone()), (200, response)]);
    let (core, real) = start_core(&root, &keys, &device);
    let initial = control::request(&real, control::Command::Read).expect("core read");
    assert!(!initial.state.permits_access());
    let (proxy_link, proxy) = lossy_proxy(real.clone());
    let app_root = root.join("services");
    let base = server.base.clone();
    seed_account(&app_root, &server);
    let keys: &'static str = Box::leak(keys.into_boxed_str());
    let config = || BuildConfig {
        supabase: Some(base.clone()),
        anon_key: Some("public-test"),
        license_keys: Some(keys),
        channel: Some("test"),
        native_oauth: Some(vantare_services::config::OAuthBuild {
            issuer: base.clone(),
            client_id: "fixture".into(),
            redirect_uri: "http://127.0.0.1:0/callback".parse().expect("redirect"),
        }),
    };
    let mut app = App::with_clock(config(), app_root.clone(), || Ok(100));
    app.enable_loopback_for_test();
    app.attach_core(proxy_link.clone());
    assert!(matches!(
        app.handle(Command::AccountPoll),
        Reply::Account {
            session: protocol::Session::SignedIn,
            ..
        }
    ));
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let now = Instant::now();
    let first = run_renewal(
        &mut state,
        &initial,
        initial.checked_at_ms,
        now,
        |_, command| app.handle(command),
    )
    .expect("first attempt");
    assert!(matches!(
        first,
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Transient,
            ..
        }
    ));
    assert!(
        server
            .requests
            .recv()
            .expect("first HTTP")
            .starts_with("POST /functions/v1/native-license ")
    );
    assert!(server.requests.try_recv().is_err());
    drop(app); // Restart cannot recover any services-side credential.
    app = App::with_clock(config(), app_root.clone(), || Ok(160));
    app.enable_loopback_for_test();
    app.attach_core(proxy_link);
    for seconds in [0, 1, 30, 59] {
        let policy = control::request(&real, control::Command::Read)
            .expect("durable binding after lost ACK");
        assert!(policy.state.permits_access());
        assert!(
            run_renewal(
                &mut state,
                &policy,
                policy.checked_at_ms,
                now + Duration::from_secs(seconds),
                |_, _| panic!("minute floor must prevent HTTP")
            )
            .is_none()
        );
    }
    let policy = control::request(&real, control::Command::Read).expect("policy");
    assert!(
        matches!(run_renewal(&mut state, &policy, policy.checked_at_ms, now + Duration::from_mins(1), |_, command| app.handle(command)), Some(Reply::License { policy, .. }) if policy.state.permits_access())
    );
    proxy
        .join()
        .expect("lost ACK then confirmed fresh emission");
    assert_eq!(server.finish_observed().len(), 1, "one HTTP on recovery");
    assert_no_license_copy(&app_root, base.as_str());
    drop(app);
    drop(core);
    std::fs::remove_dir_all(root).expect("private fixture cleanup");
}

fn lossy_proxy(real: CoreLink) -> (CoreLink, std::thread::JoinHandle<()>) {
    let proxy_pipe = format!("p8-proxy-{}", vantare_services::random_id().expect("pipe"));
    let proxy_link = CoreLink {
        pipe: proxy_pipe.clone(),
        image: real.image.clone(),
        nonce: real.nonce.clone(),
    };
    let stop = Arc::new(Event::new().expect("stop"));
    let mut listener = Listener::new(&proxy_pipe, stop, Duration::from_secs(5)).expect("proxy");
    let first = listener.instance().expect("first instance");
    let forwarding = real;
    let proxy = std::thread::spawn(move || {
        let mut first = Some(first);
        for lose_ack in [true, false] {
            let mut pipe = first
                .take()
                .unwrap_or_else(|| listener.instance().expect("instance"));
            pipe.accept().expect("connect");
            let request: control::Request = control::read(&mut pipe).expect("request");
            assert_eq!(request.nonce, forwarding.nonce);
            assert!(
                matches!(request.command, control::Command::InstallOnline { .. }),
                "only fresh HTTP provenance"
            );
            let policy = control::request(&forwarding, request.command).expect("real durable ACK");
            assert!(policy.state.permits_access());
            if !lose_ack {
                control::write(
                    &mut pipe,
                    &control::Response {
                        version: control::VERSION,
                        sequence: request.sequence,
                        policy,
                        error: None,
                    },
                )
                .expect("ACK");
            }
        }
    });
    (proxy_link, proxy)
}

fn seed_account(app_root: &std::path::Path, server: &Server) {
    let base = &server.base;
    let context = format!("v1|{base}|fixture|test|{base}");
    let store = Store::open(app_root, &context).expect("account fixture");
    store.save("oauth-metadata", &serde_json::json!({"issuer":base,"client_id":"fixture","redirect":"http://127.0.0.1:0/callback",
        "authorization":base.join("authorize").expect("url"),"token":base.join("token").expect("url"),"userinfo":base.join("userinfo").expect("url")})).expect("metadata");
    store.save("account", &serde_json::json!({"state":"SignedIn","version":1,"session":{"identity":{"issuer":base,"subject":"fixture-user"},
        "client_id":"fixture","access":"fixture-access","refresh":"fixture-refresh","expires_at":1000}})).expect("account");
    drop(store);
}

fn start_core(root: &std::path::Path, keys: &str, device: &str) -> (host::Host, CoreLink) {
    let photo = format!("p8-{}", vantare_services::random_id().expect("pipe"));
    let nonce = vantare_services::random_id().expect("nonce");
    let pid = std::process::id();
    let core = host::Host::start(
        &photo,
        host::Options {
            root: root.join("core"),
            keys: Some(keys.into()),
            devices: Devices {
                legacy: device.into(),
            },
            epoch: 1,
            nonce: Some(nonce.clone()),
        },
        move |peer, _| peer.pid == pid,
    )
    .expect("real core");
    let real = CoreLink {
        pipe: control::pipe_name(&photo),
        image: std::env::current_exe().expect("image"),
        nonce,
    };
    (core, real)
}

fn assert_no_license_copy(app_root: &std::path::Path, base: &str) {
    let legacy_context = format!("license-v1|{base}|test");
    let legacy = Store::open(app_root, &legacy_context).expect("old namespace");
    for name in ["license-candidate", "license-transfer-pending"] {
        assert!(matches!(
            legacy.load::<serde_json::Value>(name),
            Err(vantare_services::Error::NotFound)
        ));
    }
    drop(legacy);
}
