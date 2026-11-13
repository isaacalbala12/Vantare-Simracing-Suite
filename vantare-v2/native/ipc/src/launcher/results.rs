//! Bounded current-run summary. Step transitions never occupy the event ring.
use super::{
    RequestId,
    execution::{ChainOutcome, ResidentInstance, RunId},
};
use crate::account_session::AccountGeneration;
use serde::{Deserialize, Serialize};

pub const STEP_LIMIT: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum StepState {
    NotSelected,
    Pending,
    Waiting,
    Launching,
    Ready,
    Failed,
    Cancelled,
    NotRun,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StepResult {
    pub index: u16,
    pub state: StepState,
}

/// The original selection survives failed-only retries, including a rehearsal.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RunMode {
    Profile,
    Rehearsal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RetryScope {
    Failed,
    All,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunResults {
    pub run: RunId,
    #[serde(deserialize_with = "super::checked::profile")]
    pub profile: String,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
    pub account: AccountGeneration,
    pub mode: RunMode,
    pub outcome: Option<ChainOutcome>,
    pub steps: Vec<StepResult>,
}
impl RunResults {
    pub(super) fn valid(&self) -> bool {
        !self.steps.is_empty()
            && self.steps.len() <= STEP_LIMIT
            && (self.outcome.is_none()
                || self.steps.iter().all(|step| {
                    !matches!(
                        step.state,
                        StepState::Pending | StepState::Waiting | StepState::Launching
                    )
                }))
            && (self.outcome != Some(ChainOutcome::Completed)
                || self
                    .steps
                    .iter()
                    .all(|step| matches!(step.state, StepState::Ready | StepState::NotSelected)))
            && self
                .steps
                .iter()
                .enumerate()
                .all(|(index, step)| usize::from(step.index) == index)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RetryChecked {
    pub request: RequestId,
    pub instance: ResidentInstance,
    pub account: AccountGeneration,
    pub run: RunId,
    #[serde(deserialize_with = "super::checked::profile")]
    pub profile: String,
    #[serde(deserialize_with = "super::checked::revision")]
    pub revision: String,
    pub scope: RetryScope,
}
