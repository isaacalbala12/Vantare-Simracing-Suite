use crate::protocol::bindings::sample_response;
use crate::protocol::{Event, HostToUi, Reply, Request, Topic, UiToHost};

pub(crate) fn typescript() -> String {
    String::new()
}
pub(crate) fn corpus() -> serde_json::Value {
    let host = [
        sample_response(Reply::WindowMinimize { accepted: true }),
        sample_response(Reply::WindowToggleMaximize { accepted: false }),
        HostToUi::Event {
            event: Event::WindowState { maximized: false },
        },
    ];
    let ui = [
        UiToHost::Request {
            id: 1,
            request: Request::WindowMinimize {},
        },
        UiToHost::Request {
            id: 2,
            request: Request::WindowToggleMaximize {},
        },
        UiToHost::Subscribe {
            topic: Topic::WindowState,
        },
        UiToHost::Unsubscribe {
            topic: Topic::WindowState,
        },
    ];
    serde_json::json!({"host":host,"ui":ui})
}
