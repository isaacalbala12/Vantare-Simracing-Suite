use super::*;
use crate::{account, bridge::Config, http::Http, test_http::Server};

#[test]
fn uncertain_submission_retries_exact_payload_and_never_selects_identity() {
    let server=Server::start(vec![
        (200,serde_json::json!({"version":1,"account_id":"15940000-0000-0000-0000-000000000001","data_access_token":"data-fixture","expires_at":160}).to_string()),
        (500,"{}".into()),(200,"null".into()),
        (200,"{\"questionnaires\":[],\"contributions\":[]}".into())]);
    let (root, store) = crate::test_store("triage-retry");
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
    let session = config
        .authorize(&http, &account, 100)
        .expect("verified account");
    let request = session.request(&http, &config, &account, 100);
    let packet = Packet {
        id: "15940000-0000-0000-0000-000000000010".into(),
        title: "Failure".into(),
        body: "steps expected observed".into(),
        context: serde_json::json!({"app_version":"1.2.3","app_channel":"testers","game":"none","game_version":null,"system":{},"telemetry_summary":null,"posthog_session_id":null,"consent":{"version":"triage-v2","items":[],"accepted_at":"2026-10-13T00:00:00Z"}}),
        attachments: Vec::new(),
    };
    let preview = Preview {
        id: "a".repeat(64),
        channel: "testers".into(),
        packet,
    };
    let mut triage = Triage {
        prepared: Some(Prepared {
            account: session.account_id().into(),
            until: 150,
            preview: preview.clone(),
        }),
        logs: VecDeque::new(),
    };
    assert_eq!(
        triage
            .send(&request, "testers", "unknown", 100)
            .unwrap_err(),
        Error::Conflict
    );
    assert_eq!(
        triage
            .send(&request, "nightly", &preview.id, 100)
            .unwrap_err(),
        Error::Conflict
    );
    assert_eq!(
        triage
            .send(&request, "testers", &preview.id, 150)
            .unwrap_err(),
        Error::Conflict
    );
    assert_eq!(
        triage
            .send(&request, "testers", &preview.id, 100)
            .unwrap_err(),
        Error::Offline
    );
    assert!(triage.prepared.is_some());
    triage
        .send(&request, "testers", &preview.id, 100)
        .expect("exact retry");
    assert!(triage.prepared.is_none());
    let captured: Vec<_> = (0..4)
        .map(|_| {
            server
                .requests
                .recv_timeout(std::time::Duration::from_secs(3))
                .expect("request")
        })
        .collect();
    assert!(captured[1].starts_with("POST /rest/v1/rpc/testing_contribution_submit_v2 "));
    let first = captured[1].split("\r\n\r\n").nth(1).expect("body");
    let retried = captured[2].split("\r\n\r\n").nth(1).expect("body");
    assert_eq!(first, retried);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(first).expect("payload"),
        preview.packet.rpc_payload("testers")
    );
    assert!(!first.contains("account_id") && !first.contains("data-fixture"));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "triage-retry", &[]);
}
#[test]
fn cancel_and_retention_clear_private_preparations_without_fabricated_logs() {
    let mut triage = Triage::default();
    for time in 0..2200 {
        triage.record(time, true, "report-send");
    }
    assert!(triage.logs.len() <= 2000);
    triage.record(5000, false, "refresh");
    assert_eq!(triage.logs.len(), 1);
    triage.cancel();
    assert!(triage.logs.is_empty());
    assert!(triage.prepared.is_none());
    assert_eq!(tail("ééé", 3), "é");
}

#[test]
fn session_summary_uses_only_recent_observed_failures_and_events_without_posthog() {
    let mut triage = Triage::default();
    assert!(triage.summary(100).is_null());
    triage.record(100, true, "report-send");
    for at in 1900..2000 {
        triage.record(at, at % 2 == 0, "refresh");
    }
    let summary = triage.summary(2000);
    let errors = summary["errors"].as_array().expect("errors");
    let events = summary["events"].as_array().expect("events");
    assert_eq!(errors.len(), 20);
    assert_eq!(events.len(), 50);
    assert_eq!(errors[0]["message"], "ERROR services:refresh");
    assert_eq!(
        errors[0]["fingerprint"],
        crate::content_hash(b"ERROR services:refresh")
    );
    assert_eq!(events[0]["at"], "1970-01-01T00:32:30+00:00");
    assert!(!summary.to_string().contains("report-send"));
    assert!(summary.get("performance").is_none());
    assert!(triage.summary(4000).is_null());
}
