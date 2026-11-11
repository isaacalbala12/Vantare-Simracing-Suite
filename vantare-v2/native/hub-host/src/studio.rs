//! Studio gallery contract. Geometry is intentionally absent from every edit.
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::Instant};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[path = "studio/catalog.rs"]
pub mod catalog;
pub use catalog::{WidgetInfo, WidgetKind};
pub const INSTANCE_LIMIT: usize = 256;
pub const HISTORY_LIMIT: usize = 50;
pub const OPACITY_MIN: u8 = 20;
pub const OPACITY_MAX: u8 = 100;
pub const ID_LIMIT: usize = 256;
pub const SIZE_LIMIT: u32 = 32768;
pub const LABEL_LIMIT: usize = 256;
pub const ABOUT_LIMIT: usize = 512;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StudioState {
    Missing,
    Protected,
    Ready,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StudioPlan {
    Unverified,
    Free,
    Launch,
    Pro,
    Founders,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum OffTrack {
    Inherit,
    AlwaysVisible,
    Hide,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShowIn {
    pub practice: bool,
    pub qualifying: bool,
    pub race: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OverlaySize {
    pub width: u32,
    pub height: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OverlayInstance {
    pub id: String,
    pub kind: WidgetKind,
    pub visible: bool,
    pub locked: bool,
    pub opacity: u8,
    pub show_in: ShowIn,
    pub off_track: OffTrack,
    pub size: OverlaySize,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StudioView {
    pub state: StudioState,
    pub revision: String,
    pub instances: Vec<OverlayInstance>,
    pub catalog: Vec<WidgetInfo>,
    pub showing: bool,
    pub plan: StudioPlan,
    pub can_undo: bool,
    pub can_redo: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(
    tag = "field",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum InstancePatch {
    Opacity(u8),
    ShowIn(ShowIn),
    OffTrack(OffTrack),
}
pub enum Edit {
    Visibility(String, bool),
    Add(WidgetKind),
    Remove(String),
    Instance(String, InstancePatch),
    Undo,
    Redo,
}
pub struct State {
    pub(crate) path: PathBuf,
    pub(crate) undo: Vec<Vec<u8>>,
    pub(crate) redo: Vec<Vec<u8>>,
    pub(crate) revision: Option<String>,
    last: Option<(Instant, StudioView)>,
}
impl State {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            undo: vec![],
            redo: vec![],
            revision: None,
            last: None,
        }
    }
    pub fn unavailable(
        state: StudioState,
        access: Option<vantare_ipc::control::CatalogAccess>,
    ) -> StudioView {
        StudioView {
            state,
            revision: "0".repeat(64),
            instances: vec![],
            catalog: WidgetKind::CATALOG.iter().map(|k| k.info(access)).collect(),
            showing: false,
            plan: plan(access),
            can_undo: false,
            can_redo: false,
        }
    }
    pub fn view(&mut self, access: Option<vantare_ipc::control::CatalogAccess>) -> StudioView {
        #[cfg(windows)]
        {
            crate::settings::studio::view(self, access)
        }
        #[cfg(not(windows))]
        {
            Self::unavailable(StudioState::Protected, access)
        }
    }
    pub fn edit(
        &mut self,
        edit: Edit,
        revision: &str,
        access: Option<vantare_ipc::control::CatalogAccess>,
    ) -> Result<StudioView, crate::protocol::HostError> {
        #[cfg(windows)]
        {
            crate::settings::studio::edit(self, edit, revision, access)
        }
        #[cfg(not(windows))]
        {
            let _ = (edit, revision, access);
            Err(crate::protocol::HostError::Protected)
        }
    }
    pub fn track(
        &mut self,
        show: bool,
        access: Option<vantare_ipc::control::CatalogAccess>,
    ) -> Result<StudioView, crate::protocol::HostError> {
        #[cfg(windows)]
        {
            crate::settings::studio::track(self, show, access)
        }
        #[cfg(not(windows))]
        {
            let _ = (show, access);
            Err(crate::protocol::HostError::Protected)
        }
    }
    pub fn changed(
        &mut self,
        subscribed: bool,
        now: Instant,
        access: Option<vantare_ipc::control::CatalogAccess>,
    ) -> Option<StudioView> {
        if !subscribed {
            self.last = None;
            return None;
        }
        if self
            .last
            .as_ref()
            .is_some_and(|(last, _)| now.saturating_duration_since(*last).as_millis() < 500)
        {
            return None;
        }
        let view = self.view(access);
        let changed = self.last.as_ref().is_none_or(|(_, last)| *last != view);
        self.last = Some((now, view.clone()));
        changed.then_some(view)
    }
}
fn plan(access: Option<vantare_ipc::control::CatalogAccess>) -> StudioPlan {
    use vantare_ipc::control::CatalogAccess as A;
    match access {
        None => StudioPlan::Unverified,
        Some(A::Free) => StudioPlan::Free,
        Some(A::LaunchV1) => StudioPlan::Launch,
        Some(A::Pro) => StudioPlan::Pro,
        Some(A::Founders) => StudioPlan::Founders,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn geometry_and_free_settings_are_absent_from_the_edit_contract() {
        for field in ["x", "y", "geometry", "size", "settings", "executable"] {
            let patch = serde_json::json!({"field":field,"value":1});
            let request = serde_json::json!({"kind":"request","id":1,"request":{"method":"studio.instance","id":"widget-1","patch":patch,"baseRevision":"0".repeat(64)}});
            assert!(serde_json::from_value::<crate::protocol::UiToHost>(request).is_err());
        }
    }
}
