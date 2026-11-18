use crate::protocol::bindings::{declare, sample_response};
use crate::protocol::{Reply, Request, UiToHost};
use crate::workshop::{
    CAPTION_COUNT_LIMIT, CAPTION_LIMIT, FRAME_LIMIT, ID_PATTERN, Scenes, WidgetScenes,
    WorkshopScene, development_root, id_cases,
};

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<WorkshopScene>(&mut text);
    declare::<WidgetScenes>(&mut text);
    crate::protocol::bindings::constants!(&mut text, "workshopSceneIdPattern", ID_PATTERN);
    crate::protocol::bindings::constants!(&mut text, "workshopFrameLimit", FRAME_LIMIT);
    crate::protocol::bindings::constants!(&mut text, "workshopCaptionLimit", CAPTION_LIMIT);
    crate::protocol::bindings::constants!(
        &mut text,
        "workshopCaptionCountLimit",
        CAPTION_COUNT_LIMIT
    );
    crate::protocol::bindings::constants!(&mut text, "workshopSceneIdCases", id_cases());
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let widgets = Scenes::load(Some(development_root())).widgets();
    serde_json::json!({
        "host": [sample_response(Reply::WorkshopCatalog { widgets })],
        "ui": [UiToHost::Request { id: 1, request: Request::WorkshopCatalog {} }],
    })
}
