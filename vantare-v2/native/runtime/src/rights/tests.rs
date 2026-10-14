use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use vantare_services::license::{Capability, ClaimsV1, ClaimsV2};

fn signed(expiry: i64, issued: i64) -> (String, String) {
    signed_modules(
        expiry + 7200,
        issued,
        vec![Capability {
            key: "vantare.operational.owner".into(),
            paid_through: wall(expiry).to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        }],
    )
}
fn signed_modules(expiry: i64, issued: i64, capabilities: Vec<Capability>) -> (String, String) {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("entropía local");
    let key = SigningKey::from_bytes(&seed);
    let claims = ClaimsV2 {
        version: 2,
        iss: "vantare-license".into(),
        aud: "vantare-native".into(),
        sub: "550e8400-e29b-41d4-a716-446655440000".into(),
        device_key_id: "test-installation".into(),
        iat: u64::try_from(issued).expect("iat"),
        exp: u64::try_from(expiry).expect("exp"),
        capabilities,
    };
    let header = URL_SAFE_NO_PAD.encode(
        serde_json::to_vec(
            &serde_json::json!({"alg":"Ed25519","kid":"test","typ":"vantare-license+jwt"}),
        )
        .expect("header"),
    );
    let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).expect("claims"));
    let payload = format!("{header}.{body}");
    let credential = format!(
        "{payload}.{}",
        URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes())
    );
    let keys = format!(
        "test:{}",
        URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
    );
    (credential, keys)
}
fn devices() -> Devices {
    Devices {
        legacy: "test-legacy".into(),
        installation: "test-installation".into(),
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
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("entropía local");
    let key = SigningKey::from_bytes(&seed);
    let mut credential = CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: "test".into(),
        claims: ClaimsV1 {
            issuer: "vantare-license".into(),
            subject: "550e8400-e29b-41d4-a716-446655440000".into(),
            device_fingerprint: fingerprint,
            issued_at: wall(issued).to_rfc3339(),
            capabilities,
        },
        signature: String::new(),
    };
    // Fixture ASCII en el orden del contrato V1; no expone el firmador productivo.
    let payload = format!(
        r#"{{"version":1,"algorithm":"Ed25519","key_id":"test","claims":{}}}"#,
        serde_json::to_string(&credential.claims).expect("claims")
    );
    credential.signature = URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes());
    (
        serde_json::to_string(&credential).expect("credencial V1"),
        format!(
            "test:{}",
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
        assert!(policy.engineer && policy.overlays_advanced);
        assert_eq!(
            policy.valid_until_ms,
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
            assert!(!policy.engineer && policy.overlays_advanced);
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
            !policy.engineer && policy.overlays_advanced,
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
    let root = test_root();
    let keys = saved_grace(&root, start);
    assert!(matches!(
        Owner::open(&root, Some(&keys), devices(), 2, wall(start + 24)),
        Err(Error::Clock)
    ));
    let mut owner = Owner::open(&root, Some(&keys), devices(), 2, wall(start + 3620))
        .expect("reinicio en plazo vencido");
    assert!(
        !owner
            .advance_observed_session(
                &identified_photo(),
                Some("fixture-session-start-1"),
                wall(start + 3620),
                wall(start + 3620),
                Duration::ZERO,
            )
            .expect("no se renueva la hora")
            .engineer
    );
    drop(owner);
    clean(&root);
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
                    .load::<serde_json::Value>("authority")
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
        if corruption == 1 {
            assert!(matches!(opened, Err(Error::Storage)));
        } else {
            let mut owner = opened.expect("binding conservado");
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
    assert!(p.engineer && p.overlays_advanced);
    assert_eq!(
        p.valid_until_ms,
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
            installation: "wrong-installation".into(),
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
    assert!(installed.engineer && installed.overlays_advanced);
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
        assert!(p.current() && p.engineer && p.overlays_advanced);
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
    assert!(!revoked.engineer && !revoked.overlays_advanced);
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
fn beta_signed_credential_matrix_and_exact_empty_envelope_expiry() {
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
        let (credential, keys) = signed_modules(start + 10, start - 1, grants);
        let root = test_root();
        let mut owner = Owner::open(&root, Some(&keys), devices(), 1, wall(start)).expect("abrir");
        let anonymous = owner
            .advance(&Snapshot::default(), wall(start), Duration::ZERO)
            .expect("sin sesión");
        assert!(!anonymous.overlays_advanced);
        owner
            .install(credential.clone(), wall(start), Duration::ZERO)
            .expect("instalar");
        let policy = owner
            .advance(&Snapshot::default(), wall(start), Duration::ZERO)
            .expect("vigente");
        assert!(policy.overlays_advanced, "{capability:?}");
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
            policy.valid_until_ms,
            Some(
                u64::try_from(
                    start
                        + if capability == Some("vantare.plan.pro") {
                            3
                        } else {
                            10
                        }
                )
                .expect("fecha")
                    * 1000
            )
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
                .overlays_advanced
        );
        let expired = owner
            .advance(
                &Snapshot::default(),
                wall(start + 10),
                Duration::from_secs(9),
            )
            .expect("caducidad exacta");
        assert!(!expired.overlays_advanced);
        assert_eq!(
            [
                expired.engineer,
                expired.strategy,
                expired.analysis,
                expired.calendar
            ],
            [false; 4]
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
                error.overlays_advanced,
                error.engineer,
                error.strategy,
                error.analysis,
                error.calendar
            ],
            [false; 5]
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
            perpetual: key.starts_with("vantare.module.") || key == "vantare.edition.launch_v1",
            scope_version: if key == "vantare.edition.launch_v1" {
                "launch_v1".into()
            } else {
                String::new()
            },
        })
        .collect()
}

#[test]
fn launch_v1_signed_credentials_keep_the_cutoff_offline_and_at_pro_expiry() {
    use vantare_ipc::control::CatalogAccess;
    let start = 1_790_800_000;
    for legacy in [true, false] {
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
        let (credential, keys) = if legacy {
            signed_v1(start - 1, grants)
        } else {
            signed_modules(start + 100, start - 1, grants)
        };
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
            pro.valid_until_ms,
            Some(u64::try_from(start + 3).expect("fecha") * 1000)
        );
        drop(owner);
        let mut owner =
            Owner::open(&root, Some(&keys), devices(), 2, wall(start + 3)).expect("offline");
        let launch = owner
            .advance(&Snapshot::default(), wall(start + 3), Duration::ZERO)
            .expect("LE");
        assert!(launch.overlays_advanced && launch.tester && launch.calendar);
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
        assert!(!revoked.overlays_advanced);
        drop(owner);
        clean(&root);
    }
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
    for (capability, legacy) in [
        (None, true),
        (Some("vantare.module.strategy"), true),
        (None, false),
        (Some("vantare.module.strategy"), false),
    ] {
        let grants = beta_grants(capability, start);
        let (credential, keys) = if legacy {
            signed_v1(start - 1, grants)
        } else {
            signed_modules(start + 3 * 86400, start - 1, grants)
        };
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
            let active = legacy || seconds < 3 * 86400;
            assert_eq!(policy.overlays_advanced, active);
            assert_eq!(policy.strategy, capability.is_some() && active);
            assert!(!policy.engineer && !policy.analysis && !policy.calendar);
        }
        drop(owner);
        clean(&root);
    }
}

#[test]
fn unreadable_installation_preserves_only_a_supported_legacy_device() {
    let root = test_root();
    let installation = root.join("rights");
    let expected = match vantare_services::license::installation::legacy_fingerprint() {
        Ok(device) => device,
        Err(Error::Unsupported) => String::new(),
        Err(error) => panic!("unexpected legacy identity error: {error}"),
    };
    let healthy = local_devices(&installation);
    assert_eq!(healthy.legacy, expected);
    assert!(!healthy.installation.is_empty());
    // Invalid saved schema and an unreadable DPAPI blob exercise both failure paths.
    let store = Store::open(&root, "core-installation-v1").expect("store");
    store
        .save(
            "installation",
            &serde_json::json!({"version":999,"seed":[]}),
        )
        .expect("bad schema");
    drop(store);
    let malformed = local_devices(&installation);
    let file = std::fs::read_dir(&root)
        .expect("root")
        .flatten()
        .find(|entry| entry.path().is_dir())
        .expect("store directory")
        .path()
        .join(if cfg!(windows) {
            "installation.dpapi"
        } else {
            "installation.json"
        });
    std::fs::write(file, b"not a DPAPI blob").expect("corrupt bytes");
    let unreadable = local_devices(&installation);
    assert_eq!(malformed.legacy, expected);
    assert_eq!(unreadable.legacy, expected);
    assert!(malformed.installation.is_empty() && unreadable.installation.is_empty());
    let start = 1_790_770_000;
    let legacy_supported = !expected.is_empty();
    let (credential, keys) = signed_v1_device(start - 1, beta_grants(None, start), expected);
    let mut owner = Owner::open(
        &root.join("rights"),
        Some(&keys),
        unreadable,
        1,
        wall(start),
    )
    .expect("owner");
    let installed = owner.install(credential, wall(start), Duration::ZERO);
    if legacy_supported {
        installed.expect("legacy license");
    } else {
        assert!(matches!(installed, Err(Error::InvalidCredential)));
    }
    let policy = owner
        .advance(&Snapshot::default(), wall(start), Duration::ZERO)
        .expect("policy");
    assert_eq!(policy.overlays_advanced, legacy_supported);
    drop(owner);
    clean(&root);
}
