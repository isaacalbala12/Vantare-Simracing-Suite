//! Checked removal owns the chain lease and process registry until durable CAS
//! and cache/trigger reconciliation. Observation alone never grants deletion.
use super::{Document, EventKind, Owner, files};
use std::{path::Path, sync::Arc};
use vantare_ipc::{
    account_session::AccountObservation,
    launcher::{
        RequestId,
        ownership::{
            Ownership, ProfileOwnership, RemovalOutcome, RemovalReceipt,
            RemovalRejection as Rejection, RemoveProfileChecked,
        },
    },
};

struct Prepared<'a> {
    lease: std::fs::File,
    registry: std::sync::MutexGuard<'a, vantare_launcher::processes::Processes>,
    observed: Vec<u8>,
    document: Document,
    next: Vec<u8>,
}
impl Owner {
    pub(super) fn refresh_ownership(&mut self) {
        let ownership = (|| {
            if self.status.error.is_some() {
                return None;
            }
            let bytes = self.bytes.as_ref().filter(|bytes| !bytes.is_empty())?;
            let names: Vec<_> = self
                .document
                .profiles
                .iter()
                .map(|p| p.id.clone())
                .collect();
            let live = self.processes.try_lock().ok()?.live_profiles(&names).ok()?;
            Some(Ownership::Known {
                revision: vantare_services::content_hash(bytes),
                profiles: names
                    .into_iter()
                    .zip(live)
                    .map(|(profile, owned_live)| ProfileOwnership {
                        profile,
                        owned_live,
                    })
                    .collect(),
            })
        })()
        .unwrap_or_default();
        if let Some(extension) = &mut self.status.extension {
            extension.ownership = extension
                .capabilities
                .contains(&vantare_ipc::launcher::execution::Capability::LiveProfileOwnership)
                .then_some(ownership);
        }
    }
    fn record_removal(&mut self, event: EventKind) -> bool {
        if self
            .status
            .extension
            .as_mut()
            .and_then(|e| e.record(event))
            .is_some()
        {
            true
        } else {
            self.status.extension = None;
            false
        }
    }
    fn reject_removal(&mut self, request: RequestId, reason: Rejection) {
        self.record_removal(EventKind::RemovalReceived {
            request,
            receipt: RemovalReceipt::Rejected { reason },
        });
        self.publish();
    }
    pub(super) fn remove_profile_checked(&mut self, request: RemoveProfileChecked) {
        let authority = self.authority.clone();
        self.remove_profile_with(
            request,
            || super::control::observe(authority.as_ref()),
            |path, next, observed| {
                files::save_with_limit(path, next, Some(observed), files::MAX_DOCUMENT)
            },
        );
    }
    fn prepare_removal<'a>(
        &self,
        request: &RemoveProfileChecked,
        processes: &'a vantare_launcher::processes::Shared,
        observe: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
    ) -> Result<Prepared<'a>, Rejection> {
        if self.chain.is_some() {
            return Err(Rejection::Busy);
        }
        super::control::authorize(
            &request.account,
            observe,
            vantare_ipc::control::Policy::permits_launch,
        )
        .map_err(|reason| match reason {
            vantare_ipc::launcher::control::OrderRejection::AccountChanged => {
                Rejection::AccountChanged
            }
            vantare_ipc::launcher::control::OrderRejection::AuthorityUnavailable => {
                Rejection::AuthorityUnavailable
            }
            _ => Rejection::Denied,
        })?;
        let lease =
            vantare_launcher::chain::acquire_lease(&self.path).map_err(|error| match error {
                vantare_launcher::chain::StartError::Busy(_) => Rejection::Busy,
                _ => Rejection::Io,
            })?;
        let mut registry = processes
            .try_lock()
            .map_err(|_| Rejection::OwnershipUnknown)?;
        let observed = files::read(&self.path, files::MAX_DOCUMENT)
            .map_err(|_| Rejection::DocumentUnavailable)?;
        if vantare_services::content_hash(&observed) != request.revision {
            return Err(Rejection::RevisionMismatch);
        }
        let mut document =
            Document::from_bytes(&observed).map_err(|_| Rejection::DocumentUnavailable)?;
        let profiles: Vec<_> = document
            .profiles
            .iter()
            .map(|profile| profile.id.clone())
            .collect();
        let live = registry
            .live_profiles(&profiles)
            .map_err(|_| Rejection::OwnershipUnknown)?;
        let index = profiles
            .iter()
            .position(|profile| *profile == request.profile)
            .ok_or(Rejection::DocumentUnavailable)?;
        if live[index] {
            return Err(Rejection::OwnedLive);
        }
        document
            .remove_profile(&request.profile)
            .map_err(|_| Rejection::DocumentUnavailable)?;
        let next = serde_json::to_vec_pretty(&document).map_err(|_| Rejection::Io)?;
        Ok(Prepared {
            lease,
            registry,
            observed,
            document,
            next,
        })
    }
    fn remove_profile_with(
        &mut self,
        request: RemoveProfileChecked,
        observe: impl FnOnce() -> std::io::Result<Option<AccountObservation>>,
        persist: impl FnOnce(&Path, &[u8], &[u8]) -> Result<(), files::Error>,
    ) {
        let Some(extension) = &self.status.extension else {
            return;
        };
        if extension.instance != request.instance {
            self.reject_removal(request.request, Rejection::WrongInstance);
            return;
        }
        if extension.contains_request(&request.request) {
            return;
        }
        if !extension.can_start() {
            self.status.extension = None;
            self.publish();
            return;
        }
        let processes = Arc::clone(&self.processes);
        let prepare = self.prepare_removal(&request, &processes, observe);
        let Prepared {
            lease,
            registry,
            observed,
            document,
            next,
        } = match prepare {
            Ok(value) => value,
            Err(reason) => {
                self.reject_removal(request.request, reason);
                return;
            }
        };
        if !self.record_removal(EventKind::RemovalReceived {
            request: request.request.clone(),
            receipt: RemovalReceipt::Accepted,
        }) {
            return;
        }
        let outcome = match persist(&self.path, &next, &observed) {
            Ok(()) => {
                let revision = vantare_services::content_hash(&next);
                self.install_document(next, document);
                RemovalOutcome::Removed { revision }
            }
            Err(error) => RemovalOutcome::Failed {
                reason: match error.kind() {
                    files::Kind::Conflict => Rejection::WriteConflict,
                    files::Kind::Busy => Rejection::Busy,
                    _ => Rejection::Io,
                },
            },
        };
        self.record_removal(EventKind::RemovalFinished {
            request: request.request,
            outcome,
        });
        drop(registry);
        drop(lease);
        self.publish();
    }
}

#[cfg(test)]
#[path = "ownership_tests.rs"]
mod tests;
