// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::pilot::PilotFields>(&mut text);
    declare::<crate::pilot::PilotView>(&mut text);
    declare_named::<super::Request>(&mut text, "PilotRequest");
    declare_named::<super::Reply>(&mut text, "PilotReply");
    constants!(&mut text, "pilotRevisionMax", u64::MAX.to_string());
    constants!(&mut text, "pilotCountries", crate::pilot::countries());
    constants!(
        &mut text,
        "pilotLimits",
        serde_json::json!({"name":crate::pilot::NAME_LIMIT,"description":crate::pilot::DESCRIPTION_LIMIT,"favorite":crate::pilot::FAVORITE_LIMIT,"simulator":crate::pilot::SIMULATOR_LIMIT,"simulators":crate::pilot::SIMULATOR_COUNT,"photoBytes":crate::pilot::MAX_PHOTO_BYTES,"photoSide":crate::pilot::PHOTO_SIDE,"sourceBytes":crate::pilot::MAX_SOURCE_BYTES,"sourceSide":crate::pilot::MAX_SOURCE_SIDE})
    );
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::PilotLoad {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::PilotSave {
            fields: crate::pilot::PilotFields::default(),
            base_revision: "0".into(),
        },
    });
    host.extend(pilot_reply_samples().into_iter().map(sample_response));
    serde_json::json!({"host":host,"ui":ui})
}
pub(crate) fn pilot_reply_samples() -> [Reply; 2] {
    let value =
        crate::pilot::view(&vantare_ipc::services_protocol::pilot_document::PilotState::default());
    [
        Reply::PilotLoad {
            value: value.clone(),
        },
        Reply::PilotSave { value },
    ]
}
