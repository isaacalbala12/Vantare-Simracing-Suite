use super::*;
use crate::{bridge::Config, http::Http, test_http::Server};

pub(super) fn colored_photo(color: [u8; 3]) -> PilotPhoto {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(300, 300, image::Rgb(color)))
        .write_to(&mut bytes, image::ImageFormat::Png)
        .expect("PNG");
    super::super::crop_photo(bytes.get_ref(), super::super::Crop::default()).expect("foto")
}

#[test]
fn existing_photo_400_is_verified_and_network_failure_preserves_pending_copy() {
    let server = Server::start(vec![
        (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
        (400, serde_json::json!({"statusCode":"409","error":"Duplicate","message":"The resource already exists"}).to_string()),
    ]);
    let (root, store) = crate::test_store("pilot-duplicate");
    let account = crate::account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("fixture válida"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config
        .authorize(&http, &account, 100)
        .expect("fixture válida");
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(300, 300)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .expect("fixture válida");
    let mut local = Local::open(&root, None, None).expect("fixture válida");
    local
        .save(
            PilotProfile {
                photo: Some(
                    super::super::crop_photo(bytes.get_ref(), super::super::Crop::default())
                        .expect("fixture válida"),
                ),
                ..Default::default()
            },
            0,
        )
        .expect("fixture válida");
    let before = local.state().clone();
    let request = session.request(&http, &config, &account, 100);
    assert_eq!(synchronize(&mut local, &request), Err(Error::Offline));
    assert_eq!(*local.state(), before);
    server.finish();
    drop(local);
    drop(account);
    drop(store);
    std::fs::remove_dir_all(root).expect("fixture válida");
}

#[test]
fn sync_uses_verified_bridge_and_cas_and_preserves_local_on_conflict_or_offline() {
    for (status, body, expected) in [
        (200, String::new(), Ok(())),
        (
            409,
            serde_json::json!({"code":"40001"}).to_string(),
            Err(Error::Conflict),
        ),
        (503, "{}".to_owned(), Err(Error::Offline)),
    ] {
        let profile = PilotProfile {
            public_name: "Piloto".into(),
            country: Some("ES".into()),
            ..Default::default()
        };
        let mut responses = vec![
            (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
        ];
        responses.push((
            status,
            if expected.is_ok() {
                serde_json::json!({"profile":profile,"revision":1,"photo_hash":null}).to_string()
            } else {
                body
            },
        ));
        if expected.is_ok() {
            responses.push((
                200,
                serde_json::json!({"profile":profile,"revision":1,"photo_hash":null}).to_string(),
            ));
        }
        let server = Server::start(responses);
        let (root, store) = crate::test_store("pilot-sync-bridge");
        let account = crate::account::fixture(&server.base, &store);
        let http = Http::default();
        let config = Config {
            authorize: server
                .base
                .join("functions/v1/native-account-authorize")
                .expect("fixture válida"),
            supabase: server.base.clone(),
            anon_key: "public-fixture".into(),
        };
        let session = config
            .authorize(&http, &account, 100)
            .expect("fixture válida");
        let request = session.request(&http, &config, &account, 100);
        let mut local = Local::open(&root, None, None).expect("fixture válida");
        local.save(profile.clone(), 0).expect("fixture válida");
        let before = local.state().clone();
        assert_eq!(synchronize(&mut local, &request), expected);
        assert_eq!(local.state().profile, profile);
        if expected.is_ok() {
            assert!(!local.state().pending);
            assert_eq!(local.state().remote_revision, 1);
        } else {
            assert_eq!(*local.state(), before);
        }
        let authorize = server
            .requests
            .recv_timeout(std::time::Duration::from_secs(3))
            .expect("fixture válida");
        assert!(authorize.starts_with("POST /functions/v1/native-account-authorize "));
        let save = server
            .requests
            .recv_timeout(std::time::Duration::from_secs(3))
            .expect("save");
        assert!(save.starts_with("POST /rest/v1/rpc/pilot_profile_save "));
        assert!(
            save.to_lowercase()
                .contains("authorization: bearer data-fixture")
        );
        assert!(save.contains("\"p_expected_revision\":0"));
        assert!(save.contains("\"p_op_id\""));
        assert!(!save.contains("account_id"));
        server.finish();
        drop(local);
        drop(account);
        drop(store);
        std::fs::remove_dir_all(root).expect("fixture válida");
    }
}

#[test]
fn receipt_with_different_document_hash_or_revision_never_confirms_the_operation() {
    let profile = PilotProfile {
        description: "A".into(),
        photo: Some(colored_photo([200, 0, 0])),
        ..Default::default()
    };
    let mut document = profile.clone();
    let jpeg = STANDARD
        .decode(document.photo.take().expect("photo").jpeg)
        .expect("JPEG");
    let hash = crate::content_hash(&jpeg);
    for invalid in [
        serde_json::json!({"profile":document,"revision":2,"photo_hash":hash}),
        serde_json::json!({"profile":document,"revision":1,"photo_hash":"b".repeat(64)}),
        serde_json::json!({"profile":{"description":"other device"},"revision":1,"photo_hash":hash}),
    ] {
        let server = Server::start(vec![
            (200,serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
            (200,"{}".into()), (200,invalid.to_string()),
        ]);
        let (root, store) = crate::test_store("pilot-invalid-receipt");
        let account = crate::account::fixture(&server.base, &store);
        let http = Http::default();
        let config = Config {
            authorize: server
                .base
                .join("functions/v1/native-account-authorize")
                .expect("URL"),
            supabase: server.base.clone(),
            anon_key: "public-fixture".into(),
        };
        let session = config.authorize(&http, &account, 100).expect("session");
        let mut local = Local::open(&root, None, None).expect("local");
        local.save(profile.clone(), 0).expect("save");
        let before = local.state().clone();
        let id = local.operation.as_ref().expect("op").op_id.clone();
        assert_eq!(
            synchronize(&mut local, &session.request(&http, &config, &account, 100)),
            Err(Error::Protocol)
        );
        assert_eq!(*local.state(), before);
        assert_eq!(local.operation.as_ref().expect("op").op_id, id);
        server.finish();
        drop(local);
        let local = Local::open(&root, None, None).expect("restart");
        assert_eq!(*local.state(), before);
        assert_eq!(local.operation.as_ref().expect("op").op_id, id);
        drop(local);
        drop(account);
        drop(store);
        std::fs::remove_dir_all(root).expect("cleanup");
    }
}
