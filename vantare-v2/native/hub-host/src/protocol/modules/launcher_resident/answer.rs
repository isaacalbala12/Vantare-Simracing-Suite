//! Closed answer writer. Only the resident can accept the live question.
use super::{ResidentAction, ResidentAnswerRejection};
use crate::protocol::HostError;
use native::answer::{AnswerRejection, permits_answer};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{account_session::AccountObservation, launcher as native};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentAnswerTarget {
    pub instance: String,
    pub account_generation: String,
    pub run: String,
    pub revision: String,
    pub decision: String,
    pub action: ResidentAction,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ResidentQueued {
    Queued { request: String },
}
fn rejected(reason: AnswerRejection) -> HostError {
    HostError::ResidentAnswerRejected {
        reason: ResidentAnswerRejection::from(reason),
    }
}
fn checked_target(
    path: &Path,
    target: &ResidentAnswerTarget,
) -> Result<
    (
        native::execution::ResidentInstance,
        native::answer::QuestionScope,
    ),
    HostError,
> {
    let status = native::read_status(path).ok_or(HostError::CoreUnavailable)?;
    if !status.running {
        return Err(rejected(AnswerRejection::WrongRun));
    }
    let extension = status.extension.ok_or(HostError::Unsupported)?;
    if !extension
        .capabilities
        .contains(&native::execution::Capability::CheckedAnswer)
    {
        return Err(HostError::Unsupported);
    }
    let instance = target
        .instance
        .clone()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if extension.instance != instance {
        return Err(rejected(AnswerRejection::WrongInstance));
    }
    let scope = extension
        .question
        .ok_or_else(|| rejected(AnswerRejection::UnscopedRun))?;
    let run = target
        .run
        .clone()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if scope.run != run {
        return Err(rejected(AnswerRejection::WrongRun));
    }
    if scope.revision != target.revision {
        return Err(rejected(AnswerRejection::RevisionMismatch));
    }
    let question = status
        .decision
        .filter(|q| q.id.to_string() == target.decision && scope.decision == target.decision)
        .ok_or_else(|| rejected(AnswerRejection::StaleQuestion))?;
    let action = target.action.native();
    if !question.actions.contains(&action) {
        return Err(rejected(AnswerRejection::InvalidAction));
    }
    Ok((instance, scope))
}
pub(crate) fn answer(
    path: &Path,
    observation: Option<&AccountObservation>,
    target: &ResidentAnswerTarget,
) -> Result<ResidentQueued, HostError> {
    if target.action == ResidentAction::Trust {
        return Err(rejected(AnswerRejection::TrustRequiresEditor));
    }
    if path.is_absolute() && !vantare_launcher::is_local_path(path) {
        return Err(HostError::Denied);
    }
    let observation = observation.ok_or(HostError::CoreUnavailable)?;
    let account = target
        .account_generation
        .clone()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if observation.generation != account {
        return Err(rejected(AnswerRejection::AccountChanged));
    }
    let (instance, scope) = checked_target(path, target)?;
    if scope.account != account {
        return Err(rejected(AnswerRejection::AccountChanged));
    }
    let action = target.action.native();
    if !vantare_ipc::control::wall_ms()
        .is_ok_and(|now| permits_answer(&observation.policy, action, now))
    {
        return Err(rejected(AnswerRejection::Denied));
    }
    super::order_mailbox::enqueue(path, |request| native::Request::AnswerChecked(native::AnswerChecked {
        request, instance, account, run: scope.run, revision: scope.revision, decision: scope.decision, action,
    }))
}
#[cfg(test)]
#[path = "answer_tests.rs"]
mod tests;
