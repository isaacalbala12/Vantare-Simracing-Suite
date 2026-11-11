//! Read-only resident mailbox projection. No request writer or process ownership.
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, time::Instant};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::launcher as mailbox;
#[path = "document_cache.rs"]
mod document_cache;

pub const DECISION_ID_MAX: usize = 20;
pub const DECISION_ID_PATTERN: &str = "^(0|[1-9][0-9]*)$";
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentAction {
    Trust,
    Reuse,
    Restart,
    Cancel,
    Stop,
    Continue,
    Leave,
    CloseStarted,
}
impl ResidentAction {
    pub const ALL: [Self; 8] = [
        Self::Trust,
        Self::Reuse,
        Self::Restart,
        Self::Cancel,
        Self::Stop,
        Self::Continue,
        Self::Leave,
        Self::CloseStarted,
    ];
    pub fn label(self) -> &'static str {
        self.native().label()
    }
    fn native(self) -> mailbox::Action {
        match self {
            Self::Trust => mailbox::Action::Trust,
            Self::Reuse => mailbox::Action::Reuse,
            Self::Restart => mailbox::Action::Restart,
            Self::Cancel => mailbox::Action::Cancel,
            Self::Stop => mailbox::Action::Stop,
            Self::Continue => mailbox::Action::Continue,
            Self::Leave => mailbox::Action::Leave,
            Self::CloseStarted => mailbox::Action::CloseStarted,
        }
    }
    fn from_native(action: mailbox::Action) -> Self {
        match action {
            mailbox::Action::Trust => Self::Trust,
            mailbox::Action::Reuse => Self::Reuse,
            mailbox::Action::Restart => Self::Restart,
            mailbox::Action::Cancel => Self::Cancel,
            mailbox::Action::Stop => Self::Stop,
            mailbox::Action::Continue => Self::Continue,
            mailbox::Action::Leave => Self::Leave,
            mailbox::Action::CloseStarted => Self::CloseStarted,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum ResidentQuestionKind {
    Authorization,
    AlreadyRunning,
    Failure,
    Closing,
    Generic,
}
impl ResidentQuestionKind {
    pub const ALL: [Self; 5] = [
        Self::Authorization,
        Self::AlreadyRunning,
        Self::Failure,
        Self::Closing,
        Self::Generic,
    ];
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentChoice {
    pub id: ResidentAction,
    pub label: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentQuestion {
    // Decimal string preserves all u64 values through JavaScript, without precision loss.
    pub id: String,
    pub kind: ResidentQuestionKind,
    pub actions: Vec<ResidentChoice>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[allow(clippy::struct_excessive_bools)] // Independent document, freshness, execution and error observations.
pub struct ResidentView {
    pub protected: bool,
    pub online: bool,
    pub running: bool,
    pub error: bool,
    pub decision: Option<ResidentQuestion>,
    pub registrations: Vec<crate::shortcuts::ProfileShortcut>,
}
fn question(decision: &mailbox::Decision) -> Option<ResidentQuestion> {
    if decision.actions.is_empty() || decision.actions.len() > ResidentAction::ALL.len() {
        return None;
    }
    let mut seen = Vec::new();
    for action in &decision.actions {
        if seen.contains(action) {
            return None;
        }
        seen.push(*action);
    }
    let has = |action| decision.actions.contains(&action);
    let kind = if has(mailbox::Action::Trust) {
        ResidentQuestionKind::Authorization
    } else if has(mailbox::Action::Reuse) || has(mailbox::Action::Restart) {
        ResidentQuestionKind::AlreadyRunning
    } else if has(mailbox::Action::Stop) || has(mailbox::Action::Continue) {
        ResidentQuestionKind::Failure
    } else if has(mailbox::Action::Leave) || has(mailbox::Action::CloseStarted) {
        ResidentQuestionKind::Closing
    } else {
        ResidentQuestionKind::Generic
    };
    Some(ResidentQuestion {
        id: decision.id.to_string(),
        kind,
        actions: decision
            .actions
            .iter()
            .map(|action| ResidentChoice {
                id: ResidentAction::from_native(*action),
                label: action.label().into(),
            })
            .collect(),
    })
}

pub struct State {
    path: PathBuf,
    last: Option<Instant>,
    observed: Option<ResidentView>,
    document: document_cache::Cache,
    #[cfg(test)]
    status_reads: usize,
}
impl State {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            last: None,
            observed: None,
            document: document_cache::Cache::default(),
            #[cfg(test)]
            status_reads: 0,
        }
    }
    pub fn view(&mut self) -> ResidentView {
        if self.path.is_absolute() && !vantare_launcher::is_local_path(&self.path) {
            return ResidentView {
                protected: true,
                ..Default::default()
            };
        }
        #[cfg(test)]
        {
            self.status_reads += 1;
        }
        let status = mailbox::read_status(&self.path);
        let mut view = ResidentView {
            online: status.is_some(),
            running: status.as_ref().is_some_and(|s| s.running),
            error: status.as_ref().is_some_and(|s| s.error.is_some()),
            decision: status
                .as_ref()
                .and_then(|s| s.decision.as_ref())
                .and_then(question),
            ..Default::default()
        };
        let (protected, mut registrations) = self.document.read(&self.path);
        for registration in &mut registrations {
            registration.state = crate::shortcuts::registration_state(
                &registration.id,
                &registration.hotkey,
                status.as_ref(),
            );
        }
        view.protected = protected;
        view.registrations = registrations;
        view
    }
    #[cfg(test)]
    pub(crate) fn io_counts(&self) -> (usize, usize) {
        (self.status_reads, self.document.reads)
    }
    pub fn observed(&mut self, now: Instant) -> ResidentView {
        let view = self.view();
        self.last = Some(now);
        self.observed = Some(view.clone());
        view
    }
    pub fn reset(&mut self) {
        self.last = None;
        self.observed = None;
    }
    pub fn changed(&mut self, now: Instant) -> Option<ResidentView> {
        if self
            .last
            .is_some_and(|last| now.saturating_duration_since(last).as_millis() < 500)
        {
            return None;
        }
        self.last = Some(now);
        let view = self.view();
        if self.observed.as_ref() == Some(&view) {
            return None;
        }
        self.observed = Some(view.clone());
        Some(view)
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
