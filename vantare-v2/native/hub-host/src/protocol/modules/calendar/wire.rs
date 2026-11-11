use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "calendar.alertsSave")]
    CalendarAlertsSave {
        #[serde(deserialize_with = "crate::calendar::config::deserialize_complete_alerts")]
        alerts: Box<crate::calendar::CalendarAlerts>,
        #[serde(rename = "expectedRevision")]
        expected_revision: String,
    },
    #[serde(rename = "calendar.historyLoad")]
    CalendarHistoryLoad {},
    #[serde(rename = "calendar.configLoad")]
    CalendarConfigLoad {},
    #[serde(rename = "calendar.utcSet")]
    CalendarUtcSet {
        utc: bool,
        #[serde(rename = "expectedRevision")]
        expected_revision: String,
    },
    #[serde(rename = "calendar.notifyWeekSet")]
    CalendarNotifyWeekSet {
        enabled: bool,
        #[serde(rename = "expectedRevision")]
        expected_revision: String,
    },
    #[serde(rename = "calendar.followSet")]
    CalendarFollowSet {
        #[serde(rename = "seriesId")]
        series_id: String,
        followed: bool,
        #[serde(rename = "expectedRevision")]
        expected_revision: String,
    },
    #[serde(rename = "calendar.load")]
    CalendarLoad {},
    #[serde(rename = "calendar.refresh")]
    CalendarRefresh {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "calendar.alertsSave")]
    CalendarAlertsSave {
        value: Box<crate::calendar::CalendarConfigView>,
    },
    #[serde(rename = "calendar.historyLoad")]
    CalendarHistoryLoad {
        value: Box<crate::calendar::CalendarHistoryView>,
    },
    #[serde(rename = "calendar.configLoad")]
    CalendarConfigLoad {
        value: Box<crate::calendar::CalendarConfigView>,
    },
    #[serde(rename = "calendar.utcSet")]
    CalendarUtcSet {
        value: Box<crate::calendar::CalendarConfigView>,
    },
    #[serde(rename = "calendar.notifyWeekSet")]
    CalendarNotifyWeekSet {
        value: Box<crate::calendar::CalendarConfigView>,
    },
    #[serde(rename = "calendar.followSet")]
    CalendarFollowSet {
        value: Box<crate::calendar::CalendarConfigView>,
    },
    #[serde(rename = "calendar.load")]
    CalendarLoad {
        value: Box<crate::calendar::CalendarView>,
    },
    #[serde(rename = "calendar.refresh")]
    CalendarRefresh {
        value: Box<crate::calendar::CalendarView>,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", deny_unknown_fields)]
pub enum HostError {
    #[serde(rename = "calendarScheduleUnavailable")]
    CalendarScheduleUnavailable,
    #[serde(rename = "calendarConflict")]
    CalendarConflict {
        current: Box<crate::calendar::CalendarConfigView>,
    },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
