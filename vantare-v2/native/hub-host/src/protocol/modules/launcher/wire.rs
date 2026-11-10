//! Owned wire variants. The build assembles the closed transport enums.
use super::super::*;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "launcher.favorite")]
    LauncherFavorite {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "launcher.favorite")]
    LauncherFavorite { accepted: bool },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
