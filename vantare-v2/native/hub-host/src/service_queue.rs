//! Bounded service scheduling. One active effect, one waiting request per priority.
//! Commands are owned and never replayed or included in Debug/log output.
use crate::protocol::HostError;
use std::collections::VecDeque;
use vantare_ipc::services_protocol::Command;
const PRIORITIES: usize = 4;
const MAX_PENDING: usize = PRIORITIES + 1;
type Request = (u32, Command);
#[derive(Default)]
pub(crate) struct Queue {
    active: Option<u32>,
    waiting: [Option<Request>; PRIORITIES],
    failures: VecDeque<(u32, HostError)>,
}
fn priority(command: &Command) -> usize {
    match command {
        Command::Logout => 0,
        Command::AccountCancel => 1,
        Command::Status
        | Command::AccountPoll
        | Command::LicenseStatus
        | Command::AccountProfileRefresh => 3,
        _ => 2,
    }
}
impl Queue {
    fn len(&self) -> usize {
        usize::from(self.active.is_some())
            + self.waiting.iter().flatten().count()
            + self.failures.len()
    }
    fn contains(&self, id: u32) -> bool {
        self.active == Some(id)
            || self
                .waiting
                .iter()
                .flatten()
                .any(|(pending, _)| *pending == id)
            || self.failures.iter().any(|(pending, _)| *pending == id)
    }
    pub(crate) fn submit(&mut self, id: u32, command: Command) -> Result<(), HostError> {
        let slot = priority(&command);
        if self.len() >= MAX_PENDING || self.contains(id) || self.waiting[slot].is_some() {
            return Err(HostError::Busy);
        }
        self.waiting[slot] = Some((id, command));
        Ok(())
    }
    pub(crate) fn start_next(&mut self) -> Option<Request> {
        if self.active.is_some() {
            return None;
        }
        let request = self.waiting.iter_mut().find_map(Option::take)?;
        self.active = Some(request.0);
        Some(request)
    }
    pub(crate) fn finish(&mut self, id: u32) -> bool {
        if self.active != Some(id) {
            return false;
        }
        self.active = None;
        true
    }
    pub(crate) fn fail_active(&mut self, id: u32, error: HostError) {
        if self.finish(id) {
            self.failures.push_back((id, error));
        }
    }
    pub(crate) fn cancel_waiting(&mut self, id: u32) -> bool {
        let Some(slot) = self
            .waiting
            .iter_mut()
            .find(|slot| slot.as_ref().is_some_and(|(pending, _)| *pending == id))
        else {
            return false;
        };
        *slot = None;
        self.failures.push_back((id, HostError::CoreUnavailable));
        true
    }
    pub(crate) fn fail_all(&mut self) {
        if let Some(id) = self.active.take() {
            self.failures.push_back((id, HostError::CoreUnavailable));
        }
        for (id, _) in self.waiting.iter_mut().filter_map(Option::take) {
            self.failures.push_back((id, HostError::CoreUnavailable));
        }
    }
    pub(crate) fn failure(&mut self) -> Option<(u32, HostError)> {
        self.failures.pop_front()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn start(queue: &mut Queue, id: u32, command: Command) {
        queue.submit(id, command).unwrap();
        assert_eq!(queue.start_next().map(|(id, _)| id), Some(id));
    }
    #[test]
    fn logout_then_cancel_then_user_then_background_without_preempting_an_effect() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::AccountPoll);
        for (id, command) in [
            (2, Command::Status),
            (3, Command::PilotLoad),
            (4, Command::AccountCancel),
            (5, Command::Logout),
        ] {
            queue.submit(id, command).unwrap();
        }
        assert!(queue.start_next().is_none());
        assert_eq!(queue.len(), MAX_PENDING);
        assert!(queue.finish(1));
        for expected in [5, 4, 3, 2] {
            assert_eq!(queue.start_next().map(|(id, _)| id), Some(expected));
            assert!(queue.finish(expected));
        }
        assert!(queue.start_next().is_none());
        assert_eq!(queue.len(), 0);
    }
    #[test]
    fn one_user_intent_waits_and_the_second_is_busy_without_replacing_it() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::AccountPoll);
        queue.submit(2, Command::PilotLoad).unwrap();
        assert_eq!(
            queue.submit(3, Command::MailConsentGet),
            Err(HostError::Busy)
        );
        assert!(queue.finish(1));
        assert!(matches!(queue.start_next(), Some((2, Command::PilotLoad))));
    }
    #[test]
    fn duplicate_ids_and_foreign_completions_cannot_release_an_effect() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::PilotLoad);
        assert_eq!(queue.submit(1, Command::Logout), Err(HostError::Busy));
        assert!(!queue.finish(2));
        assert!(queue.start_next().is_none());
        queue.submit(3, Command::MailConsentGet).unwrap();
        assert_eq!(
            queue.submit(3, Command::AccountCancel),
            Err(HostError::Busy)
        );
    }
    #[test]
    fn disconnect_answers_every_accepted_request_once_without_replay() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::PilotLoad);
        queue.submit(2, Command::Logout).unwrap();
        queue.submit(3, Command::MailConsentGet).unwrap();
        queue.fail_all();
        assert_eq!(queue.failure(), Some((1, HostError::CoreUnavailable)));
        assert_eq!(queue.failure(), Some((2, HostError::CoreUnavailable)));
        assert_eq!(queue.failure(), Some((3, HostError::CoreUnavailable)));
        assert!(queue.failure().is_none());
        assert!(queue.start_next().is_none());
        assert!(!queue.finish(1));
    }
    #[test]
    fn cancellation_never_cancels_the_active_effect_or_reuses_an_unretired_id() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::PilotLoad);
        queue.submit(2, Command::MailConsentGet).unwrap();
        assert!(!queue.cancel_waiting(1));
        assert!(queue.cancel_waiting(2));
        assert_eq!(queue.submit(2, Command::Logout), Err(HostError::Busy));
        assert_eq!(queue.failure(), Some((2, HostError::CoreUnavailable)));
        queue.submit(2, Command::Logout).unwrap();
        assert!(queue.finish(1));
        assert!(matches!(queue.start_next(), Some((2, Command::Logout))));
    }
    #[test]
    fn cancelled_notifications_do_not_make_the_queue_unbounded() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::Status);
        for id in 2..=5 {
            queue.submit(id, Command::PilotLoad).unwrap();
            assert!(queue.cancel_waiting(id));
        }
        assert_eq!(queue.len(), MAX_PENDING);
        assert_eq!(queue.submit(6, Command::Logout), Err(HostError::Busy));
        assert!(queue.finish(1));
        assert!(queue.failure().is_some());
        queue.submit(6, Command::Logout).unwrap();
    }
    #[test]
    fn a_failed_send_is_reported_and_the_effect_is_never_replayed() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::PilotLoad);
        queue.submit(2, Command::MailConsentGet).unwrap();
        queue.fail_active(1, HostError::Busy);
        assert_eq!(queue.failure(), Some((1, HostError::Busy)));
        assert!(matches!(
            queue.start_next(),
            Some((2, Command::MailConsentGet))
        ));
        assert!(!queue.finish(1));
    }
}
