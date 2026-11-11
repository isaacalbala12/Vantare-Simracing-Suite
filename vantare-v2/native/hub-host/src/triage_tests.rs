use super::*;
use serde_json::json;

#[test]
fn timestamps_cannot_carry_arbitrary_private_text_or_invalid_dates() {
    for text in [
        "2026-11-11T12:00:00Z",
        "2026-11-11T12:00:00.123456789+02:00",
        "2024-02-29T23:59:60Z",
    ] {
        assert!(timestamp(&json!(text)));
    }
    for text in [
        "private@example.com",
        "2026-02-29T12:00:00Z",
        "2026-11-31T12:00:00Z",
        "2026-11-11T25:00:00Z",
        "+123-11-11T12:00:00Z",
        "2026-11-11T12:00:00++1:00",
        "2026-11-11T12:00:00Z private",
    ] {
        assert!(!timestamp(&json!(text)));
    }
}

fn access() -> AccessView {
    AccessView {
        verified: true,
        tester: true,
        ..Default::default()
    }
}
fn request() -> Request {
    Request::TriagePrepare {
        selection: TriageSelection {
            items: TriageItem::ALL.to_vec(),
        },
        consent: true,
    }
}
fn fixture() -> document::Preview {
    document::Preview {
        id: "a".repeat(testing::PREVIEW_ID_LENGTH),
        channel: "nightly".into(),
        packet: document::Packet {
            id: "15350000-0000-0000-0000-000000000001".into(),
            title: PRIVATE_TEXT.into(),
            body: PRIVATE_TEXT.into(),
            context: json!({"app_version":"0.0.0","app_channel":"nightly","game":"none","game_version":null,
                "system":{},"telemetry_summary":null,"posthog_session_id":null,
                "consent":{"version":"triage-v2","items":[],"accepted_at":"2026-11-10T12:00:00+00:00"}}),
            attachments: vec![],
        },
    }
}
#[test]
fn tester_rights_are_required_for_both_commands() {
    for access in [
        AccessView::default(),
        AccessView {
            verified: true,
            ..Default::default()
        },
        AccessView {
            blocked: true,
            ..access()
        },
    ] {
        for request in [
            request(),
            Request::TriageSend {
                preview_id: "a".repeat(64),
                consent: true,
            },
        ] {
            assert!(matches!(intent(&request, &access), Err(HostError::Denied)));
        }
    }
}
#[test]
fn preparation_never_sends_local_prose_and_requires_unique_closed_selection_and_consent() {
    let (
        _,
        core::Command::TriagePrepare {
            title,
            body,
            selection,
            consent,
        },
    ) = intent(&request(), &access()).unwrap()
    else {
        panic!("prepare")
    };
    assert!(title.is_empty() && body.is_empty() && consent);
    assert_eq!(selection.items, document::Item::ALL.into_iter().collect());
    for request in [
        Request::TriagePrepare {
            selection: TriageSelection { items: vec![] },
            consent: false,
        },
        Request::TriagePrepare {
            selection: TriageSelection {
                items: vec![TriageItem::System, TriageItem::System],
            },
            consent: true,
        },
        Request::TriageSend {
            preview_id: "a".repeat(64),
            consent: false,
        },
        Request::TriageSend {
            preview_id: "a".repeat(1024 * 1024),
            consent: true,
        },
        Request::TriageSend {
            preview_id: "A".repeat(64),
            consent: true,
        },
    ] {
        assert!(matches!(
            intent(&request, &access()),
            Err(HostError::Rejected)
        ));
    }
    for extra in ["title", "body", "path", "url"] {
        let mut value = json!({"method":"triage.prepare","selection":{"items":[]},"consent":true});
        value[extra] = "private local prose".into();
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
}
#[test]
fn preview_is_the_exact_core_payload_after_closed_validation() {
    let mut preview = fixture();
    preview.packet.context["system"] = json!({"os":{"name":"Windows","version":"10.0.0","build":"26100"},
        "cpu":{"cores":8},"gpu":[{"driver_version":"1.2.3"}],"ram_gb":16,"obs_active":false,
        "overlays_active":["Vantare"],"displays":[{"width":1440,"height":900,"hz":60,"dpi_scale":1,"primary":true}]});
    preview.packet.context["telemetry_summary"] = json!({"errors":[{"type":"ServicesCommandFailure","message":"ServicesCommandFailure","fingerprint":"b".repeat(64)}],
        "events":[{"name":"ServicesCommandSuccess","at":"2026-11-10T12:00:00Z"}]});
    let content = json!([{"level":"ERROR","module":"services","relative_ms":100}]).to_string();
    preview.packet.attachments.push(document::Attachment {
        kind: "app_log".into(),
        sha256: vantare_services::content_hash(content.as_bytes()),
        content,
    });
    let projected = view(&preview).unwrap();
    let actual: Value = serde_json::from_str(&projected.payload).unwrap();
    assert_eq!(actual, preview.packet.rpc_payload(&preview.channel));
    assert_eq!(projected.id, preview.id);
    assert!(matches!(
        complete(Operation::Prepare, core::Reply::TriagePreview { preview }),
        Ok(Reply::TriagePrepare { .. })
    ));
}
#[test]
fn unexpected_prose_paths_identifiers_and_attachment_content_never_reach_renderer() {
    let original = fixture();
    let mut invalid = vec![];
    let mut value = original.clone();
    value.packet.title = "private tester prose".into();
    invalid.push(value);
    let mut value = original.clone();
    value.packet.context["account"] = "private-account".into();
    invalid.push(value);
    let mut value = original.clone();
    value.packet.context["system"]["os"] = json!({"name":"private-computer"});
    invalid.push(value);
    let mut value = original.clone();
    value.packet.context["system"]["path"] = "D:/private".into();
    invalid.push(value);
    let mut value = original.clone();
    value.packet.context["posthog_session_id"] = "private-session".into();
    invalid.push(value);
    let mut value = original.clone();
    value.packet.context["telemetry_summary"] = json!({"errors":[{"type":"ServicesCommandFailure","message":"private prose","fingerprint":"b".repeat(64)}],"events":[]});
    invalid.push(value);
    let mut value = original.clone();
    value.id = "bad-id".into();
    invalid.push(value);
    let mut value = original.clone();
    value.packet.id = "bad-id".into();
    invalid.push(value);
    let mut value = original.clone();
    value.packet.context["game"] = "private-process".into();
    invalid.push(value);
    let mut value = original.clone();
    let content =
        json!([{"level":"INFO","module":"services","relative_ms":1,"message":"private log"}])
            .to_string();
    value.packet.attachments.push(document::Attachment {
        kind: "app_log".into(),
        sha256: vantare_services::content_hash(content.as_bytes()),
        content,
    });
    invalid.push(value);
    for value in invalid {
        assert!(matches!(view(&value), Err(HostError::Rejected)));
    }
}
#[test]
fn service_errors_and_other_families_are_rejected_without_forwarding_message() {
    assert!(matches!(
        complete(
            Operation::Prepare,
            core::Reply::Error {
                message: "private core error".into()
            }
        ),
        Err(HostError::Rejected)
    ));
    assert!(matches!(
        complete(
            Operation::Send,
            core::Reply::TriagePreview { preview: fixture() }
        ),
        Err(HostError::Rejected)
    ));
    assert!(matches!(
        complete(
            Operation::Send,
            core::Reply::Testing {
                data: core::testing_document::Participation::default()
            }
        ),
        Ok(Reply::TriageSend { .. })
    ));
}

#[test]
fn embedded_payload_has_stable_key_order_with_preserve_order_enabled() {
    let payload = view(&fixture()).unwrap().payload;
    for keys in [
        &[
            "p_attachments",
            "p_body",
            "p_channel",
            "p_context",
            "p_id",
            "p_title",
        ][..],
        &[
            "app_channel",
            "app_version",
            "consent",
            "game",
            "game_version",
            "posthog_session_id",
            "system",
            "telemetry_summary",
        ][..],
        &["accepted_at", "items", "version"][..],
    ] {
        let mut remaining = payload.as_str();
        for key in keys {
            let marker = format!("\"{key}\":");
            let offset = remaining.find(&marker).expect("canonical key sequence");
            remaining = &remaining[offset + marker.len()..];
        }
    }
}
