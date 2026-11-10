// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare_named::<super::Request>(&mut text, "NotificationsRequest");
    declare_named::<super::Reply>(&mut text, "NotificationsReply");

    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::NotificationTest {},
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::NotificationTest { accepted: true },
    });
    serde_json::json!({"host":host,"ui":ui})
}
