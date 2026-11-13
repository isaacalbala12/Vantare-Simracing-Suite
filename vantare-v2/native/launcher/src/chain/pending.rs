//! One pending question. Selection and expiry commit under the same lock.
use super::{Action, Arc, Mutex};
use std::time::Duration;
/// Elapsed time since this question opened, shared by sender and worker.
pub(super) type Clock = Arc<dyn Fn() -> Duration + Send + Sync>;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnswerError {
    StaleQuestion,
    InvalidAction,
    TrustRequiresEditor,
    Unavailable,
}
struct Question {
    id: u64,
    actions: Vec<Action>,
    clock: Clock,
    closing: bool,
    selected: Option<Action>,
}
#[derive(Default)]
pub(super) struct Pending(Mutex<Option<Question>>);
pub(super) enum Poll {
    Waiting,
    Answer(Action),
    Expired,
}
pub(super) struct Lease {
    pending: Arc<Pending>,
    id: u64,
}
impl Drop for Lease {
    fn drop(&mut self) {
        if let Ok(mut slot) = self.pending.0.lock()
            && slot.as_ref().is_some_and(|q| q.id == self.id)
        {
            *slot = None;
        }
    }
}
impl Pending {
    pub(super) fn open(
        self: &Arc<Self>,
        id: u64,
        actions: &[Action],
        closing: bool,
        clock: Clock,
    ) -> Result<Lease, String> {
        let mut slot = self.0.lock().map_err(|_| "pregunta no disponible")?;
        *slot = Some(Question {
            id,
            actions: actions.to_vec(),
            closing,
            clock,
            selected: None,
        });
        Ok(Lease {
            pending: Arc::clone(self),
            id,
        })
    }
    pub(super) fn answer(
        &self,
        id: u64,
        action: Action,
        state: impl FnOnce() -> (bool, bool),
    ) -> Result<(), AnswerError> {
        if action == Action::Trust {
            return Err(AnswerError::TrustRequiresEditor);
        }
        let mut slot = self.0.lock().map_err(|_| AnswerError::Unavailable)?;
        let q = slot.as_mut().ok_or(AnswerError::StaleQuestion)?;
        let (cancelled, shutdown) = state();
        if q.id != id
            || q.selected.is_some()
            || (q.clock)() >= Duration::from_mins(2)
            || shutdown
            || (cancelled && !q.closing)
        {
            return Err(AnswerError::StaleQuestion);
        }
        if !q.actions.contains(&action) {
            return Err(AnswerError::InvalidAction);
        }
        q.selected = Some(action);
        Ok(())
    }
    pub(super) fn poll(
        &self,
        id: u64,
        check_expiry: bool,
        legacy: Option<Action>,
        stop: impl FnOnce() -> Option<Action>,
    ) -> Result<Poll, String> {
        let mut slot = self.0.lock().map_err(|_| "pregunta no disponible")?;
        let q = slot
            .as_mut()
            .filter(|q| q.id == id)
            .ok_or("pregunta caducada")?;
        if let Some(action) = q.selected.take().or(legacy).or_else(stop) {
            *slot = None;
            return Ok(Poll::Answer(action));
        }
        if check_expiry && (q.clock)() >= Duration::from_mins(2) {
            *slot = None;
            return Ok(Poll::Expired);
        }
        Ok(Poll::Waiting)
    }
    /// Close atomically: consume an already committed choice, or reject later senders.
    pub(super) fn close(&self, id: u64, fallback: Action) -> Result<Action, String> {
        let mut slot = self.0.lock().map_err(|_| "pregunta no disponible")?;
        let q = slot
            .as_ref()
            .filter(|q| q.id == id)
            .ok_or("pregunta caducada")?;
        let action = q.selected.unwrap_or(fallback);
        *slot = None;
        Ok(action)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    fn clock() -> (Clock, Arc<AtomicU64>) {
        let elapsed = Arc::new(AtomicU64::new(0));
        let read = Arc::clone(&elapsed);
        (
            Arc::new(move || Duration::from_secs(read.load(Ordering::Acquire))),
            elapsed,
        )
    }
    #[test]
    fn commitment_wins_over_later_expiry_and_cannot_be_replaced() {
        let pending = Arc::new(Pending::default());
        let (clock, elapsed) = clock();
        let _lease = pending
            .open(1, &[Action::Stop, Action::Continue], false, clock)
            .unwrap();
        assert_eq!(
            pending.answer(1, Action::Trust, || (false, false)),
            Err(AnswerError::TrustRequiresEditor)
        );
        assert_eq!(
            pending.answer(2, Action::Stop, || (false, false)),
            Err(AnswerError::StaleQuestion)
        );
        assert_eq!(
            pending.answer(1, Action::Restart, || (false, false)),
            Err(AnswerError::InvalidAction)
        );
        elapsed.store(119, Ordering::Release);
        pending
            .answer(1, Action::Continue, || (false, false))
            .unwrap();
        assert_eq!(
            pending.answer(1, Action::Stop, || (false, false)),
            Err(AnswerError::StaleQuestion)
        );
        elapsed.store(120, Ordering::Release);
        assert!(matches!(
            pending.poll(1, true, Some(Action::Stop), || None).unwrap(),
            Poll::Answer(Action::Continue)
        ));
    }
    #[test]
    fn cancellation_rejects_continuation_but_keeps_the_closing_question_answerable() {
        let pending = Arc::new(Pending::default());
        let (clock, _) = clock();
        let lease = pending
            .open(1, &[Action::Continue], false, Arc::clone(&clock))
            .unwrap();
        assert_eq!(
            pending.answer(1, Action::Continue, || (true, false)),
            Err(AnswerError::StaleQuestion)
        );
        drop(lease);
        let _closing = pending
            .open(2, &[Action::Leave, Action::CloseStarted], true, clock)
            .unwrap();
        assert_eq!(
            pending.answer(2, Action::CloseStarted, || (true, true)),
            Err(AnswerError::StaleQuestion)
        );
        pending
            .answer(2, Action::CloseStarted, || (true, false))
            .unwrap();
        assert!(matches!(
            pending.poll(2, false, None, || None).unwrap(),
            Poll::Answer(Action::CloseStarted)
        ));
    }
    #[test]
    fn exact_deadline_expiry_and_question_replacement_reject_old_answers() {
        let pending = Arc::new(Pending::default());
        let (clock, elapsed) = clock();
        let lease = pending
            .open(1, &[Action::Stop], false, Arc::clone(&clock))
            .unwrap();
        elapsed.store(120, Ordering::Release);
        assert_eq!(
            pending.answer(1, Action::Stop, || (false, false)),
            Err(AnswerError::StaleQuestion)
        );
        assert!(matches!(
            pending.poll(1, true, None, || None).unwrap(),
            Poll::Expired
        ));
        elapsed.store(0, Ordering::Release);
        assert_eq!(
            pending.answer(1, Action::Stop, || (false, false)),
            Err(AnswerError::StaleQuestion)
        );
        let _next = pending.open(2, &[Action::Leave], true, clock).unwrap();
        drop(lease);
        assert_eq!(
            pending.answer(1, Action::Leave, || (true, false)),
            Err(AnswerError::StaleQuestion)
        );
        pending.answer(2, Action::Leave, || (true, false)).unwrap();
        assert!(matches!(
            pending.poll(2, false, None, || None).unwrap(),
            Poll::Answer(Action::Leave)
        ));
    }
    #[test]
    fn closure_without_selection_rejects_late_answers() {
        let pending = Arc::new(Pending::default());
        let (clock, _) = clock();
        let _lease = pending.open(1, &[Action::Continue], false, clock).unwrap();
        assert_eq!(pending.close(1, Action::Cancel).unwrap(), Action::Cancel);
        assert_eq!(
            pending.answer(1, Action::Continue, || (false, false)),
            Err(AnswerError::StaleQuestion)
        );
    }
    #[test]
    fn interruption_closes_the_question_before_a_late_commit() {
        let pending = Arc::new(Pending::default());
        let (clock, _) = clock();
        let _lease = pending.open(1, &[Action::Continue], false, clock).unwrap();
        assert!(matches!(
            pending
                .poll(1, false, None, || Some(Action::Cancel))
                .unwrap(),
            Poll::Answer(Action::Cancel)
        ));
        assert_eq!(
            pending.answer(1, Action::Continue, || (false, false)),
            Err(AnswerError::StaleQuestion)
        );
    }
}
