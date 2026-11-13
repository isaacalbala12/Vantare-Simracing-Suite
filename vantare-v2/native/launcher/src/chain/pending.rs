//! One pending question. Selection and expiry commit under the same lock.
use super::{Action, Arc, Instant, Mutex};
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
    deadline: Instant,
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
        started: Instant,
    ) -> Result<Lease, String> {
        let mut slot = self.0.lock().map_err(|_| "pregunta no disponible")?;
        *slot = Some(Question {
            id,
            actions: actions.to_vec(),
            closing,
            deadline: started
                .checked_add(std::time::Duration::from_mins(2))
                .ok_or("plazo de pregunta no disponible")?,
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
        now: impl FnOnce() -> Instant,
        cancelled: bool,
        shutdown: bool,
    ) -> Result<(), AnswerError> {
        if action == Action::Trust {
            return Err(AnswerError::TrustRequiresEditor);
        }
        let mut slot = self.0.lock().map_err(|_| AnswerError::Unavailable)?;
        let q = slot.as_mut().ok_or(AnswerError::StaleQuestion)?;
        if q.id != id
            || q.selected.is_some()
            || now() >= q.deadline
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
        expired: bool,
        legacy: Option<Action>,
    ) -> Result<Poll, String> {
        let mut slot = self.0.lock().map_err(|_| "pregunta no disponible")?;
        let q = slot
            .as_mut()
            .filter(|q| q.id == id)
            .ok_or("pregunta caducada")?;
        if let Some(action) = q.selected.take().or(legacy) {
            *slot = None;
            return Ok(Poll::Answer(action));
        }
        if expired {
            *slot = None;
            return Ok(Poll::Expired);
        }
        Ok(Poll::Waiting)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn commitment_wins_over_later_expiry_and_cannot_be_replaced() {
        let pending = Arc::new(Pending::default());
        let start = Instant::now();
        let _lease = pending
            .open(1, &[Action::Stop, Action::Continue], false, start)
            .unwrap();
        assert_eq!(
            pending.answer(1, Action::Trust, || start, false, false),
            Err(AnswerError::TrustRequiresEditor)
        );
        assert_eq!(
            pending.answer(2, Action::Stop, || start, false, false),
            Err(AnswerError::StaleQuestion)
        );
        assert_eq!(
            pending.answer(1, Action::Restart, || start, false, false),
            Err(AnswerError::InvalidAction)
        );
        pending
            .answer(
                1,
                Action::Continue,
                || start + Duration::from_secs(119),
                false,
                false,
            )
            .unwrap();
        assert_eq!(
            pending.answer(1, Action::Stop, || start, false, false),
            Err(AnswerError::StaleQuestion)
        );
        assert!(matches!(
            pending.poll(1, true, Some(Action::Stop)).unwrap(),
            Poll::Answer(Action::Continue)
        ));
    }
    #[test]
    fn cancellation_rejects_continuation_but_keeps_the_closing_question_answerable() {
        let pending = Arc::new(Pending::default());
        let start = Instant::now();
        let lease = pending.open(1, &[Action::Continue], false, start).unwrap();
        assert_eq!(
            pending.answer(1, Action::Continue, || start, true, false),
            Err(AnswerError::StaleQuestion)
        );
        drop(lease);
        let _closing = pending
            .open(2, &[Action::Leave, Action::CloseStarted], true, start)
            .unwrap();
        assert_eq!(
            pending.answer(2, Action::CloseStarted, || start, true, true),
            Err(AnswerError::StaleQuestion)
        );
        pending
            .answer(2, Action::CloseStarted, || start, true, false)
            .unwrap();
        assert!(matches!(
            pending.poll(2, false, None).unwrap(),
            Poll::Answer(Action::CloseStarted)
        ));
    }
    #[test]
    fn exact_deadline_expiry_and_question_replacement_reject_old_answers() {
        let pending = Arc::new(Pending::default());
        let start = Instant::now();
        let lease = pending.open(1, &[Action::Stop], false, start).unwrap();
        assert_eq!(
            pending.answer(
                1,
                Action::Stop,
                || start + Duration::from_mins(2),
                false,
                false
            ),
            Err(AnswerError::StaleQuestion)
        );
        assert!(matches!(
            pending.poll(1, true, None).unwrap(),
            Poll::Expired
        ));
        assert_eq!(
            pending.answer(1, Action::Stop, || start, false, false),
            Err(AnswerError::StaleQuestion)
        );
        let _next = pending.open(2, &[Action::Leave], true, start).unwrap();
        drop(lease);
        assert_eq!(
            pending.answer(1, Action::Leave, || start, true, false),
            Err(AnswerError::StaleQuestion)
        );
        pending
            .answer(2, Action::Leave, || start, true, false)
            .unwrap();
        assert!(matches!(
            pending.poll(2, false, None).unwrap(),
            Poll::Answer(Action::Leave)
        ));
    }
}

#[cfg(test)]
mod ordering_tests {
    use super::*;
    use std::sync::mpsc;
    #[test]
    fn expiry_committed_on_the_worker_cannot_be_resurrected_by_a_late_sender() {
        let pending = Arc::new(Pending::default());
        let start = Instant::now();
        let _lease = pending.open(1, &[Action::Stop], false, start).unwrap();
        let other = Arc::clone(&pending);
        let (expired_tx, expired_rx) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            assert!(matches!(other.poll(1, true, None).unwrap(), Poll::Expired));
            expired_tx.send(()).unwrap();
        });
        expired_rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        assert_eq!(
            pending.answer(1, Action::Stop, || start, false, false),
            Err(AnswerError::StaleQuestion)
        );
        worker.join().unwrap();
    }
}
