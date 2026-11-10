//! Owned wire variants. The build assembles the closed transport enums.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, PartialOrd, Ord, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Topic {
    Updates,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "updates.get")]
    UpdatesGet {},
    #[serde(rename = "updates.restart")]
    UpdatesRestart {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
#[allow(
    clippy::large_enum_variant,
    reason = "ts-rs declarations mirror the wire; runtime uses the separately assembled Reply enum"
)]
pub enum Reply {
    #[serde(rename = "updates.get")]
    UpdatesGet { value: crate::updates::UpdatesView },
    #[serde(rename = "updates.restart")]
    UpdatesRestart { accepted: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Updates {
        value: Box<crate::updates::UpdatesView>,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
