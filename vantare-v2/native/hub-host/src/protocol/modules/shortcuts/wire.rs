//! Owned wire variants. The build assembles the closed transport enums.
use super::super::*;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "shortcuts.get")]
    ShortcutsGet {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "shortcuts.get")]
    ShortcutsGet {
        value: crate::shortcuts::ShortcutsView,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
