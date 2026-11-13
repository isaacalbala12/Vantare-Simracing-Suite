use super::{AccountObservation, OrderReceipt, OrderRejection, Owner, authorize, observe};
use std::sync::Arc;
use vantare_ipc::{
    control::Policy,
    launcher::results::{RetryChecked, RetryScope, RunMode},
};
use vantare_launcher::{
    Document, Profile,
    chain::{Chain, StartError},
    discovery::{Discovery, Sources},
};

struct Prepared {
    document: Document,
    profile: Profile,
    selected: Vec<usize>,
    original: Vec<usize>,
    mode: RunMode,
}
impl Owner {
    pub(in super::super) fn retry_checked(&mut self, request: RetryChecked) {
        let link = self.authority.clone();
        let processes = Arc::clone(&self.processes);
        let path = self.path.clone();
        self.retry_checked_with(
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
    fn prepare_retry(&self, request: &RetryChecked) -> Result<Prepared, OrderRejection> {
        if self.chain.is_some() {
            return Err(OrderRejection::Busy);
        }
        let extension = self
            .status
            .extension
            .as_ref()
            .ok_or(OrderRejection::Unavailable)?;
        if !extension.can_start() {
            return Err(OrderRejection::StartFailed);
        }
        let record = self.run_record.as_ref().ok_or(OrderRejection::UnknownRun)?;
        let summary = &record.summary;
        if summary.run != request.run
            || summary.profile != request.profile
            || !summary
                .outcome
                .is_some_and(|outcome| extension.has_retained_terminal(summary.run, outcome))
        {
            return Err(OrderRejection::UnknownRun);
        }
        if summary.account != request.account {
            return Err(OrderRejection::AccountChanged);
        }
        if summary.revision != request.revision {
            return Err(OrderRejection::RevisionMismatch);
        }
        let (document, profile) = vantare_launcher::snapshot::read_profile_checked(
            &self.path,
            &request.profile,
            &request.revision,
        )
        .map_err(OrderRejection::from)?;
        let selected = record.selection(request.scope);
        if selected.is_empty() {
            return Err(match request.scope {
                RetryScope::Failed => OrderRejection::NoFailedSteps,
                RetryScope::All => OrderRejection::NoSteps,
            });
        }
        Ok(Prepared {
            document,
            profile,
            selected,
            original: record.original.clone(),
            mode: summary.mode,
        })
    }
    fn retry_checked_with(
        &mut self,
        request: RetryChecked,
        read: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
        start: impl FnOnce(Document, Profile, Vec<usize>) -> Result<Chain, StartError>,
    ) {
        if !self.control_ready(&request.instance, &request.request) {
            return;
        }
        let result = (|| {
            let prepared = self.prepare_retry(&request)?;
            authorize(&request.account, read, Policy::permits_launch)?;
            let chain =
                start(prepared.document, prepared.profile, prepared.selected).map_err(|error| {
                    match error {
                        StartError::Busy(_) => OrderRejection::Busy,
                        StartError::Invalid(_) | StartError::Io(_) => OrderRejection::StartFailed,
                    }
                })?;
            Ok((chain, prepared.mode, prepared.original))
        })();
        match result {
            Ok((chain, mode, original)) => {
                self.status.error = None;
                self.active_run = self
                    .status
                    .extension
                    .as_mut()
                    .and_then(|extension| extension.accept_order(request.request));
                if self.active_run.is_none() {
                    self.status.extension = None;
                }
                self.active_scope = Some(super::super::ActiveScope {
                    revision: request.revision,
                    account: request.account,
                });
                self.chain = Some(chain);
                self.begin_results(request.profile, mode, Some(original));
            }
            Err(reason) => self.record_order(request.request, OrderReceipt::Rejected { reason }),
        }
        self.publish();
    }
}

#[cfg(test)]
#[path = "retry_tests.rs"]
mod tests;
