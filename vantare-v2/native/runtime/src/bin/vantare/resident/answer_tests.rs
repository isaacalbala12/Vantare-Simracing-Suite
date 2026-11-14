use super::*;
use std::{fs, path::PathBuf};
use vantare_ipc::{
    account_session::AccountGeneration,
    control::{AccessState, Policy},
    launcher::execution::Capability,
};
struct Fixture {
    root: PathBuf,
    owner: Owner,
    request: AnswerChecked,
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if let Some(chain) = &mut self.owner.chain {
            chain.shutdown().unwrap();
        }
        self.owner.chain.take();
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn fixture() -> Fixture {
    let root = std::env::temp_dir().join(format!(
        "answer-resident-{}",
        vantare_services::random_id().unwrap()
    ));
    fs::create_dir_all(&root).unwrap();
    let mut owner = super::super::tests::failure_decision_owner(&root);
    let account: AccountGeneration = "a".repeat(64).try_into().unwrap();
    let extension = owner.status.extension.as_mut().unwrap();
    extension.capabilities.push(Capability::CheckedAnswer);
    let run = extension.begin().unwrap();
    let request = AnswerChecked {
        request: "c".repeat(32).try_into().unwrap(),
        instance: extension.instance.clone(),
        account: account.clone(),
        run,
        revision: "b".repeat(64),
        decision: "42".into(),
        action: Action::Stop,
    };
    owner.active_run = Some(run);
    owner.active_scope = Some(ActiveScope {
        account,
        revision: request.revision.clone(),
    });
    Fixture {
        root,
        owner,
        request,
    }
}
fn observed() -> AccountObservation {
    AccountObservation {
        generation: "a".repeat(64).try_into().unwrap(),
        policy: Policy {
            epoch: 1,
            revision: 1,
            checked_at_ms: vantare_ipc::control::wall_ms().unwrap(),
            ..Policy::denied(AccessState::NoCredential)
        },
    }
}
fn receipt(owner: &Owner) -> OrderReceipt {
    match &owner
        .status
        .extension
        .as_ref()
        .unwrap()
        .events
        .last()
        .unwrap()
        .kind
    {
        EventKind::OrderReceived { receipt, .. } => receipt.clone(),
        other => panic!("expected answer receipt, got {other:?}"),
    }
}
#[test]
fn answer_commits_once_against_run_snapshot_without_rereading_the_edited_document() {
    let mut f = fixture();
    fs::write(&f.owner.path, b"{protected-after-start").unwrap();
    f.owner
        .answer_checked_with(f.request.clone(), || Ok(Some(observed())));
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Accepted { run: f.request.run }
    );
    assert!(f.owner.status.decision.is_none());
    assert!(f.owner.active_run.is_some(), "accepted is not a terminal");
    assert!(
        !f.owner
            .status
            .extension
            .as_ref()
            .unwrap()
            .events
            .iter()
            .any(|e| matches!(e.kind, EventKind::Finished { .. }))
    );
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    f.owner.answer_checked_with(f.request.clone(), || {
        panic!("duplicate must not query authority")
    });
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
    assert_eq!(fs::read(&f.owner.path).unwrap(), b"{protected-after-start");
}
#[test]
fn invalid_targets_and_trust_never_reach_the_worker_or_authority() {
    for (change, reason) in [
        (0, AnswerRejection::WrongInstance),
        (1, AnswerRejection::WrongRun),
        (2, AnswerRejection::RevisionMismatch),
        (3, AnswerRejection::AccountChanged),
        (4, AnswerRejection::StaleQuestion),
        (5, AnswerRejection::InvalidAction),
        (6, AnswerRejection::TrustRequiresEditor),
        (7, AnswerRejection::UnscopedRun),
    ] {
        let mut f = fixture();
        match change {
            0 => f.request.instance = "d".repeat(64).try_into().unwrap(),
            1 => f.request.run = "999".to_owned().try_into().unwrap(),
            2 => f.request.revision = "d".repeat(64),
            3 => f.request.account = "d".repeat(64).try_into().unwrap(),
            4 => f.request.decision = "43".into(),
            5 => f.request.action = Action::Restart,
            6 => {
                f.request.action = Action::Trust;
                f.owner
                    .status
                    .decision
                    .as_mut()
                    .unwrap()
                    .actions
                    .push(Action::Trust);
            }
            7 => f.owner.active_scope = None,
            _ => unreachable!(),
        }
        f.owner.answer_checked_with(f.request.clone(), || {
            panic!("invalid target must not observe authority")
        });
        assert_eq!(
            receipt(&f.owner),
            OrderReceipt::Rejected {
                reason: reason.into()
            }
        );
        assert!(f.owner.status.decision.is_some());
    }
}
#[test]
fn consumption_revalidates_authority_account_and_permission() {
    for case in 0..4 {
        let mut f = fixture();
        let reason = match case {
            0 => AnswerRejection::AuthorityUnavailable,
            1 | 2 => AnswerRejection::AccountChanged,
            _ => {
                f.request.action = Action::Continue;
                AnswerRejection::Denied
            }
        };
        f.owner
            .answer_checked_with(f.request.clone(), || match case {
                0 => Err(std::io::ErrorKind::TimedOut.into()),
                1 => Ok(None),
                2 => {
                    let mut o = observed();
                    o.generation = "e".repeat(64).try_into().unwrap();
                    Ok(Some(o))
                }
                _ => Ok(Some(observed())),
            });
        assert_eq!(
            receipt(&f.owner),
            OrderReceipt::Rejected {
                reason: reason.into()
            }
        );
        assert!(f.owner.status.decision.is_some());
    }
}

#[test]
fn mailbox_consumes_checked_answer_once_and_never_dispatches_a_stale_instance() {
    let mut f = fixture();
    f.request.instance = "e".repeat(64).try_into().unwrap();
    let path = vantare_ipc::launcher::request_path(&f.owner.path);
    fs::write(
        &path,
        serde_json::to_vec(&vantare_ipc::launcher::Request::AnswerChecked(
            f.request.clone(),
        ))
        .unwrap(),
    )
    .unwrap();
    f.owner.request();
    assert!(!path.exists());
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Rejected {
            reason: AnswerRejection::WrongInstance.into()
        }
    );
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    f.owner.request();
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
}
#[test]
fn exhausted_ring_withdraws_checked_surface_without_applying_answer() {
    let mut f = fixture();
    let extension = f.owner.status.extension.as_mut().unwrap();
    let maximum = u64::MAX.to_string().try_into().unwrap();
    extension.events[0].seq = maximum;
    extension.first_retained_seq = maximum;
    f.owner.answer_checked_with(f.request.clone(), || {
        panic!("exhaustion must not query authority")
    });
    assert!(f.owner.status.extension.is_none());
    assert!(f.owner.status.decision.is_some());
}
#[test]
fn question_serial_exhaustion_never_reuses_an_identifier() {
    let mut f = fixture();
    let (sender, receiver) = std::sync::mpsc::channel();
    f.owner.chain.as_mut().unwrap().progress = receiver;
    f.owner.decision_serial = u64::MAX;
    sender
        .send(launcher::chain::Progress {
            step: Some(0),
            status: launcher::chain::Status::Waiting,
            pid: None,
            message: "QA".into(),
            success: false,
            decision: Some(launcher::chain::Decision {
                id: 99,
                message: "QA".into(),
                actions: vec![Action::Stop],
            }),
        })
        .unwrap();
    f.owner.progress();
    assert!(f.owner.status.extension.is_none());
    assert!(f.owner.status.decision.is_none());
    assert_eq!(f.owner.decision_serial, u64::MAX);
}

#[test]
fn continuing_requires_current_launch_permission_and_commits_only_that_question() {
    let mut f = fixture();
    f.request.action = Action::Continue;
    f.owner.answer_checked_with(f.request.clone(), || {
        let mut observation = observed();
        observation.policy.state = AccessState::Active;
        Ok(Some(observation))
    });
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Accepted { run: f.request.run }
    );
    assert!(f.owner.status.decision.is_none());
}
