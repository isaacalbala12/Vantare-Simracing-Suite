//! Explicit ordering of terminal commitment and cancellation; no apps or sleeps.
use super::*;
use std::sync::Barrier;
#[test]
fn cancel_checked_is_ordered_with_the_real_terminal_before_the_worker_exits() {
    for (before_completion, imported) in
        [(false, false), (true, false), (false, true), (true, true)]
    {
        let mut f = fixture();
        f.profile.imported = imported;
        let results = Arc::clone(&f.context.results);
        let cancelled = Arc::clone(&f.context.cancel);
        let worker_cancel = Arc::clone(&cancelled);
        let phases = Arc::new(Barrier::new(2));
        let worker_phases = Arc::clone(&phases);
        let worker = thread::spawn(move || {
            let _completion = Completion(Arc::clone(&worker_cancel));
            worker_phases.wait();
            worker_phases.wait();
            let outcome = run_with(
                &f.profile,
                &f.context,
                || Err("synthetic review failure".into()),
                || true,
                |_| panic!("no retry for a successful pass or failed review"),
            );
            worker_phases.wait();
            worker_phases.wait();
            outcome
        });
        let mut chain = Chain {
            results,
            progress: f.events,
            cancel: cancelled,
            answers: f.answers,
            pending: Arc::new(Pending::default()),
            worker: Some(worker),
            outcome: None,
        };
        phases.wait();
        let early = if before_completion {
            Some(chain.cancel_checked())
        } else {
            None
        };
        let repeated = if before_completion {
            Some(chain.cancel_checked())
        } else {
            None
        };
        phases.wait();
        phases.wait();
        let still_running = !chain.finished();
        let late = chain.cancel_checked();
        phases.wait();
        chain.collect();
        assert!(still_running, "the terminal was decided before thread exit");
        if before_completion {
            assert_eq!(early, Some(Ok(())));
            assert_eq!(repeated, Some(Ok(())));
        }
        assert_eq!(late, Err(CancelError::Finished));
        assert_eq!(
            chain.finish(),
            Some(if before_completion {
                ChainOutcome::Cancelled {
                    reason: CancelReason::User,
                }
            } else if imported {
                ChainOutcome::Failed {
                    reason: ChainFailure::Internal,
                }
            } else {
                ChainOutcome::Completed
            })
        );
    }
}
#[test]
fn poisoned_cancellation_state_is_unavailable_and_does_not_claim_acceptance() {
    let f = fixture();
    let cancel = Arc::new(Cancellation::default());
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _guard = cancel.stopped.lock().unwrap();
        panic!("fixture poison");
    }));
    let chain = Chain {
        results: Arc::clone(&f.context.results),
        progress: f.events,
        cancel,
        answers: f.answers,
        pending: Arc::new(Pending::default()),
        worker: None,
        outcome: None,
    };
    assert_eq!(chain.cancel_checked(), Err(CancelError::Unavailable));
}
