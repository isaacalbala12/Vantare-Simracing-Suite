//! Closed review messages. The review text belongs to the trusted main process.
use super::{
    ResidentAction, ResidentAnswerRejection, ResidentQueued,
    answer::{self, CheckedReview},
};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::{
    fmt,
    path::Path,
    time::{Duration, Instant},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{account_session::AccountObservation, launcher as native};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentReview {
    Available,
    #[default]
    Unavailable,
    TooLong,
    /// #2881: bloqueado a propósito; el motivo viaja cerrado y nunca la ruta.
    BlockedLookalike,
    BlockedUnusualPath,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentReviewTarget {
    pub instance: String,
    pub account_generation: String,
    pub run: String,
    pub revision: String,
    pub decision: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct ResidentReviewTicket {
    pub ticket: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct ReviewContentRequest {
    pub ticket: String,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct ReviewContent {
    pub pages: Vec<String>,
}
impl fmt::Debug for ReviewContent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ReviewContent").finish_non_exhaustive()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum ReviewChoice {
    Trust,
    Cancel,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct ReviewDecision {
    pub ticket: String,
    pub decision: ReviewChoice,
    // Timestamp supplied by the trusted main process at the user's confirmation.
    #[serde(rename = "issuedMs", default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(
        any(test, feature = "bindings"),
        ts(optional, type = "number", rename = "issuedMs")
    )]
    pub issued_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum ReviewFailure {
    Changed,
    Expired,
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum ResidentReviewState {
    Trusted,
    Declined,
    Changed,
    Expired,
    Unavailable,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct ResidentReviewOutcome {
    pub question: String,
    pub state: ResidentReviewState,
}

const TICKET_LIFETIME: Duration = Duration::from_secs(180);

struct Ticket {
    id: String,
    target: ResidentReviewTarget,
    digest: String,
    opened: Option<Instant>,
}
struct Outcome {
    target: ResidentReviewTarget,
    state: Result<QueuedDecision, ReviewFailure>,
}
struct QueuedDecision {
    request: native::RequestId,
    choice: ReviewChoice,
    submitted: Instant,
}

#[derive(Default)]
pub(crate) struct Review {
    ticket: Option<Ticket>,
    outcome: Option<Outcome>,
}

impl Review {
    pub(crate) fn open(
        &mut self,
        path: &Path,
        account: Option<&AccountObservation>,
        target: &ResidentReviewTarget,
    ) -> Result<ResidentReviewTicket, HostError> {
        let checked = answer::checked_review(path, account, target)?;
        answer::check_review_permission(account)?;
        let random = vantare_services::random_id().map_err(|_| HostError::Io)?;
        let ticket = random[..32].to_owned();
        self.ticket = Some(Ticket {
            id: ticket.clone(),
            target: target.clone(),
            digest: checked.digest(),
            opened: None,
        });
        self.outcome = None;
        Ok(ResidentReviewTicket { ticket })
    }

    pub(crate) fn content(
        &mut self,
        path: &Path,
        account: Option<&AccountObservation>,
        id: &str,
        now: Instant,
    ) -> Result<ReviewContent, ReviewFailure> {
        let ticket = self
            .ticket
            .as_mut()
            .filter(|ticket| ticket.id == id)
            .ok_or(ReviewFailure::Unavailable)?;
        let checked = ticket.check(path, account, now)?;
        answer::check_review_permission(account).map_err(|error| review_failure(&error))?;
        ticket.opened.get_or_insert(now);
        Ok(ReviewContent {
            pages: checked.pages,
        })
    }

    pub(crate) fn decide(
        &mut self,
        path: &Path,
        account: Option<&AccountObservation>,
        input: &ReviewDecision,
        now: Instant,
        now_ms: Option<u64>,
    ) -> Result<(), ReviewFailure> {
        if self
            .ticket
            .as_ref()
            .is_none_or(|ticket| ticket.id != input.ticket)
        {
            return Err(ReviewFailure::Unavailable);
        }
        let ticket = self.ticket.take().expect("matching active review ticket");
        let state = if ticket.opened.is_none() {
            Err(ReviewFailure::Unavailable)
        } else {
            ticket.check(path, account, now)
        }
        .and_then(|checked| {
            let queued = match input.decision {
                ReviewChoice::Trust => {
                    let issued_ms = input.issued_ms.ok_or(ReviewFailure::Unavailable)?;
                    let now_ms = now_ms.ok_or(ReviewFailure::Unavailable)?;
                    if !native::review::authorization_current(issued_ms, now_ms) {
                        return Err(ReviewFailure::Expired);
                    }
                    answer::answer_reviewed(path, account, checked, ticket.digest, issued_ms)
                }
                ReviewChoice::Cancel if input.issued_ms.is_some() => {
                    return Err(ReviewFailure::Unavailable);
                }
                ReviewChoice::Cancel => answer::answer(
                    path,
                    account,
                    &ticket.target.answer_target(ResidentAction::Cancel),
                ),
            }
            .map_err(|error| review_failure(&error))?;
            let ResidentQueued::Queued { request } = queued;
            Ok(QueuedDecision {
                request: request.try_into().map_err(|_| ReviewFailure::Unavailable)?,
                choice: input.decision,
                submitted: now,
            })
        });
        let result = state.as_ref().map(|_| ()).map_err(|reason| *reason);
        self.outcome = Some(Outcome {
            target: ticket.target,
            state,
        });
        result
    }

    pub(crate) fn clear(&mut self) {
        *self = Self::default();
    }

    pub(super) fn outcome(
        &mut self,
        status: Option<&native::Status>,
        account: Option<&AccountObservation>,
        now: Instant,
    ) -> Option<ResidentReviewOutcome> {
        if let Some(ticket) = self.ticket.as_ref() {
            let failed = if ticket
                .opened
                .is_some_and(|opened| now.saturating_duration_since(opened) >= TICKET_LIFETIME)
            {
                Some(ReviewFailure::Expired)
            } else if status
                .and_then(|status| matching_execution(status, account, &ticket.target))
                .is_none()
                || status
                    .and_then(|status| status.decision.as_ref())
                    .is_none_or(|question| {
                        native::review::review_pages(&question.message)
                            .ok()
                            .is_none_or(|pages| {
                                vantare_services::content_hash(&native::review::frame_pages(&pages))
                                    != ticket.digest
                            })
                    })
            {
                Some(ReviewFailure::Changed)
            } else {
                None
            };
            if let Some(reason) = failed
                && let Some(ticket) = self.ticket.take()
            {
                self.outcome = Some(Outcome {
                    target: ticket.target,
                    state: Err(reason),
                });
            }
        }
        let outcome = self.outcome.as_ref()?;
        let Some(extension) =
            status.and_then(|status| matching_execution(status, account, &outcome.target))
        else {
            self.outcome = None;
            return None;
        };
        let state = match &outcome.state {
            Ok(order) => order.outcome(extension, &outcome.target, now)?,
            Err(reason) => (*reason).into(),
        };
        Some(ResidentReviewOutcome {
            question: outcome.target.decision.clone(),
            state,
        })
    }
}

impl Ticket {
    fn check(
        &self,
        path: &Path,
        account: Option<&AccountObservation>,
        now: Instant,
    ) -> Result<CheckedReview, ReviewFailure> {
        if self
            .opened
            .is_some_and(|opened| now.saturating_duration_since(opened) >= TICKET_LIFETIME)
        {
            return Err(ReviewFailure::Expired);
        }
        let checked = answer::checked_review(path, account, &self.target)
            .map_err(|error| review_failure(&error))?;
        if checked.digest() != self.digest {
            return Err(ReviewFailure::Changed);
        }
        Ok(checked)
    }
}

fn review_failure(error: &HostError) -> ReviewFailure {
    match error {
        HostError::ResidentAnswerRejected {
            reason:
                ResidentAnswerRejection::WrongInstance
                | ResidentAnswerRejection::WrongRun
                | ResidentAnswerRejection::AccountChanged
                | ResidentAnswerRejection::RevisionMismatch
                | ResidentAnswerRejection::UnscopedRun
                | ResidentAnswerRejection::StaleQuestion
                | ResidentAnswerRejection::InvalidAction,
        } => ReviewFailure::Changed,
        _ => ReviewFailure::Unavailable,
    }
}

impl From<ReviewFailure> for ResidentReviewState {
    fn from(reason: ReviewFailure) -> Self {
        match reason {
            ReviewFailure::Changed => Self::Changed,
            ReviewFailure::Expired => Self::Expired,
            ReviewFailure::Unavailable => Self::Unavailable,
        }
    }
}

fn matching_execution<'a>(
    status: &'a native::Status,
    account: Option<&AccountObservation>,
    target: &ResidentReviewTarget,
) -> Option<&'a native::execution::ExecutionStatus> {
    use native::execution::EventKind;
    let extension = status.extension.as_ref()?;
    let instance: native::execution::ResidentInstance = target.instance.clone().try_into().ok()?;
    let run: native::execution::RunId = target.run.clone().try_into().ok()?;
    let generation = &account?.generation;
    let account_generation: vantare_ipc::account_session::AccountGeneration =
        target.account_generation.clone().try_into().ok()?;
    if !status.running
        || extension.instance != instance
        || *generation != account_generation
        || status
            .decision
            .as_ref()
            .is_some_and(|question| question.id.to_string() != target.decision)
        || extension.question.as_ref().is_some_and(|question| {
            question.account != account_generation
                || question.run != run
                || question.revision != target.revision
        })
    {
        return None;
    }
    let current_run = extension
        .events
        .iter()
        .rev()
        .find_map(|event| match &event.kind {
            EventKind::Started { run }
            | EventKind::Received {
                receipt: native::checked::LaunchReceipt::Accepted { run },
                ..
            }
            | EventKind::OrderReceived {
                receipt: native::answer::OrderReceipt::Accepted { run },
                ..
            } => Some(*run),
            _ => None,
        })?;
    (current_run == run).then_some(extension)
}

impl QueuedDecision {
    fn outcome(
        &self,
        extension: &native::execution::ExecutionStatus,
        target: &ResidentReviewTarget,
        now: Instant,
    ) -> Option<ResidentReviewState> {
        use native::{answer::OrderReceipt, control::OrderRejection, execution::EventKind};
        let run: native::execution::RunId = target.run.clone().try_into().ok()?;
        for event in extension.events.iter().rev() {
            let EventKind::OrderReceived { request, receipt } = &event.kind else {
                continue;
            };
            if *request != self.request {
                continue;
            }
            return Some(match receipt {
                OrderReceipt::Accepted { run: observed } if *observed == run => match self.choice {
                    ReviewChoice::Trust => ResidentReviewState::Trusted,
                    ReviewChoice::Cancel => ResidentReviewState::Declined,
                },
                OrderReceipt::Rejected {
                    reason:
                        OrderRejection::StaleQuestion
                        | OrderRejection::RevisionMismatch
                        | OrderRejection::AccountChanged
                        | OrderRejection::WrongRun
                        | OrderRejection::WrongInstance,
                } => ResidentReviewState::Changed,
                _ => ResidentReviewState::Unavailable,
            });
        }
        (now.saturating_duration_since(self.submitted)
            >= Duration::from_millis(crate::calendar::launch_types::RECEIPT_MS))
        .then_some(ResidentReviewState::Unavailable)
    }
}
