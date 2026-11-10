use crate::protocol::bindings::{constants, declare};
use crate::protocol::{Event, HostToUi, Reply, Request, Topic, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::updates::InstallationState>(&mut text);
    declare::<crate::updates::BetaStatus>(&mut text);
    declare::<crate::updates::ReleaseNote>(&mut text);
    declare::<crate::updates::UpdatesView>(&mut text);
    constants!(
        &mut text,
        "releaseChannels",
        crate::updates::RELEASE_CHANNELS
    );
    constants!(&mut text, "releaseKinds", crate::updates::RELEASE_KINDS);
    constants!(
        &mut text,
        "updatesLimits",
        serde_json::json!({"text":crate::updates::MAX_STATUS_TEXT,"shortVersion":crate::updates::MAX_SHORT_VERSION,"state":crate::updates::MAX_STATUS_STATE,"news":crate::updates::MAX_NEWS,"tag":crate::updates::MAX_TAG,"title":crate::updates::MAX_TITLE})
    );
    constants!(
        &mut text,
        "installationStates",
        [
            crate::updates::InstallationState::Development,
            crate::updates::InstallationState::Installed,
            crate::updates::InstallationState::Invalid
        ]
    );
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let host: Vec<HostToUi> = vec![
        HostToUi::Response {
            id: 1,
            result: Reply::UpdatesGet {
                value: serde_json::from_str(include_str!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../hub-web/fixtures/updates-ready.json"
                )))
                .expect("updates"),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::UpdatesRestart { accepted: false },
        },
        HostToUi::Event {
            event: Event::Updates {
                value: serde_json::from_str(include_str!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../hub-web/fixtures/updates-ready.json"
                )))
                .expect("updates"),
            },
        },
    ];
    let mut ui: Vec<UiToHost> = vec![
        UiToHost::Request {
            id: 1,
            request: Request::UpdatesGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::UpdatesRestart {},
        },
    ];

    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::Updates,
        },
        UiToHost::Unsubscribe {
            topic: Topic::Updates,
        },
    ]);

    serde_json::json!({"host":host,"ui":ui})
}
