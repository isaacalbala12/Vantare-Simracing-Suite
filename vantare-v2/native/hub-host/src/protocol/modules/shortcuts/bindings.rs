use crate::protocol::bindings::{constants, declare};
use crate::protocol::{HostToUi, Reply, Request, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::shortcuts::RegistrationState>(&mut text);
    declare::<crate::shortcuts::ProfileShortcut>(&mut text);
    declare::<crate::shortcuts::ShortcutsView>(&mut text);
    constants!(
        &mut text,
        "registrationStates",
        [
            crate::shortcuts::RegistrationState::Unconfirmed,
            crate::shortcuts::RegistrationState::Registered,
            crate::shortcuts::RegistrationState::Inactive,
            crate::shortcuts::RegistrationState::Error
        ]
    );
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let host: Vec<HostToUi> = vec![HostToUi::Response {
        id: 1,
        result: Reply::ShortcutsGet {
            value: serde_json::from_str(include_str!(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../hub-web/fixtures/shortcuts-base.json"
            )))
            .expect("shortcuts"),
        },
    }];
    let ui: Vec<UiToHost> = vec![UiToHost::Request {
        id: 1,
        request: Request::ShortcutsGet {},
    }];

    serde_json::json!({"host":host,"ui":ui})
}
