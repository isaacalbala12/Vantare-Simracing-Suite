// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::diagnostics::DiagnosticSection>(&mut text);
    declare::<crate::diagnostics::DiagnosticCode>(&mut text);
    declare::<crate::diagnostics::DiagnosticEntry>(&mut text);
    declare::<crate::diagnostics::DiagnosticView>(&mut text);
    declare_named::<super::Request>(&mut text, "DiagnosticsRequest");
    declare_named::<super::Reply>(&mut text, "DiagnosticsReply");
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
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    let diagnostic: crate::diagnostics::DiagnosticView =
        serde_json::from_str(include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../hub-web/fixtures/diagnostics-base.json"
        )))
        .expect("diagnostic fixture");
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::DiagnosticsGet {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::DiagnosticsPrepare {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::DiagnosticsCopy {},
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::DiagnosticsGet {
            value: diagnostic.clone(),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::DiagnosticsPrepare { value: diagnostic },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::DiagnosticsCopy {
            text: "{\"schemaVersion\":1}".into(),
        },
    });
    serde_json::json!({"host":host,"ui":ui})
}
