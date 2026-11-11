use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "triage.prepare")]
    TriagePrepare {
        selection: crate::triage::TriageSelection,
        consent: bool,
    },
    #[serde(rename = "triage.send")]
    TriageSend {
        #[serde(rename = "previewId")]
        preview_id: String,
        consent: bool,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "triage.prepare")]
    TriagePrepare { value: crate::triage::TriagePreview },
    #[serde(rename = "triage.send")]
    TriageSend { value: crate::testing::TestingView },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
