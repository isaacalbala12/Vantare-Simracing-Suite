//! UI views only: no service credentials, raw Policy or telemetry DTO on this wire.
use crate::settings::model::{Palette, Scheme};
use crate::settings::{SettingsPatch, SettingsView};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg(any(test, feature = "bindings"))]
pub mod bindings;
include!(concat!(env!("OUT_DIR"), "/wire.rs"));
pub const VERSION: u32 = 18;
pub const DEMO_NAME_LIMIT: usize = 128;
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
pub enum CloseReason {
    Restart,
    Window,
    Live,
    ControlEof,
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
        #[serde(rename = "demoName")]
        demo_name: Option<String>,
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
    PickedExecutable(crate::launcher::apps::ExecutableSelection),
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
        demo_name: None,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
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
