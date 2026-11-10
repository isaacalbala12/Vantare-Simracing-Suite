use std::fmt::Write as _;
const NOTIFICATION_SOURCES: [&str; 5] = ["updater", "launcher", "system", "beta", "report"];
const NOTIFICATION_DESTINATIONS: [&str; 3] = ["launcher", "settings:updates", "testing:reports"];
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    append_notification_constants(&mut text);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let host: Vec<HostToUi> = vec![HostToUi::Response {
        id: 1,
        result: Reply::NotificationTest { accepted: true },
    }];
    let ui: Vec<UiToHost> = vec![UiToHost::Request {
        id: 1,
        request: Request::NotificationTest {},
    }];

    serde_json::json!({"host":host,"ui":ui})
}

fn append_notification_constants(text: &mut String) {
    for (name, value) in [
        ("notificationHistoryLimit", serde_json::json!(50u32)),
        ("notificationTextLimit", serde_json::json!(240u32)),
        (
            "notificationSources",
            serde_json::json!(NOTIFICATION_SOURCES),
        ),
        (
            "notificationSeverities",
            serde_json::json!(["info", "warning", "error"]),
        ),
        (
            "notificationDestinations",
            serde_json::json!(NOTIFICATION_DESTINATIONS),
        ),
    ] {
        writeln!(
            text,
            "export const {name} = {} as const;",
            serde_json::to_string(&value).expect("notification constants")
        )
        .expect("String write");
    }
}
