//! Safe resident projection and the existing answer-v2 mailbox. No process ownership.
use crate::protocol::{CoreStatus, HostError, LinkState};
use serde::{Deserialize, Serialize};
use std::path::Path;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::{files, launcher as mailbox};
use vantare_launcher::Document;

pub const DECISION_ID_MAX: usize = 20;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum AnswerAction {
    Trust,
    Reuse,
    Restart,
    Cancel,
    Stop,
    Continue,
    Leave,
    CloseStarted,
}
impl AnswerAction {
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
pub enum QuestionKind {
    Authorization,
    AlreadyRunning,
    Failure,
    Closing,
    Generic,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnswerChoice {
    pub id: AnswerAction,
    pub label: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Question {
    // Decimal string preserves all u64 values through JavaScript, without precision loss.
    pub id: String,
    pub kind: QuestionKind,
    pub actions: Vec<AnswerChoice>,
    pub dismiss: AnswerAction,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentView {
    pub online: bool,
    pub running: bool,
    pub error: bool,
    pub decision: Option<Question>,
    pub registrations: Vec<crate::shortcuts::ProfileShortcut>,
}
fn question(decision: &mailbox::Decision) -> Option<Question> {
    if decision.actions.is_empty() || decision.actions.len() > AnswerAction::ALL.len() {
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
        QuestionKind::Authorization
    } else if has(mailbox::Action::Reuse) || has(mailbox::Action::Restart) {
        QuestionKind::AlreadyRunning
    } else if has(mailbox::Action::Stop) || has(mailbox::Action::Continue) {
        QuestionKind::Failure
    } else if has(mailbox::Action::Leave) || has(mailbox::Action::CloseStarted) {
        QuestionKind::Closing
    } else {
        QuestionKind::Generic
    };
    Some(Question {
        id: decision.id.to_string(),
        kind,
        actions: decision
            .actions
            .iter()
            .map(|action| AnswerChoice {
                id: AnswerAction::from_native(*action),
                label: action.label().into(),
            })
            .collect(),
        dismiss: if has(mailbox::Action::Leave) {
            AnswerAction::Leave
        } else {
            AnswerAction::Cancel
        },
    })
}
#[derive(Default)]
pub struct Reader {
    answered: Option<u64>,
}
impl Reader {
    pub fn view(&self, document: &Document, status: Option<&mailbox::Status>) -> ResidentView {
        let status = status.filter(|status| mailbox::is_fresh(status));
        ResidentView {
            online: status.is_some(),
            running: status.is_some_and(|status| status.running),
            error: status.is_some_and(|status| status.error.is_some()),
            decision: status
                .and_then(|status| status.decision.as_ref())
                .filter(|decision| self.answered != Some(decision.id))
                .and_then(question),
            registrations: crate::shortcuts::project(document, status).profiles,
        }
    }
    pub fn answer(
        &mut self,
        path: &Path,
        core: &CoreStatus,
        decision: &str,
        action: AnswerAction,
    ) -> Result<bool, HostError> {
        if core.rights != LinkState::Connected
            || !core.access.verified
            || core.access.blocked
            || core.live
            || (path.is_absolute() && !vantare_launcher::is_local_path(path))
        {
            return Err(HostError::Denied);
        }
        if decision.is_empty() || decision.len() > DECISION_ID_MAX {
            return Err(HostError::Denied);
        }
        let id = decision.parse::<u64>().map_err(|_| HostError::Denied)?;
        if id.to_string() != decision || self.answered == Some(id) {
            return Err(HostError::Denied);
        }
        let status = mailbox::read_status(path).ok_or(HostError::CoreUnavailable)?;
        let current = status
            .decision
            .as_ref()
            .filter(|current| current.id == id)
            .ok_or(HostError::Denied)?;
        question(current).ok_or(HostError::Denied)?;
        let action = action.native();
        // Same dismissal rule as resident.rs: Cancel also dismisses Stop/Continue,
        // while closing decisions retain Leave/CloseStarted and dismiss as Leave.
        let allowed = current.actions.contains(&action)
            || (action == mailbox::Action::Cancel
                && !current.actions.contains(&mailbox::Action::Leave));
        if !allowed {
            return Err(HostError::Denied);
        }
        let bytes = serde_json::to_vec(&mailbox::Request::Answer {
            decision: id,
            action,
        })
        .map_err(|_| HostError::Io)?;
        files::save(
            &mailbox::request_path(path),
            &bytes,
            files::Mode::Observed(None),
            &files::Options::default(),
        )
        .map_err(|error| {
            if error.kind().is_conflict() || error.kind() == files::Kind::Busy {
                HostError::Busy
            } else {
                HostError::Io
            }
        })?;
        self.answered = Some(id);
        Ok(true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn status(id: u64, actions: Vec<mailbox::Action>) -> mailbox::Status {
        mailbox::Status {
            version: mailbox::VERSION,
            updated_ms: mailbox::now_ms(),
            running: true,
            progress: r"C:\Users\private\app.exe --private".into(),
            error: Some(r"C:\Users\private\error".into()),
            decision: Some(mailbox::Decision {
                id,
                message: r"C:\Users\private\app.exe --private".into(),
                actions,
            }),
            ..Default::default()
        }
    }
    #[test]
    fn action_ids_and_labels_match_the_existing_native_mailbox() {
        assert_eq!(
            AnswerAction::ALL.map(AnswerAction::native),
            mailbox::Action::ALL
        );
        for action in mailbox::Action::ALL {
            assert_eq!(AnswerAction::from_native(action).native(), action);
            assert_eq!(
                serde_json::to_string(&AnswerAction::from_native(action)).expect("wire"),
                serde_json::to_string(&action).expect("native wire")
            );
        }
    }
    #[test]
    fn projection_drops_all_free_messages_and_preserves_u64_ids_and_native_labels() {
        let document = Document::fresh_install();
        let status = status(
            u64::MAX,
            vec![mailbox::Action::Trust, mailbox::Action::Cancel],
        );
        let view = Reader::default().view(&document, Some(&status));
        let decision = view.decision.as_ref().expect("decision");
        assert_eq!(decision.id, u64::MAX.to_string());
        assert_eq!(decision.kind, QuestionKind::Authorization);
        assert_eq!(decision.actions[0].label, mailbox::Action::Trust.label());
        let json = serde_json::to_string(&view).expect("view");
        for forbidden in [
            "Users", "private", "exe", "progress", "message", "args", "\\\\",
        ] {
            assert!(!json.contains(forbidden));
        }
    }
    #[test]
    fn stale_status_never_claims_registration_and_escape_matches_the_gpui() {
        let mut document = Document::fresh_install();
        document.profiles[0].hotkey = "ctrl+shift+1".into();
        let mut status = status(7, vec![mailbox::Action::Stop, mailbox::Action::Continue]);
        status.profiles.push(mailbox::Registration {
            profile: document.profiles[0].id.clone(),
            hotkey: document.profiles[0].hotkey.clone(),
            registered: true,
            error: None,
        });
        let reader = Reader::default();
        let fresh = reader.view(&document, Some(&status));
        assert_eq!(
            fresh.registrations[0].state,
            crate::shortcuts::RegistrationState::Registered
        );
        assert_eq!(
            fresh.decision.expect("decision").dismiss,
            AnswerAction::Cancel
        );
        status.decision.as_mut().expect("decision").actions =
            vec![mailbox::Action::Leave, mailbox::Action::CloseStarted];
        assert_eq!(
            reader
                .view(&document, Some(&status))
                .decision
                .expect("closing")
                .dismiss,
            AnswerAction::Leave
        );
        status.updated_ms = 0;
        let stale = reader.view(&document, Some(&status));
        assert!(!stale.online && !stale.running && !stale.error);
        assert!(stale.decision.is_none());
        assert_eq!(
            stale.registrations[0].state,
            crate::shortcuts::RegistrationState::Unconfirmed
        );
    }
    #[cfg(windows)]
    fn core() -> CoreStatus {
        CoreStatus {
            rights: LinkState::Connected,
            access: crate::protocol::AccessView {
                verified: true,
                ..Default::default()
            },
            ..Default::default()
        }
    }
    #[cfg(windows)]
    fn publish(path: &Path, status: &mailbox::Status) {
        std::fs::write(
            mailbox::status_path(path),
            serde_json::to_vec(status).expect("status"),
        )
        .expect("QA status");
    }
    #[cfg(windows)]
    #[test]
    fn obsolete_ids_and_unavailable_actions_have_zero_mailbox_effects() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut reader = Reader::default();
        publish(
            &path,
            &status(9, vec![mailbox::Action::Stop, mailbox::Action::Continue]),
        );
        for id in ["8", "09", "-9", "9\0", "18446744073709551616"] {
            assert_eq!(
                reader.answer(&path, &core(), id, AnswerAction::Stop),
                Err(HostError::Denied)
            );
        }
        assert_eq!(
            reader.answer(&path, &core(), "9", AnswerAction::Restart),
            Err(HostError::Denied)
        );
        assert!(!mailbox::request_path(&path).exists());
        assert!(
            reader
                .view(
                    &Document::fresh_install(),
                    mailbox::read_status(&path).as_ref()
                )
                .decision
                .is_some()
        );
    }
    #[cfg(windows)]
    #[test]
    fn answered_decision_is_enqueued_once_and_not_reopened_from_the_old_status() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut reader = Reader::default();
        let current = status(
            u64::MAX,
            vec![mailbox::Action::Stop, mailbox::Action::Continue],
        );
        publish(&path, &current);
        assert_eq!(
            reader.answer(&path, &core(), &u64::MAX.to_string(), AnswerAction::Cancel),
            Ok(true)
        );
        let bytes = std::fs::read(mailbox::request_path(&path)).expect("mailbox");
        assert!(matches!(
            serde_json::from_slice::<mailbox::Request>(&bytes).expect("request"),
            mailbox::Request::Answer {
                decision: u64::MAX,
                action: mailbox::Action::Cancel
            }
        ));
        assert!(
            reader
                .view(&Document::fresh_install(), Some(&current))
                .decision
                .is_none()
        );
        assert_eq!(
            reader.answer(
                &path,
                &core(),
                &u64::MAX.to_string(),
                AnswerAction::Continue
            ),
            Err(HostError::Denied)
        );
        assert_eq!(
            std::fs::read(mailbox::request_path(&path)).expect("untouched"),
            bytes
        );
    }
    #[cfg(windows)]
    #[test]
    fn busy_preserves_the_pending_question_and_never_overwrites_an_existing_request() {
        let root = crate::test_support::Root::new();
        let path = root.path.join("launcher.json");
        let mut reader = Reader::default();
        let current = status(
            9,
            vec![mailbox::Action::Leave, mailbox::Action::CloseStarted],
        );
        publish(&path, &current);
        assert_eq!(
            reader.answer(&path, &core(), "9", AnswerAction::Cancel),
            Err(HostError::Denied)
        );
        std::fs::write(mailbox::request_path(&path), b"existing QA request").expect("occupied");
        assert_eq!(
            reader.answer(&path, &core(), "9", AnswerAction::Leave),
            Err(HostError::Busy)
        );
        assert_eq!(
            std::fs::read(mailbox::request_path(&path)).expect("untouched"),
            b"existing QA request"
        );
        assert!(
            reader
                .view(&Document::fresh_install(), Some(&current))
                .decision
                .is_some()
        );
        std::fs::remove_file(mailbox::request_path(&path)).expect("QA resident consumes request");
        assert_eq!(
            reader.answer(&path, &core(), "9", AnswerAction::Leave),
            Ok(true)
        );
    }
    #[test]
    fn answers_require_non_live_verified_core_before_reading_files() {
        let mut reader = Reader::default();
        assert_eq!(
            reader.answer(
                Path::new("missing"),
                &CoreStatus::default(),
                "9",
                AnswerAction::Cancel
            ),
            Err(HostError::Denied)
        );
    }
}
