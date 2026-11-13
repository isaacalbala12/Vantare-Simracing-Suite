//! Projection is scoped by the host's authenticated account observation. The
//! resident registry itself covers its handles across accounts, never GPUI.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{
    account_session::AccountObservation,
    launcher::{self as native, ownership as wire},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentProfileOwnership {
    pub profile: String,
    pub owned_live: bool,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentOwnership {
    Unsupported,
    #[default]
    Unknown,
    Known {
        instance: String,
        #[serde(rename = "accountGeneration")]
        account_generation: String,
        revision: String,
        profiles: Vec<ResidentProfileOwnership>,
    },
}
pub(super) fn project(
    extension: Option<&native::execution::ExecutionStatus>,
    current: Option<&AccountObservation>,
    now: u64,
) -> ResidentOwnership {
    let Some(extension) = extension.filter(|e| {
        e.capabilities
            .contains(&native::execution::Capability::LiveProfileOwnership)
    }) else {
        return ResidentOwnership::Unsupported;
    };
    let Some(current) = current.filter(|o| o.policy.permits_launch(now)) else {
        return ResidentOwnership::Unknown;
    };
    match &extension.ownership {
        Some(wire::Ownership::Known { revision, profiles }) => ResidentOwnership::Known {
            instance: extension.instance.clone().into(),
            account_generation: current.generation.clone().into(),
            revision: revision.clone(),
            profiles: profiles
                .iter()
                .map(|p| ResidentProfileOwnership {
                    profile: p.profile.clone(),
                    owned_live: p.owned_live,
                })
                .collect(),
        },
        _ => ResidentOwnership::Unknown,
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentRemovalRejection {
    WrongInstance,
    AccountChanged,
    AuthorityUnavailable,
    Denied,
    Busy,
    RevisionMismatch,
    DocumentUnavailable,
    OwnershipUnknown,
    OwnedLive,
    WriteConflict,
    Io,
}
impl ResidentRemovalRejection {
    pub const ALL: [Self; 11] = [
        Self::WrongInstance,
        Self::AccountChanged,
        Self::AuthorityUnavailable,
        Self::Denied,
        Self::Busy,
        Self::RevisionMismatch,
        Self::DocumentUnavailable,
        Self::OwnershipUnknown,
        Self::OwnedLive,
        Self::WriteConflict,
        Self::Io,
    ];
}
impl From<wire::RemovalRejection> for ResidentRemovalRejection {
    fn from(value: wire::RemovalRejection) -> Self {
        match value {
            wire::RemovalRejection::WrongInstance => Self::WrongInstance,
            wire::RemovalRejection::AccountChanged => Self::AccountChanged,
            wire::RemovalRejection::AuthorityUnavailable => Self::AuthorityUnavailable,
            wire::RemovalRejection::Denied => Self::Denied,
            wire::RemovalRejection::Busy => Self::Busy,
            wire::RemovalRejection::RevisionMismatch => Self::RevisionMismatch,
            wire::RemovalRejection::DocumentUnavailable => Self::DocumentUnavailable,
            wire::RemovalRejection::OwnershipUnknown => Self::OwnershipUnknown,
            wire::RemovalRejection::OwnedLive => Self::OwnedLive,
            wire::RemovalRejection::WriteConflict => Self::WriteConflict,
            wire::RemovalRejection::Io => Self::Io,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentRemovalReceipt {
    Accepted,
    Rejected { reason: ResidentRemovalRejection },
}
impl From<&wire::RemovalReceipt> for ResidentRemovalReceipt {
    fn from(value: &wire::RemovalReceipt) -> Self {
        match value {
            wire::RemovalReceipt::Accepted => Self::Accepted,
            wire::RemovalReceipt::Rejected { reason } => Self::Rejected {
                reason: (*reason).into(),
            },
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentRemovalOutcome {
    Removed { revision: String },
    Failed { reason: ResidentRemovalRejection },
}
impl From<&wire::RemovalOutcome> for ResidentRemovalOutcome {
    fn from(value: &wire::RemovalOutcome) -> Self {
        match value {
            wire::RemovalOutcome::Removed { revision } => Self::Removed {
                revision: revision.clone(),
            },
            wire::RemovalOutcome::Failed { reason } => Self::Failed {
                reason: (*reason).into(),
            },
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentRemoveTarget {
    pub instance: String,
    pub account_generation: String,
    pub profile: String,
    pub revision: String,
}
fn rejected(reason: wire::RemovalRejection) -> HostError {
    HostError::ResidentRemovalRejected {
        reason: reason.into(),
    }
}
fn closed_error(error: HostError) -> HostError {
    match error {
        HostError::ResidentControlRejected {
            reason: super::ResidentOrderRejection::WrongInstance,
        } => rejected(wire::RemovalRejection::WrongInstance),
        HostError::ResidentControlRejected {
            reason: super::ResidentOrderRejection::AccountChanged,
        } => rejected(wire::RemovalRejection::AccountChanged),
        value => value,
    }
}
pub(crate) fn remove(
    path: &Path,
    current: Option<&AccountObservation>,
    target: &ResidentRemoveTarget,
) -> Result<super::ResidentQueued, HostError> {
    remove_with_clock(path, current, target, vantare_ipc::control::wall_ms)
}
fn remove_with_clock(
    path: &Path,
    current: Option<&AccountObservation>,
    target: &ResidentRemoveTarget,
    now: impl FnOnce() -> std::io::Result<u64>,
) -> Result<super::ResidentQueued, HostError> {
    let (status, instance) = super::control::status(
        path,
        &target.instance,
        native::execution::Capability::LiveProfileOwnership,
    )
    .map_err(closed_error)?;
    let (current, account) =
        super::control::observation(current, &target.account_generation).map_err(closed_error)?;
    if !now().is_ok_and(|now| current.policy.permits_launch(now)) {
        return Err(rejected(wire::RemovalRejection::Denied));
    }
    if status.running {
        return Err(rejected(wire::RemovalRejection::Busy));
    }
    let Some(wire::Ownership::Known { revision, profiles }) =
        status.extension.as_ref().and_then(|e| e.ownership.as_ref())
    else {
        return Err(rejected(wire::RemovalRejection::OwnershipUnknown));
    };
    if *revision != target.revision {
        return Err(rejected(wire::RemovalRejection::RevisionMismatch));
    }
    let profile = profiles
        .iter()
        .find(|p| p.profile == target.profile)
        .ok_or_else(|| rejected(wire::RemovalRejection::DocumentUnavailable))?;
    if profile.owned_live {
        return Err(rejected(wire::RemovalRejection::OwnedLive));
    }
    let (bytes, document) = crate::launcher::open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != target.revision {
        return Err(HostError::LauncherConflict {
            current: crate::launcher::read(path),
        });
    }
    if !document.profiles.iter().any(|p| p.id == target.profile) {
        return Err(rejected(wire::RemovalRejection::DocumentUnavailable));
    }
    super::order_mailbox::enqueue(path, |request| {
        native::Request::RemoveProfileChecked(wire::RemoveProfileChecked {
            request,
            instance,
            account,
            profile: target.profile.clone(),
            revision: target.revision.clone(),
        })
    })
}

#[cfg(test)]
#[path = "ownership_tests.rs"]
mod tests;
