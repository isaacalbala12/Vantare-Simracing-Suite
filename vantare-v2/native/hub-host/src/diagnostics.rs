//! Allow-listed observed states only. Never export paths, credentials or service text.
use crate::protocol::{CoreStatus, HostError};
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const EVENT_LIMIT: usize = 64;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSection {
    Settings,
    Privacy,
    Services,
    Updates,
}
impl DiagnosticSection {
    pub const ALL: [Self; 4] = [Self::Settings, Self::Privacy, Self::Services, Self::Updates];
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticCode {
    Conflict,
    Protected,
    Busy,
    Io,
    Unavailable,
}
impl DiagnosticCode {
    pub const ALL: [Self; 5] = [
        Self::Conflict,
        Self::Protected,
        Self::Busy,
        Self::Io,
        Self::Unavailable,
    ];
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiagnosticEntry {
    pub section: DiagnosticSection,
    pub code: DiagnosticCode,
    pub sequence: u32,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiagnosticView {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub core: CoreStatus,
    pub settings_protected: bool,
    pub events: Vec<DiagnosticEntry>,
    pub report: Option<String>,
}
#[derive(Default)]
pub struct Observed {
    events: Vec<DiagnosticEntry>,
    sequence: u32,
    report: Option<String>,
}
impl Observed {
    pub fn note(&mut self, section: DiagnosticSection, error: &HostError) {
        let code = match error {
            HostError::Conflict { .. } | HostError::PrivacyConflict { .. } => {
                DiagnosticCode::Conflict
            }
            HostError::Protected => DiagnosticCode::Protected,
            HostError::Busy => DiagnosticCode::Busy,
            HostError::Io => DiagnosticCode::Io,
            _ => DiagnosticCode::Unavailable,
        };
        self.sequence = self.sequence.saturating_add(1);
        self.events.push(DiagnosticEntry {
            section,
            code,
            sequence: self.sequence,
        });
        if self.events.len() > EVENT_LIMIT {
            self.events.remove(0);
        }
    }
    pub fn view(&self, core: &CoreStatus, protected: bool) -> DiagnosticView {
        DiagnosticView {
            version: vantare_ipc::product::VERSION.into(),
            os: std::env::consts::OS.into(),
            arch: std::env::consts::ARCH.into(),
            core: core.clone(),
            settings_protected: protected,
            events: self.events.clone(),
            report: self.report.clone(),
        }
    }
    pub fn prepare(
        &mut self,
        core: &CoreStatus,
        protected: bool,
    ) -> Result<DiagnosticView, HostError> {
        let mut view = self.view(core, protected);
        view.report = None;
        let report = serde_json::json!({"schemaVersion":1,"channel":vantare_ipc::product::CHANNEL,"observed":view,"uninstrumentedSections":["studio","analysis"]});
        self.report = Some(serde_json::to_string_pretty(&report).map_err(|_| HostError::Io)?);
        Ok(self.view(core, protected))
    }
    pub fn copy(&self) -> Result<String, HostError> {
        self.report.clone().ok_or(HostError::Unsupported)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn report_has_only_observed_allow_listed_state_and_bounded_events() {
        let mut observed = Observed::default();
        for _ in 0..=EVENT_LIMIT {
            observed.note(DiagnosticSection::Privacy, &HostError::Io);
        }
        let view = observed
            .prepare(&CoreStatus::default(), true)
            .expect("report");
        assert_eq!(view.events.len(), EVENT_LIMIT);
        let report = view.report.expect("prepared");
        let value: serde_json::Value = serde_json::from_str(&report).expect("JSON");
        assert_eq!(value["schemaVersion"], 1);
        for forbidden in ["token", "email", "path", "session_id", "username"] {
            assert!(!report.contains(forbidden));
        }
        assert_eq!(observed.copy().expect("copy"), report);
    }
}
