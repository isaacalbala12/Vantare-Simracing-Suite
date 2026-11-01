//! Verificador puro y autoridad local consumible por el núcleo sin feature network.
use crate::{Error, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub mod authority;
pub mod catalog;
pub mod installation;

const ISSUER: &str = "vantare-license";
/// Máximo desfase aceptado al recibir una respuesta nueva del servidor.
pub const CLOCK_SKEW_SECONDS: u64 = 300;
/// Existing maximum in-game grace; renewal must not mistake it for signed TTL.
pub const GAME_GRACE_SECONDS: i64 = 3600;
pub const CAPABILITIES: [&str; 12] = [
    "vantare.channel.nightly",
    "vantare.channel.testers",
    "vantare.edition.launch_v1",
    "vantare.module.analysis",
    "vantare.module.calendar",
    "vantare.module.engineer",
    "vantare.module.strategy",
    "vantare.operational.nightly_tester",
    "vantare.operational.owner",
    "vantare.operational.tester",
    "vantare.plan.founders",
    "vantare.plan.pro",
];

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Capability {
    pub key: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub paid_through: String,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub perpetual: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub scope_version: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaimsV1 {
    pub issuer: String,
    pub subject: String,
    pub device_fingerprint: String,
    pub issued_at: String,
    pub capabilities: Vec<Capability>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CredentialV1 {
    pub version: u8,
    pub algorithm: String,
    pub key_id: String,
    pub claims: ClaimsV1,
    pub signature: String,
}
#[derive(Serialize)]
struct PayloadV1<'a> {
    version: u8,
    algorithm: &'a str,
    key_id: &'a str,
    claims: &'a ClaimsV1,
}

impl CredentialV1 {
    fn signing_bytes(&self) -> Result<Vec<u8>> {
        // encoding/json (Go v1) escapes HTML and the two JS line separators.
        let json = serde_json::to_string(&PayloadV1 {
            version: self.version,
            algorithm: &self.algorithm,
            key_id: &self.key_id,
            claims: &self.claims,
        })
        .map_err(|_| Error::InvalidCredential)?;
        Ok(json
            .replace('&', "\\u0026")
            .replace('<', "\\u003c")
            .replace('>', "\\u003e")
            .replace('\u{2028}', "\\u2028")
            .replace('\u{2029}', "\\u2029")
            .into_bytes())
    }
}

pub struct Verified {
    subject: String,
    device: String,
    issued_at: DateTime<Utc>,
    grants: Vec<Grant>,
}
#[derive(Clone)]
pub struct Grant {
    pub key: String,
    pub expires_at: Option<DateTime<Utc>>,
}
impl Verified {
    pub fn subject(&self) -> &str {
        &self.subject
    }
    pub fn device(&self) -> &str {
        &self.device
    }
    pub fn grants(&self) -> &[Grant] {
        &self.grants
    }
}

pub struct Verifier {
    keys: BTreeMap<String, VerifyingKey>,
}
/// Cache recovery reasons contain no credential or remote text.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CacheIssue {
    UnknownKey,
    UnsupportedFormat,
    InvalidSignature,
    Unreadable,
    AuthorityRejected,
    AuthorityUnreadable,
}
impl CacheIssue {
    pub fn diagnostic(self) -> &'static str {
        match self {
            Self::AuthorityUnreadable => "license-authority-unreadable",
            Self::AuthorityRejected => "license-cache-authority-rejected",
            Self::InvalidSignature => "license-cache-invalid-signature",
            Self::Unreadable => "license-cache-unreadable",
            Self::UnknownKey => "license-cache-unknown-key",
            Self::UnsupportedFormat => "license-cache-unsupported-format",
        }
    }
}

impl Verifier {
    /// Inspect only format/key availability for a cache migration. This never
    /// verifies or grants rights: supported entries still require full verification.
    pub fn cache_issue(&self, text: &str) -> Option<CacheIssue> {
        let text = text.trim_start();
        if text.len() > 32 * 1024 {
            return Some(CacheIssue::UnsupportedFormat);
        }
        let Ok(credential) = serde_json::from_str::<CredentialV1>(text) else {
            return Some(CacheIssue::UnsupportedFormat);
        };
        if credential.version != 1 || credential.algorithm != "Ed25519" {
            return Some(CacheIssue::UnsupportedFormat);
        }
        let key_id = credential.key_id;
        (!self.keys.contains_key(&key_id)).then_some(CacheIssue::UnknownKey)
    }
    pub fn public_keys(text: &str) -> Result<Self> {
        let mut keys = BTreeMap::new();
        for pair in text.split(',') {
            let (id, encoded) = pair.split_once(':').ok_or(Error::Unconfigured)?;
            if id.is_empty() || id.len() > 64 || keys.contains_key(id) {
                return Err(Error::Unconfigured);
            }
            let bytes: [u8; 32] = URL_SAFE_NO_PAD
                .decode(encoded)
                .map_err(|_| Error::Unconfigured)?
                .try_into()
                .map_err(|_| Error::Unconfigured)?;
            let key = VerifyingKey::from_bytes(&bytes).map_err(|_| Error::Unconfigured)?;
            if key.is_weak() {
                return Err(Error::Unconfigured);
            }
            keys.insert(id.into(), key);
        }
        Ok(Self { keys })
    }

    fn signature(&self, id: &str, payload: &[u8], encoded: &str) -> Result<()> {
        let key = self.keys.get(id).ok_or(Error::InvalidCredential)?;
        let bytes = URL_SAFE_NO_PAD
            .decode(encoded)
            .map_err(|_| Error::InvalidCredential)?;
        let signature = Signature::from_slice(&bytes).map_err(|_| Error::InvalidCredential)?;
        key.verify_strict(payload, &signature)
            .map_err(|_| Error::InvalidCredential)
    }

    pub fn v1(&self, credential: &CredentialV1, subject: &str, device: &str) -> Result<Verified> {
        if credential.version != 1 || credential.algorithm != "Ed25519" {
            return Err(Error::InvalidCredential);
        }
        self.signature(
            &credential.key_id,
            &credential.signing_bytes()?,
            &credential.signature,
        )?;
        let claims = &credential.claims;
        if claims.issuer != ISSUER
            || !uuid(subject)
            || claims.subject != subject
            || device.is_empty()
            || claims.device_fingerprint != device
        {
            return Err(Error::InvalidCredential);
        }
        Ok(Verified {
            subject: subject.into(),
            device: device.into(),
            issued_at: date(&claims.issued_at)?,
            grants: grants(&claims.capabilities)?,
        })
    }
}

pub fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(index, b)| {
            if [8, 13, 18, 23].contains(&index) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        })
}
fn date(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| Error::InvalidCredential)
}

fn grants(capabilities: &[Capability]) -> Result<Vec<Grant>> {
    let mut previous = "";
    let mut roles = 0;
    let mut grants = Vec::new();
    for capability in capabilities {
        // El orden estricto y la ausencia de duplicados se mantienen: son la
        // defensa contra una credencial mal formada.
        if capability.key.as_str() <= previous {
            return Err(Error::InvalidCredential);
        }
        previous = &capability.key;
        // Una capacidad que este cliente no conoce se IGNORA en vez de tumbar la
        // credencial entera. El servidor puede ir por delante del cliente, y
        // rechazarla degradaba a Free a un cliente de pago sin conceder nada a
        // cambio: no se otorga nada por una capacidad desconocida.
        if !CAPABILITIES.contains(&capability.key.as_str()) {
            continue;
        }
        if capability.key.starts_with("vantare.operational.") {
            roles += 1;
            if roles > 1 {
                return Err(Error::InvalidCredential);
            }
        }
        let expires_at = if capability.perpetual {
            if !capability.paid_through.is_empty()
                || !((capability.key == "vantare.edition.launch_v1"
                    && capability.scope_version == "launch_v1")
                    || (capability.key == "vantare.plan.founders"
                        && capability.scope_version.is_empty())
                    || (capability.key == "vantare.channel.nightly"
                        && capability.scope_version.is_empty()
                        && capabilities.iter().any(|grant| {
                            grant.key == "vantare.plan.founders"
                                && grant.perpetual
                                && grant.scope_version.is_empty()
                                && grant.paid_through.is_empty()
                        }))
                    || (capability.key == "vantare.channel.testers"
                        && capability.scope_version.is_empty())
                    || (capability.key.starts_with("vantare.module.")
                        && capability.scope_version.is_empty()))
            {
                return Err(Error::InvalidCredential);
            }
            None
        } else {
            if capability.key == "vantare.edition.launch_v1"
                || capability.key == "vantare.plan.founders"
                || capability.key.starts_with("vantare.module.")
                || !capability.scope_version.is_empty()
            {
                return Err(Error::InvalidCredential);
            }
            let paid = date(&capability.paid_through)?;
            Some(paid)
        };
        grants.push(Grant {
            key: capability.key.clone(),
            expires_at,
        });
    }
    Ok(grants)
}

#[cfg(test)]
mod tests;
