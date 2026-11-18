//! Local Strategy document. Projection and selection only.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io, path::PathBuf};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::files::{self, Doc, Mode, Options};
use vantare_strategy::{
    application::{repository::import_last_draft, select_event},
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
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "false"))]
    pub dirty: bool,
}

pub(crate) struct State {
    root: PathBuf,
    generation: Option<String>,
    opened: bool,
    doc: Option<Document>,
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
            status: StrategyState::Empty,
            revision: hash(b""),
        }
    }
    pub(crate) fn observe(&mut self, generation: Option<&str>, allowed: bool) {
        if !allowed || self.generation.as_deref() != generation {
            self.doc = None;
            self.opened = false;
            self.status = StrategyState::Empty;
            self.revision = hash(b"");
            self.generation = generation.map(str::to_owned);
        }
    }
    pub(crate) fn open(&mut self) -> StrategyView {
        let path = self.root.join(PRIMARY);
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => self.import(),
            _ => self.read_primary(),
        }
        self.opened = true;
        self.view()
    }
    fn import(&mut self) {
        self.doc = None;
        self.revision = hash(b"");
        self.status = StrategyState::Protected;
        match import_last_draft(&self.root) {
            Ok(None) => self.status = StrategyState::Empty,
            Ok(Some(bytes)) => {
                let Ok(doc) = Document::parse(&bytes) else {
                    return;
                };
                match files::save(
                    &self.root.join(PRIMARY),
                    &bytes,
                    Mode::Observed(None),
                    &OPTIONS,
                ) {
                    Ok(()) => {
                        self.revision = hash(&bytes);
                        self.doc = Some(doc);
                        self.status = StrategyState::ImportedLegacy;
                    }
                    Err(error) if error.kind().is_conflict() => self.read_primary(),
                    Err(_) => {}
                }
            }
            Err(_) => {}
        }
    }
    fn read_primary(&mut self) {
        let mut revision = hash(b"");
        let opened = Doc::open_or_quarantine(
            &self.root.join(PRIMARY),
            &OPTIONS,
            |bytes| {
                revision = hash(bytes);
                parse_primary(bytes).map(Some)
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
            dirty: false,
        }
    }
    pub(crate) fn select(
        &mut self,
        event_id: &str,
        strategy_id: &str,
        revision: &str,
    ) -> Result<StrategyView, HostError> {
        if !self.opened {
            return Err(HostError::Denied);
        }
        if self.status == StrategyState::Protected {
            return Err(HostError::Protected);
        }
        if !valid_id(event_id) || !valid_id(strategy_id) || !valid_revision(revision) {
            return Err(HostError::Rejected);
        }
        if revision != self.revision {
            self.read_primary();
            return Err(HostError::StrategyConflict {
                current: self.view(),
            });
        }
        let doc = self.doc.as_ref().ok_or(HostError::Rejected)?;
        let events = array(&doc.value()["events"]);
        let event = events
            .iter()
            .position(|event| event["id"] == event_id)
            .ok_or(HostError::Rejected)?;
        let variant = array(&events[event]["strategies"])
            .iter()
            .position(|variant| variant["id"] == strategy_id)
            .ok_or(HostError::Rejected)?;
        let mut next = doc.clone();
        select_event(&mut next, event, variant).map_err(|_| HostError::Rejected)?;
        match files::save(
            &self.root.join(PRIMARY),
            next.bytes(),
            Mode::Observed(Some(doc.bytes())),
            &OPTIONS,
        ) {
            Ok(()) => {
                self.revision = hash(next.bytes());
                self.status = document_state(&next);
                self.doc = Some(next);
                Ok(self.view())
            }
            Err(error) if error.kind().is_conflict() => {
                self.read_primary();
                Err(HostError::StrategyConflict {
                    current: self.view(),
                })
            }
            Err(files::Error::Busy) => Err(HostError::Busy),
            Err(_) => Err(HostError::Io),
        }
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
    value["value"]
        .as_str()
        .filter(|text| text.len() <= TEXT_LIMIT && !text.chars().any(char::is_control))
        .unwrap_or_default()
        .to_owned()
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
