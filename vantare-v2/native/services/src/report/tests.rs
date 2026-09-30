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
    }
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
        authorize: server.base.join("bridge").expect("url"),
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
    let (receipt, cleanup_pending) = restored
        .send(&request, &retry.id, &store)
        .expect("confirmed send");
    assert!(cleanup_pending);
    assert!(receipt.idempotent);
    assert_eq!(receipt.report_id, report_id);
    drop(held);
    let second = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("retry submit");
    assert_text_only_retry(&first, &second, &retry);
    let persisted = Reports::restore(&store).expect("durable receipt");
    assert!(
        persisted
            .receipt()
            .is_some_and(|receipt| receipt.report_id == report_id)
    );
    server.finish();
    drop(store);
    crate::cleanup_store(
        &root,
        "report-retry",
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
        authorize: server.base.join("bridge").expect("url"),
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
        authorize: server.base.join("bridge").expect("url"),
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
