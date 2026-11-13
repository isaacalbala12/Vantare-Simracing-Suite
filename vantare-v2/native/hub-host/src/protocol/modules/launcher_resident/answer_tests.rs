use super::*;
use crate::launcher_resident::ResidentAnswerRejection as R;
use std::path::PathBuf;
use vantare_ipc::{
    account_session::AccountObservation,
    control::{AccessState, Policy},
    launcher::{
        Decision, Status,
        answer::QuestionScope,
        execution::{Capability, ExecutionStatus},
    },
};
struct Fixture {
    root: PathBuf,
    path: PathBuf,
    target: ResidentAnswerTarget,
    status: Status,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}
fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "host-answer-{}",
        vantare_services::random_id().unwrap()
    ));
    std::fs::create_dir_all(&root).unwrap();
    let path = root.join("launcher.json");
    let mut extension = ExecutionStatus::new("b".repeat(64).try_into().unwrap());
    extension.capabilities.push(Capability::CheckedAnswer);
    let run = extension.begin().unwrap();
    extension.question = Some(QuestionScope {
        decision: "9007199254740993".into(),
        run,
        revision: "c".repeat(64),
        account: "a".repeat(64).try_into().unwrap(),
    });
    let target = ResidentAnswerTarget {
        instance: extension.instance.clone().into(),
        run: run.into(),
        revision: "c".repeat(64),
        account_generation: "a".repeat(64),
        decision: "9007199254740993".into(),
        action: ResidentAction::Stop,
    };
    Fixture {
        root,
        path,
        target,
        status: Status {
            version: native::VERSION,
            updated_ms: native::now_ms(),
            running: true,
            decision: Some(Decision {
                id: 9_007_199_254_740_993,
                message: "private path --args".into(),
                actions: vec![native::Action::Stop, native::Action::Continue],
            }),
            extension: Some(extension),
            ..Default::default()
        },
    }
}
impl Fixture {
    fn save(&mut self) {
        self.status.updated_ms = native::now_ms();
        std::fs::write(
            native::status_path(&self.path),
            serde_json::to_vec(&self.status).unwrap(),
        )
        .unwrap();
    }
}
fn observation() -> AccountObservation {
    AccountObservation {
        generation: "a".repeat(64).try_into().unwrap(),
        policy: Policy {
            epoch: 1,
            revision: 1,
            checked_at_ms: vantare_ipc::control::wall_ms().unwrap(),
            ..Policy::denied(AccessState::Revoked)
        },
    }
}
#[test]
fn queues_only_exact_scoped_values_without_document_reload_and_never_overwrites_a_request() {
    let mut f = fixture();
    std::fs::write(&f.path, b"{edited-after-run-start").unwrap();
    f.save();
    let ResidentQueued::Queued { request } =
        answer(&f.path, Some(&observation()), &f.target).unwrap();
    let bytes = std::fs::read(native::request_path(&f.path)).unwrap();
    let native::Request::AnswerChecked(payload) = serde_json::from_slice(&bytes).unwrap() else {
        panic!("answer-v3 only");
    };
    assert_eq!(String::from(payload.request), request);
    assert_eq!(payload.decision, f.target.decision);
    assert_eq!(payload.revision, f.target.revision);
    assert_eq!(String::from(payload.account), f.target.account_generation);
    assert_eq!(String::from(payload.instance), f.target.instance);
    assert_eq!(String::from(payload.run), f.target.run);
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::Busy)
    );
    assert_eq!(std::fs::read(native::request_path(&f.path)).unwrap(), bytes);
}
#[test]
fn every_invalid_target_is_typed_and_does_not_write_the_mailbox() {
    for (case, reason) in [
        (0, R::TrustRequiresEditor),
        (1, R::WrongInstance),
        (2, R::AccountChanged),
        (3, R::WrongRun),
        (4, R::RevisionMismatch),
        (5, R::StaleQuestion),
        (6, R::InvalidAction),
    ] {
        let mut f = fixture();
        match case {
            0 => f.target.action = ResidentAction::Trust,
            1 => f.target.instance = "e".repeat(64),
            2 => f.target.account_generation = "e".repeat(64),
            3 => f.target.run = "2".into(),
            4 => f.target.revision = "e".repeat(64),
            5 => f.target.decision = "9007199254740994".into(),
            6 => f.target.action = ResidentAction::Restart,
            _ => unreachable!(),
        }
        f.save();
        assert_eq!(
            answer(&f.path, Some(&observation()), &f.target),
            Err(HostError::ResidentAnswerRejected { reason })
        );
        assert!(!native::request_path(&f.path).exists());
    }
}
#[test]
fn missing_old_stale_finished_or_unscoped_status_never_falls_back_to_answer_v2() {
    let mut f = fixture();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::CoreUnavailable)
    );
    f.status.extension.as_mut().unwrap().capabilities.clear();
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::Unsupported)
    );
    f.status
        .extension
        .as_mut()
        .unwrap()
        .capabilities
        .push(Capability::CheckedAnswer);
    f.save();
    assert_eq!(
        answer(&f.path, None, &f.target),
        Err(HostError::CoreUnavailable)
    );
    f.status.running = false;
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::ResidentAnswerRejected {
            reason: R::WrongRun
        })
    );
    f.status.running = true;
    f.status.extension.as_mut().unwrap().question = None;
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::ResidentAnswerRejected {
            reason: R::UnscopedRun
        })
    );
    assert!(!native::request_path(&f.path).exists());
}

#[test]
fn continuing_is_denied_without_permission_and_allowed_only_with_a_fresh_launch_policy() {
    let mut f = fixture();
    f.target.action = ResidentAction::Continue;
    f.save();
    assert_eq!(
        answer(&f.path, Some(&observation()), &f.target),
        Err(HostError::ResidentAnswerRejected { reason: R::Denied })
    );
    assert!(!native::request_path(&f.path).exists());
    let mut current = observation();
    current.policy.state = AccessState::Active;
    assert!(matches!(
        answer(&f.path, Some(&current), &f.target),
        Ok(ResidentQueued::Queued { .. })
    ));
}

#[test]
fn a_new_observed_account_cannot_answer_the_previous_accounts_question() {
    let mut f = fixture();
    f.save();
    let mut current = observation();
    current.generation = "e".repeat(64).try_into().unwrap();
    assert_eq!(
        answer(&f.path, Some(&current), &f.target),
        Err(HostError::ResidentAnswerRejected { reason: R::AccountChanged })
    );
    assert!(!native::request_path(&f.path).exists());
}
