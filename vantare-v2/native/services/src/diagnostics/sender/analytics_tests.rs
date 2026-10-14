use super::*;
use crate::{
    diagnostics::{Usage, enqueue_once, enqueue_usage, queue},
    test_http::Server,
};
use serde_json::{Value, json};

fn consent(root: &Path, allowed: bool) {
    fs::write(
        root.join(super::super::PRIVACY_FILE),
        serde_json::to_vec(&json!({"crashes":false,"crashes_decided":true,
            "usage":allowed,"usage_decided":true}))
        .expect("json"),
    )
    .expect("consent");
}

#[test]
fn isa1609_exact_wire_allowlist_for_all_new_events() {
    let root = super::super::tests::root();
    consent(&root, true);
    let cases = [
        (
            Usage::PageViewed {
                page: "studio".into(),
            },
            "page_viewed",
            json!({"page":"studio"}),
        ),
        (
            Usage::PageUsage {
                page: "settings".into(),
                duration_seconds: 60,
            },
            "page_usage",
            json!({"page":"settings","duration_seconds":60}),
        ),
        (
            Usage::WidgetUsage {
                widget_type: "pedals".into(),
                duration_seconds: 5,
            },
            "widget_usage",
            json!({"widget_type":"pedals","duration_seconds":5}),
        ),
        (
            Usage::FeatureUsed {
                feature: "widget_added".into(),
            },
            "feature_used",
            json!({"feature":"widget_added"}),
        ),
        (
            Usage::InstallationObserved {},
            "installation_observed",
            json!({}),
        ),
        (Usage::AccountSignedIn {}, "account_signed_in", json!({})),
        (
            Usage::CommercialLicenseObserved {},
            "commercial_license_observed",
            json!({}),
        ),
    ];
    for (event, _, _) in &cases {
        enqueue_usage(&root, event).expect("enqueue");
    }
    let server = Server::start(vec![(200, r#"{"status":"Ok"}"#.into()); cases.len()]);
    flush(&root, &Http::default(), &server.base, Some("public-test")).expect("flush");
    let mut id = None;
    for (_, name, mut properties) in cases {
        let request = server
            .requests
            .recv_timeout(Duration::from_secs(3))
            .expect("request");
        let body: Value =
            serde_json::from_str(request.split_once("\r\n\r\n").expect("body").1).expect("json");
        properties["$ip"] = Value::Null;
        properties["$geoip_disable"] = true.into();
        properties["$process_person_profile"] = false.into();
        assert_eq!(body["properties"], properties);
        assert_eq!(body["event"], name);
        assert_eq!(body.as_object().expect("object").len(), 4);
        let current = body["distinct_id"].as_str().expect("UUID").to_owned();
        assert!(super::super::valid_uuid(&current));
        if let Some(id) = &id {
            assert_eq!(id, &current);
        }
        id = Some(current);
    }
    server.finish();
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn isa1609_tampered_queue_cannot_bypass_consent_or_property_catalog() {
    let root = super::super::tests::root();
    let payload = json!({"event":"page_viewed","properties":{"page":"studio","email":"private@example.test"}});
    queue(&root, "usage", &payload).expect("tamper without consent");
    let server = Server::start(vec![]);
    flush(&root, &Http::default(), &server.base, Some("public-test")).expect("no consent");
    assert!(server.requests.try_recv().is_err());
    assert!(!root.join("usage/00.json").exists());
    assert!(!root.join("anonymous-id").exists());
    server.finish();
    consent(&root, true);
    for value in [
        payload,
        json!({"event":"page_viewed","properties":{"page":"C:/Users/private"}}),
        json!({"event":"widget_usage","properties":{"widget_type":"pedals","duration_seconds":61}}),
        json!({"event":"feature_used","properties":{"feature":"private-profile-name"}}),
        json!({"event":"installation_observed","properties":{"account_id":"private"}}),
        json!({"event":"purchase_completed","properties":{}}),
    ] {
        queue(&root, "usage", &value).expect("tamper");
    }
    enqueue_usage(
        &root,
        &Usage::PageViewed {
            page: "home".into(),
        },
    )
    .expect("valid after tamper");
    let server = Server::start(vec![(200, r#"{"status":1}"#.into())]);
    flush(&root, &Http::default(), &server.base, Some("public-test"))
        .expect("reject tamper and continue");
    let request = server
        .requests
        .recv_timeout(Duration::from_secs(3))
        .expect("only valid");
    assert!(request.contains("home"));
    assert!(!request.contains("private"));
    assert!(server.requests.try_recv().is_err());
    server.finish();
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn isa1609_revocation_discards_pending_and_once_markers_do_not_replay() {
    let root = super::super::tests::root();
    let event = Usage::InstallationObserved {};
    enqueue_once(&root, &event).expect("no consent");
    assert!(!root.join("installation-observed-v1").exists());
    consent(&root, true);
    enqueue_once(&root, &event).expect("first");
    enqueue_once(&root, &event).expect("duplicate");
    assert_eq!(fs::read_dir(root.join("usage")).expect("queue").count(), 1);
    consent(&root, false);
    let server = Server::start(vec![]);
    flush(&root, &Http::default(), &server.base, Some("public-test")).expect("revoke");
    consent(&root, true);
    enqueue_once(&root, &event).expect("no backfill");
    assert_eq!(fs::read_dir(root.join("usage")).expect("queue").count(), 0);
    assert!(server.requests.try_recv().is_err());
    server.finish();
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn isa1609_account_observation_cannot_precede_installation() {
    let root = super::super::tests::root();
    consent(&root, true);
    enqueue_once(&root, &Usage::AccountSignedIn {}).expect("account");
    let first: Value =
        serde_json::from_slice(&fs::read(root.join("usage/00.json")).expect("first"))
            .expect("json");
    assert_eq!(first["event"], "installation_observed");
    let second: Value =
        serde_json::from_slice(&fs::read(root.join("usage/01.json")).expect("second"))
            .expect("json");
    assert_eq!(second["event"], "account_signed_in");
    enqueue_once(&root, &Usage::InstallationObserved {}).expect("no duplicate");
    assert_eq!(fs::read_dir(root.join("usage")).expect("queue").count(), 2);
    fs::remove_dir_all(root).expect("cleanup");
}
