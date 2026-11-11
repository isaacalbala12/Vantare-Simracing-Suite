//! Closed presentation contract for Testing Center. Services owns persistence.
#[path = "testing_legacy.rs"]
pub(crate) mod legacy;
use crate::protocol::{AccessView, HostError};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::services_protocol::{self as core, report_document, testing_document};

pub use report_document::{FIELD_LIMITS, MODULES, SCREENSHOTS_AVAILABLE};
pub const AUTOSAVE_MS: u32 = 2_000;
pub const BUSY_RETRY_MS: u32 = 100;
pub const BUSY_RETRY_ATTEMPTS: u8 = 2;
pub const UUID_LENGTH: usize = 36;
pub const UUID_GROUPS: [usize; 5] = [8, 4, 4, 4, 12];
pub const PREVIEW_ID_LENGTH: usize = 64;
pub const UPDATED_AT_MAX_BYTES: usize = 128;
pub const SCREENSHOT_JPEG_MAX: usize = (10 * 1024_usize).div_ceil(3) * 4;
pub const SCREENSHOT_SIDE_MAX: u32 = 1920;
pub const SCREENSHOT_BYTES_MAX: u32 = vantare_services::report::screenshots::MAX_BYTES as u32;
pub const SCREENSHOT_COUNT_MAX: usize = 3;
pub const REPORT_STATES: [&str; 6] = [
    "received",
    "reviewing",
    "accepted",
    "declined",
    "spam",
    "fixed",
];
pub const RECEIPT_STATES: [&str; 2] = ["received", "submitted"];
pub const RECEIPT_LEGACY_PREFIX: &str = "report_";
fn valid_receipt(value: &report_document::Receipt) -> bool {
    (testing_id(&value.report_id) && value.report_state == RECEIPT_STATES[0])
        || (value
            .report_id
            .strip_prefix(RECEIPT_LEGACY_PREFIX)
            .is_some_and(preview_id)
            && value.report_state == RECEIPT_STATES[1])
}
pub fn testing_id(value: &str) -> bool {
    value.len() == UUID_LENGTH && vantare_services::license::uuid(value)
}
pub fn preview_id(value: &str) -> bool {
    value.len() == PREVIEW_ID_LENGTH
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn updated_at(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= UPDATED_AT_MAX_BYTES
        && value.is_ascii()
        && !value.bytes().any(|b| b.is_ascii_control())
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportFields {
    pub action_text: String,
    pub expected_text: String,
    pub observed_text: String,
    pub context_text: String,
    pub module: String,
}
impl ReportFields {
    pub fn valid(&self) -> bool {
        MODULES.iter().any(|(id, _)| *id == self.module)
            && [
                &self.action_text,
                &self.expected_text,
                &self.observed_text,
                &self.context_text,
            ]
            .into_iter()
            .zip(FIELD_LIMITS)
            .all(|(text, limit)| {
                text.len() <= limit
                    && !text
                        .chars()
                        .any(|c| c.is_control() && !matches!(c, '\n' | '\t'))
            })
    }
    pub fn core(&self) -> report_document::Fields {
        report_document::Fields {
            action_text: self.action_text.clone(),
            expected_text: self.expected_text.clone(),
            observed_text: self.observed_text.clone(),
            context_text: self.context_text.clone(),
            module: self.module.clone(),
        }
    }
}
impl From<&report_document::Fields> for ReportFields {
    fn from(fields: &report_document::Fields) -> Self {
        Self {
            action_text: fields.action_text.clone(),
            expected_text: fields.expected_text.clone(),
            observed_text: fields.observed_text.clone(),
            context_text: fields.context_text.clone(),
            module: fields.module.clone(),
        }
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TestingReport {
    pub id: String,
    pub title: String,
    pub state: String,
    pub credit: bool,
    pub updated_at: Option<String>,
    pub fixed_version: Option<String>,
    pub notice: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TestingQuestionnaire {
    pub id: String,
    pub version: String,
    pub title: String,
    pub question: String,
    pub score: Option<u8>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TestingView {
    pub reports: Vec<TestingReport>,
    pub questionnaires: Vec<TestingQuestionnaire>,
}
pub fn participation(data: &testing_document::Participation) -> TestingView {
    TestingView {
        reports: data
            .contributions
            .iter()
            .map(|report| TestingReport {
                id: report.id.clone(),
                title: report.title.clone(),
                state: report.state.clone(),
                credit: report.credit,
                updated_at: report.updated_at.clone(),
                fixed_version: report.fixed_version.clone(),
                notice: report.notice,
            })
            .collect(),
        questionnaires: data
            .questionnaires
            .iter()
            .map(|q| TestingQuestionnaire {
                id: q.id.clone(),
                version: q.version.clone(),
                title: q.title.clone(),
                question: q.question.clone(),
                score: q.score,
            })
            .collect(),
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LegacyMigration {
    #[default]
    None,
    Imported,
    ImportedTrimmed,
    Archived,
    Preserved,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportDraftView {
    pub legacy: LegacyMigration,
    pub fields: ReportFields,
    pub exists: bool,
    pub screenshots: Vec<ReportScreenshot>,
    pub message: String,
}
pub fn draft(value: Option<&report_document::Draft>) -> ReportDraftView {
    ReportDraftView {
        legacy: LegacyMigration::None,
        fields: value.map_or_else(
            || ReportFields {
                module: "unknown".into(),
                ..Default::default()
            },
            |draft| ReportFields::from(&draft.fields),
        ),
        exists: value.is_some(),
        screenshots: value.map_or_else(Vec::new, |d| screenshots(&d.screenshots)),
        message: String::new(),
    }
}
pub fn allowed(access: &AccessView) -> bool {
    access.verified && !access.blocked
}
pub fn draft_save(access: &AccessView, fields: &ReportFields) -> Result<core::Command, HostError> {
    if !allowed(access) {
        return Err(HostError::Denied);
    }
    if !fields.valid() {
        return Err(HostError::Rejected);
    }
    // Existing Services contract has no expected revision. VANTA-138 explicitly
    // preserves that guarantee provisionally; this is not cross-process CAS.
    Ok(core::Command::DraftSave {
        fields: fields.core(),
    })
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportScreenshot {
    pub id: String,
    pub jpeg: String,
    pub width: u32,
    pub height: u32,
    pub byte_size: u32,
}
fn screenshots(values: &[report_document::ScreenshotPreview]) -> Vec<ReportScreenshot> {
    values
        .iter()
        .map(|s| ReportScreenshot {
            id: s.id.clone(),
            jpeg: s.jpeg.clone(),
            width: s.width,
            height: s.height,
            byte_size: u32::try_from(s.byte_size).unwrap_or(u32::MAX),
        })
        .collect()
}
fn valid_screenshots(values: &[report_document::ScreenshotPreview]) -> bool {
    values.len() <= SCREENSHOT_COUNT_MAX
        && values.iter().all(|s| {
            preview_id(&s.id)
                && s.jpeg.len() <= SCREENSHOT_JPEG_MAX
                && s.jpeg.is_ascii()
                && s.jpeg
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b))
                && (1..=SCREENSHOT_SIDE_MAX).contains(&s.width)
                && (1..=SCREENSHOT_SIDE_MAX).contains(&s.height)
                && s.byte_size > 0
                && s.byte_size <= SCREENSHOT_BYTES_MAX as usize
        })
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportPreviewView {
    pub id: String,
    pub digest: String,
    pub fields: ReportFields,
    pub app_version: String,
    pub os_version: String,
    pub channel: String,
    pub retry: bool,
    pub screenshots: Vec<ReportScreenshot>,
}
pub fn preview(value: &report_document::Preview) -> Result<ReportPreviewView, HostError> {
    if !SCREENSHOTS_AVAILABLE && !value.screenshots.is_empty() {
        return Err(HostError::EvidencePending);
    }
    let payload: serde_json::Value =
        serde_json::from_str(&value.payload).map_err(|_| HostError::Rejected)?;
    let report = payload.get("reporte").unwrap_or(&payload);
    let text = |name: &str| {
        report
            .get(name)
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned)
            .ok_or(HostError::Rejected)
    };
    let fields = ReportFields {
        action_text: text("p_action_text")?,
        expected_text: text("p_expected_text")?,
        observed_text: text("p_observed_text")?,
        context_text: text("p_context_text")?,
        module: text("p_module")?,
    };
    if !fields.valid()
        || !preview_id(&value.id)
        || !preview_id(&value.digest)
        || !valid_screenshots(&value.screenshots)
    {
        return Err(HostError::Rejected);
    }
    Ok(ReportPreviewView {
        id: value.id.clone(),
        digest: value.digest.clone(),
        fields,
        app_version: text("p_app_version")?,
        os_version: text("p_os_version")?,
        channel: value.channel.clone(),
        retry: value.retry,
        screenshots: screenshots(&value.screenshots),
    })
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportReceiptView {
    pub id: String,
    pub state: String,
    pub created_at: String,
    pub draft_state: ReportDraftState,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReportDraftState {
    Cleared,
    Preserved,
    CleanupPending,
}
pub fn receipt(value: &report_document::Receipt, state: core::DraftState) -> ReportReceiptView {
    ReportReceiptView {
        id: value.report_id.clone(),
        state: value.report_state.clone(),
        created_at: value.created_at.clone(),
        draft_state: match state {
            core::DraftState::Cleared => ReportDraftState::Cleared,
            core::DraftState::Preserved => ReportDraftState::Preserved,
            core::DraftState::CleanupPending => ReportDraftState::CleanupPending,
        },
    }
}

#[derive(Clone, Copy)]
pub enum Operation {
    Refresh,
    Answer,
    Contribute,
    Credit,
    NoticeRead,
    Load,
    Save,
    Discard,
    Capture,
    RemoveScreenshot,
    Prepare,
    RetryPrepare,
    Send,
}
pub fn intent(
    request: &crate::protocol::Request,
    access: &AccessView,
) -> Result<(Operation, core::Command), HostError> {
    use crate::protocol::Request;
    use core::Command;
    if !allowed(access) {
        return Err(HostError::Denied);
    }
    if matches!(request, Request::ReportCapture { .. }) && !SCREENSHOTS_AVAILABLE {
        return Err(HostError::EvidencePending);
    }
    let tester_only = matches!(
        request,
        Request::TestingRefresh {}
            | Request::TestingAnswer { .. }
            | Request::TestingCredit { .. }
            | Request::TestingNoticeRead { .. }
    );
    if (tester_only && !access.tester)
        || (matches!(request, Request::TestingContribute { .. }) && access.tester)
    {
        return Err(HostError::Denied);
    }
    let intent = match request {
        Request::TestingRefresh {} => (Operation::Refresh, Command::TestingRefresh),
        Request::TestingAnswer { id, score } if testing_id(id) && (1..=5).contains(score) => (
            Operation::Answer,
            Command::TestingAnswer {
                id: id.clone(),
                score: *score,
                note: String::new(),
            },
        ),
        Request::TestingContribute { id, consent: true } if testing_id(id) => (
            Operation::Contribute,
            Command::TestingContribute {
                id: id.clone(),
                title: "Informe estructurado".into(),
                body: "Revisión humana pendiente".into(),
                consent: true,
            },
        ),
        Request::TestingCredit { id, consent } if testing_id(id) => (
            Operation::Credit,
            Command::TestingCredit {
                id: id.clone(),
                consent: *consent,
            },
        ),
        Request::TestingNoticeRead { id, updated_at: at } if testing_id(id) && updated_at(at) => (
            Operation::NoticeRead,
            Command::TestingNoticeRead {
                id: id.clone(),
                updated_at: at.clone(),
            },
        ),
        Request::DraftLoad {} => (Operation::Load, Command::DraftLoad),
        Request::DraftSave { fields } => (Operation::Save, draft_save(access, fields)?),
        Request::DraftDiscard {} => (Operation::Discard, Command::DraftDiscard),
        Request::ReportCapture { fields } if fields.valid() => (
            Operation::Capture,
            Command::ReportCapture {
                fields: fields.core(),
            },
        ),
        Request::ReportRemoveScreenshot { id, fields } if preview_id(id) && fields.valid() => (
            Operation::RemoveScreenshot,
            Command::ReportRemoveScreenshot {
                id: id.clone(),
                fields: fields.core(),
            },
        ),
        Request::ReportPrepare {} => (Operation::Prepare, Command::ReportPrepare),
        Request::ReportRetryPrepare {} => (Operation::RetryPrepare, Command::ReportRetryPrepare),
        Request::ReportSend {
            preview_id,
            consent: true,
        } if self::preview_id(preview_id) => (
            Operation::Send,
            Command::ReportSend {
                preview_id: preview_id.clone(),
            },
        ),
        _ => return Err(HostError::Rejected),
    };
    Ok(intent)
}
pub fn complete(
    operation: Operation,
    reply: core::Reply,
) -> Result<crate::protocol::Reply, HostError> {
    use crate::protocol::Reply;
    match reply {
        core::Reply::Testing { data } => {
            if data
                .contributions
                .iter()
                .any(|report| !REPORT_STATES.contains(&report.state.as_str()))
            {
                return Err(HostError::Rejected);
            }
            let value = participation(&data);
            match operation {
                Operation::Refresh => Ok(Reply::TestingRefresh { value }),
                Operation::Answer => Ok(Reply::TestingAnswer { value }),
                Operation::Contribute => Ok(Reply::TestingContribute { value }),
                Operation::Credit => Ok(Reply::TestingCredit { value }),
                Operation::NoticeRead => Ok(Reply::TestingNoticeRead { value }),
                _ => Err(HostError::Rejected),
            }
        }
        core::Reply::Draft {
            draft: saved,
            message,
        } => {
            if saved
                .as_ref()
                .is_some_and(|draft| !valid_screenshots(&draft.screenshots))
            {
                return Err(HostError::Rejected);
            }
            let mut value = draft(saved.as_ref());
            value.message = message;
            match operation {
                Operation::Load => Ok(Reply::DraftLoad { value }),
                Operation::Save => Ok(Reply::DraftSave { value }),
                Operation::Discard => Ok(Reply::DraftDiscard { value }),
                Operation::Capture => Ok(Reply::ReportCapture { value }),
                Operation::RemoveScreenshot => Ok(Reply::ReportRemoveScreenshot { value }),
                _ => Err(HostError::Rejected),
            }
        }
        core::Reply::ReportPreview { preview: value } => {
            let value = preview(&value)?;
            match operation {
                Operation::Prepare => Ok(Reply::ReportPrepare { value }),
                Operation::RetryPrepare => Ok(Reply::ReportRetryPrepare { value }),
                _ => Err(HostError::Rejected),
            }
        }
        core::Reply::ReportReceipt {
            receipt: value,
            draft_state,
        } if matches!(operation, Operation::Send) && valid_receipt(&value) => {
            Ok(Reply::ReportSend {
                value: receipt(&value, draft_state),
            })
        }
        _ => Err(HostError::Rejected),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const ID: &str = "15350000-0000-0000-0000-000000000001";
    fn access(tester: bool) -> AccessView {
        AccessView {
            verified: true,
            tester,
            ..Default::default()
        }
    }
    #[test]
    fn oversized_and_malformed_identifiers_are_rejected_before_services() {
        use crate::protocol::Request;
        for id in [
            String::new(),
            "a".repeat(core::MAX_FRAME),
            "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA".to_owned(),
            "../report".into(),
        ] {
            for request in [
                Request::TestingAnswer {
                    id: id.clone(),
                    score: 3,
                },
                Request::TestingCredit {
                    id: id.clone(),
                    consent: true,
                },
                Request::TestingNoticeRead {
                    id,
                    updated_at: "2026-11-10T12:00:00Z".into(),
                },
            ] {
                assert!(matches!(
                    intent(&request, &access(true)),
                    Err(HostError::Rejected)
                ));
            }
        }
        for value in [
            "a".repeat(PREVIEW_ID_LENGTH - 1),
            "A".repeat(PREVIEW_ID_LENGTH),
            "g".repeat(PREVIEW_ID_LENGTH),
            "a".repeat(core::MAX_FRAME),
        ] {
            assert!(matches!(
                intent(
                    &Request::ReportSend {
                        preview_id: value,
                        consent: true
                    },
                    &access(false)
                ),
                Err(HostError::Rejected)
            ));
        }
        for at in [
            String::new(),
            "x".repeat(UPDATED_AT_MAX_BYTES + 1),
            "2026-11-10\n".into(),
            "ñ".into(),
        ] {
            assert!(matches!(
                intent(
                    &Request::TestingNoticeRead {
                        id: ID.into(),
                        updated_at: at
                    },
                    &access(true)
                ),
                Err(HostError::Rejected)
            ));
        }
        assert!(preview_id(&"a".repeat(PREVIEW_ID_LENGTH)));
        assert!(testing_id(ID));
        assert!(updated_at("2026-11-10T12:00:00Z"));
    }
    #[test]
    fn fresh_core_role_is_required_for_each_participation_operation() {
        use crate::protocol::Request;
        for request in [
            Request::TestingRefresh {},
            Request::TestingAnswer {
                id: ID.into(),
                score: 3,
            },
            Request::TestingCredit {
                id: ID.into(),
                consent: true,
            },
            Request::TestingNoticeRead {
                id: ID.into(),
                updated_at: "2026-11-10T12:00:00Z".into(),
            },
        ] {
            assert!(matches!(
                intent(&request, &access(false)),
                Err(HostError::Denied)
            ));
            let (_, command) = intent(&request, &access(true)).expect("tester");
            let mut frame = Vec::new();
            core::write(&mut frame, &command).expect("bounded service command");
            assert!(frame.len() <= core::MAX_FRAME);
        }
        let contribute = Request::TestingContribute {
            id: ID.into(),
            consent: true,
        };
        assert!(intent(&contribute, &access(false)).is_ok());
        assert!(matches!(
            intent(&contribute, &access(true)),
            Err(HostError::Denied)
        ));
        for tester in [false, true] {
            for request in [
                Request::DraftLoad {},
                Request::DraftDiscard {},
                Request::ReportPrepare {},
                Request::ReportRetryPrepare {},
                Request::ReportSend {
                    preview_id: "a".repeat(PREVIEW_ID_LENGTH),
                    consent: true,
                },
            ] {
                assert!(intent(&request, &access(tester)).is_ok());
                assert!(matches!(
                    intent(
                        &request,
                        &AccessView {
                            blocked: true,
                            ..access(tester)
                        }
                    ),
                    Err(HostError::Denied)
                ));
                assert!(matches!(
                    intent(&request, &AccessView::default()),
                    Err(HostError::Denied)
                ));
            }
        }
    }
    #[test]
    fn untyped_service_errors_and_unexpected_families_are_rejected_without_text() {
        for error in [
            vantare_services::Error::EvidencePending,
            vantare_services::Error::Canceled,
            vantare_services::Error::RateLimited,
            vantare_services::Error::Conflict,
            vantare_services::Error::Offline,
        ] {
            assert_eq!(
                complete(
                    Operation::Send,
                    core::Reply::Error {
                        message: error.to_string()
                    }
                ),
                Err(HostError::Rejected)
            );
        }
        assert_eq!(
            complete(
                Operation::Load,
                core::Reply::Error {
                    message: "private arbitrary text".into()
                }
            ),
            Err(HostError::Rejected)
        );
        assert_eq!(
            complete(Operation::Load, core::Reply::Closed),
            Err(HostError::Rejected)
        );
    }
    #[test]
    fn draft_boundary_rejects_denied_access_unknown_modules_and_utf8_overflow() {
        let access = AccessView {
            verified: true,
            ..Default::default()
        };
        let mut fields = ReportFields {
            module: "hub".into(),
            action_text: "ñ".repeat(FIELD_LIMITS[0] / 2),
            ..Default::default()
        };
        assert!(draft_save(&access, &fields).is_ok());
        assert!(draft_save(&AccessView::default(), &fields).is_err());
        assert!(
            draft_save(
                &AccessView {
                    blocked: true,
                    ..access.clone()
                },
                &fields
            )
            .is_err()
        );
        fields.action_text.push('ñ');
        assert!(draft_save(&access, &fields).is_err());
        fields.action_text.clear();
        fields.module = "arbitrary".into();
        assert!(draft_save(&access, &fields).is_err());
    }
    #[test]
    fn projections_do_not_expose_private_body_or_idempotency_key() {
        let data: testing_document::Participation = serde_json::from_value(serde_json::json!({"questionnaires":[],"contributions":[{"id":"qa","title":"Title","body":"private body","state":"received"}]})).unwrap();
        let view = serde_json::to_string(&participation(&data)).unwrap();
        assert!(!view.contains("private body"));
        let draft = report_document::Draft {
            schema_version: 1,
            idempotency_key: "private key".into(),
            fields: ReportFields {
                module: "hub".into(),
                ..Default::default()
            }
            .core(),
            screenshots: vec![],
        };
        assert!(
            !serde_json::to_string(&super::draft(Some(&draft)))
                .unwrap()
                .contains("private key")
        );
    }
    #[test]
    fn consent_and_reply_family_are_checked_before_forwarding() {
        use crate::protocol::Request;
        let access = AccessView {
            verified: true,
            ..Default::default()
        };
        for request in [
            Request::TestingContribute {
                id: "qa".into(),
                consent: false,
            },
            Request::ReportSend {
                preview_id: "qa".into(),
                consent: false,
            },
            Request::TestingAnswer {
                id: "qa".into(),
                score: 6,
            },
        ] {
            assert!(intent(&request, &access).is_err());
        }
        assert!(
            complete(
                Operation::Send,
                core::Reply::Draft {
                    draft: None,
                    message: String::new()
                }
            )
            .is_err()
        );
        assert!(
            complete(
                Operation::Load,
                core::Reply::Testing {
                    data: testing_document::Participation::default()
                }
            )
            .is_err()
        );
    }
    #[test]
    fn preview_projects_only_the_approved_display_fields() {
        let preview = report_document::Preview { id: "a".repeat(64), digest: "b".repeat(64), account_id: "private account".into(), channel: "nightly".into(), retry: false, screenshots: vec![], payload: serde_json::json!({"p_module":"hub", "p_action_text":"action", "p_expected_text":"expected", "p_observed_text":"observed", "p_context_text":"context", "p_app_version":"QA", "p_os_version":"Windows", "p_idempotency_key":"private key"}).to_string() };
        let value = serde_json::to_string(&super::preview(&preview).unwrap()).unwrap();
        assert!(!value.contains("private account") && !value.contains("private key"));
        let with_image = report_document::Preview {
            screenshots: vec![report_document::ScreenshotPreview {
                id: "a".repeat(64),
                jpeg: "/9j/".into(),
                width: 1,
                height: 1,
                byte_size: 3,
            }],
            ..preview.clone()
        };
        assert_eq!(super::preview(&with_image), Err(HostError::EvidencePending));
        let malformed = report_document::Preview {
            payload: "{}".into(),
            ..preview
        };
        assert!(super::preview(&malformed).is_err());
    }
    #[test]
    fn capture_is_locally_unavailable_and_draft_message_is_preserved() {
        let request = crate::protocol::Request::ReportCapture {
            fields: ReportFields {
                module: "hub".into(),
                ..Default::default()
            },
        };
        assert_eq!(
            intent(&request, &access(false)).err(),
            Some(HostError::EvidencePending)
        );
        assert_eq!(
            intent(&request, &AccessView::default()).err(),
            Some(HostError::Denied)
        );
        let reply = complete(
            Operation::Load,
            core::Reply::Draft {
                draft: None,
                message: "El borrador se conserva".into(),
            },
        )
        .unwrap();
        assert!(
            matches!(reply,crate::protocol::Reply::DraftLoad{value} if value.message == "El borrador se conserva")
        );
        assert!(
            matches!(complete(Operation::Capture,core::Reply::Draft {draft:None,message:String::new()}).expect("typed capture reply"),crate::protocol::Reply::ReportCapture {value} if !value.exists)
        );
    }
    #[test]
    fn screenshot_metadata_and_encoded_preview_are_bounded() {
        let valid = report_document::ScreenshotPreview {
            id: "a".repeat(64),
            jpeg: "/9j/".into(),
            width: 1920,
            height: 1080,
            byte_size: 400 * 1024,
        };
        assert!(valid_screenshots(std::slice::from_ref(&valid)));
        for invalid in [
            report_document::ScreenshotPreview {
                jpeg: "a".repeat(SCREENSHOT_JPEG_MAX + 1),
                ..valid.clone()
            },
            report_document::ScreenshotPreview {
                width: SCREENSHOT_SIDE_MAX + 1,
                ..valid.clone()
            },
            report_document::ScreenshotPreview {
                height: 0,
                ..valid.clone()
            },
            report_document::ScreenshotPreview {
                byte_size: SCREENSHOT_BYTES_MAX as usize + 1,
                ..valid.clone()
            },
            report_document::ScreenshotPreview {
                id: "A".repeat(64),
                ..valid.clone()
            },
        ] {
            assert!(!valid_screenshots(&[invalid]));
        }
        assert!(!valid_screenshots(&vec![valid; SCREENSHOT_COUNT_MAX + 1]));
    }
    #[test]
    fn receipt_preserves_all_three_cleanup_states() {
        let value = report_document::Receipt {
            report_id: ID.into(),
            report_state: "received".into(),
            created_at: "2026-11-10T12:00:00Z".into(),
            idempotent: false,
        };
        for (state, expected) in [
            (core::DraftState::Cleared, ReportDraftState::Cleared),
            (core::DraftState::Preserved, ReportDraftState::Preserved),
            (
                core::DraftState::CleanupPending,
                ReportDraftState::CleanupPending,
            ),
        ] {
            assert_eq!(receipt(&value, state).draft_state, expected);
        }
        assert!(valid_receipt(&value));
        assert!(!valid_receipt(&report_document::Receipt {
            report_state: "submitted".into(),
            ..value.clone()
        }));
        assert!(valid_receipt(&report_document::Receipt {
            report_id: format!("{RECEIPT_LEGACY_PREFIX}{}", "a".repeat(64)),
            report_state: "submitted".into(),
            ..value
        }));
    }
}
