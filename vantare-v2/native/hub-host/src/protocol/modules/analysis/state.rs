//! Session-local catalog tokens. No paths cross the bridge.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, time::UNIX_EPOCH};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const CATALOG_MAX: u16 = 256;

pub struct State {
    root: PathBuf,
    paths: BTreeMap<String, PathBuf>,
}
impl State {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            paths: BTreeMap::new(),
        }
    }
    pub fn clear(&mut self) {
        self.paths.clear();
    }
    pub fn catalog(&mut self) -> Result<Vec<AnalysisRow>, HostError> {
        self.clear();
        let paths = crate::analysis::recordings(&self.root).map_err(|e| {
            if e.code == crate::analysis::ErrorCode::Limit {
                HostError::AnalysisTooMany
            } else {
                map_error(e.code)
            }
        })?;
        let mut entries = Vec::new();
        for path in paths {
            let m = std::fs::symlink_metadata(&path).map_err(|_| HostError::AnalysisUnreadable)?;
            if !m.is_file() || super::reparse(&m) {
                return Err(HostError::AnalysisChanged);
            }
            let created = m.created().map_err(|_| HostError::AnalysisUnreadable)?;
            let ms = created
                .duration_since(UNIX_EPOCH)
                .map_err(|_| HostError::AnalysisUnreadable)?
                .as_millis();
            if ms >= (1_u128 << 53) || m.len() >= (1_u64 << 53) {
                return Err(HostError::AnalysisTooLarge);
            }
            entries.push((
                created,
                path,
                u64::try_from(ms).map_err(|_| HostError::AnalysisTooLarge)?,
                m.len(),
            ));
        }
        entries.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        let mut tokens = BTreeMap::new();
        let mut rows = Vec::new();
        for (_, path, started_at_ms, size_bytes) in entries {
            let id = vantare_services::random_id().map_err(|_| HostError::AnalysisUnreadable)?;
            tokens.insert(id.clone(), path);
            rows.push(AnalysisRow {
                id,
                started_at_ms,
                size_bytes,
            });
        }
        self.paths = tokens;
        Ok(rows)
    }
}
/// C1's Limit means reader size; catalog translates it to TooMany at its call site.
/// C1's filesystem Io and malformed input both expose Unreadable, without diagnostics.
pub fn map_error(code: crate::analysis::ErrorCode) -> HostError {
    use crate::analysis::ErrorCode;
    match code {
        ErrorCode::Missing => HostError::AnalysisNotFound,
        ErrorCode::Locked => HostError::AnalysisLocked,
        ErrorCode::Incompatible => HostError::AnalysisIncompatible,
        ErrorCode::Unreadable | ErrorCode::Io => HostError::AnalysisUnreadable,
        ErrorCode::Changed => HostError::AnalysisChanged,
        ErrorCode::Limit => HostError::AnalysisTooLarge,
        ErrorCode::Cancelled => HostError::AnalysisCancelled,
        ErrorCode::Deadline => HostError::AnalysisTimeout,
    }
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisRow {
    pub id: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub started_at_ms: u64,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub size_bytes: u64,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum AnalysisState {
    Complete,
    Unconfirmed,
    Locked,
    Incompatible,
    Unreadable,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisSignal {
    pub reliable: u32,
    pub estimated: u32,
    pub stale: u32,
    pub unavailable: u32,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    // JSON Number keeps the transport Eq and cannot represent NaN or infinity.
    pub min: Option<serde_json::Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub mean: Option<serde_json::Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub max: Option<serde_json::Number>,
}

#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisLap {
    pub index: u32,
    pub lap: u32,
    pub car: u32,
    pub sealed: bool,
    pub gap: bool,
    pub samples: u32,
    pub lap_time_approx_ms: Option<u32>,
    pub speed: AnalysisSignal,
    pub throttle: AnalysisSignal,
    pub brake: AnalysisSignal,
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
