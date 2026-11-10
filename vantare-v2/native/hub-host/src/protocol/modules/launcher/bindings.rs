use crate::protocol::bindings::{canonical, declare};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::launcher::LauncherApp>(&mut text);
    declare::<crate::launcher::LauncherOptions>(&mut text);
    declare::<crate::launcher::LauncherProfile>(&mut text);
    declare::<crate::launcher::LauncherView>(&mut text);
    append_launcher_constants(&mut text);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let host: Vec<HostToUi> = vec![
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherGet {
                value: serde_json::from_str(include_str!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../hub-web/fixtures/launcher-base.json"
                )))
                .expect("launcher fixture"),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherLaunch { accepted: true },
        },
        HostToUi::Failure {
            id: 1,
            error: crate::protocol::HostError::LauncherConflict {
                current: crate::launcher::LauncherView::default(),
            },
        },
        HostToUi::Event {
            event: crate::protocol::Event::Launcher {
                value: crate::launcher::LauncherView::default(),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherFavorite { accepted: false },
        },
    ];
    let ui: Vec<UiToHost> = vec![
        UiToHost::Request {
            id: 1,
            request: Request::LauncherGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherLaunch {
                profile: "creator".into(),
                base_revision: "0".repeat(64),
            },
        },
        UiToHost::Subscribe {
            topic: crate::protocol::Topic::Launcher,
        },
        UiToHost::Unsubscribe {
            topic: crate::protocol::Topic::Launcher,
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherFavorite {},
        },
    ];

    serde_json::json!({"host":host,"ui":ui})
}

fn append_launcher_constants(text: &mut String) {
    text.push_str("export const launcherLimits = ");
    text.push_str(&serde_json::to_string(&canonical(serde_json::json!({"id":crate::launcher::ID_LIMIT,"profiles":crate::launcher::PROFILE_LIMIT,"apps":crate::launcher::APP_LIMIT}))).expect("launcher constants"));
    text.push_str(" as const;\n");
}
