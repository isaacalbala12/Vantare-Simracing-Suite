//! Monotonic acquisition cadence. A stalled consumer never creates catch-up
//! bursts: missed slots are skipped and the next deadline stays on phase.

use std::time::{Duration, Instant};

pub const SHM_INTERVAL: Duration = Duration::from_nanos(1_000_000_000 / 60);

pub struct TickCadence {
    origin: Instant,
    next_slot: u64,
}

impl TickCadence {
    pub fn new(origin: Instant) -> Self {
        Self {
            origin,
            next_slot: 1,
        }
    }

    pub fn deadline(&self) -> Instant {
        self.origin + slot_offset(self.next_slot)
    }

    /// Returns one due tick and skips every elapsed slot. `now` must come
    /// from the same monotonic clock as the origin.
    pub fn take_due(&mut self, now: Instant) -> bool {
        if now < self.deadline() {
            return false;
        }
        let elapsed = now.duration_since(self.origin).as_nanos();
        let next = elapsed / SHM_INTERVAL.as_nanos() + 1;
        self.next_slot = u64::try_from(next).unwrap_or(u64::MAX);
        true
    }
}

fn slot_offset(slot: u64) -> Duration {
    Duration::from_nanos(SHM_INTERVAL.as_nanos() as u64)
        .saturating_mul(u32::try_from(slot).unwrap_or(u32::MAX))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sixty_hz_deadline_and_no_catch_up_bursts() {
        let origin = Instant::now();
        let mut cadence = TickCadence::new(origin);
        assert_eq!(cadence.deadline(), origin + SHM_INTERVAL);
        assert!(!cadence.take_due(origin + SHM_INTERVAL - Duration::from_nanos(1)));
        assert!(cadence.take_due(origin + SHM_INTERVAL));
        assert_eq!(cadence.deadline(), origin + SHM_INTERVAL * 2);
        assert!(!cadence.take_due(origin + SHM_INTERVAL));
        assert!(cadence.take_due(origin + SHM_INTERVAL * 5));
        assert_eq!(cadence.deadline(), origin + SHM_INTERVAL * 6);
        assert!(!cadence.take_due(origin + SHM_INTERVAL * 5));
    }
}
