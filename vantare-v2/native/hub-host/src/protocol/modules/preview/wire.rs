use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "preview.render")]
    PreviewRender {
        target: crate::preview::PreviewTarget,
        scene: crate::preview::PreviewScene,
        scale: crate::preview::PreviewScale,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "preview.render")]
    PreviewRender { value: crate::preview::PreviewImage },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    PreviewFailed {
        reason: crate::preview::PreviewError,
    },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
