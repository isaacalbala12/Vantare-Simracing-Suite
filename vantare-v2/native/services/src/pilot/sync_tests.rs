use super::*;
use crate::{bridge::Config, http::Http, test_http::Server};

#[test]
fn existing_photo_400_is_verified_and_network_failure_preserves_pending_copy() {
    let server = Server::start(vec![
        (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
        (200, "null".into()),
        (400, serde_json::json!({"statusCode":"409","error":"Duplicate","message":"The resource already exists"}).to_string()),
    ]);
    let (root, store) = crate::test_store("pilot-duplicate");
    let account = crate::account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config { authorize: server.base.join("functions/v1/native-account-authorize").unwrap(), supabase: server.base.clone(), anon_key: "public-fixture".into() };
    let session = config.authorize(&http, &account, 100).unwrap();
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(300,300).write_to(&mut bytes, image::ImageFormat::Png).unwrap();
    let mut local = Local::open(&root, None, None).unwrap();
    local.save(PilotProfile { photo: Some(super::super::crop_photo(bytes.get_ref(), super::super::Crop::default()).unwrap()), ..Default::default() }, 0).unwrap();
    let before = local.state().clone();
    let request = session.request(&http, &config, &account, 100);
    assert_eq!(synchronize(&mut local, &request), Err(Error::Offline));
    assert_eq!(*local.state(), before);
    server.finish();
    drop(local); drop(account); drop(store);
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn sync_uses_verified_bridge_and_cas_and_preserves_local_on_conflict_or_offline() {
    for (status, body, expected) in [
        (200, "null".to_owned(), Ok(())),
        (200, serde_json::json!({"profile":{},"revision":2,"photo_hash":null}).to_string(), Err(Error::Conflict)),
        (503, "{}".to_owned(), Err(Error::Offline)),
    ] {
        let profile = PilotProfile { public_name: "Piloto".into(), country: Some("ES".into()), ..Default::default() };
        let mut responses = vec![
            (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
            (status, body),
        ];
        if expected.is_ok() { responses.push((200, serde_json::json!({"profile":profile,"revision":1,"photo_hash":null}).to_string())); }
        let server = Server::start(responses);
        let (root, store) = crate::test_store("pilot-sync-bridge");
        let account = crate::account::fixture(&server.base, &store);
        let http = Http::default();
        let config = Config { authorize: server.base.join("functions/v1/native-account-authorize").unwrap(), supabase: server.base.clone(), anon_key: "public-fixture".into() };
        let session = config.authorize(&http, &account, 100).unwrap();
        let request = session.request(&http, &config, &account, 100);
        let mut local = Local::open(&root, None, None).unwrap();
        local.save(profile.clone(), 0).unwrap();
        let before = local.state().clone();
        assert_eq!(synchronize(&mut local, &request), expected);
        assert_eq!(local.state().profile, profile);
        if expected.is_ok() { assert!(!local.state().pending); assert_eq!(local.state().remote_revision, 1); }
        else { assert_eq!(*local.state(), before); }
        let authorize = server.requests.recv_timeout(std::time::Duration::from_secs(3)).unwrap();
        assert!(authorize.starts_with("POST /functions/v1/native-account-authorize "));
        let load = server.requests.recv_timeout(std::time::Duration::from_secs(3)).unwrap();
        assert!(load.starts_with("POST /rest/v1/rpc/pilot_profile_load "));
        assert!(load.to_lowercase().contains("authorization: bearer data-fixture"));
        if expected.is_ok() {
            let save = server.requests.recv_timeout(std::time::Duration::from_secs(3)).unwrap();
            assert!(save.starts_with("POST /rest/v1/rpc/pilot_profile_save "));
            assert!(save.contains("\"p_expected_revision\":0"));
            assert!(!save.contains("account_id"));
        }
        server.finish();
        drop(local); drop(account); drop(store);
        std::fs::remove_dir_all(root).unwrap();
    }
}
