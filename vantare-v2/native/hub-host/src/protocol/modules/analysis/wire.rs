use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Request {
    #[serde(rename = "analysis.status")]
    AnalysisStatus {},
    #[serde(rename = "analysis.catalog")]
    AnalysisCatalog {},
    #[serde(rename = "analysis.inspect")]
    AnalysisInspect { id: String },
    #[serde(rename = "analysis.open")]
    AnalysisOpen { id: String },
    // Cancelling or timing out Compare invalidates the session; reopen before retrying.
    #[serde(rename = "analysis.compare")]
    AnalysisCompare { session: String, a: u32, b: u32 },
    #[serde(rename = "analysis.close")]
    AnalysisClose { session: String },
    #[serde(rename = "analysis.cancel")]
    AnalysisCancel {},
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "method", rename_all = "camelCase", deny_unknown_fields)]
pub enum Reply {
    #[serde(rename = "analysis.status")]
    AnalysisStatus {
        status: Option<crate::analysis::status::AnalysisRecordingStatus>,
    },
    #[serde(rename = "analysis.catalog")]
    AnalysisCatalog {
        recordings: Vec<crate::analysis::catalog::AnalysisRow>,
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "256"))]
        max: u16,
    },
    #[serde(rename = "analysis.inspect")]
    AnalysisInspect {
        state: crate::analysis::catalog::AnalysisState,
        laps: u32,
        #[serde(rename = "bestLapApproxMs", skip_serializing_if = "Option::is_none")]
        #[cfg_attr(any(test, feature = "bindings"), ts(optional = nullable))]
        best_lap_approx_ms: Option<u32>,
    },
    #[serde(rename = "analysis.open")]
    AnalysisOpen {
        session: String,
        watermark: String,
        finished: bool,
        attempted: String,
        total: String,
        laps: Vec<crate::analysis::catalog::AnalysisLap>,
    },
    #[serde(rename = "analysis.compare")]
    AnalysisCompare {
        #[serde(rename = "distanceRange")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "[number, number]"))]
        distance_range: [serde_json::Number; 2],
        speed: crate::analysis::projection::AnalysisSeries,
        throttle: crate::analysis::projection::AnalysisSeries,
        brake: crate::analysis::projection::AnalysisSeries,
        delta: Option<Vec<crate::analysis::projection::AnalysisPoint>>,
        #[serde(rename = "deltaUnavailable", skip_serializing_if = "Option::is_none")]
        #[cfg_attr(any(test, feature = "bindings"), ts(optional))]
        delta_unavailable: Option<crate::analysis::projection::DeltaUnavailable>,
        gaps: crate::analysis::projection::AnalysisGaps,
    },
    #[serde(rename = "analysis.close")]
    AnalysisClose {},
    #[serde(rename = "analysis.cancel")]
    AnalysisCancel { cancelled: bool },
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum HostError {
    AnalysisIncomparable,
    AnalysisNotFound,
    AnalysisLocked,
    AnalysisIncompatible,
    AnalysisUnreadable,
    AnalysisChanged,
    AnalysisTooMany,
    AnalysisTooLarge,
    AnalysisCancelled,
    AnalysisTimeout,
}

#[cfg(any(test, feature = "bindings"))]
pub(crate) mod bindings;
