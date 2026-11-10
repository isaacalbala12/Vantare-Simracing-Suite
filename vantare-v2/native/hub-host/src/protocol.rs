//! UI views only: no service credentials, raw Policy or telemetry DTO on this wire.
use crate::settings::model::{Palette, Scheme};
use crate::settings::{SettingsPatch, SettingsView};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg(any(test, feature = "bindings"))]
pub mod bindings;
pub const METHODS: &[&str] = &[
    "testing.answer",
    "testing.contribute",
    "testing.credit",
    "testing.noticeRead",
    "report.capture",
    "report.removeScreenshot",
    "report.prepare",
    "report.retryPrepare",
    "report.send",
    "testing.refresh",
    "draft.load",
    "draft.save",
    "draft.discard",
    "roadmap.cached",
    "roadmap.refresh",
    "pilot.load",
    "pilot.save",
    "privacy.policy",
    "privacy.get",
    "privacy.update",
    "mail.get",
    "mail.set",
    "diagnostics.get",
    "diagnostics.prepare",
    "diagnostics.copy",
    "core.get",
    "shortcuts.get",
    "updates.get",
    "updates.restart",
    "window.close",
    "settings.get",
    "settings.update",
    "settings.retry",
    "settings.discard",
    "launcher.favorite",
    "launcher.get",
    "launcher.catalog",
    "launcher.scan",
    "launcher.app.get",
    "launcher.app.pick",
    "launcher.app.save",
    "launcher.app.remove",
    "launcher.app.favorite",
    "launcher.profile.delete",
    "launcher.profile.duplicate",
    "launcher.profile.favorite",
    "launcher.profile.option",
    "launcher.trigger",
    "launcher.profile.get",
    "launcher.profile.save",
    "launcher.launch",
    "notifications.test",
];
pub const TOPICS: &[&str] = &["core", "simStatus", "updates", "launcher"];
pub const VERSION: u32 = 6;
pub const REQUEST_TIMEOUT_MS: u32 = 45_000;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeBoot {
    pub palette: Palette,
    pub scheme: Scheme,
    pub window: String,
    pub sidebar: String,
    pub text1: String,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowBoot {
    pub zoom: u16,
    pub width: u16,
    pub height: u16,
    pub minimized: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkState {
    Connected,
    Incompatible,
    #[default]
    Unavailable,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
// Independent capabilities copied only from a fresh core Policy.
#[allow(clippy::struct_excessive_bools)]
pub struct AccessView {
    pub verified: bool,
    pub blocked: bool,
    pub tester: bool,
    pub calendar: bool,
    pub engineer: bool,
    pub strategy: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoreStatus {
    pub photos: LinkState,
    pub rights: LinkState,
    pub services: LinkState,
    pub access: AccessView,
    pub live: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(PartialOrd, Ord)]
pub enum Topic {
    Launcher,
    Updates,
    Core,
    SimStatus,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "testing.answer")]
    TestingAnswer { id: String, score: u8 },
    #[serde(rename = "testing.contribute")]
    TestingContribute { id: String, consent: bool },
    #[serde(rename = "testing.credit")]
    TestingCredit { id: String, consent: bool },
    #[serde(rename = "testing.noticeRead")]
    TestingNoticeRead {
        id: String,
        #[serde(rename = "updatedAt")]
        updated_at: String,
    },
    #[serde(rename = "report.capture")]
    ReportCapture {
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "report.removeScreenshot")]
    ReportRemoveScreenshot {
        id: String,
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "report.prepare")]
    ReportPrepare {},
    #[serde(rename = "report.retryPrepare")]
    ReportRetryPrepare {},
    #[serde(rename = "report.send")]
    ReportSend {
        #[serde(rename = "previewId")]
        preview_id: String,
        consent: bool,
    },

    #[serde(rename = "testing.refresh")]
    TestingRefresh {},
    #[serde(rename = "draft.load")]
    DraftLoad {},
    #[serde(rename = "draft.save")]
    DraftSave {
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "draft.discard")]
    DraftDiscard {},

    #[serde(rename = "roadmap.cached")]
    RoadmapCached {},
    #[serde(rename = "roadmap.refresh")]
    RoadmapRefresh {},
    #[serde(rename = "launcher.catalog")]
    LauncherCatalog {},
    #[serde(rename = "launcher.scan")]
    LauncherScan {},
    #[serde(rename = "launcher.app.get")]
    LauncherAppGet { id: Option<String> },
    #[serde(rename = "launcher.app.pick")]
    LauncherAppPick {},
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
    #[serde(rename = "pilot.load")]
    PilotLoad {},
    #[serde(rename = "pilot.save")]
    PilotSave {
        fields: crate::pilot::PilotFields,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "privacy.policy")]
    PrivacyPolicy {},
    #[serde(rename = "privacy.get")]
    PrivacyGet {},
    #[serde(rename = "privacy.update")]
    PrivacyUpdate {
        patch: crate::privacy::PrivacyPatch,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "mail.get")]
    MailGet {},
    #[serde(rename = "mail.set")]
    MailSet { consent: bool },
    #[serde(rename = "diagnostics.get")]
    DiagnosticsGet {},
    #[serde(rename = "diagnostics.prepare")]
    DiagnosticsPrepare {},
    #[serde(rename = "diagnostics.copy")]
    DiagnosticsCopy {},
    #[serde(rename = "core.get")]
    CoreGet {},
    #[serde(rename = "shortcuts.get")]
    ShortcutsGet {},
    #[serde(rename = "updates.get")]
    UpdatesGet {},
    #[serde(rename = "updates.restart")]
    UpdatesRestart {},
    #[serde(rename = "window.close")]
    WindowClose {},
    #[serde(rename = "settings.get")]
    SettingsGet {},
    #[serde(rename = "settings.update")]
    SettingsUpdate {
        patch: SettingsPatch,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "settings.retry")]
    SettingsRetry {},
    #[serde(rename = "settings.discard")]
    SettingsDiscard {},
    #[serde(rename = "launcher.favorite")]
    LauncherFavorite {},
    #[serde(rename = "notifications.test")]
    NotificationTest {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "testing.answer")]
    TestingAnswer { value: crate::testing::TestingView },
    #[serde(rename = "testing.contribute")]
    TestingContribute { value: crate::testing::TestingView },
    #[serde(rename = "testing.credit")]
    TestingCredit { value: crate::testing::TestingView },
    #[serde(rename = "testing.noticeRead")]
    TestingNoticeRead { value: crate::testing::TestingView },
    #[serde(rename = "report.capture")]
    ReportCapture {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "report.removeScreenshot")]
    ReportRemoveScreenshot {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "report.prepare")]
    ReportPrepare {
        value: crate::testing::ReportPreviewView,
    },
    #[serde(rename = "report.retryPrepare")]
    ReportRetryPrepare {
        value: crate::testing::ReportPreviewView,
    },
    #[serde(rename = "report.send")]
    ReportSend {
        value: crate::testing::ReportReceiptView,
    },

    #[serde(rename = "testing.refresh")]
    TestingRefresh { value: crate::testing::TestingView },
    #[serde(rename = "draft.load")]
    DraftLoad {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "draft.save")]
    DraftSave {
        value: crate::testing::ReportDraftView,
    },
    #[serde(rename = "draft.discard")]
    DraftDiscard {
        value: crate::testing::ReportDraftView,
    },

    #[serde(rename = "roadmap.cached")]
    RoadmapCached { value: crate::roadmap::RoadmapView },
    #[serde(rename = "roadmap.refresh")]
    RoadmapRefresh { value: crate::roadmap::RoadmapView },
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
    #[serde(rename = "pilot.load")]
    PilotLoad { value: crate::pilot::PilotView },
    #[serde(rename = "pilot.save")]
    PilotSave { value: crate::pilot::PilotView },
    #[serde(rename = "privacy.policy")]
    PrivacyPolicy { accepted: bool },
    #[serde(rename = "privacy.get")]
    PrivacyGet { value: crate::privacy::PrivacyView },
    #[serde(rename = "privacy.update")]
    PrivacyUpdate { value: crate::privacy::PrivacyView },
    #[serde(rename = "mail.get")]
    MailGet { value: crate::privacy::MailView },
    #[serde(rename = "mail.set")]
    MailSet { value: crate::privacy::MailView },
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
    #[serde(rename = "updates.get")]
    UpdatesGet { value: crate::updates::UpdatesView },
    #[serde(rename = "updates.restart")]
    UpdatesRestart { accepted: bool },
    #[serde(rename = "core.get")]
    Core { value: CoreStatus },
    #[serde(rename = "shortcuts.get")]
    ShortcutsGet {
        value: crate::shortcuts::ShortcutsView,
    },
    #[serde(rename = "settings.get")]
    SettingsGet { value: SettingsView },
    #[serde(rename = "settings.update")]
    SettingsUpdate { value: SettingsView },
    #[serde(rename = "settings.retry")]
    SettingsRetry { value: SettingsView },
    #[serde(rename = "settings.discard")]
    SettingsDiscard { value: SettingsView },
    #[serde(rename = "launcher.favorite")]
    LauncherFavorite { accepted: bool },
    #[serde(rename = "notifications.test")]
    NotificationTest { accepted: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    Rejected,
    LauncherConflict {
        current: crate::launcher::LauncherView,
    },
    Busy,
    CoreUnavailable,
    Unsupported,
    Incompatible {
        expected: u32,
        found: u32,
    },
    Denied,
    Conflict {
        current: SettingsView,
    },
    PrivacyConflict {
        current: crate::privacy::PrivacyView,
    },
    PrivacyCleanup {
        current: crate::privacy::PrivacyView,
    },
    Protected,
    Io,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CloseReason {
    Restart,
    Window,
    Live,
    ControlEof,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Launcher {
        value: crate::launcher::LauncherView,
    },
    Updates {
        value: Box<crate::updates::UpdatesView>,
    },
    Core {
        value: CoreStatus,
    },
    SimStatus {
        live: bool,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostToUi {
    Hello {
        version: u32,
        theme: ThemeBoot,
        window: WindowBoot,
        demo: bool,
    },
    Response {
        id: u32,
        result: Reply,
    },
    Failure {
        id: u32,
        error: HostError,
    },
    Event {
        event: Event,
    },
    CloseRequested {
        reason: CloseReason,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum UiToHost {
    PickedExecutable { id: u32, path: Option<String> },
    Hello { version: u32 },
    Request { id: u32, request: Request },
    Subscribe { topic: Topic },
    Unsubscribe { topic: Topic },
    Ready {},
    CloseAnswer { allow: bool },
}
pub fn hello(settings: &SettingsView) -> std::io::Result<HostToUi> {
    let tokens: serde_json::Value =
        serde_json::from_str(include_str!("../../../hub-web/design/tokens.json"))
            .map_err(|_| std::io::ErrorKind::InvalidData)?;
    let palette = serde_json::to_value(settings.appearance.palette)
        .map_err(|_| std::io::ErrorKind::InvalidData)?;
    let palette = palette.as_str().ok_or(std::io::ErrorKind::InvalidData)?;
    let scheme = if settings.appearance.scheme == Scheme::Light {
        "light"
    } else {
        "dark"
    };
    let colors = &tokens["themes"][palette][scheme];
    let color = |key: &str| {
        colors[key]
            .as_str()
            .map(str::to_owned)
            .ok_or(std::io::ErrorKind::InvalidData)
    };
    let interactive = std::env::var_os("VANTARE_INTERACTIVE_STARTUP").is_some();
    let background = std::env::var_os("VANTARE_BACKGROUND_STARTUP").is_some();
    Ok(HostToUi::Hello {
        version: VERSION,
        theme: ThemeBoot {
            palette: settings.appearance.palette,
            scheme: settings.appearance.scheme,
            window: color("bg-window")?,
            sidebar: color("bg-sidebar")?,
            text1: color("text-1")?,
        },
        window: WindowBoot {
            width: 1440,
            height: 900,
            zoom: settings.zoom,
            minimized: settings.general.minimized && (!interactive || background),
        },
        demo: false,
    })
}
#[cfg(any(test, feature = "bindings"))]
pub fn typescript() -> String {
    bindings::typescript()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bindings_match_rust_contract() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../hub-web/src/contract/generated/contract.ts");
        assert_eq!(
            std::fs::read_to_string(path).expect("generate contract first"),
            typescript(),
            "run export-types example and commit generated TypeScript"
        );
    }
    #[test]
    fn scene_matches_strict_host_hello() {
        let scene = include_str!("../../../hub-web/fixtures/ajustes-base.json");
        let hello: HostToUi = serde_json::from_str(scene).expect("valid mock fixture");
        assert!(matches!(
            hello,
            HostToUi::Hello {
                version: VERSION,
                demo: true,
                ..
            }
        ));
    }
    #[test]
    fn unknown_fields_and_methods_are_rejected() {
        for value in [
            r#"{"kind":"ready","extra":true}"#,
            r#"{"kind":"request","id":1,"request":{"method":"core.get","extra":true}}"#,
            r#"{"kind":"hello","version":1,"extra":true}"#,
            r#"{"kind":"request","id":1,"request":{"method":"arbitrary"}}"#,
        ] {
            assert!(serde_json::from_str::<UiToHost>(value).is_err());
        }
    }
}
