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
