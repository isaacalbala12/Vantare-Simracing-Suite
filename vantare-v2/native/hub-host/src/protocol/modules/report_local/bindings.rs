use crate::protocol::bindings::{canonical, declare, sample_response};
use crate::protocol::{Reply, Request, UiToHost};
use std::fmt::Write as _;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::report_local::LocalReportView>(&mut text);
    declare::<crate::report_local::BinaryView>(&mut text);
    declare::<crate::report_local::BinaryState>(&mut text);
    declare::<crate::report_local::ExportStatus>(&mut text);
    append_report_local_constants(&mut text);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let host: Vec<_> = local_report_samples()
        .into_iter()
        .map(sample_response)
        .collect();
    let ui: Vec<_> = [
        Request::ReportLocalPrepare {
            fields: crate::testing::ReportFields {
                module: "hub".into(),
                ..Default::default()
            },
        },
        Request::ReportLocalExport {
            prepared_hash: "a".repeat(64),
        },
    ]
    .into_iter()
    .map(|request| UiToHost::Request { id: 1, request })
    .collect();
    serde_json::json!({ "host": host, "ui": ui })
}
fn append_report_local_constants(text: &mut String) {
    use crate::report_local::{BinaryState, ExportStatus};
    for (name, value) in [
        (
            "reportExportLimit",
            serde_json::json!(crate::report_local::EXPORT_LIMIT),
        ),
        (
            "reportExportName",
            serde_json::json!(crate::report_local::EXPORT_NAME),
        ),
        (
            "reportBinaryNames",
            serde_json::json!(crate::report_local::BINARIES),
        ),
        (
            "reportBinaryStates",
            serde_json::json!([
                BinaryState::Present,
                BinaryState::Missing,
                BinaryState::Unreadable,
                BinaryState::Unavailable
            ]),
        ),
        (
            "reportExportStatuses",
            serde_json::json!([
                ExportStatus::Saved,
                ExportStatus::Cancelled,
                ExportStatus::Conflict
            ]),
        ),
    ] {
        writeln!(text, "export const {name} = {} as const;", canonical(value))
            .expect("String write");
    }
}

fn local_report_samples() -> [Reply; 3] {
    [
        Reply::ReportLocalPrepare {
            value: crate::report_local::prepare(
                &crate::testing::ReportFields {
                    module: "hub".into(),
                    ..Default::default()
                },
                &crate::diagnostics::Observed::default()
                    .view(&crate::protocol::CoreStatus::default(), false),
                vec![],
            )
            .expect("local report sample"),
        },
        Reply::ReportLocalExport {
            status: crate::report_local::ExportStatus::Saved,
        },
        Reply::ReportLocalExport {
            status: crate::report_local::ExportStatus::Cancelled,
        },
    ]
}
