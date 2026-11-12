use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "calendar.noticeTest")]
    CalendarNoticeTest {},
    #[serde(rename = "calendar.alertsSave")]
    CalendarAlertsSave {
        #[serde(deserialize_with = "crate::calendar::config::deserialize_complete_alerts")]
        alerts: Box<crate::calendar::CalendarAlerts>,
        #[serde(rename = "expectedRevision")]
        expected_revision: String,
    },
    #[serde(rename = "calendar.icsPrepare")]
    CalendarIcsPrepare {
        scope: crate::calendar::CalendarIcsScope,
        alarm: bool,
    },
    #[serde(rename = "calendar.icsExport")]
    CalendarIcsExport {
        #[serde(rename = "preparedHash")]
        prepared_hash: String,
    },
    #[serde(rename = "calendar.icsReplace")]
    CalendarIcsReplace {
        #[serde(
            rename = "confirmationId",
            deserialize_with = "crate::calendar::ics::deserialize_confirmation_id"
        )]
        confirmation_id: String,
        replace: bool,
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
    #[serde(rename = "calendar.noticeTest")]
    CalendarNoticeTest { accepted: bool },
    #[serde(rename = "calendar.alertsSave")]
    CalendarAlertsSave {
        value: Box<crate::calendar::CalendarConfigView>,
    },
    #[serde(rename = "calendar.icsPrepare")]
    CalendarIcsPrepare {
        value: Box<crate::calendar::CalendarIcsView>,
    },
    #[serde(rename = "calendar.icsExport")]
    CalendarIcsExport {
        status: crate::calendar::CalendarIcsStatus,
        #[serde(
            rename = "confirmationId",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        confirmation_id: Option<String>,
    },
    #[serde(rename = "calendar.icsReplace")]
    CalendarIcsReplace {
        status: crate::calendar::CalendarIcsStatus,
        #[serde(
            rename = "confirmationId",
            default,
            skip_serializing_if = "Option::is_none"
        )]
        confirmation_id: Option<String>,
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
    #[serde(rename = "calendarExportExtension")]
    CalendarExportExtension,
    #[serde(rename = "calendarExportTooLarge")]
    CalendarExportTooLarge,
    #[serde(rename = "calendarScheduleUnavailable")]
    CalendarScheduleUnavailable,
    #[serde(rename = "calendarConflict")]
    CalendarConflict {
        current: Box<crate::calendar::CalendarConfigView>,
    },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "topic", rename_all = "camelCase", deny_unknown_fields)]
pub enum Event {
    #[serde(rename = "calendarRefreshed")]
    CalendarRefreshed {
        value: Box<crate::calendar::CalendarView>,
        error: Option<crate::calendar::CalendarRefreshFailure>,
    },
    #[serde(rename = "calendarNotice")]
    CalendarNotice {
        value: crate::calendar::CalendarNotice,
    },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
