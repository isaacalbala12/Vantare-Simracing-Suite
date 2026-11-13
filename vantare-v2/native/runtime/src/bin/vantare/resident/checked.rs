//! Only explicit checked requests query the authority; never a polling/retry loop.
use super::{
    Arc, Chain, Discovery, Document, Duration, EventKind, ExecutionStatus, Owner, Sources, launcher,
};
use launcher::chain::StartError;
use vantare_ipc::{
    account_session::{self, AccountObservation},
    launcher::{
        LaunchChecked,
        checked::{LaunchReceipt, LaunchRejection},
    },
};

impl Owner {
    pub(super) fn launch_checked(&mut self, request: LaunchChecked) {
        let authority = self.authority.clone();
        let processes = Arc::clone(&self.processes);
        let path = self.path.clone();
        self.launch_checked_with(
            request,
            || {
                let authority = authority.ok_or(std::io::ErrorKind::NotConnected)?;
                account_session::read_account_session(&authority, Duration::from_millis(750))
            },
            move |document, profile| {
                Chain::start_checked(
                    document,
                    profile,
                    |apps| Discovery::scan(apps, Sources::system()),
                    processes,
                    None,
                    &path,
                )
            },
        );
    }
    fn launch_checked_with(
        &mut self,
        request: LaunchChecked,
        observe: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
        start: impl FnOnce(Document, launcher::Profile) -> Result<Chain, StartError>,
    ) {
        let Some(extension) = self.status.extension.as_ref() else {
            super::super::log("Launcher: launch-v2 descartado sin extension de ejecucion");
            return;
        };
        if extension.instance != request.instance {
            self.reject_checked(request.request, LaunchRejection::WrongInstance);
            self.publish();
            return;
        }
        if extension.contains_request(&request.request) {
            return;
        }
        let prepared = (|| {
            if self.chain.is_some() {
                return Err(LaunchRejection::Busy);
            }
            if !self
                .status
                .extension
                .as_ref()
                .is_some_and(ExecutionStatus::can_start)
            {
                return Err(LaunchRejection::StartFailed);
            }
            let (document, profile) =
                launcher::snapshot::read_checked(&self.path, &request.profile, &request.revision)?;
            let observation = observe()
                .map_err(|_| LaunchRejection::AuthorityUnavailable)?
                .ok_or(LaunchRejection::AccountChanged)?;
            if observation.generation != request.account {
                return Err(LaunchRejection::AccountChanged);
            }
            if !vantare_ipc::control::wall_ms()
                .is_ok_and(|now| observation.policy.permits_launch(now))
            {
                return Err(LaunchRejection::Denied);
            }
            start(document, profile).map_err(|error| match error {
                StartError::Busy(_) => LaunchRejection::Busy,
                StartError::Invalid(_) | StartError::Io(_) => LaunchRejection::StartFailed,
            })
        })();
        match prepared {
            Ok(chain) => {
                self.status.error = None;
                self.active_run = self
                    .status
                    .extension
                    .as_mut()
                    .and_then(|extension| extension.accept(request.request));
                if self.active_run.is_none() {
                    self.status.extension = None;
                }
                self.active_scope = Some(super::ActiveScope {
                    revision: request.revision,
                    account: request.account,
                });
                self.chain = Some(chain);
                self.begin_results(
                    request.profile,
                    vantare_ipc::launcher::results::RunMode::Profile,
                    None,
                );
            }
            Err(reason) => self.reject_checked(request.request, reason),
        }
        self.publish();
    }
    fn reject_checked(
        &mut self,
        request: vantare_ipc::launcher::RequestId,
        reason: LaunchRejection,
    ) {
        let recorded = self.status.extension.as_mut().and_then(|extension| {
            extension.record(EventKind::Received {
                request,
                receipt: LaunchReceipt::Rejected { reason },
            })
        });
        if recorded.is_none() {
            self.status.extension = None;
        }
    }
}

#[cfg(test)]
#[path = "checked_tests.rs"]
mod tests;
