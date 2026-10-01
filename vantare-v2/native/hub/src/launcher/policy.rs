//! Vocabulario de las políticas Wails; los booleanos v1 siguen siendo legibles.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Running {
    #[default]
    Ask,
    Reuse,
    Restart,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Failure {
    #[default]
    Ask,
    Stop,
    Continue,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Close {
    #[default]
    Ask,
    Leave,
    CloseStarted,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Retry {
    #[default]
    Ask,
    Failed,
    All,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Policy {
    pub already_running: Running,
    pub failure: Failure,
    pub cancel: Close,
    pub exit: Close,
    pub retry: Retry,
    pub max_retries: u8,
    pub first_step_delay: u32,
}

impl super::Profile {
    pub fn effective_policy(&self) -> Policy {
        self.policy.clone().unwrap_or(Policy {
            already_running: if self.reuse_running {
                Running::Reuse
            } else {
                Running::Restart
            },
            failure: if self.continue_on_error {
                Failure::Continue
            } else {
                Failure::Stop
            },
            cancel: Close::Leave,
            exit: Close::Leave,
            retry: Retry::Failed,
            max_retries: self.max_retries,
            first_step_delay: self.first_step_delay,
        })
    }
}
