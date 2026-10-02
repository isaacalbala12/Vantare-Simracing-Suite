use super::*;
use crate::{account, bridge::Config, test_http::Server};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use std::time::Duration;

const SUBJECT: &str = "550e8400-e29b-41d4-a716-446655440000";
const DEVICE: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

pub(crate) fn signed_fixture(device: &str) -> (CredentialV1, &'static str) {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("test entropy");
    let key = SigningKey::from_bytes(&seed);
    let payload = format!(
        r#"{{"version":1,"algorithm":"Ed25519","key_id":"test","claims":{{"issuer":"vantare-license","subject":"{SUBJECT}","device_fingerprint":"{device}","issued_at":"2026-09-30T10:00:00Z","capabilities":[]}}}}"#
    );
    let mut credential: CredentialV1 = serde_json::from_str(&format!(
        "{},\"signature\":\"\"}}",
        &payload[..payload.len() - 1]
    ))
    .expect("test credential");
    credential.signature = URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes());
    let keys = Box::leak(
        format!(
            "test:{}",
            URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
        )
        .into_boxed_str(),
    );
    (credential, keys)
}

fn config(base: &url::Url, keys: &'static str) -> BuildConfig {
    BuildConfig {
        supabase: Some(base.clone()),
        anon_key: Some("public-test-key"),
        license_keys: Some(keys),
        channel: Some("test"),
        native_oauth: None,
    }
}

#[test]
fn native_license_uses_oauth_and_signed_uuid_without_a_data_bridge() {
    let (credential, keys) = signed_fixture(DEVICE);
    let server = Server::start(vec![(
        200,
        serde_json::json!({"credential":credential,"online_capabilities":["vantare.plan.pro"]})
            .to_string(),
    )]);
    let (root, store) = crate::test_store("native-license");
    let mut account = account::fixture(&server.base, &store);
    let config = config(&server.base, keys);
    let http = Http::default();
    let candidate = renew(&http, &config, &account, 100, DEVICE, &store).expect("renew");
    assert_eq!(candidate.account_id, SUBJECT);
    assert_ne!(account.identity().expect("OAuth identity").subject, SUBJECT);
    assert!(
        Verifier::public_keys(keys)
            .expect("keys")
            .v1(&candidate.credential, SUBJECT, DEVICE)
            .expect("verify")
            .grants()
            .is_empty(),
        "online capabilities cannot grant local rights"
    );
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("request");
    assert!(request.starts_with("POST /functions/v1/native-license "));
    let (headers, body) = request.split_once("\r\n\r\n").expect("HTTP body");
    let headers = headers.to_lowercase();
    let bearer = account.bearer(100).expect("OAuth token");
    assert!(headers.contains(&format!("authorization: bearer {bearer}")));
    assert!(headers.contains("apikey: public-test-key"));
    assert_eq!(
        body,
        format!(r#"{{"version":1,"deviceFingerprint":"{DEVICE}"}}"#)
    );
    account.logout(&store).expect("logout");
    assert!(matches!(
        renew(&http, &config, &account, 100, DEVICE, &store),
        Err(Error::Authentication)
    ));
    assert!(
        server.requests.try_recv().is_err(),
        "no request after logout"
    );
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "native-license", &["account", "license-candidate"]);
}

#[test]
fn native_license_maps_remote_errors_without_retry_or_saving_a_candidate() {
    let (_, keys) = signed_fixture(DEVICE);
    let cases = [
        (400, "invalid_request", Error::Protocol),
        (401, "unauthorized", Error::Authentication),
        (403, "forbidden", Error::Denied),
        (409, "device_limit", Error::Conflict),
        (409, "account_conflict", Error::Conflict),
        (413, "request_too_large", Error::Protocol),
        (429, "rate_limited", Error::Offline),
        (503, "bridge_unavailable", Error::Offline),
    ];
    let server = Server::start(
        cases
            .iter()
            .map(|(status, error, _)| {
                (
                    *status,
                    serde_json::json!({"error":error,"message":"generic"}).to_string(),
                )
            })
            .collect(),
    );
    let (root, store) = crate::test_store("native-license-errors");
    let account = account::fixture(&server.base, &store);
    let config = config(&server.base, keys);
    let http = Http::default();
    for (_, _, expected) in cases {
        assert!(
            matches!(renew(&http, &config, &account, 100, DEVICE, &store), Err(error) if error == expected)
        );
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("one request");
        assert!(matches!(
            store.load::<Candidate>("license-candidate"),
            Err(Error::NotFound)
        ));
    }
    assert!(server.requests.try_recv().is_err());
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "native-license-errors", &["account"]);
}

#[test]
fn native_license_rejects_bad_envelopes_signed_bindings_and_unconfigured_builds() {
    let (credential, keys) = signed_fixture(DEVICE);
    let mut tampered = credential.clone();
    tampered.claims.subject = "550e8400-e29b-41d4-a716-446655440001".into();
    let wrong_device = "f".repeat(64);
    let cases = [
        (200, "{}".into(), Error::Protocol, DEVICE),
        (200, serde_json::json!({"credential":credential,"online_capabilities":["unknown"]}).to_string(), Error::Protocol, DEVICE),
        (200, serde_json::json!({"credential":credential,"online_capabilities":[],"token":"unexpected"}).to_string(), Error::Protocol, DEVICE),
        (200, serde_json::json!({"credential":tampered,"online_capabilities":[]}).to_string(), Error::InvalidCredential, DEVICE),
        (200, serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string(), Error::InvalidCredential, &wrong_device),
        (201, "{}".into(), Error::Protocol, DEVICE),
    ];
    let server = Server::start(
        cases
            .iter()
            .map(|(status, body, _, _)| (*status, body.clone()))
            .collect(),
    );
    let (root, store) = crate::test_store("native-license-invalid");
    let account = account::fixture(&server.base, &store);
    let config = config(&server.base, keys);
    let http = Http::default();
    for (_, _, expected, device) in cases {
        assert!(
            matches!(renew(&http, &config, &account, 100, device, &store), Err(error) if error == expected)
        );
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("request");
        assert!(matches!(
            store.load::<Candidate>("license-candidate"),
            Err(Error::NotFound)
        ));
    }
    for missing in 0..3 {
        let mut incomplete = self::config(&server.base, keys);
        match missing {
            0 => incomplete.supabase = None,
            1 => incomplete.anon_key = None,
            _ => incomplete.license_keys = None,
        }
        assert!(matches!(
            renew(&http, &incomplete, &account, 100, DEVICE, &store),
            Err(Error::Unconfigured)
        ));
    }
    for invalid in ["", "test-device", &"F".repeat(64)] {
        assert!(matches!(
            renew(&http, &config, &account, 100, invalid, &store),
            Err(Error::InvalidCredential)
        ));
    }
    assert!(server.requests.try_recv().is_err());
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "native-license-invalid", &["account"]);
}

#[test]
fn device_reset_keeps_the_explicit_data_bridge_contract() {
    let server = Server::start(vec![
        (200, serde_json::json!({"version":1,"account_id":SUBJECT,"data_access_token":"local-data-token","expires_at":160}).to_string()),
        (200, "{}".into()),
    ]);
    let (root, store) = crate::test_store("device-reset-bridge");
    let account = account::fixture(&server.base, &store);
    let config = Config {
        authorize: server.base.join("native-bridge").expect("test"),
        supabase: server.base.clone(),
        anon_key: "public-test-key".into(),
    };
    let http = Http::default();
    let session = config.authorize(&http, &account, 100).expect("bridge");
    reset_device(&session.request(&http, &config, &account, 100), DEVICE).expect("reset");
    let authorization = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("bridge");
    assert!(authorization.starts_with("POST /native-bridge "));
    assert!(!authorization.contains("local-data-token"));
    let reset = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("reset");
    assert!(reset.starts_with("POST /rest/v1/rpc/reset_active_device "));
    assert!(reset.contains("local-data-token"));
    assert!(reset.contains(&format!("\"device_fingerprint\":\"{DEVICE}\"")));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "device-reset-bridge", &["account"]);
}
