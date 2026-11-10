//! UI views only: no service credentials, raw Policy or telemetry DTO on this wire.
use crate::settings::model::{
    AppearanceSettings, Density, InterfaceFont, MonoFont, Palette, Preferences, Scheme,
};
use crate::settings::{SettingsPatch, SettingsView, StartupView};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
pub const VERSION: u32 = 1;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeBoot {
    pub palette: Palette,
    pub scheme: Scheme,
    pub window: String,
    pub sidebar: String,
    pub text1: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowBoot {
    pub zoom: u16,
    pub width: u16,
    pub height: u16,
    pub minimized: bool,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum LinkState {
    Connected,
    Incompatible,
    #[default]
    Unavailable,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
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
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoreStatus {
    pub photos: LinkState,
    pub rights: LinkState,
    pub services: LinkState,
    pub access: AccessView,
    pub live: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum Topic {
    Core,
    SimStatus,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "core.get")]
    CoreGet {},
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "core.get")]
    Core { value: CoreStatus },
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    Busy,
    CoreUnavailable,
    Unsupported,
    Incompatible { expected: u32, found: u32 },
    Denied,
    Conflict { current: SettingsView },
    Protected,
    Io,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub enum CloseReason {
    Window,
    Live,
    ControlEof,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Core { value: CoreStatus },
    SimStatus { live: bool },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
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
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum UiToHost {
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
pub fn typescript() -> String {
    let mut text = String::from("// Generated by native/hub-host with ts-rs. Do not edit.\n");
    macro_rules! declaration {($($kind:ty),+)=>{$(text.push_str("export ");text.push_str(&<$kind>::decl(&ts_rs::Config::default()));text.push('\n');)+};}
    declaration!(
        Palette,
        Scheme,
        InterfaceFont,
        MonoFont,
        AppearanceSettings,
        Density,
        Preferences,
        StartupView,
        SettingsView,
        SettingsPatch,
        ThemeBoot,
        WindowBoot,
        LinkState,
        AccessView,
        CoreStatus,
        Topic,
        Request,
        Reply,
        HostError,
        CloseReason,
        Event,
        HostToUi,
        UiToHost
    );
    text.push_str("export const HOST_PROTOCOL_VERSION = 1 as const;\nexport const methods = ['core.get', 'window.close', 'settings.get', 'settings.update', 'settings.retry', 'settings.discard', 'launcher.favorite', 'notifications.test'] as const;\nexport const topics = ['core', 'simStatus'] as const;\n");
    macro_rules! constants {
        ($name:literal, $values:expr) => {
            text.push_str(concat!("export const ", $name, " = "));
            text.push_str(&serde_json::to_string(&$values).expect("serializable constants"));
            text.push_str(" as const;\n");
        };
    }
    constants!("palettes", Palette::ALL);
    constants!("schemes", [Scheme::System, Scheme::Light, Scheme::Dark]);
    constants!(
        "interfaceFonts",
        [
            InterfaceFont::Inter,
            InterfaceFont::Segoe,
            InterfaceFont::Arial
        ]
    );
    constants!(
        "monoFonts",
        [MonoFont::Cascadia, MonoFont::Consolas, MonoFont::Courier]
    );
    constants!(
        "densities",
        [Density::Compact, Density::Balanced, Density::Comfortable]
    );
    constants!(
        "settingsFields",
        [
            "density",
            "minimized",
            "updates",
            "launcher",
            "toasts",
            "palette",
            "scheme",
            "contrast",
            "glassOpacity",
            "interfaceFont",
            "monoFont",
            "reducedMotion",
            "zoom",
            "startup"
        ]
    );
    text.push_str("export const methodsCoverContract: Exclude<Request['method'], typeof methods[number]> extends never ? true : never = true;\nexport const fieldsCoverContract: Exclude<SettingsPatch['field'], typeof settingsFields[number]> extends never ? true : never = true;\n");
    text
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
