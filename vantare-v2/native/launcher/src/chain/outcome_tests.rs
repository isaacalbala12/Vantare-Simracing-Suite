use super::*;
use std::cell::{Cell, RefCell};

struct Fixture {
    document: Document,
    profile: Profile,
    context: RunContext,
    events: Receiver<Progress>,
    answers: Sender<(u64, Action)>,
}
fn fixture() -> Fixture {
    let document = Document::default();
    let mut profile = Profile::new("terminal-qa".into(), "QA".into());
    profile.steps = document
        .apps
        .iter()
        .take(2)
        .map(|app| Step {
            app_id: app.id.clone(),
            delay_seconds: 0,
            args_override: None,
        })
        .collect();
    profile.set_policy(super::super::policy::Policy {
        failure: Failure::Continue,
        cancel: Close::Leave,
        exit: Close::Leave,
        ..Default::default()
    });
    let (sender, events) = mpsc::channel();
    let (answers, replies) = mpsc::channel();
    Fixture {
        document,
        profile,
        events,
        answers,
        context: RunContext {
            cancel: Arc::new(Cancellation::default()),
            sender,
            answers: replies,
            pending: Arc::new(Pending::default()),
            processes: Arc::new(Mutex::new(processes::Processes::default())),
            next_decision: AtomicU64::new(1),
            selected: vec![0, 1],
            failure: Mutex::new(None),
            trust_declined: AtomicBool::new(false),
        },
    }
}
fn root() -> std::path::PathBuf {
    let base = std::env::temp_dir();
    base.join(format!(
        "terminal-{}",
        vantare_services::random_id().expect("isolated fixture id")
    ))
}
#[test]
fn completed_and_failed_continue_are_decided_by_the_actual_step_pipeline() {
    for succeed in [true, false] {
        let f = fixture();
        let executed = Cell::new(0);
        let discovery = Discovery::default();
        let outcome = run_with(
            &f.profile,
            &f.context,
            || panic!("non-imported profile needs no trust root"),
            || {
                run_pass_with(
                    &f.document,
                    &f.profile,
                    &discovery,
                    &f.context,
                    |_, _, _, _, _, _| {
                        executed.set(executed.get() + 1);
                        if succeed {
                            Ok(1)
                        } else {
                            Err("synthetic failure".into())
                        }
                    },
                    |_| false,
                )
            },
            |_| false,
        );
        assert_eq!(
            executed.get(),
            2,
            "Continue must attempt the following step"
        );
        assert_eq!(
            outcome,
            if succeed {
                ChainOutcome::Completed
            } else {
                ChainOutcome::Failed {
                    reason: ChainFailure::StepFailed,
                }
            }
        );
        let terminal: Vec<_> = f.events.try_iter().filter(|p| p.step.is_none()).collect();
        assert_eq!(terminal.len(), 1);
        assert_eq!(terminal[0].success, succeed);
    }
}
#[test]
fn both_retry_policies_can_recover_without_sleeping_or_launching_apps() {
    for retry in [
        super::super::policy::Retry::Failed,
        super::super::policy::Retry::All,
    ] {
        let mut f = fixture();
        let mut policy = f.profile.effective_policy();
        policy.retry = retry;
        policy.max_retries = 1;
        f.profile.set_policy(policy);
        if retry == super::super::policy::Retry::Failed {
            f.profile.steps.truncate(1);
            f.context.selected = vec![0];
        }
        let calls = Cell::new(0);
        let waits = RefCell::new(Vec::new());
        let discovery = Discovery::default();
        let outcome = run_with(
            &f.profile,
            &f.context,
            || panic!("non-imported profile needs no trust root"),
            || {
                run_pass_with(
                    &f.document,
                    &f.profile,
                    &discovery,
                    &f.context,
                    |_, _, _, _, _, _| {
                        calls.set(calls.get() + 1);
                        if calls.get() == 1 {
                            Err("synthetic failure".into())
                        } else {
                            Ok(1)
                        }
                    },
                    |delay| {
                        waits.borrow_mut().push(delay);
                        false
                    },
                )
            },
            |delay| {
                waits.borrow_mut().push(delay);
                false
            },
        );
        assert_eq!(outcome, ChainOutcome::Completed);
        assert_eq!(
            calls.get(),
            if retry == super::super::policy::Retry::Failed {
                2
            } else {
                4
            }
        );
        assert!(waits.borrow().contains(&Duration::from_millis(250)));
    }
}
#[test]
fn cancellation_before_or_between_steps_never_completes() {
    for cancel_before in [true, false] {
        let f = fixture();
        if cancel_before {
            f.context.cancel.cancel();
        }
        let calls = Cell::new(0);
        let discovery = Discovery::default();
        let outcome = run_with(
            &f.profile,
            &f.context,
            || panic!("non-imported profile needs no trust root"),
            || {
                run_pass_with(
                    &f.document,
                    &f.profile,
                    &discovery,
                    &f.context,
                    |_, _, _, _, _, _| {
                        calls.set(calls.get() + 1);
                        f.context.cancel.cancel();
                        Ok(1)
                    },
                    |_| f.context.cancel.cancelled(),
                )
            },
            |_| false,
        );
        assert_eq!(calls.get(), u32::from(!cancel_before));
        assert_eq!(
            outcome,
            ChainOutcome::Cancelled {
                reason: CancelReason::User
            }
        );
    }
}
#[test]
fn decision_expiry_is_typed_with_an_injected_clock_and_receiver() {
    let f = fixture();
    assert!(
        f.context
            .ask_with(
                None,
                "QA".into(),
                &[Action::Stop, Action::Continue],
                false,
                Arc::new(|| Duration::from_mins(2)),
                |_| Err(mpsc::RecvTimeoutError::Timeout)
            )
            .is_err()
    );
    assert_eq!(
        finish(&f.profile, &f.context, false),
        ChainOutcome::Failed {
            reason: ChainFailure::DecisionExpired
        }
    );
}
#[test]
fn trust_decline_is_distinct_from_a_step_failure() {
    let mut f = fixture();
    f.profile.id = format!("trust-{}", std::process::id());
    f.profile.imported = true;
    f.profile.steps = vec![Step {
        app_id: "obs".into(),
        delay_seconds: 0,
        args_override: None,
    }];
    let mut discovery = Discovery::default();
    discovery.apps.push(discovery::Detected {
        id: "obs".into(),
        executable: Some(root().join("must-not-execute.exe")),
        availability: discovery::Availability::default(),
    });
    f.answers.send((1, Action::Cancel)).unwrap();
    let outcome = run_with(
        &f.profile,
        &f.context,
        || review_at(&f.document, &f.profile, &discovery, &f.context, &root()),
        || panic!("trust declined before step pipeline"),
        |_| panic!("no retry"),
    );
    assert_eq!(
        outcome,
        ChainOutcome::Cancelled {
            reason: CancelReason::TrustDeclined
        }
    );
}
#[test]
fn cleanup_failure_is_not_reported_as_clean_cancellation() {
    let mut f = fixture();
    let mut policy = f.profile.effective_policy();
    policy.cancel = Close::Started;
    f.profile.set_policy(policy);
    let _poison = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _guard = f.context.processes.lock().unwrap();
        panic!("synthetic registry failure");
    }));
    f.context.cancel.cancel();
    assert_eq!(
        finish(&f.profile, &f.context, false),
        ChainOutcome::Failed {
            reason: ChainFailure::CleanupFailed
        }
    );
}
#[test]
fn checked_start_classifies_invalid_io_and_busy_without_starting_an_app() {
    let f = fixture();
    let path = root();
    std::fs::create_dir_all(&path).unwrap();
    let settings = path.join("launcher.json");
    assert!(matches!(
        Chain::start_checked(
            f.document.clone(),
            f.profile.clone(),
            |_| panic!("invalid"),
            Arc::clone(&f.context.processes),
            Some(vec![]),
            &settings
        ),
        Err(StartError::Invalid(_))
    ));
    assert!(matches!(
        Chain::start_checked(
            f.document.clone(),
            f.profile.clone(),
            |_| panic!("missing parent"),
            Arc::clone(&f.context.processes),
            None,
            &path.join("missing/launcher.json")
        ),
        Err(StartError::Io(_))
    ));
    for shutdown in [false, true] {
        let (ready, observed) = mpsc::channel();
        let (release, waiting) = mpsc::channel();
        let mut chain = Chain::start_checked(
            f.document.clone(),
            f.profile.clone(),
            move |_| {
                ready.send(()).unwrap();
                waiting.recv().unwrap();
                Discovery::default()
            },
            Arc::clone(&f.context.processes),
            None,
            &settings,
        )
        .unwrap();
        observed.recv().unwrap();
        assert_eq!(
            chain.finish(),
            None,
            "observing an active worker must not cancel or join it"
        );
        assert!(matches!(
            Chain::start_checked(
                f.document.clone(),
                f.profile.clone(),
                |_| panic!("busy"),
                Arc::clone(&f.context.processes),
                None,
                &settings
            ),
            Err(StartError::Busy(_))
        ));
        if shutdown {
            chain.prepare_shutdown();
        } else {
            chain.cancel();
        }
        release.send(()).unwrap();
        chain.collect();
        let expected = Some(ChainOutcome::Cancelled {
            reason: if shutdown {
                CancelReason::Shutdown
            } else {
                CancelReason::User
            },
        });
        assert_eq!(chain.finish(), expected);
        assert_eq!(chain.finish(), expected);
    }
    std::fs::remove_dir_all(path).unwrap();
}
#[test]
fn worker_panic_is_terminal_and_shutdown_keeps_its_legacy_one_time_error() {
    let f = fixture();
    let path = root();
    std::fs::create_dir_all(&path).unwrap();
    let mut chain = Chain::start_checked(
        f.document,
        f.profile,
        |_| panic!("synthetic discovery panic"),
        f.context.processes,
        None,
        &path.join("launcher.json"),
    )
    .unwrap();
    assert!(chain.shutdown().is_err());
    assert!(chain.shutdown().is_ok());
    assert_eq!(
        chain.finish(),
        Some(ChainOutcome::Failed {
            reason: ChainFailure::WorkerPanicked
        })
    );
    drop(chain);
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn disconnected_progress_is_an_internal_failure_before_or_after_execution() {
    for disconnect_before in [true, false] {
        let f = fixture();
        let receiver = RefCell::new(Some(f.events));
        if disconnect_before {
            receiver.borrow_mut().take();
        }
        let outcome = run_with(
            &f.profile,
            &f.context,
            || panic!("non-imported profile needs no trust root"),
            || {
                run_pass_with(
                    &f.document,
                    &f.profile,
                    &Discovery::default(),
                    &f.context,
                    |_, _, _, _, _, _| {
                        receiver.borrow_mut().take();
                        Ok(1)
                    },
                    |_| false,
                )
            },
            |_| false,
        );
        assert_eq!(
            outcome,
            ChainOutcome::Failed {
                reason: ChainFailure::Internal
            }
        );
    }
}

#[test]
fn exhausted_question_ids_emit_no_reused_question() {
    let f = fixture();
    f.context.next_decision.store(u64::MAX, Ordering::Relaxed);
    assert!(
        f.context
            .ask_with(
                None,
                "QA".into(),
                &[Action::Stop],
                false,
                Arc::new(|| Duration::ZERO),
                |_| panic!("an exhausted question must not wait for a reply"),
            )
            .is_err()
    );
    assert_eq!(f.context.next_decision.load(Ordering::Relaxed), u64::MAX);
    assert!(f.events.try_recv().is_err());
}

#[path = "question_tests.rs"]
mod question_tests;
