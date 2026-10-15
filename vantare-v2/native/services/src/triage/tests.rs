use super::*;
use crate::{account, bridge::Config, http::Http, test_http::Server};

// Prepared input: these tests exercise privacy, consent, budgets and exact HTTP
// retries, independently of the host's games, hardware or PowerShell startup.
fn observed_fixture(system: bool) -> capture::Observed {
    capture::Observed {
        system: if system {
            serde_json::json!({"cpu":{"cores":8},"ram_gb":32})
        } else {
            serde_json::json!({})
        },
        game: "acc".into(),
        game_version: Some("1.10.3".into()),
    }
}

#[test]
fn f7_tester_free_text_never_reaches_the_rpc_preview() {
    for raw in [
        r"account\u0049d=SyntheticOtherPerson",
        r"accountId\u003aSyntheticOtherPerson",
        r"Authorization\x3a Basic OpaqueTailSecret",
        r#"{"account id":"SyntheticOtherPerson"}"#,
        r#"{"user.name":"SyntheticOtherPerson"}"#,
        "épassword=OpaqueTailSecret",
        "OrdinaryPrivateTesterNote",
    ] {
        let payload = prepared_text(raw);
        for private in [
            "SyntheticOtherPerson",
            "OpaqueTailSecret",
            "OrdinaryPrivateTesterNote",
        ] {
            assert!(
                !payload.contains(private),
                "tester prose survived: {private}"
            );
        }
    }
}

#[test]
fn f7_system_projection_keeps_numbers_and_closed_values_only() {
    let raw = serde_json::json!({
        "cpu":{"model":"OrdinaryPrivateTesterNote","cores":8},
        "os":{"name":"OrdinaryPrivateTesterNote","version":"OrdinaryPrivateTesterNote","build":"OrdinaryPrivateTesterNote"},
        "gpu":[{"model":"OrdinaryPrivateTesterNote","driver_version":"OrdinaryPrivateTesterNote"}],
        "displays":[{"width":"OrdinaryPrivateTesterNote","height":1080,"primary":true}],
        "ram_gb":32,"overlays_active":["OBS","OrdinaryPrivateTesterNote"],"obs_active":true
    });
    let value = evidence::system(&raw);
    assert!(!value.to_string().contains("OrdinaryPrivateTesterNote"));
    assert_eq!(value["cpu"]["cores"], 8);
    assert_eq!(value["ram_gb"], 32);
    assert_eq!(value["overlays_active"], serde_json::json!(["OBS"]));
}

#[test]
fn f7_closed_session_metadata_is_independent_of_profile_names() {
    let mut triage = Triage::default();
    triage.record(100, true, "report-send");
    let preview = triage
        .prepare_with_capture(
            "15940000-0000-0000-0000-000000000001",
            "testers",
            Input {
                title: "Local note",
                body: "Local note",
                selection: Selection {
                    items: [Item::Session].into_iter().collect(),
                },
                consent: true,
                private_names: &[
                    "type".into(),
                    "fingerprint".into(),
                    "at".into(),
                    "ServicesCommandFailure".into(),
                ],
            },
            100,
            |system| Ok(observed_fixture(system)),
        )
        .expect("structured preparation");
    let summary = &preview.packet.context["telemetry_summary"];
    let expected = evidence::error_record(&serde_json::json!({"type":"ServicesCommandFailure"}));
    assert_eq!(summary["errors"][0]["type"], "ServicesCommandFailure");
    assert_eq!(summary["errors"][0]["fingerprint"], expected["fingerprint"]);
    assert_eq!(summary["events"][0]["name"], "ServicesCommandFailure");
    chrono::DateTime::parse_from_rfc3339(summary["events"][0]["at"].as_str().expect("timestamp"))
        .expect("valid timestamp");
}

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
    assert!(captured[1].starts_with("POST /functions/v1/testing-report-submit "));
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
fn review_r7_f8_real_preview_is_preserved_for_combined_sql_admission() {
    let server = Server::start(vec![
        (200, serde_json::json!({"version":1,"account_id":"15940000-0000-4000-8000-000000000001","data_access_token":"data-fixture","expires_at":160}).to_string()),
        (200, "null".into()),
        (200, "{\"questionnaires\":[],\"contributions\":[]}".into()),
    ]);
    let (root, store) = crate::test_store("triage-admission");
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
    let mut triage = Triage::default();
    triage.record(99, true, "report-send");
    let preview = triage
        .prepare_with_capture(
            "15940000-0000-4000-8000-000000000001",
            "testers",
            Input {
                title: "OrdinaryPrivateTesterNote",
                body: "OrdinaryPrivateTesterNote",
                selection: Selection {
                    items: [Item::Session, Item::AppLog].into_iter().collect(),
                },
                consent: true,
                private_names: &[],
            },
            100,
            |system| Ok(observed_fixture(system)),
        )
        .expect("actual preview");
    let payload = preview.packet.rpc_payload("testers");
    let bytes = serde_json::to_vec(&payload).expect("preview bytes");
    assert!(!String::from_utf8_lossy(&bytes).contains("OrdinaryPrivateTesterNote"));
    assert_eq!(preview.packet.attachments.len(), 1);
    triage
        .send(&request, "testers", &preview.id, 100)
        .expect("send actual preview");
    let captured: Vec<_> = (0..3)
        .map(|_| {
            server
                .requests
                .recv_timeout(std::time::Duration::from_secs(3))
                .expect("request")
        })
        .collect();
    assert!(captured[1].starts_with("POST /functions/v1/testing-report-submit "));
    let sent = captured[1].split("\r\n\r\n").nth(1).expect("body");
    assert_eq!(sent.as_bytes(), bytes);
    // Optional local evidence consumed by the disposable combined SQL runner.
    if let Some(path) = std::env::var_os("VANTARE_TRIAGE_TEST_PREVIEW") {
        std::fs::write(path, &bytes).expect("synthetic preview evidence");
    }
    assert_eq!(preview.packet.id.as_bytes()[14], b'4');
    assert!(matches!(
        preview.packet.id.as_bytes()[19],
        b'8' | b'9' | b'a' | b'b'
    ));
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "triage-admission", &[]);
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
    assert_eq!(errors[0]["type"], "ServicesCommandFailure");
    assert_eq!(errors[0]["message"], "ServicesCommandFailure");
    assert!(errors[0].get("first_line").is_none());
    // Required legacy SQL keys, no new structured-export keys in owner storage.
    for error in errors {
        assert_eq!(error.as_object().expect("error").len(), 3);
        assert!(
            ["type", "message", "fingerprint"]
                .iter()
                .all(|k| error[*k].is_string())
        );
    }
    assert_eq!(
        errors[0]["fingerprint"],
        evidence::error_record(&serde_json::json!({"type":"ServicesCommandFailure"}))["fingerprint"]
    );
    assert_eq!(events[0]["at"], "1970-01-01T00:32:30+00:00");
    assert_eq!(events[0]["name"], "ServicesCommandFailure");
    for event in events {
        assert_eq!(event.as_object().expect("event").len(), 2);
        assert!(event["name"].is_string() && event["at"].is_string());
    }
    assert!(!summary.to_string().contains("report-send"));
    assert!(summary.get("performance").is_none());
    assert!(triage.summary(4000).is_null());
}

#[test]
fn review_r3_f4_structural_json_before_preview() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../tools/triage/redaction-cases.json"
    ))
    .expect("shared synthetic cases");
    for case in cases.as_array().expect("cases") {
        let raw = case["input"].as_str().expect("input");
        let clean = redaction::clean(raw, &[]);
        assert_eq!(
            clean,
            case["expected"].as_str().expect("expected"),
            "{}",
            case["name"]
        );
        assert_eq!(redaction::clean(&clean, &[]), clean);
        if raw.chars().count() <= 120 {
            let preview = prepared_text(raw);
            for secret in case["secrets"].as_array().expect("secrets") {
                assert!(
                    !preview.contains(secret.as_str().expect("secret")),
                    "{}",
                    case["name"]
                );
            }
        }
    }
}

#[test]
fn review_r4_f5_shared_export_fields_and_secret_property() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../tools/triage/export-cases.json"
    ))
    .expect("shared F5 fixtures");
    for case in cases.as_array().expect("cases") {
        let raw = case["input"].as_str().expect("input");
        let clean = redaction::external_text(raw, &[], 120);
        assert_eq!(
            clean,
            case["expected"].as_str().expect("expected"),
            "{}",
            case["name"]
        );
        assert_eq!(redaction::external_text(&clean, &[], 120), clean);
        for secret in case["secrets"].as_array().expect("secrets") {
            let secret = secret.as_str().expect("secret");
            assert!(!clean.contains(secret), "{}", case["name"]);
            if raw.chars().count() <= 120 {
                assert!(!prepared_text(raw).contains(secret), "{}", case["name"]);
            }
        }
    }
    assert_eq!(redaction::external_text("a\n b\r\n c", &[], 4), "a b ");
    assert_eq!(
        redaction::external_text(&"x".repeat(500), &[], 120),
        "x".repeat(120)
    );
}

#[test]
fn review_r5_f6_closed_fields_shared_projection() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../tools/triage/structured-f6-cases.json"
    ))
    .expect("shared F6 fixtures");
    for case in cases.as_array().expect("cases") {
        let input: serde_json::Value =
            serde_json::from_str(case["input"].as_str().expect("input")).expect("JSON");
        let values = match input {
            serde_json::Value::Array(values) => values,
            value => vec![value],
        };
        let records: Vec<_> = values.iter().map(evidence::record).collect();
        assert_eq!(
            serde_json::json!(records),
            case["expected"],
            "{}",
            case["name"]
        );
    }
}

#[test]
fn review_r5_f6_fingerprint_is_derived_from_closed_values() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../tools/triage/error-f6-cases.json"
    ))
    .expect("shared hash fixtures");
    for case in cases.as_array().expect("cases") {
        assert_eq!(evidence::error_record(&case["input"]), case["expected"]);
    }
}

#[test]
fn review_r4_structured_log_scalar_parity() {
    let cases: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../tools/triage/log-field-cases.json"
    ))
    .expect("shared structured fixtures");
    for case in cases.as_array().expect("cases") {
        // Parsing a whole log is worker-only; Rust produces structured records
        // directly from observed service outcomes. Test the shared projection.
        let input =
            serde_json::from_str::<serde_json::Value>(case["input"].as_str().expect("input"));
        let values = match input {
            Ok(serde_json::Value::Array(values)) => values,
            Ok(value) => vec![value],
            Err(_) => Vec::new(),
        };
        let records: Vec<_> = values
            .iter()
            .take(300)
            .map(evidence::record)
            .filter(|v| !v.as_object().expect("record").is_empty())
            .collect();
        assert_eq!(
            serde_json::json!(records),
            case["expected"],
            "{}",
            case["name"]
        );
    }
}

#[test]
fn review_r2_f1_json_representations_are_removed_before_preview() {
    let basic = ["c3ludGhldGlj", "OmZpeHR1cmU="].concat();
    for (label, secret, prefix) in [
        ("accountId", "abcdefab-cdef-abcd-efab-abcdefabcdef", ""),
        ("Authorization", basic.as_str(), "Basic "),
        ("username", "SyntheticOther", ""),
    ] {
        for depth in 0..4 {
            let raw = serde_json::json!({label:format!("{prefix}{secret}")})
                .to_string()
                .replace('"', &format!("{}\"", "\\".repeat(depth)));
            assert!(
                !prepared_text(&raw).contains(secret),
                "label {label}, depth {depth}"
            );
            let clean = redaction::clean(&raw, &[]);
            assert_eq!(redaction::clean(&clean, &[]), clean);
        }
    }
    assert_eq!(
        redaction::clean(r"ERROR unicode=\u00e9 public=context", &[]),
        r"ERROR unicode=\u00e9 public=context"
    );
}

#[test]
fn review_p1_1_basic_and_sk_hyphen_are_removed_before_preview() {
    for (raw, secret) in [
        (
            "Authorization: Basic c3ludGhldGljOmZpeHR1cmU=",
            "c3ludGhldGljOmZpeHR1cmU=",
        ),
        (
            r#"{"Authorization":"bAsIc c3ludGhldGljOmZpeHR1cmU="}"#,
            "c3ludGhldGljOmZpeHR1cmU=",
        ),
        (
            "sk-proj-FixtureOpaqueCredential",
            "sk-proj-FixtureOpaqueCredential",
        ),
    ] {
        // The same cleaner runs over title, body, hardware and attachment before preview.
        let packet = prepared_text(raw);
        assert!(
            !packet.contains(secret),
            "synthetic credential survived preview"
        );
    }
}

#[test]
fn review_p1_2_account_label_variants_are_removed_before_preview() {
    let secret = "abcdefab-cdef-abcd-efab-abcdefabcdef";
    for label in ["accountId", "AccountID", "account-id", "account_id"] {
        let raw = serde_json::json!({label:secret}).to_string();
        assert!(
            !prepared_text(&raw).contains(secret),
            "account label: {label}"
        );
    }
    assert_eq!(
        redaction::clean("accountIdentity=public-context", &[]),
        "accountIdentity=public-context"
    );
}

#[test]
fn review_p1_3_foreign_unc_profile_is_removed_before_preview() {
    for raw in [
        r"ERROR \\LAB\Profiles\SyntheticOther\log.txt",
        "ERROR //LAB/Profiles/SyntheticOther/log.txt",
        r#"ERROR "\\LAB\Profiles\Synthetic Other\log.txt""#,
    ] {
        let value = prepared_text(raw);
        assert!(
            !value.contains("SyntheticOther") && !value.contains("Synthetic Other"),
            "foreign UNC profile survived"
        );
        assert!(value.contains("ServicesCommandFailure"));
        let clean = redaction::clean(raw, &[]);
        assert_eq!(redaction::clean(&clean, &[]), clean);
    }
}

// Integration boundary: prepare the exact RPC preview without collecting PC data.
fn prepared_text(raw: &str) -> String {
    let mut triage = Triage::default();
    triage.record(100, true, raw);
    let preview = triage
        .prepare_with_capture(
            "15940000-0000-0000-0000-000000000001",
            "testers",
            Input {
                title: raw,
                body: raw,
                selection: Selection {
                    items: [Item::AppLog, Item::Session].into_iter().collect(),
                },
                consent: true,
                private_names: &[],
            },
            100,
            |system| Ok(observed_fixture(system)),
        )
        .expect("synthetic preparation");
    serde_json::to_string(&preview.packet.rpc_payload("testers")).expect("RPC JSON")
}

#[test]
fn review_r2_f3_expanded_redaction_fits_sql_and_retries_exact_preview() {
    let title = "::1 ".repeat(30);
    let body = "::1 ".repeat(250).trim().to_owned();
    assert_eq!(title.chars().count(), 120);
    assert_eq!(body.chars().count(), 999);
    let mut triage = Triage::default();
    let preview = triage
        .prepare_with_capture(
            "15940000-0000-0000-0000-000000000001",
            "testers",
            Input {
                title: &title,
                body: &body,
                selection: Selection {
                    items: std::collections::BTreeSet::new(),
                },
                consent: true,
                private_names: &[],
            },
            100,
            |system| Ok(observed_fixture(system)),
        )
        .expect("UI-admitted text");
    let payload = preview.packet.rpc_payload("testers");
    for (field, max) in [("p_title", 120), ("p_body", 1000)] {
        let value = payload[field].as_str().expect("text");
        assert!(
            (1..=max).contains(&value.trim().chars().count()),
            "SQL rejects {field}: {} characters",
            value.trim().chars().count()
        );
        assert!(!value.contains("::1"));
        assert_eq!(value, redaction::REMOVED);
    }
    let expected = serde_json::to_vec(&payload).expect("JSON");
    let server=Server::start(vec![
        (200,serde_json::json!({"version":1,"account_id":"15940000-0000-0000-0000-000000000001","data_access_token":"data-fixture","expires_at":160}).to_string()),
        (500,"{}".into()),(200,"null".into()),
        (200,"{\"questionnaires\":[],\"contributions\":[]}".into())]);
    let (root, store) = crate::test_store("triage-expanded");
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
    let session = config.authorize(&http, &account, 100).expect("account");
    let request = session.request(&http, &config, &account, 100);
    assert_eq!(
        triage
            .send(&request, "testers", &preview.id, 100)
            .unwrap_err(),
        Error::Offline
    );
    triage
        .send(&request, "testers", &preview.id, 100)
        .expect("exact retry");
    let captured: Vec<_> = (0..4)
        .map(|_| {
            server
                .requests
                .recv_timeout(std::time::Duration::from_secs(3))
                .expect("request")
        })
        .collect();
    for index in [1, 2] {
        assert_eq!(
            captured[index]
                .split("\r\n\r\n")
                .nth(1)
                .expect("body")
                .as_bytes(),
            expected
        );
    }
    server.finish();
    drop(store);
    crate::cleanup_store(&root, "triage-expanded", &[]);
}

#[test]
fn review_p2_4_full_escaped_preview_fits_http_and_sends_exact_hashed_tail() {
    for operation in ["participation", "participation \"quoted\" \\ sesión \u{1}"] {
        let now = 100;
        let mut triage = Triage::default();
        for _ in 0..2000 {
            triage.record(now, true, operation);
        }
        let preview = triage
            .prepare_with_capture(
                "15940000-0000-0000-0000-000000000001",
                "testers",
                Input {
                    title: &"é".repeat(120),
                    body: &"\u{1}".repeat(1000),
                    selection: Selection {
                        items: [Item::AppLog, Item::Session].into_iter().collect(),
                    },
                    consent: true,
                    private_names: &[],
                },
                now,
                |system| Ok(observed_fixture(system)),
            )
            .expect("large valid preparation");
        let expected = serde_json::to_vec(&preview.packet.rpc_payload("testers")).expect("JSON");
        assert!(
            expected.len() <= 65536,
            "offered preview exceeds HTTP budget: {}",
            expected.len()
        );
        let log = &preview.packet.attachments[0];
        assert_eq!(log.sha256, crate::content_hash(log.content.as_bytes()));
        let records: Vec<serde_json::Value> =
            serde_json::from_str(&log.content).expect("whole structured log");
        assert_eq!(records.len(), 300);
        assert!(
            records
                .iter()
                .all(|r| r["module"] == "services" && r["level"] == "ERROR")
        );
        assert!(!log.content.contains(operation));
        let server=Server::start(vec![
            (200,serde_json::json!({"version":1,"account_id":"15940000-0000-0000-0000-000000000001","data_access_token":"data-fixture","expires_at":now+60}).to_string()),
            (200,"null".into()),(200,"{\"questionnaires\":[],\"contributions\":[]}".into())]);
        let (root, store) = crate::test_store("triage-budget");
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
        let session = config.authorize(&http, &account, now).expect("account");
        triage
            .send(
                &session.request(&http, &config, &account, now),
                "testers",
                &preview.id,
                now,
            )
            .expect("real HTTP submission");
        let captured: Vec<_> = (0..3)
            .map(|_| {
                server
                    .requests
                    .recv_timeout(std::time::Duration::from_secs(3))
                    .expect("request")
            })
            .collect();
        assert_eq!(
            captured[1]
                .split("\r\n\r\n")
                .nth(1)
                .expect("body")
                .as_bytes(),
            expected
        );
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "triage-budget", &[]);
    }
    let oversized = serde_json::json!({"unrelated":"x".repeat(65536)});
    assert!(matches!(
        Http::default().post_json(
            &url::Url::parse("http://127.0.0.1:9/").expect("fixture URL"),
            &oversized,
            None,
            None
        ),
        Err(Error::TooLarge)
    ));
}

#[test]
fn prepared_context_uses_supplied_observations_and_capture_errors_clear_consent() {
    let mut triage = Triage::default();
    let input = || Input {
        title: "local note",
        body: "local note",
        selection: Selection {
            items: [Item::System].into_iter().collect(),
        },
        consent: true,
        private_names: &[],
    };
    let preview = triage
        .prepare_with_capture("account", "testers", input(), 100, |system| {
            assert!(system);
            Ok(observed_fixture(system))
        })
        .expect("prepared observations");
    assert_eq!(preview.packet.context["game"], "acc");
    assert_eq!(preview.packet.context["game_version"], "1.10.3");
    assert_eq!(preview.packet.context["system"]["cpu"]["cores"], 8);
    assert_eq!(preview.packet.context["system"]["ram_gb"], 32);
    assert!(matches!(
        triage.prepare_with_capture("account", "testers", input(), 101, |_| Err(Error::Offline)),
        Err(Error::Offline)
    ));
    assert!(
        triage.prepared.is_none(),
        "a failed recapture must invalidate the old consent"
    );
}
