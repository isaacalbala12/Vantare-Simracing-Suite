use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use vantare_services::license::{Capability, ClaimsV1};

#[path = "tests/characterization.rs"]
mod characterization;
#[path = "tests/pause.rs"]
mod pause;

#[test]
fn retired_v2_is_rejected_online_and_quarantined_on_restore_without_losing_v1() {
    let root = test_root();
    let (credential, keys) = signed_v1(100, vec![]);
    let key = SigningKey::from_bytes(&[7; 32]);
    let keys = format!(
        "{keys},retired:{}",
        URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
    );
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(110)).expect("owner");
    owner
        .install(credential.clone(), wall(110), Duration::ZERO)
        .expect("v1");
    // A correctly signed retired JWS still cannot enter the current verifier.
    let header =
        URL_SAFE_NO_PAD.encode(br#"{"alg":"Ed25519","kid":"retired","typ":"vantare-license+jwt"}"#);
    let claims = URL_SAFE_NO_PAD.encode(
        serde_json::to_vec(&serde_json::json!({
            "version":2,"iss":"vantare-license","aud":"vantare-native",
            "sub":"550e8400-e29b-41d4-a716-446655440000",
            "device_key_id":"retired-installation","iat":100,"exp":1000,"capabilities":[]
        }))
        .expect("claims"),
    );
    let payload = format!("{header}.{claims}");
    let retired = format!(
        "{payload}.{}",
        URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes())
    );
    for text in [
        retired.clone(),
        credential.replace("\"version\":1", "\"version\":2"),
    ] {
        assert_eq!(
            owner.install_online(text, wall(110), Duration::ZERO),
            Err(Error::InvalidCredential)
        );
        assert!(
            owner
                .advance(&Snapshot::default(), wall(110), Duration::ZERO)
                .expect("v1 preserved")
                .state
                .permits_access()
        );
    }
    owner
        .store
        .save(
            "binding",
            &Binding {
                version: 1,
                credential: retired,
                subject: "550e8400-e29b-41d4-a716-446655440000".into(),
                device: devices().legacy,
            },
        )
        .expect("retired cache");
    drop(owner);
    let mut restored = Owner::open(&root, Some(&keys), devices(), 2, wall(110)).expect("restore");
    assert!(restored.binding.is_none());
    assert!(
        !restored
            .advance(&Snapshot::default(), wall(110), Duration::ZERO)
            .expect("denied")
            .state
            .permits_access()
    );
    // Quarantine does not alter authority: the original v1 can still be restored.
    restored
        .install(credential, wall(110), Duration::ZERO)
        .expect("v1 after quarantine");
    assert!(
        restored
            .advance(&Snapshot::default(), wall(110), Duration::ZERO)
            .expect("v1")
            .state
            .permits_access()
    );
    drop(restored);
    clean(&root);
}

fn signed(expiry: i64, issued: i64) -> (String, String) {
    signed_v1(
        issued,
        vec![Capability {
            key: "vantare.operational.owner".into(),
            paid_through: wall(expiry).to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        }],
    )
}
fn devices() -> Devices {
    Devices {
        legacy: "test-legacy".into(),
    }
}

fn signed_v1(issued: i64, capabilities: Vec<Capability>) -> (String, String) {
    signed_v1_device(issued, capabilities, devices().legacy)
}
fn signed_v1_device(
    issued: i64,
    capabilities: Vec<Capability>,
    fingerprint: String,
) -> (String, String) {
    signed_v1_named(issued, capabilities, fingerprint, "test")
}
fn signed_v1_named(
    issued: i64,
    capabilities: Vec<Capability>,
    fingerprint: String,
    key_id: &str,
) -> (String, String) {
    signed_v1_identity(
        issued,
        capabilities,
        fingerprint,
        key_id,
        "550e8400-e29b-41d4-a716-446655440000",
    )
}
fn signed_v1_identity(
    issued: i64,
    capabilities: Vec<Capability>,
    fingerprint: String,
    key_id: &str,
    subject: &str,
) -> (String, String) {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("entropía local");
    let key = SigningKey::from_bytes(&seed);
    let mut credential = CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: key_id.into(),
        claims: ClaimsV1 {
            issuer: "vantare-license".into(),
            subject: subject.into(),
            device_fingerprint: fingerprint,
            issued_at: wall(issued).to_rfc3339(),
            capabilities,
        },
        signature: String::new(),
    };
    // Fixture ASCII en el orden del contrato V1; no expone el firmador productivo.
    let payload = format!(
        r#"{{"version":1,"algorithm":"Ed25519","key_id":"{key_id}","claims":{}}}"#,
        serde_json::to_string(&credential.claims).expect("claims")
    );
    credential.signature = URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes());
    (
        serde_json::to_string(&credential).expect("credencial V1"),
        format!(
            "{key_id}:{}",
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        ),
    )
}
fn test_root() -> std::path::PathBuf {
    std::env::var_os("VANTARE_TEST_EVIDENCE_DIR")
        .map_or_else(std::env::temp_dir, std::path::PathBuf::from)
        .join(format!(
            "vantare-rights-test-{}",
            vantare_services::random_id().expect("entropía")
        ))
}

fn identified_photo() -> Snapshot {
    let mut snapshot = photo(true);
    snapshot.origin.source.simulator = "lmu";
    snapshot.state.session.track_name = vantare_domain::Quality::Reliable("Monza".into());
    snapshot.state.session.kind = vantare_domain::Quality::Reliable(SessionKind::Race);
    snapshot
}

fn saved_grace(root: &std::path::Path, start: i64) -> String {
    let (credential, keys) = signed(start + 20, start - 10);
    let mut owner = Owner::open(root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("instalar");
    owner
        .advance_observed_session(
            &identified_photo(),
            Some("fixture-session-start-1"),
            wall(start + 5),
            wall(start + 25),
            Duration::from_secs(25),
        )
        .expect("margen durable con identidad de fixture");
    keys
}

#[test]
fn restart_preserves_same_absolute_deadline_even_across_two_restarts_and_local_ids() {
    let start = 1_790_800_000;
    let end = start + 20 + 3600;
    let root = test_root();
    let keys = saved_grace(&root, start);
    let mut snapshot = identified_photo();
    for (epoch, now) in [(2, start + 100), (3, end - 1)] {
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), epoch, wall(now)).expect("reinicio");
        assert!(!owner.policy().engineer);
        assert!(
            !owner
                .advance(&Snapshot::default(), wall(now), Duration::ZERO)
                .expect("esperando primera live")
                .engineer
        );
        snapshot.state.session.id = vantare_domain::SessionId(epoch);
        let policy = owner
            .advance_observed_session(
                &snapshot,
                Some("fixture-session-start-1"),
                wall(now),
                wall(now),
                Duration::ZERO,
            )
            .expect("misma sesión estable");
        assert!(policy.engineer && policy.state.permits_access());
        assert_eq!(
            policy.effective_until_ms(),
            Some(u64::try_from(end).expect("deadline") * 1000)
        );
        if now == end - 1 {
            let policy = owner
                .advance_observed_session(
                    &snapshot,
                    Some("fixture-session-start-1"),
                    wall(now),
                    wall(end),
                    Duration::from_secs(1),
                )
                .expect("fin exacto");
            assert!(!policy.engineer && policy.state.permits_access());
        }
    }
    clean(&root);
}

#[test]
fn first_live_mismatch_or_missing_identity_discards_saved_grace_permanently() {
    let start = 1_790_810_000;
    for change in 0..8 {
        let root = test_root();
        let keys = saved_grace(&root, start);
        let mut snapshot = identified_photo();
        let mut marker = Some("fixture-session-start-1");
        match change {
            0 => marker = Some("fixture-session-start-2"),
            1 => snapshot.origin.source.simulator = "acc",
            2 => {
                snapshot.state.session.track_name = vantare_domain::Quality::Reliable("Spa".into());
            }
            3 => {
                snapshot.state.session.kind =
                    vantare_domain::Quality::Reliable(SessionKind::Practice);
            }
            4 => marker = None,
            5 => snapshot.state.session.track_name = vantare_domain::Quality::Stale("Monza".into()),
            6 => snapshot.origin.source.kind = SourceKind::Replay,
            _ => {
                snapshot.origin.source.kind = SourceKind::Replay;
                snapshot.state.source_state = SourceState::Stale;
            }
        }
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), 2, wall(start + 100)).expect("reinicio");
        let policy = owner
            .advance_observed_session(
                &snapshot,
                marker,
                wall(start + 100),
                wall(start + 100),
                Duration::ZERO,
            )
            .expect("primera sesión no coincide");
        assert!(
            !policy.engineer && policy.state.permits_access(),
            "caso {change}"
        );
        drop(owner);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 3, wall(start + 101))
            .expect("otro reinicio");
        assert!(
            !owner
                .advance_observed_session(
                    &identified_photo(),
                    Some("fixture-session-start-1"),
                    wall(start + 101),
                    wall(start + 101),
                    Duration::ZERO,
                )
                .expect("la identidad original ya no recupera el margen")
                .engineer
        );
        drop(owner);
        clean(&root);
    }
}

#[test]
fn restart_at_expired_deadline_or_with_clock_rollback_cannot_restore_grace() {
    let start = 1_790_820_000;
    // Separate fixtures: quarantining on rollback must not make the deadline
    // assertion pass merely because the first case removed its binding.
    for elapsed in [24, 3620] {
        let root = test_root();
        let keys = saved_grace(&root, start);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(start + elapsed))
            .expect("recovery keeps the core available without restoring grace");
        if elapsed == 24 {
            assert!(owner.binding.is_none(), "rollback cache is quarantined");
        } else {
            assert!(
                owner.binding.is_some(),
                "deadline is checked with its verified binding"
            );
        }
        let policy = owner
            .advance_observed_session(
                &identified_photo(),
                Some("fixture-session-start-1"),
                wall(start + elapsed),
                wall(start + elapsed),
                Duration::ZERO,
            )
            .expect("denied or expired grace policy");
        assert!(
            !policy.engineer,
            "neither rollback nor deadline can restore grace"
        );
        if elapsed == 24 {
            assert!(!policy.state.permits_access(), "rollback grants no rights");
        }
        drop(owner);
        clean(&root);
    }
}

#[test]
fn missing_corrupt_or_legacy_state_cannot_restore_grace() {
    use sha2::{Digest, Sha256};
    let start = 1_790_830_000;
    for corruption in 0..3 {
        let root = test_root();
        let keys = saved_grace(&root, start);
        let path = root
            .join(format!("{:x}", Sha256::digest(b"core-rights-v1")))
            .join("authority.dpapi");
        match corruption {
            0 => std::fs::remove_file(path).expect("estado ausente"),
            1 => std::fs::write(path, b"corrupt").expect("corrupción DPAPI"),
            _ => {
                let store = Store::open(&root, "core-rights-v1").expect("store");
                let mut saved = store
                    .fixture::<serde_json::Value>("authority")
                    .expect("estado protegido");
                saved["game"]
                    .as_object_mut()
                    .expect("game")
                    .remove("identity");
                saved["game"]
                    .as_object_mut()
                    .expect("game")
                    .remove("deadlines");
                store.save("authority", &saved).expect("estado legacy");
            }
        }
        let opened = Owner::open(&root, Some(&keys), devices(), 2, wall(start + 100));
        {
            let mut owner = opened.expect("propietario recuperable sin restaurar margen");
            assert!(
                !owner
                    .advance_observed_session(
                        &identified_photo(),
                        Some("fixture-session-start-1"),
                        wall(start + 100),
                        wall(start + 100),
                        Duration::ZERO,
                    )
                    .expect("sin estado de margen verificable")
                    .engineer
            );
        }
        clean(&root);
    }
}
fn wall(seconds: i64) -> DateTime<Utc> {
    DateTime::from_timestamp(seconds, 0).expect("reloj test")
}
fn photo(live: bool) -> Snapshot {
    let mut snapshot = Snapshot::default();
    snapshot.state.session.id = vantare_domain::SessionId(47);
    snapshot.origin.source.kind = SourceKind::Live;
    snapshot.state.source_state = if live {
        SourceState::Live
    } else {
        SourceState::Waiting
    };
    snapshot
}
fn clean(root: &std::path::Path) {
    std::fs::remove_dir_all(root).expect("limpiar solo carpeta aleatoria del test");
}

#[cfg(windows)]
#[test]
fn detached_logout_cannot_claim_revocation_then_managed_ack_survives_restart() {
    use vantare_services::{
        app::App,
        config::BuildConfig,
        protocol::{Command, Reply},
    };
    let now = super::wall_now();
    let (credential, keys) = signed_v1(
        now.timestamp() - 10,
        beta_grants(Some("vantare.edition.launch_v1"), now.timestamp()),
    );
    let root = test_root();
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, now).expect("owner");
    owner
        .install(credential, now, Duration::ZERO)
        .expect("binding previo");
    assert_eq!(
        owner
            .advance(&photo(false), now, Duration::ZERO)
            .expect("derechos")
            .catalog,
        vantare_ipc::control::CatalogAccess::LaunchV1
    );
    drop(owner);

    let mut config = BuildConfig::load();
    config.native_oauth = None;
    let mut app = App::new(config, root.join("services"));
    assert!(
        matches!(app.handle(Command::Logout), Reply::Error { .. }),
        "un auxiliar sin CoreLink no puede confirmar revocación del binding"
    );
    let mut restored = Owner::open(&root, Some(&keys), devices(), 2, super::wall_now())
        .expect("binding conservado");
    assert_eq!(
        restored
            .advance(&photo(false), super::wall_now(), Duration::ZERO)
            .expect("sin falso logout")
            .catalog,
        vantare_ipc::control::CatalogAccess::LaunchV1
    );
    drop(restored);

    let name = format!("logout-{}", vantare_services::random_id().expect("pipe"));
    let nonce = vantare_services::random_id().expect("nonce");
    let pid = std::process::id();
    let host = host::Host::start(
        &name,
        host::Options {
            root: root.clone(),
            keys: Some(keys.clone()),
            devices: devices(),
            epoch: 3,
            nonce: Some(nonce.clone()),
        },
        move |peer, _| peer.pid == pid,
    )
    .expect("núcleo gestionado");
    app.attach_core(vantare_ipc::control::CoreLink {
        pipe: vantare_ipc::control::pipe_name(&name),
        image: std::env::current_exe().expect("imagen"),
        nonce,
    });
    assert!(matches!(
        app.handle(Command::Logout),
        Reply::Account {
            signed_in: false,
            error: None,
            ..
        }
    ));
    drop(app);
    drop(host);
    let mut restored = Owner::open(&root, Some(&keys), devices(), 4, super::wall_now())
        .expect("tombstone durable");
    assert_eq!(
        restored
            .advance(&photo(false), super::wall_now(), Duration::ZERO)
            .expect("sin derechos tras reinicio")
            .catalog,
        vantare_ipc::control::CatalogAccess::Free
    );
    drop(restored);
    clean(&root);
}

#[test]
fn exact_hour_live_only_never_resets_on_reconnect_or_recycled_session_after_restart() {
    let start = 1_790_770_000;
    let expiry = start + 20;
    let (credential, keys) = signed(expiry, start - 10);
    let root = test_root();
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
    owner
        .install(credential.clone(), wall(start), Duration::ZERO)
        .expect("instalar");
    let p = owner
        .advance(&photo(true), wall(start + 5), Duration::from_secs(5))
        .expect("entrar");
    assert!(p.engineer && p.state.permits_access());
    assert_eq!(
        p.effective_until_ms(),
        Some(u64::try_from(expiry + 3600).expect("deadline") * 1000)
    );
    assert!(
        owner
            .advance(&photo(true), wall(expiry + 3599), Duration::from_secs(3619))
            .expect("3599")
            .engineer
    );
    assert!(
        !owner
            .advance(&photo(true), wall(expiry + 3600), Duration::from_secs(3620))
            .expect("3600")
            .engineer
    );
    assert!(
        !owner
            .advance(
                &photo(false),
                wall(expiry + 3601),
                Duration::from_secs(3621)
            )
            .expect("salir")
            .engineer
    );
    assert!(
        !owner
            .advance(&photo(true), wall(expiry + 3602), Duration::from_secs(3622))
            .expect("reconectar no renueva")
            .engineer
    );
    drop(owner);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(expiry + 3603))
        .expect("restaurar binding y reloj");
    assert!(
        !owner
            .advance(&photo(true), wall(expiry + 3603), Duration::ZERO)
            .expect("ID reciclado no confirma carrera anterior")
            .engineer
    );
    owner
        .invalidate(wall(expiry + 3603), Duration::ZERO)
        .expect("tombstone");
    drop(owner);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 3, wall(expiry + 3604))
        .expect("restaurar logout");
    assert!(
        owner
            .install(credential, wall(expiry + 3604), Duration::ZERO)
            .is_err()
    );
    assert!(
        !owner
            .advance(&photo(true), wall(expiry + 3604), Duration::ZERO)
            .expect("denegado")
            .engineer
    );
    drop(owner);
    clean(&root);
}

#[test]
fn expired_credential_cannot_restore_grace_with_recycled_id_after_cold_restart() {
    let start = 1_790_790_000;
    let (credential, keys) = signed(start + 20, start - 10);
    let root = test_root();
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("instalar");
    // El hilo de derechos observa más tarde la entrada adquirida antes de caducar.
    assert!(
        owner
            .advance_observed(
                &photo(true),
                wall(start + 5),
                wall(start + 25),
                Duration::from_secs(25)
            )
            .expect("entrada observada")
            .engineer
    );
    drop(owner);
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 2, wall(start + 30)).expect("restaurar");
    assert!(
        !owner
            .advance(&photo(true), wall(start + 30), Duration::ZERO)
            .expect("ID local reciclado")
            .engineer
    );
    drop(owner);
    clean(&root);
}

#[test]
fn late_transfer_uses_core_entry_time_and_never_grants_grace_to_newly_issued_rights() {
    let start = 1_790_795_000;
    for (issued, grace) in [(start - 10, true), (start + 6, false)] {
        let (credential, keys) = signed(start + 60, issued);
        let root = test_root();
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
        assert!(
            !owner
                .advance(&photo(true), wall(start + 5), Duration::from_secs(5))
                .expect("entrada sin transferencia")
                .engineer
        );
        owner
            .install(credential, wall(start + 10), Duration::from_secs(10))
            .expect("transferencia tardía");
        let policy = owner
            .advance_observed(
                &photo(true),
                wall(start + 5),
                wall(start + 61),
                Duration::from_secs(61),
            )
            .expect("entrada del núcleo");
        assert_eq!(policy.engineer, grace);
        drop(owner);
        clean(&root);
    }
}

#[test]
fn no_other_grace_invalid_signature_wrong_binding_and_clock_rollback_deny() {
    let start = 1_790_780_000;
    let (credential, keys) = signed(start + 20, start - 10);
    let root = test_root();
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
    owner
        .install(credential.clone(), wall(start), Duration::ZERO)
        .expect("instalar");
    assert!(
        !owner
            .advance(&photo(false), wall(start + 20), Duration::from_secs(20))
            .expect("caducada fuera")
            .engineer
    );
    assert!(
        !owner
            .advance(&photo(true), wall(start + 21), Duration::from_secs(21))
            .expect("entrada caducada")
            .engineer
    );
    assert!(
        owner
            .advance(&photo(true), wall(start + 19), Duration::from_secs(22))
            .is_err()
    );
    assert!(
        owner
            .install(
                format!("{credential}corrupt"),
                wall(start + 22),
                Duration::from_secs(22)
            )
            .is_err()
    );
    assert!(!owner.policy().engineer);
    drop(owner);
    clean(&root);
    let root = test_root();
    let mut owner = Owner::open(
        &root,
        Some(&keys),
        Devices {
            legacy: "wrong-legacy".into(),
        },
        1,
        wall(start),
    )
    .expect("otro dispositivo");
    assert!(
        owner
            .install(credential, wall(start), Duration::ZERO)
            .is_err()
    );
    drop(owner);
    clean(&root);
}

fn assert_other_control_generations_do_not_mutate_rights(link: &vantare_ipc::control::CoreLink) {
    use vantare_ipc::{
        control,
        transport::{Event, IO_TIMEOUT},
    };
    for version in [control::VERSION - 1, control::VERSION + 1] {
        let stop = std::sync::Arc::new(Event::new().expect("event"));
        let mut pipe = control::connect_ready(&link.pipe, &stop, IO_TIMEOUT).expect("real host");
        // Image is authenticated by Host before serve. No nonce/command is
        // trusted at this point: the response contains only a denied policy.
        control::write(
            &mut pipe,
            &serde_json::json!({"version":version,"sequence":1,
            "nonce":"not-authorized","command":{"command":"future-mutation"}}),
        )
        .expect("request");
        let response: control::Response =
            control::read(&mut pipe).expect("explicit version envelope");
        assert_eq!(response.version, control::VERSION);
        assert_eq!(response.policy.state, control::AccessState::UpdateRequired);
        assert!(!response.policy.state.permits_access());
        drop(pipe);
        let unchanged =
            control::request(link, control::Command::Read).expect("same host remains available");
        assert!(unchanged.engineer && unchanged.state.permits_access());
    }
}

#[test]
fn signed_http_fixture_reaches_core_pipe_then_both_consumers_without_network_authority() {
    use vantare_ipc::control::{self, CoreLink};
    let now = super::wall_now().timestamp();
    let (credential, keys) = signed(now + 120, now - 10);
    let credential = fetch_credential(&credential);
    let root = test_root();
    let name = format!(
        "vantare-rights-{}",
        vantare_services::random_id().expect("pipe")
    );
    let nonce = vantare_services::random_id().expect("nonce");
    let image = std::env::current_exe().expect("imagen");
    let pid = std::process::id();
    let host = host::Host::start(
        &name,
        host::Options {
            root: root.clone(),
            keys: Some(keys),
            devices: devices(),
            epoch: 47,
            nonce: Some(nonce.clone()),
        },
        move |peer, _| peer.pid == pid,
    )
    .expect("host núcleo");
    let link = CoreLink {
        pipe: control::pipe_name(&name),
        image: image.clone(),
        nonce: nonce.clone(),
    };
    let installed =
        control::request(&link, control::Command::Install { credential }).expect("ACK durable");
    assert!(installed.engineer && installed.state.permits_access());
    assert_other_control_generations_do_not_mutate_rights(&link);
    for _ in 0..2 {
        // Lectura que usan overlays y Engineer: sin nonce ni credencial.
        let p = control::request(
            &CoreLink {
                nonce: String::new(),
                ..link.clone()
            },
            control::Command::Read,
        )
        .expect("política");
        assert_eq!(p.epoch, 47);
        assert!(p.current() && p.engineer && p.state.permits_access());
    }
    assert!(
        control::request(
            &CoreLink {
                nonce: "false".into(),
                ..link.clone()
            },
            control::Command::Invalidate
        )
        .is_err()
    );
    assert!(
        control::request(
            &CoreLink {
                image: image.with_file_name("impostor.exe"),
                ..link.clone()
            },
            control::Command::Read
        )
        .is_err()
    );
    let revoked = control::request(&link, control::Command::Invalidate).expect("ACK revocación");
    assert!(!revoked.engineer && !revoked.state.permits_access());
    drop(host);
    let mut restored =
        Owner::open(&root, None, devices(), 48, super::wall_now()).expect("tombstone sin binding");
    assert!(
        !restored
            .advance(&photo(true), super::wall_now(), Duration::ZERO)
            .expect("sin red")
            .engineer
    );
    drop(restored);
    clean(&root);
}

fn fetch_credential(credential: &str) -> String {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    // El servicio HTTP local entrega solo la credencial pública firmada del test.
    let http = TcpListener::bind("127.0.0.1:0").expect("HTTP local");
    let address = http.local_addr().expect("address");
    let body = serde_json::to_vec(&serde_json::json!({"credential":credential})).expect("body");
    let server = std::thread::spawn(move || {
        let (mut socket, _) = http.accept().expect("accept");
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .expect("timeout");
        let mut headers = Vec::new();
        let mut byte = [0];
        while !headers.ends_with(b"\r\n\r\n") && headers.len() < 8192 {
            socket.read_exact(&mut byte).expect("HTTP request");
            headers.push(byte[0]);
        }
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .expect("headers");
        socket.write_all(&body).expect("response");
    });
    let text = ureq::get(&format!("http://{address}/test-license"))
        .call()
        .expect("HTTP")
        .body_mut()
        .read_to_string()
        .expect("body");
    let response: serde_json::Value = serde_json::from_str(&text).expect("JSON");
    server.join().expect("HTTP terminado");
    response["credential"].as_str().expect("credential").into()
}

#[test]
#[allow(clippy::too_many_lines)] // Matriz única de credenciales firmadas y sus capacidades independientes.
fn v1_signed_credential_matrix_and_perpetual_empty_license() {
    let start = 1_790_800_000;
    for (capability, expected) in [
        (None, [false; 4]),
        (Some("vantare.module.engineer"), [true, false, false, false]),
        (Some("vantare.module.strategy"), [false, true, false, false]),
        (Some("vantare.module.analysis"), [false, false, true, false]),
        (Some("vantare.module.calendar"), [false, false, false, true]),
        (Some("vantare.operational.owner"), [true; 4]),
        (Some("vantare.operational.tester"), [true; 4]),
        (Some("vantare.operational.nightly_tester"), [true; 4]),
        (Some("vantare.plan.pro"), [false; 4]),
        (Some("vantare.edition.launch_v1"), [false; 4]),
    ] {
        let grants = beta_grants(capability, start);
        let (credential, keys) = signed_v1(start - 1, grants);
        let root = test_root();
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
        let anonymous = owner
            .advance(&Snapshot::default(), wall(start), Duration::ZERO)
            .expect("sin sesión");
        assert!(!anonymous.state.permits_access());
        owner
            .install(credential.clone(), wall(start), Duration::ZERO)
            .expect("instalar");
        let policy = owner
            .advance(&Snapshot::default(), wall(start), Duration::ZERO)
            .expect("vigente");
        assert!(policy.state.permits_access(), "{capability:?}");
        assert_eq!(
            policy.tester,
            capability.is_some_and(|key| matches!(
                key,
                "vantare.operational.owner"
                    | "vantare.operational.tester"
                    | "vantare.operational.nightly_tester"
            )),
            "{capability:?}"
        );
        assert_eq!(
            [
                policy.engineer,
                policy.strategy,
                policy.analysis,
                policy.calendar
            ],
            expected
        );
        assert_eq!(
            policy.effective_until_ms(),
            match capability {
                Some("vantare.plan.pro") => Some((start + 3).cast_unsigned() * 1000),
                Some(
                    "vantare.operational.owner"
                    | "vantare.operational.tester"
                    | "vantare.operational.nightly_tester",
                ) => Some((start + 10).cast_unsigned() * 1000),
                _ => None,
            }
        );
        export_capture_policy(capability, &policy);
        // Caché válida tras restaurar, sin consulta de red ni derechos inventados.
        drop(owner);
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), 2, wall(start + 1)).expect("caché");
        assert!(
            owner
                .advance(&Snapshot::default(), wall(start + 1), Duration::ZERO)
                .expect("caché vigente")
                .state
                .permits_access()
        );
        let expired = owner
            .advance(
                &Snapshot::default(),
                wall(start + 10),
                Duration::from_secs(9),
            )
            .expect("caducidad exacta");
        assert!(expired.state.permits_access(), "v1 has no envelope expiry");
        assert_eq!(
            [
                expired.engineer,
                expired.strategy,
                expired.analysis,
                expired.calendar
            ],
            if capability.is_some_and(|key| key.starts_with("vantare.module.")) {
                expected
            } else {
                [false; 4]
            }
        );
        assert!(
            owner
                .install(
                    format!("{credential}corrupt"),
                    wall(start + 11),
                    Duration::from_secs(10)
                )
                .is_err()
        );
        let error = owner.policy();
        assert_eq!(
            [
                error.state.permits_access(),
                error.engineer,
                error.strategy,
                error.analysis,
                error.calendar
            ],
            [
                true,
                expired.engineer,
                expired.strategy,
                expired.analysis,
                expired.calendar,
            ]
        );
        drop(owner);
        clean(&root);
    }
}

fn beta_grants(capability: Option<&str>, start: i64) -> Vec<Capability> {
    capability
        .into_iter()
        .map(|key| Capability {
            key: key.into(),
            paid_through: if key.starts_with("vantare.operational.") || key == "vantare.plan.pro" {
                wall(if key == "vantare.plan.pro" {
                    start + 3
                } else {
                    start + 10
                })
                .to_rfc3339()
            } else {
                String::new()
            },
            perpetual: key.starts_with("vantare.module.")
                || matches!(key, "vantare.edition.launch_v1" | "vantare.plan.founders"),
            scope_version: if key == "vantare.edition.launch_v1" {
                "launch_v1".into()
            } else {
                String::new()
            },
        })
        .collect()
}

#[test]
fn founders_alone_enables_all_modules_offline_until_revoked() {
    use vantare_ipc::control::CatalogAccess;
    let start = 1_790_800_000;
    let (credential, keys) =
        signed_v1(start - 1, beta_grants(Some("vantare.plan.founders"), start));
    let root = test_root();
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("firma");
    drop(owner);
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 2, wall(start + 86400)).expect("offline");
    let policy = owner
        .advance(&Snapshot::default(), wall(start + 86400), Duration::ZERO)
        .expect("Founders");
    assert_eq!(policy.catalog, CatalogAccess::Founders);
    assert!(policy.engineer && policy.strategy && policy.analysis && policy.calendar);
    assert!(policy.catalog.allows_widget("future-widget"));
    assert!(!policy.tester);
    owner
        .invalidate(wall(start + 86401), Duration::from_secs(1))
        .expect("retirar");
    let policy = owner
        .advance(
            &Snapshot::default(),
            wall(start + 86401),
            Duration::from_secs(1),
        )
        .expect("retirado");
    assert_eq!(policy.catalog, CatalogAccess::Free);
    assert!(!policy.engineer && !policy.strategy && !policy.analysis && !policy.calendar);
    drop(owner);
    clean(&root);
}

#[test]
fn launch_v1_signed_credentials_keep_the_cutoff_offline_and_at_pro_expiry() {
    use vantare_ipc::control::CatalogAccess;
    let start = 1_790_800_000;
    let mut grants: Vec<_> = [
        "vantare.edition.launch_v1",
        "vantare.module.calendar",
        "vantare.module.engineer",
        "vantare.module.strategy",
        "vantare.operational.tester",
        "vantare.plan.pro",
    ]
    .into_iter()
    .flat_map(|key| beta_grants(Some(key), start))
    .collect();
    grants.sort_by(|a, b| a.key.cmp(&b.key));
    let (credential, keys) = signed_v1(start - 1, grants);
    let root = test_root();
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
    owner
        .install(credential, wall(start), Duration::ZERO)
        .expect("firma existente");
    let pro = owner
        .advance(&Snapshot::default(), wall(start), Duration::ZERO)
        .expect("Pro");
    assert_eq!(pro.catalog, CatalogAccess::Pro);
    export_capture_policy(Some("vantare.plan.pro"), &pro);
    assert!(pro.engineer && pro.strategy);
    assert_eq!(
        pro.effective_until_ms(),
        Some(u64::try_from(start + 3).expect("fecha") * 1000)
    );
    drop(owner);
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 2, wall(start + 3)).expect("offline");
    let launch = owner
        .advance(&Snapshot::default(), wall(start + 3), Duration::ZERO)
        .expect("LE");
    assert!(launch.state.permits_access() && launch.tester && launch.calendar);
    assert_eq!(launch.catalog, CatalogAccess::LaunchV1);
    export_capture_policy(Some("vantare.edition.launch_v1"), &launch);
    assert!(launch.catalog.allows_widget("relative"));
    assert!(!launch.catalog.allows_widget("radar"));
    assert!(!launch.engineer && !launch.strategy);
    let without_tester = owner
        .advance(
            &Snapshot::default(),
            wall(start + 10),
            Duration::from_secs(7),
        )
        .expect("tester vencido");
    assert!(!without_tester.tester);
    assert_eq!(without_tester.catalog, CatalogAccess::LaunchV1);
    owner
        .invalidate(wall(start + 11), Duration::from_secs(8))
        .expect("revocar");
    let revoked = owner
        .advance(
            &Snapshot::default(),
            wall(start + 11),
            Duration::from_secs(8),
        )
        .expect("revocada");
    assert!(!revoked.state.permits_access());
    drop(owner);
    clean(&root);
}

fn export_capture_policy(capability: Option<&str>, policy: &Policy) {
    if let Some(directory) = std::env::var_os("VANTARE_BETA_POLICY_EVIDENCE") {
        let name = match capability {
            None => Some("sin-modulos"),
            Some("vantare.operational.owner") => Some("owner"),
            Some("vantare.module.strategy") => Some("solo-strategy"),
            Some("vantare.edition.launch_v1") => Some("launch-v1"),
            Some("vantare.plan.pro") => Some("pro"),
            _ => None,
        };
        if let Some(name) = name {
            let path = std::path::PathBuf::from(directory).join(format!("policy-{name}.json"));
            std::fs::write(
                path,
                serde_json::to_vec_pretty(policy).expect("policy JSON"),
            )
            .expect("evidencia fuera del repo");
        }
    }
}

#[test]
fn cached_credential_keeps_overlays_and_modules_during_unreachable_server_hours() {
    let start = 1_790_800_000;
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("puerto local");
    let address = listener.local_addr().expect("dirección");
    drop(listener);
    assert!(
        ureq::get(&format!("http://{address}/native-license"))
            .call()
            .is_err(),
        "servidor inalcanzable"
    );
    for capability in [None, Some("vantare.module.strategy")] {
        let grants = beta_grants(capability, start);
        let (credential, keys) = signed_v1(start - 1, grants);
        let root = test_root();
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
        owner
            .install(credential, wall(start), Duration::ZERO)
            .expect("guardar credencial");
        drop(owner);
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), 2, wall(start)).expect("caché sin red");
        for seconds in [2 * 3600, 3 * 3600, 3 * 86400 - 1, 3 * 86400] {
            let policy = owner
                .advance(
                    &Snapshot::default(),
                    wall(start + seconds),
                    Duration::from_secs(u64::try_from(seconds).expect("duración")),
                )
                .expect("sin red");
            assert!(policy.state.permits_access());
            assert_eq!(policy.strategy, capability.is_some());
            assert!(!policy.engineer && !policy.analysis && !policy.calendar);
        }
        drop(owner);
        clean(&root);
    }
}

#[test]
fn local_legacy_device_is_unchanged_by_a_corrupt_retired_installation_store() {
    use sha2::{Digest, Sha256};
    let expected =
        vantare_services::license::installation::legacy_fingerprint().expect("Windows fingerprint");
    let root = test_root();
    let context = "core-installation-v1";
    let store = Store::open(&root, context).expect("retired namespace");
    drop(store);
    let path = root
        .join(format!("{:x}", Sha256::digest(context.as_bytes())))
        .join("installation.dpapi");
    let damaged = b"corrupt retired installation fixture";
    std::fs::write(&path, damaged).expect("private corrupt fixture");
    let local = local_devices();
    assert_eq!(local.legacy, expected);
    let (credential, keys) = signed_v1_device(100, vec![], local.legacy.clone());
    let mut owner =
        Owner::open(&root.join("rights"), Some(&keys), local, 1, wall(110)).expect("owner");
    owner
        .install(credential, wall(110), Duration::ZERO)
        .expect("v1 independent of retired store");
    assert!(
        owner
            .advance(&Snapshot::default(), wall(110), Duration::ZERO)
            .expect("v1")
            .state
            .permits_access()
    );
    assert_eq!(
        std::fs::read(path).expect("retired bytes preserved"),
        damaged
    );
    drop(owner);
    clean(&root);
}

#[test]
fn cached_license_with_a_retired_key_is_preserved_and_recovers_only_after_a_fresh_signature() {
    let root = test_root();
    let (old, old_keys) = signed_v1_named(100, Vec::new(), devices().legacy, "retired-fixture");
    let mut owner =
        Owner::open(&root, Some(&old_keys), devices(), 1, wall(110)).expect("old owner");
    owner
        .install(old.clone(), wall(110), Duration::ZERO)
        .expect("cache is genuinely signed by the old keyring");
    drop(owner);
    let namespace = std::fs::read_dir(&root)
        .expect("namespace")
        .next()
        .expect("entry")
        .expect("entry")
        .path();
    let binding_name = if cfg!(windows) {
        "binding.dpapi"
    } else {
        "binding.json"
    };
    let before = std::fs::read(namespace.join(binding_name)).expect("protected old bytes");
    let (fresh, keys) = signed_v1_named(112, Vec::new(), devices().legacy, "current-fixture");
    let (older, older_keys) =
        signed_v1_named(99, Vec::new(), devices().legacy, "older-current-fixture");
    let keys = format!("{keys},{older_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(111))
        .expect("retired cache cannot block the owner");
    assert!(owner.binding.is_none());
    assert!(!namespace.join(binding_name).exists());
    let archived: Vec<_> = std::fs::read_dir(&namespace)
        .expect("archive")
        .filter_map(std::result::Result::ok)
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("binding-111000-")
        })
        .collect();
    assert_eq!(archived.len(), 1);
    assert_eq!(
        std::fs::read(archived[0].path()).expect("preserved"),
        before
    );
    assert!(
        !owner
            .advance(&photo(false), wall(111), Duration::ZERO)
            .expect("denied policy")
            .state
            .permits_access()
    );
    assert!(matches!(
        owner.install(old, wall(112), Duration::from_secs(1)),
        Err(Error::InvalidCredential)
    ));
    assert!(
        !namespace.join(binding_name).exists(),
        "unknown-key input cannot replace the cached file"
    );
    assert!(
        matches!(
            owner.install(older, wall(112), Duration::from_secs(1)),
            Err(Error::Clock)
        ),
        "a valid current signature older than latest_issued remains rejected after quarantine"
    );
    owner
        .install(fresh, wall(112), Duration::from_secs(1))
        .expect("fresh signature from current keyring");
    assert!(
        owner
            .advance(&photo(false), wall(112), Duration::from_secs(1))
            .expect("fresh policy")
            .state
            .permits_access()
    );
    assert!(namespace.join(binding_name).exists());
    assert_eq!(
        std::fs::read(archived[0].path()).expect("archive retained"),
        before
    );
    drop(owner);
    std::fs::remove_dir_all(root).expect("fixture cleanup");
}

#[test]
fn old_format_and_known_key_bad_signature_are_quarantined_without_rights() {
    for unsupported in [true, false] {
        let root = test_root();
        let (credential, keys) = signed_v1(100, Vec::new());
        let store = Store::open(&root, "core-rights-v1").expect("store");
        let credential = if unsupported {
            credential
        } else {
            let mut value: CredentialV1 = serde_json::from_str(&credential).expect("credential");
            value.signature = URL_SAFE_NO_PAD.encode([0_u8; 64]);
            serde_json::to_string(&value).expect("bad signature fixture")
        };
        store
            .save(
                "binding",
                &Binding {
                    version: u8::from(!unsupported),
                    credential,
                    subject: "550e8400-e29b-41d4-a716-446655440000".into(),
                    device: devices().legacy,
                },
            )
            .expect("binding fixture");
        drop(store);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(110))
            .expect("unverified cache cannot block recovery");
        assert!(
            !owner
                .advance(&photo(false), wall(110), Duration::ZERO)
                .expect("no rights before a new valid signature")
                .state
                .permits_access()
        );
        assert!(owner.binding.is_none());
        drop(owner);
        std::fs::remove_dir_all(root).expect("fixture cleanup");
    }
}

#[cfg(windows)]
#[test]
fn unreadable_dpapi_is_preserved_but_actual_io_is_never_quarantined() {
    use std::os::windows::fs::OpenOptionsExt;
    for locked in [false, true] {
        let root = test_root();
        let (_, keys) = signed_v1(100, Vec::new());
        let store = Store::open(&root, "core-rights-v1").expect("store");
        store
            .save("binding", &serde_json::json!({"old":true}))
            .expect("fixture");
        drop(store);
        let namespace = std::fs::read_dir(&root)
            .expect("namespace")
            .next()
            .expect("entry")
            .expect("entry")
            .path();
        let file = namespace.join("binding.dpapi");
        std::fs::write(&file, b"unreadable-dpapi-fixture").expect("corrupt fixture bytes");
        let lock = locked.then(|| {
            std::fs::OpenOptions::new()
                .read(true)
                .share_mode(0)
                .open(&file)
                .expect("exclusive file")
        });
        let result = Owner::open(&root, Some(&keys), devices(), 1, wall(110));
        if locked {
            assert!(
                matches!(result, Err(Error::Storage)),
                "real file IO errors propagate"
            );
            assert!(file.exists());
        } else {
            let mut owner = result.expect("corrupt DPAPI permits recovery");
            assert!(
                !owner
                    .advance(&photo(false), wall(110), Duration::ZERO)
                    .expect("no rights")
                    .state
                    .permits_access()
            );
            assert!(!file.exists());
            let archived = std::fs::read_dir(&namespace)
                .expect("archive")
                .flatten()
                .find(|e| e.file_name().to_string_lossy().starts_with("binding-"))
                .expect("preserved archive");
            assert_eq!(
                std::fs::read(archived.path()).expect("bytes"),
                b"unreadable-dpapi-fixture"
            );
        }
        drop(lock);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}

#[test]
fn quarantine_preserves_the_durable_logout_tombstone() {
    let root = test_root();
    let (old, old_keys) = signed_v1_named(100, Vec::new(), devices().legacy, "retired");
    let mut owner = Owner::open(&root, Some(&old_keys), devices(), 1, wall(105)).expect("owner");
    owner
        .install(old.clone(), wall(105), Duration::ZERO)
        .expect("old valid signature");
    owner
        .invalidate(wall(110), Duration::from_secs(5))
        .expect("durable logout");
    owner
        .store
        .save(
            "binding",
            &Binding {
                version: 1,
                credential: old,
                subject: "550e8400-e29b-41d4-a716-446655440000".into(),
                device: devices().legacy,
            },
        )
        .expect("late cached credential");
    drop(owner);
    let (late, late_keys) = signed_v1_named(109, Vec::new(), devices().legacy, "late");
    let (fresh, fresh_keys) = signed_v1_named(112, Vec::new(), devices().legacy, "fresh");
    let keys = format!("{late_keys},{fresh_keys}");
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 2, wall(111)).expect("quarantined owner");
    assert!(
        matches!(
            owner.install(late, wall(112), Duration::ZERO),
            Err(Error::Denied)
        ),
        "quarantine cannot erase invalidated_after"
    );
    owner
        .install(fresh, wall(112), Duration::ZERO)
        .expect("only a newer signed grant recovers");
    drop(owner);
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejected_renewal_cannot_revoke_a_previously_verified_binding() {
    let root = test_root();
    let (current, keys) = signed_v1_named(100, Vec::new(), devices().legacy, "current");
    let (older, older_keys) = signed_v1_named(99, Vec::new(), devices().legacy, "older-current");
    let keys = format!("{keys},{older_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(110)).expect("owner");
    owner
        .install(format!(" \n{current}"), wall(110), Duration::ZERO)
        .expect("valid binding");
    assert!(
        owner
            .advance(&photo(false), wall(110), Duration::ZERO)
            .expect("verified policy")
            .state
            .permits_access()
    );
    assert!(matches!(
        owner.install("unverifiable".into(), wall(111), Duration::from_secs(1)),
        Err(Error::InvalidCredential)
    ));
    assert!(
        owner
            .advance(&photo(false), wall(111), Duration::from_secs(1))
            .expect("valid rights preserved")
            .state
            .permits_access()
    );
    assert!(matches!(
        owner.install(older, wall(112), Duration::from_secs(2)),
        Err(Error::Clock)
    ));
    assert!(
        owner
            .advance(&photo(false), wall(112), Duration::from_secs(2))
            .expect("older issuance cannot revoke")
            .state
            .permits_access()
    );
    drop(owner);
    let mut restored = Owner::open(&root, Some(&keys), devices(), 2, wall(113))
        .expect("durable binding preserved");
    assert!(
        restored
            .advance(&photo(false), wall(113), Duration::ZERO)
            .expect("restored rights")
            .state
            .permits_access()
    );
    drop(restored);
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn authority_rejected_signed_binding_is_preserved_and_a_fresh_grant_recovers() {
    for tombstone in [false, true] {
        let root = test_root();
        let (old, old_keys) = signed_v1_named(100, Vec::new(), devices().legacy, "old");
        let (latest, latest_keys) = signed_v1_named(105, Vec::new(), devices().legacy, "latest");
        let (fresh, fresh_keys) = signed_v1_named(120, Vec::new(), devices().legacy, "fresh");
        let keys = format!("{old_keys},{latest_keys},{fresh_keys}");
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(105)).expect("owner");
        owner
            .install(latest, wall(105), Duration::ZERO)
            .expect("latest grant");
        if tombstone {
            owner
                .invalidate(wall(110), Duration::from_secs(5))
                .expect("logout");
        }
        owner
            .store
            .save(
                "binding",
                &Binding {
                    version: 1,
                    credential: old.clone(),
                    subject: "550e8400-e29b-41d4-a716-446655440000".into(),
                    device: devices().legacy,
                },
            )
            .expect("stale but authentically signed cache");
        let authority_before = owner
            .store
            .fixture::<serde_json::Value>("authority")
            .expect("clock");
        drop(owner);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(111))
            .expect("a rejected cached grant must not disable the core");
        assert!(owner.binding.is_none());
        assert!(
            !owner
                .advance(&photo(false), wall(111), Duration::ZERO)
                .expect("denied policy")
                .state
                .permits_access()
        );
        assert_eq!(
            owner
                .store
                .fixture::<serde_json::Value>("authority")
                .expect("preserved clock"),
            authority_before
        );
        let rejected = owner.install(old, wall(112), Duration::from_secs(1));
        assert!(if tombstone {
            matches!(rejected, Err(Error::Denied))
        } else {
            matches!(rejected, Err(Error::Clock))
        });
        owner
            .install(fresh, wall(120), Duration::from_secs(9))
            .expect("new signed grant");
        assert!(
            owner
                .advance(&photo(false), wall(120), Duration::from_secs(9))
                .expect("recovered policy")
                .state
                .permits_access()
        );
        drop(owner);
        std::fs::remove_dir_all(root).expect("private fixture cleanup");
    }
}

#[cfg(windows)]
#[test]
fn authority_persist_failure_at_open_denies_rights_but_keeps_install_available() {
    use std::os::windows::fs::OpenOptionsExt;
    let root = test_root();
    let (current, keys) = signed_v1_named(100, Vec::new(), devices().legacy, "current");
    let (fresh, fresh_keys) = signed_v1_named(111, Vec::new(), devices().legacy, "fresh");
    let keys = format!("{keys},{fresh_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(105)).expect("owner");
    owner
        .install(current, wall(105), Duration::ZERO)
        .expect("binding");
    drop(owner);
    let namespace = std::fs::read_dir(&root)
        .expect("namespace")
        .next()
        .expect("entry")
        .expect("path")
        .path();
    let path = namespace.join("authority.dpapi");
    let before = std::fs::read(&path).expect("saved authority");
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .expect("block replacement, allow read");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(110))
        .expect("persistence failure must leave a usable denied owner");
    assert!(
        !owner
            .advance(&photo(false), wall(110), Duration::ZERO)
            .expect("denied")
            .state
            .permits_access()
    );
    assert_eq!(
        owner.policy().state,
        vantare_ipc::control::AccessState::Unavailable,
        "a failed durable write is not an explicit revocation"
    );
    assert_eq!(std::fs::read(&path).expect("original preserved"), before);
    drop(lock);
    owner
        .install(fresh, wall(111), Duration::from_secs(1))
        .expect("recover after storage is writable");
    assert!(
        owner
            .advance(&photo(false), wall(111), Duration::from_secs(1))
            .expect("new policy")
            .state
            .permits_access()
    );
    drop(owner);
    std::fs::remove_dir_all(root).expect("private cleanup");
}

#[test]
fn authority_recovery_corrupt_dpapi_requires_online_and_survives_restart() {
    use sha2::{Digest, Sha256};
    let root = test_root();
    let (old, old_keys) = signed_v1_named(100, vec![], devices().legacy, "old");
    let (fresh, fresh_keys) = signed_v1_named(120, vec![], devices().legacy, "fresh");
    let keys = format!("{old_keys},{fresh_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
    owner
        .install(old.clone(), wall(100), Duration::ZERO)
        .expect("install");
    drop(owner);
    let namespace = root.join(format!("{:x}", Sha256::digest(b"core-rights-v1")));
    let path = namespace.join("authority.dpapi");
    let damaged = b"corrupt-dpapi-fixture";
    std::fs::write(&path, damaged).expect("corrupt fixture only");
    for epoch in [2, 3] {
        let mut owner = Owner::open(&root, Some(&keys), devices(), epoch, wall(120))
            .expect("recoverable owner");
        assert!(owner.binding.is_none());
        assert!(matches!(
            owner.install(old.clone(), wall(120), Duration::ZERO),
            Err(Error::Denied)
        ));
        assert!(
            !owner
                .advance(&photo(false), wall(120), Duration::ZERO)
                .expect("denied policy")
                .state
                .permits_access()
        );
    }
    let archives: Vec<_> = std::fs::read_dir(&namespace)
        .expect("archives")
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("authority-0-"))
        .collect();
    assert_eq!(archives.len(), 1);
    assert_eq!(
        std::fs::read(archives[0].path()).expect("evidence"),
        damaged
    );
    let mut owner = Owner::open(&root, Some(&keys), devices(), 4, wall(120)).expect("owner");
    owner
        .install_online(fresh, wall(120), Duration::ZERO)
        .expect("fresh authenticated issuance");
    assert!(
        owner
            .advance(&photo(false), wall(120), Duration::ZERO)
            .expect("policy")
            .state
            .permits_access()
    );
    drop(owner);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 5, wall(121)).expect("durable ACK");
    assert!(
        owner
            .advance(&photo(false), wall(121), Duration::ZERO)
            .expect("restored policy")
            .state
            .permits_access()
    );
    assert!(matches!(
        owner.install(old, wall(121), Duration::ZERO),
        Err(Error::Clock)
    ));
    drop(owner);
    clean(&root);
}

#[test]
fn authority_recovery_io_error_is_not_quarantined_or_defaulted() {
    use sha2::{Digest, Sha256};
    let root = test_root();
    let (_, keys) = signed_v1_named(100, vec![], devices().legacy, "test");
    drop(Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner"));
    let namespace = root.join(format!("{:x}", Sha256::digest(b"core-rights-v1")));
    let path = namespace.join("authority.dpapi");
    std::fs::create_dir(&path).expect("blocked fixture path");
    assert!(matches!(
        Owner::open(&root, Some(&keys), devices(), 2, wall(100)),
        Err(Error::Storage)
    ));
    assert!(path.is_dir());
    clean(&root);
}

#[test]
fn authority_recovery_online_reanchors_but_disk_replay_and_expiry_stay_denied() {
    for drift in [1, 86_400] {
        let root = test_root();
        let (old, old_keys) = signed_v1_named(100, vec![], devices().legacy, "old");
        let (fresh, fresh_keys) = signed_v1_named(
            120,
            vec![Capability {
                key: "vantare.plan.pro".into(),
                paid_through: wall(130).to_rfc3339(),
                perpetual: false,
                scope_version: String::new(),
            }],
            devices().legacy,
            "fresh",
        );
        let keys = format!("{old_keys},{fresh_keys}");
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
        owner
            .install(old.clone(), wall(100), Duration::ZERO)
            .expect("install");
        owner
            .advance(&photo(false), wall(120 + drift), Duration::from_secs(1))
            .expect("future wall persisted");
        drop(owner);
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), 2, wall(120)).expect("denied but available");
        assert!(owner.binding.is_none());
        assert!(matches!(
            owner.install(old.clone(), wall(120), Duration::ZERO),
            Err(Error::Clock)
        ));
        owner
            .install_online(fresh.clone(), wall(120), Duration::ZERO)
            .expect("online recovery");
        let policy = owner
            .advance(&photo(false), wall(120), Duration::ZERO)
            .expect("policy");
        assert_eq!(policy.catalog, vantare_ipc::control::CatalogAccess::Pro);
        drop(owner);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 3, wall(130)).expect("restart");
        assert_eq!(
            owner
                .advance(&photo(false), wall(130), Duration::ZERO)
                .expect("expired")
                .catalog,
            vantare_ipc::control::CatalogAccess::Free
        );
        assert!(matches!(
            owner.install(fresh, wall(120), Duration::ZERO),
            Err(Error::Clock)
        ));
        drop(owner);
        clean(&root);
    }
}

#[test]
fn a_new_signature_beyond_a_future_tombstone_recovers_within_allowed_skew() {
    let root = test_root();
    let rights = || {
        vec![Capability {
            key: "vantare.operational.owner".into(),
            paid_through: wall(300).to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        }]
    };
    let (old, old_keys) = signed_v1_named(100, rights(), devices().legacy, "old");
    let (new, new_keys) = signed_v1_named(201, rights(), devices().legacy, "new");
    let (equal, equal_keys) = signed_v1_named(200, rights(), devices().legacy, "equal");
    let keys = format!("{old_keys},{new_keys},{equal_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
    owner
        .install(old, wall(100), Duration::ZERO)
        .expect("old binding");
    owner
        .advance(&photo(false), wall(200), Duration::from_secs(1))
        .expect("observe future");
    owner
        .invalidate(wall(120), Duration::from_secs(2))
        .expect("future tombstone");
    assert!(matches!(
        owner.authority.recovery_state(wall(120)),
        Some(vantare_ipc::control::AccessState::ClockBehind { until_ms: 200_000 })
    ));
    // A verified fresh iat can exceed the boundary while wall is still behind
    // it within the existing +300s tolerance. Waiting must not revoke that grant.
    owner
        .install_online(new, wall(120), Duration::from_secs(2))
        .expect("fresh signed proof beyond boundary");
    let policy = owner
        .advance(&photo(false), wall(120), Duration::from_secs(2))
        .expect("recovered policy");
    assert_eq!(policy.state, vantare_ipc::control::AccessState::Active);
    assert!(policy.engineer);
    let saved = owner
        .store
        .fixture::<serde_json::Value>("authority")
        .expect("durable clock");
    assert_eq!(
        saved["clock"]["invalidated_after"],
        serde_json::json!(wall(200))
    );
    assert_eq!(
        owner.install_online(equal, wall(120), Duration::from_secs(2)),
        Err(Error::Clock)
    );
    assert_eq!(
        owner.policy().state,
        vantare_ipc::control::AccessState::Active
    );
    owner
        .store
        .remove("binding")
        .expect("isolated lost binding");
    drop(owner);
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 2, wall(120)).expect("restore without proof");
    let missing = owner
        .advance(&photo(false), wall(120), Duration::ZERO)
        .expect("diagnostic without proof");
    assert_eq!(
        missing.state,
        vantare_ipc::control::AccessState::NoCredential
    );
    assert!(!missing.state.permits_access());
    drop(owner);
    clean(&root);
}

#[test]
fn server_ahead_tombstone_is_published_in_wall_time_and_recovers_without_extra_wait() {
    let root = test_root();
    let (old, old_keys) = signed_v1_named(200, vec![], devices().legacy, "old");
    let (new, new_keys) = signed_v1_named(211, vec![], devices().legacy, "new");
    let keys = format!("{old_keys},{new_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
    owner
        .install(old, wall(100), Duration::ZERO)
        .expect("+100s signed skew");
    owner
        .invalidate(wall(110), Duration::from_secs(10))
        .expect("effective tombstone210");
    let waiting = owner
        .advance(&photo(false), wall(105), Duration::from_secs(10))
        .expect("waiting");
    assert_eq!(
        waiting.state,
        AccessState::ClockBehind { until_ms: 110_000 }
    );
    assert!(!waiting.state.permits_access());
    let ready = owner
        .advance(&photo(false), wall(111), Duration::from_secs(11))
        .expect("wall past boundary");
    assert!(!matches!(ready.state, AccessState::ClockBehind { .. }));
    owner
        .install_online(new, wall(111), Duration::from_secs(11))
        .expect("iat211 acceptable now");
    let recovered = owner
        .advance(&photo(false), wall(111), Duration::from_secs(11))
        .expect("recovered");
    assert_eq!(recovered.state, AccessState::Active);
    assert_eq!(
        owner
            .store
            .fixture::<serde_json::Value>("authority")
            .expect("saved")["clock"]["invalidated_after"],
        serde_json::json!(wall(210))
    );
    drop(owner);
    clean(&root);
}

#[test]
fn authority_recovery_logout_during_correction_keeps_future_tombstone() {
    let root = test_root();
    let (old, old_keys) = signed_v1_named(100, vec![], devices().legacy, "old");
    let (too_early, early_keys) = signed_v1_named(120, vec![], devices().legacy, "early");
    let (new, new_keys) = signed_v1_named(201, vec![], devices().legacy, "new");
    let keys = format!("{old_keys},{early_keys},{new_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
    owner
        .install(old.clone(), wall(100), Duration::ZERO)
        .expect("install");
    owner
        .advance(&photo(false), wall(200), Duration::from_secs(1))
        .expect("future");
    owner
        .invalidate(wall(120), Duration::from_secs(2))
        .expect("logout must persist during correction");
    drop(owner);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(120)).expect("owner");
    assert!(matches!(
        owner.install_online(too_early, wall(120), Duration::ZERO),
        Err(Error::Denied)
    ));
    let blocked = owner
        .advance(&photo(false), wall(120), Duration::ZERO)
        .expect("diagnostic only");
    assert_eq!(
        blocked.state,
        vantare_ipc::control::AccessState::ClockBehind { until_ms: 200_000 }
    );
    assert!(!blocked.state.permits_access());
    assert!(
        blocked
            .state
            .message()
            .expect("explanation")
            .contains("frontera")
    );

    owner
        .install_online(new, wall(201), Duration::ZERO)
        .expect("issuance beyond tombstone");
    assert!(matches!(
        owner.install(old, wall(201), Duration::ZERO),
        Err(Error::Denied)
    ));
    drop(owner);
    clean(&root);
}

#[test]
fn authority_recovery_online_checks_skew_signature_device_and_subject() {
    for skew in [-301, -300, 0, 300, 301] {
        let root = test_root();
        let (credential, keys) = signed_v1(1000 + skew, vec![]);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(1000)).expect("owner");
        let result = owner.install_online(credential, wall(1000), Duration::ZERO);
        assert_eq!(result.is_ok(), (-300..=300).contains(&skew));
        if result.is_ok() {
            assert!(
                owner
                    .advance(&photo(false), wall(1000), Duration::ZERO)
                    .expect("future iat tolerance")
                    .state
                    .permits_access()
            );
        }
        drop(owner);
        clean(&root);
    }
    let root = test_root();
    let (credential, keys) = signed_v1(1000, vec![]);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(1000)).expect("owner");
    let mut forged: serde_json::Value = serde_json::from_str(&credential).expect("fixture");
    forged["claims"]["issued_at"] = serde_json::json!(wall(999).to_rfc3339());
    assert!(matches!(
        owner.install_online(forged.to_string(), wall(1000), Duration::ZERO),
        Err(Error::InvalidCredential)
    ));
    owner
        .install_online(credential, wall(1000), Duration::ZERO)
        .expect("valid");
    let (wrong, wrong_keys) = signed_v1_named(1001, vec![], "wrong-device".into(), "wrong");
    owner.verifier = Some(Verifier::public_keys(&format!("{keys},{wrong_keys}")).expect("keys"));
    assert!(matches!(
        owner.install_online(wrong, wall(1001), Duration::from_secs(1)),
        Err(Error::InvalidCredential)
    ));
    let (other_subject, other_keys) = signed_v1_identity(
        1001,
        vec![],
        devices().legacy,
        "other",
        "550e8400-e29b-41d4-a716-446655440001",
    );
    owner.verifier = Some(Verifier::public_keys(&format!("{keys},{other_keys}")).expect("keys"));
    assert!(
        matches!(
            owner.install_online(other_subject, wall(1001), Duration::from_secs(1)),
            Err(Error::Denied)
        ),
        "a signed different subject still needs durable logout"
    );
    drop(owner);
    clean(&root);
}

#[test]
fn authority_recovery_marker_blocks_replay_if_repair_was_interrupted_and_caps_archives() {
    use sha2::{Digest, Sha256};
    let root = test_root();
    let (old, keys) = signed_v1(100, vec![]);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
    owner
        .install(old.clone(), wall(100), Duration::ZERO)
        .expect("install");
    drop(owner);
    let namespace = root.join(format!("{:x}", Sha256::digest(b"core-rights-v1")));
    let path = namespace.join("authority.dpapi");
    for epoch in 2..7 {
        std::fs::write(&path, b"damaged fixture").expect("damage fixture");
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), epoch, wall(110)).expect("owner");
        assert!(matches!(
            owner.install(old.clone(), wall(110), Duration::ZERO),
            Err(Error::Denied)
        ));
        // Simulate loss/failure of repaired authority after successful quarantine.
        owner
            .store
            .remove("authority")
            .expect("interrupted repair fixture");
    }
    let archives = std::fs::read_dir(&namespace)
        .expect("archives")
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("authority-0-"))
        .count();
    assert_eq!(archives, 3);
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 7, wall(110)).expect("recovery marker survives");
    assert!(matches!(
        owner.install(old, wall(110), Duration::ZERO),
        Err(Error::Denied)
    ));
    drop(owner);
    clean(&root);
}

#[test]
fn authority_recovery_missing_authority_or_corrupt_marker_cannot_restore_binding() {
    use sha2::{Digest, Sha256};
    for (missing_authority, corrupt_authority, corrupt_marker) in [
        (true, false, false),
        (false, false, true),
        (false, true, true),
        (true, false, true),
    ] {
        let root = test_root();
        let (old, keys) = signed_v1(100, vec![]);
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
        owner
            .install(old.clone(), wall(100), Duration::ZERO)
            .expect("install");
        drop(owner);
        let namespace = root.join(format!("{:x}", Sha256::digest(b"core-rights-v1")));
        if missing_authority {
            std::fs::remove_file(namespace.join("authority.dpapi"))
                .expect("missing authority fixture");
        } else if corrupt_authority {
            std::fs::write(
                namespace.join("authority.dpapi"),
                b"damaged authority fixture",
            )
            .expect("damage authority too");
        }
        if corrupt_marker {
            std::fs::write(
                namespace.join("authority-recovery.dpapi"),
                b"damaged marker fixture",
            )
            .expect("damage marker");
        }
        let healthy_authority = (!missing_authority && !corrupt_authority).then(|| {
            std::fs::read(namespace.join("authority.dpapi")).expect("healthy authority bytes")
        });
        for epoch in [2, 3] {
            let mut owner = Owner::open(&root, Some(&keys), devices(), epoch, wall(110))
                .expect("recoverable without rights");
            assert!(owner.binding.is_none());
            assert!(matches!(
                owner.install(old.clone(), wall(110), Duration::ZERO),
                Err(Error::Denied)
            ));
            assert!(
                owner
                    .advance(&photo(false), wall(110), Duration::ZERO)
                    .expect("denied but available policy")
                    .state
                    .needs_recovery()
            );
            if let Some(bytes) = &healthy_authority {
                assert_eq!(
                    &std::fs::read(namespace.join("authority.dpapi"))
                        .expect("authority after restart"),
                    bytes,
                    "F4: a corrupt marker must not rewrite healthy authority on either restart"
                );
            }
            if corrupt_marker {
                assert_eq!(
                    std::fs::read(namespace.join("authority-recovery.dpapi"))
                        .expect("guard still present"),
                    b"damaged marker fixture",
                    "do not move the only recovery guard before the new authority is committed"
                );
            }
        }
        clean(&root);
    }
}

#[test]
fn authority_recovery_online_skew_also_bounds_the_reanchor_branch() {
    for skew in [-301, -300, 0, 300, 301] {
        let root = test_root();
        let (old, old_keys) = signed_v1_named(100, vec![], devices().legacy, "old");
        let (new, new_keys) = signed_v1_named(1000 + skew, vec![], devices().legacy, "new");
        let keys = format!("{old_keys},{new_keys}");
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
        owner
            .install(old, wall(100), Duration::ZERO)
            .expect("initial grant");
        owner
            .advance(&photo(false), wall(2000), Duration::from_secs(1))
            .expect("future persisted");
        drop(owner);
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), 2, wall(1000)).expect("recovery owner");
        assert!(owner.policy().state.needs_recovery());
        assert!(owner.binding.is_none());
        // Every new iat is after latest_issued=100: a failed boundary test
        // cannot be satisfied accidentally by the issuance anti-rollback check.
        let result = owner.install_online(new, wall(1000), Duration::ZERO);
        assert_eq!(result.is_ok(), (-300..=300).contains(&skew));
        if result.is_ok() {
            let policy = owner
                .advance(&photo(false), wall(1000), Duration::ZERO)
                .expect("reanchored");
            assert!(policy.state.permits_access());
            assert!(!policy.state.needs_recovery());
        } else {
            assert!(matches!(result, Err(Error::Clock)));
            assert!(owner.policy().state.needs_recovery());
        }
        drop(owner);
        clean(&root);
    }
}

#[test]
fn authority_recovery_online_keeps_healthy_game_grace_but_reanchor_discards_it() {
    for reanchor in [false, true] {
        let root = test_root();
        let capability = || Capability {
            key: "vantare.operational.owner".into(),
            paid_through: wall(130).to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        };
        let (old, old_keys) = signed_v1_named(100, vec![capability()], devices().legacy, "old");
        let (new, new_keys) = signed_v1_named(120, vec![capability()], devices().legacy, "new");
        let keys = format!("{old_keys},{new_keys}");
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
        owner
            .install(old, wall(100), Duration::ZERO)
            .expect("install");
        assert!(
            owner
                .advance(&photo(true), wall(110), Duration::from_secs(10))
                .expect("eligible game entered before the new issuance")
                .engineer
        );
        if reanchor {
            owner
                .advance_observed(&photo(true), wall(110), wall(200), Duration::from_secs(11))
                .expect("future wall persisted");
        }
        owner
            .install_online(new, wall(120), Duration::from_secs(20))
            .expect("fresh online response without extending the signed deadline");
        let after_expiry = owner
            .advance_observed(&photo(true), wall(110), wall(131), Duration::from_secs(31))
            .expect("same observed race after the signed expiry");
        assert_eq!(after_expiry.engineer, !reanchor);
        assert!(
            !owner
                .advance_observed(
                    &photo(true),
                    wall(110),
                    wall(3730),
                    Duration::from_secs(3630),
                )
                .expect("original grace deadline")
                .engineer,
            "online renewal never extends the original race grace"
        );
        drop(owner);
        clean(&root);
    }
}

#[test]
fn cached_clock_rejection_is_definitive_without_revoking_the_verified_binding() {
    let root = test_root();
    let (current, current_keys) = signed_v1_named(105, vec![], devices().legacy, "current");
    let (older, older_keys) = signed_v1_named(100, vec![], devices().legacy, "older");
    let (fresh, fresh_keys) = signed_v1_named(220, vec![], devices().legacy, "fresh");
    let keys = format!("{current_keys},{older_keys},{fresh_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(105)).expect("owner");
    owner
        .install(current, wall(105), Duration::ZERO)
        .expect("A");
    let before = owner
        .store
        .fixture::<serde_json::Value>("authority")
        .expect("authority");
    let error = owner
        .install(older, wall(201), Duration::from_secs(96))
        .expect_err("older issuance");
    assert_eq!(error, Error::Clock);
    assert_eq!(
        super::host::response_error(error, true),
        vantare_ipc::control::REJECTED
    );
    assert_eq!(
        super::host::response_error(error, false),
        vantare_ipc::control::UNAVAILABLE
    );
    assert_eq!(
        owner
            .store
            .fixture::<serde_json::Value>("authority")
            .expect("preserved"),
        before
    );
    let policy = owner
        .advance(&photo(false), wall(201), Duration::from_secs(96))
        .expect("Read");
    assert!(policy.state.permits_access());
    assert!(!policy.state.needs_recovery());
    assert_eq!(
        owner.binding.as_ref().expect("A preserved").subject,
        "550e8400-e29b-41d4-a716-446655440000"
    );
    drop(owner);
    let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(202)).expect("restart");
    assert!(
        owner
            .advance(&photo(false), wall(202), Duration::ZERO)
            .expect("Read")
            .state
            .permits_access()
    );
    owner
        .install_online(fresh, wall(220), Duration::from_secs(18))
        .expect("new authenticated grant");
    assert!(
        owner
            .advance(&photo(false), wall(220), Duration::from_secs(18))
            .expect("recovered")
            .state
            .permits_access()
    );
    drop(owner);
    clean(&root);
}

#[test]
fn future_logout_candidate_stays_rejected_after_the_wall_recovers_until_a_new_issuance() {
    let root = test_root();
    let (old, old_keys) = signed_v1_named(100, vec![], devices().legacy, "old");
    let (fresh, fresh_keys) = signed_v1_named(220, vec![], devices().legacy, "fresh");
    let keys = format!("{old_keys},{fresh_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(100)).expect("owner");
    owner
        .install(old.clone(), wall(100), Duration::ZERO)
        .expect("initial credential");
    owner
        .advance(&photo(false), wall(200), Duration::from_secs(1))
        .expect("wrong future wall");
    owner
        .invalidate(wall(110), Duration::from_secs(2))
        .expect("logout during correction");
    drop(owner);
    let mut owner =
        Owner::open(&root, Some(&keys), devices(), 2, wall(201)).expect("wall caught up");
    let before = owner
        .store
        .fixture::<serde_json::Value>("authority")
        .expect("tombstone");
    let error = owner
        .install(old.clone(), wall(201), Duration::ZERO)
        .expect_err("old candidate never becomes new");
    assert_eq!(error, Error::Denied);
    assert_eq!(
        super::host::response_error(error, true),
        vantare_ipc::control::REJECTED
    );
    assert_eq!(
        owner
            .store
            .fixture::<serde_json::Value>("authority")
            .expect("tombstone preserved"),
        before
    );
    let denied = owner
        .advance(&photo(false), wall(201), Duration::ZERO)
        .expect("recovery admission Read");
    assert!(!denied.state.permits_access() && !denied.state.needs_recovery());
    owner
        .install_online(fresh, wall(220), Duration::from_secs(19))
        .expect("strictly newer issuance");
    assert!(
        owner
            .advance(&photo(false), wall(220), Duration::from_secs(19))
            .expect("recovered")
            .state
            .permits_access()
    );
    assert!(matches!(
        owner.install(old, wall(220), Duration::from_secs(19)),
        Err(Error::Denied)
    ));
    drop(owner);
    clean(&root);
}

fn candidate_control_fixture(
    root: &std::path::Path,
    keys: String,
    local_devices: Devices,
) -> (host::Host, vantare_ipc::control::CoreLink) {
    use vantare_ipc::control::{self, CoreLink};
    let name = format!("candidate-{}", vantare_services::random_id().expect("pipe"));
    let nonce = vantare_services::random_id().expect("nonce");
    let pid = std::process::id();
    let host = host::Host::start(
        &name,
        host::Options {
            root: root.into(),
            keys: Some(keys),
            devices: local_devices,
            epoch: 1,
            nonce: Some(nonce.clone()),
        },
        move |peer, _| peer.pid == pid,
    )
    .expect("fixture host");
    let link = CoreLink {
        pipe: control::pipe_name(&name),
        image: std::env::current_exe().expect("fixture image"),
        nonce,
    };
    (host, link)
}

#[test]
fn cached_clock_rejection_reaches_the_wire_but_online_clock_stays_unavailable() {
    use vantare_ipc::control::{self, Command, Failure};
    let root = test_root();
    let now = wall_now();
    let (current, current_keys) =
        signed_v1_named(now.timestamp() + 30, vec![], devices().legacy, "current");
    let (older, older_keys) =
        signed_v1_named(now.timestamp() - 10, vec![], devices().legacy, "older");
    let keys = format!("{current_keys},{older_keys}");
    let mut owner = Owner::open(&root, Some(&keys), devices(), 1, now).expect("owner");
    owner
        .install(current, now, Duration::ZERO)
        .expect("binding");
    let authority = owner
        .store
        .fixture::<serde_json::Value>("authority")
        .expect("authority");
    let binding = owner
        .store
        .fixture::<serde_json::Value>("binding")
        .expect("binding");
    drop(owner);
    let (host, link) = candidate_control_fixture(&root, keys.clone(), devices());
    for (command, expected) in [
        (
            Command::Install {
                credential: older.clone(),
            },
            Failure::Rejected,
        ),
        (
            Command::InstallOnline { credential: older },
            Failure::Unavailable,
        ),
    ] {
        let error = control::request(&link, command).expect_err("older than latest_issued");
        assert_eq!(Failure::classify(&error), expected);
        assert!(control::request(&link, Command::Read).is_ok());
    }
    drop(host);
    let store = Store::open(&root, "core-rights-v1").expect("fixture store");
    assert_eq!(
        store
            .fixture::<serde_json::Value>("binding")
            .expect("preserved"),
        binding
    );
    let after = store
        .fixture::<serde_json::Value>("authority")
        .expect("preserved");
    assert!(authority["clock"]["latest_issued"].is_string());
    assert_eq!(
        after["clock"]["latest_issued"],
        authority["clock"]["latest_issued"]
    );
    drop(store);
    clean(&root);
}

#[test]
fn missing_core_fingerprint_is_unavailable_and_preserves_a_valid_binding() {
    use vantare_ipc::control::{self, Command, Failure};
    let now = wall_now();
    let (credential, keys) = signed_v1(now.timestamp() - 1, vec![]);
    for has_binding in [false, true] {
        let root = test_root();
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, now).expect("owner");
        if has_binding {
            owner
                .install(credential.clone(), now, Duration::ZERO)
                .expect("binding");
        }
        drop(owner);
        let (host, link) = candidate_control_fixture(
            &root,
            keys.clone(),
            Devices {
                legacy: String::new(),
            },
        );
        let error = control::request(
            &link,
            Command::Install {
                credential: credential.clone(),
            },
        )
        .expect_err("missing local identity");
        assert_eq!(Failure::classify(&error), Failure::Unavailable);
        let denied = control::request(&link, Command::Read).expect("available without rights");
        assert!(!denied.state.permits_access());
        drop(host);
        let mut restored =
            Owner::open(&root, Some(&keys), devices(), 2, now).expect("identity restored");
        assert_eq!(restored.binding.is_some(), has_binding);
        restored
            .install(credential.clone(), now, Duration::ZERO)
            .expect("same credential remains valid");
        drop(restored);
        clean(&root);
    }
}
