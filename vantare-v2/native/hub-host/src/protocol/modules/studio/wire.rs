use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "studio.get")]
    StudioGet {},
    #[serde(rename = "studio.visibility")]
    StudioVisibility {
        id: String,
        visible: bool,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.add")]
    StudioAdd {
        kind: crate::studio::WidgetKind,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            deserialize_with = "crate::studio::geometry::optional_point"
        )]
        #[cfg_attr(any(test, feature = "bindings"), ts(optional))]
        at: Option<crate::studio::Point>,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.duplicate")]
    StudioDuplicate {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.remove")]
    StudioRemove {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.instance")]
    StudioInstance {
        id: String,
        patch: crate::studio::InstancePatch,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.geometry")]
    StudioGeometry {
        id: String,
        change: crate::studio::GeometryChange,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.canvas")]
    StudioCanvas {
        resolution: crate::studio::CanvasChoice,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.undo")]
    StudioUndo {
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.redo")]
    StudioRedo {
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "studio.track")]
    StudioTrack { show: bool },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "studio.geometry")]
    StudioGeometry { value: crate::studio::StudioView },
    #[serde(rename = "studio.canvas")]
    StudioCanvas { value: crate::studio::StudioView },
    #[serde(rename = "studio.get")]
    StudioGet { value: crate::studio::StudioView },
    #[serde(rename = "studio.visibility")]
    StudioVisibility { value: crate::studio::StudioView },
    #[serde(rename = "studio.add")]
    StudioAdd {
        value: crate::studio::StudioView,
        added: String,
    },
    #[serde(rename = "studio.duplicate")]
    StudioDuplicate {
        value: crate::studio::StudioView,
        added: String,
    },
    #[serde(rename = "studio.remove")]
    StudioRemove { value: crate::studio::StudioView },
    #[serde(rename = "studio.instance")]
    StudioInstance { value: crate::studio::StudioView },
    #[serde(rename = "studio.undo")]
    StudioUndo { value: crate::studio::StudioView },
    #[serde(rename = "studio.redo")]
    StudioRedo { value: crate::studio::StudioView },
    #[serde(rename = "studio.track")]
    StudioTrack { value: crate::studio::StudioView },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    StudioConflict { current: crate::studio::StudioView },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum Topic {
    Studio,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Studio { value: crate::studio::StudioView },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
