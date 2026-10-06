//! Verificador puro y autoridad local consumible por el núcleo sin feature network.
use crate::{Error, Result};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub mod authority;
pub mod installation;

const ISSUER: &str = "vantare-license";
const AUDIENCE: &str = "vantare-native";
pub const CAPABILITIES: [&str; 11] = [
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Header {
    alg: String,
    kid: String,
    typ: String,
}

/// Destination contract to agree/deploy server-side; not an existing endpoint.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaimsV2 {
    pub version: u8,
    pub iss: String,
    pub aud: String,
    pub sub: String,
    pub device_key_id: String,
    pub iat: u64,
    pub exp: u64,
    pub capabilities: Vec<Capability>,
}

pub struct Verified {
    subject: String,
    device: String,
    issued_at: DateTime<Utc>,
    expires_at: Option<DateTime<Utc>>,
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
impl Verifier {
    /// El subject se extrae para verificarlo, pero solo adquiere autoridad
    /// después de verificar la firma y todos los claims del envelope.
    pub fn proof(&self, text: &str, legacy_device: &str, installation: &str) -> Result<Verified> {
        if text.len() > 64 * 1024 {
            return Err(Error::TooLarge);
        }
        if text.trim_start().starts_with('{') {
            let credential: CredentialV1 =
                serde_json::from_str(text).map_err(|_| Error::InvalidCredential)?;
            self.v1(&credential, &credential.claims.subject, legacy_device)
        } else {
            let body = text.split('.').nth(1).ok_or(Error::InvalidCredential)?;
            let claims: ClaimsV2 = serde_json::from_slice(
                &URL_SAFE_NO_PAD
                    .decode(body)
                    .map_err(|_| Error::InvalidCredential)?,
            )
            .map_err(|_| Error::InvalidCredential)?;
            self.jws(text, &claims.sub, installation)
        }
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
            expires_at: None,
            grants: grants(&claims.capabilities, None)?,
        })
    }

    pub fn jws(&self, compact: &str, subject: &str, installation_key: &str) -> Result<Verified> {
        if compact.len() > 64 * 1024 {
            return Err(Error::TooLarge);
        }
        let parts: Vec<_> = compact.split('.').collect();
        if parts.len() != 3 {
            return Err(Error::InvalidCredential);
        }
        let header: Header = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(parts[0])
                .map_err(|_| Error::InvalidCredential)?,
        )
        .map_err(|_| Error::InvalidCredential)?;
        if header.alg != "Ed25519" || header.typ != "vantare-license+jwt" {
            return Err(Error::InvalidCredential);
        }
        self.signature(
            &header.kid,
            format!("{}.{}", parts[0], parts[1]).as_bytes(),
            parts[2],
        )?;
        let claims: ClaimsV2 = serde_json::from_slice(
            &URL_SAFE_NO_PAD
                .decode(parts[1])
                .map_err(|_| Error::InvalidCredential)?,
        )
        .map_err(|_| Error::InvalidCredential)?;
        if claims.version != 2
            || claims.iss != ISSUER
            || claims.aud != AUDIENCE
            || !uuid(subject)
            || claims.sub != subject
            || installation_key.is_empty()
            || claims.device_key_id != installation_key
            || claims.exp <= claims.iat
        {
            return Err(Error::InvalidCredential);
        }
        let issued_at = timestamp(claims.iat)?;
        let expires_at = timestamp(claims.exp)?;
        Ok(Verified {
            subject: subject.into(),
            device: installation_key.into(),
            issued_at,
            expires_at: Some(expires_at),
            grants: grants(&claims.capabilities, Some(expires_at))?,
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
fn timestamp(value: u64) -> Result<DateTime<Utc>> {
    DateTime::from_timestamp(
        i64::try_from(value).map_err(|_| Error::InvalidCredential)?,
        0,
    )
    .ok_or(Error::InvalidCredential)
}
fn date(value: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|value| value.with_timezone(&Utc))
        .map_err(|_| Error::InvalidCredential)
}

fn grants(capabilities: &[Capability], envelope: Option<DateTime<Utc>>) -> Result<Vec<Grant>> {
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
                    || (capability.key == "vantare.channel.testers"
                        && capability.scope_version.is_empty())
                    || (capability.key.starts_with("vantare.module.")
                        && capability.scope_version.is_empty()))
            {
                return Err(Error::InvalidCredential);
            }
            envelope
        } else {
            if capability.key == "vantare.edition.launch_v1"
                || capability.key.starts_with("vantare.module.")
                || !capability.scope_version.is_empty()
            {
                return Err(Error::InvalidCredential);
            }
            let paid = date(&capability.paid_through)?;
            Some(envelope.map_or(paid, |envelope| envelope.min(paid)))
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
