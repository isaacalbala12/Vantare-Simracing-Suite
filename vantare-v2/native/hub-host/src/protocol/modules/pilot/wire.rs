//! Owned wire variants. The build assembles the closed transport enums.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "pilot.load")]
    PilotLoad {},
    #[serde(rename = "pilot.save")]
    PilotSave {
        fields: crate::pilot::PilotFields,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "pilot.load")]
    PilotLoad { value: crate::pilot::PilotView },
    #[serde(rename = "pilot.save")]
    PilotSave { value: crate::pilot::PilotView },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
