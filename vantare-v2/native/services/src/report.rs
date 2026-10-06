//! Intento durable manual. Restaurar jamás envía; el consentimiento es efímero.
use crate::protocol::DraftState;
pub use crate::protocol::report_document::{Draft, Fields, Preview, Receipt};
use crate::{Error, Result, account::Identity, bridge::DataRequest, storage::Store};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
pub mod screenshots;

const MODULES: [&str; 15] = [
    "hub",
    "launcher",
    "settings",
    "overlay_studio",
    "overlay_runtime",
    "telemetry",
    "telemetry_analysis",
    "engineer",
    "strategy",
    "calendar",
    "billing",
    "account",
    "updater",
    "testing_center",
    "unknown",
];
fn hex_id(value: &str, prefix: &str) -> bool {
    value.strip_prefix(prefix).is_some_and(|value| {
        value.len() == 64
            && value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}
fn fields_valid(fields: &Fields, required: bool) -> Result<()> {
    for (value, limit) in [
        (&fields.action_text, 2048),
        (&fields.expected_text, 2048),
        (&fields.observed_text, 2048),
        (&fields.context_text, 4096),
    ] {
        if value.len() > limit || value.contains('\0') {
            return Err(Error::TooLarge);
        }
    }
    if !MODULES.contains(&fields.module.as_str())
        || (required
            && [
                &fields.action_text,
                &fields.expected_text,
                &fields.observed_text,
            ]
            .iter()
            .any(|text| text.trim().is_empty()))
    {
        return Err(Error::Protocol);
    }
    Ok(())
}
fn draft_valid(draft: &Draft, required: bool) -> Result<()> {
    if draft.schema_version != 1 || !hex_id(&draft.idempotency_key, "draft_") {
        return Err(Error::Protocol);
    }
    if serde_json::to_vec(draft)
        .map_err(|_| Error::Protocol)?
        .len()
        > 60 * 1024
    {
        return Err(Error::TooLarge);
    }
    if draft.screenshots.len() > 3
        || draft.screenshots.iter().any(|image| {
            image.jpeg.len() > 14 * 1024
                || image.byte_size > screenshots::MAX_BYTES
                || image.width == 0
                || image.width > 1920
                || image.height == 0
                || image.height > 1920
        })
    {
        return Err(Error::TooLarge);
    }
    fields_valid(&draft.fields, required)
}

pub fn load_draft(store: &Store) -> Result<Option<Draft>> {
    match store.load::<Draft>("report-draft") {
        Ok(draft) => {
            draft_valid(&draft, false).map_err(|_| Error::Storage)?;
            Ok(Some(draft))
        }
        Err(Error::NotFound) => Ok(None),
        Err(error) => Err(error),
    }
}
pub fn save_draft(store: &Store, fields: Fields) -> Result<Draft> {
    fields_valid(&fields, false)?;
    let previous = load_draft(store)?;
    if let Some(draft) = &previous
        && draft.fields == fields
    {
        return Ok(draft.clone());
    }
    let draft = Draft {
        schema_version: 1,
        idempotency_key: format!("draft_{}", crate::random_id()?),
        fields,
        screenshots: previous.map_or_else(Vec::new, |draft| draft.screenshots),
    };
    draft_valid(&draft, false)?;
    store.save("report-draft", &draft)?;
    Ok(draft)
}

pub struct Environment {
    pub channel: String,
    pub app_version: String,
    pub os_version: String,
    pub installation: Option<String>,
}

/// La distribución beta usa la membership de testers del contrato RPC v1.
pub(crate) fn rpc_channel(channel: &str) -> &str {
    if channel == "beta" {
        "testers"
    } else {
        channel
    }
}

/// Metadatos visibles en la preview y estables en el intento durable/reintento.
fn installation_context(root: &std::path::Path, channel: &str) -> Result<String> {
    let id = crate::diagnostics::anonymous_id(root)?;
    Ok(format!(
        "Instalación anónima: {id}\nCanal de distribución: {channel}"
    ))
}

#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;

#[cfg(target_os = "linux")]
const OS_FAMILY: &str = "linux";
#[cfg(target_os = "macos")]
const OS_FAMILY: &str = "macos";
#[cfg(windows)]
const OS_FAMILY: &str = "windows";

impl Environment {
    pub fn local(channel: &str) -> Result<Self> {
        #[cfg(windows)]
        {
            Ok(Self {
                channel: rpc_channel(channel).into(),
                app_version: crate::product::VERSION.into(),
                os_version: windows::os_version()?,
                installation: Some(installation_context(
                    &crate::diagnostics::data_root()?,
                    crate::product::CHANNEL,
                )?),
            })
        }
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            Ok(Self {
                channel: rpc_channel(channel).into(),
                app_version: crate::product::VERSION.into(),
                os_version: unix_os_version()?,
                installation: Some(installation_context(
                    &crate::diagnostics::data_root()?,
                    crate::product::CHANNEL,
                )?),
            })
        }
        #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
        {
            Err(Error::Unsupported)
        }
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn unix_os_version() -> Result<String> {
    use std::process::Command;

    #[cfg(target_os = "linux")]
    let output = Command::new("uname").arg("-r").output();
    #[cfg(target_os = "macos")]
    let output = Command::new("sw_vers").arg("-productVersion").output();
    let output = output.map_err(|_| Error::Unsupported)?;
    if !output.status.success() {
        return Err(Error::Unsupported);
    }
    let version = String::from_utf8(output.stdout).map_err(|_| Error::Unsupported)?;
    let version = version.trim();
    if version.is_empty() || version.len() > 56 {
        return Err(Error::Unsupported);
    }
    #[cfg(target_os = "linux")]
    let name = "Linux";
    #[cfg(target_os = "macos")]
    let name = "macOS";
    Ok(format!("{name} {version}"))
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Submission {
    #[serde(rename = "p_contract_version")]
    contract_version: String,
    #[serde(rename = "p_channel")]
    channel: String,
    #[serde(rename = "p_action_text")]
    action_text: String,
    #[serde(rename = "p_expected_text")]
    expected_text: String,
    #[serde(rename = "p_observed_text")]
    observed_text: String,
    #[serde(rename = "p_context_text")]
    context_text: String,
    #[serde(rename = "p_app_version")]
    app_version: String,
    #[serde(rename = "p_os_family")]
    os_family: String,
    #[serde(rename = "p_os_version")]
    os_version: String,
    #[serde(rename = "p_module")]
    module: String,
    #[serde(rename = "p_include_diagnostic")]
    include_diagnostic: bool,
    #[serde(rename = "p_include_logs")]
    include_logs: bool,
    #[serde(rename = "p_diagnostic_payload")]
    diagnostic_payload: Option<String>,
    #[serde(rename = "p_diagnostic_digest")]
    diagnostic_digest: Option<String>,
    #[serde(rename = "p_idempotency_key")]
    idempotency_key: String,
}
impl Submission {
    fn new(draft: Draft, env: Environment) -> Result<Self> {
        draft_valid(&draft, true)?;
        let mut context = draft.fields.context_text.trim().to_owned();
        if let Some(installation) = &env.installation {
            if !context.is_empty() {
                context.push_str("\n\n");
            }
            context.push_str(installation);
        }
        if context.len() > 4096 || context.contains('\0') {
            return Err(Error::TooLarge);
        }
        if !matches!(env.channel.as_str(), "nightly" | "testers")
            || env.app_version.is_empty()
            || env.app_version.len() > 32
            || env.os_version.is_empty()
            || env.os_version.len() > 64
        {
            return Err(Error::Denied);
        }
        Ok(Self {
            contract_version: "testing-center.v1".into(),
            channel: env.channel,
            action_text: draft.fields.action_text.trim().into(),
            expected_text: draft.fields.expected_text.trim().into(),
            observed_text: draft.fields.observed_text.trim().into(),
            context_text: context,
            app_version: env.app_version,
            os_family: OS_FAMILY.into(),
            os_version: env.os_version,
            module: draft.fields.module,
            include_diagnostic: false,
            include_logs: false,
            diagnostic_payload: None,
            diagnostic_digest: None,
            idempotency_key: draft.idempotency_key,
        })
    }
    fn validate(&self) -> Result<()> {
        if self.contract_version != "testing-center.v1"
            || self.os_family != OS_FAMILY
            || self.include_diagnostic
            || self.include_logs
            || self.diagnostic_payload.is_some()
            || self.diagnostic_digest.is_some()
        {
            return Err(Error::Protocol);
        }
        Self::new(
            Draft {
                schema_version: 1,
                idempotency_key: self.idempotency_key.clone(),
                fields: Fields {
                    action_text: self.action_text.clone(),
                    expected_text: self.expected_text.clone(),
                    observed_text: self.observed_text.clone(),
                    context_text: self.context_text.clone(),
                    module: self.module.clone(),
                },
                screenshots: Vec::new(),
            },
            Environment {
                channel: self.channel.clone(),
                app_version: self.app_version.clone(),
                os_version: self.os_version.clone(),
                installation: None,
            },
        )?;
        Ok(())
    }
    fn digest(&self) -> Result<String> {
        Ok(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(self).map_err(|_| Error::Protocol)?)
        ))
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "state", content = "receipt", deny_unknown_fields)]
enum Phase {
    InFlight,
    Uncertain,
    Rejected,
    Confirmed(Receipt),
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Attempt {
    version: u8,
    identity: Identity,
    account_id: String,
    payload: Submission,
    phase: Phase,
    #[serde(default)]
    images: Vec<screenshots::Screenshot>,
    #[serde(default)]
    installation: Option<String>,
}
impl Attempt {
    fn digest(&self) -> Result<String> {
        if self.images.is_empty() {
            return self.payload.digest();
        }
        let images = self
            .images
            .iter()
            .map(screenshots::Screenshot::digest)
            .collect::<Result<Vec<_>>>()?;
        Ok(format!(
            "{:x}",
            Sha256::digest(
                serde_json::to_vec(&(&self.payload, images)).map_err(|_| Error::Protocol)?
            )
        ))
    }
}
struct Consent {
    preview: Preview,
    generation: u128,
    deadline: Instant,
    attempt: Attempt,
}
pub struct Reports {
    attempt: Option<Attempt>,
    consent: Option<Consent>,
}

impl Reports {
    pub fn restore(store: &Store) -> Result<Self> {
        let attempt = match store.load_for_restore::<Attempt>("report-attempt") {
            Ok(Some(attempt))
                if attempt.version == 1
                    && crate::license::uuid(&attempt.account_id)
                    && attempt.payload.validate().is_ok()
                    && screenshots::validate(&attempt.images).is_ok()
                    && match &attempt.phase {
                        Phase::Confirmed(receipt) => valid_receipt(receipt).is_ok(),
                        _ => true,
                    } =>
            {
                Some(attempt)
            }
            Ok(None) | Err(Error::NotFound) => None,
            Ok(_) => {
                store.quarantine("report-attempt");
                None
            }
            Err(error) => return Err(error),
        };
        Ok(Self {
            attempt,
            consent: None,
        })
    }

    pub fn cancel_preview(&mut self) {
        self.consent = None;
    }

    pub fn prepare(
        &mut self,
        request: &DataRequest<'_>,
        draft: Draft,
        environment: Environment,
    ) -> Result<Preview> {
        self.prepare_with_images(request, draft, environment, Vec::new())
    }

    pub fn prepare_with_images(
        &mut self,
        request: &DataRequest<'_>,
        draft: Draft,
        environment: Environment,
        images: Vec<screenshots::Screenshot>,
    ) -> Result<Preview> {
        request.check()?;
        screenshots::validate(&images)?;
        if draft
            .screenshots
            .iter()
            .map(|p| &p.id)
            .ne(images.iter().map(|i| &i.preview.id))
        {
            return Err(Error::Protocol);
        }
        let installation = environment.installation.clone();
        let payload = Submission::new(draft, environment)?;
        let candidate = Attempt {
            version: 1,
            identity: request.binding().0.clone(),
            account_id: request.account_id().into(),
            payload,
            phase: Phase::InFlight,
            images,
            installation,
        };
        let payload = &candidate.payload;
        if let Some(attempt) = &self.attempt {
            // Un rechazo definitivo permite corregir el borrador. Un resultado
            // incierto conserva exactamente lo que pudo llegar al servidor.
            if !matches!(attempt.phase, Phase::Confirmed(_) | Phase::Rejected)
                && (attempt.digest()? != candidate.digest()?
                    || attempt.account_id != request.account_id()
                    || &attempt.identity != request.binding().0)
            {
                return Err(Error::Conflict);
            }
            if matches!(attempt.phase, Phase::Confirmed(_))
                && attempt.payload.idempotency_key == payload.idempotency_key
            {
                return Err(Error::Conflict);
            }
        }
        self.preview(request, candidate, false)
    }

    pub fn prepare_retry(&mut self, request: &DataRequest<'_>, channel: &str) -> Result<Preview> {
        request.check()?;
        let attempt = self.attempt.clone().ok_or(Error::NotFound)?;
        if matches!(attempt.phase, Phase::Confirmed(_)) {
            return Err(Error::Conflict);
        }
        if attempt.account_id != request.account_id()
            || &attempt.identity != request.binding().0
            || attempt.payload.channel != channel
        {
            return Err(Error::Authentication);
        }
        self.preview(request, attempt, true)
    }

    fn preview(
        &mut self,
        request: &DataRequest<'_>,
        attempt: Attempt,
        retry: bool,
    ) -> Result<Preview> {
        let preview = Preview {
            id: crate::random_id()?,
            digest: attempt.digest()?,
            payload: if attempt.images.is_empty() {
                serde_json::to_string_pretty(&attempt.payload).map_err(|_| Error::Protocol)?
            } else {
                serde_json::to_string_pretty(&serde_json::json!({"reporte":attempt.payload,
                    "capturas":attempt.images.iter().map(|image| serde_json::json!({
                        "id":image.preview.id,"width":image.preview.width,"height":image.preview.height,
                        "byteSize":image.preview.byte_size})).collect::<Vec<_>>()}))
                    .map_err(|_| Error::Protocol)?
            },
            account_id: attempt.account_id.clone(),
            channel: attempt.payload.channel.clone(),
            retry,
            screenshots: attempt
                .images
                .iter()
                .map(|image| image.preview.clone())
                .collect(),
        };
        self.consent = Some(Consent {
            preview: preview.clone(),
            generation: request.binding().1,
            deadline: Instant::now() + Duration::from_mins(3),
            attempt,
        });
        Ok(preview)
    }

    /// The caller invokes ONLY after an explicit user consent on this exact preview.
    pub fn send(
        &mut self,
        request: &DataRequest<'_>,
        preview_id: &str,
        store: &Store,
    ) -> Result<(Receipt, DraftState)> {
        request.check()?;
        let consent = self.consent.take().ok_or(Error::Canceled)?;
        if consent.preview.id != preview_id
            || Instant::now() >= consent.deadline
            || consent.generation != request.binding().1
            || &consent.attempt.identity != request.binding().0
            || consent.attempt.account_id != request.account_id()
        {
            return Err(Error::Canceled);
        }
        if !consent.preview.retry {
            let draft = load_draft(store)?.ok_or(Error::Canceled)?;
            if draft.screenshots.iter().map(|p| &p.id).ne(consent
                .attempt
                .images
                .iter()
                .map(|i| &i.preview.id))
            {
                return Err(Error::Canceled);
            }
            let previous = &consent.attempt.payload;
            let current = Submission::new(
                draft,
                Environment {
                    channel: previous.channel.clone(),
                    app_version: previous.app_version.clone(),
                    os_version: previous.os_version.clone(),
                    installation: consent.attempt.installation.clone(),
                },
            )?;
            if current.digest()? != consent.attempt.payload.digest()? {
                return Err(Error::Canceled);
            }
        }
        let mut attempt = consent.attempt;
        attempt.phase = Phase::InFlight;
        store.save("report-attempt", &attempt)?; // BEFORE HTTP; a crash becomes uncertain.
        self.attempt = Some(attempt.clone());
        let receipt = match submit_attempt(request, &attempt) {
            Ok(receipt) => receipt,
            Err(error) => {
                attempt.phase = if matches!(
                    error,
                    Error::Authentication
                        | Error::Denied
                        | Error::TooLarge
                        | Error::Protocol
                        | Error::Conflict
                ) {
                    Phase::Rejected
                } else {
                    Phase::Uncertain
                };
                store.save("report-attempt", &attempt)?;
                self.attempt = Some(attempt);
                return Err(error);
            }
        };
        attempt.phase = Phase::Confirmed(receipt.clone());
        store.save("report-attempt", &attempt)?;
        self.attempt = Some(attempt);
        // El recibo ya es durable. Solo se limpia el borrador del envío confirmado.
        let draft_state = match self.draft_state(store) {
            Ok(DraftState::CleanupPending) if store.remove("report-draft").is_ok() => {
                DraftState::Cleared
            }
            Ok(state) => state,
            Err(_) => DraftState::CleanupPending, // No borrar un borrador sin identificar.
        };
        Ok((receipt, draft_state))
    }

    pub fn draft_state(&self, store: &Store) -> Result<DraftState> {
        Ok(match load_draft(store)? {
            None => DraftState::Cleared,
            Some(draft)
                if self.attempt.as_ref().is_some_and(|attempt| {
                    attempt.payload.idempotency_key != draft.idempotency_key
                }) =>
            {
                DraftState::Preserved
            }
            _ => DraftState::CleanupPending,
        })
    }

    pub fn receipt(&self) -> Option<&Receipt> {
        self.attempt.as_ref().and_then(|attempt| {
            if let Phase::Confirmed(receipt) = &attempt.phase {
                Some(receipt)
            } else {
                None
            }
        })
    }
}
fn submit_attempt(request: &DataRequest<'_>, attempt: &Attempt) -> Result<Receipt> {
    let response = if attempt.images.is_empty() {
        request.post("rest/v1/rpc/testing_center_submit_report", &attempt.payload)
    } else {
        screenshots::upload(
            request,
            &attempt.images,
            &attempt.payload.channel,
            &attempt.payload.idempotency_key,
        )
        .and_then(|batch| {
            let mut body = serde_json::to_value(&attempt.payload).map_err(|_| Error::Protocol)?;
            body["p_batch_id"] = batch.into();
            request.post(
                "rest/v1/rpc/testing_center_submit_report_with_evidence",
                &body,
            )
        })
    }
    .map_err(|error| {
        if error == Error::Offline {
            Error::Uncertain
        } else {
            error
        }
    })?;
    if !attempt.images.is_empty()
        && response.status == 400
        && response
            .json::<serde_json::Value>()
            .ok()
            .is_some_and(|body| {
                body["code"] == "55000" && body["message"] == "testing_center_evidence_not_ready"
            })
    {
        return Err(Error::EvidencePending);
    }
    let response = response.success().map_err(|error| {
        if error == Error::Offline {
            Error::Uncertain
        } else {
            error
        }
    })?;
    let mut rows: Vec<Receipt> = response.json().map_err(|_| Error::Uncertain)?;
    if rows.len() != 1 {
        return Err(Error::Uncertain);
    }
    let receipt = rows.pop().ok_or(Error::Uncertain)?;
    valid_receipt(&receipt).map_err(|_| Error::Uncertain)?;
    Ok(receipt)
}
fn valid_receipt(receipt: &Receipt) -> Result<()> {
    if !hex_id(&receipt.report_id, "report_")
        || receipt.report_state != "submitted"
        || receipt.created_at.len() > 64
        || chrono::DateTime::parse_from_rfc3339(&receipt.created_at).is_err()
    {
        return Err(Error::Protocol);
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod tests;
