use super::{AccountObservation, OrderReceipt, OrderRejection, Owner, authorize, observe};
use std::sync::Arc;
use vantare_ipc::{control::Policy, launcher::RehearseChecked};
use vantare_launcher::{
    Document, Profile,
    chain::{Chain, StartError},
    discovery::{Discovery, Sources},
};
impl Owner {
    pub(in super::super) fn rehearse_checked(&mut self, request: RehearseChecked) {
        let link = self.authority.clone();
        let processes = Arc::clone(&self.processes);
        let path = self.path.clone();
        self.rehearse_checked_with(
            request,
            || observe(link.as_ref()),
            move |document, profile, selected| {
                Chain::start_checked(
                    document,
                    profile,
                    |apps| Discovery::scan(apps, Sources::system()),
                    processes,
                    Some(selected),
                    &path,
                )
            },
        );
    }
    fn rehearse_checked_with(
        &mut self,
        request: RehearseChecked,
        read: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
        start: impl FnOnce(Document, Profile, Vec<usize>) -> Result<Chain, StartError>,
    ) {
        if !self.control_ready(&request.instance, &request.request) {
            return;
        }
        let result = (|| {
            if self.chain.is_some() {
                return Err(OrderRejection::Busy);
            }
            if !self
                .status
                .extension
                .as_ref()
                .is_some_and(|e| e.can_start())
            {
                return Err(OrderRejection::StartFailed);
            }
            let (document, profile) = vantare_launcher::snapshot::read_profile_checked(
                &self.path,
                &request.profile,
                &request.revision,
            )
            .map_err(OrderRejection::from)?;
            let selected: Vec<_> = profile
                .steps
                .iter()
                .enumerate()
                .filter_map(|(index, step)| (step.app_id != "lmu").then_some(index))
                .collect();
            if selected.is_empty() {
                return Err(OrderRejection::NoSteps);
            }
            authorize(&request.account, read, Policy::permits_launch)?;
            start(document, profile, selected).map_err(|error| match error {
                StartError::Busy(_) => OrderRejection::Busy,
                StartError::Invalid(_) | StartError::Io(_) => OrderRejection::StartFailed,
            })
        })();
        match result {
            Ok(chain) => {
                self.status.error = None;
                self.active_run = self
                    .status
                    .extension
                    .as_mut()
                    .and_then(|e| e.accept_order(request.request));
                if self.active_run.is_none() {
                    self.status.extension = None;
                }
                self.active_scope = Some(super::super::ActiveScope {
                    revision: request.revision,
                    account: request.account,
                });
                self.chain = Some(chain);
            }
            Err(reason) => self.record_order(request.request, OrderReceipt::Rejected { reason }),
        }
        self.publish();
    }
}
#[cfg(test)]
#[path = "rehearse_tests.rs"]
mod tests;
