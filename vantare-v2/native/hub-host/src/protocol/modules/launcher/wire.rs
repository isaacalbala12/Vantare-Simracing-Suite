//! Launcher-owned wire variants.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "launcher.catalog")]
    LauncherCatalog {},
    #[serde(rename = "launcher.scan")]
    LauncherScan {},
    #[serde(rename = "launcher.app.get")]
    LauncherAppGet { id: Option<String> },
    #[serde(rename = "launcher.app.pick")]
    LauncherAppPick { id: Option<String> },
    #[serde(rename = "launcher.app.save")]
    LauncherAppSave {
        draft: crate::launcher::apps::AppDraft,
        #[serde(rename = "pickToken")]
        pick_token: Option<String>,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.app.remove")]
    LauncherAppRemove {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.app.favorite")]
    LauncherAppFavorite {
        id: String,
        favorite: bool,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.profile.delete")]
    LauncherProfileDelete {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.profile.duplicate")]
    LauncherProfileDuplicate {
        id: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.profile.favorite")]
    LauncherProfileFavorite {
        id: String,
        favorite: bool,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.profile.option")]
    LauncherProfileOption {
        id: String,
        patch: crate::launcher::actions::ProfileOption,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.trigger")]
    LauncherTrigger {
        id: Option<String>,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.profile.get")]
    LauncherProfileGet { id: Option<String> },
    #[serde(rename = "launcher.profile.save")]
    LauncherProfileSave {
        draft: crate::launcher::editor::ProfileDraft,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.get")]
    LauncherGet {},
    #[serde(rename = "launcher.launch")]
    LauncherLaunch {
        profile: String,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "launcher.favorite")]
    LauncherFavorite {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "launcher.catalog")]
    LauncherCatalog {
        value: crate::launcher::apps::CatalogView,
    },
    #[serde(rename = "launcher.scan")]
    LauncherScan {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.app.get")]
    LauncherAppGet {
        value: crate::launcher::apps::AppEditor,
    },
    #[serde(rename = "launcher.app.pick")]
    LauncherAppPick {
        value: Option<crate::launcher::apps::PickedApp>,
    },
    #[serde(rename = "launcher.app.save")]
    LauncherAppSave {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.app.remove")]
    LauncherAppRemove {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.app.favorite")]
    LauncherAppFavorite {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.profile.delete")]
    LauncherProfileDelete {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.profile.duplicate")]
    LauncherProfileDuplicate {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.profile.favorite")]
    LauncherProfileFavorite {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.profile.option")]
    LauncherProfileOption {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.trigger")]
    LauncherTrigger {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.profile.get")]
    LauncherProfileGet {
        value: crate::launcher::editor::ProfileEditorView,
    },
    #[serde(rename = "launcher.profile.save")]
    LauncherProfileSave {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.get")]
    LauncherGet {
        value: crate::launcher::LauncherView,
    },
    #[serde(rename = "launcher.launch")]
    LauncherLaunch { accepted: bool },
    #[serde(rename = "launcher.favorite")]
    LauncherFavorite { accepted: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    LauncherConflict {
        current: crate::launcher::LauncherView,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(PartialOrd, Ord)]
pub enum Topic {
    Launcher,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Launcher {
        value: crate::launcher::LauncherView,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
