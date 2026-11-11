use crate::protocol::bindings::{constants, declare, sample_response, settings_sample};
use crate::protocol::{
    CloseReason, CoreStatus, Event, HostError, HostToUi, LinkState, REQUEST_TIMEOUT_MS, Reply,
    Request, Topic, UiToHost, VERSION, hello,
};
use std::fmt::Write as _;
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::protocol::ThemeBoot>(&mut text);
    declare::<crate::protocol::WindowBoot>(&mut text);
    declare::<crate::protocol::LinkState>(&mut text);
    declare::<crate::protocol::AccessView>(&mut text);
    declare::<crate::protocol::CoreStatus>(&mut text);
    declare::<crate::protocol::CloseReason>(&mut text);
    declare::<crate::protocol::HostToUi>(&mut text);
    declare::<crate::protocol::UiToHost>(&mut text);
    writeln!(
        text,
        "export const HOST_PROTOCOL_VERSION = {VERSION} as const;"
    )
    .expect("String write");
    constants!(&mut text, "requestTimeoutMs", REQUEST_TIMEOUT_MS);
    constants!(&mut text, "demoNameMax", crate::protocol::DEMO_NAME_LIMIT);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let settings = settings_sample();
    let mut host: Vec<HostToUi> = vec![
        HostToUi::Failure {
            id: 1,
            error: HostError::Rejected,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::Busy,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::CoreUnavailable,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::Unsupported,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::Incompatible {
                expected: VERSION,
                found: VERSION + 1,
            },
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::Denied,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::Protected,
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::Io,
        },
        hello(&settings).expect("boot view"),
        HostToUi::Event {
            event: Event::SimStatus { live: true },
        },
    ];
    let mut ui: Vec<UiToHost> = vec![
        UiToHost::Request {
            id: 1,
            request: Request::CoreGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::WindowClose {},
        },
    ];

    for state in [
        LinkState::Connected,
        LinkState::Incompatible,
        LinkState::Unavailable,
    ] {
        let value = CoreStatus {
            photos: state,
            rights: state,
            services: state,
            ..Default::default()
        };
        host.push(sample_response(Reply::Core {
            value: value.clone(),
        }));
        host.push(HostToUi::Event {
            event: Event::Core { value },
        });
    }

    for reason in [
        CloseReason::Restart,
        CloseReason::Window,
        CloseReason::Live,
        CloseReason::ControlEof,
    ] {
        host.push(HostToUi::CloseRequested { reason });
    }
    ui.extend([
        UiToHost::Hello { version: VERSION },
        UiToHost::Ready {},
        UiToHost::CloseAnswer { allow: true },
        UiToHost::CloseAnswer { allow: false },
    ]);
    ui.extend([
        UiToHost::Subscribe { topic: Topic::Core },
        UiToHost::Unsubscribe { topic: Topic::Core },
    ]);
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::SimStatus,
        },
        UiToHost::Unsubscribe {
            topic: Topic::SimStatus,
        },
    ]);

    serde_json::json!({"host":host,"ui":ui})
}
