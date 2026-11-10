use std::fmt::Write as _;
// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
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
    declare_named::<super::Topic>(&mut text, "TransportTopic");
    declare_named::<super::Request>(&mut text, "TransportRequest");
    declare_named::<super::Reply>(&mut text, "TransportReply");
    declare_named::<super::HostError>(&mut text, "TransportHostError");
    declare_named::<super::Event>(&mut text, "TransportEvent");
    writeln!(
        text,
        "export const HOST_PROTOCOL_VERSION = {VERSION} as const;"
    )
    .expect("String write");
    constants!(&mut text, "requestTimeoutMs", REQUEST_TIMEOUT_MS);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    let settings = settings_sample();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::CoreGet {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::WindowClose {},
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Rejected,
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Busy,
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::CoreUnavailable,
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Unsupported,
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Incompatible {
            expected: VERSION,
            found: VERSION + 1,
        },
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Denied,
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Protected,
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::Io,
    });
    host.push(hello(&settings).expect("boot view"));
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
    host.push(HostToUi::Event {
        event: Event::SimStatus { live: true },
    });
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
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::Rejected,
        },
        UiToHost::Unsubscribe {
            topic: Topic::Rejected,
        },
    ]);
    ui.extend([
        UiToHost::Subscribe { topic: Topic::Busy },
        UiToHost::Unsubscribe { topic: Topic::Busy },
    ]);
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::CoreUnavailable,
        },
        UiToHost::Unsubscribe {
            topic: Topic::CoreUnavailable,
        },
    ]);
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::Unsupported,
        },
        UiToHost::Unsubscribe {
            topic: Topic::Unsupported,
        },
    ]);
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::Denied,
        },
        UiToHost::Unsubscribe {
            topic: Topic::Denied,
        },
    ]);
    ui.extend([
        UiToHost::Subscribe {
            topic: Topic::Protected,
        },
        UiToHost::Unsubscribe {
            topic: Topic::Protected,
        },
    ]);
    ui.extend([
        UiToHost::Subscribe { topic: Topic::Io },
        UiToHost::Unsubscribe { topic: Topic::Io },
    ]);
    serde_json::json!({"host":host,"ui":ui})
}
