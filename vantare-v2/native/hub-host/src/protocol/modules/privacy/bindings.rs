// Bindings and Rust-serialized examples owned by this screen.
use crate::protocol::bindings::*;
use crate::protocol::*;
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::privacy::PrivacyView>(&mut text);
    declare::<crate::privacy::PrivacyPatch>(&mut text);
    declare::<crate::privacy::MailView>(&mut text);
    declare_named::<super::Request>(&mut text, "PrivacyRequest");
    declare_named::<super::Reply>(&mut text, "PrivacyReply");
    declare_named::<super::HostError>(&mut text, "PrivacyHostError");
    constants!(&mut text, "privacyPolicyUrl", crate::privacy::POLICY_URL);
    constants!(&mut text, "privacyFields", ["crashes", "usage"]);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let mut host = Vec::<HostToUi>::new();
    let mut ui = Vec::<UiToHost>::new();
    let privacy = privacy_sample();
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::PrivacyPolicy {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::PrivacyGet {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::PrivacyUpdate {
            patch: crate::privacy::PrivacyPatch::Crashes(true),
            base_revision: "0".repeat(64),
        },
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::PrivacyUpdate {
            patch: crate::privacy::PrivacyPatch::Usage(false),
            base_revision: "0".repeat(64),
        },
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::MailGet {},
    });
    ui.push(UiToHost::Request {
        id: 1,
        request: Request::MailSet { consent: false },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::PrivacyPolicy { accepted: false },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::PrivacyGet {
            value: privacy.clone(),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::PrivacyUpdate {
            value: privacy.clone(),
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::MailGet {
            value: crate::privacy::MailView { consent: false },
        },
    });
    host.push(HostToUi::Response {
        id: 1,
        result: Reply::MailSet {
            value: crate::privacy::MailView { consent: true },
        },
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::PrivacyConflict {
            current: privacy.clone(),
        },
    });
    host.push(HostToUi::Failure {
        id: 1,
        error: HostError::PrivacyCleanup { current: privacy },
    });
    serde_json::json!({"host":host,"ui":ui})
}
pub(crate) fn privacy_sample() -> crate::privacy::PrivacyView {
    serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../hub-web/fixtures/privacy-base.json"
    )))
    .expect("privacy fixture")
}
