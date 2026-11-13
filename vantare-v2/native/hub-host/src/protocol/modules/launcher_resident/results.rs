//! Closed step projection and retry writer; indices always originate in the resident.
use super::control::{observation, rejected as reject, status};
use super::{ResidentOutcome, ResidentQueued};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{
    account_session::AccountObservation,
    launcher::{self as native, results as wire},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentStepState {
    NotSelected,
    Pending,
    Waiting,
    Launching,
    Ready,
    Failed,
    Cancelled,
    NotRun,
}
impl ResidentStepState {
    pub const ALL: [Self; 8] = [
        Self::NotSelected,
        Self::Pending,
        Self::Waiting,
        Self::Launching,
        Self::Ready,
        Self::Failed,
        Self::Cancelled,
        Self::NotRun,
    ];
}
impl From<wire::StepState> for ResidentStepState {
    fn from(value: wire::StepState) -> Self {
        match value {
            wire::StepState::NotSelected => Self::NotSelected,
            wire::StepState::Pending => Self::Pending,
            wire::StepState::Waiting => Self::Waiting,
            wire::StepState::Launching => Self::Launching,
            wire::StepState::Ready => Self::Ready,
            wire::StepState::Failed => Self::Failed,
            wire::StepState::Cancelled => Self::Cancelled,
            wire::StepState::NotRun => Self::NotRun,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentStepResult {
    pub index: u16,
    pub state: ResidentStepState,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentRunMode {
    Profile,
    Rehearsal,
}
impl ResidentRunMode {
    pub const ALL: [Self; 2] = [Self::Profile, Self::Rehearsal];
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentRetryScope {
    Failed,
    All,
}
impl ResidentRetryScope {
    pub const ALL: [Self; 2] = [Self::Failed, Self::All];
}
impl From<ResidentRetryScope> for wire::RetryScope {
    fn from(value: ResidentRetryScope) -> Self {
        match value {
            ResidentRetryScope::Failed => Self::Failed,
            ResidentRetryScope::All => Self::All,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentRunResults {
    pub run: String,
    pub profile: String,
    pub revision: String,
    pub account_generation: String,
    pub mode: ResidentRunMode,
    pub outcome: Option<ResidentOutcome>,
    pub steps: Vec<ResidentStepResult>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentResults {
    Unsupported,
    Unknown,
    Known { value: Box<ResidentRunResults> },
}
impl From<&wire::RunResults> for ResidentRunResults {
    fn from(value: &wire::RunResults) -> Self {
        Self {
            run: value.run.into(),
            profile: value.profile.clone(),
            revision: value.revision.clone(),
            account_generation: value.account.clone().into(),
            mode: match value.mode {
                wire::RunMode::Profile => ResidentRunMode::Profile,
                wire::RunMode::Rehearsal => ResidentRunMode::Rehearsal,
            },
            outcome: value.outcome.map(ResidentOutcome::from),
            steps: value
                .steps
                .iter()
                .map(|step| ResidentStepResult {
                    index: step.index,
                    state: step.state.into(),
                })
                .collect(),
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentRetryTarget {
    pub instance: String,
    pub account_generation: String,
    pub run: String,
    pub profile: String,
    pub revision: String,
    pub scope: ResidentRetryScope,
}

pub(crate) fn retry(
    path: &Path,
    current: Option<&AccountObservation>,
    target: &ResidentRetryTarget,
) -> Result<ResidentQueued, HostError> {
    let (status, instance) = status(
        path,
        &target.instance,
        native::execution::Capability::StepResultsRetry,
    )?;
    let (current, account) = observation(current, &target.account_generation)?;
    if !vantare_ipc::control::wall_ms().is_ok_and(|now| current.policy.permits_launch(now)) {
        return Err(reject(native::control::OrderRejection::Denied));
    }
    if status.running {
        return Err(reject(native::control::OrderRejection::Busy));
    }
    let extension = status.extension.ok_or(HostError::Unsupported)?;
    let summary = extension
        .results
        .as_ref()
        .ok_or_else(|| reject(native::control::OrderRejection::UnknownRun))?;
    let run = target
        .run
        .clone()
        .try_into()
        .map_err(|_| HostError::Denied)?;
    if summary.run != run
        || summary.profile != target.profile
        || !summary
            .outcome
            .is_some_and(|outcome| extension.has_retained_terminal(run, outcome))
    {
        return Err(reject(native::control::OrderRejection::UnknownRun));
    }
    if summary.account != account {
        return Err(reject(native::control::OrderRejection::AccountChanged));
    }
    if summary.revision != target.revision {
        return Err(reject(native::control::OrderRejection::RevisionMismatch));
    }
    let (bytes, document) = crate::launcher::open(path)?.ok_or(HostError::Protected)?;
    if vantare_services::content_hash(&bytes) != target.revision {
        return Err(HostError::LauncherConflict {
            current: crate::launcher::read(path),
        });
    }
    if !document
        .profiles
        .iter()
        .any(|profile| profile.id == target.profile && !profile.steps.is_empty())
    {
        return Err(reject(native::control::OrderRejection::DocumentUnavailable));
    }
    if target.scope == ResidentRetryScope::Failed
        && !summary
            .steps
            .iter()
            .any(|step| step.state == wire::StepState::Failed)
    {
        return Err(reject(native::control::OrderRejection::NoFailedSteps));
    }
    super::order_mailbox::enqueue(path, |request| {
        native::Request::RetryChecked(wire::RetryChecked {
            request,
            instance,
            account,
            run,
            profile: target.profile.clone(),
            revision: target.revision.clone(),
            scope: target.scope.into(),
        })
    })
}

#[cfg(test)]
#[path = "results_tests.rs"]
mod tests;
