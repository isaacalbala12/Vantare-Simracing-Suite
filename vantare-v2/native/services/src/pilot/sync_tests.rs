use super::*;
use crate::{bridge::Config, http::Http, test_http::Server};

fn colored_photo(color: [u8; 3]) -> PilotPhoto {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(300, 300, image::Rgb(color)))
        .write_to(&mut bytes, image::ImageFormat::Png)
        .expect("PNG");
    super::super::crop_photo(bytes.get_ref(), super::super::Crop::default()).expect("foto")
}

fn remote_document(profile: &PilotProfile, revision: u64) -> String {
    let mut document = profile.clone();
    let hash = document
        .photo
        .take()
        .map(|photo| crate::content_hash(&STANDARD.decode(photo.jpeg).expect("base64")));
    serde_json::json!({"profile":document,"revision":revision,"photo_hash":hash}).to_string()
}

#[test]
fn edited_pending_save_reconciles_lost_confirmation_before_retry_after_restart() {
    for with_photo in [false, true] {
        for conflict in [false, true] {
            for restart in [false, true] {
                let first = PilotProfile {
                    description: "A".into(),
                    photo: with_photo.then(|| colored_photo([200, 0, 0])),
                    ..Default::default()
                };
                let edited = PilotProfile {
                    description: "B".into(),
                    photo: with_photo.then(|| colored_photo([0, 0, 200])),
                    ..first.clone()
                };
                let mut responses = vec![
                (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
                (200, "null".into()),
            ];
                if with_photo {
                    responses.push((200, "{}".into()));
                }
                responses.push((200, "confirmation lost".into()));
                let mut observed = first.clone();
                if conflict {
                    // R+1 distinto: otro escritor, no una confirmación propia.
                    if with_photo {
                        observed.photo = edited.photo.clone();
                    } else {
                        observed.description = "otro dispositivo".into();
                    }
                }
                responses.push((200, remote_document(&observed, 1)));
                if !conflict {
                    if with_photo {
                        responses.push((200, "{}".into()));
                    }
                    responses.push((200, remote_document(&edited, 2)));
                }
                let server = Server::start(responses);
                let (root, store) = crate::test_store("pilot-edited-lost-confirmation");
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
                let session = config.authorize(&http, &account, 100).expect("sesión");
                let request = session.request(&http, &config, &account, 100);
                let mut local = Local::open(&root, None, None).expect("local");
                local.save(first, 0).expect("guardar A");
                assert_eq!(synchronize(&mut local, &request), Err(Error::Protocol));
                // Recorrido PilotSave: B sustituye el pendiente antes de reconciliar A.
                local
                    .save(edited.clone(), local.state().revision)
                    .expect("guardar B");
                if restart {
                    drop(local);
                    local = Local::open(&root, None, None).expect("reinicio con B pendiente");
                }
                let before = local.state().clone();
                if conflict {
                    assert_eq!(synchronize(&mut local, &request), Err(Error::Conflict));
                    assert_eq!(*local.state(), before);
                } else {
                    assert_eq!(synchronize(&mut local, &request), Ok(()));
                    assert_eq!(local.state().profile, edited);
                    assert_eq!(local.state().remote_revision, 2);
                    assert!(!local.state().pending);
                }
                let requests: Vec<_> = server.requests.try_iter().collect();
                let saves: Vec<_> = requests
                    .iter()
                    .filter(|r| r.starts_with("POST /rest/v1/rpc/pilot_profile_save "))
                    .collect();
                assert_eq!(saves.len(), if conflict { 1 } else { 2 });
                if !conflict {
                    assert!(saves[1].contains("\"p_expected_revision\":1"));
                    assert!(saves[1].contains("\"description\":\"B\""));
                }
                server.finish();
                drop(local);
                let local = Local::open(&root, None, None).expect("reinicio final");
                assert_eq!(local.state().profile, edited);
                assert_eq!(local.state().pending, conflict);
                drop(local);
                drop(account);
                drop(store);
                std::fs::remove_dir_all(root).expect("limpieza fixture");
            }
        }
    }
}

#[test]
fn committed_save_with_lost_confirmation_recovers_after_restart_including_photo_hash() {
    for matching_hash in [true, false] {
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(300, 300)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .expect("PNG");
        let profile = PilotProfile {
            public_name: "Piloto".into(),
            photo: Some(
                super::super::crop_photo(bytes.get_ref(), super::super::Crop::default())
                    .expect("foto"),
            ),
            ..Default::default()
        };
        let mut document = profile.clone();
        let jpeg = STANDARD
            .decode(document.photo.take().expect("foto").jpeg)
            .expect("base64");
        let hash = crate::content_hash(&jpeg);
        let remote_hash = if matching_hash {
            hash.clone()
        } else {
            "b".repeat(64)
        };
        // El servidor confirmó R+1 pero su respuesta no se pudo parsear.
        let server = Server::start(vec![
            (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
            (200, "null".into()),
            (200, "{}".into()),
            (200, "confirmation lost".into()),
            (200, serde_json::json!({"profile":document,"revision":1,"photo_hash":remote_hash}).to_string()),
        ]);
        let (root, store) = crate::test_store("pilot-lost-confirmation");
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
        let session = config.authorize(&http, &account, 100).expect("sesión");
        let request = session.request(&http, &config, &account, 100);
        let mut local = Local::open(&root, None, None).expect("local");
        local.save(profile.clone(), 0).expect("save local");
        assert_eq!(synchronize(&mut local, &request), Err(Error::Protocol));
        assert!(local.state().pending);
        drop(local);
        let mut local = Local::open(&root, None, None).expect("reinicio");
        let before = local.state().clone();
        if matching_hash {
            assert_eq!(synchronize(&mut local, &request), Ok(()));
            assert!(!local.state().pending);
            assert_eq!(local.state().remote_revision, 1);
            assert_eq!(local.state().profile, profile);
            local
                .save(PilotProfile::default(), local.state().revision)
                .expect("edición posterior");
            assert_eq!(local.state().remote_revision, 1);
        } else {
            assert_eq!(synchronize(&mut local, &request), Err(Error::Conflict));
            assert_eq!(*local.state(), before);
        }
        server.finish();
        drop(local);
        drop(account);
        drop(store);
        std::fs::remove_dir_all(root).expect("limpieza fixture");
    }
}

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
        (200, "null".to_owned(), Ok(())),
        (
            200,
            serde_json::json!({"profile":{},"revision":2,"photo_hash":null}).to_string(),
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
            (status, body),
        ];
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
        let load = server
            .requests
            .recv_timeout(std::time::Duration::from_secs(3))
            .expect("fixture válida");
        assert!(load.starts_with("POST /rest/v1/rpc/pilot_profile_load "));
        assert!(
            load.to_lowercase()
                .contains("authorization: bearer data-fixture")
        );
        if expected.is_ok() {
            let save = server
                .requests
                .recv_timeout(std::time::Duration::from_secs(3))
                .expect("fixture válida");
            assert!(save.starts_with("POST /rest/v1/rpc/pilot_profile_save "));
            assert!(save.contains("\"p_expected_revision\":0"));
            assert!(!save.contains("account_id"));
        }
        server.finish();
        drop(local);
        drop(account);
        drop(store);
        std::fs::remove_dir_all(root).expect("fixture válida");
    }
}
