//! One active effect; bounded waiting slots, no replay and no command logging.
use crate::protocol::HostError;
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
use vantare_ipc::services_protocol::Command;
pub(crate) const RESPONSE_IO_TIMEOUT: Duration = Duration::from_secs(30);
const PRIORITIES: usize = 5;
const MAX_PENDING: usize = PRIORITIES + 1;
type Request = (u32, Command, Instant);
struct Waiting {
    id: u32,
    command: Command,
    accepted: Instant,
}
#[derive(Default)]
pub(crate) struct Queue {
    active: Option<(u32, bool)>,
    waiting: [Option<Waiting>; PRIORITIES],
    failures: VecDeque<(u32, HostError)>,
}
#[derive(Clone, Copy)]
enum Origin {
    User,
    Background,
    Continuation,
}
pub(crate) fn can_start(accepted: Instant, now: Instant) -> bool {
    let wait_budget = Duration::from_millis(u64::from(crate::protocol::REQUEST_TIMEOUT_MS))
        .saturating_sub(RESPONSE_IO_TIMEOUT);
    now.saturating_duration_since(accepted) < wait_budget
}
fn priority(command: &Command, origin: Origin) -> usize {
    match command {
        Command::Logout => 0,
        Command::AccountCancel => 1,
        _ => match origin {
            Origin::Continuation => 2,
            Origin::User => 3,
            Origin::Background => 4,
        },
    }
}
impl Queue {
    fn len(&self) -> usize {
        usize::from(self.active.is_some()) + self.waiting.iter().flatten().count()
    }
    fn contains(&self, id: u32) -> bool {
        self.active.is_some_and(|(active, _)| active == id)
            || self
                .waiting
                .iter()
                .flatten()
                .any(|request| request.id == id)
            || self.failures.iter().any(|(pending, _)| *pending == id)
    }
    #[cfg(test)]
    pub(crate) fn submit(&mut self, id: u32, command: Command) -> Result<(), HostError> {
        self.submit_at(id, command, Instant::now())
    }
    pub(crate) fn submit_at(
        &mut self,
        id: u32,
        command: Command,
        accepted: Instant,
    ) -> Result<(), HostError> {
        self.enqueue(id, command, Origin::User, accepted)
    }
    pub(crate) fn submit_background(&mut self, id: u32, command: Command) -> Result<(), HostError> {
        self.enqueue(id, command, Origin::Background, Instant::now())
    }
    pub(crate) fn submit_continuation(
        &mut self,
        id: u32,
        command: Command,
        accepted: Instant,
    ) -> Result<(), HostError> {
        self.enqueue(id, command, Origin::Continuation, accepted)
    }
    fn enqueue(
        &mut self,
        id: u32,
        command: Command,
        origin: Origin,
        accepted: Instant,
    ) -> Result<(), HostError> {
        let slot = priority(&command, origin);
        if self.len() >= MAX_PENDING || self.contains(id) || self.waiting[slot].is_some() {
            return Err(HostError::Busy);
        }
        if matches!(command, Command::Logout | Command::AccountCancel) {
            self.invalidate_waiting();
        }
        self.waiting[slot] = Some(Waiting {
            id,
            command,
            accepted,
        });
        Ok(())
    }
    pub(crate) fn invalidate_waiting(&mut self) {
        // A queued Logout remains valid across account/authority changes.
        for request in self.waiting.iter_mut().skip(1).filter_map(Option::take) {
            self.failures.push_back((request.id, HostError::Denied));
        }
    }
    #[cfg(test)]
    pub(crate) fn start_next(&mut self) -> Option<Request> {
        self.start_next_at(Instant::now())
    }
    pub(crate) fn start_next_at(&mut self, now: Instant) -> Option<Request> {
        if self.active.is_some() {
            return None;
        }
        while let Some(request) = self.waiting.iter_mut().find_map(Option::take) {
            if !can_start(request.accepted, now) {
                self.failures.push_back((request.id, HostError::Busy));
                if matches!(request.command, Command::Logout | Command::AccountCancel) {
                    self.invalidate_waiting();
                }
                continue;
            }
            let barrier = matches!(request.command, Command::Logout | Command::AccountCancel);
            self.active = Some((request.id, barrier));
            return Some((request.id, request.command, request.accepted));
        }
        None
    }
    pub(crate) fn finish(&mut self, id: u32) -> bool {
        let Some((active, barrier)) = self.active else {
            return false;
        };
        if active != id {
            return false;
        }
        self.active = None;
        // Also reject intents accepted while the account operation was active,
        // including an uncertain transport failure after an executed Logout.
        if barrier {
            self.invalidate_waiting();
        }
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
            .find(|slot| slot.as_ref().is_some_and(|request| request.id == id))
        else {
            return false;
        };
        *slot = None;
        self.failures.push_back((id, HostError::CoreUnavailable));
        true
    }
    pub(crate) fn fail_all(&mut self) {
        if let Some((id, _)) = self.active.take() {
            self.failures.push_back((id, HostError::CoreUnavailable));
        }
        for request in self.waiting.iter_mut().filter_map(Option::take) {
            self.failures
                .push_back((request.id, HostError::CoreUnavailable));
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
        assert_eq!(queue.start_next().map(|(id, _, _)| id), Some(id));
    }
    #[test]
    fn account_barriers_reject_old_intents_and_preserve_logout_without_preemption() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::AccountPoll);
        queue.submit_background(2, Command::Status).unwrap();
        queue.submit(3, Command::PilotLoad).unwrap();
        queue.submit(4, Command::AccountCancel).unwrap();
        assert_eq!(queue.failure(), Some((3, HostError::Denied)));
        assert_eq!(queue.failure(), Some((2, HostError::Denied)));
        queue.submit(5, Command::Logout).unwrap();
        assert_eq!(queue.failure(), Some((4, HostError::Denied)));
        assert!(queue.start_next().is_none());
        assert!(queue.finish(1));
        assert!(matches!(queue.start_next(), Some((5, Command::Logout, _))));
        queue.submit(6, Command::PilotLoad).unwrap();
        assert!(queue.finish(5));
        assert_eq!(queue.failure(), Some((6, HostError::Denied)));
        assert!(queue.start_next().is_none());
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
        assert!(matches!(
            queue.start_next(),
            Some((2, Command::PilotLoad, _))
        ));
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
        assert!(matches!(queue.start_next(), Some((2, Command::Logout, _))));
    }
    #[test]
    fn pending_failure_notifications_never_consume_logouts_free_slot() {
        let mut queue = Queue::default();
        start(&mut queue, 1, Command::Status);
        for id in 2..=5 {
            queue.submit(id, Command::PilotLoad).unwrap();
            assert!(queue.cancel_waiting(id));
        }
        assert_eq!(queue.len(), 1);
        queue.submit(6, Command::Logout).unwrap();
        assert!(queue.finish(1));
        assert!(matches!(queue.start_next(), Some((6, Command::Logout, _))));
    }
    #[test]
    fn an_expired_waiter_is_failed_without_ever_becoming_an_active_effect() {
        let now = Instant::now();
        let mut queue = Queue::default();
        queue.submit_at(1, Command::Probe, now).unwrap();
        assert!(queue.start_next_at(now).is_some());
        queue.submit_at(2, Command::MailConsentGet, now).unwrap();
        assert!(queue.finish(1));
        assert!(queue.start_next_at(now + Duration::from_secs(15)).is_none());
        assert_eq!(queue.failure(), Some((2, HostError::Busy)));
        assert!(!queue.finish(2));
    }
    #[test]
    fn an_expired_logout_also_discards_intents_accepted_while_it_was_waiting() {
        let now = Instant::now();
        let mut queue = Queue::default();
        queue.submit_at(1, Command::Probe, now).unwrap();
        assert!(queue.start_next_at(now).is_some());
        queue.submit_at(2, Command::Logout, now).unwrap();
        queue
            .submit_at(3, Command::PilotLoad, now + Duration::from_secs(10))
            .unwrap();
        assert!(queue.finish(1));
        assert!(queue.start_next_at(now + Duration::from_secs(16)).is_none());
        assert_eq!(queue.failure(), Some((2, HostError::Busy)));
        assert_eq!(queue.failure(), Some((3, HostError::Denied)));
    }
    #[test]
    fn a_continuation_has_a_reserved_slot_and_keeps_the_original_acceptance_time() {
        let now = Instant::now();
        let mut queue = Queue::default();
        queue.submit_at(1, Command::Probe, now).unwrap();
        assert!(queue.start_next_at(now).is_some());
        queue.submit_at(2, Command::MailConsentGet, now).unwrap();
        queue
            .submit_continuation(3, Command::PilotLoad, now)
            .unwrap();
        assert!(queue.finish(1));
        assert_eq!(
            queue
                .start_next_at(now + Duration::from_secs(14))
                .map(|(id, _, _)| id),
            Some(3)
        );
        assert!(queue.finish(3));
        assert!(queue.start_next_at(now + Duration::from_secs(15)).is_none());
        assert_eq!(queue.failure(), Some((2, HostError::Busy)));
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
            Some((2, Command::MailConsentGet, _))
        ));
        assert!(!queue.finish(1));
    }

    #[test]
    fn a_manual_refresh_is_an_intent_even_when_the_same_command_is_also_polled() {
        for command in [Command::Status, Command::AccountProfileRefresh] {
            let mut queue = Queue::default();
            queue.submit_background(1, Command::AccountPoll).unwrap();
            assert!(queue.start_next().is_some());
            queue.submit_background(2, Command::LicenseStatus).unwrap();
            queue.submit(3, command).unwrap();
            assert!(queue.finish(1));
            assert_eq!(queue.start_next().map(|(id, _, _)| id), Some(3));
            assert!(queue.finish(3));
            assert_eq!(queue.start_next().map(|(id, _, _)| id), Some(2));
        }
    }
}
