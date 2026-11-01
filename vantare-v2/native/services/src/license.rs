//! Contrato de transporte v1 y bytes firmados; solo `runtime::rights` verifica acceso.
use crate::{Error, Result};
use serde::{Deserialize, Serialize};

pub mod installation;

/// Máximo desfase aceptado al recibir una respuesta nueva del servidor.
pub const CLOCK_SKEW_SECONDS: u64 = 300;
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
    pub fn signing_bytes(&self) -> Result<Vec<u8>> {
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
