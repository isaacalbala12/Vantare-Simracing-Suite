//! Owned wire variants. The build assembles the closed transport enums.
use super::super::*;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "diagnostics.get")]
    DiagnosticsGet {},
    #[serde(rename = "diagnostics.prepare")]
    DiagnosticsPrepare {},
    #[serde(rename = "diagnostics.copy")]
    DiagnosticsCopy {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "diagnostics.get")]
    DiagnosticsGet {
        value: crate::diagnostics::DiagnosticView,
    },
    #[serde(rename = "diagnostics.prepare")]
    DiagnosticsPrepare {
        value: crate::diagnostics::DiagnosticView,
    },
    #[serde(rename = "diagnostics.copy")]
    DiagnosticsCopy { text: String },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
