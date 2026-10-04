use super::*;
use crate::rights::{Devices, host};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use vantare_services::{
    license::{Capability, ClaimsV1, CredentialV1},
    license_remote::Candidate,
    storage::Store,
};

#[derive(serde::Serialize)]
struct Payload<'a> {
    version: u8,
    algorithm: &'a str,
    key_id: &'a str,
    claims: &'a ClaimsV1,
}

fn candidate() -> (Candidate, String) {
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
            key: "vantare.plan.pro".into(),
            paid_through: (now + chrono::TimeDelta::minutes(10)).to_rfc3339(),
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
        let (candidate, keys) = candidate();
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
            store
                .save("license-candidate", &candidate)
                .expect("candidate durable");
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
            && paid.overlays_advanced
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
    assert!(matches!(hub.request(Command::Status), Reply::Error { .. }));
    assert!(
        services.state.lock().expect("state").client.is_none(),
        "helper cerrado y reaped"
    );
    assert!(
        control::request(&link, control::Command::Read)
            .expect("sin helper")
            .overlays_advanced
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
            .overlays_advanced
    );
    assert!(matches!(hub.request(Command::Shutdown), Reply::Closed));
    assert!(
        !control::request(&link, control::Command::Read)
            .expect("sin reactivación")
            .overlays_advanced
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
        overlays_advanced: true,
        ..control::Policy::default()
    };
    assert!(closes_for_game(&licensed, false));
    assert!(!closes_for_game(&licensed, true), "acceso a medias");
    for policy in [
        control::Policy {
            overlays_advanced: false,
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
    assert!(policy.live && !policy.overlays_advanced);
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
