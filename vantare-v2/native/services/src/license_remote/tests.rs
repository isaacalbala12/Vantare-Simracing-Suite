use super::*;
use crate::{account, bridge::Config, http::Http, test_http::Server};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use std::time::Duration;

#[test]
fn explicit_bridge_uses_distinct_data_bearer_and_only_signed_license_grants() {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("test entropy");
    let key = SigningKey::from_bytes(&seed);
    let subject = "550e8400-e29b-41d4-a716-446655440000";
    let payload = r#"{"version":1,"algorithm":"Ed25519","key_id":"test","claims":{"issuer":"vantare-license","subject":"550e8400-e29b-41d4-a716-446655440000","device_fingerprint":"test-device","issued_at":"2026-09-30T10:00:00Z","capabilities":[]}}"#;
    let mut credential: CredentialV1 = serde_json::from_str(&format!(
        "{},\"signature\":\"\"}}",
        &payload[..payload.len() - 1]
    ))
    .expect("test credential");
    credential.signature = URL_SAFE_NO_PAD.encode(key.sign(payload.as_bytes()).to_bytes());
    let data_token = crate::random_id().expect("test entropy");
    let server=Server::start(vec![
        (200,serde_json::json!({"version":1,"account_id":subject,"data_access_token":data_token,"expires_at":160}).to_string()),
        (200,serde_json::json!({"credential":credential,"online_capabilities":["vantare.plan.pro"]}).to_string()),
        (200,"{}".into()),(409,"{\"error\":\"device_limit\"}".into())]);
    let (root, store) = crate::test_store("license-bridge");
    let mut account = account::fixture(&server.base, &store);
    let config = Config {
        authorize: server.base.join("native-bridge").expect("test"),
        supabase: server.base.clone(),
        anon_key: "public-test-key".into(),
    };
    let http = Http::default();
    let session = config.authorize(&http, &account, 100).expect("bridge");
    let verifier = Verifier::public_keys(&format!(
        "test:{}",
        URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
    ))
    .expect("keys");
    let request = session.request(&http, &config, &account, 100);
    let candidate = renew(&request, "test-device", &verifier, &store).expect("renew");
    assert!(
        verifier
            .v1(&candidate.credential, subject, "test-device")
            .expect("verify")
            .grants()
            .is_empty()
    );
    reset_device(&request, "test-device").expect("reset");
    assert!(matches!(
        renew(&request, "test-device", &verifier, &store),
        Err(Error::DeviceLimit)
    ));
    let authorization = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("bridge request");
    assert!(authorization.starts_with("POST /native-bridge "));
    assert!(!authorization.contains(&data_token));
    let renewal = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("renewal request");
    assert!(renewal.starts_with("POST /functions/v1/license-credential "));
    assert!(renewal.contains(&data_token));
    let reset = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("reset request");
    assert!(reset.contains("\"device_fingerprint\":\"test-device\""));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("limit request");
    account.logout(&store).expect("logout");
    assert!(matches!(
        session
            .request(&http, &config, &account, 100)
            .post("functions/v1/license-credential", &serde_json::json!({})),
        Err(Error::Authentication)
    ));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "license-bridge", &["account", "license-candidate"]);
}
