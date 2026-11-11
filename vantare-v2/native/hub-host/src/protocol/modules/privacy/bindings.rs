use crate::protocol::bindings::{constants, declare};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
// Bindings and Rust-serialized examples owned by this screen.

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<crate::privacy::PrivacyView>(&mut text);
    declare::<crate::privacy::PrivacyPatch>(&mut text);
    declare::<crate::privacy::MailView>(&mut text);
    constants!(&mut text, "privacyPolicyUrl", crate::privacy::POLICY_URL);
    constants!(&mut text, "privacyFields", ["crashes", "usage"]);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    let privacy = privacy_sample();
    let host: Vec<HostToUi> = vec![
        HostToUi::Response {
            id: 1,
            result: Reply::PrivacyPolicy { accepted: false },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::PrivacyGet {
                value: privacy.clone(),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::PrivacyUpdate {
                value: privacy.clone(),
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::MailGet {
                value: crate::privacy::MailView { consent: false },
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::MailSet {
                value: crate::privacy::MailView { consent: true },
            },
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::PrivacyConflict {
                current: privacy.clone(),
            },
        },
        HostToUi::Failure {
            id: 1,
            error: HostError::PrivacyCleanup { current: privacy },
        },
    ];
    let ui: Vec<UiToHost> = vec![
        UiToHost::Request {
            id: 1,
            request: Request::PrivacyPolicy {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::PrivacyGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::PrivacyUpdate {
                patch: crate::privacy::PrivacyPatch::Crashes(true),
                base_revision: "0".repeat(64),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::PrivacyUpdate {
                patch: crate::privacy::PrivacyPatch::Usage(false),
                base_revision: "0".repeat(64),
            },
        },
        UiToHost::Request {
            id: 1,
            request: Request::MailGet {},
        },
        UiToHost::Request {
            id: 1,
            request: Request::MailSet { consent: false },
        },
    ];

    serde_json::json!({"host":host,"ui":ui})
}
pub(crate) fn privacy_sample() -> crate::privacy::PrivacyView {
    serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../hub-web/fixtures/privacy-base.json"
    )))
    .expect("privacy fixture")
}
