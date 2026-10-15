use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::time::Duration;
use url::Url;
use vantare_services::{Error, Result, account::Account};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Module {
    #[serde(rename = "vantare.module.strategy")]
    Strategy,
    #[serde(rename = "vantare.module.engineer")]
    Engineer,
    #[serde(rename = "vantare.module.analysis")]
    Analysis,
    #[serde(rename = "vantare.module.calendar")]
    Calendar,
}
impl Module {
    pub const ALL: [Self; 4] = [
        Self::Strategy,
        Self::Engineer,
        Self::Analysis,
        Self::Calendar,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Strategy => "Estrategia",
            Self::Engineer => "Ingeniero",
            Self::Analysis => "Análisis",
            Self::Calendar => "Calendario",
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Self::Strategy => "strategy",
            Self::Engineer => "engineer",
            Self::Analysis => "analysis",
            Self::Calendar => "calendar",
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Draft,
    Submitted,
    Validated,
    DuplicateLinked,
    Incomplete,
    Closed,
    InReview,
    Rejected,
    Spam,
    Fixed,
}
impl Status {
    pub fn key(self) -> &'static str {
        match self {
            Status::Submitted => "submitted",
            Status::InReview => "in_review",
            Status::Validated => "validated",
            Status::Rejected => "rejected",
            Status::Spam => "spam",
            Status::Fixed => "fixed",
            Status::Draft => "draft",
            Status::DuplicateLinked => "duplicate_linked",
            Status::Incomplete => "incomplete",
            Status::Closed => "closed",
        }
    }

    pub const ALL: [Self; 6] = [
        Self::Submitted,
        Self::InReview,
        Self::Validated,
        Self::Rejected,
        Self::Spam,
        Self::Fixed,
    ];
    pub fn can_transition_to(self, next: Self) -> bool {
        if next == Self::Fixed {
            matches!(self, Self::Validated | Self::Fixed)
        } else {
            matches!(self, Self::Draft | Self::Submitted | Self::InReview)
        }
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::Draft => "Borrador",
            Self::Submitted => "Recibido",
            Self::Validated => "Aceptado",
            Self::DuplicateLinked => "Duplicado",
            Self::Incomplete => "Incompleto",
            Self::Closed => "Cerrado",
            Self::InReview => "En revisión",
            Self::Rejected => "No aceptado",
            Self::Spam => "Spam",
            Self::Fixed => "Arreglado",
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct User {
    pub account_id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    pub created_at: String,
    pub last_seen_at: Option<String>,
    pub roles: Vec<String>,
    pub modules: Vec<Module>,
    pub reports_count: u32,
    #[serde(default)]
    pub owner: bool,
    #[serde(default)]
    pub blocked: bool,
    #[serde(default)]
    pub blocked_reason: Option<String>,
    #[serde(default)]
    pub plan: Plan,
    #[serde(default)]
    pub billing: Option<String>,
    #[serde(default)]
    pub renews_at: Option<String>,
    #[serde(default)]
    pub creator_code: Option<CreatorCode>,
    #[serde(default)]
    pub payments: Vec<Payment>,
    #[serde(default)]
    pub module_access: Vec<ModuleAccess>,
    #[serde(default)]
    pub polar_customer_url: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Rollout {
    pub module: Module,
    pub enabled_for_all: bool,
    #[serde(default)]
    pub individual_count: u32,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    #[default]
    Free,
    Pro,
    ProPlus,
}
impl Plan {
    pub fn label(self) -> &'static str {
        match self {
            Self::Free => "Gratis",
            Self::Pro => "Pro",
            Self::ProPlus => "Pro Plus",
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct CreatorCode {
    pub code: String,
    pub creator_id: String,
    pub creator_name: String,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct ModuleAccess {
    pub module: Module,
    pub individual: bool,
    pub rollout: bool,
    pub plan: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Payment {
    #[serde(default)]
    pub refunded_at: Option<String>,
    #[serde(default)]
    pub refund_reason: Option<String>,
    #[serde(default)]
    pub amount_basis: Option<String>,
    #[serde(default)]
    pub date_source: Option<String>,
    pub payment_id: String,
    pub paid_at: String,
    pub product: String,
    pub period_index: u32,
    pub amount_cents: i64,
    pub currency: String,
    pub status: String,
    pub refunded_cents: i64,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Creator {
    #[serde(default)]
    pub history_complete: bool,
    pub creator_id: String,
    pub name: String,
    pub email: String,
    pub code: String,
    pub status: String,
    #[serde(default)]
    pub clients_count: u32,
    #[serde(default)]
    pub sales_cents: i64,
    #[serde(default)]
    pub earned_cents: i64,
    #[serde(default)]
    pub paid_out_cents: i64,
    #[serde(default)]
    pub owed_cents: i64,
    #[serde(default)]
    pub payable_cents: i64,
    #[serde(default)]
    pub last_payout_at: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct CreatorLine {
    #[serde(flatten)]
    pub payment: Payment,
    pub account_id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    pub rate_bp: u32,
    pub commission_cents: i64,
    pub refunded: bool,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct Report {
    pub report_id: String,
    pub author: String,
    pub module: String,
    pub app_version: String,
    pub text: String,
    pub created_at: String,
    pub status: Status,
    pub has_screenshots: bool,
    pub screenshots: Vec<String>,
    pub title: String,
    pub fixed_in_version: Option<String>,
    pub reject_reason: Option<String>,
}

// The list flattens payload fields; detail returns payload and signed image objects.
impl<'de> Deserialize<'de> for Report {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Payload {
            module: Option<String>,
            app_version: Option<String>,
            action_text: Option<String>,
            expected_text: Option<String>,
            observed_text: Option<String>,
            context_text: Option<String>,
        }
        #[derive(Deserialize)]
        struct Screenshot {
            url: String,
        }
        #[derive(Deserialize)]
        struct Wire {
            report_id: String,
            title: Option<String>,
            fixed_in_version: Option<String>,
            reject_reason: Option<String>,
            email: Option<String>,
            name: Option<String>,
            created_at: String,
            status: Status,
            has_screenshots: Option<bool>,
            #[serde(default)]
            screenshots: Vec<Screenshot>,
            payload: Option<Payload>,
            #[serde(flatten)]
            summary: Payload,
        }
        let wire = Wire::deserialize(deserializer)?;
        let payload = wire.payload.unwrap_or(wire.summary);
        let text = [
            ("Acción", payload.action_text),
            ("Esperado", payload.expected_text),
            ("Observado", payload.observed_text),
            ("Contexto", payload.context_text),
        ]
        .into_iter()
        .filter_map(|(label, text)| {
            text.filter(|s| !s.is_empty())
                .map(|s| format!("{label}: {s}"))
        })
        .collect::<Vec<_>>()
        .join("\n\n");
        Ok(Self {
            title: wire
                .title
                .unwrap_or_else(|| text.lines().next().unwrap_or("Informe").to_owned()),
            fixed_in_version: wire.fixed_in_version,
            reject_reason: wire.reject_reason,
            report_id: wire.report_id,
            author: wire
                .name
                .or(wire.email)
                .unwrap_or_else(|| "sin nombre disponible".into()),
            module: payload.module.unwrap_or_else(|| "sin módulo".into()),
            app_version: payload.app_version.unwrap_or_else(|| "sin versión".into()),
            text,
            created_at: wire.created_at,
            status: wire.status,
            has_screenshots: wire.has_screenshots.unwrap_or(!wire.screenshots.is_empty()),
            screenshots: wire
                .screenshots
                .into_iter()
                .map(|image| image.url)
                .collect(),
        })
    }
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum Action {
    MailForgetWaitlist {
        email: String,
        confirm: bool,
    },
    MailCleanup,
    MailList,
    MailNew,
    MailGet {
        campaign_id: String,
    },
    MailSave {
        campaign_id: String,
        revision: u32,
        name: String,
        template: String,
        target_group: String,
        content: crate::mail::Content,
    },
    MailApprove {
        campaign_id: String,
        revision: u32,
        confirm: bool,
    },
    MailSendBatch {
        campaign_id: String,
        revision: u32,
    },
    MailDraft {
        campaign_id: String,
        revision: u32,
        brief: String,
        template: String,
    },
    MailSync {
        #[serde(skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
    },
    SearchAccounts {
        query: String,
        limit: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
    },
    GetAccount {
        account_id: String,
    },
    SetTester {
        account_id: String,
        enabled: bool,
    },
    SetModule {
        account_id: String,
        module: Module,
        enabled: bool,
    },
    SetBlocked {
        account_id: String,
        blocked: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
    DeleteAccount {
        account_id: String,
        confirm_email: String,
    },
    ListCreators,
    GetCreator {
        creator_id: String,
    },
    CreateCreator {
        name: String,
        email: String,
        code: String,
    },
    RecordCreatorPayout {
        creator_id: String,
        amount_cents: i64,
    },
    GetRollout,
    SetRollout {
        module: Module,
        enabled_for_all: bool,
    },
    ListReports {
        #[serde(skip_serializing_if = "Option::is_none")]
        status: Option<Status>,
        limit: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
    },
    GetReport {
        report_id: String,
    },
    SetReportStatus {
        report_id: String,
        status: Status,
        #[serde(skip_serializing_if = "Option::is_none")]
        fixed_in_version: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reason: Option<String>,
    },
}
impl Action {
    pub fn label(&self) -> &'static str {
        match self {
            Self::MailForgetWaitlist { .. } => "mail_forget_waitlist",
            Self::MailCleanup => "mail_cleanup",
            Self::MailList => "mail_list",
            Self::MailNew => "mail_new",
            Self::MailGet { .. } => "mail_get",
            Self::MailSave { .. } => "mail_save",
            Self::MailApprove { .. } => "mail_approve",
            Self::MailSendBatch { .. } => "mail_send_batch",
            Self::MailDraft { .. } => "mail_draft",
            Self::MailSync { .. } => "mail_sync",
            Self::SearchAccounts { .. } => "search_accounts",
            Self::GetAccount { .. } => "get_account",
            Self::SetTester { .. } => "set_tester",
            Self::SetModule { .. } => "set_module",
            Self::SetBlocked { .. } => "set_blocked",
            Self::DeleteAccount { .. } => "delete_account",
            Self::ListCreators => "list_creators",
            Self::GetCreator { .. } => "get_creator",
            Self::CreateCreator { .. } => "create_creator",
            Self::RecordCreatorPayout { .. } => "record_creator_payout",
            Self::GetRollout => "get_rollout",
            Self::SetRollout { .. } => "set_rollout",
            Self::ListReports { .. } => "list_reports",
            Self::GetReport { .. } => "get_report",
            Self::SetReportStatus { .. } => "set_report_status",
        }
    }
    pub fn mutation(&self) -> bool {
        matches!(
            self,
            Self::MailForgetWaitlist { .. }
                | Self::MailCleanup
                | Self::MailNew
                | Self::MailSave { .. }
                | Self::MailApprove { .. }
                | Self::MailSendBatch { .. }
                | Self::MailDraft { .. }
                | Self::MailSync { .. }
                | Self::SetBlocked { .. }
                | Self::DeleteAccount { .. }
                | Self::CreateCreator { .. }
                | Self::RecordCreatorPayout { .. }
                | Self::SetTester { .. }
                | Self::SetModule { .. }
                | Self::SetRollout { .. }
                | Self::SetReportStatus { .. }
        )
    }
    pub fn validate(&self) -> Result<()> {
        if let Some(valid) = self.mail_valid() {
            return if valid { Ok(()) } else { Err(Error::Protocol) };
        }
        let bounded = |s: &str| !s.trim().is_empty() && s.len() <= 256;
        let valid = match self {
            Self::SearchAccounts {
                query,
                limit,
                cursor,
            } => {
                query == query.trim()
                    && query.len() <= 200
                    && (1..=50).contains(limit)
                    && cursor
                        .as_ref()
                        .is_none_or(|s| query.is_empty() && vantare_services::license::uuid(s))
            }
            Self::ListReports { limit, cursor, .. } => {
                (1..=100).contains(limit) && cursor.as_ref().is_none_or(|s| bounded(s))
            }
            Self::SetBlocked { account_id, .. }
            | Self::DeleteAccount { account_id, .. }
            | Self::GetAccount { account_id }
            | Self::SetTester { account_id, .. }
            | Self::SetModule { account_id, .. } => vantare_services::license::uuid(account_id),
            Self::GetReport { report_id } | Self::SetReportStatus { report_id, .. } => {
                bounded(report_id)
            }
            Self::GetCreator { creator_id } | Self::RecordCreatorPayout { creator_id, .. } => {
                vantare_services::license::uuid(creator_id)
            }
            Self::CreateCreator { name, email, code } => {
                !name.trim().is_empty()
                    && name.len() <= 120
                    && email.contains('@')
                    && email.len() <= 320
                    && (3..=32).contains(&code.len())
                    && code
                        .bytes()
                        .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
            }
            Self::ListCreators | Self::GetRollout | Self::SetRollout { .. } => true,
            _ => return Err(Error::Protocol),
        };
        let valid = valid
            && match self {
                Self::SetBlocked { reason, .. } => reason
                    .as_ref()
                    .is_none_or(|r| !r.trim().is_empty() && r.len() <= 200),
                Self::DeleteAccount { confirm_email, .. } => {
                    !confirm_email.trim().is_empty() && confirm_email.len() <= 320
                }
                Self::RecordCreatorPayout { amount_cents, .. } => *amount_cents > 0,
                Self::SetReportStatus {
                    status,
                    fixed_in_version,
                    reason,
                    ..
                } => {
                    reason
                        .as_ref()
                        .is_none_or(|r| !r.trim().is_empty() && r.len() <= 500)
                        && (!matches!(
                            status,
                            Status::Validated
                                | Status::Rejected
                                | Status::Spam
                                | Status::Closed
                                | Status::DuplicateLinked
                                | Status::Incomplete
                        ) || reason.is_some())
                        && (*status != Status::Fixed
                            || fixed_in_version.as_ref().is_some_and(|v| valid_version(v)))
                }
                _ => true,
            };
        if valid { Ok(()) } else { Err(Error::Protocol) }
    }
}
#[derive(Deserialize)]
struct Envelope {
    version: u8,
    ok: bool,
}

pub struct Client {
    endpoint: Url,
    evidence_origin: Url,
    agent: ureq::Agent,
}
impl Client {
    pub fn from_build() -> Result<Self> {
        let evidence = vantare_services::config::BuildConfig::load()
            .supabase
            .ok_or(Error::Unconfigured)?;
        let endpoint = match option_env!("VANTARE_ADMIN_URL") {
            Some(value) => vantare_services::config::remote_url(value)?,
            None => evidence
                .join("/functions/v1/native-admin")
                .map_err(|_| Error::Unconfigured)?,
        };
        Self::new(endpoint, evidence)
    }
    fn new(endpoint: Url, evidence_origin: Url) -> Result<Self> {
        validate_url(&endpoint)?;
        validate_url(&evidence_origin)?;
        if endpoint.query().is_some()
            || !matches!(
                endpoint.path(),
                "/functions/v1/native-admin" | "/v1/native-admin"
            )
        {
            return Err(Error::Unconfigured);
        }
        Ok(Self {
            endpoint,
            evidence_origin,
            agent: ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(8)))
                .max_redirects(0)
                .http_status_as_error(false)
                .build()
                .into(),
        })
    }
    pub fn call(&self, account: &Account, now: u64, action: &Action) -> Result<serde_json::Value> {
        account.authorized(now, |bearer| self.request(bearer, action))
    }
    fn request(&self, bearer: &str, action: &Action) -> Result<serde_json::Value> {
        action.validate()?;
        if bearer.is_empty()
            || bearer.len() > 16 * 1024
            || bearer
                .bytes()
                .any(|byte| byte.is_ascii_control() || byte.is_ascii_whitespace())
        {
            return Err(Error::Authentication);
        }
        let mut payload = serde_json::to_value(action).map_err(|_| Error::Protocol)?;
        payload["version"] = 1.into();
        let bytes = serde_json::to_vec(&payload).map_err(|_| Error::Protocol)?;
        let agent = if action.label().starts_with("mail_") {
            ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(65)))
                .max_redirects(0)
                .http_status_as_error(false)
                .build()
                .into()
        } else {
            self.agent.clone()
        };
        let mut response = agent
            .post(self.endpoint.as_str())
            .header("Authorization", format!("Bearer {bearer}"))
            .header("Content-Type", "application/json")
            .send(&bytes)
            .map_err(|_| Error::Offline)?;
        let status = response.status().as_u16();
        if matches!(status, 401 | 403) {
            check_status(status)?;
        }
        let bytes = response
            .body_mut()
            .with_config()
            .limit(512 * 1024)
            .read_to_vec()
            .map_err(|error| body_error(&error))?;
        if status != 200 {
            let code = serde_json::from_slice::<serde_json::Value>(&bytes)
                .ok()
                .and_then(|v| v.get("error").and_then(|v| v.as_str()).map(str::to_owned));
            return Err(match code.as_deref() {
                Some("mail_disabled" | "mail_unconfigured" | "mail_cleanup_disabled") => {
                    Error::Unconfigured
                }
                Some("confirmation_mismatch") => Error::ConfirmationMismatch,
                Some("account_conflict") => Error::AccountConflict,
                Some("rate_limited") => Error::RateLimited,
                Some("deletion_barrier_unavailable") => Error::DeletionUnavailable,
                Some("account_change_incomplete") => Error::AccountChangeIncomplete,
                _ => {
                    check_status(status)?;
                    Error::Protocol
                }
            });
        }
        let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)?;
        if envelope.version != 1 {
            return Err(Error::Version);
        }
        if !envelope.ok {
            return Err(Error::Protocol);
        } // No mostrar mensajes remotos ni URLs firmadas.
        serde_json::from_slice(&bytes).map_err(|_| Error::Protocol)
    }
    pub fn screenshot(&self, signed: &str) -> Result<Vec<u8>> {
        let url = Url::parse(signed).map_err(|_| Error::Protocol)?;
        validate_url(&url)?;
        if url.origin() != self.evidence_origin.origin()
            || !url
                .path()
                .starts_with("/storage/v1/object/sign/testing-center-evidence/")
            || url.query().is_none()
        {
            return Err(Error::Denied);
        }
        // Nunca bearer OAuth ni apikey a las URLs de capturas; sin redirects.
        let mut response = self
            .agent
            .get(url.as_str())
            .call()
            .map_err(|_| Error::Offline)?;
        check_status(response.status().as_u16())?;
        let bytes = response
            .body_mut()
            .with_config()
            .limit(10 * 1024 * 1024)
            .read_to_vec()
            .map_err(|error| body_error(&error))?;
        if !(bytes.starts_with(b"\x89PNG\r\n\x1a\n") || bytes.starts_with(&[0xff, 0xd8, 0xff])) {
            return Err(Error::Protocol);
        }
        let mut reader = image::ImageReader::new(std::io::Cursor::new(&bytes))
            .with_guessed_format()
            .map_err(|_| Error::Protocol)?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(4096);
        limits.max_image_height = Some(4096);
        limits.max_alloc = Some(64 * 1024 * 1024);
        reader.limits(limits);
        reader.decode().map_err(|_| Error::Protocol)?;
        Ok(bytes)
    }
}
pub fn field<T: DeserializeOwned>(response: &serde_json::Value, name: &str) -> Result<T> {
    serde_json::from_value(response.get(name).ok_or(Error::Protocol)?.clone())
        .map_err(|_| Error::Protocol)
}
fn validate_url(url: &Url) -> Result<()> {
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err(Error::Unconfigured);
    }
    if url.scheme() == "https" && url.host_str().is_some() {
        return Ok(());
    }
    #[cfg(test)]
    if url.scheme() == "http" && url.host_str() == Some("127.0.0.1") {
        return Ok(());
    }
    Err(Error::Unconfigured)
}
fn check_status(status: u16) -> Result<()> {
    match status {
        200 => Ok(()),
        401 => Err(Error::Authentication),
        403 => Err(Error::Denied),
        404 => Err(Error::NotFound),
        409 => Err(Error::AccountConflict),
        422 => Err(Error::ConfirmationMismatch),
        429 => Err(Error::RateLimited),
        500..=599 => Err(Error::Offline),
        _ => Err(Error::Protocol),
    }
}
fn body_error(error: &ureq::Error) -> Error {
    match error {
        ureq::Error::BodyExceedsLimit(_) => Error::TooLarge,
        _ => Error::Offline,
    }
}

#[cfg(test)]
pub(crate) mod tests;

pub fn valid_version(v: &str) -> bool {
    let mut parts = v.splitn(2, '-');
    let core = parts.next().unwrap_or("");
    let n = core.split('.').collect::<Vec<_>>();
    (3..=4).contains(&n.len())
        && n.iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
        && parts.next().is_none_or(|p| {
            !p.is_empty()
                && p.bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
        })
        && v.len() <= 60
}
