use crate::protocol::bindings::{canonical, declare, sample_response};
use crate::protocol::{Reply, Request, UiToHost};
use std::fmt::Write as _;

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::triage::TriageItem>(&mut text);
    declare::<crate::triage::TriageSelection>(&mut text);
    declare::<crate::triage::TriagePreview>(&mut text);
    for (name, value) in [
        (
            "triageConsentKeys",
            serde_json::json!(
                vantare_ipc::services_protocol::triage_document::Item::ALL.map(|item| item.key())
            ),
        ),
        (
            "triageItems",
            serde_json::json!(crate::triage::TriageItem::ALL),
        ),
        (
            "triagePreviewLimit",
            serde_json::json!(crate::triage::PREVIEW_LIMIT),
        ),
        (
            "triageLocalTitleMaxChars",
            serde_json::json!(crate::triage::LOCAL_TITLE_MAX_CHARS),
        ),
        (
            "triageLocalBodyMaxChars",
            serde_json::json!(crate::triage::LOCAL_BODY_MAX_CHARS),
        ),
    ] {
        writeln!(text, "export const {name} = {} as const;", canonical(value))
            .expect("String write");
    }
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let preview = vantare_ipc::services_protocol::triage_document::Preview {
        id: "a".repeat(64),
        channel: "nightly".into(),
        packet: vantare_ipc::services_protocol::triage_document::Packet {
            id: "15350000-0000-0000-0000-000000000001".into(),
            title: "[contenido retirado por privacidad]".into(),
            body: "[contenido retirado por privacidad]".into(),
            context: serde_json::json!({"app_version":"0.0.0","app_channel":"nightly","game":"none","game_version":null,"system":{},"telemetry_summary":null,"posthog_session_id":null,"consent":{"version":"triage-v2","items":[],"accepted_at":"2026-11-11T12:00:00Z"}}),
            attachments: vec![],
        },
    };
    let host: Vec<_> = [
        Reply::TriagePrepare {
            value: crate::triage::view(&preview).expect("safe triage corpus"),
        },
        Reply::TriageSend {
            value: crate::testing::TestingView {
                reports: vec![],
                questionnaires: vec![],
            },
        },
    ]
    .into_iter()
    .map(sample_response)
    .collect();
    let ui: Vec<_> = [
        Request::TriagePrepare {
            selection: crate::triage::TriageSelection {
                items: crate::triage::TriageItem::ALL.to_vec(),
            },
            consent: true,
        },
        Request::TriageSend {
            preview_id: "a".repeat(64),
            consent: true,
        },
    ]
    .into_iter()
    .map(|request| UiToHost::Request { id: 1, request })
    .collect();
    serde_json::json!({"host":host,"ui":ui})
}
