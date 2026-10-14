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
            Self::Strategy => "Strategy",
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
}
impl Status {
    pub const ALL: [Self; 6] = [
        Self::Draft,
        Self::Submitted,
        Self::Validated,
        Self::DuplicateLinked,
        Self::Incomplete,
        Self::Closed,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Draft => "Borrador",
            Self::Submitted => "Enviado",
            Self::Validated => "Validado",
            Self::DuplicateLinked => "Duplicado",
            Self::Incomplete => "Incompleto",
            Self::Closed => "Cerrado",
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
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Rollout {
    pub module: Module,
    pub enabled_for_all: bool,
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
            email: Option<String>,
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
            report_id: wire.report_id,
            author: wire.email.unwrap_or_else(|| "sin correo disponible".into()),
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
    },
}
impl Action {
    pub fn label(&self) -> &'static str {
        match self {
            Self::SearchAccounts { .. } => "search_accounts",
            Self::GetAccount { .. } => "get_account",
            Self::SetTester { .. } => "set_tester",
            Self::SetModule { .. } => "set_module",
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
            Self::SetTester { .. }
                | Self::SetModule { .. }
                | Self::SetRollout { .. }
                | Self::SetReportStatus { .. }
        )
    }
    pub fn validate(&self) -> Result<()> {
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
            Self::GetAccount { account_id }
            | Self::SetTester { account_id, .. }
            | Self::SetModule { account_id, .. } => vantare_services::license::uuid(account_id),
            Self::GetReport { report_id } | Self::SetReportStatus { report_id, .. } => {
                bounded(report_id)
            }
            Self::GetRollout | Self::SetRollout { .. } => true,
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
        let mut response = self
            .agent
            .post(self.endpoint.as_str())
            .header("Authorization", format!("Bearer {bearer}"))
            .header("Content-Type", "application/json")
            .send(&bytes)
            .map_err(|_| Error::Offline)?;
        check_status(response.status().as_u16())?;
        let bytes = response
            .body_mut()
            .with_config()
            .limit(512 * 1024)
            .read_to_vec()
            .map_err(|error| body_error(&error))?;
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
        429 | 500..=599 => Err(Error::Offline),
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
