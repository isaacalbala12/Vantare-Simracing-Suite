use super::super::support::*;
use super::*;
use std::fs;
use vantare_ipc::launcher::{
    execution::{Capability, EventKind},
    results::{RunMode, StepState},
};

fn finished() -> Fixture {
    let mut f = idle(&["lmu", "obs", "lmu", "obs"]);
    let extension = f.owner.status.extension.as_mut().expect("extension");
    extension.capabilities.push(Capability::StepResultsRetry);
    f.owner.active_run = extension.begin();
    f.owner.active_scope = Some(super::super::super::ActiveScope {
        revision: f.revision.clone(),
        account: f.account.clone(),
    });
    f.owner.chain = Some(
        Chain::start_checked(
            f.owner.document.clone(),
            f.owner.document.profiles[0].clone(),
            |_| Discovery::default(),
            f.owner.processes.clone(),
            Some(vec![1, 3]),
            &f.owner.path,
        )
        .expect("fixture chain"),
    );
    f.owner.begin_results("qa".into(), RunMode::Rehearsal, None);
    terminal(&mut f.owner);
    f
}
fn request(f: &Fixture) -> RetryChecked {
    RetryChecked {
        request: "a".repeat(32).try_into().expect("request"),
        instance: f
            .owner
            .status
            .extension
            .as_ref()
            .expect("extension")
            .instance
            .clone(),
        account: f.account.clone(),
        run: f.owner.run_record.as_ref().expect("summary").summary.run,
        profile: "qa".into(),
        revision: f.revision.clone(),
        scope: RetryScope::Failed,
    }
}
#[test]
fn failed_only_then_all_preserves_the_original_rehearsal_selection_and_exact_snapshot() {
    let mut f = finished();
    f.owner.document.profiles[0].steps[3].args_override =
        Some(vec!["stale-cache-must-not-execute".into()]);
    f.owner.run_record.as_mut().unwrap().summary.steps[1].state = StepState::Ready;
    let mut command = request(&f);
    let original = fs::read(&f.owner.path).unwrap();
    let path = f.owner.path.clone();
    let settings = path.clone();
    let processes = f.owner.processes.clone();
    let (release, wait) = std::sync::mpsc::channel();
    let old = command.run;
    f.owner.retry_checked_with(
        command.clone(),
        || {
            fs::write(&path, b"{edited-after-read").unwrap();
            Ok(Some(observed()))
        },
        |document, profile, selected| {
            assert_eq!(serde_json::to_vec(&document).unwrap(), original);
            assert_eq!(selected, vec![3]);
            Chain::start_checked(
                document,
                profile,
                move |_| {
                    wait.recv().unwrap();
                    Discovery::default()
                },
                processes,
                Some(selected),
                &settings,
            )
        },
    );
    let OrderReceipt::Accepted { run } = receipt(&f.owner) else {
        panic!("accepted retry")
    };
    assert!(run > old);
    assert_eq!(f.owner.run_record.as_ref().unwrap().original, vec![1, 3]);
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    f.owner.retry_checked_with(
        command,
        || panic!("duplicate authority"),
        |_, _, _| panic!("duplicate start"),
    );
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
    release.send(()).unwrap();
    terminal(&mut f.owner);
    fs::write(&f.owner.path, &original).unwrap();
    command = request(&f);
    command.request = "b".repeat(32).try_into().unwrap();
    command.scope = RetryScope::All;
    let settings = f.owner.path.clone();
    let processes = f.owner.processes.clone();
    f.owner.retry_checked_with(
        command,
        || Ok(Some(observed())),
        |document, profile, selected| {
            assert_eq!(
                selected,
                vec![1, 3],
                "All restores the original rehearsal, not only the last retry"
            );
            Chain::start_checked(
                document,
                profile,
                |_| Discovery::default(),
                processes,
                Some(selected),
                &settings,
            )
        },
    );
    terminal(&mut f.owner);
    let summary = &f.owner.run_record.as_ref().unwrap().summary;
    assert_eq!(summary.mode, RunMode::Rehearsal);
    assert_eq!(
        summary.steps.iter().map(|s| s.state).collect::<Vec<_>>(),
        vec![
            StepState::NotSelected,
            StepState::Failed,
            StepState::NotSelected,
            StepState::Failed
        ]
    );
    assert!(summary.outcome.is_some());
}
#[test]
fn incomplete_unknown_evicted_or_changed_run_never_queries_authority_or_starts() {
    for case in 0..10 {
        let mut f = finished();
        let mut command = request(&f);
        let reason = match case {
            0 => {
                f.owner.run_record = None;
                OrderRejection::UnknownRun
            }
            1 => {
                f.owner.run_record.as_mut().unwrap().summary.outcome = None;
                OrderRejection::UnknownRun
            }
            2 => {
                f.owner
                    .status
                    .extension
                    .as_mut()
                    .unwrap()
                    .events
                    .retain(|e| !matches!(e.kind, EventKind::Finished { .. }));
                OrderRejection::UnknownRun
            }
            3 => {
                command.run = "999".to_owned().try_into().unwrap();
                OrderRejection::UnknownRun
            }
            4 => {
                command.account = "f".repeat(64).try_into().unwrap();
                OrderRejection::AccountChanged
            }
            5 => {
                command.revision = "f".repeat(64);
                OrderRejection::RevisionMismatch
            }
            6 => {
                command.profile = "missing".into();
                OrderRejection::UnknownRun
            }
            7 => {
                f.owner.status.extension.as_mut().unwrap().begin().unwrap();
                OrderRejection::UnknownRun
            }
            8 => {
                command.instance = "f".repeat(64).try_into().unwrap();
                OrderRejection::WrongInstance
            }
            _ => {
                f.owner.chain = Some(
                    Chain::start_checked(
                        f.owner.document.clone(),
                        f.owner.document.profiles[0].clone(),
                        |_| Discovery::default(),
                        f.owner.processes.clone(),
                        Some(vec![1, 3]),
                        &f.owner.path,
                    )
                    .unwrap(),
                );
                OrderRejection::Busy
            }
        };
        f.owner.retry_checked_with(
            command,
            || panic!("precondition failed"),
            |_, _, _| panic!("precondition failed"),
        );
        assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
    }
}
#[test]
fn only_failed_steps_are_eligible_and_document_changes_never_fall_back_to_cache() {
    for case in 0..5 {
        let mut f = finished();
        let command = request(&f);
        let reason = match case {
            0 => {
                for step in &mut f.owner.run_record.as_mut().unwrap().summary.steps {
                    if step.state == StepState::Failed {
                        step.state = StepState::Cancelled;
                    }
                }
                OrderRejection::NoFailedSteps
            }
            1 => {
                let mut bytes = fs::read(&f.owner.path).unwrap();
                bytes.push(b'\n');
                fs::write(&f.owner.path, bytes).unwrap();
                OrderRejection::RevisionMismatch
            }
            2 => {
                fs::remove_file(&f.owner.path).unwrap();
                OrderRejection::DocumentUnavailable
            }
            3 => {
                fs::write(&f.owner.path, br#"{"version":99,"future":"preserve"}"#).unwrap();
                OrderRejection::RevisionMismatch
            }
            _ => {
                let mut doc = f.owner.document.clone();
                doc.profiles[0].steps.clear();
                fs::write(&f.owner.path, serde_json::to_vec(&doc).unwrap()).unwrap();
                OrderRejection::RevisionMismatch
            }
        };
        let bytes = fs::read(&f.owner.path).ok();
        f.owner.retry_checked_with(
            command,
            || panic!("no authority for invalid document/selection"),
            |_, _, _| panic!("no start"),
        );
        assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        assert_eq!(fs::read(&f.owner.path).ok(), bytes);
        assert!(f.owner.chain.is_none());
    }
}
#[test]
fn account_and_policy_failures_and_start_errors_are_typed() {
    for case in 0..7 {
        let mut f = finished();
        let command = request(&f);
        let reason = match case {
            0 => OrderRejection::AuthorityUnavailable,
            1 | 2 => OrderRejection::AccountChanged,
            3 => OrderRejection::Denied,
            4 => OrderRejection::Busy,
            _ => OrderRejection::StartFailed,
        };
        f.owner.retry_checked_with(
            command,
            || match case {
                0 => Err(std::io::ErrorKind::TimedOut.into()),
                1 => Ok(None),
                _ => {
                    let mut o = observed();
                    if case == 2 {
                        o.generation = "f".repeat(64).try_into().unwrap();
                    }
                    if case == 3 {
                        o.policy.live = true;
                    }
                    Ok(Some(o))
                }
            },
            |_, _, _| match case {
                4 => Err(StartError::Busy("fixture".into())),
                5 => Err(StartError::Invalid("fixture".into())),
                6 => Err(StartError::Io("fixture".into())),
                _ => panic!("not authorized"),
            },
        );
        assert_eq!(receipt(&f.owner), OrderReceipt::Rejected { reason });
        assert!(f.owner.chain.is_none());
    }
}

#[test]
fn an_incomplete_worker_snapshot_or_a_new_unscoped_run_cannot_reuse_previous_results() {
    let mut f = finished();
    let (release, wait) = std::sync::mpsc::channel();
    f.owner.chain = Some(
        Chain::start_checked(
            f.owner.document.clone(),
            f.owner.document.profiles[0].clone(),
            move |_| {
                wait.recv().unwrap();
                Discovery::default()
            },
            f.owner.processes.clone(),
            Some(vec![1, 3]),
            &f.owner.path,
        )
        .unwrap(),
    );
    f.owner.active_run = f.owner.status.extension.as_mut().unwrap().begin();
    f.owner.active_scope = None;
    f.owner.begin_results("qa".into(), RunMode::Rehearsal, None);
    let unscoped_is_unknown = f.owner.run_record.is_none();
    f.owner.active_scope = Some(super::super::super::ActiveScope {
        revision: f.revision.clone(),
        account: f.account.clone(),
    });
    f.owner.begin_results("qa".into(), RunMode::Rehearsal, None);
    let mut chain = f.owner.chain.take().unwrap();
    f.owner.finish_results(
        f.owner.active_run.unwrap(),
        super::super::super::ChainOutcome::Failed {
            reason: super::super::super::ChainFailure::StepFailed,
        },
        &chain,
    );
    let incomplete_is_unknown = f.owner.run_record.is_none();
    release.send(()).unwrap();
    chain.shutdown().unwrap();
    assert!(unscoped_is_unknown);
    assert!(
        incomplete_is_unknown,
        "a terminal value without a complete worker snapshot cannot enable retry"
    );
}

#[cfg(windows)]
#[test]
fn real_mailbox_retry_consumes_once_and_keeps_the_original_rehearsal_selection() {
    use std::time::Duration;
    use vantare_ipc::{
        account_session, control,
        launcher::{Request, request_path},
        transport::{Event, Listener},
    };
    let mut f = finished();
    let command = request(&f);
    let link = account_session::AuthorityLink {
        pipe: format!("retry-owner-{}", vantare_services::random_id().unwrap()),
        image: std::env::current_exe().unwrap(),
    };
    let stop = Arc::new(Event::new().unwrap());
    let mut listener =
        Listener::new(&link.pipe, Arc::clone(&stop), Duration::from_secs(2)).unwrap();
    let mut pipe = listener.instance().unwrap();
    let (ready, started) = std::sync::mpsc::channel();
    let server = std::thread::spawn(move || {
        ready.send(()).unwrap();
        match pipe.accept() {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => return,
            Err(error) => panic!("fixture accept: {error}"),
        }
        let message = control::read_request(&mut pipe).unwrap();
        assert!(matches!(
            message.command,
            control::Command::ReadAccountSession {}
        ));
        assert_eq!(message.nonce, "");
        control::write(
            &mut pipe,
            &account_session::ControlResponse {
                version: control::VERSION,
                sequence: message.sequence,
                observation: Some(observed()),
            },
        )
        .unwrap();
    });
    started.recv().unwrap();
    f.owner.authority = Some(link);
    let bytes = serde_json::to_vec(&Request::RetryChecked(command)).unwrap();
    fs::write(request_path(&f.owner.path), &bytes).unwrap();
    f.owner.request();
    stop.set();
    server.join().unwrap();
    assert!(!request_path(&f.owner.path).exists());
    let OrderReceipt::Accepted { run } = receipt(&f.owner) else {
        panic!("accepted retry")
    };
    terminal(&mut f.owner);
    let record = f.owner.run_record.as_ref().unwrap();
    assert_eq!(record.summary.run, run);
    assert_eq!(record.original, vec![1, 3]);
    assert!(matches!(
        record.summary.steps[0].state,
        StepState::NotSelected
    ));
    assert!(matches!(
        record.summary.steps[2].state,
        StepState::NotSelected
    ));
    let count = f.owner.status.extension.as_ref().unwrap().events.len();
    fs::write(request_path(&f.owner.path), bytes).unwrap();
    f.owner.request();
    assert_eq!(
        f.owner.status.extension.as_ref().unwrap().events.len(),
        count
    );
    assert!(!request_path(&f.owner.path).exists());
}
