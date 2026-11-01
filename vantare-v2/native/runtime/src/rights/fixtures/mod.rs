//! Convenience entry points for existing fixtures; absent from production builds.
use super::{
    authority::Authority,
    verifier::{Grant, Verified},
};
use chrono::{DateTime, Utc};
use std::time::Duration;
#[cfg(windows)]
use vantare_domain::Snapshot;
#[cfg(windows)]
use vantare_ipc::control::Policy;
use vantare_services::Result;

impl Authority {
    pub fn enter_game(&mut self, session: u64, now: DateTime<Utc>, tick: Duration) -> Result<()> {
        self.enter_game_observed(session, now, now, tick)
    }

    /// Solo el núcleo aporta la hora de entrada observada, conservada fuera de
    /// adquisición. Un retraso de E/S no convierte una entrada válida en vencida.
    pub fn enter_game_observed(
        &mut self,
        session: u64,
        entered_at: DateTime<Utc>,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<()> {
        self.enter_game_identified(session, None, entered_at, now, tick)
    }
}
#[cfg(windows)]
impl super::owner::Owner {
    pub fn advance(
        &mut self,
        snapshot: &Snapshot,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<Policy> {
        self.advance_observed(snapshot, now, now, tick)
    }
    pub fn advance_observed(
        &mut self,
        snapshot: &Snapshot,
        entered_at: DateTime<Utc>,
        now: DateTime<Utc>,
        tick: Duration,
    ) -> Result<Policy> {
        self.advance_observed_session(snapshot, None, entered_at, now, tick)
    }
}
impl Verified {
    pub fn grants(&self) -> &[Grant] {
        &self.grants
    }
}
