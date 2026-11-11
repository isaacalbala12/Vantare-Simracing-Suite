//! Read-only projection of the frozen calendar documents. No network or writes.
use crate::protocol::{AccessView, HostError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::PathBuf};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
pub const DOCUMENT_LIMIT: usize = 64 * 1024;
pub const STARTS_LIMIT: usize = 10_000;
pub const SERIES_LIMIT: usize = 256;
pub const DATE_LIMIT: usize = 40;
pub const TEXT_LIMIT: usize = 300;
pub const LIST_LIMIT: usize = 64;
pub const MINUTE_LIMIT: u32 = 10_080;
pub const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
pub const TIMESTAMP_LIMIT: i64 = 253_402_300_799;
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
fn text(value: &str) -> bool {
    value.len() <= TEXT_LIMIT && !value.chars().any(char::is_control)
}
fn unique(values: &[String], max: usize) -> bool {
    values.len() <= max
        && values.iter().all(|v| text(v) && !v.trim().is_empty())
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
        let date = |s: &str| {
            s.len() <= DATE_LIMIT
                && DateTime::parse_from_rfc3339(s)
                    .is_ok_and(|d| (0..=TIMESTAMP_LIMIT).contains(&d.timestamp()))
        };
        let invalid = self.version != 1
            || self.timezone != "UTC"
            || !date(&self.valid_from)
            || !date(&self.valid_until)
            || DateTime::parse_from_rfc3339(&self.valid_from).ok()
                >= DateTime::parse_from_rfc3339(&self.valid_until).ok()
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
            && !self.id.trim().is_empty()
            && !self.name.trim().is_empty()
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
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Following {
    series_ids: Vec<String>,
}
#[derive(Deserialize)]
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

pub struct State {
    base: PathBuf,
    view: CalendarView,
}
impl State {
    pub fn new(base: PathBuf) -> Self {
        Self {
            base,
            view: CalendarView::default(),
        }
    }
    fn read(&mut self, name: &str) -> Option<Vec<u8>> {
        let path = self.base.join(name);
        match std::fs::symlink_metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
            Ok(m) if m.is_file() && !m.file_type().is_symlink() => {
                if let Ok(v) = vantare_ipc::files::read(&path, DOCUMENT_LIMIT as u64) {
                    Some(v)
                } else {
                    self.view.invalid_cache = true;
                    None
                }
            }
            _ => {
                self.view.invalid_cache = true;
                None
            }
        }
    }
    pub fn load(&mut self) -> CalendarView {
        self.view.invalid_cache = false;
        for (name, which) in [
            ("official-schedule.json", 0),
            ("fallback-schedule.json", 1),
            ("official-schedule-previous.json", 2),
        ] {
            if let Some(bytes) = self.read(name) {
                match CalendarSchedule::parse(&bytes) {
                    Ok(s) => match which {
                        0 => self.view.official = Some(s),
                        1 => self.view.fallback = Some(s),
                        _ => self.view.previous = Some(s),
                    },
                    Err(_) => self.view.invalid_cache = true,
                }
            }
        }
        if let Some(bytes) = self.read("calendar-following.json") {
            match serde_json::from_slice::<Following>(&bytes) {
                Ok(f) if unique(&f.series_ids, SERIES_LIMIT) => self.view.following = f.series_ids,
                _ => self.view.invalid_cache = true,
            }
        }
        if let Some(bytes) = self.read("calendar-prefs.json") {
            match serde_json::from_slice::<Prefs>(&bytes) {
                Ok(p) => self.view.utc = p.utc,
                _ => self.view.invalid_cache = true,
            }
        }
        if let Some(bytes) = self.read("calendar-stamps.json") {
            match serde_json::from_slice::<Stamps>(&bytes) {
                Ok(s)
                    if (0..=TIMESTAMP_LIMIT).contains(&s.checked)
                        && (0..=TIMESTAMP_LIMIT).contains(&s.updated) =>
                {
                    self.view.checked = s.checked;
                    self.view.updated = s.updated;
                }
                _ => self.view.invalid_cache = true,
            }
        }
        self.view.clone()
    }
    pub fn refreshed(
        &mut self,
        official: Option<String>,
        fallback: Option<String>,
    ) -> Result<CalendarView, HostError> {
        // Validate the complete reply before replacing either protected snapshot.
        let official = official
            .map(|s| CalendarSchedule::parse(s.as_bytes()))
            .transpose()?;
        let fallback = fallback
            .map(|s| CalendarSchedule::parse(s.as_bytes()))
            .transpose()?;
        if let Some(s) = official {
            let timestamp = |v: &str| DateTime::parse_from_rfc3339(v).map_or(0, |d| d.timestamp());
            if self
                .view
                .official
                .as_ref()
                .is_none_or(|old| timestamp(&s.valid_from) >= timestamp(&old.valid_from))
            {
                if let Some(old) = self
                    .view
                    .official
                    .as_ref()
                    .filter(|old| timestamp(&old.valid_from) < timestamp(&s.valid_from))
                {
                    self.view.previous = Some(old.clone());
                }
                self.view.official = Some(s);
            }
        }
        if let Some(s) = fallback {
            self.view.fallback = Some(s);
        }
        self.view.checked = Utc::now().timestamp();
        Ok(self.view.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn document() -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({"version":1,"timezone":"UTC","validFrom":"2026-11-09T00:00:00Z","validUntil":"2026-11-16T00:00:00Z","series":[{"id":"qa","name":"QA","track":"Spa","vehicleClass":"GT3","licenseLabel":"Bronce","recurrence":{"kind":"interval","intervalMinutes":60}}]})).expect("fixture")
    }
    #[test]
    fn validates_schedule_and_rejects_invalid_untrusted_fields() {
        assert!(CalendarSchedule::parse(&document()).is_ok());
        for (key, value) in [
            ("timezone", serde_json::json!("Europe/Madrid")),
            ("version", serde_json::json!(2)),
            ("validUntil", serde_json::json!("2026-11-01T00:00:00Z")),
            ("validFrom", serde_json::json!("invalid")),
        ] {
            let mut v: serde_json::Value = serde_json::from_slice(&document()).unwrap();
            v[key] = value;
            assert_eq!(
                CalendarSchedule::parse(&serde_json::to_vec(&v).unwrap()).unwrap_err(),
                HostError::Rejected
            );
        }
        for (key, value) in [
            ("name", serde_json::json!("x".repeat(TEXT_LIMIT + 1))),
            ("id", serde_json::json!("bad\n")),
            ("raceDurationMin", serde_json::json!(MINUTE_LIMIT + 1)),
            (
                "recurrence",
                serde_json::json!({"kind":"weekly-slots","days":["Mon"],"timesUTC":["25:00"]}),
            ),
        ] {
            let mut v: serde_json::Value = serde_json::from_slice(&document()).unwrap();
            v["series"][0][key] = value;
            assert!(CalendarSchedule::parse(&serde_json::to_vec(&v).unwrap()).is_err());
        }
        assert!(CalendarSchedule::parse(&vec![b' '; DOCUMENT_LIMIT + 1]).is_err());
    }
    #[test]
    fn malformed_refresh_preserves_both_protected_snapshots() {
        let mut state = State::new(PathBuf::new());
        let input = String::from_utf8(document()).unwrap();
        let before = state.refreshed(Some(input.clone()), None).unwrap();
        assert!(state.refreshed(Some(input), Some("bad".into())).is_err());
        assert_eq!(state.view, before);
    }
    #[test]
    fn calendar_capability_is_required_independently_of_tester() {
        let mut access = AccessView::default();
        assert!(!allowed(&access));
        access.verified = true;
        access.tester = true;
        assert!(!allowed(&access));
        access.calendar = true;
        assert!(allowed(&access));
        access.blocked = true;
        assert!(!allowed(&access));
    }
    #[test]
    fn cache_load_keeps_original_bytes_and_reports_corruption_without_writes() {
        let base = std::env::temp_dir().join(format!(
            "vantare-calendar-read-{}",
            vantare_services::random_id().expect("QA id")
        ));
        std::fs::create_dir(&base).unwrap();
        let path = base.join("official-schedule.json");
        let original = document();
        std::fs::write(&path, &original).unwrap();
        let mut state = State::new(base.clone());
        assert!(state.load().official.is_some());
        assert_eq!(std::fs::read(&path).unwrap(), original);
        std::fs::write(&path, b"corrupt").unwrap();
        let view = state.load();
        assert!(view.invalid_cache);
        assert!(view.official.is_some());
        assert_eq!(std::fs::read(&path).unwrap(), b"corrupt");
        assert_eq!(std::fs::read_dir(&base).unwrap().count(), 1);
        std::fs::remove_dir_all(base).unwrap();
    }
}
