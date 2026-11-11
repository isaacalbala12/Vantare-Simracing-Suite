//! Closed Acceso intents. Credentials are transient and Debug-redacted.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "account.get")]
    AccountGet {},
    #[serde(rename = "account.begin")]
    AccountBegin {},
    #[serde(rename = "account.cancel")]
    AccountCancel {},
    #[serde(rename = "account.copyLink")]
    AccountCopyLink {},
    #[serde(rename = "account.email")]
    AccountEmail { action: crate::account::EmailIntent },
    #[serde(rename = "account.logout")]
    AccountLogout {},
    #[serde(rename = "account.check")]
    AccountCheck {},
    #[serde(rename = "account.photoRefresh")]
    AccountPhotoRefresh {},
    #[serde(rename = "account.portal")]
    AccountPortal { page: crate::account::PortalPage },
    #[serde(rename = "account.purchase")]
    AccountPurchase { product: crate::account::Product },
    #[serde(rename = "account.purchaseStop")]
    AccountPurchaseStop {},
    #[serde(rename = "account.deviceReset")]
    AccountDeviceReset {},
    #[serde(rename = "account.retry")]
    AccountRetry {},
    #[serde(rename = "account.back")]
    AccountBack {},
    #[serde(rename = "account.choose")]
    AccountChoose {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "account.get")]
    AccountGet { value: crate::account::AccountView },
    #[serde(rename = "account.begin")]
    AccountBegin { value: crate::account::AccountView },
    #[serde(rename = "account.cancel")]
    AccountCancel { value: crate::account::AccountView },
    #[serde(rename = "account.copyLink")]
    AccountCopyLink { value: crate::account::AccountView },
    #[serde(rename = "account.email")]
    AccountEmail { value: crate::account::AccountView },
    #[serde(rename = "account.logout")]
    AccountLogout { value: crate::account::AccountView },
    #[serde(rename = "account.check")]
    AccountCheck { value: crate::account::AccountView },
    #[serde(rename = "account.photoRefresh")]
    AccountPhotoRefresh { value: crate::account::AccountView },
    #[serde(rename = "account.portal")]
    AccountPortal { value: crate::account::AccountView },
    #[serde(rename = "account.purchase")]
    AccountPurchase { value: crate::account::AccountView },
    #[serde(rename = "account.purchaseStop")]
    AccountPurchaseStop { value: crate::account::AccountView },
    #[serde(rename = "account.deviceReset")]
    AccountDeviceReset { value: crate::account::AccountView },
    #[serde(rename = "account.retry")]
    AccountRetry { value: crate::account::AccountView },
    #[serde(rename = "account.back")]
    AccountBack { value: crate::account::AccountView },
    #[serde(rename = "account.choose")]
    AccountChoose { value: crate::account::AccountView },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    AccountInvalid,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Topic {
    Account,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    Account { value: crate::account::AccountView },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
