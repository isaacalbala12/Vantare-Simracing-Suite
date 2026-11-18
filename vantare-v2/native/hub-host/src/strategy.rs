//! Local Strategy document and an in-memory draft.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io, path::PathBuf};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::files::{self, Doc, Mode, Options};
use vantare_strategy::{
    application::{ManualEvent, repository::import_last_draft, select_event},
    document::{Document, MAX_BYTES, SCHEMA_VERSION_V2, SCHEMA_VERSION_V2_RULES},
};

const PRIMARY: &str = "strategy-v2.json";
const OPTIONS: Options = Options {
    limit: MAX_BYTES as u64,
    backup: false,
    sibling_base: None,
};
pub const ID_LIMIT: usize = 256;
pub const TEXT_LIMIT: usize = 512;
// With maximal escaped strings this leaves over 64 KiB for the wire envelope.
const EVENT_LIMIT: usize = 32;
const VARIANT_LIMIT: usize = 16;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyState {
    Ready,
    #[default]
    Empty,
    Recovered,
    Protected,
    ImportedLegacy,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct StrategyVariant {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(deny_unknown_fields)]
pub struct StrategyEventSummary {
    pub id: String,
    pub name: String,
    pub class: String,
    pub track: String,
    pub drivers: u32,
    pub strategies: Vec<StrategyVariant>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyView {
    pub revision: String,
    pub state: StrategyState,
    pub events: Vec<StrategyEventSummary>,
    pub active_event_id: Option<String>,
    pub active_strategy_id: Option<String>,
    pub dirty: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyFields {
    pub name: String,
    pub duration_minutes: String,
    pub fuel_capacity_liters: String,
    pub pit_transit_seconds: String,
    pub track: String,
    pub class: String,
    pub variant_name: String,
    pub variant_note: String,
    pub variant_mode: String,
    pub start_at: String,
    pub team: String,
    pub driver_name: String,
    pub driver_initials: String,
}

impl StrategyFields {
    fn manual(&self) -> Result<ManualEvent, HostError> {
        if ![
            self.name.as_str(),
            self.duration_minutes.as_str(),
            self.fuel_capacity_liters.as_str(),
            self.pit_transit_seconds.as_str(),
            self.track.as_str(),
            self.class.as_str(),
            self.variant_name.as_str(),
            self.variant_note.as_str(),
            self.variant_mode.as_str(),
            self.start_at.as_str(),
            self.team.as_str(),
            self.driver_name.as_str(),
            self.driver_initials.as_str(),
        ]
        .into_iter()
        .all(valid_text)
        {
            return Err(HostError::StrategyInvalidText);
        }
        Ok(ManualEvent {
            name: self.name.clone(),
            duration_minutes: self.duration_minutes.clone(),
            fuel_capacity_liters: self.fuel_capacity_liters.clone(),
            pit_transit_seconds: self.pit_transit_seconds.clone(),
            track: self.track.clone(),
            class: self.class.clone(),
            variant_name: self.variant_name.clone(),
            variant_note: self.variant_note.clone(),
            variant_mode: self.variant_mode.clone(),
            start_at: self.start_at.clone(),
            team: self.team.clone(),
            driver_name: self.driver_name.clone(),
            driver_initials: self.driver_initials.clone(),
            ..ManualEvent::default()
        })
    }
}

pub(crate) struct State {
    root: PathBuf,
    generation: Option<String>,
    opened: bool,
    doc: Option<Document>,
    observed: Option<Vec<u8>>,
    status: StrategyState,
    revision: String,
}
impl State {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            root,
            generation: None,
            opened: false,
            doc: None,
            observed: None,
            status: StrategyState::Empty,
            revision: hash(b""),
        }
    }
    pub(crate) fn observe(&mut self, generation: Option<&str>, allowed: bool) {
        if !allowed || self.generation.as_deref() != generation {
            self.doc = None;
            self.observed = None;
            self.opened = false;
            self.status = StrategyState::Empty;
            self.revision = hash(b"");
            self.generation = generation.map(str::to_owned);
        }
    }
    pub(crate) fn open(&mut self) -> Result<StrategyView, HostError> {
        let path = self.root.join(PRIMARY);
        self.require_clean()?;
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                let mut current = Self::new(self.root.clone());
                current.import()?;
                current.opened = true;
                current.generation.clone_from(&self.generation);
                *self = current;
            }
            _ => {
                self.opened = true;
                self.read_primary()?;
            }
        }
        Ok(self.view())
    }
    fn import(&mut self) -> Result<(), HostError> {
        let Some(bytes) =
            import_last_draft(&self.root).map_err(|_| HostError::StrategyImportFailed)?
        else {
            return Ok(());
        };
        let doc = Document::parse(&bytes).map_err(|_| HostError::StrategyImportFailed)?;
        validate_projection(&doc, HostError::StrategyInvalidText)?;
        match files::save(
            &self.root.join(PRIMARY),
            &bytes,
            Mode::Observed(None),
            &OPTIONS,
        ) {
            Ok(()) => {
                self.revision = hash(&bytes);
                self.doc = Some(doc);
                self.observed = Some(bytes);
                self.status = StrategyState::ImportedLegacy;
                Ok(())
            }
            Err(error) if error.kind().is_conflict() => self.read_primary(),
            Err(files::Error::Busy) => Err(HostError::Busy),
            Err(_) => Err(HostError::Io),
        }
    }
    fn read_primary(&mut self) -> Result<(), HostError> {
        let mut revision = hash(b"");
        let mut rejected = None;
        let opened = Doc::open_or_quarantine(
            &self.root.join(PRIMARY),
            &OPTIONS,
            |bytes| {
                revision = hash(bytes);
                let doc = parse_primary(bytes)?;
                if let Err(error) = validate_projection(&doc, HostError::Protected) {
                    rejected = Some(error);
                    return Err(files::Error::Unsupported(
                        "strategy projection limits".into(),
                    ));
                }
                Ok(Some(doc))
            },
            || None,
        );
        self.revision = revision;
        self.status = match (
            &opened.value,
            opened.warning.is_some(),
            opened.observed.is_some(),
        ) {
            (Some(doc), _, _) => document_state(doc),
            (None, true, true) => StrategyState::Recovered,
            (None, true, false) => StrategyState::Protected,
            (None, false, _) => StrategyState::Empty,
        };
        self.doc = opened.value;
        self.observed = opened.observed;
        rejected.map_or(Ok(()), Err)
    }
    pub(crate) fn view_opened(&self) -> Result<StrategyView, HostError> {
        self.require_open()?;
        Ok(self.view())
    }
    pub(crate) fn view(&self) -> StrategyView {
        let value = self.doc.as_ref().map_or(&Value::Null, Document::value);
        let events: Vec<_> = array(&value["events"])
            .iter()
            .filter_map(project_event)
            .collect();
        let active = value["activeEventId"]
            .as_str()
            .and_then(|id| events.iter().find(|event| event.id == id));
        let active_event_id = active.map(|event| event.id.clone());
        let active_strategy_id = active.and_then(|event| {
            let source = array(&value["events"])
                .iter()
                .find(|row| row["id"] == event.id)?;
            let id = source["activeStrategyId"].as_str()?;
            event
                .strategies
                .iter()
                .find(|variant| variant.id == id)
                .map(|variant| variant.id.clone())
        });
        StrategyView {
            revision: self.revision.clone(),
            state: self.status,
            events,
            active_event_id,
            active_strategy_id,
            dirty: self.dirty(),
        }
    }
    pub(crate) fn select(
        &mut self,
        event_id: &str,
        strategy_id: &str,
        revision: &str,
    ) -> Result<StrategyView, HostError> {
        self.require_clean()?;
        self.require_edit(revision)?;
        let doc = self.doc.as_ref().ok_or(HostError::Rejected)?;
        let (event, variant) = indices(doc, event_id, strategy_id)?;
        let mut next = doc.clone();
        select_event(&mut next, event, variant).map_err(|_| HostError::Rejected)?;
        if let Err(error) = self.write(&next) {
            if error.kind().is_conflict() {
                self.read_primary()?;
                return Err(self.conflict());
            }
            return Err(write_error(&error));
        }
        self.commit(next);
        Ok(self.view())
    }

    pub(crate) fn create(
        &mut self,
        revision: &str,
        fields: &StrategyFields,
        pace: Option<&str>,
        consumption: Option<&str>,
        now: &str,
    ) -> Result<StrategyView, HostError> {
        self.require_clean()?;
        self.require_edit(revision)?;
        let mut manual = fields.manual()?;
        let pace = pace.unwrap_or_default();
        let consumption = consumption.unwrap_or_default();
        if !valid_text(pace) || !valid_text(consumption) {
            return Err(HostError::StrategyInvalidText);
        }
        manual.base_pace_seconds = pace.into();
        manual.fuel_per_lap_liters = consumption.into();
        let mut next = self
            .doc
            .clone()
            .map_or_else(|| Document::empty(now).map_err(|_| HostError::Io), Ok)?;
        manual.append(&mut next).map_err(|_| HostError::Rejected)?;
        self.set_draft(next)
    }

    pub(crate) fn confirm(
        &mut self,
        event_id: &str,
        strategy_id: &str,
        revision: &str,
        fields: &StrategyFields,
    ) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        let doc = self.doc.as_ref().ok_or(HostError::Rejected)?;
        let (event, variant) = indices(doc, event_id, strategy_id)?;
        if self.dirty()
            && (doc.value()["activeEventId"] != event_id
                || doc.value()["events"][event]["activeStrategyId"] != strategy_id)
        {
            return Err(HostError::StrategyDirty);
        }
        let mut next = doc.clone();
        fields
            .manual()?
            .confirm(&mut next, event, variant)
            .map_err(|_| HostError::Rejected)?;
        self.set_draft(next)
    }

    pub(crate) fn save(&mut self, revision: &str) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        if self.dirty() {
            let draft = self.doc.as_ref().ok_or(HostError::Rejected)?;
            if let Err(error) = self.write(draft) {
                if error.kind().is_conflict() {
                    let mut current = Self::new(self.root.clone());
                    current.read_primary()?;
                    return Err(current.conflict());
                }
                return Err(write_error(&error));
            }
            self.observed = Some(draft.bytes().to_vec());
        }
        Ok(self.view())
    }

    pub(crate) fn discard(&mut self, revision: &str) -> Result<StrategyView, HostError> {
        self.require_revision(revision)?;
        let mut current = Self::new(self.root.clone());
        current.read_primary()?;
        current.opened = true;
        current.generation.clone_from(&self.generation);
        *self = current;
        Ok(self.view())
    }

    fn dirty(&self) -> bool {
        self.doc
            .as_ref()
            .is_some_and(|doc| self.observed.as_deref() != Some(doc.bytes()))
    }

    fn require_open(&self) -> Result<(), HostError> {
        if self.opened {
            Ok(())
        } else {
            Err(HostError::Denied)
        }
    }

    fn require_clean(&self) -> Result<(), HostError> {
        if self.dirty() {
            Err(HostError::StrategyDirty)
        } else {
            Ok(())
        }
    }

    fn require_revision(&self, revision: &str) -> Result<(), HostError> {
        self.require_open()?;
        if !valid_revision(revision) {
            return Err(HostError::Rejected);
        }
        if revision != self.revision {
            return Err(self.conflict());
        }
        Ok(())
    }

    fn require_edit(&self, revision: &str) -> Result<(), HostError> {
        if self.opened && self.status == StrategyState::Protected {
            return Err(HostError::Protected);
        }
        self.require_revision(revision)
    }

    fn conflict(&self) -> HostError {
        HostError::StrategyConflict {
            current: self.view(),
        }
    }

    fn write(&self, doc: &Document) -> Result<(), files::Error> {
        files::save(
            &self.root.join(PRIMARY),
            doc.bytes(),
            Mode::Observed(self.observed.as_deref()),
            &OPTIONS,
        )
    }

    fn commit(&mut self, doc: Document) {
        self.observed = Some(doc.bytes().to_vec());
        self.revision = hash(doc.bytes());
        self.status = document_state(&doc);
        self.doc = Some(doc);
    }

    fn set_draft(&mut self, doc: Document) -> Result<StrategyView, HostError> {
        validate_projection(&doc, HostError::StrategyInvalidText)?;
        self.revision = hash(doc.bytes());
        self.status = document_state(&doc);
        self.doc = Some(doc);
        Ok(self.view())
    }
}
fn indices(doc: &Document, event_id: &str, strategy_id: &str) -> Result<(usize, usize), HostError> {
    if !valid_id(event_id) || !valid_id(strategy_id) {
        return Err(HostError::Rejected);
    }
    let events = array(&doc.value()["events"]);
    let event = events
        .iter()
        .position(|event| event["id"] == event_id)
        .ok_or(HostError::Rejected)?;
    let variant = array(&events[event]["strategies"])
        .iter()
        .position(|variant| variant["id"] == strategy_id)
        .ok_or(HostError::Rejected)?;
    Ok((event, variant))
}
fn write_error(error: &files::Error) -> HostError {
    match error {
        files::Error::Busy => HostError::Busy,
        _ => HostError::Io,
    }
}
fn hash(bytes: &[u8]) -> String {
    vantare_services::content_hash(bytes)
}
fn parse_primary(bytes: &[u8]) -> Result<Document, files::Error> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|_| files::Error::InvalidInput("strategy document".into()))?;
    for (key, supported) in [
        ("contractVersion", &["strategy.v2"][..]),
        (
            "schemaVersion",
            &[SCHEMA_VERSION_V2, SCHEMA_VERSION_V2_RULES][..],
        ),
    ] {
        if value[key]
            .as_str()
            .is_some_and(|version| !supported.contains(&version))
        {
            return Err(files::Error::Unsupported("strategy version".into()));
        }
    }
    Document::parse(bytes).map_err(files::Error::InvalidInput)
}
fn validate_projection(doc: &Document, collection_error: HostError) -> Result<(), HostError> {
    let events = array(&doc.value()["events"]);
    if events.len() > EVENT_LIMIT
        || events
            .iter()
            .any(|event| array(&event["strategies"]).len() > VARIANT_LIMIT)
    {
        return Err(collection_error);
    }
    for event in events {
        let event_ok = event["id"].as_str().is_some_and(valid_id)
            && ["name", "cls", "track"]
                .iter()
                .all(|key| projectable_text(&event[*key]));
        let variants_ok = array(&event["strategies"]).iter().all(|variant| {
            variant["id"].as_str().is_some_and(valid_id) && projectable_text(&variant["name"])
        });
        if !event_ok || !variants_ok {
            return Err(HostError::StrategyInvalidText);
        }
    }
    Ok(())
}
fn valid_text(value: &str) -> bool {
    value.len() <= TEXT_LIMIT && !value.chars().any(char::is_control)
}
fn projectable_text(value: &Value) -> bool {
    value["value"].as_str().is_none_or(valid_text)
}
fn document_state(doc: &Document) -> StrategyState {
    if array(&doc.value()["events"]).is_empty() {
        StrategyState::Empty
    } else {
        StrategyState::Ready
    }
}
fn array(value: &Value) -> &[Value] {
    value.as_array().map_or(&[], Vec::as_slice)
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= ID_LIMIT
        && !id.contains(['/', '\\', ':'])
        && !id.chars().any(char::is_control)
}
fn valid_revision(revision: &str) -> bool {
    revision.len() == 64
        && revision
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn id(value: &Value) -> Option<String> {
    value.as_str().filter(|id| valid_id(id)).map(str::to_owned)
}
fn text(value: &Value) -> String {
    value["value"].as_str().unwrap_or_default().to_owned()
}
fn project_event(value: &Value) -> Option<StrategyEventSummary> {
    Some(StrategyEventSummary {
        id: id(&value["id"])?,
        name: text(&value["name"]),
        class: text(&value["cls"]),
        track: text(&value["track"]),
        drivers: u32::try_from(array(&value["drivers"]).len()).ok()?,
        strategies: array(&value["strategies"])
            .iter()
            .filter_map(|variant| {
                Some(StrategyVariant {
                    id: id(&variant["id"])?,
                    name: text(&variant["name"]),
                })
            })
            .collect(),
    })
}
#[cfg(test)]
#[path = "strategy_tests.rs"]
mod tests;
