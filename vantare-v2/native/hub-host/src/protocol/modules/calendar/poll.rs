//! Host-owned refresh cadence; one shared background lane, no threads or disk writes.
use super::{CalendarView, State};
use chrono::{Datelike, Timelike};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const POLL_NORMAL_MS: i64 = 15 * 60_000;
pub const POLL_MONDAY_MS: i64 = 5 * 60_000;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalendarRefreshFailure {
    Busy,
    CoreUnavailable,
    Denied,
    Rejected,
}
#[derive(Default)]
pub(super) struct Poll {
    last: Option<i64>,
    attempted: Option<Instant>,
    pending: Option<(CalendarView, Option<CalendarRefreshFailure>)>,
}
impl State {
    pub fn poll_due(&self, now: i64) -> bool {
        let Some(date) = chrono::DateTime::from_timestamp_millis(now)
            .filter(|_| (0..=super::TIMESTAMP_LIMIT * 1000).contains(&now))
        else {
            return false;
        };
        let interval = if date.weekday() == chrono::Weekday::Mon && date.hour() < 12 {
            POLL_MONDAY_MS
        } else {
            POLL_NORMAL_MS
        };
        let last = self
            .poll
            .last
            .unwrap_or(self.view.checked.saturating_mul(1000));
        last == 0 || now.saturating_sub(last) >= interval
    }
    pub fn poll_retry_ready(&self, now: Instant) -> bool {
        self.poll
            .attempted
            .is_none_or(|old| now.saturating_duration_since(old) >= Duration::from_secs(1))
    }
    pub fn poll_attempted(&mut self, now: Instant) {
        self.poll.attempted = Some(now);
    }
    pub fn poll_started(&mut self, now: i64) {
        self.poll.last = Some(now);
    }
    pub fn poll_completed(&mut self, now: i64, error: Option<CalendarRefreshFailure>) {
        self.poll.last = Some(now);
        self.poll.pending = Some((self.view.clone(), error));
    }
    pub fn take_refresh(&mut self) -> Option<(CalendarView, Option<CalendarRefreshFailure>)> {
        self.poll.pending.take()
    }
}
