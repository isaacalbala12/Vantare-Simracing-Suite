use super::*;

#[test]
fn missing_profile_failure_preserves_real_binding_and_scheduled_renewal() {
    // Cross-crate services is built without cfg(test): loopback HTTP is rejected
    // before networking. services::app tests exercise actual invalid_grant/401/403
    // via host::session; this fixture checks the real signed core and scheduler
    // after a presentation failure, with no production backend or TLS bypass.
    let mut config = vantare_services::config::BuildConfig::load();
    config.supabase = Some("http://127.0.0.1:9/".parse().expect("fixture URL"));
    let base = config.supabase.expect("fixture URL");
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
    let devices = || Devices {
        legacy: "test-legacy".into(),
        installation: "test-installation".into(),
    };
    let mut owner = crate::rights::Owner::open(
        &root.join("core"),
        Some(&keys),
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
            keys: Some(keys.clone()),
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
    let before = control::request(&link, control::Command::Read).expect("verified rights");
    assert!(before.overlays_advanced);
    assert_eq!(before.catalog, control::CatalogAccess::Pro);

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
    let store = Store::open(&root.join("services"), &context).expect("session store");
    store.save("oauth-metadata", &serde_json::json!({"issuer":base,"client_id":"public-fixture","redirect":"http://127.0.0.1:0/callback","authorization":base.join("authorize").expect("url"),"token":base.join("token").expect("url"),"userinfo":base.join("userinfo").expect("url")})).expect("fixture metadata");
    store.save("account", &serde_json::json!({"state":"SignedIn","version":1,"session":{"identity":{"issuer":base,"subject":"user_fixture"},"client_id":"public-fixture","access":"fixture-access","refresh":"fixture-refresh","expires_at":900}})).expect("fixture session");
    drop(store);
    let mut app =
        vantare_services::app::App::with_clock(config, root.join("services"), || Ok(1000));
    app.attach_core(link.clone());
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
        |_, command| app.handle(command),
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
    // The original signature still expires exactly at its paid deadline.
    let mut owner =
        crate::rights::Owner::open(&root.join("core"), Some(&keys), devices(), 92, deadline)
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
    drop(owner);
    std::fs::remove_dir_all(root).expect("private fixtures only");
}
