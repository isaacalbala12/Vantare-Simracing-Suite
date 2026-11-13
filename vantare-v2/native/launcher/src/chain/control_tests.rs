//! Explicit ordering of terminal commitment and cancellation; no apps or sleeps.
use super::*;
use std::sync::Barrier;
#[test]
fn cancel_checked_and_completion_have_a_single_ordering_even_before_the_join_finishes() {
    for before_completion in [false, true] {
        let f = fixture();
        let cancelled = Arc::new(Cancellation::default());
        let worker_cancel = Arc::clone(&cancelled);
        let phases = Arc::new(Barrier::new(2));
        let worker_phases = Arc::clone(&phases);
        let worker = thread::spawn(move || {
            let completion = Completion(Arc::clone(&worker_cancel));
            worker_phases.wait();
            worker_phases.wait();
            drop(completion);
            worker_phases.wait();
            worker_phases.wait();
            if worker_cancel.cancelled() {
                ChainOutcome::Cancelled {
                    reason: CancelReason::User,
                }
            } else {
                ChainOutcome::Completed
            }
        });
        let mut chain = Chain {
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
        let late = chain.cancel_checked();
        phases.wait();
        chain.collect();
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
        progress: f.events,
        cancel,
        answers: f.answers,
        pending: Arc::new(Pending::default()),
        worker: None,
        outcome: None,
    };
    assert_eq!(chain.cancel_checked(), Err(CancelError::Unavailable));
}
