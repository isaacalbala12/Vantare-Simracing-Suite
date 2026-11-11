use crate::protocol::bindings::{canonical, constants, declare, sample_response};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
use std::fmt::Write as _;
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::testing::ReportScreenshot>(&mut text);
    declare::<crate::testing::ReportPreviewView>(&mut text);
    declare::<crate::testing::ReportReceiptView>(&mut text);
    declare::<crate::testing::ReportDraftState>(&mut text);
    declare::<crate::testing::TestingQuestionnaire>(&mut text);
    declare::<crate::testing::ReportFields>(&mut text);
    declare::<crate::testing::TestingReport>(&mut text);
    declare::<crate::testing::TestingView>(&mut text);
    declare::<crate::testing::LegacyMigration>(&mut text);
    declare::<crate::testing::ReportDraftView>(&mut text);
    constants!(&mut text, "reportFieldLimits", crate::testing::FIELD_LIMITS);
    constants!(&mut text, "reportModules", crate::testing::MODULES);
    constants!(&mut text, "reportAutosaveMs", crate::testing::AUTOSAVE_MS);
    constants!(
        &mut text,
        "reportScreenshotsAvailable",
        crate::testing::SCREENSHOTS_AVAILABLE
    );
    append_testing_id_constants(&mut text);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    host.push(HostToUi::Failure {
        id: 1,
        error: crate::protocol::HostError::EvidencePending,
    });
    host.extend(testing_reply_samples().into_iter().map(sample_response));
    ui.extend(
        testing_request_samples()
            .into_iter()
            .map(|request| UiToHost::Request { id: 1, request }),
    );
    serde_json::json!({"host":host,"ui":ui})
}
pub(crate) fn testing_request_samples() -> Vec<Request> {
    vec![
        Request::ReportSend {
            preview_id: "a".repeat(64),
            consent: true,
        },
        Request::ReportRetryPrepare {},
        Request::ReportPrepare {},
        Request::ReportRemoveScreenshot {
            id: "a".repeat(64),
            fields: crate::testing::ReportFields {
                module: "hub".into(),
                ..Default::default()
            },
        },
        Request::ReportCapture {
            fields: crate::testing::ReportFields {
                module: "hub".into(),
                ..Default::default()
            },
        },
        Request::TestingNoticeRead {
            id: "15350000-0000-0000-0000-000000000001".into(),
            updated_at: "2026-11-10T12:00:00Z".into(),
        },
        Request::TestingCredit {
            id: "15350000-0000-0000-0000-000000000001".into(),
            consent: true,
        },
        Request::TestingContribute {
            id: "15350000-0000-0000-0000-000000000001".into(),
            consent: true,
        },
        Request::TestingAnswer {
            id: "15350000-0000-0000-0000-000000000001".into(),
            score: 3,
        },
        Request::TestingRefresh {},
        Request::DraftLoad {},
        Request::DraftDiscard {},
        Request::DraftSave {
            fields: crate::testing::ReportFields {
                module: "hub".into(),
                ..Default::default()
            },
        },
    ]
}
pub(crate) fn testing_reply_samples() -> Vec<Reply> {
    vec![
        Reply::ReportSend {
            value: crate::testing::ReportReceiptView {
                id: "qa".into(),
                state: "submitted".into(),
                created_at: "2026-11-10T12:00:00Z".into(),
                draft_state: crate::testing::ReportDraftState::Cleared,
            },
        },
        Reply::ReportRetryPrepare {
            value: crate::testing::ReportPreviewView {
                id: "a".repeat(64),
                digest: "b".repeat(64),
                fields: crate::testing::ReportFields {
                    module: "hub".into(),
                    ..Default::default()
                },
                app_version: "QA".into(),
                os_version: "Windows".into(),
                channel: "nightly".into(),
                retry: false,
                screenshots: vec![],
            },
        },
        Reply::ReportPrepare {
            value: crate::testing::ReportPreviewView {
                id: "a".repeat(64),
                digest: "b".repeat(64),
                fields: crate::testing::ReportFields {
                    module: "hub".into(),
                    ..Default::default()
                },
                app_version: "QA".into(),
                os_version: "Windows".into(),
                channel: "nightly".into(),
                retry: false,
                screenshots: vec![],
            },
        },
        Reply::ReportRemoveScreenshot {
            value: crate::testing::draft(None),
        },
        Reply::ReportCapture {
            value: crate::testing::draft(None),
        },
        Reply::TestingNoticeRead {
            value: crate::testing::TestingView::default(),
        },
        Reply::TestingCredit {
            value: crate::testing::TestingView::default(),
        },
        Reply::TestingContribute {
            value: crate::testing::TestingView::default(),
        },
        Reply::TestingAnswer {
            value: crate::testing::TestingView::default(),
        },
        Reply::TestingRefresh {
            value: crate::testing::TestingView::default(),
        },
        Reply::DraftLoad {
            value: crate::testing::draft(None),
        },
        Reply::DraftSave {
            value: crate::testing::draft(None),
        },
        Reply::DraftDiscard {
            value: crate::testing::draft(None),
        },
    ]
}
fn append_testing_id_constants(text: &mut String) {
    for (name, value) in [
        (
            "reportReceiptStates",
            serde_json::json!(crate::testing::RECEIPT_STATES),
        ),
        (
            "reportReceiptLegacyPrefix",
            serde_json::json!(crate::testing::RECEIPT_LEGACY_PREFIX),
        ),
        (
            "testingBusyRetry",
            serde_json::json!({"delayMs":crate::testing::BUSY_RETRY_MS,"attempts":crate::testing::BUSY_RETRY_ATTEMPTS}),
        ),
        (
            "reportDraftStates",
            serde_json::json!([
                crate::testing::ReportDraftState::Cleared,
                crate::testing::ReportDraftState::Preserved,
                crate::testing::ReportDraftState::CleanupPending
            ]),
        ),
        (
            "reportStates",
            serde_json::json!(crate::testing::REPORT_STATES),
        ),
        (
            "reportScreenshotLimits",
            serde_json::json!({"jpeg":crate::testing::SCREENSHOT_JPEG_MAX,"side":crate::testing::SCREENSHOT_SIDE_MAX,"bytes":crate::testing::SCREENSHOT_BYTES_MAX,"count":crate::testing::SCREENSHOT_COUNT_MAX}),
        ),
        (
            "testingIdLimits",
            serde_json::json!({"uuid":crate::testing::UUID_LENGTH,"previewId":crate::testing::PREVIEW_ID_LENGTH,"updatedAt":crate::testing::UPDATED_AT_MAX_BYTES}),
        ),
        (
            "testingUuidGroups",
            serde_json::json!(crate::testing::UUID_GROUPS),
        ),
        (
            "reportLegacyStates",
            serde_json::json!([
                crate::testing::LegacyMigration::None,
                crate::testing::LegacyMigration::Imported,
                crate::testing::LegacyMigration::ImportedTrimmed,
                crate::testing::LegacyMigration::Preserved
            ]),
        ),
    ] {
        writeln!(text, "export const {name} = {} as const;", canonical(value))
            .expect("String write");
    }
}
