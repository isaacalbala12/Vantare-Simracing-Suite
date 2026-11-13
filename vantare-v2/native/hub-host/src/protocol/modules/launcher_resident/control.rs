//! Closed L54 writers. The resident validates the snapshot and applies cancellation.
use super::ResidentQueued;
use crate::protocol::HostError;
use native::{
    control::OrderRejection,
    execution::{Capability, ResidentInstance},
};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{
    account_session::{AccountGeneration, AccountObservation},
    launcher as native,
};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentOrderRejection {
    WrongInstance,
    AccountChanged,
    AuthorityUnavailable,
    Denied,
    RevisionMismatch,
    UnscopedRun,
    WrongRun,
    StaleQuestion,
    InvalidAction,
    TrustRequiresEditor,
    Unavailable,
    Busy,
    DocumentUnavailable,
    NoSteps,
    StartFailed,
}
impl ResidentOrderRejection {
    pub const ALL: [Self; 15] = [
        Self::WrongInstance,
        Self::AccountChanged,
        Self::AuthorityUnavailable,
        Self::Denied,
        Self::RevisionMismatch,
        Self::UnscopedRun,
        Self::WrongRun,
        Self::StaleQuestion,
        Self::InvalidAction,
        Self::TrustRequiresEditor,
        Self::Unavailable,
        Self::Busy,
        Self::DocumentUnavailable,
        Self::NoSteps,
        Self::StartFailed,
    ];
}
impl From<OrderRejection> for ResidentOrderRejection {
    fn from(value: OrderRejection) -> Self {
        match value {
            OrderRejection::WrongInstance => Self::WrongInstance,
            OrderRejection::AccountChanged => Self::AccountChanged,
            OrderRejection::AuthorityUnavailable => Self::AuthorityUnavailable,
            OrderRejection::Denied => Self::Denied,
            OrderRejection::RevisionMismatch => Self::RevisionMismatch,
            OrderRejection::UnscopedRun => Self::UnscopedRun,
            OrderRejection::WrongRun => Self::WrongRun,
            OrderRejection::StaleQuestion => Self::StaleQuestion,
            OrderRejection::InvalidAction => Self::InvalidAction,
            OrderRejection::TrustRequiresEditor => Self::TrustRequiresEditor,
            OrderRejection::Unavailable => Self::Unavailable,
            OrderRejection::Busy => Self::Busy,
            OrderRejection::DocumentUnavailable => Self::DocumentUnavailable,
            OrderRejection::NoSteps => Self::NoSteps,
            OrderRejection::StartFailed => Self::StartFailed,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentActiveRun {
    pub run: String,
    pub revision: String,
    pub account_generation: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentCancelTarget {
    pub instance: String,
    pub account_generation: String,
    pub run: String,
    pub revision: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentRehearseTarget {
    pub instance: String,
    pub account_generation: String,
    pub profile: String,
    pub revision: String,
}
fn rejected(reason: OrderRejection) -> HostError {
    HostError::ResidentControlRejected {
        reason: reason.into(),
    }
}
fn observation<'a>(
    current: Option<&'a AccountObservation>,
    captured: &str,
) -> Result<(&'a AccountObservation, AccountGeneration), HostError> {
    let current = current.ok_or(HostError::CoreUnavailable)?;
    let captured = captured
        .to_owned()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if current.generation != captured {
        return Err(rejected(OrderRejection::AccountChanged));
    }
    Ok((current, captured))
}
fn status(path: &Path, instance: &str) -> Result<(native::Status, ResidentInstance), HostError> {
    if path.is_absolute() && !vantare_launcher::is_local_path(path) {
        return Err(HostError::Denied);
    }
    // No fresh capability means this order is unsupported, regardless of account state.
    let status = native::read_status(path).ok_or(HostError::Unsupported)?;
    let extension = status.extension.as_ref().ok_or(HostError::Unsupported)?;
    if !extension.capabilities.contains(&Capability::CheckedControl) {
        return Err(HostError::Unsupported);
    }
    let instance = instance
        .to_owned()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if extension.instance != instance {
        return Err(rejected(OrderRejection::WrongInstance));
    }
    Ok((status, instance))
}
pub(crate) fn cancel(
    path: &Path,
    current: Option<&AccountObservation>,
    target: &ResidentCancelTarget,
) -> Result<ResidentQueued, HostError> {
    let (status, instance) = status(path, &target.instance)?;
    let (current, account) = observation(current, &target.account_generation)?;
    if !status.running {
        return Err(rejected(OrderRejection::WrongRun));
    }
    let active = status
        .extension
        .and_then(|e| e.active)
        .ok_or_else(|| rejected(OrderRejection::UnscopedRun))?;
    let run = target
        .run
        .clone()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if active.run != run {
        return Err(rejected(OrderRejection::WrongRun));
    }
    if active.account != account {
        return Err(rejected(OrderRejection::AccountChanged));
    }
    if active.revision != target.revision {
        return Err(rejected(OrderRejection::RevisionMismatch));
    }
    if !vantare_ipc::control::wall_ms().is_ok_and(|now| {
        native::answer::permits_answer(&current.policy, native::Action::Cancel, now)
    }) {
        return Err(rejected(OrderRejection::Denied));
    }
    super::order_mailbox::enqueue(path, |request| {
        native::Request::CancelChecked(native::CancelChecked {
            request,
            instance,
            account,
            run,
            revision: active.revision,
        })
    })
}
pub(crate) fn rehearse(
    path: &Path,
    current: Option<&AccountObservation>,
    target: &ResidentRehearseTarget,
) -> Result<ResidentQueued, HostError> {
    let (status, instance) = status(path, &target.instance)?;
    let (current, account) = observation(current, &target.account_generation)?;
    if !vantare_ipc::control::wall_ms().is_ok_and(|now| current.policy.permits_launch(now)) {
        return Err(rejected(OrderRejection::Denied));
    }
    if status.running {
        return Err(rejected(OrderRejection::Busy));
    }
    if target.profile.is_empty()
        || target.profile.len() > native::checked::ID_LIMIT
        || target.profile.contains('\0')
    {
        return Err(HostError::Denied);
    }
    let (bytes, document) = crate::launcher::open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != target.revision {
        return Err(HostError::LauncherConflict {
            current: crate::launcher::read(path),
        });
    }
    let profile = document
        .profiles
        .iter()
        .find(|p| p.id == target.profile)
        .ok_or_else(|| rejected(OrderRejection::DocumentUnavailable))?;
    if !profile.steps.iter().any(|step| step.app_id != "lmu") {
        return Err(rejected(OrderRejection::NoSteps));
    }
    super::order_mailbox::enqueue(path, |request| {
        native::Request::RehearseChecked(native::RehearseChecked {
            request,
            instance,
            account,
            profile: target.profile.clone(),
            revision: target.revision.clone(),
        })
    })
}
#[cfg(test)]
#[path = "control_tests.rs"]
mod tests;
