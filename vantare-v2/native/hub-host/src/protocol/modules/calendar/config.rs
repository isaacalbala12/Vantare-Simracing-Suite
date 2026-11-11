//! Local preferences: merge only the chosen field and compare observed bytes atomically.
use super::{SERIES_LIMIT, State, TEXT_LIMIT, TIMESTAMP_LIMIT, nonblank, text, unique};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::files;
pub const CONFIG_LIMIT: u64 = 256 * 1024;
pub const REVISION_LENGTH: usize = 64;
pub const ALERT_LEADS: [u8; 4] = [5, 10, 15, 30];
pub const BANDS_LIMIT: usize = 64;
pub const DAY_MINUTES: u16 = 1440;
pub const SLOTS_LIMIT: usize = 512;
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarDays {
    #[default]
    All,
    Weekdays,
    Weekend,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarBandMode {
    #[default]
    Each,
    First,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarBand {
    pub series_id: String,
    pub from: u16,
    pub to: u16,
    #[serde(default)]
    pub days: CalendarDays,
    #[serde(default)]
    pub mode: CalendarBandMode,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSlot {
    pub series_id: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub at: i64,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CalendarChannels {
    pub windows: bool,
    pub in_track: bool,
    pub sound: bool,
}
impl Default for CalendarChannels {
    fn default() -> Self {
        Self {
            windows: true,
            in_track: true,
            sound: false,
        }
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CalendarAlerts {
    pub lead_min: u8,
    pub bands: Vec<CalendarBand>,
    pub slots: Vec<CalendarSlot>,
    pub channels: CalendarChannels,
    pub auto_launch: bool,
    pub notify_week: bool,
}
impl Default for CalendarAlerts {
    fn default() -> Self {
        Self {
            lead_min: 10,
            bands: vec![],
            slots: vec![],
            channels: CalendarChannels::default(),
            auto_launch: false,
            notify_week: true,
        }
    }
}
impl CalendarAlerts {
    fn valid(&self) -> bool {
        ALERT_LEADS.contains(&self.lead_min)
            && self.bands.len() <= BANDS_LIMIT
            && self.slots.len() <= SLOTS_LIMIT
            && self.bands.iter().all(|b| {
                text(&b.series_id) && nonblank(&b.series_id) && b.from < b.to && b.to <= DAY_MINUTES
            })
            && self.slots.iter().all(|s| {
                text(&s.series_id)
                    && nonblank(&s.series_id)
                    && (0..=TIMESTAMP_LIMIT).contains(&s.at)
            })
    }
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarConfigView {
    pub utc: bool,
    pub prefs_revision: String,
    pub following: Vec<String>,
    pub following_revision: String,
    pub alerts: CalendarAlerts,
    pub alerts_revision: String,
}
fn revision(bytes: Option<&[u8]>) -> String {
    let mut input = vec![u8::from(bytes.is_some())];
    input.extend_from_slice(bytes.unwrap_or_default());
    vantare_services::content_hash(&input)
}
struct Document {
    value: Value,
    bytes: Option<Vec<u8>>,
    revision: String,
}
impl Document {
    fn parse(bytes: Option<Vec<u8>>) -> Result<Self, HostError> {
        let value = bytes
            .as_deref()
            .map(serde_json::from_slice)
            .transpose()
            .map_err(|_| HostError::Protected)?
            .unwrap_or_else(|| json!({}));
        if !value.is_object() || value.get("version").is_some_and(|v| v.as_u64() != Some(1)) {
            return Err(HostError::Protected);
        }
        let revision = revision(bytes.as_deref());
        Ok(Self {
            value,
            bytes,
            revision,
        })
    }
}
pub(crate) fn empty_revision() -> String {
    revision(None)
}
pub fn revision_valid(value: &str) -> bool {
    value.len() == REVISION_LENGTH
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
impl State {
    fn document(&self, name: &str) -> Result<Document, HostError> {
        let path = self.base.join(name);
        match std::fs::symlink_metadata(&path) {
            Ok(m) if m.file_type().is_symlink() || !m.is_file() => {
                return Err(HostError::Protected);
            }
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(HostError::Io),
            _ => {}
        }
        Document::parse(files::read_optional(&path, CONFIG_LIMIT).map_err(|error| {
            if error.kind() == files::Kind::InvalidInput {
                HostError::Protected
            } else {
                HostError::Io
            }
        })?)
    }
    pub fn config(&self) -> Result<CalendarConfigView, HostError> {
        let prefs = self.document("calendar-prefs.json")?;
        let following = self.document("calendar-following.json")?;
        let alerts = self.document("calendar-alerts.json")?;
        let utc = prefs
            .value
            .get("utc")
            .map(Value::as_bool)
            .unwrap_or(Some(false))
            .ok_or(HostError::Protected)?;
        let ids: Vec<String> = following
            .value
            .get("seriesIds")
            .cloned()
            .map(serde_json::from_value)
            .transpose()
            .map_err(|_| HostError::Protected)?
            .unwrap_or_default();
        let settings: CalendarAlerts =
            serde_json::from_value(alerts.value).map_err(|_| HostError::Protected)?;
        if !unique(&ids, SERIES_LIMIT) || !settings.valid() {
            return Err(HostError::Protected);
        }
        Ok(CalendarConfigView {
            utc,
            prefs_revision: prefs.revision,
            following: ids,
            following_revision: following.revision,
            alerts: settings,
            alerts_revision: alerts.revision,
        })
    }
    fn conflict(&self) -> HostError {
        self.config().map_or_else(
            |e| e,
            |current| HostError::CalendarConflict {
                current: Box::new(current),
            },
        )
    }
    fn save_config(
        &self,
        name: &str,
        field: &str,
        value: Value,
        expected: &str,
    ) -> Result<CalendarConfigView, HostError> {
        if !revision_valid(expected) {
            return Err(HostError::Rejected);
        }
        let mut current = self.config()?;
        let observed = match name {
            "calendar-prefs.json" => &current.prefs_revision,
            "calendar-following.json" => &current.following_revision,
            "calendar-alerts.json" => &current.alerts_revision,
            _ => return Err(HostError::Rejected),
        };
        if observed != expected {
            return Err(self.conflict());
        }
        let mut doc = self.document(name)?;
        if doc.revision != expected {
            return Err(self.conflict());
        }
        doc.value[field] = value;
        let bytes = serde_json::to_vec_pretty(&doc.value).map_err(|_| HostError::Rejected)?;
        let next_revision = revision(Some(&bytes));
        // Prepare the exact reply before committing. A later read cannot turn a saved
        // action into a reported failure; other documents retain their own revisions.
        match name {
            "calendar-prefs.json" => {
                current.utc = doc.value["utc"].as_bool().ok_or(HostError::Rejected)?;
                current.prefs_revision = next_revision;
            }
            "calendar-following.json" => {
                current.following = serde_json::from_value(doc.value["seriesIds"].clone())
                    .map_err(|_| HostError::Rejected)?;
                current.following_revision = next_revision;
            }
            "calendar-alerts.json" => {
                current.alerts =
                    serde_json::from_value(doc.value.clone()).map_err(|_| HostError::Rejected)?;
                current.alerts_revision = next_revision;
            }
            _ => return Err(HostError::Rejected),
        }
        std::fs::create_dir_all(&self.base).map_err(|_| HostError::Io)?;
        files::save(
            &self.base.join(name),
            &bytes,
            files::Mode::Observed(doc.bytes.as_deref()),
            &files::Options {
                limit: CONFIG_LIMIT,
                ..Default::default()
            },
        )
        .map_err(|error| match error.kind() {
            files::Kind::Conflict => self.conflict(),
            files::Kind::Busy => HostError::Busy,
            files::Kind::InvalidInput => HostError::Rejected,
            files::Kind::Local => HostError::Io,
        })?;
        Ok(current)
    }
    pub fn utc_set(&mut self, utc: bool, expected: &str) -> Result<CalendarConfigView, HostError> {
        let result = self.save_config("calendar-prefs.json", "utc", json!(utc), expected)?;
        self.view.utc = result.utc;
        Ok(result)
    }
    pub fn notify_week_set(
        &self,
        enabled: bool,
        expected: &str,
    ) -> Result<CalendarConfigView, HostError> {
        self.save_config(
            "calendar-alerts.json",
            "notifyWeek",
            json!(enabled),
            expected,
        )
    }
    pub fn follow_set(
        &mut self,
        id: &str,
        followed: bool,
        expected: &str,
    ) -> Result<CalendarConfigView, HostError> {
        if !revision_valid(expected) || !nonblank(id) || id.len() > TEXT_LIMIT || !text(id) {
            return Err(HostError::Rejected);
        }
        let config = self.config()?;
        if config.following_revision != expected {
            return Err(self.conflict());
        }
        if followed
            && !self
                .view
                .official
                .iter()
                .chain(&self.view.fallback)
                .chain(&self.view.previous)
                .flat_map(|s| &s.series)
                .any(|s| s.id == id)
        {
            return Err(HostError::Rejected);
        }
        let mut ids = config.following;
        ids.retain(|v| v != id);
        if followed {
            ids.push(id.into());
        }
        if !unique(&ids, SERIES_LIMIT) {
            return Err(HostError::Rejected);
        }
        let result =
            self.save_config("calendar-following.json", "seriesIds", json!(ids), expected)?;
        self.view.following = result.following.clone();
        Ok(result)
    }
}

#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
