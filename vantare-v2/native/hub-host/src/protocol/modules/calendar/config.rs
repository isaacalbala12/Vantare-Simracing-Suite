//! Local GPUI documents, isolated validation and observed-byte CAS writes.
use super::{
    Following, Prefs, SERIES_LIMIT, State, TEXT_LIMIT, TIMESTAMP_LIMIT, date_millis, nonblank,
    text, unique,
};
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarSlot {
    pub series_id: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub at: i64,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
fn default_lead() -> u8 {
    10
}
fn yes() -> bool {
    true
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarAlerts {
    #[serde(default = "default_lead")]
    pub lead_min: u8,
    #[serde(default)]
    pub bands: Vec<CalendarBand>,
    #[serde(default)]
    pub slots: Vec<CalendarSlot>,
    #[serde(default)]
    pub channels: CalendarChannels,
    #[serde(default)]
    pub auto_launch: bool,
    #[serde(default = "yes")]
    pub notify_week: bool,
}
impl Default for CalendarAlerts {
    fn default() -> Self {
        Self {
            lead_min: default_lead(),
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
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalendarDocumentState {
    Ready,
    Protected,
    #[default]
    Unavailable,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarDocumentStates {
    pub prefs: CalendarDocumentState,
    pub following: CalendarDocumentState,
    pub alerts: CalendarDocumentState,
}
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CalendarConfigView {
    pub utc: bool,
    pub prefs_revision: Option<String>,
    pub following: Vec<String>,
    pub following_revision: Option<String>,
    pub alerts: CalendarAlerts,
    pub alerts_revision: Option<String>,
    pub documents: CalendarDocumentStates,
}
fn revision(bytes: Option<&[u8]>) -> String {
    let mut input = vec![u8::from(bytes.is_some())];
    input.extend_from_slice(bytes.unwrap_or_default());
    vantare_services::content_hash(&input)
}
#[cfg(any(test, feature = "bindings"))]
pub(crate) fn empty_revision() -> String {
    revision(None)
}
pub fn revision_valid(value: &str) -> bool {
    value.len() == REVISION_LENGTH
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
enum Contents {
    Prefs(bool),
    Following(Vec<String>),
    Alerts(CalendarAlerts),
}
struct Document {
    value: Value,
    bytes: Option<Vec<u8>>,
    revision: String,
    contents: Contents,
}
impl Document {
    fn parse(name: &str, bytes: Option<Vec<u8>>) -> Result<Self, HostError> {
        let value = match bytes.as_deref() {
            Some(bytes) => serde_json::from_slice(bytes).map_err(|_| HostError::Protected)?,
            None => match name {
                "calendar-prefs.json" => json!({"utc": false}),
                "calendar-following.json" => json!({"seriesIds": []}),
                "calendar-alerts.json" => serde_json::to_value(CalendarAlerts::default())
                    .map_err(|_| HostError::Rejected)?,
                _ => return Err(HostError::Rejected),
            },
        };
        if !value.is_object() {
            return Err(HostError::Protected);
        }
        let contents = match name {
            "calendar-prefs.json" => {
                let prefs: Prefs =
                    serde_json::from_value(value.clone()).map_err(|_| HostError::Protected)?;
                Contents::Prefs(prefs.utc)
            }
            "calendar-following.json" => {
                let following: Following =
                    serde_json::from_value(value.clone()).map_err(|_| HostError::Protected)?;
                if !unique(&following.series_ids, SERIES_LIMIT) {
                    return Err(HostError::Protected);
                }
                Contents::Following(following.series_ids)
            }
            "calendar-alerts.json" => {
                let alerts: CalendarAlerts =
                    serde_json::from_value(value.clone()).map_err(|_| HostError::Protected)?;
                if !alerts.valid() {
                    return Err(HostError::Protected);
                }
                Contents::Alerts(alerts)
            }
            _ => return Err(HostError::Rejected),
        };
        Ok(Self {
            revision: revision(bytes.as_deref()),
            bytes,
            value,
            contents,
        })
    }
    fn field(&self) -> Value {
        match &self.contents {
            Contents::Prefs(value) => json!(value),
            Contents::Following(ids) => json!(ids),
            Contents::Alerts(alerts) => json!(alerts.notify_week),
        }
    }
}
impl CalendarConfigView {
    fn observe(&mut self, doc: &Document) {
        match &doc.contents {
            Contents::Prefs(utc) => {
                self.utc = *utc;
                self.prefs_revision = Some(doc.revision.clone());
                self.documents.prefs = CalendarDocumentState::Ready;
            }
            Contents::Following(ids) => {
                self.following.clone_from(ids);
                self.following_revision = Some(doc.revision.clone());
                self.documents.following = CalendarDocumentState::Ready;
            }
            Contents::Alerts(alerts) => {
                self.alerts.clone_from(alerts);
                self.alerts_revision = Some(doc.revision.clone());
                self.documents.alerts = CalendarDocumentState::Ready;
            }
        }
    }
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
        let bytes = files::read_optional(&path, CONFIG_LIMIT).map_err(|error| {
            if error.kind() == files::Kind::InvalidInput {
                HostError::Protected
            } else {
                HostError::Io
            }
        })?;
        Document::parse(name, bytes)
    }
    pub fn config(&mut self) -> CalendarConfigView {
        let mut view = CalendarConfigView::default();
        for name in [
            "calendar-prefs.json",
            "calendar-following.json",
            "calendar-alerts.json",
        ] {
            match self.document(name) {
                Ok(document) => view.observe(&document),
                Err(error) => {
                    let state = if error == HostError::Protected {
                        CalendarDocumentState::Protected
                    } else {
                        CalendarDocumentState::Unavailable
                    };
                    match name {
                        "calendar-prefs.json" => view.documents.prefs = state,
                        "calendar-following.json" => view.documents.following = state,
                        _ => view.documents.alerts = state,
                    }
                }
            }
        }
        self.config_view.clone_from(&view);
        view
    }
    fn conflict(&mut self) -> HostError {
        HostError::CalendarConflict {
            current: Box::new(self.config()),
        }
    }
    fn observed_document(&mut self, name: &str, expected: &str) -> Result<Document, HostError> {
        if !revision_valid(expected) {
            return Err(HostError::Rejected);
        }
        let doc = self.document(name)?;
        if doc.revision != expected {
            return Err(self.conflict());
        }
        Ok(doc)
    }
    fn save_config(
        &mut self,
        name: &str,
        field: &str,
        value: Value,
        expected: &str,
    ) -> Result<CalendarConfigView, HostError> {
        let mut doc = self.observed_document(name, expected)?;
        if doc.field() == value {
            self.config_view.observe(&doc);
            return Ok(self.config_view.clone());
        }
        doc.value[field] = value;
        self.write_config_document(name, &doc)
    }
    fn write_config_document(
        &mut self,
        name: &str,
        doc: &Document,
    ) -> Result<CalendarConfigView, HostError> {
        let bytes = serde_json::to_vec_pretty(&doc.value).map_err(|_| HostError::Rejected)?;
        let saved = Document::parse(name, Some(bytes.clone()))?;
        let mut next = self.config_view.clone();
        next.observe(&saved);
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
        self.config_view.clone_from(&next);
        Ok(next)
    }
    pub fn utc_set(&mut self, utc: bool, expected: &str) -> Result<CalendarConfigView, HostError> {
        let result = self.save_config("calendar-prefs.json", "utc", json!(utc), expected)?;
        self.view.utc = result.utc;
        Ok(result)
    }
    pub fn notify_week_set(
        &mut self,
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
        self.follow_set_at(
            id,
            followed,
            expected,
            chrono::Utc::now().timestamp_millis(),
        )
    }
    fn follow_set_at(
        &mut self,
        id: &str,
        followed: bool,
        expected: &str,
        now: i64,
    ) -> Result<CalendarConfigView, HostError> {
        if !nonblank(id) || id.len() > TEXT_LIMIT || !text(id) {
            return Err(HostError::Rejected);
        }
        let doc = self.observed_document("calendar-following.json", expected)?;
        let Contents::Following(mut ids) = doc.contents else {
            return Err(HostError::Rejected);
        };
        if ids.iter().any(|value| value == id) == followed {
            let result =
                self.save_config("calendar-following.json", "seriesIds", json!(ids), expected)?;
            self.view.following.clone_from(&result.following);
            return Ok(result);
        }
        if followed {
            let mut active = self
                .view
                .official
                .iter()
                .chain(&self.view.fallback)
                .filter(|s| {
                    date_millis(&s.valid_from)
                        .zip(date_millis(&s.valid_until))
                        .is_some_and(|(from, until)| from <= now && now < until)
                })
                .peekable();
            if active.peek().is_none() {
                return Err(HostError::CalendarScheduleUnavailable);
            }
            if !active.any(|s| s.series.iter().any(|series| series.id == id)) {
                return Err(HostError::Rejected);
            }
            if ids.len() == SERIES_LIMIT {
                return Err(HostError::Rejected);
            }
            ids.push(id.into());
        } else {
            ids.retain(|value| value != id);
        }
        let result =
            self.save_config("calendar-following.json", "seriesIds", json!(ids), expected)?;
        self.view.following.clone_from(&result.following);
        Ok(result)
    }
}
#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;

#[path = "alerts_save.rs"]
mod alerts_save;

#[path = "alerts_input.rs"]
mod alerts_input;
pub(crate) use alerts_input::deserialize_complete_alerts;
