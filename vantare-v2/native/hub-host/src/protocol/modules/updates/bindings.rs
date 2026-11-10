// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::updates::InstallationState>(&mut text);
    declare::<crate::updates::BetaStatus>(&mut text);
    declare::<crate::updates::ReleaseNote>(&mut text);
    declare::<crate::updates::UpdatesView>(&mut text);
    declare_named::<super::Topic>(&mut text, "UpdatesTopic");
    declare_named::<super::Request>(&mut text, "UpdatesRequest");
    declare_named::<super::Reply>(&mut text, "UpdatesReply");
    declare_named::<super::Event>(&mut text, "UpdatesEvent");
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
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::UpdatesGet {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::UpdatesRestart {},
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::UpdatesGet {
            value: serde_json::from_str(include_str!(
                "../../../../hub-web/fixtures/updates-ready.json"
            ))
            .expect("updates"),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::UpdatesRestart { accepted: false },
    });
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::Updates,
        },
        UiToHost::Unsubscribe {
            topic: Topic::Updates,
        },
    ]);
    host.push(HostToUi::Event {
        event: Event::Updates {
            value: serde_json::from_str(include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../hub-web/fixtures/updates-ready.json"
            )))
            .expect("updates"),
        },
    });
    serde_json::json!({"host":host,"ui":ui})
}
