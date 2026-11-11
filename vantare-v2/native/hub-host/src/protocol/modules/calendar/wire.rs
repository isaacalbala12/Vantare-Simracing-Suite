use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "calendar.load")]
    CalendarLoad {},
    #[serde(rename = "calendar.refresh")]
    CalendarRefresh {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "calendar.load")]
    CalendarLoad {
        value: Box<crate::calendar::CalendarView>,
    },
    #[serde(rename = "calendar.refresh")]
    CalendarRefresh {
        value: Box<crate::calendar::CalendarView>,
    },
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
