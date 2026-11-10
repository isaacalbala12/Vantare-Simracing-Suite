use crate::protocol::bindings::{constants, declare};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::diagnostics::DiagnosticSection>(&mut text);
    declare::<crate::diagnostics::DiagnosticCode>(&mut text);
    declare::<crate::diagnostics::DiagnosticEntry>(&mut text);
    declare::<crate::diagnostics::DiagnosticView>(&mut text);
    constants!(
        &mut text,
        "diagnosticSections",
        crate::diagnostics::DiagnosticSection::ALL
    );
    constants!(
        &mut text,
        "diagnosticCodes",
        crate::diagnostics::DiagnosticCode::ALL
    );
    constants!(
        &mut text,
        "diagnosticEventLimit",
        crate::diagnostics::EVENT_LIMIT
    );
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let diagnostic: crate::diagnostics::DiagnosticView =
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../hub-web/fixtures/diagnostics-base.json"
        )))
        .expect("diagnostic fixture");
    let host: Vec<HostToUi> = vec![
        HostToUi::Response {
            id: 1,
            result: Reply::DiagnosticsGet {
                value: diagnostic.clone(),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::DiagnosticsPrepare { value: diagnostic },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::DiagnosticsCopy {
                text: "{\"schemaVersion\":1}".into(),
            },
        },
    ];
    let ui: Vec<UiToHost> = vec![
        UiToHost::Request {
            id: 1,
            request: Request::DiagnosticsGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::DiagnosticsPrepare {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::DiagnosticsCopy {},
        },
    ];

    serde_json::json!({"host":host,"ui":ui})
}
