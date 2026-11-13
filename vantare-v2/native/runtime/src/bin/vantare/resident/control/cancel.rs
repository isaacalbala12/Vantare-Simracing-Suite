use super::{AccountObservation, OrderReceipt, OrderRejection, Owner, authorize, observe};
use vantare_ipc::launcher::{
    Action, CancelChecked, answer::permits_answer, execution::ExecutionStatus,
};
use vantare_launcher::chain::{CancelError, Chain};
impl Owner {
    pub(in super::super) fn cancel_checked(&mut self, request: CancelChecked) {
        let link = self.authority.clone();
        self.cancel_checked_with(request, || observe(link.as_ref()));
    }
    fn cancel_target(&self, request: &CancelChecked) -> Result<(), OrderRejection> {
        if !self
            .status
            .extension
            .as_ref()
            .is_some_and(ExecutionStatus::can_start)
        {
            return Err(OrderRejection::Unavailable);
        }
        if self.active_run != Some(request.run) || self.chain.as_ref().is_none_or(Chain::finished) {
            return Err(OrderRejection::WrongRun);
        }
        let scope = self
            .active_scope
            .as_ref()
            .ok_or(OrderRejection::UnscopedRun)?;
        if scope.account != request.account {
            return Err(OrderRejection::AccountChanged);
        }
        if scope.revision != request.revision {
            return Err(OrderRejection::RevisionMismatch);
        }
        Ok(())
    }
    fn cancel_checked_with(
        &mut self,
        request: CancelChecked,
        read: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
    ) {
        if !self.control_ready(&request.instance, &request.request) {
            return;
        }
        let result = (|| {
            self.cancel_target(&request)?;
            authorize(&request.account, read, |policy, now| {
                permits_answer(policy, Action::Cancel, now)
            })?;
            self.chain
                .as_ref()
                .ok_or(OrderRejection::WrongRun)?
                .cancel_checked()
                .map_err(|error| match error {
                    CancelError::Finished => OrderRejection::WrongRun,
                    CancelError::Unavailable => OrderRejection::Unavailable,
                })
        })();
        self.record_order(
            request.request,
            match result {
                Ok(()) => OrderReceipt::Accepted { run: request.run },
                Err(reason) => OrderReceipt::Rejected { reason },
            },
        );
        self.publish();
    }
}
#[cfg(test)]
#[path = "cancel_tests.rs"]
mod tests;
