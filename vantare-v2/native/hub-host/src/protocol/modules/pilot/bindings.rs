use crate::protocol::bindings::{constants, declare, sample_response};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::pilot::PilotFields>(&mut text);
    declare::<crate::pilot::PilotView>(&mut text);
    constants!(
        &mut text,
        "pilotSimulatorOptions",
        crate::pilot::presentation::SIMULATORS
    );
    constants!(
        &mut text,
        "pilotCountryOptions",
        crate::pilot::presentation::COUNTRIES
    );
    constants!(
        &mut text,
        "pilotEditorLimits",
        serde_json::json!({"name":crate::pilot::presentation::NAME_MAX,"description":crate::pilot::presentation::DESCRIPTION_MAX,"favorite":crate::pilot::presentation::FAVORITE_MAX,"cropMinSide":crate::pilot::presentation::CROP_MIN_SIDE})
    );
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
    let mut host: Vec<HostToUi> = vec![];
    let ui: Vec<UiToHost> = vec![
        UiToHost::Request {
            id: 1,
            request: Request::PilotLoad {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::PilotSave {
                fields: crate::pilot::PilotFields::default(),
                base_revision: "0".into(),
            },
        },
    ];

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
