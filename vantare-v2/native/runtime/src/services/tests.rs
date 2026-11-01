use super::*;
use crate::rights::{Devices, host};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use vantare_services::{
    license::{Capability, ClaimsV1, CredentialV1},
    license_remote::Candidate,
    storage::Store,
};

#[path = "tests/profile.rs"]
mod profile;

#[test]
fn future_boundary_never_dispatches_an_automatic_http_attempt() {
    let now = Instant::now();
    for purchase in [false, true] {
        let mut state = State::default();
        state.renewal.observe(&confirmed_session());
        if purchase {
            state.purchase_until = Some(now + Duration::from_mins(10));
        }
        for wall in [1000, 5000, 10_000] {
            let policy = control::Policy {
                version: control::VERSION,
                revision: 1,
                checked_at_ms: wall,
                state: control::AccessState::ClockBehind { until_ms: 10_000 },
                ..control::Policy::default()
            };
            assert!(
                run_renewal(&mut state, &policy, wall, now, |_, _| panic!(
                    "no helper or HTTP while the frontier is pending"
                ))
                .is_none()
            );
        }
    }
}

#[test]
fn incompatible_transfer_stays_transient_and_keeps_the_actionable_version_message() {
    assert_eq!(
        admit_transfer(&Err(ConnectionError::Version)),
        Err(vantare_ipc::INCOMPATIBLE_COMPONENTS)
    );
    assert_eq!(
        renewal_outcome(&failure(vantare_ipc::INCOMPATIBLE_COMPONENTS)),
        protocol::RenewalOutcome::Transient
    );
}

#[test]
fn a_closed_idle_helper_is_replaced_before_the_first_user_request() {
    let Fixture {
        root,
        photo: _,
        link,
        core,
        services,
    } = Fixture::with_license(false);
    let options = Options {
        binary: link
            .image
            .parent()
            .expect("deps")
            .parent()
            .expect("debug")
            .join("vantare-services.exe"),
        hub: link.image.clone(),
        core: link.clone(),
        root: Some(root.join("services")),
    };
    // Exercise the real command handler and child synchronously. The old
    // Session wrapper added a 5 s read deadline around a real helper startup;
    // this test checks replacement, not the time the OS gives each process.
    // Other Session tests cover the authenticated Hub/supervisor wire.
    services.state.lock().expect("active session").connected = true;
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let request = |command| {
        handle(
            &mut services.state.lock().expect("supervisor state"),
            &options,
            command,
            &services.cancellation,
            &signing,
            &services.stop,
        )
    };
    assert!(matches!(request(Command::Status), Reply::Status { .. }));
    let closed_name = format!(
        "closed-helper-{}",
        vantare_services::random_id().expect("pipe")
    );
    let closed_stop = Arc::new(Event::new().expect("closed peer cancellation"));
    let mut listener = vantare_ipc::transport::Listener::new(
        &closed_name,
        Arc::clone(&closed_stop),
        vantare_ipc::transport::IO_TIMEOUT,
    )
    .expect("closed peer fixture");
    let mut peer = listener.instance().expect("bound peer");
    let (closed, closure) = std::sync::mpsc::channel();
    let peer_thread = std::thread::spawn(move || {
        peer.accept().expect("fixture connected");
        drop(peer);
        closed.send(()).expect("peer close signalled");
    });
    let disconnected = vantare_ipc::transport::connect(
        &closed_name,
        closed_stop,
        vantare_ipc::transport::IO_TIMEOUT,
    )
    .expect("fixture client");
    closure
        .recv()
        .expect("the peer is closed before the request");
    peer_thread.join().expect("closed peer fixture finished");
    let (previous_pid, original_pipe) = {
        let mut state = services.state.lock().expect("supervisor state");
        let client = state.client.as_mut().expect("real helper");
        assert!(client.is_running());
        let pid = client.pid();
        // Keep its authenticated original pipe open: the old child cannot exit
        // merely because this fixture schedules slowly. Only its transport in
        // supervisor state is broken. A liveness-only check must not pass.
        let original = client.replace_transport_for_test(disconnected);
        assert!(
            client.is_running(),
            "a live child still needs a channel probe"
        );
        (pid, original)
    };
    assert!(
        matches!(request(Command::Status), Reply::Status { .. }),
        "the first action reconnects transparently"
    );
    assert_ne!(
        services
            .state
            .lock()
            .expect("state")
            .client
            .as_ref()
            .expect("replacement")
            .pid(),
        previous_pid
    );
    assert!(
        !control::request(&link, control::Command::Read)
            .expect("core")
            .state
            .permits_access(),
        "reconnection cannot grant rights"
    );
    drop(original_pipe);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private fixture cleanup");
}

#[derive(serde::Serialize)]
struct Payload<'a> {
    version: u8,
    algorithm: &'a str,
    key_id: &'a str,
    claims: &'a ClaimsV1,
}

fn candidate_with_grant(validity: chrono::TimeDelta, grant: &str) -> (Candidate, String) {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("entropía test");
    let key = SigningKey::from_bytes(&seed);
    let now = crate::rights::wall_now();
    let claims = ClaimsV1 {
        issuer: "vantare-license".into(),
        subject: "550e8400-e29b-41d4-a716-446655440000".into(),
        device_fingerprint: "test-legacy".into(),
        issued_at: (now - chrono::TimeDelta::seconds(10)).to_rfc3339(),
        capabilities: vec![Capability {
            key: grant.into(),
            paid_through: (now + validity).to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        }],
    };
    let bytes = serde_json::to_vec(&Payload {
        version: 1,
        algorithm: "Ed25519",
        key_id: "test",
        claims: &claims,
    })
    .expect("payload Go v1");
    let credential = CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: "test".into(),
        claims,
        signature: URL_SAFE_NO_PAD.encode(key.sign(&bytes).to_bytes()),
    };
    (
        Candidate {
            account_id: credential.claims.subject.clone(),
            device: "test-legacy".into(),
            credential,
        },
        format!(
            "test:{}",
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        ),
    )
}
struct Session {
    pipe: Pipe,
    nonce: String,
    sequence: u64,
}
impl Session {
    fn open(photo: &str) -> Self {
        let stop = Arc::new(Event::new().expect("event"));
        let mut pipe = control::connect_ready(&pipe_name(photo), &stop, Duration::from_secs(5))
            .expect("pipe supervisor");
        let hello: SupervisorHello = protocol::read(&mut pipe).expect("saludo");
        assert_eq!(hello.version, protocol::VERSION);
        Self {
            pipe,
            nonce: hello.nonce,
            sequence: 0,
        }
    }
    fn request(&mut self, command: Command) -> Reply {
        self.sequence += 1;
        protocol::write(
            &mut self.pipe,
            &Request {
                version: protocol::VERSION,
                sequence: self.sequence,
                nonce: self.nonce.clone(),
                command,
            },
        )
        .expect("petición");
        let response: Response = protocol::read(&mut self.pipe).expect("respuesta");
        assert_eq!(response.sequence, self.sequence);
        response.reply
    }
}
struct Fixture {
    root: PathBuf,
    photo: String,
    link: CoreLink,
    core: host::Host,
    services: Host,
}
impl Fixture {
    fn new() -> Self {
        Self::with_license(true)
    }
    fn with_license(licensed: bool) -> Self {
        Self::with_validity(licensed, chrono::TimeDelta::minutes(10))
    }
    fn with_validity(licensed: bool, validity: chrono::TimeDelta) -> Self {
        Self::with_grant(licensed, validity, "vantare.plan.pro")
    }
    fn with_grant(licensed: bool, validity: chrono::TimeDelta, grant: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "vt-svc-{}",
            vantare_services::random_id().expect("root")
        ));
        let photo = format!(
            "vantare-managed-{}",
            vantare_services::random_id().expect("pipe")
        );
        let image = std::env::current_exe().expect("imagen test");
        let binary = image
            .parent()
            .expect("deps")
            .parent()
            .expect("debug")
            .join("vantare-services.exe");
        assert!(
            binary.is_file(),
            "cargo test --workspace compila el binario services para sus tests de proceso"
        );
        let (candidate, keys) = candidate_with_grant(validity, grant);
        let service_root = root.join("services");
        // Solo una credencial de test generada; ninguna sesión ni valores reales.
        // Comparte únicamente el namespace público compilado del helper;
        // ninguna URL se solicita, ni clave/bearer del build se usa en la fixture.
        let config = vantare_services::config::BuildConfig::load();
        let base = config.supabase.as_ref().map(ToString::to_string);
        let store = Store::open(
            &service_root,
            &vantare_services::license_remote::candidate_context(base.as_deref(), config.channel),
        )
        .expect("store");
        if licensed {
            // This process fixture uses an ephemeral core keyring. Seed its
            // genuinely verified durable binding, rather than asking the helper's
            // independently compiled production ring to accept a test candidate.
            // Candidate verification/transfer is covered with aligned rings in
            // services::app tests; no real production signing key is available.
            let mut owner = crate::rights::Owner::open(
                &root.join("core"),
                Some(&keys),
                Devices {
                    legacy: "test-legacy".into(),
                    installation: "test-installation".into(),
                },
                90,
                crate::rights::wall_now(),
            )
            .expect("ephemeral core owner");
            owner
                .install(
                    serde_json::to_string(&candidate.credential).expect("signed candidate"),
                    crate::rights::wall_now(),
                    Duration::ZERO,
                )
                .expect("real signature and durable binding");
        }
        drop(store);
        let nonce = vantare_services::random_id().expect("bootstrap");
        let pid = std::process::id();
        let helper_image = binary.clone();
        let core = host::Host::start(
            &photo,
            host::Options {
                root: root.join("core"),
                keys: Some(keys),
                devices: Devices {
                    legacy: "test-legacy".into(),
                    installation: "test-installation".into(),
                },
                epoch: 91,
                nonce: Some(nonce.clone()),
            },
            move |peer, mutate| {
                if mutate {
                    peer.is_image(&helper_image)
                } else {
                    peer.pid == pid || peer.is_image(&helper_image)
                }
            },
        )
        .expect("núcleo");
        let link = CoreLink {
            pipe: control::pipe_name(&photo),
            image: image.clone(),
            nonce,
        };
        let services = Host::start(
            &photo,
            Options {
                binary,
                hub: image,
                core: link.clone(),
                root: Some(service_root),
            },
        )
        .expect("supervisor");
        Self {
            root,
            photo,
            link,
            core,
            services,
        }
    }
}

#[test]
fn real_helper_is_on_demand_hands_off_before_game_reaps_and_never_reactivates_after_logout() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::new();
    assert!(services.state.lock().expect("state").client.is_none());
    let mut hub = Session::open(&photo);
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "saludo no arranca helper"
    );
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    assert!(services.state.lock().expect("state").client.is_some());
    let paid = control::request(&link, control::Command::Read).expect("policy");
    assert!(
        paid.current()
            && paid.state.permits_access()
            && !paid.engineer
            && !paid.strategy
            && !paid.analysis
            && !paid.calendar,
        "política saneada: {paid:?}; namespaces de fixture: {}",
        std::fs::read_dir(root.join("services"))
            .expect("fixture")
            .count()
    );
    let mut snapshot = vantare_domain::Snapshot::default();
    snapshot.origin.source.kind = vantare_domain::SourceKind::Live;
    snapshot.state.source_state = vantare_domain::SourceState::Live;
    snapshot.state.session.id = vantare_domain::SessionId(91);
    core.publish(Arc::new(snapshot.clone()));
    assert!(matches!(
        hub.request(Command::RoadmapCached),
        Reply::Error { .. }
    ));
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "helper cerrado y reaped"
    );
    assert!(
        control::request(&link, control::Command::Read)
            .expect("sin helper")
            .state
            .permits_access()
    );
    snapshot.state.source_state = vantare_domain::SourceState::Waiting;
    core.publish(Arc::new(snapshot));
    assert!(matches!(
        hub.request(Command::Logout),
        Reply::Account {
            signed_in: false,
            ..
        }
    ));
    assert!(
        !control::request(&link, control::Command::Read)
            .expect("revocado")
            .state
            .permits_access()
    );
    assert!(matches!(hub.request(Command::Shutdown), Reply::Closed));
    assert!(
        !control::request(&link, control::Command::Read)
            .expect("sin reactivación")
            .state
            .permits_access()
    );
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("limpiar solo carpeta aleatoria del test");
}

#[test]
fn game_closes_services_only_with_a_saved_license_and_no_sign_in_in_progress() {
    let licensed = control::Policy {
        live: true,
        state: vantare_ipc::control::AccessState::Active,
        ..control::Policy::default()
    };
    assert!(closes_for_game(&licensed, false));
    assert!(!closes_for_game(&licensed, true), "acceso a medias");
    for policy in [
        control::Policy {
            state: vantare_ipc::control::AccessState::NoCredential,
            ..licensed.clone()
        },
        control::Policy {
            live: false,
            ..licensed
        },
    ] {
        assert!(!closes_for_game(&policy, false));
    }
    let slot: SigningIn = Arc::new(Mutex::new(None));
    assert!(!signing_in(&slot));
    set_signing_in(&slot, true);
    assert!(signing_in(&slot));
    set_signing_in(&slot, false);
    assert!(!signing_in(&slot));
    *slot.lock().expect("slot") = Some(Instant::now());
    assert!(!signing_in(&slot), "la ventana de acceso caduca");
}

#[test]
fn without_a_license_the_hub_can_still_sign_in_during_a_live_session() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::with_license(false);
    let mut snapshot = vantare_domain::Snapshot::default();
    snapshot.origin.source.kind = vantare_domain::SourceKind::Live;
    snapshot.state.source_state = vantare_domain::SourceState::Live;
    snapshot.state.session.id = vantare_domain::SessionId(91);
    core.publish(Arc::new(snapshot));
    let policy = control::request(&link, control::Command::Read).expect("policy");
    assert!(policy.live && !policy.state.permits_access());
    let mut hub = Session::open(&photo);
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    assert!(
        services.state.lock().expect("state").client.is_some(),
        "garaje/pista sin licencia no cierra los servicios"
    );
    assert!(matches!(hub.request(Command::Shutdown), Reply::Closed));
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("limpiar solo carpeta aleatoria del test");
}

#[test]
fn live_cached_access_metadata_and_policy_survive_services_shutdown() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::new();
    let mut hub = Session::open(&photo);
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    let mut snapshot = vantare_domain::Snapshot::default();
    snapshot.origin.source.kind = vantare_domain::SourceKind::Live;
    snapshot.state.source_state = vantare_domain::SourceState::Live;
    snapshot.state.session.id = vantare_domain::SessionId(91);
    core.publish(Arc::new(snapshot));
    assert!(matches!(
        hub.request(Command::RoadmapCached),
        Reply::Error { .. }
    ));
    assert!(services.state.lock().expect("state").client.is_none());
    let policy = control::request(&link, control::Command::Read).expect("policy");
    assert!(policy.current() && policy.state.permits_access());
    let Reply::License { policy: read, .. } = hub.request(Command::LicenseStatus) else {
        panic!("cached rights must remain readable in game")
    };
    assert!(read.current() && read.state.permits_access());
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "policy heartbeat must not restart the helper or reinstall the candidate"
    );
    assert!(
        matches!(hub.request(Command::Status), Reply::Status { .. }),
        "startup must be able to discover the saved account"
    );
    assert!(matches!(hub.request(Command::Shutdown), Reply::Closed));
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("cleanup fixture");
}

#[test]
fn heartbeat_delivers_definitive_revocation_instead_of_a_transient_error() {
    let Fixture {
        root,
        photo,
        link: _,
        core,
        services,
    } = Fixture::new();
    let mut hub = Session::open(&photo);
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    assert!(
        matches!(hub.request(Command::LicenseStatus), Reply::License { policy, .. } if policy.state.permits_access())
    );
    assert!(matches!(
        hub.request(Command::Logout),
        Reply::Account {
            signed_in: false,
            ..
        }
    ));
    let Reply::License { policy, .. } = hub.request(Command::LicenseStatus) else {
        panic!("el Hub necesita el resultado definitivo, no un error de transporte");
    };
    assert!(!policy.state.permits_access());
    assert!(policy.error.is_some());
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("cleanup fixture");
}

#[test]
fn game_exit_rechecks_access_started_after_the_live_decision() {
    let state = Mutex::new(State::default());
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let event = Arc::new(Event::new().expect("event"));
    let cancellation: Cancellation = Arc::new(Mutex::new(Some(Arc::clone(&event))));
    let policy = control::Policy {
        live: true,
        state: vantare_ipc::control::AccessState::Active,
        ..control::Policy::default()
    };
    assert!(closes_for_game(&policy, signing_in(&signing)));
    // Exact interleaving: timer has read live/idle, then AccountBegin or
    // LicenseRenew takes the supervisor state and marks access in progress.
    set_signing_in(&signing, true);
    assert!(!finish_for_game(&state, &cancellation, &signing));
    assert!(cancellation.lock().expect("slot").is_some());
    assert!(!event.is_set());
    // Once the protected operation ends, normal game shutdown remains enabled.
    set_signing_in(&signing, false);
    assert!(finish_for_game(&state, &cancellation, &signing));
    assert!(cancellation.lock().expect("slot").is_none());
}

#[test]
fn game_exit_does_not_cancel_an_access_request_holding_the_supervisor() {
    let state = Mutex::new(State::default());
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let event = Arc::new(Event::new().expect("event"));
    let cancellation: Cancellation = Arc::new(Mutex::new(Some(Arc::clone(&event))));
    set_signing_in(&signing, true);
    let guard = state.lock().expect("access request in flight");
    assert!(!finish_for_game(&state, &cancellation, &signing));
    assert!(
        !event.is_set(),
        "access I/O must not be cancelled by the game timer"
    );
    assert!(cancellation.lock().expect("slot").is_some());
    drop(guard);
}

#[test]
fn game_exit_still_cancels_unprotected_io_before_waiting_for_the_supervisor() {
    let state = Arc::new(Mutex::new(State::default()));
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let event = Arc::new(Event::new().expect("event"));
    let cancellation: Cancellation = Arc::new(Mutex::new(Some(Arc::clone(&event))));
    let guard = state.lock().expect("remote request in flight");
    let worker_state = Arc::clone(&state);
    let worker = thread::spawn(move || finish_for_game(&worker_state, &cancellation, &signing));
    // A bounded event wait verifies actual cancellation; no sleeps or scheduler assumptions.
    let cancelled = event.wait(Duration::from_secs(5));
    drop(guard);
    assert!(worker.join().expect("game closer"));
    assert!(
        cancelled,
        "unprotected remote I/O must still be interrupted"
    );
}

fn confirmed_session() -> Reply {
    let now = u64::try_from(crate::rights::wall_now().timestamp()).expect("fixture clock");
    Reply::Account {
        session: vantare_ipc::services_protocol::Session::SignedIn,
        signed_in: true,
        pending: false,
        expires_at: Some(now.saturating_add(3600)),
        error: None,
        profile: None,
        copy_link: false,
        message: String::new(),
    }
}

#[test]
fn hub_automatic_requests_obey_live_window_and_explicit_purchase_origin() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::with_validity(true, chrono::TimeDelta::hours(10));
    let mut snapshot = vantare_domain::Snapshot::default();
    snapshot.origin.source.kind = vantare_domain::SourceKind::Live;
    snapshot.state.source_state = vantare_domain::SourceState::Live;
    snapshot.state.session.id = vantare_domain::SessionId(91);
    core.publish(Arc::new(snapshot));
    let mut hub = Session::open(&photo);
    {
        let mut state = services.state.lock().expect("state");
        state.renewal.observe(&confirmed_session());
        state.core_retry_at = Some(Instant::now() + Duration::from_hours(1));
        state.renewal.completed(protocol::RenewalOutcome::Transient);
        state.renewal.attempted(
            Instant::now()
                .checked_sub(Duration::from_mins(15))
                .expect("injected prior attempt"),
        );
    }
    assert!(matches!(
        hub.request(Command::LicenseRenewAutomatic),
        Reply::License { .. }
    ));
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "serve must not admit a normal automatic helper with ten hours left"
    );
    {
        let signing: SigningIn = Arc::new(Mutex::new(None));
        handle_with(
            &mut services.state.lock().expect("state"),
            Command::Purchase {
                product: protocol::BillingProduct::ProMonthly,
            },
            &signing,
            |_, _| Reply::Checkout {
                url: "https://billing.invalid/fixture".into(),
            },
        );
    }
    assert!(
        matches!(
            hub.request(Command::LicenseRenewAutomatic),
            Reply::LicenseFailure {
                outcome: protocol::RenewalOutcome::Transient,
                ..
            }
        ),
        "the explicit purchase origin permits a fixture helper to answer even outside urgency"
    );
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "live helper is closed after the request"
    );
    services.state.lock().expect("state").purchase_until = Some(Instant::now());
    assert!(matches!(
        hub.request(Command::LicenseRenewAutomatic),
        Reply::License { .. }
    ));
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "expired purchase window cannot admit a helper"
    );
    assert!(
        control::request(&link, control::Command::Read)
            .expect("rights")
            .state
            .permits_access()
    );
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private fixture cleanup");
}

#[test]
fn both_renewal_paths_use_the_ack_clock_and_accept_verified_short_runway() {
    let wall = 10_000_000;
    let now = Instant::now();
    let initial = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: wall,
        state: vantare_ipc::control::AccessState::NoCredential,
        ..control::Policy::default()
    };
    // The wall clock moved backwards by three seconds during HTTP. The ACK
    // is still fresh at the core's effective clock and grants a full new day.
    let good = control::Policy {
        state: vantare_ipc::control::AccessState::Active,
        checked_at_ms: wall - 3000,
        signed_until_ms: Some(wall + 24 * 60 * 60_000),
        ..initial.clone()
    };
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    assert!(
        run_renewal(&mut state, &initial, wall, now, |_, _| Reply::License {
            policy: good.clone(),
            message: String::new()
        })
        .is_some()
    );
    assert_eq!(
        state
            .renewal
            .claim(&good, good.checked_at_ms, now + Duration::from_mins(1)),
        Err(renewal::Skip::NotDue),
        "a good ACK must clear transport failures despite clock rollback"
    );
    let near = control::Policy {
        signed_until_ms: Some(wall + 10 * 60_000),
        checked_at_ms: wall,
        ..good
    };
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let after = Instant::now() + Duration::from_mins(2);
    handle_with(
        &mut state,
        Command::LicenseRenewAutomatic,
        &signing,
        |_, _| Reply::License {
            policy: near,
            message: String::new(),
        },
    );
    let healthy = control::Policy {
        state: vantare_ipc::control::AccessState::Active,
        signed_until_ms: Some(wall + 24 * 60 * 60_000),
        ..initial
    };
    assert_eq!(
        state.renewal.claim(&healthy, wall, after),
        Err(renewal::Skip::NotDue),
        "a verified short deadline is not a transport failure"
    );
}

#[test]
fn urgent_live_dispatch_reaches_a_real_background_helper_and_preserves_core_rights() {
    for licensed in [true, false] {
        live_helper_priority_fixture(licensed);
    }
}

fn live_helper_priority_fixture(licensed: bool) {
    let Fixture {
        root,
        photo: _,
        link,
        core,
        services,
    } = Fixture::with_license(licensed);
    let mut snapshot = vantare_domain::Snapshot::default();
    snapshot.origin.source.kind = vantare_domain::SourceKind::Live;
    snapshot.state.source_state = vantare_domain::SourceState::Live;
    snapshot.state.session.id = vantare_domain::SessionId(91);
    core.publish(Arc::new(snapshot));
    let before = control::request(&link, control::Command::Read).expect("live core");
    assert!(before.live);
    assert_eq!(before.state.permits_access(), licensed);
    assert!(renewal::urgent(&before, before.checked_at_ms) || !licensed);
    let options = Options {
        binary: link
            .image
            .parent()
            .expect("deps")
            .parent()
            .expect("debug")
            .join("vantare-services.exe"),
        hub: link.image.clone(),
        core: link.clone(),
        root: Some(root.join("services")),
    };
    let signing: SigningIn = Arc::new(Mutex::new(None));
    {
        let mut state = services.state.lock().expect("supervisor");
        let reply = serve_command(
            &mut state,
            &options,
            Command::LicenseRenewAutomatic,
            &services.cancellation,
            &signing,
            &services.stop,
        );
        assert!(
            matches!(
                reply,
                Reply::LicenseFailure {
                    outcome: protocol::RenewalOutcome::Transient,
                    ..
                }
            ),
            "fixture has no backend config; helper must answer, not be refused by the game gate"
        );
        assert!(state.client.is_some(), "real helper was launched on demand");
        #[cfg(windows)]
        assert_eq!(
            state
                .client
                .as_ref()
                .expect("helper")
                .priority_class_for_test()
                .expect("GetPriorityClass"),
            windows_sys::Win32::System::Threading::BELOW_NORMAL_PRIORITY_CLASS
        );
        finish(&mut state);
        assert!(
            state.client.is_none(),
            "urgent helper is reaped after the operation"
        );
        clear_cancellation(&services.cancellation);
    }
    let after = control::request(&link, control::Command::Read).expect("rights preserved");
    assert_eq!(after.state.permits_access(), before.state.permits_access());
    assert_eq!(after.catalog, before.catalog);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private fixture cleanup");
}

#[test]
fn reissued_license_without_new_runway_is_successful_and_keeps_the_floor() {
    let now = Instant::now();
    let wall = 10_000_000;
    let policy = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: wall,
        state: vantare_ipc::control::AccessState::Active,
        signed_until_ms: Some(wall + 10 * 60_000),
        ..control::Policy::default()
    };
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    for seconds in [0, 900] {
        assert!(
            run_renewal(
                &mut state,
                &policy,
                wall,
                now + Duration::from_secs(seconds),
                |_, _| Reply::License {
                    policy: policy.clone(),
                    message: String::new()
                }
            )
            .is_some()
        );
    }
    assert!(
        run_renewal(
            &mut state,
            &policy,
            wall,
            now + Duration::from_secs(1799),
            |_, _| panic!("hard floor after successful renewal")
        )
        .is_none()
    );
    assert!(
        run_renewal(
            &mut state,
            &policy,
            wall,
            now + Duration::from_mins(30),
            |_, _| Reply::License {
                policy: policy.clone(),
                message: String::new()
            }
        )
        .is_some()
    );
}

#[test]
fn live_renews_once_on_urgent_window_entry_and_transport_failures_retry_without_notices() {
    let now = Instant::now();
    let wall = 10_000_000;
    let mut policy = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: wall,
        state: vantare_ipc::control::AccessState::Active,
        live: true,
        signed_until_ms: Some(wall + 60 * 60_000 + 1),
        ..control::Policy::default()
    };
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    assert!(
        run_renewal(&mut state, &policy, wall, now, |_, _| panic!(
            "no helper or network outside urgent window"
        ))
        .is_none()
    );
    policy.signed_until_ms = Some(wall + 60 * 60_000);
    let mut requests = 0;
    let result = run_renewal(&mut state, &policy, wall, now, |_, command| {
        assert!(matches!(command, Command::LicenseRenewAutomatic));
        requests += 1;
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Transient,
            message: String::new(),
        }
    });
    assert!(result.is_some());
    assert!(state.notice.is_none(), "do not interrupt the driver");
    assert!(
        run_renewal(
            &mut state,
            &policy,
            wall,
            now + Duration::from_secs(59),
            |_, _| panic!("hard retry floor")
        )
        .is_none()
    );
    let recovered = run_renewal(
        &mut state,
        &policy,
        wall,
        now + Duration::from_mins(1),
        |_, _| {
            requests += 1;
            Reply::License {
                policy: control::Policy {
                    signed_until_ms: Some(wall + 24 * 60 * 60_000),
                    ..policy.clone()
                },
                message: String::new(),
            }
        },
    )
    .expect("transport never blocks the session");
    assert_eq!(
        renewal_outcome(&recovered),
        protocol::RenewalOutcome::Verified
    );
    assert_eq!(requests, 2, "one attempt on entry and one scheduled retry");
    let Reply::License { policy, .. } = recovered else {
        unreachable!()
    };
    assert!(
        run_renewal(
            &mut state,
            &policy,
            wall,
            now + Duration::from_mins(2),
            |_, _| panic!("valid new grant is outside urgent window")
        )
        .is_none()
    );
}

#[test]
fn restored_owner_with_thirty_days_of_margin_does_not_renew_on_each_startup() {
    let Fixture {
        root,
        photo: _,
        link,
        core,
        services,
    } = Fixture::with_grant(
        true,
        chrono::TimeDelta::days(30),
        "vantare.operational.owner",
    );
    let mut state = State::default();
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let mut account_requests = 0;
    let restored = handle_with(&mut state, Command::AccountPoll, &signing, |_, command| {
        assert!(matches!(command, Command::AccountPoll));
        account_requests += 1;
        confirmed_session()
    });
    assert_eq!(account_requests, 1);
    assert!(matches!(
        restored,
        Reply::Account {
            signed_in: true,
            error: None,
            ..
        }
    ));
    let now = Instant::now();
    for seconds in [0, 59, 60, 120] {
        let policy =
            control::request(&link, control::Command::Read).expect("signed durable Owner binding");
        assert!(policy.state.permits_access() && policy.tester);
        assert!(
            policy
                .signed_until_ms
                .is_some_and(|end| end > policy.checked_at_ms + 29 * 24 * 60 * 60_000)
        );
        assert!(
            run_renewal(
                &mut state,
                &policy,
                policy.checked_at_ms,
                now + Duration::from_secs(seconds),
                |_, _| panic!("Owner has days of margin: no startup HTTP")
            )
            .is_none()
        );
    }
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private fixture cleanup");
}

#[test]
fn automatic_device_limit_remains_actionable_without_consuming_it_in_a_probe() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::with_license(false);
    let mut hub = Session::open(&photo);
    let policy = control::request(&link, control::Command::Read).expect("core");
    {
        let mut state = services.state.lock().expect("state");
        state.renewal.observe(&confirmed_session());
        assert!(matches!(
            run_renewal(
                &mut state,
                &policy,
                policy.checked_at_ms,
                Instant::now(),
                |_, _| {
                    Reply::DeviceLimit {
                        message: "fixture limit".into(),
                    }
                }
            ),
            Some(Reply::DeviceLimit { .. })
        ));
    }
    assert!(matches!(hub.request(Command::Probe), Reply::License { .. }));
    assert!(matches!(
        hub.request(Command::LicenseStatus),
        Reply::DeviceLimit { .. }
    ));
    assert!(matches!(
        hub.request(Command::LicenseStatus),
        Reply::License { .. }
    ));
    assert!(
        matches!(
            hub.request(Command::LicenseRenewAutomatic),
            Reply::License { .. }
        ),
        "a definitive block returns the cached policy without another issuance"
    );
    assert!(services.state.lock().expect("state").client.is_none());
    {
        let mut state = services.state.lock().expect("state");
        state.renewal.user_recovery();
        state.renewal.attempted(Instant::now());
    }
    assert!(
        matches!(
            hub.request(Command::LicenseRenewAutomatic),
            Reply::License { .. }
        ),
        "the hard floor also covers an automatic request from the Hub"
    );
    assert!(services.state.lock().expect("state").client.is_none());
    services.state.lock().expect("state").notice = Some(Reply::DeviceLimit {
        message: "old session".into(),
    });
    assert!(matches!(
        hub.request(Command::Logout),
        Reply::Account {
            signed_in: false,
            ..
        }
    ));
    assert!(
        services.state.lock().expect("state").notice.is_none(),
        "logout discards notices from the old session"
    );
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private cleanup");
}

#[test]
fn purchase_restarts_automatic_confirmation_after_a_definitive_rejection() {
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let now = Instant::now();
    state.renewal.attempted(now);
    state
        .renewal
        .completed(protocol::RenewalOutcome::Definitive);
    let policy = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: 1000,
        ..control::Policy::default()
    };
    assert!(
        state
            .renewal
            .claim(&policy, 1000, now + Duration::from_mins(1))
            .is_err()
    );
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let reply = handle_with(
        &mut state,
        Command::Purchase {
            product: protocol::BillingProduct::ProMonthly,
        },
        &signing,
        |_, command| {
            assert!(matches!(command, Command::Purchase { .. }));
            Reply::Checkout {
                url: "https://billing.invalid/fixture".into(),
            }
        },
    );
    assert!(matches!(reply, Reply::Checkout { .. }));
    assert!(
        state
            .renewal
            .claim(&policy, 1000, now + Duration::from_secs(59))
            .is_err(),
        "purchase preserves the hard request floor"
    );
    assert!(
        state
            .renewal
            .claim(&policy, 1000, now + Duration::from_mins(1))
            .is_ok(),
        "explicit purchase reopens automatic confirmation"
    );
}

#[test]
fn manual_definitive_failure_stops_automatic_renewal() {
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let policy = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: 1000,
        state: vantare_ipc::control::AccessState::Active,
        catalog: control::CatalogAccess::Pro,
        signed_until_ms: Some(2000),
        ..control::Policy::default()
    };
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let reply = handle_with(&mut state, Command::LicenseRenew, &signing, |_, _| {
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Definitive,
            message: "fixture denied".into(),
        }
    });
    assert!(matches!(
        reply,
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Definitive,
            ..
        }
    ));
    assert!(
        run_renewal(
            &mut state,
            &policy,
            1000,
            Instant::now() + Duration::from_mins(30),
            |_, _| { panic!("explicit rejection must stop automatic HTTP") }
        )
        .is_none()
    );
}
