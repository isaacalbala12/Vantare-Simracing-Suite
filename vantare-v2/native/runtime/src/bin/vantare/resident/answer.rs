//! Consume checked answers against both the execution scope and the worker's live question.
use super::{ActiveScope, Chain, Duration, EventKind, Owner, launcher};
use vantare_ipc::{
    account_session::{self, AccountObservation},
    launcher::{
        Action, AnswerChecked,
        answer::{AnswerRejection, OrderReceipt, permits_answer},
    },
};
impl Owner {
    pub(super) fn observe_active_scope(&self) -> Option<ActiveScope> {
        let authority = self.authority.as_ref()?;
        let bytes = self.bytes.as_ref()?;
        let observation =
            account_session::read_account_session(authority, Duration::from_millis(750)).ok()??;
        Some(ActiveScope {
            revision: vantare_services::content_hash(bytes),
            account: observation.generation,
        })
    }
    pub(super) fn answer_checked(&mut self, request: AnswerChecked) {
        let authority = self.authority.clone();
        self.answer_checked_with(request, || {
            let authority = authority.ok_or(std::io::ErrorKind::NotConnected)?;
            account_session::read_account_session(&authority, Duration::from_millis(750))
        });
    }
    fn checked_answer_target(&self, request: &AnswerChecked) -> Result<u64, AnswerRejection> {
        let extension = self
            .status
            .extension
            .as_ref()
            .ok_or(AnswerRejection::Unavailable)?;
        if extension.instance != request.instance {
            return Err(AnswerRejection::WrongInstance);
        }
        if !extension.can_start() {
            return Err(AnswerRejection::Unavailable);
        }
        if self.active_run != Some(request.run) || self.chain.as_ref().is_none_or(Chain::finished) {
            return Err(AnswerRejection::WrongRun);
        }
        let scope = self
            .active_scope
            .as_ref()
            .ok_or(AnswerRejection::UnscopedRun)?;
        if scope.account != request.account {
            return Err(AnswerRejection::AccountChanged);
        }
        if scope.revision != request.revision {
            return Err(AnswerRejection::RevisionMismatch);
        }
        let question = self
            .status
            .decision
            .as_ref()
            .filter(|q| q.id.to_string() == request.decision)
            .ok_or(AnswerRejection::StaleQuestion)?;
        let local_id = self.chain_decision.ok_or(AnswerRejection::StaleQuestion)?;
        if !question.actions.contains(&request.action) {
            return Err(AnswerRejection::InvalidAction);
        }
        if request.action == Action::Trust {
            return Err(AnswerRejection::TrustRequiresEditor);
        }
        Ok(local_id)
    }
    fn answer_checked_with(
        &mut self,
        request: AnswerChecked,
        observe: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
    ) {
        let Some(extension) = self.status.extension.as_ref() else {
            super::super::log("Launcher: answer-v3 descartado sin extension de ejecucion");
            return;
        };
        if extension.instance == request.instance && extension.contains_request(&request.request) {
            return;
        }
        let result = (|| {
            let local_id = self.checked_answer_target(&request)?;
            let observation = observe()
                .map_err(|_| AnswerRejection::AuthorityUnavailable)?
                .ok_or(AnswerRejection::AccountChanged)?;
            if observation.generation != request.account {
                return Err(AnswerRejection::AccountChanged);
            }
            if !vantare_ipc::control::wall_ms()
                .is_ok_and(|now| permits_answer(&observation.policy, request.action, now))
            {
                return Err(AnswerRejection::Denied);
            }
            self.chain
                .as_ref()
                .ok_or(AnswerRejection::WrongRun)?
                .answer_checked(local_id, request.action)
                .map_err(|error| match error {
                    launcher::chain::AnswerError::StaleQuestion => AnswerRejection::StaleQuestion,
                    launcher::chain::AnswerError::InvalidAction => AnswerRejection::InvalidAction,
                    launcher::chain::AnswerError::TrustRequiresEditor => {
                        AnswerRejection::TrustRequiresEditor
                    }
                    launcher::chain::AnswerError::Unavailable => AnswerRejection::Unavailable,
                })
        })();
        if result.is_ok() {
            self.status.decision = None;
            self.chain_decision = None;
            if let Some(extension) = &mut self.status.extension {
                extension.question = None;
            }
        }
        let receipt = match result {
            Ok(()) => OrderReceipt::Accepted { run: request.run },
            Err(reason) => OrderReceipt::Rejected {
                reason: reason.into(),
            },
        };
        let recorded = self.status.extension.as_mut().and_then(|extension| {
            extension.record(EventKind::OrderReceived {
                request: request.request,
                receipt,
            })
        });
        if recorded.is_none() {
            self.status.extension = None;
        }
    }
}
#[cfg(test)]
#[path = "answer_tests.rs"]
mod tests;
