// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::shortcuts::RegistrationState>(&mut text);
    declare::<crate::shortcuts::ProfileShortcut>(&mut text);
    declare::<crate::shortcuts::ShortcutsView>(&mut text);
    declare_named::<super::Request>(&mut text, "ShortcutsRequest");
    declare_named::<super::Reply>(&mut text, "ShortcutsReply");
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
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::ShortcutsGet {},
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::ShortcutsGet {
            value: serde_json::from_str(include_str!(
                "../../../../hub-web/fixtures/shortcuts-base.json"
            ))
            .expect("shortcuts"),
        },
    });
    serde_json::json!({"host":host,"ui":ui})
}
