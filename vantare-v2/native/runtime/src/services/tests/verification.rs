//! HTTP → services → núcleo real: el cambio de dueño conserva diagnóstico y cadencia.
use super::online_only::{assert_no_license_copy, seed_account, start_core};
use super::*;
use vantare_services::{app::App, config::BuildConfig, test_http::Server};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Rejection {
    Signature,
    MalformedSubject,
    OtherAccount,
    Device,
    Issuance,
    Tombstone,
}

fn response(case: Rejection, device: &str) -> (CredentialV1, String, CredentialV1) {
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
    let bound = signed(&key, &claims, false);
    match case {
        Rejection::OtherAccount => claims.subject = "550e8400-e29b-41d4-a716-446655440001".into(),
        Rejection::MalformedSubject => claims.subject = "not-an-internal-uuid".into(),
        Rejection::Device => claims.device_fingerprint = "wrong-device".into(),
        Rejection::Issuance => claims.issued_at = (now + chrono::TimeDelta::hours(1)).to_rfc3339(),
        _ => {}
    }
    (
        signed(&key, &claims, case == Rejection::Signature),
        format!(
            "test:{}",
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        ),
        bound,
    )
}

fn signed(key: &SigningKey, claims: &ClaimsV1, invalid_signature: bool) -> CredentialV1 {
    let bytes = serde_json::to_vec(&Payload {
        version: 1,
        algorithm: "Ed25519",
        key_id: "test",
        claims,
    })
    .expect("payload");
    let signature = key.sign(if invalid_signature {
        b"different signed payload"
    } else {
        &bytes
    });
    CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: "test".into(),
        claims: claims.clone(),
        signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
    }
}

#[test]
fn http_core_signature_subject_device_issuance_and_tombstone_keep_their_typed_results() {
    for case in [
        Rejection::Signature,
        Rejection::MalformedSubject,
        Rejection::OtherAccount,
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
    let (credential, keys, bound) = response(case, &device);
    let body = serde_json::json!({"credential":credential, "online_capabilities":[]}).to_string();
    let server = Server::start_observed(vec![(200, body.clone()), (200, body)]);
    let (core, link) = start_core(&root, &keys, &device);
    let expected = assert_core_rejection(case, &link, &credential, &bound);
    let app_root = root.join("services");
    seed_account(&app_root, &server);
    let mut app = App::with_clock(config(&server, keys), app_root.clone(), || Ok(160));
    app.enable_loopback_for_test();
    app.attach_core(link.clone());
    // Frozen presentation of the previous owner; independent of Error::Display.
    let expected_message = match case {
        Rejection::Signature | Rejection::MalformedSubject | Rejection::Device => {
            "actualización requerida"
        }
        Rejection::Issuance => "conexión local interrumpida; se volverá a intentar",
        Rejection::Tombstone | Rejection::OtherAccount => "operación rechazada por el núcleo",
    };
    assert_manual_rejection(&mut app, case, expected_message);
    let policy = control::request(&link, control::Command::Read).expect("no unverified rights");
    assert_eq!(
        policy.state.permits_access(),
        case == Rejection::OtherAccount,
        "previous verified account stays intact"
    );
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
    let definitive = matches!(case, Rejection::Tombstone | Rejection::OtherAccount);
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
        } if matches!(case, Rejection::Tombstone | Rejection::OtherAccount) => {
            message == expected_message
        }
        Reply::Error { message }
            if !matches!(case, Rejection::Tombstone | Rejection::OtherAccount) =>
        {
            message == expected_message
        }
        _ => false,
    };
    assert!(message_matches, "{case:?}: same manual shape and message");
}

fn assert_core_rejection(
    case: Rejection,
    link: &control::CoreLink,
    credential: &CredentialV1,
    bound: &CredentialV1,
) -> control::Failure {
    if case == Rejection::OtherAccount {
        control::request(
            link,
            control::Command::InstallOnline {
                credential: serde_json::to_string(bound).expect("verified original account"),
            },
        )
        .expect("durable original binding");
    }
    if case == Rejection::Tombstone {
        control::request(link, control::Command::Invalidate).expect("durable tombstone");
    }
    let raw = control::request(
        link,
        control::Command::InstallOnline {
            credential: serde_json::to_string(credential).expect("credential"),
        },
    )
    .expect_err("typed core rejection");
    let expected = match case {
        Rejection::Signature | Rejection::MalformedSubject | Rejection::Device => {
            control::Failure::InvalidCredential
        }
        Rejection::Issuance => control::Failure::Unavailable,
        Rejection::Tombstone | Rejection::OtherAccount => control::Failure::Rejected,
    };
    assert_eq!(control::Failure::classify(&raw), expected, "{case:?}");
    expected
}
