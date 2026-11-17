//! Closed answer writer. Only the resident can accept the live question.
use super::{ResidentAction, ResidentAnswerRejection, ResidentReviewTarget};
use crate::protocol::HostError;
use native::answer::{AnswerRejection, ReviewProof, permits_answer, permits_reviewed_trust};
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
pub(super) fn rejected(reason: AnswerRejection) -> HostError {
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
        native::Decision,
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
    Ok((instance, scope, question))
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
    let (instance, scope, _) = checked_target(path, target)?;
    if scope.account != account {
        return Err(rejected(AnswerRejection::AccountChanged));
    }
    let action = target.action.native();
    if !vantare_ipc::control::wall_ms()
        .is_ok_and(|now| permits_answer(&observation.policy, action, now))
    {
        return Err(rejected(AnswerRejection::Denied));
    }
    write_answer(path, instance, scope, action, None)
}

fn write_answer(
    path: &Path,
    instance: native::execution::ResidentInstance,
    scope: native::answer::QuestionScope,
    action: native::Action,
    review: Option<ReviewProof>,
) -> Result<ResidentQueued, HostError> {
    super::order_mailbox::enqueue(path, |request| {
        native::Request::AnswerChecked(native::AnswerChecked {
            request,
            instance,
            account: scope.account,
            run: scope.run,
            revision: scope.revision,
            decision: scope.decision,
            action,
            review,
        })
    })
}

impl ResidentReviewTarget {
    pub(super) fn answer_target(&self, action: ResidentAction) -> ResidentAnswerTarget {
        ResidentAnswerTarget {
            instance: self.instance.clone(),
            account_generation: self.account_generation.clone(),
            run: self.run.clone(),
            revision: self.revision.clone(),
            decision: self.decision.clone(),
            action,
        }
    }
}

pub(super) struct CheckedReview {
    instance: native::execution::ResidentInstance,
    scope: native::answer::QuestionScope,
    pub(super) pages: Vec<String>,
}
impl CheckedReview {
    pub(super) fn digest(&self) -> String {
        vantare_services::content_hash(&native::review::frame_pages(&self.pages))
    }
}

pub(super) fn checked_review(
    path: &Path,
    observation: Option<&AccountObservation>,
    target: &ResidentReviewTarget,
) -> Result<CheckedReview, HostError> {
    if path.is_absolute() && !vantare_launcher::is_local_path(path) {
        return Err(HostError::Denied);
    }
    let observation = observation.ok_or(HostError::CoreUnavailable)?;
    let account: vantare_ipc::account_session::AccountGeneration = target
        .account_generation
        .clone()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if observation.generation != account {
        return Err(rejected(AnswerRejection::AccountChanged));
    }
    let (instance, scope, question) =
        checked_target(path, &target.answer_target(ResidentAction::Trust))?;
    if scope.account != account {
        return Err(rejected(AnswerRejection::AccountChanged));
    }
    let pages = native::review::review_pages(&question.message)
        .map_err(|_| rejected(AnswerRejection::Unavailable))?;
    if !native::review::can_trust(&pages) {
        return Err(rejected(AnswerRejection::Unavailable));
    }
    Ok(CheckedReview {
        instance,
        scope,
        pages,
    })
}

pub(super) fn check_review_permission(
    observation: Option<&AccountObservation>,
) -> Result<(), HostError> {
    let observation = observation.ok_or(HostError::CoreUnavailable)?;
    if !vantare_ipc::control::wall_ms()
        .is_ok_and(|now| permits_reviewed_trust(&observation.policy, now))
    {
        return Err(rejected(AnswerRejection::Denied));
    }
    Ok(())
}

pub(super) fn answer_reviewed(
    path: &Path,
    observation: Option<&AccountObservation>,
    checked: CheckedReview,
    pages_digest: String,
    issued_ms: u64,
) -> Result<ResidentQueued, HostError> {
    check_review_permission(observation)?;
    write_answer(
        path,
        checked.instance,
        checked.scope,
        native::Action::Trust,
        Some(ReviewProof {
            pages_digest,
            issued_ms,
        }),
    )
}
#[cfg(test)]
#[path = "answer_tests.rs"]
mod tests;
