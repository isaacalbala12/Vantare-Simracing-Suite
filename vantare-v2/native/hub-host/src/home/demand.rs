//! Deterministic demand transitions; the caller owns the transport and clock.
use std::time::{Duration, Instant};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Action(pub bool);
impl Action {
    pub fn demand(self) -> vantare_ipc::Demand {
        let mut value = vantare_ipc::Demand::default();
        if self.0 {
            value.request(vantare_ipc::Signal::SessionInfo, 1000);
            value.request(vantare_ipc::Signal::TrackName, 1000);
        }
        value
    }
}
#[derive(Default)]
pub struct State {
    pub active: bool,
    attempt: Option<(bool, Instant)>,
}
impl State {
    pub fn action(&self, active: bool, live: bool, now: Instant) -> Option<Action> {
        let wanted = active && !live;
        if self.active == wanted
            || self.attempt.is_some_and(|(target, last)| {
                target == wanted
                    && now.saturating_duration_since(last) < Duration::from_millis(super::WATCH_MS)
            })
        {
            None
        } else {
            Some(Action(wanted))
        }
    }
    pub fn complete(&mut self, action: Action, now: Instant, succeeded: bool) {
        self.attempt = Some((action.0, now));
        if succeeded {
            self.active = action.0;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn visible_requests_one_hz_and_unsubscribe_or_live_remove_demand_immediately() {
        let now = Instant::now();
        let mut state = State::default();
        let enter = state.action(true, false, now).unwrap();
        let mut expected = vantare_ipc::Demand::default();
        expected.request(vantare_ipc::Signal::SessionInfo, 1000);
        expected.request(vantare_ipc::Signal::TrackName, 1000);
        assert_eq!(enter.demand(), expected);
        state.complete(enter, now, true);
        assert_eq!(state.action(true, false, now), None);
        for (active, live) in [(false, false), (true, true)] {
            let leave = state.action(active, live, now).unwrap();
            assert_eq!(leave.demand(), vantare_ipc::Demand::default());
        }
        let leave = state.action(false, false, now).unwrap();
        state.complete(leave, now, true);
        assert!(!state.active);
    }
    #[test]
    fn failed_demand_retries_at_five_hundred_ms_not_on_every_tick() {
        let now = Instant::now();
        let mut state = State::default();
        let enter = state.action(true, false, now).unwrap();
        state.complete(enter, now, false);
        assert_eq!(
            state.action(true, false, now + Duration::from_millis(499)),
            None
        );
        assert_eq!(
            state.action(true, false, now + Duration::from_millis(500)),
            Some(enter)
        );
        state.complete(enter, now + Duration::from_millis(500), true);
        let leave = state
            .action(true, true, now + Duration::from_millis(501))
            .unwrap();
        state.complete(leave, now + Duration::from_millis(501), false);
        assert_eq!(
            state.action(false, false, now + Duration::from_secs(1)),
            None
        );
        assert_eq!(
            state.action(false, false, now + Duration::from_millis(1001)),
            Some(leave)
        );
    }
}
