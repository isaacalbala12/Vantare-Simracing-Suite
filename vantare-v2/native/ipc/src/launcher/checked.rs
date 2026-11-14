//! Revision-checked launch is opt-in; legacy launch-v1 remains readable unchanged.
use super::execution::ResidentInstance;
use crate::account_session::AccountGeneration;
use serde::{Deserialize, Serialize, de::Error as _};

pub const ID_LIMIT: usize = 256;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct RequestId(String);
impl TryFrom<String> for RequestId {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if hex(&value, 32) {
            Ok(Self(value))
        } else {
            Err("invalid launch request")
        }
    }
}
impl From<RequestId> for String {
    fn from(value: RequestId) -> Self {
        value.0
    }
}
fn hex(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LaunchChecked {
    pub request: RequestId,
    pub instance: ResidentInstance,
    #[serde(deserialize_with = "profile")]
    pub profile: String,
    #[serde(deserialize_with = "revision")]
    pub revision: String,
    pub account: AccountGeneration,
}
pub(super) fn profile<'de, D: serde::Deserializer<'de>>(decoder: D) -> Result<String, D::Error> {
    let value = String::deserialize(decoder)?;
    if value.is_empty() || value.len() > ID_LIMIT || value.contains('\0') {
        Err(D::Error::custom("invalid launch profile"))
    } else {
        Ok(value)
    }
}
pub(super) fn revision<'de, D: serde::Deserializer<'de>>(decoder: D) -> Result<String, D::Error> {
    let value = String::deserialize(decoder)?;
    if hex(&value, 64) {
        Ok(value)
    } else {
        Err(D::Error::custom("invalid document revision"))
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchRejection {
    Busy,
    WrongInstance,
    RevisionMismatch,
    DocumentUnavailable,
    AccountChanged,
    AuthorityUnavailable,
    Denied,
    StartFailed,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum LaunchReceipt {
    Accepted { run: super::execution::RunId },
    Rejected { reason: LaunchRejection },
}
