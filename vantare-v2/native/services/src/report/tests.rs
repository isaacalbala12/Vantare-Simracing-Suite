use super::*;
use crate::{account, bridge::Config, http::Http, test_http::Server};
use std::os::windows::fs::OpenOptionsExt;
use std::time::Duration;

fn hold_draft(root: &std::path::Path) -> std::fs::File {
    let namespace = root.join(format!("{:x}", Sha256::digest(b"report-retry")));
    std::fs::OpenOptions::new()
        .read(true)
        .share_mode(windows_sys::Win32::Storage::FileSystem::FILE_SHARE_READ)
        .open(namespace.join("report-draft.dpapi"))
        .expect("hold own fixture without delete sharing")
}
fn assert_text_only_retry(first: &str, second: &str, preview: &Preview) {
    assert_eq!(
        first.split("\r\n\r\n").nth(1),
        second.split("\r\n\r\n").nth(1)
    );
    let payload: serde_json::Value = serde_json::from_str(&preview.payload).expect("preview");
    assert_eq!(payload["p_include_logs"], false);
    assert_eq!(payload["p_include_diagnostic"], false);
    assert!(payload["p_diagnostic_payload"].is_null());
}

fn persist_inflight(store: &Store) {
    // Crash after POST but before receipt/status persistence leaves InFlight.
    let mut crashed = store
        .load::<Attempt>("report-attempt")
        .expect("crash snapshot");
    crashed.phase = Phase::InFlight;
    store
        .save("report-attempt", &crashed)
        .expect("crash fixture");
}

fn assert_durable_receipt(store: &Store, report_id: &str) {
    let persisted = Reports::restore(store).expect("durable receipt");
    assert!(
        persisted
            .receipt()
            .is_some_and(|receipt| receipt.report_id == report_id)
    );
}

fn fields() -> Fields {
    Fields {
        action_text: "Abrí el panel".into(),
        expected_text: "Ver el panel".into(),
        observed_text: "Se quedó vacío".into(),
        context_text: "Tras reiniciar".into(),
        module: "hub".into(),
    }
}
fn environment() -> Environment {
    Environment {
        channel: "nightly".into(),
        app_version: "native-fixture".into(),
        os_version: "Windows fixture".into(),
        installation: None,
    }
}

#[test]
fn installation_metadata_respects_context_limit_without_changing_the_draft() {
    let (root, store) = crate::test_store("report-context-limit");
    let mut fields = fields();
    fields.context_text = "x".repeat(4096);
    let draft = save_draft(&store, fields.clone()).expect("draft at limit");
    let mut environment = environment();
    environment.installation = Some(installation_context(&root, "beta").expect("installation"));
    assert!(matches!(
        Submission::new(draft, environment),
        Err(Error::TooLarge)
    ));
    assert_eq!(
        load_draft(&store).expect("load").expect("draft").fields,
        fields
    );
    drop(store);
    crate::cleanup_store(&root, "report-context-limit", &[]);
}

fn authorization() -> (u16, String) {
    (200,serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string())
}
fn screenshot_batch(image: &screenshots::Screenshot, state: &str) -> String {
    serde_json::json!([{"batch_id":"550e8400-e29b-41d4-a716-446655440001","slots":[{
        "position":1,"evidenceId":"550e8400-e29b-41d4-a716-446655440002",
        "objectPath":"v1/0123456789abcdef0123456789abcdef/550e8400-e29b-41d4-a716-446655440001/550e8400-e29b-41d4-a716-446655440002",
        "sha256":image.digest().expect("digest"),"state":state}]}]).to_string()
}

#[test]
fn screenshots_upload_then_finalize_then_attach_and_retry_after_validation() {
    let image =
        screenshots::Screenshot::encode(&image::DynamicImage::new_rgb8(64, 48)).expect("JPEG");
    let server = Server::start(vec![authorization(),
        (200,screenshot_batch(&image,"prepared")),(200,"{}".into()),(200,"[]".into()),
        (400,serde_json::json!({"code":"55000","message":"testing_center_evidence_not_ready"}).to_string()),
        (200,screenshot_batch(&image,"ready")),
        (200,serde_json::json!([{"report_id":format!("report_{}","a".repeat(64)),"report_state":"submitted","idempotent":false,"created_at":"2026-10-03T10:00:00Z"}]).to_string())]);
    let (root, store) = crate::test_store("report-images");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("authorize");
    let request = session.request(&http, &config, &account, 100);
    let mut draft = save_draft(&store, fields()).expect("draft");
    draft.screenshots.push(image.preview.clone());
    store
        .save("report-images", &vec![image.clone()])
        .expect("protected images");
    store.save("report-draft", &draft).expect("draft");
    let mut reports = Reports::restore(&store).expect("restore");
    let installation = installation_context(&root, "beta").expect("installation ID");
    assert_eq!(
        installation_context(&root, "beta").expect("stable ID"),
        installation
    );
    let environment = Environment {
        channel: rpc_channel("beta").into(),
        app_version: crate::product::VERSION.into(),
        installation: Some(installation.clone()),
        ..environment()
    };
    let preview = reports
        .prepare_with_images(&request, draft, environment, vec![image])
        .expect("preview");
    assert_eq!(preview.screenshots.len(), 1);
    assert_eq!(preview.channel, "testers");
    let payload: serde_json::Value = serde_json::from_str(&preview.payload).expect("JSON");
    assert_eq!(
        payload["reporte"]["p_context_text"],
        format!("Tras reiniciar\n\n{installation}")
    );
    assert_eq!(payload["reporte"]["p_app_version"], crate::product::VERSION);
    assert_eq!(
        load_draft(&store)
            .expect("original draft")
            .expect("draft")
            .fields,
        fields()
    );
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::EvidencePending)
    ));
    assert!(load_draft(&store).expect("draft retained").is_some());
    let mut restored = Reports::restore(&store).expect("restart");
    let retry = restored
        .prepare_retry(&request, rpc_channel("beta"))
        .expect("retry");
    assert_eq!(retry.digest, preview.digest);
    assert_eq!(retry.payload, preview.payload);
    assert_eq!(retry.screenshots[0].jpeg, preview.screenshots[0].jpeg);
    restored
        .send(&request, &retry.id, &store)
        .expect("confirmed");
    assert!(load_draft(&store).expect("draft cleared").is_none());
    for route in [
        "/functions/v1/native-account-authorize",
        "/rest/v1/rpc/testing_center_prepare_screenshot_batch",
        "/storage/v1/object/testing-center-evidence/v1/",
        "/rest/v1/rpc/testing_center_finalize_screenshot",
        "/rest/v1/rpc/testing_center_submit_report_with_evidence",
        "/rest/v1/rpc/testing_center_prepare_screenshot_batch",
        "/rest/v1/rpc/testing_center_submit_report_with_evidence",
    ] {
        let sent = server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("HTTP");
        assert!(sent.starts_with(&format!("POST {route}")));
        if !route.contains("authorize") {
            assert!(
                sent.to_lowercase()
                    .contains("authorization: bearer data-fixture")
            );
        }
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "report-images", &[]);
}

#[test]
fn missing_tester_preserves_draft_and_submission() {
    let server = Server::start(vec![
        authorization(),
        (
            403,
            "{\"message\":\"testing_center_membership_required\"}".into(),
        ),
    ]);
    let (root, store) = crate::test_store("report-no-role");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("authorize");
    let request = session.request(&http, &config, &account, 100);
    let draft = save_draft(&store, fields()).expect("draft");
    let mut reports = Reports::restore(&store).expect("restore");
    let preview = reports
        .prepare(&request, draft.clone(), environment())
        .expect("preview");
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::Denied)
    ));
    assert!(
        crate::app::report_error(Error::Denied)
            .starts_with("Tu cuenta aún no está habilitada para enviar reportes")
    );
    assert_eq!(
        load_draft(&store)
            .expect("draft retained")
            .expect("draft")
            .idempotency_key,
        draft.idempotency_key
    );
    assert!(
        Reports::restore(&store)
            .expect("restart")
            .prepare_retry(&request, "nightly")
            .is_ok()
    );
    for _ in 0..2 {
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("HTTP");
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "report-no-role", &[]);
}

#[test]
fn screenshot_upload_rejection_retains_draft_without_attaching_report() {
    let image =
        screenshots::Screenshot::encode(&image::DynamicImage::new_rgb8(64, 48)).expect("JPEG");
    let server = Server::start(vec![
        authorization(),
        (200, screenshot_batch(&image, "prepared")),
        (413, "{}".into()),
    ]);
    let (root, store) = crate::test_store("report-image-limit");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("authorize");
    let request = session.request(&http, &config, &account, 100);
    let mut draft = save_draft(&store, fields()).expect("draft");
    draft.screenshots.push(image.preview.clone());
    store
        .save("report-images", &vec![image.clone()])
        .expect("images");
    store.save("report-draft", &draft).expect("draft");
    let mut reports = Reports::restore(&store).expect("restore");
    let preview = reports
        .prepare_with_images(&request, draft, environment(), vec![image])
        .expect("preview");
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::TooLarge)
    ));
    assert!(load_draft(&store).expect("preserved").is_some());
    let image_id = preview.screenshots[0].id.clone();
    let corrected = screenshots::remove(&store, &image_id).expect("remove rejected image");
    assert!(
        reports
            .prepare(&request, corrected, environment())
            .expect("corrected preview")
            .screenshots
            .is_empty()
    );
    for _ in 0..3 {
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("HTTP");
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "report-image-limit", &[]);
}

#[test]
fn unauthorized_submission_preserves_draft_and_exact_retry() {
    let server = Server::start(vec![
        (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
        (401, "{}".into()),
    ]);
    let (root, store) = crate::test_store("report-401");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("bridge");
    let request = session.request(&http, &config, &account, 100);
    let draft = save_draft(&store, fields()).expect("draft");
    let mut reports = Reports::restore(&store).expect("restore");
    let preview = reports
        .prepare(&request, draft.clone(), environment())
        .expect("preview");
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::Authentication)
    ));
    assert_eq!(
        load_draft(&store)
            .expect("draft retained")
            .expect("draft")
            .idempotency_key,
        draft.idempotency_key
    );
    let mut restored = Reports::restore(&store).expect("restart");
    let retry = restored.prepare_retry(&request, "nightly").expect("retry");
    assert_eq!(preview.payload, retry.payload);
    assert!(matches!(
        restored.attempt.as_ref().expect("durable").phase,
        Phase::Rejected
    ));
    for _ in 0..2 {
        server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("request");
    }
    server.finish();
    // El listener ya está cerrado: caída de red real en loopback, sin POST
    // recibido ni respuesta que pudiera confirmar el intento.
    assert!(matches!(
        restored.send(&request, &retry.id, &store),
        Err(Error::Uncertain)
    ));
    let pending = Reports::restore(&store).expect("offline attempt durable");
    assert!(matches!(
        pending.attempt.as_ref().expect("attempt").phase,
        Phase::Uncertain
    ));
    assert!(
        load_draft(&store)
            .expect("draft retained offline")
            .is_some()
    );
    drop(store);
    crate::cleanup_store(
        &root,
        "report-401",
        &["account", "report-draft", "report-attempt"],
    );
}

#[test]
fn durable_manual_retry_keeps_exact_payload_and_receipt_survives_cleanup_failure() {
    let report_id = format!("report_{}", crate::random_id().expect("entropy"));
    let server=Server::start(vec![
        (200,serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":crate::random_id().expect("entropy"),"expires_at":160}).to_string()),
        (503,"{}".into()),(200,serde_json::json!([{"report_id":report_id,"report_state":"submitted","idempotent":true,"created_at":"2026-09-30T10:00:00Z"}]).to_string())]);
    let (root, store) = crate::test_store("report-retry");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("url"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("bridge");
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("bridge request");
    let request = session.request(&http, &config, &account, 100);
    let draft = save_draft(&store, fields()).expect("draft");
    assert_eq!(
        save_draft(&store, fields())
            .expect("same draft")
            .idempotency_key,
        draft.idempotency_key
    );
    let mut reports = Reports::restore(&store).expect("restore");
    reports
        .prepare(&request, draft.clone(), environment())
        .expect("preview");
    assert!(matches!(
        reports.send(&request, "wrong-preview", &store),
        Err(Error::Canceled)
    ));
    assert!(matches!(
        store.load::<Attempt>("report-attempt"),
        Err(Error::NotFound)
    ));
    let preview = reports
        .prepare(&request, draft, environment())
        .expect("preview");
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::Uncertain)
    ));
    let first = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("first submit");
    assert!(first.starts_with("POST /rest/v1/rpc/testing_center_submit_report "));
    assert!(matches!(
        store
            .load::<Attempt>("report-attempt")
            .expect("durable")
            .phase,
        Phase::Uncertain
    ));
    persist_inflight(&store);
    drop(reports);
    let mut restored = Reports::restore(&store).expect("restart");
    assert!(server.requests.try_recv().is_err()); // restore does not submit.
    assert!(matches!(
        restored.send(&request, &preview.id, &store),
        Err(Error::Canceled)
    ));
    assert!(matches!(
        restored.prepare_retry(&request, "testers"),
        Err(Error::Authentication)
    ));
    let retry = restored
        .prepare_retry(&request, "nightly")
        .expect("manual new preview");
    assert_eq!(retry.payload, preview.payload);
    assert_ne!(retry.id, preview.id);
    // Hold only this test's draft file without delete sharing: simulate cleanup failure.
    let held = hold_draft(&root);
    let (receipt, draft_state) = restored
        .send(&request, &retry.id, &store)
        .expect("confirmed send");
    assert_eq!(draft_state, DraftState::CleanupPending);
    assert!(receipt.idempotent);
    assert_eq!(receipt.report_id, report_id);
    drop(held);
    let second = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("retry submit");
    assert_text_only_retry(&first, &second, &retry);
    assert_durable_receipt(&store, &report_id);
    server.finish();
    drop(store);
    crate::cleanup_store(
        &root,
        "report-retry",
        &["account", "report-draft", "report-attempt"],
    );
}

#[test]
fn confirmed_retry_preserves_a_later_draft_and_does_not_resubmit() {
    let report_id = format!("report_{}", crate::random_id().expect("entropy"));
    let server = Server::start(vec![
        (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":crate::random_id().expect("entropy"),"expires_at":160}).to_string()),
        (503, "{}".into()),
        (200, serde_json::json!([{"report_id":report_id,"report_state":"submitted","idempotent":true,"created_at":"2026-09-30T10:00:00Z"}]).to_string()),
    ]);
    let (root, store) = crate::test_store("report-new-draft");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("url"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("bridge");
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("bridge request");
    let request = session.request(&http, &config, &account, 100);
    let first_draft = save_draft(&store, fields()).expect("first draft");
    let mut reports = Reports::restore(&store).expect("reports");
    let preview = reports
        .prepare(&request, first_draft.clone(), environment())
        .expect("preview");
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::Uncertain)
    ));
    let first = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("first submit");
    let mut edited = fields();
    edited.observed_text = "Nuevo informe sin enviar".into();
    let later_draft = save_draft(&store, edited).expect("later draft");
    assert_ne!(first_draft.idempotency_key, later_draft.idempotency_key);
    let retry = reports.prepare_retry(&request, "nightly").expect("retry");
    assert_eq!(retry.payload, preview.payload);
    let (receipt, draft_state) = reports.send(&request, &retry.id, &store).expect("receipt");
    assert_eq!(draft_state, DraftState::Preserved);
    assert_eq!(
        serde_json::to_value(load_draft(&store).expect("draft")).expect("json"),
        serde_json::to_value(Some(&later_draft)).expect("json")
    );
    let second = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("retry submit");
    assert_text_only_retry(&first, &second, &retry);
    let mut restored = Reports::restore(&store).expect("restore");
    assert_eq!(
        restored.draft_state(&store).expect("draft state"),
        DraftState::Preserved
    );
    assert_eq!(
        restored.receipt().expect("durable receipt").report_id,
        receipt.report_id
    );
    assert!(matches!(
        restored.prepare_retry(&request, "nightly"),
        Err(Error::Conflict)
    ));
    assert_eq!(
        serde_json::to_value(load_draft(&store).expect("durable draft")).expect("json"),
        serde_json::to_value(Some(&later_draft)).expect("json")
    );
    assert!(server.requests.try_recv().is_err());
    server.finish();
    drop(store);
    crate::cleanup_store(
        &root,
        "report-new-draft",
        &["account", "report-draft", "report-attempt"],
    );
}

#[test]
fn edits_rotate_idempotency_and_consent_never_survives_logout_or_restored_account_instance() {
    let server=Server::start(vec![(200,serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":crate::random_id().expect("entropy"),"expires_at":160}).to_string())]);
    let (root, store) = crate::test_store("report-consent");
    let mut account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("url"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("bridge");
    let draft = save_draft(&store, fields()).expect("draft");
    let mut edited = fields();
    edited.observed_text = "Otro resultado".into();
    assert_ne!(
        save_draft(&store, edited).expect("edited").idempotency_key,
        draft.idempotency_key
    );
    let mut reports = Reports::restore(&store).expect("reports");
    let preview = reports
        .prepare(
            &session.request(&http, &config, &account, 100),
            draft,
            environment(),
        )
        .expect("preview");
    account.logout(&store).expect("logout");
    assert!(matches!(
        reports.send(
            &session.request(&http, &config, &account, 100),
            &preview.id,
            &store
        ),
        Err(Error::Authentication)
    ));
    let restored = account::fixture(&server.base, &store);
    assert!(matches!(
        reports.send(
            &session.request(&http, &config, &restored, 100),
            &preview.id,
            &store
        ),
        Err(Error::Authentication)
    ));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("only bridge request");
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "report-consent", &["account", "report-draft"]);
}

#[test]
fn draft_contract_rejects_secret_fields_and_oversized_text() {
    assert!(serde_json::from_str::<Fields>(r#"{"actionText":"","expectedText":"","observedText":"","contextText":"","module":"hub","accessToken":"x"}"#).is_err());
    let mut value = fields();
    value.context_text = "ñ".repeat(2049);
    assert!(matches!(fields_valid(&value, false), Err(Error::TooLarge)));
    value = fields();
    value.module = "invented".into();
    assert!(fields_valid(&value, false).is_err());
}

#[test]
fn editing_after_preview_cancels_send_before_any_http_mutation() {
    let server=Server::start(vec![(200,serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":crate::random_id().expect("entropy"),"expires_at":160}).to_string())]);
    let (root, store) = crate::test_store("report-edit");
    let account = account::fixture(&server.base, &store);
    let http = Http::default();
    let config = Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("url"),
        supabase: server.base.clone(),
        anon_key: "public-fixture".into(),
    };
    let session = config.authorize(&http, &account, 100).expect("bridge");
    let request = session.request(&http, &config, &account, 100);
    let draft = save_draft(&store, fields()).expect("draft");
    let mut reports = Reports::restore(&store).expect("reports");
    let preview = reports
        .prepare(&request, draft, environment())
        .expect("preview");
    let mut changed = fields();
    changed.context_text = "Texto cambiado".into();
    save_draft(&store, changed).expect("edit");
    assert!(matches!(
        reports.send(&request, &preview.id, &store),
        Err(Error::Canceled)
    ));
    assert!(matches!(
        store.load::<Attempt>("report-attempt"),
        Err(Error::NotFound)
    ));
    server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("only bridge request");
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "report-edit", &["account", "report-draft"]);
}
