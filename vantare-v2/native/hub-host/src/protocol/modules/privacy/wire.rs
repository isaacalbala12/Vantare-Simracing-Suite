//! Owned wire variants. The build assembles the closed transport enums.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "privacy.policy")]
    PrivacyPolicy {},
    #[serde(rename = "privacy.get")]
    PrivacyGet {},
    #[serde(rename = "privacy.update")]
    PrivacyUpdate {
        patch: crate::privacy::PrivacyPatch,
        #[serde(rename = "baseRevision")]
        base_revision: String,
    },
    #[serde(rename = "mail.get")]
    MailGet {},
    #[serde(rename = "mail.set")]
    MailSet { consent: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "privacy.policy")]
    PrivacyPolicy { accepted: bool },
    #[serde(rename = "privacy.get")]
    PrivacyGet { value: crate::privacy::PrivacyView },
    #[serde(rename = "privacy.update")]
    PrivacyUpdate { value: crate::privacy::PrivacyView },
    #[serde(rename = "mail.get")]
    MailGet { value: crate::privacy::MailView },
    #[serde(rename = "mail.set")]
    MailSet { value: crate::privacy::MailView },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    PrivacyConflict {
        current: crate::privacy::PrivacyView,
    },
    PrivacyCleanup {
        current: crate::privacy::PrivacyView,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
