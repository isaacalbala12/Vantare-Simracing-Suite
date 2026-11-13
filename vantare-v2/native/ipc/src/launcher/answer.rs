//! Checked answers target one live question; imported trust remains editor-only.
use super::{
    Action, RequestId,
    execution::{ResidentInstance, RunId},
};
use crate::account_session::AccountGeneration;
use serde::{Deserialize, Serialize, de::Error as _};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QuestionScope {
    #[serde(deserialize_with = "decision")]
    pub decision: String,
    pub run: RunId,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
    pub account: AccountGeneration,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AnswerChecked {
    pub request: RequestId,
    pub instance: ResidentInstance,
    pub account: AccountGeneration,
    pub run: RunId,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
    #[serde(deserialize_with = "decision")]
    pub decision: String,
    pub action: Action,
}
fn decision<'de, D: serde::Deserializer<'de>>(decoder: D) -> Result<String, D::Error> {
    let value = String::deserialize(decoder)?;
    if value
        .parse::<u64>()
        .is_ok_and(|id| id > 0 && id.to_string() == value)
    {
        Ok(value)
    } else {
        Err(D::Error::custom("invalid question id"))
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AnswerRejection {
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
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum OrderReceipt {
    Accepted { run: RunId },
    Rejected { reason: AnswerRejection },
}
pub fn permits_answer(policy: &crate::control::Policy, action: Action, now: u64) -> bool {
    policy.epoch > 0
        && match action {
            Action::Trust => false,
            Action::Cancel | Action::Stop | Action::Leave | Action::CloseStarted => {
                policy.observable_at(now)
            }
            Action::Reuse | Action::Restart | Action::Continue => policy.permits_launch(now),
        }
}
