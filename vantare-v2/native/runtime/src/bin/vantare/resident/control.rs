//! Checked control orders share the execution ring; only this owner applies effects.
use super::{Duration, EventKind, Owner};
use vantare_ipc::{
    account_session::{self, AccountGeneration, AccountObservation, AuthorityLink},
    control::Policy,
    launcher::{
        RequestId, answer::OrderReceipt, control::OrderRejection, execution::ResidentInstance,
    },
};
mod cancel;
mod rehearse;
mod retry;
pub(super) fn observe(link: Option<&AuthorityLink>) -> std::io::Result<Option<AccountObservation>> {
    let link = link.ok_or(std::io::ErrorKind::NotConnected)?;
    account_session::read_account_session(link, Duration::from_millis(750))
}
pub(super) fn authorize(
    account: &AccountGeneration,
    read: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
    permit: impl FnOnce(&Policy, u64) -> bool,
) -> Result<(), OrderRejection> {
    let current = read()
        .map_err(|_| OrderRejection::AuthorityUnavailable)?
        .ok_or(OrderRejection::AccountChanged)?;
    if current.generation != *account {
        return Err(OrderRejection::AccountChanged);
    }
    if !vantare_ipc::control::wall_ms().is_ok_and(|now| permit(&current.policy, now)) {
        return Err(OrderRejection::Denied);
    }
    Ok(())
}
impl Owner {
    fn control_ready(&mut self, instance: &ResidentInstance, request: &RequestId) -> bool {
        let Some(extension) = self.status.extension.as_ref() else {
            super::super::log("Launcher: orden de control descartada sin extension de ejecucion");
            return false;
        };
        if extension.instance != *instance {
            self.record_order(
                request.clone(),
                OrderReceipt::Rejected {
                    reason: OrderRejection::WrongInstance,
                },
            );
            self.publish();
            return false;
        }
        !extension.contains_request(request)
    }
    fn record_order(&mut self, request: RequestId, receipt: OrderReceipt) {
        if self
            .status
            .extension
            .as_mut()
            .and_then(|e| e.record(EventKind::OrderReceived { request, receipt }))
            .is_none()
        {
            self.status.extension = None;
        }
    }
}

#[cfg(test)]
pub(super) mod support;
