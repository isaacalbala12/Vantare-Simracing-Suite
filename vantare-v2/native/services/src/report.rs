//! Intento durable manual. Restaurar jamás envía; el consentimiento es efímero.
pub use crate::protocol::report_document::{Draft, Fields, Preview, Receipt};
use crate::{Error, Result, account::Identity, bridge::DataRequest, storage::Store};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};

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
        > 16 * 1024
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
    if let Some(draft) = load_draft(store)?
        && draft.fields == fields
    {
        return Ok(draft);
    }
    let draft = Draft {
        schema_version: 1,
        idempotency_key: format!("draft_{}", crate::random_id()?),
        fields,
    };
    draft_valid(&draft, false)?;
    store.save("report-draft", &draft)?;
    Ok(draft)
}

pub struct Environment {
    pub channel: String,
    pub app_version: String,
    pub os_version: String,
}

#[cfg(windows)]
#[allow(unsafe_code)]
mod windows;

impl Environment {
    pub fn local(channel: &str) -> Result<Self> {
        #[cfg(windows)]
        return Ok(Self {
            channel: channel.into(),
            app_version: option_env!("VANTARE_VERSION")
                .unwrap_or(env!("CARGO_PKG_VERSION"))
                .into(),
            os_version: windows::os_version()?,
        });
        #[cfg(not(windows))]
        Err(Error::Unsupported)
    }
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
            context_text: draft.fields.context_text.trim().into(),
            app_version: env.app_version,
            os_family: "windows".into(),
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
            || self.os_family != "windows"
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
            },
            Environment {
                channel: self.channel.clone(),
                app_version: self.app_version.clone(),
                os_version: self.os_version.clone(),
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
        let attempt = match store.load::<Attempt>("report-attempt") {
            Ok(attempt) if attempt.version == 1 && crate::license::uuid(&attempt.account_id) => {
                attempt.payload.validate().map_err(|_| Error::Storage)?;
                if let Phase::Confirmed(receipt) = &attempt.phase {
                    valid_receipt(receipt).map_err(|_| Error::Storage)?;
                }
                Some(attempt)
            }
            Err(Error::NotFound) => None,
            _ => return Err(Error::Storage),
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
        request.check()?;
        let payload = Submission::new(draft, environment)?;
        if let Some(attempt) = &self.attempt {
            if !matches!(attempt.phase, Phase::Confirmed(_))
                && (attempt.payload.digest()? != payload.digest()?
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
        self.preview(
            request,
            Attempt {
                version: 1,
                identity: request.binding().0.clone(),
                account_id: request.account_id().into(),
                payload,
                phase: Phase::InFlight,
            },
            false,
        )
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
            digest: attempt.payload.digest()?,
            payload: serde_json::to_string_pretty(&attempt.payload).map_err(|_| Error::Protocol)?,
            account_id: attempt.account_id.clone(),
            channel: attempt.payload.channel.clone(),
            retry,
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
    ) -> Result<(Receipt, bool)> {
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
            let previous = &consent.attempt.payload;
            let current = Submission::new(
                draft,
                Environment {
                    channel: previous.channel.clone(),
                    app_version: previous.app_version.clone(),
                    os_version: previous.os_version.clone(),
                },
            )?;
            if current.digest()? != consent.preview.digest {
                return Err(Error::Canceled);
            }
        }
        let mut attempt = consent.attempt;
        attempt.phase = Phase::InFlight;
        store.save("report-attempt", &attempt)?; // BEFORE HTTP; a crash becomes uncertain.
        self.attempt = Some(attempt.clone());
        let response = request.post("rest/v1/rpc/testing_center_submit_report", &attempt.payload);
        let receipt = match response {
            Ok(response) if (200..=299).contains(&response.status) => {
                response.json::<Vec<Receipt>>().and_then(|mut rows| {
                    if rows.len() != 1 {
                        return Err(Error::Protocol);
                    }
                    let receipt = rows.pop().ok_or(Error::Protocol)?;
                    valid_receipt(&receipt)?;
                    Ok(receipt)
                })
            }
            Ok(response) => {
                let status = response.status;
                let error = response.success().err().unwrap_or(Error::Protocol);
                attempt.phase = if status >= 500 || status == 429 {
                    Phase::Uncertain
                } else {
                    Phase::Rejected
                };
                store.save("report-attempt", &attempt)?;
                self.attempt = Some(attempt);
                return Err(if error == Error::Offline {
                    Error::Uncertain
                } else {
                    error
                });
            }
            Err(_) => Err(Error::Uncertain),
        };
        let Ok(receipt) = receipt else {
            attempt.phase = Phase::Uncertain;
            store.save("report-attempt", &attempt)?;
            self.attempt = Some(attempt);
            return Err(Error::Uncertain);
        };
        attempt.phase = Phase::Confirmed(receipt.clone());
        store.save("report-attempt", &attempt)?;
        self.attempt = Some(attempt);
        // Receipt is already durable. Failed draft cleanup is not a failed send.
        let cleanup_pending = store.remove("report-draft").is_err();
        Ok((receipt, cleanup_pending))
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
