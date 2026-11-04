use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
    thread,
};

pub(crate) fn loopback_client(base: &str) -> Client {
    Client::new(
        Url::parse(&format!("{base}/functions/v1/native-admin")).expect("endpoint"),
        Url::parse(base).expect("origin"),
    )
    .expect("client")
}

fn serve(status: u16, body: Vec<u8>) -> (Client, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let base = format!("http://{}", listener.local_addr().expect("address"));
    let client = Client::new(
        Url::parse(&format!("{base}/functions/v1/native-admin")).expect("endpoint"),
        Url::parse(&base).expect("origin"),
    )
    .expect("client");
    let task = thread::spawn(move || {
        let (mut socket, _) = listener.accept().expect("accept");
        socket
            .set_read_timeout(Some(Duration::from_secs(3)))
            .expect("timeout");
        let mut bytes = vec![];
        let mut buffer = [0; 4096];
        loop {
            let count = socket.read(&mut buffer).expect("request");
            assert_ne!(count, 0);
            bytes.extend_from_slice(&buffer[..count]);
            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("content-length: ")
                            .and_then(|s| s.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if bytes.len() >= end + 4 + length {
                    break;
                }
            }
        }
        write!(
            socket,
            "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .expect("headers");
        socket.write_all(&body).expect("body");
        String::from_utf8(bytes).expect("utf8 request")
    });
    (client, task)
}

// Wire fields copied from native_admin.sql and native-admin/index.ts, never
// generated from client structs (which previously hid contract incompatibility).
pub(crate) fn report_wire(id: &str, status: Status, detail: bool) -> serde_json::Value {
    let payload = serde_json::json!({"module":"strategy","app_version":"0.4.0",
        "action_text":"Cambiar sesión","expected_text":"Recalcular",
        "observed_text":"Plan anterior","context_text":null});
    let mut report = serde_json::json!({"report_id":id,"email":"ana@example.invalid",
        "status":status,"created_at":"2026-10-03T09:30:00Z"});
    if detail {
        report["payload"] = payload;
        report["screenshots"] = serde_json::json!([{"evidence_id":"image-1","url":"https://example.invalid/storage/v1/object/sign/testing-center-evidence/x?token=test","expires_at":1_800_000_000,"media_type":"image/jpeg","position":0}]);
    } else {
        report
            .as_object_mut()
            .expect("object")
            .extend(payload.as_object().expect("payload").clone());
        report["has_screenshots"] = true.into();
    }
    report
}

#[test]
fn deployed_report_shapes_and_nullable_contacts_are_readable() {
    let summary: Report =
        serde_json::from_value(report_wire("report-1", Status::Submitted, false)).expect("list");
    let detail: Report =
        serde_json::from_value(report_wire("report-1", Status::Submitted, true)).expect("detail");
    assert_eq!(summary.text, detail.text);
    assert!(detail.text.contains("Esperado: Recalcular"));
    assert!(detail.has_screenshots && detail.screenshots.len() == 1);
    let user: User = serde_json::from_value(serde_json::json!({"account_id":"11111111-1111-4111-8111-111111111111","email":null,"name":null,"created_at":"2026-10-01T00:00:00Z","last_seen_at":null,"roles":[],"modules":["vantare.module.engineer"],"reports_count":0})).expect("nullable contact");
    assert_eq!(user.modules, vec![Module::Engineer]);
    assert_eq!(
        serde_json::to_value(Module::Calendar).expect("module"),
        "vantare.module.calendar"
    );
}

#[test]
fn search_limits_match_deployed_validation() {
    for query in [" ", " ana", "ana ", &"a".repeat(201)] {
        assert_eq!(
            Action::SearchAccounts {
                query: query.into(),
                limit: 50,
                cursor: None
            }
            .validate(),
            Err(Error::Protocol)
        );
    }
    assert!(
        Action::SearchAccounts {
            query: "Ana Martín".into(),
            limit: 50,
            cursor: None
        }
        .validate()
        .is_ok()
    );
}

#[test]
fn local_contract_server_verifies_every_action_and_oauth_header() {
    let id = crate::state::State::new(true, crate::state::Screen::Users).users[0]
        .account_id
        .clone();
    let actions = vec![
        Action::SearchAccounts {
            query: "Ana".into(),
            limit: 50,
            cursor: None,
        },
        Action::GetAccount {
            account_id: id.clone(),
        },
        Action::SetTester {
            account_id: id.clone(),
            enabled: true,
        },
        Action::SetModule {
            account_id: id,
            module: Module::Engineer,
            enabled: false,
            expected_enabled: false,
        },
        Action::GetRollout,
        Action::SetRollout {
            module: Module::Calendar,
            enabled_for_all: true,
            expected_enabled: false,
        },
        Action::ListReports {
            status: Some(Status::Submitted),
            limit: 100,
            cursor: Some("next-page".into()),
        },
        Action::GetReport {
            report_id: "report-1".into(),
        },
        Action::SetReportStatus {
            report_id: "report-1".into(),
            status: Status::Closed,
            fixed_in_version: None,
            reason: Some("Revisado".into()),
        },
    ];
    for action in actions {
        let demo = crate::state::State::new(true, crate::state::Screen::Users);
        let mut response = serde_json::json!({"version":1,"ok":true});
        match &action {
            Action::SearchAccounts { .. } => {
                response["accounts"] = serde_json::json!([demo.users[0]]);
            }
            Action::GetAccount { .. } => response["account"] = serde_json::json!(demo.users[0]),
            Action::GetRollout => response["rollout"] = serde_json::json!(demo.rollout),
            Action::ListReports { .. } => {
                response["reports"] =
                    serde_json::json!([report_wire("report-1", Status::Submitted, false)]);
                response["next_cursor"] = "report-1".into();
            }
            Action::GetReport { report_id } => {
                response["report"] = report_wire(report_id, Status::Submitted, true);
            }
            _ => {}
        }
        let (client, server) = serve(200, serde_json::to_vec(&response).expect("response"));
        let actual = client
            .request("test-oauth-not-a-secret", &action)
            .expect("success");
        assert_eq!(actual, response);
        let mut state = crate::state::State::new(false, crate::state::Screen::Users);
        state
            .accept(&action, &actual)
            .expect("client and UI agree on wire contract");
        let request = server.join().expect("server");
        let (headers, body) = request.split_once("\r\n\r\n").expect("http");
        assert!(
            headers
                .to_lowercase()
                .contains("authorization: bearer test-oauth-not-a-secret")
        );
        assert!(!headers.to_lowercase().contains("apikey:"));
        let explicit = matches!(
            &action,
            Action::GetAccount { .. } | Action::ListCreators | Action::GetCreator { .. }
        );
        let mut expected = serde_json::to_value(action).expect("action");
        expected["version"] = 1.into();
        if explicit {
            expected["explicit_payments"] = true.into();
        }
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(body).expect("body"),
            expected
        );
    }
}
#[test]
fn http_and_contract_errors_are_sanitized() {
    for (status, body, expected) in [
        (401, "token=private", Error::Authentication),
        (403, "private detail", Error::Denied),
        (500, "private detail", Error::Offline),
        (429, "", Error::RateLimited),
        (302, "", Error::Protocol),
        (200, "not-json", Error::Protocol),
        (200, r#"{"version":2,"ok":true}"#, Error::Version),
        (
            200,
            r#"{"version":1,"ok":false,"error":"secret"}"#,
            Error::Protocol,
        ),
    ] {
        let (client, server) = serve(status, body.as_bytes().to_vec());
        assert_eq!(client.request("test", &Action::GetRollout), Err(expected));
        server.join().expect("server");
        assert!(!expected.to_string().contains("private"));
    }
}
#[test]
fn limits_and_url_guards_reject_before_network() {
    let base = Url::parse("https://example.invalid").expect("base");
    for url in [
        "http://example.invalid/functions/v1/native-admin",
        "https://u:p@example.invalid/functions/v1/native-admin",
        "https://example.invalid/rest/v1/users",
        "https://example.invalid/functions/v1/native-admin?token=x",
        "https://example.invalid/functions/v1/native-admin#x",
    ] {
        assert!(Client::new(Url::parse(url).expect("url"), base.clone()).is_err());
    }
    let client =
        Client::new(base.join("functions/v1/native-admin").expect("join"), base).expect("client");
    assert_eq!(
        client.request("", &Action::GetRollout),
        Err(Error::Authentication)
    );
    for bearer in [" ", "test\r\nheader", &"x".repeat(16 * 1024 + 1)] {
        assert_eq!(
            client.request(bearer, &Action::GetRollout),
            Err(Error::Authentication)
        );
    }
    assert_eq!(
        client.request(
            "test",
            &Action::SearchAccounts {
                query: String::new(),
                limit: 51,
                cursor: None,
            }
        ),
        Err(Error::Protocol)
    );
    assert_eq!(
        client.request(
            "test",
            &Action::ListReports {
                status: None,
                limit: 101,
                cursor: None
            }
        ),
        Err(Error::Protocol)
    );
    for url in [
        "https://evil.invalid/storage/v1/object/sign/testing-center-evidence/x?token=x",
        "https://example.invalid/rest/v1/users?token=x",
        "https://example.invalid/storage/v1/object/sign/testing-center-evidence/x",
    ] {
        assert_eq!(client.screenshot(url), Err(Error::Denied));
    }
}
#[test]
fn screenshots_are_bounded_and_downloaded_without_oauth() {
    let body = include_bytes!("../../fixtures/demo-report.png").to_vec();
    let (client, server) = serve(200, body.clone());
    let url = client
        .evidence_origin
        .join("storage/v1/object/sign/testing-center-evidence/report/a.png?token=signed-test")
        .expect("url");
    assert_eq!(client.screenshot(url.as_str()).expect("image"), body);
    let request = server.join().expect("server");
    assert!(!request.to_lowercase().contains("authorization:"));
    assert!(!request.to_lowercase().contains("apikey:"));
    let (client, server) = serve(200, b"<html>not an image</html>".to_vec());
    let url = client
        .evidence_origin
        .join("storage/v1/object/sign/testing-center-evidence/report/a.png?token=test")
        .expect("url");
    assert_eq!(client.screenshot(url.as_str()), Err(Error::Protocol));
    server.join().expect("server");
}

#[test]
fn account_errors_have_distinct_recoverable_messages() {
    for (code, expected) in [
        ("confirmation_mismatch", Error::ConfirmationMismatch),
        ("account_change_incomplete", Error::AccountChangeIncomplete),
        ("deletion_barrier_unavailable", Error::DeletionUnavailable),
    ] {
        let body = format!(r#"{{"version":1,"ok":false,"error":"{code}"}}"#);
        let (client, server) = serve(503, body.into_bytes());
        assert_eq!(client.request("test", &Action::GetRollout), Err(expected));
        server.join().expect("server");
    }
}

#[test]
fn spam_report_roundtrips_and_decisions_require_a_review_note() {
    let status: Status = serde_json::from_str("\"spam\"").expect("spam status");
    assert_eq!(status.label(), "Spam");
    let action = Action::SetReportStatus {
        report_id: "report-1".into(),
        status,
        fixed_in_version: None,
        reason: None,
    };
    assert!(action.validate().is_err());
    let action = Action::SetReportStatus {
        report_id: "report-1".into(),
        status,
        fixed_in_version: None,
        reason: Some("Contenido sin relación".into()),
    };
    assert!(action.validate().is_ok());
}

#[test]
fn decided_reports_never_offer_implicit_reopening() {
    for current in [
        Status::Validated,
        Status::Rejected,
        Status::Spam,
        Status::Fixed,
        Status::Closed,
        Status::DuplicateLinked,
        Status::Incomplete,
    ] {
        for decision in [Status::Validated, Status::Rejected, Status::Spam] {
            assert!(!current.can_transition_to(decision));
        }
        assert!(!current.can_transition_to(Status::Submitted));
        assert!(!current.can_transition_to(Status::InReview));
    }
    assert!(Status::Submitted.can_transition_to(Status::InReview));
    assert!(Status::InReview.can_transition_to(Status::Submitted));
    assert!(Status::Validated.can_transition_to(Status::Fixed));
    assert!(!Status::Rejected.can_transition_to(Status::Fixed));
}

#[test]
fn report_promotion_progress_and_spam_are_visible() {
    let mut promotion: super::ReportPromotion = serde_json::from_value(serde_json::json!({
        "accepted": 5, "tier": 6, "forfeited": false, "active_discount": "reward6"
    }))
    .unwrap();
    assert!(promotion.summary().contains("5 informes aceptados"));
    assert!(promotion.summary().contains("6 meses"));
    promotion.forfeited = true;
    assert!(
        promotion
            .summary()
            .contains("se conservan los meses concedidos")
    );
    promotion.last_error = Some("polar_discount_unmanaged".into());
    assert!(promotion.summary().contains("pendiente de revisión"));
    promotion.first_refunded = true;
    assert!(
        promotion
            .summary()
            .contains("perdida por devolución del primer mes")
    );
}

#[test]
fn founders_transition_receipt_has_a_visible_pending_and_completed_state() {
    for (state, expected) in [("pending", "pendiente"), ("completed", "desactivada")] {
        let transition: super::FoundersTransition = serde_json::from_value(serde_json::json!({
            "subscription_id": "fixture-subscription",
            "policy": "end_period",
            "state": state,
            "paid_period_end": null
        }))
        .unwrap();
        assert!(transition.label().contains(expected));
    }
}

#[test]
fn billing_incidents_make_rejected_payments_and_portal_reactivation_visible() {
    for (reason, expected) in [
        ("launch_payment_retired", "CRÍTICO"),
        ("founders_duplicate_payment", "CRÍTICO"),
        ("founders_subscription_reactivated", "reactivada"),
        ("creator_renewal_discount_failed", "pendiente de revisión"),
        ("creator_renewal_revocation_failed", "Retirada"),
    ] {
        let incident = super::BillingIncident {
            resource_id: "fixture-order".into(),
            reason: reason.into(),
            severity: "critical".into(),
        };
        assert!(incident.label().contains(expected));
    }
}

#[test]
fn mail_draft_and_confirmation_use_owner_contract_over_local_http() {
    let id = "00000000-0000-4000-8000-000000001636".to_owned();
    for action in [
        Action::MailDraft {
            campaign_id: id.clone(),
            revision: 3,
            brief: "Solo novedades aprobadas".into(),
            template: "news".into(),
        },
        Action::MailApprove {
            campaign_id: id.clone(),
            revision: 3,
            confirm: true,
            expected_recipients: 0,
        },
        Action::MailSendBatch {
            campaign_id: id,
            revision: 3,
        },
    ] {
        let (client, task) = serve(200, br#"{"version":1,"ok":true}"#.to_vec());
        client
            .request("owner-oauth-fixture", &action)
            .expect("local mail reply");
        let received = task.join().expect("local server");
        assert!(
            received
                .to_lowercase()
                .contains("authorization: bearer owner-oauth-fixture")
        );
        let body: serde_json::Value =
            serde_json::from_str(received.split_once("\r\n\r\n").expect("body").1).expect("json");
        assert_eq!(body["action"], action.label());
        assert_eq!(body["revision"], 3);
        assert_eq!(body["version"], 1);
    }
}

#[derive(Debug)]
struct WireNames(Vec<&'static str>);
impl std::fmt::Display for WireNames {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "wire variant catalog")
    }
}
impl std::error::Error for WireNames {}
impl serde::de::Error for WireNames {
    fn custom<T: std::fmt::Display>(_: T) -> Self {
        Self(Vec::new())
    }
    fn unknown_variant(_variant: &str, expected: &'static [&'static str]) -> Self {
        Self(expected.to_vec())
    }
    fn unknown_field(_field: &str, expected: &'static [&'static str]) -> Self {
        Self(expected.to_vec())
    }
}
#[test]
fn canonical_action_contract_covers_every_rust_wire_variant_and_field() {
    let contract = action_contract();
    let actions = contract["actions"].as_object().expect("actions");
    let input = serde::de::value::MapDeserializer::<_, WireNames>::new(
        [("action", "__contract_unknown__")].into_iter(),
    );
    let mut labels = Action::deserialize(input).expect_err("unknown variant").0;
    labels.sort_unstable();
    let mut names: Vec<_> = actions.keys().map(String::as_str).collect();
    names.sort_unstable();
    assert_eq!(labels, names, "Rust and Edge action sets");
    for (name, spec) in actions {
        // Capture actual Serde fields, including optional Rust fields absent from Edge.
        let probe = serde::de::value::MapDeserializer::<_, WireNames>::new(
            [
                ("action", name.as_str()),
                ("__contract_unknown_field__", ""),
            ]
            .into_iter(),
        );
        let mut actual_fields = match Action::deserialize(probe) {
            Err(names) => names.0,
            Ok(_) => Vec::new(), // Serde unit variants have no fields and ignore extras.
        };
        let mut expected_fields: Vec<_> = spec["fields"]
            .as_array()
            .expect("fields")
            .iter()
            .map(|v| v.as_str().expect("field"))
            .collect();
        actual_fields.sort_unstable();
        expected_fields.sort_unstable();
        assert_eq!(actual_fields, expected_fields, "wire field set: {name}");
        let mut wire = spec["example"].clone();
        wire["action"] = name.clone().into();
        let action: Action =
            serde_json::from_value(wire.clone()).expect("canonical fields supported");
        assert_eq!(action.label(), name);
        assert_eq!(
            action.explicit_payments(),
            spec["explicit_payments"]
                .as_bool()
                .expect("read capability")
        );
        assert_eq!(
            action.mutation(),
            spec["mutation"].as_bool().expect("mutation")
        );
        assert!(action.validate().is_ok(), "client validates {name}");
        assert_eq!(
            serde_json::to_value(&action).expect("serialize"),
            wire,
            "wire fields {name}"
        );
        wire["unexpected"] = true.into();
        if !expected_fields.is_empty() {
            assert!(serde_json::from_value::<Action>(wire).is_err());
        } // Edge validates closed inputs for all actions, including unit variants.
    }
}
#[test]
fn canonical_status_and_module_contract_cover_both_wire_enums() {
    let contract = action_contract();
    let mut statuses = Status::deserialize(serde::de::value::StrDeserializer::<WireNames>::new(
        "__contract_unknown__",
    ))
    .expect_err("unknown status")
    .0;
    let mut modules = Module::deserialize(serde::de::value::StrDeserializer::<WireNames>::new(
        "__contract_unknown__",
    ))
    .expect_err("unknown module")
    .0;
    statuses.sort_unstable();
    modules.sort_unstable();
    let mut expected_statuses: Vec<_> = contract["statuses"]
        .as_array()
        .expect("statuses")
        .iter()
        .map(|v| v.as_str().expect("status"))
        .collect();
    let mut expected_modules: Vec<_> = contract["modules"]
        .as_array()
        .expect("modules")
        .iter()
        .map(|v| v.as_str().expect("module"))
        .collect();
    expected_statuses.sort_unstable();
    expected_modules.sort_unstable();
    assert_eq!(statuses, expected_statuses);
    assert_eq!(modules, expected_modules);
    for value in contract["statuses"].as_array().expect("statuses") {
        let item: Status = serde_json::from_value(value.clone()).expect("status");
        assert_eq!(serde_json::to_value(item).expect("wire"), *value);
    }
    for value in contract["modules"].as_array().expect("modules") {
        let item: Module = serde_json::from_value(value.clone()).expect("module");
        assert_eq!(serde_json::to_value(item).expect("wire"), *value);
    }
}

fn action_contract() -> &'static serde_json::Value {
    static CONTRACT: std::sync::OnceLock<serde_json::Value> = std::sync::OnceLock::new();
    CONTRACT.get_or_init(|| {
        serde_json::from_str(include_str!("../../fixtures/admin-actions.json")).expect("contract")
    })
}
#[test]
fn confirmation_payload_binds_expected_state() {
    for body in [
        serde_json::json!({"action":"set_module","account_id":"19100600-0000-4000-8000-000000000002","module":"vantare.module.strategy","enabled":true,"expected_enabled":false}),
        serde_json::json!({"action":"set_rollout","module":"vantare.module.strategy","enabled_for_all":true,"expected_enabled":false}),
        serde_json::json!({"action":"mail_approve","campaign_id":"19100600-0000-4000-8000-000000000010","revision":1,"confirm":true,"expected_recipients":1}),
        serde_json::json!({"action":"mail_cancel","campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}),
    ] {
        let action: Action =
            serde_json::from_value(body.clone()).expect("closed confirmation contract");
        action.validate().expect("valid expectation");
        assert_eq!(serde_json::to_value(action).expect("payload"), body);
    }
}
