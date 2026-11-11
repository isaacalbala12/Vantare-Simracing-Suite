#[path = "history.rs"]
mod history;
pub use history::{CalendarHistoryTrack, CalendarHistoryWeek, CalendarHistoryView, HISTORY_WEEKS_LIMIT};
#[path = "config.rs"]
pub mod config;
pub use config::{
    CalendarAlerts, CalendarBand, CalendarBandMode, CalendarChannels, CalendarConfigView,
    CalendarDays, CalendarDocumentState, CalendarDocumentStates, CalendarSlot,
};
// Calendar publication projection and local preferences.
use crate::protocol::{AccessView, HostError};
use chrono::DateTime;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::PathBuf};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const DOCUMENT_LIMIT: usize = 64 * 1024;
pub const SERIES_LIMIT: usize = 256;
// Same bounded expansion used by the frozen GPUI calendar model.
#[cfg(any(test, feature = "bindings"))]
pub const STARTS_LIMIT: usize = 10_000;
pub const DATE_LIMIT: usize = 40;
pub const TEXT_LIMIT: usize = 300;
pub const LIST_LIMIT: usize = 64;
pub const MINUTE_LIMIT: u32 = 10_080;
pub const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
pub const TIMESTAMP_LIMIT: i64 = 253_402_300_799;
const CACHE_LIMIT: u64 = 256 * 1024;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarView {
    #[serde(default)]
    pub official: Option<CalendarSchedule>,
    #[serde(default)]
    pub fallback: Option<CalendarSchedule>,
    #[serde(default)]
    pub previous: Option<CalendarSchedule>,
    #[serde(default)]
    pub following: Vec<String>,
    #[serde(default)]
    pub utc: bool,
    #[serde(default)]
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub checked: i64,
    #[serde(default)]
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub updated: i64,
    #[serde(default)]
    pub invalid_cache: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSchedule {
    pub version: u32,
    pub timezone: String,
    pub valid_from: String,
    pub valid_until: String,
    pub series: Vec<CalendarSeries>,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSeries {
    pub id: String,
    pub name: String,
    pub track: String,
    pub vehicle_class: String,
    #[serde(default)]
    pub classes: Vec<CalendarClass>,
    #[serde(default)]
    pub race_duration_min: Option<u32>,
    #[serde(default)]
    pub event_duration_min: Option<u32>,
    #[serde(default)]
    pub sessions: Vec<CalendarPhase>,
    pub license_label: String,
    #[serde(default)]
    pub tier: String,
    #[serde(default)]
    pub event_kind: String,
    #[serde(default)]
    pub format: String,
    #[serde(default)]
    pub setup: String,
    #[serde(default)]
    pub assists: String,
    #[serde(default)]
    pub tyre_warmers: bool,
    #[serde(default)]
    pub tyres: Option<u32>,
    #[serde(default)]
    pub splits: Option<u32>,
    #[serde(default)]
    pub safety_rating: String,
    #[serde(default)]
    pub ve_limit: Option<u32>,
    #[serde(default)]
    pub notes: Vec<String>,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub start_offset_minute: i32,
    pub recurrence: CalendarRecurrence,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarClass {
    pub name: String,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarPhase {
    pub name: String,
    pub duration_min: u32,
    #[serde(default)]
    pub estimated: bool,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarRecurrence {
    pub kind: String,
    #[serde(default)]
    pub interval_minutes: u32,
    #[serde(default)]
    pub days: Vec<String>,
    #[serde(default)]
    #[serde(rename = "timesUTC")]
    pub times_utc: Vec<String>,
}

pub fn allowed(access: &AccessView) -> bool {
    access.verified && !access.blocked && access.calendar
}
fn nonblank(value: &str) -> bool {
    !value
        .trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .is_empty()
}
fn date_millis(value: &str) -> Option<i64> {
    let b = value.as_bytes();
    let digits = |part: &[u8]| part.iter().all(u8::is_ascii_digit);
    if b.len() < 20
        || b.len() > DATE_LIMIT
        || b[4] != b'-'
        || b[7] != b'-'
        || b[10] != b'T'
        || b[13] != b':'
        || b[16] != b':'
        || ![
            &b[..4],
            &b[5..7],
            &b[8..10],
            &b[11..13],
            &b[14..16],
            &b[17..19],
        ]
        .into_iter()
        .all(digits)
    {
        return None;
    }
    let number = |part: &[u8]| part.iter().fold(0u16, |n, d| n * 10 + u16::from(d - b'0'));
    if number(&b[11..13]) > 23 || number(&b[14..16]) > 59 || number(&b[17..19]) > 59 {
        return None;
    }
    let mut zone = 19;
    if b[zone] == b'.' {
        zone += 1;
        let start = zone;
        while b.get(zone).is_some_and(u8::is_ascii_digit) {
            zone += 1;
        }
        if !(1..=3).contains(&(zone - start)) {
            return None;
        }
    }
    match b.get(zone) {
        Some(b'Z') if zone + 1 == b.len() => {}
        Some(b'+' | b'-')
            if zone + 6 == b.len()
                && b[zone + 3] == b':'
                && digits(&b[zone + 1..zone + 3])
                && digits(&b[zone + 4..])
                && number(&b[zone + 1..zone + 3]) <= 23
                && number(&b[zone + 4..]) <= 59 => {}
        _ => return None,
    }
    let millis = DateTime::parse_from_rfc3339(value).ok()?.timestamp_millis();
    (millis >= 0 && millis / 1000 <= TIMESTAMP_LIMIT).then_some(millis)
}
fn text(value: &str) -> bool {
    value.len() <= TEXT_LIMIT && !value.chars().any(char::is_control)
}
fn unique(values: &[String], max: usize) -> bool {
    values.len() <= max
        && values.iter().all(|v| text(v) && nonblank(v))
        && values.iter().collect::<HashSet<_>>().len() == values.len()
}
impl CalendarSchedule {
    pub fn parse(bytes: &[u8]) -> Result<Self, HostError> {
        if bytes.len() > DOCUMENT_LIMIT {
            return Err(HostError::Rejected);
        }
        let schedule: Self = serde_json::from_slice(bytes).map_err(|_| HostError::Rejected)?;
        schedule.validate()?;
        Ok(schedule)
    }
    pub fn validate(&self) -> Result<(), HostError> {
        let invalid = self.version != 1
            || self.timezone != "UTC"
            || date_millis(&self.valid_from).is_none()
            || date_millis(&self.valid_until).is_none()
            || date_millis(&self.valid_from) >= date_millis(&self.valid_until)
            || self.series.is_empty()
            || self.series.len() > SERIES_LIMIT
            || self
                .series
                .iter()
                .map(|s| &s.id)
                .collect::<HashSet<_>>()
                .len()
                != self.series.len();
        if invalid || self.series.iter().any(|s| !s.valid()) {
            return Err(HostError::Rejected);
        }
        Ok(())
    }
}
impl CalendarSeries {
    fn valid(&self) -> bool {
        let texts = [
            &self.id,
            &self.name,
            &self.track,
            &self.vehicle_class,
            &self.license_label,
            &self.tier,
            &self.event_kind,
            &self.format,
            &self.setup,
            &self.assists,
            &self.safety_rating,
            &self.source,
        ];
        let duration = |n: Option<u32>| n.is_none_or(|n| n <= MINUTE_LIMIT);
        let r = &self.recurrence;
        let bounded = r.days.len() <= LIST_LIMIT
            && r.times_utc.len() <= LIST_LIMIT
            && r.days.iter().chain(&r.times_utc).all(|v| text(v));
        let recurrence = bounded
            && match r.kind.as_str() {
                "interval" => (1..=MINUTE_LIMIT).contains(&r.interval_minutes),
                "weekly-slots" => {
                    !r.days.is_empty()
                        && unique(&r.days, WEEKDAYS.len())
                        && r.days.iter().all(|d| WEEKDAYS.contains(&d.as_str()))
                        && !r.times_utc.is_empty()
                        && unique(&r.times_utc, LIST_LIMIT)
                        && r.times_utc.iter().all(|t| {
                            let b = t.as_bytes();
                            b.len() == 5
                                && b[2] == b':'
                                && [0, 1, 3, 4].iter().all(|i| b[*i].is_ascii_digit())
                                && chrono::NaiveTime::parse_from_str(t, "%H:%M").is_ok()
                        })
                }
                _ => false,
            };
        texts.iter().all(|s| text(s))
            && nonblank(&self.id)
            && nonblank(&self.name)
            && self.notes.len() <= LIST_LIMIT
            && self.notes.iter().all(|s| text(s))
            && self.classes.len() <= LIST_LIMIT
            && self.classes.iter().all(|s| text(&s.name))
            && self.sessions.len() <= LIST_LIMIT
            && self
                .sessions
                .iter()
                .all(|s| text(&s.name) && s.duration_min <= MINUTE_LIMIT)
            && [
                self.race_duration_min,
                self.event_duration_min,
                self.tyres,
                self.splits,
                self.ve_limit,
            ]
            .into_iter()
            .all(duration)
            && self.start_offset_minute.unsigned_abs() <= MINUTE_LIMIT
            && recurrence
    }
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Following {
    series_ids: Vec<String>,
}
#[derive(Default, Serialize, Deserialize)]
struct Prefs {
    #[serde(default)]
    utc: bool,
}
#[derive(Deserialize)]
struct Stamps {
    #[serde(default)]
    checked: i64,
    #[serde(default)]
    updated: i64,
}

#[derive(Default)]
struct Publications {
    official: Option<CalendarSchedule>,
    fallback: Option<CalendarSchedule>,
    previous: Option<CalendarSchedule>,
}
enum Read {
    Missing,
    Invalid,
    Bytes(Vec<u8>),
}
fn newest(a: Option<CalendarSchedule>, b: Option<CalendarSchedule>) -> Option<CalendarSchedule> {
    match (a, b) {
        (Some(a), Some(b)) => Some(if date_millis(&a.valid_from) > date_millis(&b.valid_from) {
            a
        } else {
            b
        }),
        (a, b) => a.or(b),
    }
}
pub struct State {
    base: PathBuf,
    view: CalendarView,
    disk: Publications,
    memory: Publications,
    config_view: CalendarConfigView,
}
impl State {
    pub fn new(base: PathBuf) -> Self {
        Self {
            base,
            view: CalendarView::default(),
            disk: Publications::default(),
            memory: Publications::default(),
            config_view: CalendarConfigView::default(),
        }
    }
    fn read(&mut self, name: &str) -> Read {
        let path = self.base.join(name);
        match std::fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Read::Missing,
            Ok(m) if m.is_file() && !m.file_type().is_symlink() => {
                if let Ok(bytes) = vantare_ipc::files::read(&path, CACHE_LIMIT) {
                    return Read::Bytes(bytes);
                }
            }
            _ => {}
        }
        self.view.invalid_cache = true;
        Read::Invalid
    }
    fn read_publication(
        &mut self,
        name: &str,
        prior: Option<CalendarSchedule>,
    ) -> Option<CalendarSchedule> {
        match self.read(name) {
            Read::Missing => None,
            Read::Invalid => prior,
            Read::Bytes(bytes) => {
                if let Ok(next) = CalendarSchedule::parse(&bytes) {
                    newest(prior, Some(next))
                } else {
                    self.view.invalid_cache = true;
                    prior
                }
            }
        }
    }
    fn project(&mut self) -> CalendarView {
        self.view.official = newest(self.disk.official.clone(), self.memory.official.clone());
        self.view.fallback = newest(self.disk.fallback.clone(), self.memory.fallback.clone());
        self.view.previous = newest(self.disk.previous.clone(), self.memory.previous.clone());
        self.view.clone()
    }
    pub fn load(&mut self) -> CalendarView {
        self.view.invalid_cache = false;
        let prior = self.disk.official.take();
        self.disk.official = self.read_publication("official-schedule.json", prior);
        let prior = self.disk.fallback.take();
        self.disk.fallback = self.read_publication("fallback-schedule.json", prior);
        let prior = self.disk.previous.take();
        self.disk.previous = self.read_publication("official-schedule-previous.json", prior);
        match self.read("calendar-following.json") {
            Read::Missing | Read::Invalid => self.view.following.clear(),
            Read::Bytes(bytes) => match serde_json::from_slice::<Following>(&bytes) {
                Ok(f) if unique(&f.series_ids, SERIES_LIMIT) => self.view.following = f.series_ids,
                _ => {
                    self.view.following.clear();
                    self.view.invalid_cache = true;
                }
            },
        }
        match self.read("calendar-prefs.json") {
            Read::Missing | Read::Invalid => self.view.utc = false,
            Read::Bytes(bytes) => {
                if let Ok(p) = serde_json::from_slice::<Prefs>(&bytes) {
                    self.view.utc = p.utc;
                } else {
                    self.view.utc = false;
                    self.view.invalid_cache = true;
                }
            }
        }
        match self.read("calendar-stamps.json") {
            Read::Missing => {
                self.view.checked = 0;
                self.view.updated = 0;
            }
            Read::Bytes(bytes) => match serde_json::from_slice::<Stamps>(&bytes) {
                Ok(s)
                    if (0..=TIMESTAMP_LIMIT).contains(&s.checked)
                        && (0..=TIMESTAMP_LIMIT).contains(&s.updated) =>
                {
                    self.view.checked = s.checked;
                    self.view.updated = s.updated;
                }
                _ => self.view.invalid_cache = true,
            },
            Read::Invalid => {}
        }
        self.project()
    }
    pub fn refreshed(
        &mut self,
        official: Option<String>,
        fallback: Option<String>,
    ) -> Result<CalendarView, HostError> {
        let official = official
            .map(|s| CalendarSchedule::parse(s.as_bytes()))
            .transpose()?;
        let fallback = fallback
            .map(|s| CalendarSchedule::parse(s.as_bytes()))
            .transpose()?;
        if let Some(next) = official
            && self
                .view
                .official
                .as_ref()
                .is_none_or(|old| date_millis(&next.valid_from) >= date_millis(&old.valid_from))
        {
            if let Some(old) = self
                .view
                .official
                .as_ref()
                .filter(|old| date_millis(&next.valid_from) > date_millis(&old.valid_from))
            {
                self.memory.previous = newest(self.view.previous.clone(), Some(old.clone()));
            }
            self.memory.official = Some(next);
        }
        self.memory.fallback = newest(self.memory.fallback.take(), fallback);
        Ok(self.project())
    }
}

#[cfg(test)]
#[path = "model_tests.rs"]
mod tests;
