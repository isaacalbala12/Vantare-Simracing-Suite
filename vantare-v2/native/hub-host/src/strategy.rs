//! Local Strategy document and an in-memory draft.
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{io, path::PathBuf};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::files::{self, Doc, Mode, Options};
use vantare_strategy::{
    application::{self, ManualEvent, repository::import_last_draft, select_event},
    document::{
        Document, MAX_BYTES, SCHEMA_VERSION_V2, SCHEMA_VERSION_V2_PLAN, SCHEMA_VERSION_V2_RULES,
    },
    solver::Input,
};

#[path = "strategy_accepted.rs"]
mod accepted;
pub use accepted::{
    STRATEGY_CHANGE_TEXT_LIMIT, StrategyAcceptedMark, StrategyAcceptedState,
    StrategyAcceptedView, StrategyChange, StrategyCompare, StrategyUnreachable,
    StrategyUnreachableCause,
};
#[path = "strategy_calculation.rs"]
mod calculation;
use calculation::Calculation;
#[path = "strategy_editing.rs"]
mod editing;
pub use editing::{StrategyEditError, StrategyEditStop, StrategyEditView};
pub use calculation::{
    STRATEGY_PIT_LIMIT, StrategyCalculationView, StrategyCertificate, StrategyComputeForm,
    StrategyField, StrategyMetrics, StrategyPit, StrategyPitService, StrategyPlanError,
    StrategyPitPinned, StrategyPlanState, StrategyPlanView, StrategyReason, StrategyServiceSteps,
    StrategySolverFields, StrategyStint, StrategyTimeline,
};
#[path = "strategy_file.rs"]
mod file;
#[cfg(test)]
use file::valid_file_name;
use file::Ticket;
pub use file::{
    STRATEGY_FILE_NAME_MAX, STRATEGY_PICK_COOLDOWN_MS, STRATEGY_PICK_LIFETIME_SECONDS,
    STRATEGY_PICK_PATH_MAX, StrategyFile, StrategyFileMode, StrategyFileSelection,
};

const PRIMARY: &str = "strategy-v2.json";
const OPTIONS: Options = Options {
    limit: MAX_BYTES as u64,
    backup: false,
    sibling_base: None,
};
pub const ID_LIMIT: usize = 256;
pub const TEXT_LIMIT: usize = 512;
// With maximal escaped strings the events leave over 64 KiB of the frame for the
// rest of the view; the form (28 texts of 512 escaped quotes) and a full plan
// still leave 24 KiB (a test fixes it).
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyEventSummary {
    pub id: String,
    pub name: String,
    pub class: String,
    pub track: String,
    pub drivers: u32,
    pub strategies: Vec<StrategyVariant>,
    /// `true` when some variant of the event keeps plain (scalar) calculation
    /// inputs in the document, the draft included, that are valid for the solver.
    /// It does NOT say that a plan exists (the document keeps none, only the
    /// inputs; a saved plan is a later contract) nor that `strategy.compute` will
    /// take them as they are: it refuses, for example, an event of another source
    /// or one with rules. Inputs with extended dimensions do not count.
    pub has_inputs: bool,
    /// The accepted plans of the event's variants: `stale` when any of them was
    /// calculated from entries that changed, `accepted` when some variant has one
    /// and none is stale, `none` otherwise.
    pub accepted_plan: StrategyAcceptedMark,
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
    pub plan: StrategyPlanView,
    /// The file the document lives in: its name, never its path. `null` before
    /// the session opens.
    pub file: Option<StrategyFile>,
    /// The entries of the active variant as the document (or its draft) holds
    /// them: the 13 `fields` and the 15 `inputs`, the same strings
    /// `strategy.compute` takes. `null` without an active event and variant, or
    /// when a stored text is over the text limit or has a control character (it is
    /// never cut or emptied). The `inputs` are those stored for this variant, even
    /// when they do not validate; when it stores none they are empty strings, apart
    /// from the pace and consumption the event may hold. Each number is spelled by
    /// its source: the stored inputs as plain numbers (`82`, `0.5`), the entries
    /// the event keeps (tank, pit loss, reserve laps, and the pace and consumption
    /// without stored inputs) as the document writes a number (`82.0`).
    pub form: Option<Box<StrategyComputeForm>>,
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
    /// The file the document lives in: the primary file until the user opens or
    /// saves another one.
    path: PathBuf,
    ticket: Option<Ticket>,
    generation: Option<String>,
    opened: bool,
    doc: Option<Document>,
    /// For each event of `doc`, whether it has plain stored inputs (see `valid_inputs`),
    /// worked out once when the document is set, not on every view.
    has_inputs: Vec<bool>,
    /// What the entries now say about the accepted plans of `doc`, worked out
    /// with `has_inputs` when the document is set.
    accepted: accepted::Inspection,
    observed: Option<Vec<u8>>,
    status: StrategyState,
    revision: String,
    calculation: Calculation,
}
impl State {
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            path: root.join(PRIMARY),
            root,
            ticket: None,
            generation: None,
            opened: false,
            doc: None,
            has_inputs: Vec::new(),
            accepted: accepted::Inspection::default(),
            observed: None,
            status: StrategyState::Empty,
            revision: hash(b""),
            calculation: Calculation::default(),
        }
    }
    /// Follows the account and access of the session; returns whether requests may
    /// be served. Losing access, or the observation of a known account, only
    /// suspends: a refresh that settles on the same account and access finds the
    /// dirty draft and the running calculation intact. Only a different account
    /// discards them.
    pub(crate) fn observe(&mut self, generation: Option<&str>, allowed: bool) -> bool {
        if !allowed || (generation.is_none() && self.generation.is_some()) {
            // Whoever cannot be served cannot hold a dialog ticket either.
            self.ticket = None;
            return false;
        }
        if self.generation.as_deref() != generation {
            self.retire();
            self.generation = generation.map(str::to_owned);
        }
        true
    }
    /// Drops the draft and cancels the calculation: the session is closing or the
    /// account really changed.
    pub(crate) fn retire(&mut self) {
        self.calculation.invalidate(false);
        self.ticket = None;
        self.path = self.root.join(PRIMARY);
        self.set_doc(None);
        self.observed = None;
        self.opened = false;
        self.status = StrategyState::Empty;
        self.revision = hash(b"");
    }
    pub(crate) fn open(&mut self) -> Result<StrategyView, HostError> {
        let path = self.path.clone();
        self.require_clean()?;
        match std::fs::symlink_metadata(&path) {
            Err(error)
                if error.kind() == io::ErrorKind::NotFound
                    && file::same_file(&path, &self.root.join(PRIMARY)) =>
            {
                let mut current = Self::new(self.root.clone());
                current.import()?;
                self.replace_document(current);
            }
            _ => {
                self.calculation.invalidate(false);
                self.opened = true;
                self.read_current()?;
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
                self.set_doc(Some(doc));
                self.observed = Some(bytes);
                self.status = StrategyState::ImportedLegacy;
                Ok(())
            }
            Err(error) if error.kind().is_conflict() => self.read_current(),
            Err(files::Error::Busy) => Err(HostError::Busy),
            Err(_) => Err(HostError::Io),
        }
    }
    fn is_primary(&self) -> bool {
        file::same_file(&self.path, &self.root.join(PRIMARY))
    }
    fn read_current(&mut self) -> Result<(), HostError> {
        if !self.is_primary() {
            return self.read_custom();
        }
        let mut revision = hash(b"");
        let mut rejected = None;
        let opened = Doc::open_or_quarantine(
            &self.path,
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
        self.set_doc(opened.value);
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
            .enumerate()
            .filter_map(|(index, event)| {
                project_event(
                    event,
                    self.has_inputs.get(index).copied().unwrap_or(false),
                    self.accepted.marks.get(index).copied().unwrap_or_default(),
                )
            })
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
        let form = self.form(active_event_id.as_deref(), active_strategy_id.as_deref());
        StrategyView {
            revision: self.revision.clone(),
            state: self.status,
            events,
            active_event_id,
            active_strategy_id,
            dirty: self.dirty(),
            plan: self.plan_view(),
            file: self.file(),
            form,
        }
    }

    /// The plan of the calculation (the proposal) with the plan accepted for the
    /// active variant next to it, never mixed.
    fn plan_view(&self) -> StrategyPlanView {
        let mut plan = self.calculation.view().clone();
        if let (Some(doc), Some(active)) = (&self.doc, &self.accepted.active) {
            let saved = accepted::is_saved(doc, self.observed.as_deref(), active);
            let proposal = match plan.state {
                StrategyPlanState::Calculated
                | StrategyPlanState::Partial
                | StrategyPlanState::Edited => plan.result.as_deref(),
                _ => None,
            };
            plan.accepted = Some(Box::new(accepted::view(active, saved, proposal)));
        }
        plan
    }

    /// The entries of the active variant, read from the document or its draft.
    fn form(
        &self,
        event_id: Option<&str>,
        strategy_id: Option<&str>,
    ) -> Option<Box<StrategyComputeForm>> {
        let doc = self.doc.as_ref()?;
        let (event, variant) = indices(doc, event_id?, strategy_id?).ok()?;
        StrategyComputeForm::read(&ManualEvent::read(doc, event, variant)).map(Box::new)
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
                self.calculation.invalidate(false);
                self.read_current()?;
                return Err(self.conflict());
            }
            return Err(write_error(&error));
        }
        if self
            .doc
            .as_ref()
            .is_some_and(|doc| doc.bytes() != next.bytes())
        {
            self.calculation.invalidate(false);
        }
        self.commit(next);
        Ok(self.view())
    }

    /// Creates an event with its first variant and driver in the draft.
    ///
    /// The checks run in this order, and the first to fail answers: unsaved changes
    /// (`strategyDirty`), a protected document (`protected`), a document not open
    /// (`denied`), a malformed revision (`rejected`), an outdated one
    /// (`strategyConflict`), `inputs` with the loose pace or consumption (`rejected`),
    /// a text out of range (`strategyInvalidText`), the checks of the crate on the
    /// entries (`rejected`) and last the limit of events (`strategyInvalidText`).
    pub(crate) fn create(
        &mut self,
        revision: &str,
        fields: &StrategyFields,
        pace: Option<&str>,
        consumption: Option<&str>,
        inputs: Option<&StrategySolverFields>,
        now: &str,
    ) -> Result<StrategyView, HostError> {
        self.require_clean()?;
        self.require_edit(revision)?;
        let manual = match inputs {
            // the inputs replace the loose pair; sending both is ambiguous
            Some(_) if pace.is_some() || consumption.is_some() => {
                return Err(HostError::Rejected);
            }
            Some(inputs) => calculation::manual_with(fields, inputs)?,
            None => {
                let mut manual = fields.manual()?;
                let pace = pace.unwrap_or_default();
                let consumption = consumption.unwrap_or_default();
                if !valid_text(pace) || !valid_text(consumption) {
                    return Err(HostError::StrategyInvalidText);
                }
                manual.base_pace_seconds = pace.into();
                manual.fuel_per_lap_liters = consumption.into();
                manual
            }
        };
        let mut next = self
            .doc
            .clone()
            .map_or_else(|| Document::empty(now).map_err(|_| HostError::Io), Ok)?;
        let event = manual.append(&mut next).map_err(|_| HostError::Rejected)?;
        if inputs.is_some() {
            // `create` names no field: it has no plan of the selection to put it in
            confirm_inputs(&manual, &mut next, event, 0).map_err(|_| HostError::Rejected)?;
        }
        self.set_draft(next)
    }

    /// Confirms the fields of a variant and, with `inputs`, its 15 calculation
    /// inputs, without calculating (`strategy.compute` without the solver).
    ///
    /// The checks run in this order, and the first to fail answers: a protected
    /// document (`protected`), a document not open (`denied`), a malformed
    /// revision (`rejected`), an outdated one (`strategyConflict`), no document,
    /// event or variant (`rejected`), changes pending in another event
    /// (`strategyDirty`), a text out of range in the 13 fields or the 15 inputs
    /// (`strategyInvalidText`) and the checks of the crate (`strategyInvalidInput`
    /// with the field `compute` names for the same form, or none: a zero pace,
    /// laps, steps, service mode, a variant that is not `dry`...).
    ///
    /// `inputs: None` confirms the fields only and keeps the stored inputs. With
    /// `inputs` they replace the stored ones as a whole (they are not merged), in a
    /// draft cloned first: a failure leaves neither the fields nor the inputs
    /// changed. The same data again leaves the document, and so the revision, as it
    /// was.
    pub(crate) fn confirm(
        &mut self,
        event_id: &str,
        strategy_id: &str,
        revision: &str,
        fields: &StrategyFields,
        inputs: Option<&StrategySolverFields>,
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
        if let Some(inputs) = inputs {
            let manual = calculation::manual_with(fields, inputs)?;
            confirm_inputs(&manual, &mut next, event, variant)?;
        } else {
            let manual = fields.manual()?;
            manual.confirm(&mut next, event, variant).map_err(|_| {
                HostError::StrategyInvalidInput {
                    field: calculation::invalid_field(&manual, false),
                }
            })?;
        }
        self.set_draft(next)
    }

    pub(crate) fn save(&mut self, revision: &str) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        if self.dirty() {
            let draft = self.doc.as_ref().ok_or(HostError::Rejected)?;
            if let Err(error) = self.write(draft) {
                if error.kind().is_conflict() {
                    let mut current = self.fresh();
                    current.read_current()?;
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
        let mut current = self.fresh();
        current.read_current()?;
        self.replace_document(current);
        Ok(self.view())
    }

    fn replace_document(&mut self, mut current: Self) {
        self.calculation.invalidate(false);
        current.calculation = std::mem::take(&mut self.calculation);
        current.ticket = self.ticket.take();
        current.opened = true;
        current.generation.clone_from(&self.generation);
        *self = current;
    }

    pub(crate) fn compute(
        &mut self,
        event_id: &str,
        strategy_id: &str,
        revision: &str,
        form: &StrategyComputeForm,
    ) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        if self.calculation.running() {
            return Err(HostError::Busy);
        }
        if self.calculation.edit_pending() {
            return Err(HostError::StrategyEditPending);
        }
        let doc = self.doc.as_ref().ok_or(HostError::Rejected)?;
        let (event, variant) = indices(doc, event_id, strategy_id)?;
        if doc.value()["activeEventId"] != event_id
            || doc.value()["events"][event]["activeStrategyId"] != strategy_id
        {
            return Err(HostError::Rejected);
        }
        let manual = form.manual()?;
        let document = doc.clone();
        self.calculation
            .start(move |cancel| calculation::run(document, event, variant, &manual, cancel))?;
        Ok(self.view())
    }

    /// Cancels the calculation `compute_id` names. A stale id (the calculation
    /// already ended or a newer one runs) changes nothing and answers with the
    /// current view, so a late cancel can never stop a newer calculation.
    pub(crate) fn cancel_calculation(
        &mut self,
        compute_id: u32,
    ) -> Result<StrategyView, HostError> {
        self.require_open()?;
        if compute_id == 0 {
            return Err(HostError::Rejected);
        }
        self.calculation.cancel(compute_id);
        Ok(self.view())
    }

    /// Moves the boundary after stint `index` to `lap` (see `Editing::move_boundary`).
    pub(crate) fn move_boundary(
        &mut self,
        revision: &str,
        compute_id: u32,
        index: u32,
        lap: u32,
    ) -> Result<StrategyView, HostError> {
        self.edit(revision, compute_id, |editing| {
            editing.move_boundary(index, lap)
        })
    }

    /// Moves stop `index` by one lap (`delta` is -1 or 1).
    pub(crate) fn move_stop(
        &mut self,
        revision: &str,
        compute_id: u32,
        index: u32,
        delta: i8,
    ) -> Result<StrategyView, HostError> {
        self.edit(revision, compute_id, |editing| {
            editing.move_stop(index, delta)
        })
    }

    /// Edits only the plan `compute_id` names, and only in memory: the document,
    /// its revision and `dirty` do not change.
    fn edit(
        &mut self,
        revision: &str,
        compute_id: u32,
        edit: impl FnOnce(&mut editing::Editing) -> Result<(), HostError>,
    ) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        match self.calculation.edit(compute_id, edit)? {
            Some(()) => Ok(self.view()),
            None => Err(self.conflict()),
        }
    }

    /// Recalculates the edited schedule as a constraint, in the calculation worker.
    pub(crate) fn recalculate(
        &mut self,
        revision: &str,
        compute_id: u32,
    ) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        if self.calculation.view().compute_id != Some(compute_id) {
            return Err(self.conflict());
        }
        self.calculation.recalculate()?;
        Ok(self.view())
    }

    /// Discards the edit and returns to the last feasible plan.
    pub(crate) fn reset_edit(
        &mut self,
        revision: &str,
        compute_id: u32,
    ) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        match self.calculation.reset(compute_id) {
            Some(()) => Ok(self.view()),
            None => Err(self.conflict()),
        }
    }

    /// Accepts the plan `compute_id` names for the active variant: its metrics,
    /// calendar and certificate are copied into the document together with the
    /// entries it was calculated from, in memory (the document is «Sin guardar»
    /// until it is saved). The plan on screen stays as it is. An accepted plan of
    /// the variant is replaced; `strategy.discard` brings it back from the file.
    ///
    /// The checks run in this order, and the first to fail answers: a protected
    /// document (`protected`), a document not open (`denied`), a malformed revision
    /// (`rejected`), an outdated one or another `compute_id` (`strategyConflict`),
    /// a calculation running (`busy`), an edited schedule not recalculated
    /// (`strategyEditPending`) and a plan that cannot be accepted: no plan, no
    /// timeline, no active variant or an entry the document cannot copy
    /// (`strategyNotAcceptable`).
    pub(crate) fn accept(
        &mut self,
        revision: &str,
        compute_id: u32,
        now: &str,
    ) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        let view = self.calculation.view();
        if view.compute_id != Some(compute_id) {
            return Err(self.conflict());
        }
        match view.state {
            StrategyPlanState::Calculating => return Err(HostError::Busy),
            StrategyPlanState::Edited => return Err(HostError::StrategyEditPending),
            StrategyPlanState::Calculated | StrategyPlanState::Partial => {}
            _ => return Err(HostError::StrategyNotAcceptable),
        }
        let result = view
            .result
            .as_deref()
            .ok_or(HostError::StrategyNotAcceptable)?
            .clone();
        let doc = self.doc.as_ref().ok_or(HostError::Rejected)?;
        let (event, variant) = active_indices(doc).ok_or(HostError::StrategyNotAcceptable)?;
        let entries = StrategyComputeForm::read(&ManualEvent::read(doc, event, variant))
            .ok_or(HostError::StrategyNotAcceptable)?;
        let plan = accepted::StrategyAcceptedPlan {
            accepted_at: now.to_owned(),
            entries,
            result,
        };
        if !accepted::plan_is_valid(&plan) {
            return Err(HostError::StrategyNotAcceptable);
        }
        let mut next = doc.clone();
        if next.schema_version() != SCHEMA_VERSION_V2_PLAN {
            next.set("/schemaVersion", &Value::from(SCHEMA_VERSION_V2_PLAN))
                .map_err(|_| HostError::Rejected)?;
        }
        let stored = serde_json::to_value(&plan).map_err(|_| HostError::Io)?;
        next.put(&format!("/events/{event}/strategies/{variant}/acceptedPlan"), &stored)
            .map_err(|_| HostError::Rejected)?;
        validate_projection(&next, HostError::StrategyInvalidText)?;
        // The calculation on screen is still the one the plan came from.
        self.apply_draft(next);
        Ok(self.view())
    }

    /// Removes the accepted plan of the active variant (it is «Sin guardar» until
    /// saved). The proposal on screen stays.
    ///
    /// A calculation holds a copy of the document with the plan in it and would put
    /// it back when it ends, so while one runs the answer is `busy`, as for `accept`.
    pub(crate) fn unaccept(&mut self, revision: &str) -> Result<StrategyView, HostError> {
        self.require_edit(revision)?;
        if self.calculation.running() {
            return Err(HostError::Busy);
        }
        let doc = self.doc.as_ref().ok_or(HostError::Rejected)?;
        let (event, variant) = active_indices(doc).ok_or(HostError::StrategyNoAcceptedPlan)?;
        if accepted::plan_of(doc, event, variant).is_none() {
            return Err(HostError::StrategyNoAcceptedPlan);
        }
        let mut next = doc.clone();
        next.remove(&format!("/events/{event}/strategies/{variant}/acceptedPlan"))
            .map_err(|_| HostError::Rejected)?;
        self.apply_draft(next);
        Ok(self.view())
    }

    /// Drops the proposal on screen so that the accepted plan is what is shown.
    /// The document does not change.
    pub(crate) fn show_accepted(&mut self, revision: &str) -> Result<StrategyView, HostError> {
        self.require_revision(revision)?;
        if self.accepted.active.is_none() {
            return Err(HostError::StrategyNoAcceptedPlan);
        }
        self.calculation.invalidate(false);
        Ok(self.view())
    }

    pub(crate) fn poll_calculation(&mut self) {
        if let Some(doc) = self.calculation.poll() {
            self.apply_draft(doc);
        }
    }

    #[cfg(test)]
    pub(crate) fn test_start_calculation(
        &mut self,
        run: impl FnOnce(&std::sync::atomic::AtomicBool) -> Document + Send + 'static,
    ) {
        self.calculation
            .start(move |cancel| Ok((run(cancel), StrategyPlanView::default(), None)))
            .expect("start controlled calculation");
    }

    #[cfg(test)]
    pub(crate) fn test_start_recalculation(
        &mut self,
        run: impl FnOnce(&std::sync::atomic::AtomicBool) -> editing::Recalculation + Send + 'static,
    ) {
        self.calculation
            .test_recalculate_with(run)
            .expect("start controlled recalculation");
    }

    #[cfg(test)]
    pub(crate) fn test_join_calculation(&mut self) {
        if let Some(doc) = self.calculation.finish() {
            self.apply_draft(doc);
        }
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
            current: Box::new(self.view()),
        }
    }

    fn write(&self, doc: &Document) -> Result<(), files::Error> {
        files::save(
            &self.path,
            doc.bytes(),
            Mode::Observed(self.observed.as_deref()),
            &OPTIONS,
        )
    }

    fn commit(&mut self, doc: Document) {
        self.observed = Some(doc.bytes().to_vec());
        self.revision = hash(doc.bytes());
        self.status = document_state(&doc);
        self.set_doc(Some(doc));
    }

    fn set_draft(&mut self, doc: Document) -> Result<StrategyView, HostError> {
        validate_projection(&doc, HostError::StrategyInvalidText)?;
        if self
            .doc
            .as_ref()
            .is_none_or(|current| current.bytes() != doc.bytes())
        {
            self.calculation.invalidate(true);
        }
        self.apply_draft(doc);
        Ok(self.view())
    }

    fn apply_draft(&mut self, doc: Document) {
        self.revision = hash(doc.bytes());
        self.status = document_state(&doc);
        self.set_doc(Some(doc));
    }

    /// The only place the document is replaced: the flags of its events follow it.
    fn set_doc(&mut self, doc: Option<Document>) {
        self.has_inputs = doc.as_ref().map_or_else(Vec::new, |doc| {
            array(&doc.value()["events"])
                .iter()
                .map(|event| {
                    array(&event["strategies"])
                        .iter()
                        .any(|variant| valid_inputs(&variant["overrides"]["nativeScalarInput"]))
                })
                .collect()
        });
        self.accepted = doc.as_ref().map_or_else(accepted::Inspection::default, accepted::inspect);
        self.doc = doc;
    }
}
/// The confirmation `compute` makes, without the calculation: the fields and the
/// inputs of the variant, with the checks of the crate. Written to `next`, which
/// the caller keeps as a draft of its own so a failure changes nothing. A refusal
/// of the crate is `strategyInvalidInput` with the field `compute` would name.
fn confirm_inputs(
    manual: &ManualEvent,
    next: &mut Document,
    event: usize,
    variant: usize,
) -> Result<(), HostError> {
    let refused = |_| HostError::StrategyInvalidInput {
        field: calculation::invalid_field(manual, true),
    };
    let input = manual.prepare(next, event, variant).map_err(refused)?;
    application::prepare_manual(input).map_err(refused)?;
    Ok(())
}
/// The indices of the active event and variant of the document.
fn active_indices(doc: &Document) -> Option<(usize, usize)> {
    let value = doc.value();
    let event = array(&value["events"])
        .iter()
        .position(|event| event["id"] == value["activeEventId"])?;
    let variant = array(&value["events"][event]["strategies"])
        .iter()
        .position(|variant| variant["id"] == value["events"][event]["activeStrategyId"])?;
    Some((event, variant))
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
            &[SCHEMA_VERSION_V2, SCHEMA_VERSION_V2_RULES, SCHEMA_VERSION_V2_PLAN][..],
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
        // A stored plan that is not valid (or of an older schema) is not ours to read.
        let schema_allows = doc.schema_version() == SCHEMA_VERSION_V2_PLAN;
        if array(&event["strategies"])
            .iter()
            .any(|variant| accepted::read(variant, schema_allows).is_err())
        {
            return Err(collection_error);
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
/// The stored calculation inputs of a variant: plain (scalar) ones that read as the
/// solver input and pass its checks. Inputs with extended dimensions are left out on
/// purpose: validating them builds the extended model, whose cost depends on what
/// the file holds, and `strategy.compute` does not take them either.
fn valid_inputs(value: &Value) -> bool {
    value.is_object()
        && Input::deserialize(value).is_ok_and(|input| {
            input.extra.is_empty()
                && input.event_rules.extra.is_empty()
                && input.event_rules.required_windows.len() <= 16
                && input.validate().is_ok()
        })
}
fn text(value: &Value) -> String {
    value["value"].as_str().unwrap_or_default().to_owned()
}
fn project_event(
    value: &Value,
    has_inputs: bool,
    accepted_plan: StrategyAcceptedMark,
) -> Option<StrategyEventSummary> {
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
        has_inputs,
        accepted_plan,
    })
}
#[cfg(test)]
#[path = "strategy_tests.rs"]
mod tests;
#[cfg(test)]
#[path = "strategy_file_tests.rs"]
mod file_tests;
#[cfg(test)]
#[path = "strategy_data_tests.rs"]
mod data_tests;
#[cfg(test)]
#[path = "strategy_accepted_tests.rs"]
mod accepted_tests;
