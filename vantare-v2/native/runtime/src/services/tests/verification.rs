//! HTTP → services → núcleo real: el cambio de dueño conserva diagnóstico y cadencia.
use super::online_only::{assert_no_license_copy, seed_account, start_core};
use super::*;
use vantare_services::{app::App, config::BuildConfig, test_http::Server};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Rejection {
    Signature,
    Subject,
    Device,
    Issuance,
    Tombstone,
}

fn response(case: Rejection, device: &str) -> (CredentialV1, String) {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("test entropy");
    let key = SigningKey::from_bytes(&seed);
    let now = crate::rights::wall_now();
    let mut claims = ClaimsV1 {
        issuer: "vantare-license".into(),
        subject: "550e8400-e29b-41d4-a716-446655440000".into(),
        device_fingerprint: device.into(),
        issued_at: (now - chrono::TimeDelta::seconds(10)).to_rfc3339(),
        capabilities: vec![],
    };
    match case {
        Rejection::Subject => claims.subject = "not-an-internal-uuid".into(),
        Rejection::Device => claims.device_fingerprint = "wrong-device".into(),
        Rejection::Issuance => claims.issued_at = (now + chrono::TimeDelta::hours(1)).to_rfc3339(),
        _ => {}
    }
    let bytes = serde_json::to_vec(&Payload {
        version: 1,
        algorithm: "Ed25519",
        key_id: "test",
        claims: &claims,
    })
    .expect("payload");
    let signature = key.sign(if case == Rejection::Signature {
        b"different signed payload"
    } else {
        &bytes
    });
    (
        CredentialV1 {
            version: 1,
            algorithm: "Ed25519".into(),
            key_id: "test".into(),
            claims,
            signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
        },
        format!(
            "test:{}",
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        ),
    )
}

#[test]
fn http_core_signature_subject_device_issuance_and_tombstone_keep_their_typed_results() {
    for case in [
        Rejection::Signature,
        Rejection::Subject,
        Rejection::Device,
        Rejection::Issuance,
        Rejection::Tombstone,
    ] {
        assert_rejection(case);
    }
}

fn assert_rejection(case: Rejection) {
    let root = std::env::temp_dir().join(format!(
        "verify-b-{}",
        vantare_services::random_id().expect("root")
    ));
    let device = vantare_services::license::installation::legacy_fingerprint().expect("device");
    let (credential, keys) = response(case, &device);
    let body = serde_json::json!({"credential":credential, "online_capabilities":[]}).to_string();
    let server = Server::start_observed(vec![(200, body.clone()), (200, body)]);
    let (core, link) = start_core(&root, &keys, &device);
    if case == Rejection::Tombstone {
        control::request(&link, control::Command::Invalidate).expect("durable tombstone");
    }
    let raw = control::request(
        &link,
        control::Command::InstallOnline {
            credential: serde_json::to_string(&credential).expect("credential"),
        },
    )
    .expect_err("typed core rejection");
    let expected = match case {
        Rejection::Signature | Rejection::Subject | Rejection::Device => {
            control::Failure::InvalidCredential
        }
        Rejection::Issuance => control::Failure::Unavailable,
        Rejection::Tombstone => control::Failure::Rejected,
    };
    assert_eq!(control::Failure::classify(&raw), expected, "{case:?}");
    let app_root = root.join("services");
    seed_account(&app_root, &server);
    let mut app = App::with_clock(config(&server, keys), app_root.clone(), || Ok(160));
    app.enable_loopback_for_test();
    app.attach_core(link.clone());
    // Frozen presentation of the previous owner; independent of Error::Display.
    let expected_message = match case {
        Rejection::Signature | Rejection::Subject | Rejection::Device => "actualización requerida",
        Rejection::Issuance => "conexión local interrumpida; se volverá a intentar",
        Rejection::Tombstone => "operación rechazada por el núcleo",
    };
    assert_manual_rejection(&mut app, case, expected_message);
    let policy = control::request(&link, control::Command::Read).expect("no unverified rights");
    assert!(!policy.state.permits_access());
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let now = Instant::now();
    let reply = run_renewal(
        &mut state,
        &policy,
        policy.checked_at_ms,
        now,
        |_, command| app.handle(command),
    )
    .expect("automatic renewal");
    let definitive = case == Rejection::Tombstone;
    let Reply::LicenseFailure { outcome, message } = reply else {
        panic!("{case:?}: same automatic shape")
    };
    assert_eq!(
        outcome,
        if definitive {
            protocol::RenewalOutcome::Definitive
        } else {
            protocol::RenewalOutcome::Transient
        }
    );
    let automatic_message = if expected == control::Failure::InvalidCredential {
        "Actualiza la app para verificar la nueva licencia."
    } else {
        expected_message
    };
    assert_eq!(
        message, automatic_message,
        "{case:?}: same automatic message"
    );
    assert_eq!(
        state.notice.is_some(),
        definitive,
        "{case:?}: no new definitive notice"
    );
    let mut current = control::request(&link, control::Command::Read).expect("policy");
    // Only injected scheduler time advances; freshness has its independent tests.
    current.checked_at_ms = policy.checked_at_ms;
    assert_eq!(
        state
            .renewal
            .claim(&current, policy.checked_at_ms, now + Duration::from_mins(1))
            .is_ok(),
        !definitive,
        "{case:?}: scheduler retries transient"
    );
    assert_no_license_copy(&app_root, server.base.as_str());
    let requests = server.finish_observed();
    assert_eq!(
        requests.len(),
        2,
        "{case:?}: exactly manual and automatic HTTP"
    );
    drop(app);
    drop(core);
    std::fs::remove_dir_all(root).expect("private cleanup");
}

fn config(server: &Server, keys: String) -> BuildConfig {
    BuildConfig {
        supabase: Some(server.base.clone()),
        anon_key: Some("public-test"),
        license_keys: Some(Box::leak(keys.into_boxed_str())),
        channel: Some("test"),
        native_oauth: Some(vantare_services::config::OAuthBuild {
            issuer: server.base.clone(),
            client_id: "fixture".into(),
            redirect_uri: "http://127.0.0.1:0/callback".parse().expect("redirect"),
        }),
    }
}

fn assert_manual_rejection(app: &mut App, case: Rejection, expected_message: &str) {
    let manual = app.handle(Command::LicenseRenew);
    let message_matches = match manual {
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Definitive,
            message,
        } if case == Rejection::Tombstone => message == expected_message,
        Reply::Error { message } if case != Rejection::Tombstone => message == expected_message,
        _ => false,
    };
    assert!(message_matches, "{case:?}: same manual shape and message");
}
