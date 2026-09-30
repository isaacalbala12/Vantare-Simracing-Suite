use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use vantare_services::license::{Capability, ClaimsV2};

fn signed(expiry: i64, issued: i64) -> (String, String) {
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
        capabilities: vec![Capability {
            key: "vantare.plan.pro".into(),
            paid_through: DateTime::from_timestamp(expiry, 0)
                .expect("expiry")
                .to_rfc3339(),
            perpetual: false,
            scope_version: String::new(),
        }],
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
fn test_root() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "vantare-rights-test-{}",
        vantare_services::random_id().expect("entropía")
    ))
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
