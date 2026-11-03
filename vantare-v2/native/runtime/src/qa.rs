//! Replay fixture driver, compiled exclusively for local licensing E2E.
use std::time::Duration;
use vantare_domain::{Adapter, AdapterError, Observation, SourceKind, SourceState};

pub struct Fixture {
    inner: Box<dyn Adapter>,
    last: Option<Observation>,
    next: Duration,
}
impl Fixture {
    pub fn wrap(inner: Box<dyn Adapter>) -> Self {
        Self {
            inner,
            last: None,
            next: Duration::ZERO,
        }
    }
}
impl Adapter for Fixture {
    fn poll(&mut self, now: Duration) -> Result<Option<Observation>, AdapterError> {
        if now < self.next {
            return Ok(None);
        }
        self.next = now + Duration::from_millis(20);
        if let Some(observation) = self.inner.poll(now)? {
            self.last = Some(observation);
        }
        let Some(mut observation) = self.last.clone() else {
            return Ok(None);
        };
        let tick = vantare_ipc::qa::tick().map_err(|_| AdapterError::Disconnected)?;
        observation.origin.source.kind = SourceKind::Live;
        observation.origin.received_at = now;
        observation.origin.source_time = Some(now);
        observation.state.session.id.0 = tick.session;
        observation.state.source_state = match tick.phase.as_str() {
            "Live" => SourceState::Live,
            "Paused" => SourceState::Paused,
            "Stale" => SourceState::Stale,
            _ => SourceState::Waiting,
        };
        Ok(Some(observation))
    }
    fn next_poll(&self) -> Option<Duration> {
        Some(self.next)
    }
}
