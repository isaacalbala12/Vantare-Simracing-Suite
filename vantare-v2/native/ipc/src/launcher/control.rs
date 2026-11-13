//! Opt-in control orders: targets contain no executable data.
use super::{
    RequestId,
    answer::AnswerRejection,
    checked::LaunchRejection,
    execution::{ResidentInstance, RunId},
};
use crate::account_session::AccountGeneration;
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunScope {
    pub run: RunId,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
    pub account: AccountGeneration,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CancelChecked {
    pub request: RequestId,
    pub instance: ResidentInstance,
    pub account: AccountGeneration,
    pub run: RunId,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RehearseChecked {
    pub request: RequestId,
    pub instance: ResidentInstance,
    pub account: AccountGeneration,
    #[serde(deserialize_with = "super::checked::profile")]
    pub profile: String,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
}
/// Shared receipt reasons; the existing answer RPC keeps its narrower error type.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OrderRejection {
    WrongInstance,
    AccountChanged,
    AuthorityUnavailable,
    Denied,
    RevisionMismatch,
    UnscopedRun,
    WrongRun,
    StaleQuestion,
    InvalidAction,
    TrustRequiresEditor,
    Unavailable,
    Busy,
    DocumentUnavailable,
    NoSteps,
    StartFailed,
}
impl From<AnswerRejection> for OrderRejection {
    fn from(value: AnswerRejection) -> Self {
        match value {
            AnswerRejection::WrongInstance => Self::WrongInstance,
            AnswerRejection::AccountChanged => Self::AccountChanged,
            AnswerRejection::AuthorityUnavailable => Self::AuthorityUnavailable,
            AnswerRejection::Denied => Self::Denied,
            AnswerRejection::RevisionMismatch => Self::RevisionMismatch,
            AnswerRejection::UnscopedRun => Self::UnscopedRun,
            AnswerRejection::WrongRun => Self::WrongRun,
            AnswerRejection::StaleQuestion => Self::StaleQuestion,
            AnswerRejection::InvalidAction => Self::InvalidAction,
            AnswerRejection::TrustRequiresEditor => Self::TrustRequiresEditor,
            AnswerRejection::Unavailable => Self::Unavailable,
        }
    }
}
impl From<LaunchRejection> for OrderRejection {
    fn from(value: LaunchRejection) -> Self {
        match value {
            LaunchRejection::Busy => Self::Busy,
            LaunchRejection::WrongInstance => Self::WrongInstance,
            LaunchRejection::RevisionMismatch => Self::RevisionMismatch,
            LaunchRejection::DocumentUnavailable => Self::DocumentUnavailable,
            LaunchRejection::AccountChanged => Self::AccountChanged,
            LaunchRejection::AuthorityUnavailable => Self::AuthorityUnavailable,
            LaunchRejection::Denied => Self::Denied,
            LaunchRejection::StartFailed => Self::StartFailed,
        }
    }
}
