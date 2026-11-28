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
        review: None,
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

#[test]
fn reviewed_trust_rejects_a_changed_message_or_question_before_authority() {
    for changed_question in [false, true] {
        let mut f = fixture();
        let question = f.owner.status.decision.as_mut().unwrap();
        question.actions.push(Action::Trust);
        question.message = serde_json::json!({
            "name": "QA", "startup": false, "hotkey": "", "firstDelay": 0, "retries": 0,
            "steps": [{"app": "QA", "path": "QA/app.exe", "args": [], "steam": false, "delay": 0}]
        })
        .to_string();
        f.request.action = Action::Trust;
        f.request.review = Some(vantare_ipc::launcher::answer::ReviewProof {
            issued_ms: vantare_ipc::control::wall_ms().unwrap(),
            pages_digest: if changed_question {
                f.request.decision = "43".into();
                vantare_services::content_hash(&vantare_ipc::launcher::review::frame_pages(
                    &vantare_ipc::launcher::review::review_pages(&question.message).unwrap(),
                ))
            } else {
                "0".repeat(64)
            },
        });
        f.owner.answer_checked_with(f.request.clone(), || {
            panic!("changed review must not observe authority")
        });
        assert_eq!(
            receipt(&f.owner),
            OrderReceipt::Rejected {
                reason: AnswerRejection::StaleQuestion.into()
            }
        );
        assert!(f.owner.status.decision.is_some());
    }
}

#[test]
fn legacy_trust_with_the_current_question_is_rejected_without_answering() {
    let mut f = fixture();
    f.owner
        .status
        .decision
        .as_mut()
        .unwrap()
        .actions
        .push(Action::Trust);
    let before = f.owner.chain_decision;
    let path = vantare_ipc::launcher::request_path(&f.owner.path);
    fs::write(&path, br#"{"answer-v2":{"decision":42,"action":"trust"}}"#).unwrap();
    f.owner.request();
    assert!(!path.exists());
    assert_eq!(f.owner.chain_decision, before);
    assert!(f.owner.status.decision.is_some());
    assert_eq!(
        f.owner.status.error.as_deref(),
        Some("trust-requires-editor")
    );
}

#[test]
fn a_disguised_program_path_rejects_trust_even_with_a_proof() {
    // #2579: la prueba se calcula sobre la ruta limpia; la pregunta lleva «.ехе»
    // cirílica o un punto U+2024. La revisión queda bloqueada y no se confía.
    use vantare_ipc::launcher::{
        answer::ReviewProof,
        review::{frame_pages, review_pages},
    };
    let profile = |path: &str| {
        serde_json::json!({
            "name": "QA", "startup": false, "hotkey": "", "firstDelay": 0, "retries": 0,
            "steps": [{"app": "QA", "path": path, "args": [], "steam": false, "delay": 0}]
        })
        .to_string()
    };
    let pages_digest = vantare_services::content_hash(&frame_pages(
        &review_pages(&profile("QA/app.exe")).unwrap(),
    ));
    for path in [
        "QA/app.\u{435}\u{445}\u{435}",
        "QA/app\u{2024}exe",
        "QA/app.exe::$DATA",
        "QA/app.\u{435}\u{445}\u{435}.",
    ] {
        let mut f = fixture();
        let question = f.owner.status.decision.as_mut().unwrap();
        question.actions.push(Action::Trust);
        question.message = profile(path);
        f.request.action = Action::Trust;
        f.request.review = Some(ReviewProof {
            pages_digest: pages_digest.clone(),
            issued_ms: 1_000,
        });
        assert_eq!(
            f.owner.checked_answer_target(&f.request),
            Err(AnswerRejection::Unavailable),
            "{path}"
        );
    }
}

#[test]
fn matching_review_proof_expires_before_the_resident_answers() {
    use vantare_ipc::launcher::{
        answer::ReviewProof,
        review::{frame_pages, review_pages},
    };
    let mut f = fixture();
    let question = f.owner.status.decision.as_mut().unwrap();
    question.actions.push(Action::Trust);
    question.message = serde_json::json!({
        "name": "QA", "startup": false, "hotkey": "", "firstDelay": 0, "retries": 0,
        "steps": [{"app": "QA", "path": "QA/app.exe", "args": [], "steam": false, "delay": 0}]
    })
    .to_string();
    let pages_digest =
        vantare_services::content_hash(&frame_pages(&review_pages(&question.message).unwrap()));
    f.request.action = Action::Trust;
    f.request.review = Some(ReviewProof {
        pages_digest,
        issued_ms: 1_000,
    });
    assert_eq!(
        f.owner.checked_answer_target(&f.request),
        f.owner.chain_decision.ok_or(AnswerRejection::StaleQuestion)
    );
    let mut authority = observed();
    authority.policy.state = AccessState::Active;
    authority.policy.checked_at_ms = 11_001;
    f.owner
        .answer_checked_with_clock(f.request.clone(), || Ok(Some(authority)), || Ok(11_001));
    assert_eq!(
        receipt(&f.owner),
        OrderReceipt::Rejected {
            reason: AnswerRejection::StaleQuestion.into()
        }
    );
    assert!(f.owner.status.decision.is_some());
}

#[test]
fn valid_review_reaches_the_chain_before_any_program_starts() {
    const FIXTURE: &str = "VANTARE_TEST_REVIEW_RESIDENT_ROOT";
    let Some(root) = std::env::var_os(FIXTURE) else {
        let root = std::env::temp_dir().join(format!(
            "resident-reviewed-{}",
            vantare_services::random_id().unwrap()
        ));
        fs::create_dir_all(&root).unwrap();
        let (_, module) = module_path!().split_once("::").unwrap();
        let name = format!("{module}::valid_review_reaches_the_chain_before_any_program_starts");
        let outcome = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", &name, "--nocapture"])
            .env(FIXTURE, &root)
            .env("VANTARE_NATIVE_DATA_ROOT", &root)
            .output()
            .unwrap();
        fs::remove_dir_all(&root).unwrap();
        assert!(
            outcome.status.success()
                && String::from_utf8_lossy(&outcome.stdout).contains("1 passed"),
            "isolated review test failed: {} {}",
            String::from_utf8_lossy(&outcome.stdout),
            String::from_utf8_lossy(&outcome.stderr),
        );
        return;
    };
    run_import_review_fixture(std::path::Path::new(&root));
}

fn run_import_review_fixture(root: &std::path::Path) {
    use vantare_ipc::launcher::{
        answer::ReviewProof,
        review::{frame_pages, review_pages},
    };
    let path = root.join("launcher.json");
    let mut owner = Owner::new(path, false);
    let mut profile = launcher::Profile::new("review-test".into(), "QA".into());
    profile.imported = true;
    profile.first_step_delay = 3600;
    profile.steps.push(launcher::Step {
        app_id: "obs".into(),
        delay_seconds: 0,
        args_override: None,
    });
    let mut discovery = launcher::discovery::Discovery::default();
    discovery.apps.push(launcher::discovery::Detected {
        id: "obs".into(),
        executable: Some(root.join("never-created.exe")),
        availability: launcher::discovery::Availability::default(),
    });
    owner.chain = Some(
        Chain::start(
            owner.document.clone(),
            profile,
            move |_| discovery,
            owner.processes.clone(),
            None,
            &owner.path,
        )
        .unwrap(),
    );
    let question = super::super::tests::first_question(&owner.chain.as_ref().unwrap().progress)
        .1
        .expect("pregunta de confianza");
    assert_eq!(question.actions, [Action::Trust, Action::Cancel]);
    let pages_digest =
        vantare_services::content_hash(&frame_pages(&review_pages(&question.message).unwrap()));
    let run = owner.status.extension.as_mut().unwrap().begin().unwrap();
    let mut authority = observed();
    authority.policy.state = AccessState::Active;
    authority.policy.checked_at_ms = 11_000;
    let revision = "b".repeat(64);
    owner.active_run = Some(run);
    owner.active_scope = Some(ActiveScope {
        account: authority.generation.clone(),
        revision: revision.clone(),
    });
    owner.chain_decision = Some(question.id);
    owner.status.decision = Some(vantare_ipc::launcher::Decision {
        id: question.id,
        message: question.message,
        actions: question.actions,
    });
    let request = AnswerChecked {
        request: "c".repeat(32).try_into().unwrap(),
        instance: owner.status.extension.as_ref().unwrap().instance.clone(),
        account: authority.generation.clone(),
        run,
        revision,
        decision: owner.status.decision.as_ref().unwrap().id.to_string(),
        action: Action::Trust,
        review: Some(ReviewProof {
            pages_digest,
            issued_ms: 1_000,
        }),
    };
    owner.answer_checked_with_clock(request, || Ok(Some(authority)), || Ok(11_000));
    assert_eq!(receipt(&owner), OrderReceipt::Accepted { run });
    assert!(owner.status.decision.is_none());
    assert!(owner.active_run.is_some());
    owner.chain.as_mut().unwrap().shutdown().unwrap();
}
