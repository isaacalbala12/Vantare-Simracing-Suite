//! Closed resident observations and opt-in, scope-checked answers.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "launcher.resident.retry")]
    LauncherResidentRetry {
        target: crate::launcher_resident::ResidentRetryTarget,
    },
    #[serde(rename = "launcher.resident.cancel")]
    LauncherResidentCancel {
        target: crate::launcher_resident::ResidentCancelTarget,
    },
    #[serde(rename = "launcher.resident.rehearse")]
    LauncherResidentRehearse {
        target: crate::launcher_resident::ResidentRehearseTarget,
    },
    #[serde(rename = "launcher.resident.get")]
    LauncherResidentGet {},
    #[serde(rename = "launcher.resident.answer")]
    LauncherResidentAnswer {
        target: crate::launcher_resident::ResidentAnswerTarget,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "launcher.resident.retry")]
    LauncherResidentRetry {
        value: crate::launcher_resident::ResidentQueued,
    },
    #[serde(rename = "launcher.resident.cancel")]
    LauncherResidentCancel {
        value: crate::launcher_resident::ResidentQueued,
    },
    #[serde(rename = "launcher.resident.rehearse")]
    LauncherResidentRehearse {
        value: crate::launcher_resident::ResidentQueued,
    },
    #[serde(rename = "launcher.resident.answer")]
    LauncherResidentAnswer {
        value: crate::launcher_resident::ResidentQueued,
    },

    #[serde(rename = "launcher.resident.get")]
    LauncherResidentGet {
        value: crate::launcher_resident::ResidentView,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum Topic {
    LauncherResident,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    LauncherResident {
        value: crate::launcher_resident::ResidentView,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    ResidentControlRejected {
        reason: crate::launcher_resident::ResidentOrderRejection,
    },
    ResidentAnswerRejected {
        reason: crate::launcher_resident::ResidentAnswerRejection,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
