use super::*;

fn devices() -> Devices {
    Devices {
        legacy: "test-legacy".into(),
        installation: "test-installation".into(),
    }
}

fn start_profile_core(
    root: &std::path::Path,
    candidate: &Candidate,
    keys: &str,
) -> (host::Host, CoreLink) {
    let mut owner = crate::rights::Owner::open(
        &root.join("core"),
        Some(keys),
        devices(),
        90,
        crate::rights::wall_now(),
    )
    .expect("owner");
    owner
        .install(
            serde_json::to_string(&candidate.credential).expect("credential"),
            crate::rights::wall_now(),
            Duration::ZERO,
        )
        .expect("verified durable binding");
    drop(owner);
    let photo = format!("profile-{}", vantare_services::random_id().expect("pipe"));
    let nonce = vantare_services::random_id().expect("nonce");
    let pid = std::process::id();
    let core = host::Host::start(
        &photo,
        host::Options {
            root: root.join("core"),
            keys: Some(keys.into()),
            devices: devices(),
            epoch: 91,
            nonce: Some(nonce.clone()),
        },
        move |peer, _| peer.pid == pid,
    )
    .expect("real core host");
    let link = CoreLink {
        pipe: control::pipe_name(&photo),
        image: std::env::current_exe().expect("image"),
        nonce,
    };
    (core, link)
}

fn restored_profile_app(
    root: PathBuf,
    server: &vantare_services::test_http::Server,
) -> vantare_services::app::App {
    let base = server.base.clone();
    let config = vantare_services::config::BuildConfig {
        supabase: Some(base.clone()),
        anon_key: None,
        license_keys: None,
        channel: Some("nightly"),
        native_oauth: Some(vantare_services::config::OAuthBuild {
            issuer: base.clone(),
            client_id: "public-fixture".into(),
            redirect_uri: "http://127.0.0.1:0/callback".parse().expect("redirect"),
        }),
    };
    let context = format!("v1|{base}|public-fixture|nightly|{base}");
    let store = Store::open(&root, &context).expect("session store");
    store.save("oauth-metadata", &serde_json::json!({"issuer":base,"client_id":"public-fixture","redirect":"http://127.0.0.1:0/callback","authorization":base.join("authorize").expect("url"),"token":base.join("token").expect("url"),"userinfo":base.join("userinfo").expect("url")})).expect("fixture metadata");
    store.save("account", &serde_json::json!({"state":"SignedIn","version":1,"session":{"identity":{"issuer":base,"subject":"user_fixture"},"client_id":"public-fixture","access":"fixture-access","refresh":"fixture-refresh","expires_at":900}})).expect("fixture session");
    drop(store);
    vantare_services::app::App::with_clock(config, root, || Ok(1000))
}

fn assert_pro_expires_at_deadline(
    root: &std::path::Path,
    keys: &str,
    deadline: chrono::DateTime<chrono::Utc>,
) {
    // The original signature still expires exactly at its paid deadline.
    let mut owner =
        crate::rights::Owner::open(&root.join("core"), Some(keys), devices(), 92, deadline)
            .expect("restore at signed deadline");
    let expired = owner
        .advance(
            &vantare_domain::Snapshot::default(),
            deadline,
            Duration::ZERO,
        )
        .expect("injected deadline");
    // A valid v1 credential still permits the Free overlay catalog; only its
    // expiring Pro grant must disappear. overlays_advanced is not the plan.
    assert_eq!(expired.catalog, control::CatalogAccess::Free);
}

#[test]
fn missing_profile_oauth_rejection_preserves_real_binding_and_scheduled_renewal() {
    let server = vantare_services::test_http::Server::start_observed(vec![(
        400,
        r#"{"error":"invalid_grant"}"#.into(),
    )]);
    let base = server.base.clone();
    // Enabling test-support alone never changes the default HTTP guard.
    assert!(matches!(
        vantare_services::http::Http::default().get(&base, None, None),
        Err(vantare_services::Error::Unconfigured)
    ));
    let root = std::env::temp_dir().join(format!(
        "vt-profile-{}",
        vantare_services::random_id().expect("fixture")
    ));
    let (candidate, keys) =
        candidate_with_grant(chrono::TimeDelta::minutes(30), "vantare.plan.pro");
    let deadline = chrono::DateTime::parse_from_rfc3339(
        &candidate.credential.claims.capabilities[0].paid_through,
    )
    .expect("deadline")
    .to_utc();
    let (core, link) = start_profile_core(&root, &candidate, &keys);
    let before = control::request(&link, control::Command::Read).expect("verified rights");
    assert!(before.overlays_advanced);
    assert_eq!(before.catalog, control::CatalogAccess::Pro);

    let mut app = restored_profile_app(root.join("services"), &server);
    app.attach_core(link.clone());
    app.enable_loopback_for_test();
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let mut state = State::default();
    // Hub confirms the restored account before chaining its missing-profile read.
    assert!(matches!(
        handle_with(&mut state, Command::AccountPoll, &signing, |_, command| app
            .handle(command)),
        Reply::Account {
            signed_in: true,
            profile: None,
            error: None,
            ..
        }
    ));
    let reply = handle_with(
        &mut state,
        Command::AccountProfileRefresh,
        &signing,
        |_, command| vantare_services::host::fixture_request(&mut app, command),
    );
    assert!(matches!(
        reply,
        Reply::Account {
            signed_in: true,
            profile: None,
            error: Some(_),
            ..
        }
    ));
    let requests = server.finish_observed();
    assert_eq!(requests.len(), 1, "exactly one rejected refresh, no replay");
    assert!(requests[0].starts_with("POST /token "));
    let after =
        control::request(&link, control::Command::Read).expect("rights after profile failure");
    assert!(after.overlays_advanced);
    assert_eq!(after.catalog, control::CatalogAccess::Pro);
    assert_eq!(
        after.valid_until_ms, before.valid_until_ms,
        "profile grants no new TTL"
    );
    let tick = Instant::now();
    let mut attempts = 0;
    let wall = after.checked_at_ms;
    assert!(
        run_renewal(&mut state, &after, wall, tick, |_, command| {
            assert!(matches!(command, Command::LicenseRenewAutomatic));
            attempts += 1;
            Reply::LicenseFailure {
                outcome: protocol::RenewalOutcome::Transient,
                message: String::new(),
            }
        })
        .is_some()
    );
    assert!(
        run_renewal(
            &mut state,
            &after,
            wall,
            tick + Duration::from_secs(59),
            |_, _| panic!("retry floor")
        )
        .is_none()
    );
    assert_eq!(attempts, 1);
    drop(app);
    drop(core);
    assert_pro_expires_at_deadline(&root, &keys, deadline);
    std::fs::remove_dir_all(root).expect("private fixtures only");
}
