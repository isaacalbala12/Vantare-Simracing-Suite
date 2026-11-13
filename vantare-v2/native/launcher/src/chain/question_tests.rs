//! Integration of the pending state with the worker loop; no timed sleeps or apps.
use super::*;
use std::sync::Barrier;
struct Resume(Arc<Barrier>);
impl Drop for Resume {
    fn drop(&mut self) {
        self.0.wait();
    }
}
#[test]
fn committed_answer_survives_cancellation_and_disconnection_after_the_initial_poll() {
    for shutdown in [false, true] {
        let Fixture {
            context,
            events,
            answers,
            ..
        } = fixture();
        let results = Arc::clone(&context.results);
        let pending = Arc::clone(&context.pending);
        let cancel = Arc::clone(&context.cancel);
        let barrier = Arc::new(Barrier::new(2));
        let paused = Arc::clone(&barrier);
        let worker = thread::spawn(move || {
            let result = context.ask_with(
                None,
                "QA".into(),
                &[Action::Continue],
                false,
                Arc::new(|| Duration::ZERO),
                |_| {
                    // The initial poll and interruption check saw no answer/stop.
                    paused.wait();
                    paused.wait();
                    Err(mpsc::RecvTimeoutError::Disconnected)
                },
            );
            assert_eq!(result, Ok(Action::Continue));
            ChainOutcome::Completed
        });
        let mut chain = Chain {
            results,
            progress: events,
            cancel,
            answers,
            pending,
            worker: Some(worker),
            outcome: None,
        };
        barrier.wait();
        let resume = Resume(barrier);
        let committed = chain.answer_checked(1, Action::Continue);
        if shutdown {
            chain.prepare_shutdown();
        } else {
            chain.cancel();
        }
        drop(resume);
        chain.collect();
        assert_eq!(committed, Ok(()));
        assert_eq!(chain.finish(), Some(ChainOutcome::Completed));
        assert_eq!(
            chain.answer_checked(1, Action::Continue),
            Err(AnswerError::StaleQuestion)
        );
    }
}
#[test]
fn worker_and_sender_use_the_same_injected_deadline_and_committed_answer_wins() {
    for expired_before_commit in [false, true] {
        let f = fixture();
        let elapsed = Arc::new(AtomicU64::new(0));
        let read = Arc::clone(&elapsed);
        let result = f.context.ask_with(
            None,
            "QA".into(),
            &[Action::Continue],
            false,
            Arc::new(move || Duration::from_secs(read.load(Ordering::Acquire))),
            |_| {
                elapsed.store(
                    if expired_before_commit { 120 } else { 119 },
                    Ordering::Release,
                );
                assert_eq!(
                    f.context
                        .pending
                        .answer(1, Action::Continue, || (false, false)),
                    if expired_before_commit {
                        Err(AnswerError::StaleQuestion)
                    } else {
                        Ok(())
                    }
                );
                elapsed.store(120, Ordering::Release);
                Err(mpsc::RecvTimeoutError::Timeout)
            },
        );
        if expired_before_commit {
            assert!(result.is_err());
            assert_eq!(
                *f.context.failure.lock().unwrap(),
                Some(ChainFailure::DecisionExpired)
            );
        } else {
            assert_eq!(result, Ok(Action::Continue));
            assert_eq!(*f.context.failure.lock().unwrap(), None);
        }
    }
}
#[test]
fn failed_question_publication_rejects_answers_without_waiting_or_leaving_a_pending_choice() {
    let f = fixture();
    drop(f.events);
    assert!(
        f.context
            .ask_with(
                None,
                "QA".into(),
                &[Action::Stop],
                false,
                Arc::new(|| Duration::ZERO),
                |_| panic!("a failed send must not wait for an answer"),
            )
            .is_err()
    );
    assert_eq!(
        f.context.pending.answer(1, Action::Stop, || (false, false)),
        Err(AnswerError::StaleQuestion)
    );
}
