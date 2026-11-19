//! One cancellable scalar calculation per host session.
use super::{
    StrategyFields,
    accepted::{self, StrategyAcceptedView},
    editing::{Editing, Recalculation, StrategyEditError, StrategyEditView},
    valid_text,
};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Number;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_strategy::{
    application::{self, Fallback, ManualEvent, ManualField, SourceStatus},
    document::Document,
    solver::{self, GreedyRefusal, Input, InputField, OptimalityStatus, SolverOutcome},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategySolverFields {
    pub base_pace_seconds: String,
    pub fuel_per_lap_liters: String,
    pub race_laps: String,
    pub ve_capacity_percent: String,
    pub ve_per_lap_percent: String,
    pub tyre_life_laps: String,
    pub degradation_seconds: String,
    pub refuel_rate: String,
    pub ve_rate: String,
    pub tyre_service_seconds: String,
    pub formation_seconds: String,
    pub fuel_step: String,
    pub ve_step: String,
    pub reserve_laps: String,
    pub service_mode: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyComputeForm {
    pub fields: StrategyFields,
    pub inputs: StrategySolverFields,
}

impl StrategyComputeForm {
    pub(super) fn manual(&self) -> Result<ManualEvent, HostError> {
        manual_with(&self.fields, &self.inputs)
    }

    /// The entries a document holds for one variant, as the form that
    /// `strategy.compute` takes. `None` when any of the 28 texts is not valid wire
    /// text (over the limit or with a control character): a text is never cut or
    /// emptied to make it fit.
    pub(super) fn read(manual: &ManualEvent) -> Option<Self> {
        ManualField::ALL
            .iter()
            .all(|&field| valid_text(&manual[field]))
            .then(|| Self {
                fields: StrategyFields {
                    name: manual.name.clone(),
                    duration_minutes: manual.duration_minutes.clone(),
                    fuel_capacity_liters: manual.fuel_capacity_liters.clone(),
                    pit_transit_seconds: manual.pit_transit_seconds.clone(),
                    track: manual.track.clone(),
                    class: manual.class.clone(),
                    variant_name: manual.variant_name.clone(),
                    variant_note: manual.variant_note.clone(),
                    variant_mode: manual.variant_mode.clone(),
                    start_at: manual.start_at.clone(),
                    team: manual.team.clone(),
                    driver_name: manual.driver_name.clone(),
                    driver_initials: manual.driver_initials.clone(),
                },
                inputs: StrategySolverFields {
                    base_pace_seconds: manual.base_pace_seconds.clone(),
                    fuel_per_lap_liters: manual.fuel_per_lap_liters.clone(),
                    race_laps: manual.race_laps.clone(),
                    ve_capacity_percent: manual.ve_capacity_percent.clone(),
                    ve_per_lap_percent: manual.ve_per_lap_percent.clone(),
                    tyre_life_laps: manual.tyre_life_laps.clone(),
                    degradation_seconds: manual.degradation_seconds.clone(),
                    refuel_rate: manual.refuel_rate.clone(),
                    ve_rate: manual.ve_rate.clone(),
                    tyre_service_seconds: manual.tyre_service_seconds.clone(),
                    formation_seconds: manual.formation_seconds.clone(),
                    fuel_step: manual.fuel_step.clone(),
                    ve_step: manual.ve_step.clone(),
                    reserve_laps: manual.reserve_laps.clone(),
                    service_mode: manual.service_mode.clone(),
                },
            })
    }
}

/// The 13 fields and the 15 inputs as one manual event: `compute` and `create` with
/// inputs read them the same way (every text valid, then the crate's checks).
pub(super) fn manual_with(
    fields: &StrategyFields,
    inputs: &StrategySolverFields,
) -> Result<ManualEvent, HostError> {
    let mut manual = fields.manual()?;
    for (entry, target) in [
        (&inputs.base_pace_seconds, &mut manual.base_pace_seconds),
        (&inputs.fuel_per_lap_liters, &mut manual.fuel_per_lap_liters),
        (&inputs.race_laps, &mut manual.race_laps),
        (&inputs.ve_capacity_percent, &mut manual.ve_capacity_percent),
        (&inputs.ve_per_lap_percent, &mut manual.ve_per_lap_percent),
        (&inputs.tyre_life_laps, &mut manual.tyre_life_laps),
        (&inputs.degradation_seconds, &mut manual.degradation_seconds),
        (&inputs.refuel_rate, &mut manual.refuel_rate),
        (&inputs.ve_rate, &mut manual.ve_rate),
        (&inputs.tyre_service_seconds, &mut manual.tyre_service_seconds),
        (&inputs.formation_seconds, &mut manual.formation_seconds),
        (&inputs.fuel_step, &mut manual.fuel_step),
        (&inputs.ve_step, &mut manual.ve_step),
        (&inputs.reserve_laps, &mut manual.reserve_laps),
        (&inputs.service_mode, &mut manual.service_mode),
    ] {
        if !valid_text(entry) {
            return Err(HostError::StrategyInvalidText);
        }
        target.clone_from(entry);
    }
    Ok(manual)
}

macro_rules! strategy_fields {
    ($($variant:ident),+ $(,)?) => {
        /// The closed set of form fields a calculation error can point at: the 13
        /// `fields` and the 15 `inputs`, spelled exactly as on the wire.
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
        #[cfg_attr(any(test, feature = "bindings"), derive(TS))]
        #[serde(rename_all = "camelCase")]
        pub enum StrategyField { $($variant,)+ }

        impl StrategyField {
            pub const ALL: &'static [Self] = &[$(Self::$variant,)+];
        }

        impl From<ManualField> for StrategyField {
            fn from(field: ManualField) -> Self {
                match field { $(ManualField::$variant => Self::$variant,)+ }
            }
        }
    };
}

/// The one place a scalar of the crate becomes a field of the form.
impl From<InputField> for StrategyField {
    fn from(field: InputField) -> Self {
        match field {
            InputField::RaceLaps => Self::RaceLaps,
            InputField::BasePace => Self::BasePaceSeconds,
            InputField::PitTransit => Self::PitTransitSeconds,
            InputField::RefuelRate => Self::RefuelRate,
            InputField::VeRate => Self::VeRate,
            InputField::TyreService => Self::TyreServiceSeconds,
            InputField::Formation => Self::FormationSeconds,
            InputField::FuelCapacity => Self::FuelCapacityLiters,
            InputField::VeCapacity => Self::VeCapacityPercent,
            InputField::TyreLife => Self::TyreLifeLaps,
            InputField::FuelPerLap => Self::FuelPerLapLiters,
            InputField::VePerLap => Self::VePerLapPercent,
            InputField::Degradation => Self::DegradationSeconds,
            InputField::FuelStep => Self::FuelStep,
            InputField::VeStep => Self::VeStep,
            InputField::ServiceMode => Self::ServiceMode,
        }
    }
}

strategy_fields!(
    Name,
    DurationMinutes,
    FuelCapacityLiters,
    PitTransitSeconds,
    Track,
    Class,
    VariantName,
    VariantNote,
    VariantMode,
    StartAt,
    Team,
    DriverName,
    DriverInitials,
    BasePaceSeconds,
    FuelPerLapLiters,
    RaceLaps,
    VeCapacityPercent,
    VePerLapPercent,
    TyreLifeLaps,
    DegradationSeconds,
    RefuelRate,
    VeRate,
    TyreServiceSeconds,
    FormationSeconds,
    FuelStep,
    VeStep,
    ReserveLaps,
    ServiceMode,
);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyPlanState {
    #[default]
    Uncalculated,
    Calculating,
    Partial,
    Error,
    Calculated,
    PendingChanges,
    /// The schedule was edited and is not recalculated yet: `result` still shows
    /// the plan it started from and `edit` the edited schedule.
    Edited,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyPlanError {
    InvalidInput,
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "snake_case")]
pub enum StrategyCertificate {
    Proven,
    NotProven,
    NoSolution,
}

/// Why a result is not a proven plan: a closed set, never free text. It is
/// present exactly when the certificate is not `proven` (a partial result, with
/// or without a plan, or no solution) and `null` otherwise.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyReason {
    /// The search stopped before finishing: candidates, iterations, memory or time
    /// ran out (the greedy fallback plan, when there is one, replaced its result).
    SearchBudgetExhausted,
    /// The search ran out on a service grid too fine for its budget and there is no
    /// plan to fall back to (#2635).
    FineGridNoFallback,

    /// No plan satisfies the event rules or the edited schedule.
    ConstraintsUnsatisfiable,
    /// The search finished and no plan fits the race.
    NoFeasiblePlan,
}

impl StrategyReason {
    pub const ALL: &'static [Self] = &[
        Self::SearchBudgetExhausted,
        Self::FineGridNoFallback,
        Self::ConstraintsUnsatisfiable,
        Self::NoFeasiblePlan,
    ];
}

/// Maps the crate's account of a calculation to the closed reason from typed
/// facts only: the certificate status and the crate's `Fallback`. The crate's
/// `certificate.reason` is free text and is never read here. `constrained` says
/// that event rules or an edited schedule bind the plan.
///
/// | crate | reason |
/// |---|---|
/// | proven | none |
/// | no solution, rules or edited schedule | `constraintsUnsatisfiable` |
/// | no solution, nothing binds the plan | `noFeasiblePlan` |
/// | not proven, `Refused(NotScalar)` | `fineGridNoFallback` |
/// | not proven, any other fallback (`Applied`, other refusals, `NotApplicable`) | `searchBudgetExhausted` |
///
/// On a coarsened grid a complete search proves "no plan" only for the effective
/// steps, which the same result reports (`steps`, `degraded`).
pub(super) fn reason_of(
    status: OptimalityStatus,
    fallback: Fallback,
    constrained: bool,
) -> Option<StrategyReason> {
    match status {
        OptimalityStatus::Proven => None,
        OptimalityStatus::NoSolution if constrained => {
            Some(StrategyReason::ConstraintsUnsatisfiable)
        }
        OptimalityStatus::NoSolution => Some(StrategyReason::NoFeasiblePlan),
        OptimalityStatus::NotProven => Some(match fallback {
            Fallback::Refused(GreedyRefusal::NotScalar) => StrategyReason::FineGridNoFallback,
            _ => StrategyReason::SearchBudgetExhausted,
        }),
    }
}

/// Rules that bind the plan whatever the form says.
fn has_rules(input: &Input) -> bool {
    let rules = &input.event_rules;
    rules.min_pit_stops.is_some()
        || rules.max_pit_stops.is_some()
        || !rules.required_windows.is_empty()
        || !rules.extra.is_empty()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyPitService {
    Parallel,
    Sequential,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyPlanView {
    pub state: StrategyPlanState,
    /// Opaque, session-local id of the calculation this plan belongs to; `null`
    /// while there is none. `strategy.cancel` must quote it.
    pub compute_id: Option<u32>,
    pub result: Option<Box<StrategyCalculationView>>,
    pub error: Option<StrategyPlanError>,
    /// The form field behind an `invalidInput` error; `null` when it is not one field.
    pub error_field: Option<StrategyField>,
    /// The editable schedule of a feasible plan; `null` when there is none.
    pub edit: Option<StrategyEditView>,
    /// The plan accepted for the active variant, apart from `result` (the
    /// proposal). The calculation never fills it: the view of the session does.
    pub accepted: Option<Box<StrategyAcceptedView>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyCalculationView {
    pub certificate: Option<StrategyCertificate>,
    pub steps: StrategyServiceSteps,
    /// `true` when a service step is coarser than the one requested in the form.
    pub degraded: bool,
    /// Why the result is not proven; `null` exactly when `certificate` is `proven`.
    pub reason: Option<StrategyReason>,
    pub metrics: Option<StrategyMetrics>,
    pub timeline: Option<StrategyTimeline>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyServiceSteps {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub fuel_liters: Option<Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub ve_percent: Option<Number>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyMetrics {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub total_seconds: Number,
    pub laps: u32,
    pub pit_count: u32,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub fuel_reserve_real_laps: Option<Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_reserve_required_laps: Number,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyTimeline {
    pub pilot: String,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub base_pace_seconds: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_start_liters: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_finish_liters: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub ve_start_percent: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub ve_finish_percent: Number,
    pub stints: Vec<StrategyStint>,
    pub pits: Vec<StrategyPit>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyStint {
    pub from_lap: u32,
    pub to_lap: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyPit {
    pub lap: u32,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_liters: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub ve_percent: Number,
    pub change_tyres: bool,
    pub service: StrategyPitService,
    /// The time the stop takes in the pits, from the crate's own replay of the plan.
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub pit_seconds: Number,
    /// Which amounts the person fixed by hand. Reserved: the calculation decides
    /// everything today, so every flag is `false` until the amounts can be fixed.
    pub pinned: StrategyPitPinned,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyPitPinned {
    pub fuel_liters: bool,
    pub ve_percent: bool,
    pub change_tyres: bool,
}

pub const STRATEGY_PIT_LIMIT: usize = 16;
/// The solver rounds service steps to 1e-6; anything above that is coarsening.
const STEP_TOLERANCE: f64 = 1e-6;

/// Why a calculation produced no plan, with the form field when one is to blame.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct Failure {
    pub error: StrategyPlanError,
    pub field: Option<StrategyField>,
}

impl From<StrategyPlanError> for Failure {
    fn from(error: StrategyPlanError) -> Self {
        Self { error, field: None }
    }
}

/// A finished calculation: the document it confirmed, its plan and, when the plan
/// is feasible, the schedule to edit.
pub(super) type Work = Result<(Document, StrategyPlanView, Option<Editing>), Failure>;

enum Done {
    Calculation(Box<Work>),
    Recalculation(Recalculation),
}

#[derive(Default)]
pub(super) struct Calculation {
    next_id: u32,
    generation: u64,
    worker: Option<Worker>,
    view: StrategyPlanView,
    editing: Option<Editing>,
}

struct Worker {
    id: u32,
    generation: u64,
    cancel: Arc<AtomicBool>,
    thread: JoinHandle<Done>,
}

impl Calculation {
    pub(super) fn running(&self) -> bool {
        self.worker.is_some()
    }

    pub(super) fn view(&self) -> &StrategyPlanView {
        &self.view
    }

    /// `true` while the schedule is edited and not recalculated.
    pub(super) fn edit_pending(&self) -> bool {
        self.editing.as_ref().is_some_and(Editing::pending)
    }

    /// Cancels only the calculation the caller names; any other id is stale and ignored.
    /// A cancelled recalculation leaves the edited schedule pending, as it was.
    pub(super) fn cancel(&mut self, compute_id: u32) {
        if self.view.state != StrategyPlanState::Calculating
            || self.view.compute_id != Some(compute_id)
        {
            return;
        }
        if self.editing.is_some() {
            self.stop_worker();
            self.show_edit(Some(compute_id));
        } else {
            self.invalidate(false);
        }
    }

    pub(super) fn invalidate(&mut self, edited: bool) {
        self.stop_worker();
        self.editing = None;
        self.view = StrategyPlanView {
            state: if edited && self.view.state != StrategyPlanState::Uncalculated {
                StrategyPlanState::PendingChanges
            } else {
                StrategyPlanState::Uncalculated
            },
            ..StrategyPlanView::default()
        };
    }

    /// Discards the running worker's result by bumping the generation.
    fn stop_worker(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        if let Some(worker) = &self.worker {
            worker.cancel.store(true, Ordering::Relaxed);
        }
    }

    fn show_edit(&mut self, compute_id: Option<u32>) {
        if let Some(editing) = &self.editing {
            self.view = editing.plan_view(compute_id);
        }
    }

    pub(super) fn start(
        &mut self,
        run: impl FnOnce(&AtomicBool) -> Work + Send + 'static,
    ) -> Result<(), HostError> {
        let id = self.spawn(move |cancel| Done::Calculation(Box::new(run(cancel))))?;
        self.editing = None;
        self.view = StrategyPlanView {
            state: StrategyPlanState::Calculating,
            compute_id: Some(id),
            ..StrategyPlanView::default()
        };
        Ok(())
    }

    /// Recalculates the edited schedule in the same worker slot, with a new id.
    pub(super) fn recalculate(&mut self) -> Result<(), HostError> {
        let Some(editing) = &self.editing else {
            return Err(HostError::Rejected);
        };
        if !editing.pending() {
            return Err(HostError::Rejected);
        }
        self.recalculate_with(editing.job())
    }

    fn recalculate_with(
        &mut self,
        run: impl FnOnce(&AtomicBool) -> Recalculation + Send + 'static,
    ) -> Result<(), HostError> {
        let Some(editing) = &self.editing else {
            return Err(HostError::Rejected);
        };
        let mut view = editing.plan_view(None);
        let id = self.spawn(move |cancel| Done::Recalculation(run(cancel)))?;
        view.compute_id = Some(id);
        view.state = StrategyPlanState::Calculating;
        self.view = view;
        Ok(())
    }

    /// Starts a recalculation that runs `run` instead of the solver.
    #[cfg(test)]
    pub(super) fn test_recalculate_with(
        &mut self,
        run: impl FnOnce(&AtomicBool) -> Recalculation + Send + 'static,
    ) -> Result<(), HostError> {
        self.recalculate_with(run)
    }

    fn spawn(
        &mut self,
        run: impl FnOnce(&AtomicBool) -> Done + Send + 'static,
    ) -> Result<u32, HostError> {
        if self.running() {
            return Err(HostError::Busy);
        }
        self.next_id = self.next_id.checked_add(1).unwrap_or(1);
        let id = self.next_id;
        let cancel = Arc::new(AtomicBool::new(false));
        let signal = cancel.clone();
        let thread = thread::Builder::new()
            .name("host-strategy".into())
            .spawn(move || run(&signal))
            .map_err(|_| HostError::Io)?;
        self.worker = Some(Worker {
            id,
            generation: self.generation,
            cancel,
            thread,
        });
        Ok(id)
    }

    /// Runs `edit` on the edited schedule of the plan `compute_id` names. A plan
    /// that is not that one, or has no schedule, is stale (`Ok(None)`); while a
    /// recalculation runs the schedule is `Busy`.
    pub(super) fn edit(
        &mut self,
        compute_id: u32,
        edit: impl FnOnce(&mut Editing) -> Result<(), HostError>,
    ) -> Result<Option<()>, HostError> {
        if self.view.compute_id != Some(compute_id) || self.editing.is_none() {
            return Ok(None);
        }
        if self.view.state == StrategyPlanState::Calculating {
            return Err(HostError::Busy);
        }
        if let Some(editing) = &mut self.editing {
            edit(editing)?;
        }
        self.show_edit(Some(compute_id));
        Ok(Some(()))
    }

    /// Drops the edit and shows the last feasible plan, cancelling a recalculation.
    pub(super) fn reset(&mut self, compute_id: u32) -> Option<()> {
        if self.view.compute_id != Some(compute_id) || self.editing.is_none() {
            return None;
        }
        if self.view.state == StrategyPlanState::Calculating {
            self.stop_worker();
        }
        if let Some(editing) = &mut self.editing {
            editing.reset();
        }
        self.show_edit(Some(compute_id));
        Some(())
    }

    pub(super) fn poll(&mut self) -> Option<Document> {
        if self
            .worker
            .as_ref()
            .is_some_and(|worker| worker.thread.is_finished())
        {
            self.finish()
        } else {
            None
        }
    }

    pub(super) fn finish(&mut self) -> Option<Document> {
        let worker = self.worker.take()?;
        let done = worker.thread.join();
        if self.generation != worker.generation {
            return None;
        }
        let id = Some(worker.id);
        match done {
            Ok(Done::Calculation(work)) => match *work {
                Ok((document, view, editing)) => {
                    self.editing = editing;
                    self.view = StrategyPlanView {
                        compute_id: id,
                        ..view
                    };
                    Some(document)
                }
                Err(failure) => {
                    self.fail(worker.id, failure);
                    None
                }
            },
            Ok(Done::Recalculation(done)) => {
                if let Some(editing) = &mut self.editing {
                    editing.apply(done);
                }
                self.show_edit(id);
                None
            }
            Err(_) if self.editing.is_some() => {
                if let Some(editing) = &mut self.editing {
                    editing.apply(Err(StrategyEditError::Failed));
                }
                self.show_edit(id);
                None
            }
            Err(_) => {
                self.fail(worker.id, StrategyPlanError::Failed.into());
                None
            }
        }
    }

    fn fail(&mut self, id: u32, failure: Failure) {
        self.view = StrategyPlanView {
            state: StrategyPlanState::Error,
            compute_id: Some(id),
            result: None,
            error: Some(failure.error),
            error_field: failure.field,
            edit: None,
            accepted: None,
        };
    }
}

impl Drop for Calculation {
    fn drop(&mut self) {
        if let Some(worker) = self.worker.take() {
            worker.cancel.store(true, Ordering::Relaxed);
            let _ = worker.thread.join();
        }
    }
}

pub(super) fn run(
    mut document: Document,
    event: usize,
    variant: usize,
    manual: &ManualEvent,
    cancel: &AtomicBool,
) -> Work {
    let invalid = |_| Failure {
        error: StrategyPlanError::InvalidInput,
        field: invalid_field(manual, true),
    };
    let input = manual
        .prepare(&mut document, event, variant)
        .map_err(invalid)?;
    let input = application::prepare_manual(input).map_err(invalid)?;
    super::validate_projection(&document, HostError::StrategyInvalidText)
        .map_err(|_| Failure::from(StrategyPlanError::InvalidInput))?;
    let calculation = application::calculate_detailed(&input, SourceStatus::Open, cancel)
        .map_err(|_| StrategyPlanError::Failed)?;
    let pilot = manual.driver_name.trim();
    let mut view = project_calculated(input.input(), &calculation, pilot)?;
    let editing = Editing::new(input.input(), &calculation.outcome, &view, pilot);
    view.edit = editing.as_ref().map(Editing::edit_view);
    Ok((document, view, editing))
}

/// The form field behind a refusal of the crate: the first whose text is not a
/// number or a whole number as required, and then the scalar the crate itself
/// names (a zero pace, a negative step...). The rules are the crate's: none is
/// copied here. `inputs: false` looks only at the 13 fields (a confirmation with
/// no `inputs` leaves the stored ones alone). Anything else involves no single
/// field and reports none.
pub(super) fn invalid_field(manual: &ManualEvent, inputs: bool) -> Option<StrategyField> {
    let not_a_number = ManualField::ALL
        .iter()
        .copied()
        .filter(|field| inputs || !field.is_scalar())
        .find(|&field| is_not_a_number(manual, field))
        .map(StrategyField::from);
    not_a_number.or_else(|| {
        inputs
            .then(|| manual.input_field())
            .flatten()
            .map(StrategyField::from)
    })
}

/// Whether the text of a field that must be a number (or a whole number) is not.
fn is_not_a_number(manual: &ManualEvent, field: ManualField) -> bool {
    let text = manual[field].trim();
    match field {
        ManualField::RaceLaps | ManualField::DurationMinutes => text.parse::<u32>().is_err(),
        ManualField::FuelCapacityLiters
        | ManualField::PitTransitSeconds
        | ManualField::BasePaceSeconds
        | ManualField::FuelPerLapLiters
        | ManualField::VeCapacityPercent
        | ManualField::VePerLapPercent
        | ManualField::TyreLifeLaps
        | ManualField::DegradationSeconds
        | ManualField::RefuelRate
        | ManualField::VeRate
        | ManualField::TyreServiceSeconds
        | ManualField::FormationSeconds
        | ManualField::FuelStep
        | ManualField::VeStep
        | ManualField::ReserveLaps => !text.parse::<f64>().is_ok_and(f64::is_finite),
        _ => false,
    }
}

fn number(value: f64) -> Result<Number, StrategyPlanError> {
    Number::from_f64(value).ok_or(StrategyPlanError::Failed)
}

/// A plan of the search with no account of a fallback (a recalculation of an
/// edited schedule, or a plan the search itself returned).
#[cfg(test)]
pub(super) fn project(
    input: &Input,
    outcome: &SolverOutcome,
    pilot: &str,
) -> Result<StrategyPlanView, StrategyPlanError> {
    project_with(input, outcome, pilot, has_rules(input), Fallback::NotApplicable)
}

/// A calculation of the manual bridge, with the crate's account of its fallback.
pub(super) fn project_calculated(
    input: &Input,
    calculation: &application::Calculation,
    pilot: &str,
) -> Result<StrategyPlanView, StrategyPlanError> {
    project_with(
        input,
        &calculation.outcome,
        pilot,
        has_rules(input),
        calculation.fallback,
    )
}

/// `constrained`: the plan is bound by rules or by an edited schedule, so an
/// infeasible answer is about those constraints.
pub(super) fn project_with(
    input: &Input,
    outcome: &SolverOutcome,
    pilot: &str,
    constrained: bool,
    fallback: Fallback,
) -> Result<StrategyPlanView, StrategyPlanError> {
    let status = outcome.certificate.status;
    let result = &outcome.result;
    let certificate = match status {
        OptimalityStatus::Proven => Some(StrategyCertificate::Proven),
        OptimalityStatus::NotProven if result.feasible => Some(StrategyCertificate::NotProven),
        OptimalityStatus::NotProven => None,
        OptimalityStatus::NoSolution => Some(StrategyCertificate::NoSolution),
    };
    let grid = solver::manual_service_grid(input).map_err(|_| StrategyPlanError::Failed)?;
    let steps = StrategyServiceSteps {
        fuel_liters: (grid.fuel_liters > 0.0)
            .then(|| number(grid.fuel_liters))
            .transpose()?,
        ve_percent: (grid.ve_percent > 0.0)
            .then(|| number(grid.ve_percent))
            .transpose()?,
    };
    let coarser = |step: f64, requested: f64| {
        let requested = if requested == 0.0 { 1.0 } else { requested };
        step > 0.0 && step - requested > STEP_TOLERANCE
    };
    let degraded = coarser(grid.fuel_liters, input.discretization.fuel_liters)
        || coarser(grid.ve_percent, input.discretization.ve_percent);
    let reason = reason_of(status, fallback, constrained);
    let (metrics, timeline) = if result.feasible {
        (
            Some(metrics(input, result)?),
            (result.pit_stops.len() <= STRATEGY_PIT_LIMIT
                && result.stints.len() <= STRATEGY_PIT_LIMIT + 1)
                .then(|| timeline(input, result, pilot))
                .transpose()?,
        )
    } else {
        (None, None)
    };
    Ok(StrategyPlanView {
        state: if status == OptimalityStatus::NotProven {
            StrategyPlanState::Partial
        } else {
            StrategyPlanState::Calculated
        },
        result: Some(Box::new(StrategyCalculationView {
            certificate,
            steps,
            degraded,
            reason,
            metrics,
            timeline,
        })),
        compute_id: None, // the worker slot stamps its own id
        error: None,
        error_field: None,
        edit: None,
        accepted: None,
    })
}

fn metrics(input: &Input, result: &solver::ResultV2) -> Result<StrategyMetrics, StrategyPlanError> {
    let actual = result.reserve.as_ref().map_or_else(
        || {
            let per_lap = input.fuel_per_lap_liters.value;
            (per_lap > 0.0).then(|| result.fuel_remaining_liters / per_lap)
        },
        |reserve| {
            reserve
                .fuel
                .effective_laps_available
                .then_some(reserve.fuel.effective_laps)
        },
    );
    let required = input.fuel_reserve["laps"]["value"]
        .as_f64()
        .unwrap_or_default();
    let laps = result
        .stints
        .iter()
        .try_fold(0_u32, |sum, &laps| sum.checked_add(laps))
        .ok_or(StrategyPlanError::Failed)?;
    Ok(StrategyMetrics {
        total_seconds: number(result.expected.total_seconds)?,
        laps,
        pit_count: u32::try_from(result.pit_stops.len()).map_err(|_| StrategyPlanError::Failed)?,
        fuel_reserve_real_laps: actual.map(number).transpose()?,
        fuel_reserve_required_laps: number(required)?,
    })
}

fn timeline(
    input: &Input,
    result: &solver::ResultV2,
    pilot: &str,
) -> Result<StrategyTimeline, StrategyPlanError> {
    let mut lap = 0_u32;
    let mut stints = Vec::with_capacity(result.stints.len());
    for &length in &result.stints {
        let from_lap = lap.checked_add(1).ok_or(StrategyPlanError::Failed)?;
        lap = lap.checked_add(length).ok_or(StrategyPlanError::Failed)?;
        stints.push(StrategyStint {
            from_lap,
            to_lap: lap,
        });
    }
    let pits = result
        .pit_stops
        .iter()
        .map(|pit| {
            let service = match pit.service_mode.as_str() {
                "parallel" => StrategyPitService::Parallel,
                "sequential" => StrategyPitService::Sequential,
                _ => return Err(StrategyPlanError::Failed),
            };
            Ok(StrategyPit {
                lap: pit.lap,
                fuel_liters: number(pit.fuel_liters)?,
                ve_percent: number(pit.ve_percent)?,
                change_tyres: pit.change_tyres,
                service,
                pit_seconds: number(accepted::pit_seconds(
                    input,
                    &solver::PitDecision {
                        lap: pit.lap,
                        fuel_liters: pit.fuel_liters,
                        ve_percent: pit.ve_percent,
                        change_tyres: pit.change_tyres,
                        ..solver::PitDecision::default()
                    },
                ))?,
                pinned: StrategyPitPinned::default(),
            })
        })
        .collect::<Result<_, _>>()?;
    Ok(StrategyTimeline {
        pilot: pilot.into(),
        base_pace_seconds: number(input.base_lap_seconds.value)?,
        fuel_start_liters: number(result.fuel_start_liters)?,
        fuel_finish_liters: number(result.fuel_remaining_liters)?,
        ve_start_percent: number(result.ve_start_percent)?,
        ve_finish_percent: number(result.ve_remaining_percent)?,
        stints,
        pits,
    })
}

#[cfg(test)]
#[path = "strategy_calculation_tests.rs"]
mod tests;
