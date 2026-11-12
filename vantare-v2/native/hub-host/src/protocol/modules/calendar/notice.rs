//! Desktop delivery decisions, separate from the overlay feed. No IO or threads.
use super::{
    CalendarAlerts, CalendarDocumentState, CalendarSchedule, CalendarView, State, agenda,
    date_millis,
};
use crate::protocol::HostError;
use chrono::{Local, TimeZone};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;

pub const NOTICE_TTL_MS: i64 = 60_000;
pub const NOTICE_CLOCK_SKEW_MS: i64 = 5_000;
pub const NOTICE_HISTORY_LIMIT: usize = 16_384;
pub const NOTICE_PRESENTATION_LIMIT: usize = 1024;
pub const NOTICE_BATCH_LIMIT: usize = 256;
pub const NOTICE_TEST_INTERVAL_MS: u64 = 5_000;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum CalendarNotice {
    Start {
        id: String,
        #[serde(rename = "issuedAt")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        issued_at: i64,
        #[serde(rename = "expiresAt")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        expires_at: i64,
        series: String,
        track: String,
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        at: i64,
        #[serde(rename = "raceMinutes")]
        race_minutes: u32,
        silent: bool,
    },
    Week {
        id: String,
        #[serde(rename = "issuedAt")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        issued_at: i64,
        #[serde(rename = "expiresAt")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        expires_at: i64,
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        from: i64,
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        until: i64,
        silent: bool,
    },
    Test {
        id: String,
        #[serde(rename = "issuedAt")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        issued_at: i64,
        #[serde(rename = "expiresAt")]
        #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
        expires_at: i64,
        #[serde(rename = "requestId")]
        request_id: u32,
        silent: bool,
    },
}
impl CalendarNotice {
    pub fn id(&self) -> &str {
        match self {
            Self::Start { id, .. } | Self::Week { id, .. } | Self::Test { id, .. } => id,
        }
    }
}
#[derive(Default)]
pub(super) struct Scheduler {
    since: Option<i64>,
    refresh_initialized: bool,
    pending_week: Option<CalendarNotice>,
    limit_reported: bool,
    last_tick: Option<Instant>,
    last_enabled: bool,
    last_track: bool,
    seen: BTreeMap<String, i64>,
    last_test: Option<Instant>,
    test_sequence: u64,
}
fn valid_clock(now: i64) -> bool {
    (0..=super::TIMESTAMP_LIMIT * 1000 - NOTICE_TTL_MS).contains(&now)
}
fn known_week(view: &CalendarView, now: i64) -> Option<i64> {
    [&view.official, &view.previous, &view.fallback]
        .into_iter()
        .flatten()
        .filter_map(|s| date_millis(&s.valid_from))
        .filter(|from| *from <= now)
        .max()
}
// Exact Alerts::due interval: future departures, fire in (since, now].
fn due_in<Z: TimeZone>(
    s: &CalendarSchedule,
    a: &CalendarAlerts,
    now: i64,
    since: i64,
    in_track: bool,
    zone: &Z,
) -> Vec<(i64, usize)> {
    let lead = i64::from(a.lead_min) * 60_000;
    let mut out = Vec::new();
    for (i, series) in s.series.iter().enumerate() {
        let Ok(starts) = agenda::starts(s, series, now, now.saturating_add(lead + 60_000)) else {
            continue;
        };
        for at in starts {
            let fire = at - lead;
            if fire <= since || fire > now {
                continue;
            }
            match agenda::cause_in(s, series, at, a, zone).ok().flatten() {
                Some(agenda::Cause::Band) if in_track => {}
                Some(_) => out.push((at, i)),
                None => {}
            }
        }
    }
    out.sort_by(|(at, a), (bt, b)| {
        at.cmp(bt)
            .then_with(|| s.series[*a].id.cmp(&s.series[*b].id))
    });
    out
}
impl Scheduler {
    fn accept(&mut self, id: &str, until: i64) -> bool {
        if self.seen.contains_key(id) || self.seen.len() >= NOTICE_HISTORY_LIMIT {
            return false;
        }
        self.seen.insert(id.to_owned(), until);
        true
    }
    #[cfg(test)]
    fn tick<Z: TimeZone>(
        &mut self,
        view: &CalendarView,
        alerts: &CalendarAlerts,
        time: (i64, Instant),
        enabled: bool,
        in_track: bool,
        zone: &Z,
    ) -> Vec<CalendarNotice> {
        self.tick_current(
            agenda::current(view, time.0).as_ref(),
            alerts,
            time,
            enabled,
            in_track,
            zone,
        )
    }
    fn tick_current<Z: TimeZone>(
        &mut self,
        current: Option<&CalendarSchedule>,
        alerts: &CalendarAlerts,
        time: (i64, Instant),
        enabled: bool,
        in_track: bool,
        zone: &Z,
    ) -> Vec<CalendarNotice> {
        let (now, clock) = time;
        let changed = self.last_enabled != enabled || self.last_track != in_track;
        self.last_enabled = enabled;
        self.last_track = in_track;
        if !changed
            && self
                .last_tick
                .is_some_and(|old| clock.saturating_duration_since(old) < Duration::from_secs(1))
        {
            return vec![];
        }
        self.last_tick = Some(clock);
        if !valid_clock(now) {
            self.since = None;
            self.pending_week = None;
            return vec![];
        }
        self.seen.retain(|_, end| *end >= now);
        if !enabled {
            self.since = Some(now);
            self.pending_week = None;
            return vec![];
        }
        let since = self.since.replace(now);
        let Some(since) = since.filter(|since| *since <= now) else {
            return vec![];
        };
        let Some(schedule) = current else {
            return vec![];
        };
        if !alerts.channels.windows {
            self.pending_week = None;
            return vec![];
        }
        let silent = !alerts.channels.sound || in_track;
        let mut notices = Vec::new();
        if let Some(value) = self.pending_week.take() {
            if alerts.notify_week
                && matches!(&value,CalendarNotice::Week{from,expires_at,..} if Some(*from)==date_millis(&schedule.valid_from) && *expires_at>=now)
            {
                notices.push(value);
            }
        }
        let mut limited = false;
        for (at, i) in due_in(schedule, alerts, now, since, in_track, zone) {
            if notices.len() >= NOTICE_BATCH_LIMIT {
                limited = true;
                if !self.limit_reported {
                    eprintln!("calendar notice: due batch limit");
                }
                break;
            }
            let series = &schedule.series[i];
            let id = vantare_services::content_hash(
                format!("calendar-start:{}:{at}", series.id).as_bytes(),
            );
            if !self.accept(&id, at) {
                continue;
            }
            let race_minutes = series
                .sessions
                .iter()
                .find(|p| p.name == "race")
                .map_or(series.race_duration_min.unwrap_or(0), |p| p.duration_min);
            notices.push(CalendarNotice::Start {
                id,
                issued_at: now,
                expires_at: at.min(now + NOTICE_TTL_MS),
                series: series.name.clone(),
                track: series.track.clone(),
                at,
                race_minutes,
                silent,
            });
        }
        self.limit_reported = limited;
        notices
    }
    fn test(
        &mut self,
        request_id: u32,
        now: i64,
        clock: Instant,
        silent: bool,
    ) -> Result<CalendarNotice, HostError> {
        if !valid_clock(now) {
            return Err(HostError::Rejected);
        }
        if self.last_test.is_some_and(|old| {
            clock.saturating_duration_since(old) < Duration::from_millis(NOTICE_TEST_INTERVAL_MS)
        }) {
            return Err(HostError::Busy);
        }
        self.last_test = Some(clock);
        self.test_sequence = self.test_sequence.wrapping_add(1);
        let id = vantare_services::content_hash(
            format!("calendar-test:{now}:{request_id}:{}", self.test_sequence).as_bytes(),
        );
        Ok(CalendarNotice::Test {
            id,
            issued_at: now,
            expires_at: now + NOTICE_TTL_MS,
            request_id,
            silent,
        })
    }
}
impl State {
    pub fn notice_tick(
        &mut self,
        now: i64,
        clock: Instant,
        enabled: bool,
        in_track: bool,
    ) -> Vec<CalendarNotice> {
        let safe = enabled && self.config_view.documents.alerts == CalendarDocumentState::Ready;
        self.cache_current(now);
        self.notices.tick_current(
            self.cached_current.as_ref(),
            &self.config_view.alerts,
            (now, clock),
            safe,
            in_track,
            &Local,
        )
    }
    pub fn refresh_notices(
        &mut self,
        official: Option<String>,
        fallback: Option<String>,
        now: i64,
        enabled: bool,
        in_track: bool,
    ) -> Result<CalendarView, HostError> {
        self.load();
        self.config();
        self.cache_current(now);
        let was_current = self.cached_current.is_some();
        let before = self
            .cached_current
            .as_ref()
            .and_then(|s| date_millis(&s.valid_from))
            .or_else(|| known_week(&self.view, now));
        let current_publication = |value: Option<String>| -> Result<Option<String>, HostError> {
            let Some(raw) = value else { return Ok(None) };
            let parsed = CalendarSchedule::parse(raw.as_bytes())?;
            Ok(date_millis(&parsed.valid_from)
                .zip(date_millis(&parsed.valid_until))
                .filter(|(from, until)| *from <= now && now < *until)
                .map(|_| raw))
        };
        let official = current_publication(official)?;
        let fallback = current_publication(fallback)?;
        let arrived = official.is_some() || fallback.is_some();
        let value = self.refreshed(official, fallback)?;
        self.cache_current(now);
        let announce = self.notices.refresh_initialized || was_current;
        if let Some(schedule) = self.cached_current.as_ref() {
            self.notices.refresh_initialized = true;
            if arrived
                && announce
                && enabled
                && valid_clock(now)
                && self.config_view.documents.alerts == CalendarDocumentState::Ready
                && self.config_view.alerts.notify_week
                && self.config_view.alerts.channels.windows
                && let Some(from) = date_millis(&schedule.valid_from)
                && before.is_some_and(|old| from > old)
                && let Some(until) = date_millis(&schedule.valid_until)
            {
                let id = vantare_services::content_hash(format!("calendar-week:{from}").as_bytes());
                if self.notices.accept(&id, until) {
                    self.notices.pending_week = Some(CalendarNotice::Week {
                        id,
                        issued_at: now,
                        expires_at: now + NOTICE_TTL_MS,
                        from,
                        until,
                        silent: !self.config_view.alerts.channels.sound || in_track,
                    });
                }
            }
        }
        Ok(value)
    }
    pub fn notice_test(
        &mut self,
        request_id: u32,
        now: i64,
        clock: Instant,
        in_track: bool,
    ) -> Result<CalendarNotice, HostError> {
        self.config();
        match self.config_view.documents.alerts {
            CalendarDocumentState::Protected => return Err(HostError::Protected),
            CalendarDocumentState::Unavailable => return Err(HostError::CoreUnavailable),
            CalendarDocumentState::Ready => {}
        }
        self.notices.test(
            request_id,
            now,
            clock,
            !self.config_view.alerts.channels.sound || in_track,
        )
    }
}
#[cfg(test)]
#[path = "notice_tests.rs"]
mod tests;
