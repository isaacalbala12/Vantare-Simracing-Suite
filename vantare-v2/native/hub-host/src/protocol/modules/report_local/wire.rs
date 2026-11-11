use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "report.localPrepare")]
    ReportLocalPrepare {
        fields: crate::testing::ReportFields,
    },
    #[serde(rename = "report.localExport")]
    ReportLocalExport {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "report.localPrepare")]
    ReportLocalPrepare {
        value: crate::report_local::LocalReportView,
    },
    #[serde(rename = "report.localExport")]
    ReportLocalExport {
        status: crate::report_local::ExportStatus,
    },
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
