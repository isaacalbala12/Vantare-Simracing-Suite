//! Owned wire variants. The build assembles the closed transport enums.
use crate::protocol::{SettingsPatch, SettingsView};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "settings.get")]
    SettingsGet {},
    #[serde(rename = "settings.update")]
    SettingsUpdate {
        patch: SettingsPatch,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "settings.retry")]
    SettingsRetry {},
    #[serde(rename = "settings.discard")]
    SettingsDiscard {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "settings.get")]
    SettingsGet { value: SettingsView },
    #[serde(rename = "settings.update")]
    SettingsUpdate { value: SettingsView },
    #[serde(rename = "settings.retry")]
    SettingsRetry { value: SettingsView },
    #[serde(rename = "settings.discard")]
    SettingsDiscard { value: SettingsView },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    Conflict { current: SettingsView },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
