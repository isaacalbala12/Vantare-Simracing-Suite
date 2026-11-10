//! Platform window capabilities; Electron owns their execution and state.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "window.minimize")]
    WindowMinimize {},
    #[serde(rename = "window.toggleMaximize")]
    WindowToggleMaximize {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "window.minimize")]
    WindowMinimize { accepted: bool },
    #[serde(rename = "window.toggleMaximize")]
    WindowToggleMaximize { accepted: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, PartialOrd, Ord, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Topic {
    WindowState,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    WindowState { maximized: bool },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
