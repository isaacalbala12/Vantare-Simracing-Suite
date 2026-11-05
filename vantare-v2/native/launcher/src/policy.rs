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
    #[serde(rename = "close-started")]
    Started,
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

/// Los controles rápidos conservan los espejos que no cambiaban antes del paso 4.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LegacyFields {
    All,
    Changed,
}

impl super::Profile {
    pub(crate) fn normalize_policy(&mut self) {
        if self.policy.is_none() {
            self.policy = Some(self.effective_policy());
            self.policy_was_implicit = true;
        }
    }

    pub(crate) fn restore_legacy_policy(&mut self) {
        if std::mem::take(&mut self.policy_was_implicit) {
            self.policy = None;
        }
    }

    pub fn set_policy(&mut self, policy: Policy, legacy: LegacyFields) {
        let previous = self.effective_policy();
        let sync = |changed| legacy == LegacyFields::All || changed;
        if sync(previous.first_step_delay != policy.first_step_delay) {
            self.first_step_delay = policy.first_step_delay;
        }
        if sync(previous.max_retries != policy.max_retries) {
            self.max_retries = policy.max_retries;
        }
        if sync(previous.already_running != policy.already_running) {
            self.reuse_running = policy.already_running == Running::Reuse;
        }
        if sync(previous.failure != policy.failure) {
            self.continue_on_error = policy.failure == Failure::Continue;
        }
        self.policy = Some(policy);
        self.policy_was_implicit = false;
    }

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
