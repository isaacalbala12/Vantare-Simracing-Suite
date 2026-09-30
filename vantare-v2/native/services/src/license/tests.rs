use super::*;
use ed25519_dalek::{Signer, SigningKey};
use std::time::Duration;

const SUBJECT: &str = "550e8400-e29b-41d4-a716-446655440000";
fn key() -> SigningKey {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("test entropy");
    SigningKey::from_bytes(&seed)
}
fn verifier(key: &SigningKey) -> Verifier {
    Verifier::public_keys(&format!(
        "test:{}",
        URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
    ))
    .expect("public key")
}
fn v1(key: &SigningKey, expiry: &str) -> CredentialV1 {
    let mut value = CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: "test".into(),
        claims: ClaimsV1 {
            issuer: ISSUER.into(),
            subject: SUBJECT.into(),
            device_fingerprint: "test-device".into(),
            issued_at: "2026-09-30T10:00:00Z".into(),
            capabilities: vec![Capability {
                key: "vantare.plan.pro".into(),
                paid_through: expiry.into(),
                perpetual: false,
                scope_version: String::new(),
            }],
        },
        signature: String::new(),
    };
    value.signature = URL_SAFE_NO_PAD.encode(
        key.sign(&value.signing_bytes().expect("payload"))
            .to_bytes(),
    );
    value
}
fn jws(key: &SigningKey, claims: &ClaimsV2, alg: &str) -> String {
    let header = URL_SAFE_NO_PAD.encode(
        serde_json::to_vec(
            &serde_json::json!({"alg":alg,"kid":"test","typ":"vantare-license+jwt"}),
        )
        .expect("header"),
    );
    let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(claims).expect("claims"));
    let payload = format!("{header}.{body}");
    format!(
        "{payload}.{}",
        URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes())
    )
}

#[test]
fn generated_signatures_cover_v1_binding_mutation_scopes_and_jws_algorithm_audience() {
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00.123456789Z");
    assert_eq!(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify")
            .grants()[0]
            .expires_at
            .expect("expiry")
            .timestamp_subsec_nanos(),
        123_456_789
    );
    assert!(
        verifier
            .v1(&credential, "user_clerk", "test-device")
            .is_err()
    );
    assert!(verifier.v1(&credential, SUBJECT, "another-device").is_err());
    let mut mutation = credential.clone();
    mutation.claims.capabilities[0].perpetual = true;
    assert!(verifier.v1(&mutation, SUBJECT, "test-device").is_err());
    mutation.signature = URL_SAFE_NO_PAD.encode(
        signing
            .sign(&mutation.signing_bytes().expect("payload"))
            .to_bytes(),
    );
    assert!(verifier.v1(&mutation, SUBJECT, "test-device").is_err()); // Pro cannot be perpetual even if signed.
    mutation = credential.clone();
    mutation.key_id = "unknown".into();
    assert!(verifier.v1(&mutation, SUBJECT, "test-device").is_err());
    let other = key();
    assert!(
        self::verifier(&other)
            .v1(&credential, SUBJECT, "test-device")
            .is_err()
    );
    let mut claims = ClaimsV2 {
        version: 2,
        iss: ISSUER.into(),
        aud: AUDIENCE.into(),
        sub: SUBJECT.into(),
        device_key_id: "installation-fixture".into(),
        iat: 100,
        exp: 200,
        capabilities: credential.claims.capabilities.clone(),
    };
    assert_eq!(
        verifier
            .jws(
                &jws(&signing, &claims, "Ed25519"),
                SUBJECT,
                "installation-fixture"
            )
            .expect("JWS")
            .grants()[0]
            .expires_at
            .expect("envelope expiry")
            .timestamp(),
        200
    );
    assert!(
        verifier
            .jws(
                &jws(&signing, &claims, "none"),
                SUBJECT,
                "installation-fixture"
            )
            .is_err()
    );
    assert!(
        verifier
            .jws(
                &jws(&signing, &claims, "EdDSA"),
                SUBJECT,
                "installation-fixture"
            )
            .is_err()
    );
    claims.aud = "another-product".into();
    assert!(
        verifier
            .jws(
                &jws(&signing, &claims, "Ed25519"),
                SUBJECT,
                "installation-fixture"
            )
            .is_err()
    );
    claims.aud = AUDIENCE.into();
    claims.exp = 99;
    assert!(
        verifier
            .jws(
                &jws(&signing, &claims, "Ed25519"),
                SUBJECT,
                "installation-fixture"
            )
            .is_err()
    );
}

#[test]
fn v1_signing_payload_matches_go_html_escaping_without_real_keys() {
    let signing = key();
    let mut credential = v1(&signing, "2026-09-30T11:00:00Z");
    credential.key_id = "<test&>\u{2028}\u{2029}".into();
    let payload = String::from_utf8(credential.signing_bytes().expect("payload")).expect("utf8");
    assert!(payload.contains("\\u003ctest\\u0026\\u003e\\u2028\\u2029"));
    assert!(payload.starts_with("{\"version\":1,\"algorithm\":\"Ed25519\",\"key_id\":"));
    assert!(!payload.contains("signature"));
}

#[cfg(windows)]
#[test]
fn core_policy_keeps_exact_hour_only_for_existing_game_survives_restart_and_logout() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let (root, store) = crate::test_store("core-policy");
    let mut core = Authority::restore(&store).expect("core");
    core.install(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify"),
        date("2026-09-30T10:00:00Z").expect("date"),
        Duration::ZERO,
    )
    .expect("install");
    core.enter_game(
        7,
        date("2026-09-30T10:30:00Z").expect("date"),
        Duration::from_mins(30),
    )
    .expect("entry");
    assert_eq!(
        core.rights(
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::from_secs(7199)
        )
        .expect("hour")
        .len(),
        1
    );
    core.persist(&store).expect("persist");
    let mut restarted = Authority::restore(&store).expect("restart");
    restarted
        .install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("verify"),
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::ZERO,
        )
        .expect("restore credential");
    assert!(
        restarted
            .rights(date("2026-09-30T11:59:59Z").expect("date"), Duration::ZERO)
            .expect("without confirmed game")
            .is_empty()
    );
    restarted
        .enter_game(
            7,
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::ZERO,
        )
        .expect("same core-observed game");
    assert_eq!(
        restarted
            .rights(date("2026-09-30T11:59:59Z").expect("date"), Duration::ZERO)
            .expect("hour")
            .len(),
        1
    );
    assert!(
        restarted
            .rights(
                date("2026-09-30T12:00:00Z").expect("date"),
                Duration::from_secs(1)
            )
            .expect("exact end")
            .is_empty()
    );
    assert!(matches!(
        restarted.rights(
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::from_secs(2)
        ),
        Err(Error::Clock)
    ));
    restarted
        .invalidate(
            date("2026-09-30T12:00:00Z").expect("date"),
            Duration::from_secs(1),
        )
        .expect("logout");
    restarted.persist(&store).expect("tombstone");
    let mut logged_out = Authority::restore(&store).expect("restart");
    assert!(matches!(
        logged_out.install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("verify"),
            date("2026-09-30T12:00:00Z").expect("date"),
            Duration::ZERO
        ),
        Err(Error::Denied)
    ));
    drop(store);
    crate::cleanup_store(&root, "core-policy", &["authority"]);
}

#[cfg(windows)]
#[test]
fn no_offline_grace_outside_game_or_for_already_expired_game_entry() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let (root, store) = crate::test_store("no-grace");
    let mut core = Authority::restore(&store).expect("core");
    core.install(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify"),
        date("2026-09-30T11:00:00Z").expect("date"),
        Duration::ZERO,
    )
    .expect("install");
    assert!(
        core.rights(date("2026-09-30T11:00:00Z").expect("date"), Duration::ZERO)
            .expect("outside")
            .is_empty()
    );
    core.enter_game(
        2,
        date("2026-09-30T11:00:00Z").expect("date"),
        Duration::ZERO,
    )
    .expect("entry");
    assert!(
        core.rights(date("2026-09-30T11:00:00Z").expect("date"), Duration::ZERO)
            .expect("expired at entry")
            .is_empty()
    );
    core.persist(&store).expect("persist");
    drop(store);
    crate::cleanup_store(&root, "no-grace", &["authority"]);
}

#[cfg(windows)]
#[test]
fn installation_key_is_stable_protected_and_signs_only_enrollment_domain() {
    use installation::Installation;
    let (root, store) = crate::test_store("installation-test");
    let installation = Installation::load_or_create(&store).expect("installation");
    let public = installation.public_key();
    let id = installation.key_id();
    assert_eq!(
        Installation::load_or_create(&store)
            .expect("reload")
            .key_id(),
        id
    );
    let mut challenge = [0; 32];
    getrandom::fill(&mut challenge).expect("test entropy");
    let proof = URL_SAFE_NO_PAD
        .decode(installation.enrollment_proof(&challenge).expect("proof"))
        .expect("base64");
    let bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(public)
        .expect("public")
        .try_into()
        .expect("32 bytes");
    let mut payload = b"vantare.installation.enroll.v1\0".to_vec();
    payload.extend_from_slice(&challenge);
    VerifyingKey::from_bytes(&bytes)
        .expect("public key")
        .verify_strict(&payload, &Signature::from_slice(&proof).expect("signature"))
        .expect("domain proof");
    assert!(installation.enrollment_proof(b"short").is_err());
    drop(store);
    crate::cleanup_store(&root, "installation-test", &["installation"]);
}
