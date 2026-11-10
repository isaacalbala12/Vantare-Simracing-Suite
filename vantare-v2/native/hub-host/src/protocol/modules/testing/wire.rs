//! Owned wire variants. The build assembles the closed transport enums.
use super::super::*;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "testing.answer")]
    TestingAnswer { id: String, score: u8 },
    #[serde(rename = "testing.contribute")]
    TestingContribute { id: String, consent: bool },
    #[serde(rename = "testing.credit")]
    TestingCredit { id: String, consent: bool },
    #[serde(rename = "testing.noticeRead")]
    TestingNoticeRead {
        id: String,
        #[serde(rename = "updatedAt")]
        updated_at: String,
    },
    #[serde(rename = "report.capture")]
    ReportCapture {
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "report.removeScreenshot")]
    ReportRemoveScreenshot {
        id: String,
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "report.prepare")]
    ReportPrepare {},
    #[serde(rename = "report.retryPrepare")]
    ReportRetryPrepare {},
    #[serde(rename = "report.send")]
    ReportSend {
        #[serde(rename = "previewId")]
        preview_id: String,
        consent: bool,
    },

    #[serde(rename = "testing.refresh")]
    TestingRefresh {},
    #[serde(rename = "draft.load")]
    DraftLoad {},
    #[serde(rename = "draft.save")]
    DraftSave {
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "draft.discard")]
    DraftDiscard {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "testing.answer")]
    TestingAnswer { value: crate::testing::TestingView },
    #[serde(rename = "testing.contribute")]
    TestingContribute { value: crate::testing::TestingView },
    #[serde(rename = "testing.credit")]
    TestingCredit { value: crate::testing::TestingView },
    #[serde(rename = "testing.noticeRead")]
    TestingNoticeRead { value: crate::testing::TestingView },
    #[serde(rename = "report.capture")]
    ReportCapture {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "report.removeScreenshot")]
    ReportRemoveScreenshot {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "report.prepare")]
    ReportPrepare {
        value: crate::testing::ReportPreviewView,
    },
    #[serde(rename = "report.retryPrepare")]
    ReportRetryPrepare {
        value: crate::testing::ReportPreviewView,
    },
    #[serde(rename = "report.send")]
    ReportSend {
        value: crate::testing::ReportReceiptView,
    },

    #[serde(rename = "testing.refresh")]
    TestingRefresh { value: crate::testing::TestingView },
    #[serde(rename = "draft.load")]
    DraftLoad {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "draft.save")]
    DraftSave {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "draft.discard")]
    DraftDiscard {
        value: crate::testing::ReportDraftView,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
