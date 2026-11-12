//! Calendar owns intentions; the resident owns execution and terminal results.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const LEAD_MS: i64 = 180_000;
pub const RECEIPT_MS: u64 = 5000;
pub const CLOCK_SKEW_MS: i64 = 5000;
pub const MAX_FUTURE_MS: i64 = 8 * 86_400_000;
pub const ARM_ID_LENGTH: usize = 64;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CalendarLaunchMode {
    Once {
        #[serde(rename = "seriesId", deserialize_with = "deserialize_series")]
        series_id: String,
        #[serde(rename = "startAt", deserialize_with = "deserialize_start")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        start_at: i64,
    },
    Alerts {
        #[serde(rename = "expectedRevision", deserialize_with = "deserialize_token")]
        expected_revision: String,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalendarLaunchStop {
    User,
    Replaced,
    AccountChanged,
    RightsLost,
    Live,
    CoreDisconnected,
    HubClosed,
    ClockChanged,
    ResidentUnavailable,
    RevisionChanged,
    AlertsUnavailable,
    Disabled,
    ScheduleUnavailable,
    Expired,
    Busy,
    Io,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalendarLaunchUnknown {
    NoReceipt,
    RingGap,
    ResidentRestarted,
    ResidentUnavailable,
    ScopeLost,
    UnconfirmedWrite,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarLaunchPlan {
    pub arm_id: String,
    pub profile: String,
    pub profile_name: String,
    pub decision_required: bool,
    pub mode: CalendarLaunchMode,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CalendarLaunchProgress {
    Queued {
        request: String,
    },
    Running {
        request: String,
        run: String,
    },
    Finished {
        request: String,
        run: String,
        outcome: crate::launcher_resident::ResidentOutcome,
    },
    Rejected {
        request: String,
        reason: crate::launcher_resident::ResidentRejection,
    },
    NotSent {
        reason: CalendarLaunchStop,
    },
    Unknown {
        request: Option<String>,
        reason: CalendarLaunchUnknown,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarLaunchAttempt {
    pub arm_id: String,
    pub profile_name: String,
    pub series_id: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub start_at: i64,
    pub progress: CalendarLaunchProgress,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarLaunchChange {
    pub plan: CalendarLaunchPlan,
    pub reason: CalendarLaunchStop,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarLaunchView {
    pub armed: Option<CalendarLaunchPlan>,
    pub automatic: Option<CalendarLaunchPlan>,
    pub latest: Option<CalendarLaunchAttempt>,
    pub change: Option<CalendarLaunchChange>,
}
pub fn token(value: &str) -> bool {
    super::config::revision_valid(value)
}
pub fn deserialize_token<'de, D: serde::Deserializer<'de>>(input: D) -> Result<String, D::Error> {
    let value = String::deserialize(input)?;
    if token(&value) {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("invalid calendar launch token"))
    }
}

pub fn deserialize_profile<'de, D: serde::Deserializer<'de>>(input: D) -> Result<String, D::Error> {
    let value = String::deserialize(input)?;
    if !value.is_empty() && value.len() <= crate::launcher::ID_LIMIT && !value.contains('\0') {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("invalid profile id"))
    }
}
fn deserialize_series<'de, D: serde::Deserializer<'de>>(input: D) -> Result<String, D::Error> {
    let value = String::deserialize(input)?;
    if super::text(&value) && super::nonblank(&value) {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("invalid series id"))
    }
}
fn deserialize_start<'de, D: serde::Deserializer<'de>>(input: D) -> Result<i64, D::Error> {
    let value = i64::deserialize(input)?;
    if (0..=super::TIMESTAMP_LIMIT * 1000).contains(&value) {
        Ok(value)
    } else {
        Err(serde::de::Error::custom("invalid departure"))
    }
}
