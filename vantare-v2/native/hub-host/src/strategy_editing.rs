//! Editing of the calculated plan in memory: move a stint boundary or a pit stop,
//! fix by hand the fuel and the energy a stop loads, recalculate with the edited
//! schedule and the fixed amounts as constraints, or reset to the last feasible
//! plan. The document is never touched: the schedule and what is fixed live only
//! here, and reach the document when the recalculated plan is accepted.
use super::accepted::pit_seconds;
use super::calculation::{
    STRATEGY_PIT_LIMIT, StrategyPlanState, StrategyPlanView, StrategyStint, project_with,
};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Number;
use std::sync::atomic::AtomicBool;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_strategy::{
    application::{EditedPlan, fixed_stop_bounds, recalculate_edited_plan_fixed},
    solver::{
        self, AmountRange, Discretization, FixedProblem, FixedResource, FixedStop,
        FixedStopProblem, Input, PitDecision, ResourceBounds, SolverOutcome, StopBounds,
    },
};

/// The editable schedule of a feasible plan, with what the person fixed by hand
/// in each stop. What is not fixed is decided by the calculation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyEditView {
    /// The edited stints, in order and contiguous from lap 1 to the last lap.
    pub stints: Vec<StrategyStint>,
    /// One stop per boundary between two stints, in order.
    pub stops: Vec<StrategyEditStop>,
    /// `true` when `strategy.resetEdit` would change something.
    pub can_reset: bool,
    /// Why the last recalculation of this schedule failed; `null` otherwise.
    pub error: Option<StrategyEditError>,
    /// Why the last recalculation of this schedule found no plan, when the crate
    /// can name it; `null` otherwise (also after any later change of the edit).
    pub cause: Option<StrategyEditCause>,
    /// The figures of the last feasible plan calculated with nothing fixed and
    /// with this very schedule, to compare with. `null` while nothing is fixed
    /// or when there is no such plan (a stop was also moved). No calculation
    /// runs to fill it.
    pub automatic: Option<StrategyAutomaticPlan>,
}

/// Why a recalculation found no plan: a closed set.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum StrategyEditCause {
    /// No plan respects what is fixed: `stop` (0 = first) is the first fixed
    /// stop with which there stops being one.
    FixedAmountUnreachable { stop: u32 },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyAutomaticPlan {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub total_seconds: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_finish_liters: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub ve_finish_percent: Number,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyEditStop {
    /// The lap completed immediately before the stop.
    pub lap: u32,
    /// The earliest and latest lap the stop can move to without emptying a stint.
    pub min_lap: u32,
    pub max_lap: u32,
    /// What the last feasible plan loads in this stop (what "automatic" shows).
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_liters: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub ve_percent: Number,
    /// What the person fixed by hand in this stop.
    pub fixed: StrategyStopFixed,
    /// The time in the pits with the fixed amounts (and the plan's for the rest).
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub pit_seconds: Number,
    /// What can be fixed in this stop, in the model of the recalculation.
    pub limits: StrategyStopLimits,
}

/// The amounts fixed by hand in a stop; `null` is automatic.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyStopFixed {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub fuel_liters: Option<Number>,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number | null"))]
    pub ve_percent: Option<Number>,
}

/// The limits of a stop. They depend on the schedule and on what is fixed in
/// the other stops, so every view carries them anew.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum StrategyStopLimits {
    /// The calculation cannot give exact limits (a service step so fine that it
    /// coarsens it): there is none to show.
    Unavailable,
    Exact {
        fuel: StrategyAmountLimits,
        ve: StrategyAmountLimits,
    },
}

/// The limits of one amount of a stop.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum StrategyAmountLimits {
    /// The car does not use this resource (no virtual energy).
    Unused,
    Used {
        /// The levels one can arrive at the stop with, as the calculation models
        /// them (it starts with a full tank). `null`: with what is fixed before,
        /// the stop is not reached.
        arrival: Option<StrategyAmountRange>,
        /// The least and the most that can be fixed here for a plan to exist,
        /// with the other stops as they are. `null`: no amount gives a plan.
        range: Option<StrategyAmountRange>,
        /// What happens to the amount fixed here; `null` when it is automatic or
        /// inside `range`.
        issue: Option<StrategyAmountIssue>,
        /// With `belowMin`: the first lap that cannot be completed even loading
        /// the most in the automatic stops. `null` when the finish is reached
        /// without the reserve, and with any other `issue`.
        #[serde(rename = "failLap")]
        fail_lap: Option<u32>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyAmountRange {
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub min: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub max: Number,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyAmountIssue {
    /// Too little: no plan reaches the next stops or the finish with it.
    BelowMin,
    /// Too much: it does not fit, or it leaves no room for a later fixed amount.
    AboveMax,
    /// With the other stops as they are, no amount here gives a plan.
    NoRange,
}

impl StrategyAmountIssue {
    pub const ALL: &'static [Self] = &[Self::BelowMin, Self::AboveMax, Self::NoRange];
}

/// The amount of a stop a refusal of `strategy.setStopService` points at.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyStopAmount {
    FuelLiters,
    VePercent,
}

/// Why an amount cannot be fixed whatever the other stops do.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyStopServiceReason {
    Negative,
    /// More than the tank or the battery holds.
    AboveCapacity,
    /// Not a multiple of the service step the calculation uses.
    OffGrid,
    /// The car does not use this resource.
    NotInUse,
}

impl StrategyStopServiceReason {
    pub const ALL: &'static [Self] = &[
        Self::Negative,
        Self::AboveCapacity,
        Self::OffGrid,
        Self::NotInUse,
    ];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase")]
pub enum StrategyEditError {
    /// The schedule is not valid (a shape the solver cannot constrain).
    InvalidSchedule,
    /// The number of stops conflicts with the minimum or maximum of the event rules.
    EventRulesConflict,
    /// The solver returned a plan with a different schedule.
    ScheduleNotPreserved,
    Failed,
}

/// A recalculation that ended on its own (a cancelled one is discarded by generation).
pub(crate) struct Recalculated {
    pub view: StrategyPlanView,
    pub feasible: bool,
    /// The fixed stop that leaves no plan, when the crate names one.
    pub unreachable_stop: Option<usize>,
}

pub(crate) type Recalculation = Result<Recalculated, StrategyEditError>;

pub(super) struct Editing {
    input: Input,
    pilot: String,
    /// The last feasible plan; `reset` returns to it.
    base: StrategyPlanView,
    base_schedule: EditedPlan,
    /// What `result` shows while nothing is pending: `base`, or the answer of an
    /// infeasible recalculation.
    shown: StrategyPlanView,
    edited: EditedPlan,
    pending: bool,
    error: Option<StrategyEditError>,
    /// What the person fixed by hand: one entry per stop of `edited`.
    fixed: Vec<FixedStop>,
    /// What `base` was calculated with; `reset` returns to it.
    base_fixed: Vec<FixedStop>,
    cause: Option<StrategyEditCause>,
    /// The last feasible plan calculated with nothing fixed: its schedule and figures.
    automatic: Option<(EditedPlan, StrategyAutomaticPlan)>,
    /// The service steps of the calculation; zero for a resource not in use.
    grid: Discretization,
}

impl Editing {
    /// Starts editing a feasible plan with a timeline; `None` otherwise.
    pub(super) fn new(
        input: &Input,
        outcome: &SolverOutcome,
        view: &StrategyPlanView,
        pilot: &str,
    ) -> Option<Self> {
        let result = &outcome.result;
        let timeline = view.result.as_ref()?.timeline.as_ref()?;
        if !result.feasible
            || result.stints.is_empty()
            || result.pit_stops.len() + 1 != result.stints.len()
            || result.pit_stops.len() > STRATEGY_PIT_LIMIT
            || timeline.pits.len() != result.pit_stops.len()
            // Only a schedule the crate would accept back is editable: stints of at
            // least one lap that add up to the race, each stop the running total of
            // the stints before it. (A plan of the extended route with `extra` may
            // not cover `race_laps`; the manual bridge never produces one.)
            || !is_schedule(&result.stints, result.pit_stops.iter().map(|stop| stop.lap), input.race_laps)
        {
            return None;
        }
        let schedule = EditedPlan {
            stints: result.stints.clone(),
            pit_stop_laps: result.pit_stops.iter().map(|stop| stop.lap).collect(),
        };
        let automatic = vec![FixedStop::default(); schedule.pit_stop_laps.len()];
        Some(Self {
            input: input.clone(),
            pilot: pilot.into(),
            base: view.clone(),
            base_schedule: schedule.clone(),
            shown: view.clone(),
            automatic: figures(view).map(|figures| (schedule.clone(), figures)),
            edited: schedule,
            pending: false,
            error: None,
            fixed: automatic.clone(),
            base_fixed: automatic,
            cause: None,
            grid: solver::manual_service_grid(input).ok()?,
        })
    }

    pub(super) fn pending(&self) -> bool {
        self.pending
    }

    pub(super) fn edit_view(&self) -> StrategyEditView {
        let pits = self
            .base
            .result
            .as_ref()
            .and_then(|result| result.timeline.as_ref())
            .map_or(&[][..], |timeline| timeline.pits.as_slice());
        let mut from_lap = 1_u32;
        let stints = self
            .edited
            .stints
            .iter()
            .map(|&laps| {
                let stint = StrategyStint {
                    from_lap,
                    to_lap: from_lap + laps - 1,
                };
                from_lap += laps;
                stint
            })
            .collect();
        // The limits follow every change of the edit: they are worked out here,
        // from the schedule and what is fixed now, each time the edit is shown.
        let bounds = fixed_stop_bounds(&self.input, &self.edited, &self.fixed)
            .ok()
            .flatten();
        let stops = self
            .edited
            .pit_stop_laps
            .iter()
            .enumerate()
            .filter_map(|(index, &lap)| {
                let (min_lap, max_lap) = self.range(index)?;
                let pit = pits.get(index)?;
                let fixed = self.fixed.get(index)?;
                let seconds = pit_seconds(
                    &self.input,
                    &PitDecision {
                        lap,
                        fuel_liters: fixed.fuel_liters.or(pit.fuel_liters.as_f64())?,
                        ve_percent: fixed.ve_percent.or(pit.ve_percent.as_f64())?,
                        change_tyres: pit.change_tyres,
                        ..PitDecision::default()
                    },
                );
                Some(StrategyEditStop {
                    lap,
                    min_lap,
                    max_lap,
                    fuel_liters: pit.fuel_liters.clone(),
                    ve_percent: pit.ve_percent.clone(),
                    fixed: StrategyStopFixed {
                        fuel_liters: fixed.fuel_liters.and_then(Number::from_f64),
                        ve_percent: fixed.ve_percent.and_then(Number::from_f64),
                    },
                    pit_seconds: Number::from_f64(seconds)?,
                    limits: bounds
                        .as_ref()
                        .and_then(|bounds| bounds.get(index))
                        .and_then(|bounds| self.limits(bounds))
                        .unwrap_or(StrategyStopLimits::Unavailable),
                })
            })
            .collect();
        let something_fixed = self.fixed.iter().any(|stop| *stop != FixedStop::default());
        StrategyEditView {
            stints,
            stops,
            can_reset: self.pending || self.shown != self.base,
            error: self.error,
            cause: self.cause,
            automatic: self
                .automatic
                .as_ref()
                .filter(|(schedule, _)| something_fixed && *schedule == self.edited)
                .map(|(_, figures)| figures.clone()),
        }
    }

    /// The limits of a stop as the wire shows them; `None` when a number of the
    /// crate cannot travel (not finite), which a valid input never gives.
    fn limits(&self, bounds: &StopBounds) -> Option<StrategyStopLimits> {
        Some(StrategyStopLimits::Exact {
            fuel: amount_limits(&bounds.fuel, self.grid.fuel_liters)?,
            ve: amount_limits(&bounds.ve, self.grid.ve_percent)?,
        })
    }

    /// The plan to show while nothing runs: the shown result plus the edit.
    pub(super) fn plan_view(&self, compute_id: Option<u32>) -> StrategyPlanView {
        StrategyPlanView {
            state: if self.pending {
                StrategyPlanState::Edited
            } else {
                self.shown.state
            },
            compute_id,
            result: self.shown.result.clone(),
            error: None,
            error_field: None,
            edit: Some(self.edit_view()),
            accepted: None,
        }
    }

    /// The first and last lap stop `index` can take: one lap after the previous
    /// stop (or the start) up to one lap before the next stop (or the finish).
    fn range(&self, index: usize) -> Option<(u32, u32)> {
        let laps = &self.edited.pit_stop_laps;
        laps.get(index)?;
        let first = match index.checked_sub(1) {
            None => 1,
            Some(before) => laps[before] + 1,
        };
        let last = laps.get(index + 1).copied().unwrap_or(self.input.race_laps) - 1;
        (first <= last).then_some((first, last))
    }

    /// Moves the boundary after stint `index` to `lap`, keeping every other
    /// boundary and the total. A lap outside its range is rejected, never clamped.
    pub(super) fn move_boundary(&mut self, index: u32, lap: u32) -> Result<(), HostError> {
        let index = usize::try_from(index).map_err(|_| HostError::Rejected)?;
        let (first, last) = self.range(index).ok_or(HostError::Rejected)?;
        if !(first..=last).contains(&lap) {
            return Err(HostError::Rejected);
        }
        if self.edited.pit_stop_laps[index] == lap {
            return Ok(());
        }
        let before = first - 1;
        let after = last + 1;
        self.edited.stints[index] = lap - before;
        self.edited.stints[index + 1] = after - lap;
        self.edited.pit_stop_laps[index] = lap;
        self.changed();
        Ok(())
    }

    /// The edit is no longer the one that was calculated.
    fn changed(&mut self) {
        self.pending = true;
        self.error = None;
        self.cause = None;
    }

    /// Fixes by hand what stop `index` loads: both amounts are stated, and `None`
    /// leaves one to the calculation. An amount the calculation cannot take
    /// whatever the other stops do is refused and nothing changes. A valid one is
    /// kept even when it leaves no plan: the limits of the view say so, because
    /// they move with the other stops.
    pub(super) fn set_stop_service(
        &mut self,
        index: u32,
        fuel: Option<f64>,
        ve: Option<f64>,
    ) -> Result<(), HostError> {
        let index = usize::try_from(index).map_err(|_| HostError::Rejected)?;
        if index >= self.fixed.len() {
            return Err(HostError::Rejected);
        }
        let wanted = FixedStop {
            fuel_liters: self.amount(StrategyStopAmount::FuelLiters, fuel)?,
            ve_percent: self.amount(StrategyStopAmount::VePercent, ve)?,
        };
        if self.fixed[index] != wanted {
            self.fixed[index] = wanted;
            self.changed();
        }
        Ok(())
    }

    /// Returns every stop to automatic.
    pub(super) fn clear_stop_services(&mut self) {
        if self.fixed.iter().any(|stop| *stop != FixedStop::default()) {
            self.fixed.fill(FixedStop::default());
            self.changed();
        }
    }

    /// One amount as the calculation will take it, or the typed refusal. The
    /// rule (range and multiple of the step) is the crate's `check_fixed_stops`.
    fn amount(
        &self,
        amount: StrategyStopAmount,
        value: Option<f64>,
    ) -> Result<Option<f64>, HostError> {
        let Some(value) = value else {
            return Ok(None);
        };
        let (step, capacity) = match amount {
            StrategyStopAmount::FuelLiters => {
                (self.grid.fuel_liters, self.input.fuel_capacity_liters.value)
            }
            StrategyStopAmount::VePercent => {
                (self.grid.ve_percent, self.input.ve_capacity_percent.value)
            }
        };
        let fixed = |value: f64| match amount {
            StrategyStopAmount::FuelLiters => FixedStop {
                fuel_liters: Some(value),
                ve_percent: None,
            },
            StrategyStopAmount::VePercent => FixedStop {
                fuel_liters: None,
                ve_percent: Some(value),
            },
        };
        let refusal = |reason, below: Option<f64>, above: Option<f64>| {
            HostError::StrategyInvalidStopService {
                amount,
                reason,
                below: below.and_then(Number::from_f64),
                above: above.and_then(Number::from_f64),
            }
        };
        if step <= 0.0 {
            return Err(refusal(StrategyStopServiceReason::NotInUse, None, None));
        }
        let problem = solver::check_fixed_stops(&self.input, &[fixed(value)])
            .map_err(|_| HostError::Rejected)?;
        let Some(invalid) = problem else {
            return Ok(Some(whole_units(value)));
        };
        debug_assert_eq!(
            invalid.resource == FixedResource::Fuel,
            amount == StrategyStopAmount::FuelLiters
        );
        let reason = match invalid.problem {
            FixedStopProblem::OffGrid => StrategyStopServiceReason::OffGrid,
            FixedStopProblem::OutOfRange if value >= 0.0 => {
                StrategyStopServiceReason::AboveCapacity
            }
            FixedStopProblem::OutOfRange => StrategyStopServiceReason::Negative,
        };
        // The nearest amounts on each side that the crate does take: proposed
        // from the step and kept only when `check_fixed_stops` accepts them.
        let accepted = |candidate: f64| {
            let candidate = whole_units(candidate);
            matches!(
                solver::check_fixed_stops(&self.input, &[fixed(candidate)]),
                Ok(None)
            )
            .then_some(candidate)
        };
        let steps = (value.clamp(0.0, capacity) / step).floor();
        let below = (value >= 0.0).then(|| accepted(steps * step)).flatten();
        let above = if value >= 0.0 {
            accepted((steps + 1.0) * step)
        } else {
            accepted(0.0)
        };
        Err(refusal(reason, below, above))
    }

    /// Moves stop `index` one lap earlier (`-1`) or later (`1`).
    pub(super) fn move_stop(&mut self, index: u32, delta: i8) -> Result<(), HostError> {
        if delta != -1 && delta != 1 {
            return Err(HostError::Rejected);
        }
        let current = *self
            .edited
            .pit_stop_laps
            .get(usize::try_from(index).map_err(|_| HostError::Rejected)?)
            .ok_or(HostError::Rejected)?;
        let lap = current
            .checked_add_signed(i32::from(delta))
            .ok_or(HostError::Rejected)?;
        self.move_boundary(index, lap)
    }

    /// Returns to the last feasible plan: its schedule and what was fixed in it.
    pub(super) fn reset(&mut self) {
        self.edited = self.base_schedule.clone();
        self.fixed = self.base_fixed.clone();
        self.shown = self.base.clone();
        self.pending = false;
        self.error = None;
        self.cause = None;
    }

    /// The closure the worker runs: the edited schedule and what is fixed as
    /// constraints. With nothing fixed it is the recalculation of the schedule alone.
    pub(super) fn job(&self) -> impl FnOnce(&AtomicBool) -> Recalculation + Send + 'static + use<> {
        let input = self.input.clone();
        let edited = self.edited.clone();
        let fixed = self.fixed.clone();
        let pilot = self.pilot.clone();
        move |cancel| recalculate(&input, &edited, &fixed, &pilot, cancel)
    }

    pub(super) fn apply(&mut self, done: Recalculation) {
        match done {
            Ok(recalculated) => {
                if recalculated.feasible {
                    self.base = recalculated.view.clone();
                    self.base_schedule = self.edited.clone();
                    self.base_fixed = self.fixed.clone();
                    if self.fixed.iter().all(|stop| *stop == FixedStop::default())
                        && let Some(figures) = figures(&recalculated.view)
                    {
                        self.automatic = Some((self.edited.clone(), figures));
                    }
                }
                self.cause = recalculated
                    .unreachable_stop
                    .and_then(|stop| u32::try_from(stop).ok())
                    .map(|stop| StrategyEditCause::FixedAmountUnreachable { stop });
                self.shown = recalculated.view;
                self.pending = false;
                self.error = None;
            }
            Err(error) => self.error = Some(error),
        }
    }
}

/// An amount as the calculation reads it: whole millionths of a litre or of a
/// percentage point (and never a negative zero).
fn whole_units(value: f64) -> f64 {
    const UNITS: f64 = 1_000_000.0;
    (value * UNITS).round() / UNITS + 0.0
}

/// The limits of one amount as the wire shows them. A step of zero is a
/// resource the car does not use. `None` when a number cannot travel.
fn amount_limits(bounds: &ResourceBounds, step: f64) -> Option<StrategyAmountLimits> {
    if step <= 0.0 {
        return Some(StrategyAmountLimits::Unused);
    }
    let range = |range: Option<AmountRange>| match range {
        None => Some(None),
        Some(range) => Some(Some(StrategyAmountRange {
            min: Number::from_f64(range.min)?,
            max: Number::from_f64(range.max)?,
        })),
    };
    let (issue, fail_lap) = match bounds.problem {
        None => (None, None),
        Some(FixedProblem::BelowMin { fail_lap }) => {
            (Some(StrategyAmountIssue::BelowMin), fail_lap)
        }
        Some(FixedProblem::AboveMax) => (Some(StrategyAmountIssue::AboveMax), None),
        Some(FixedProblem::NoRange) => (Some(StrategyAmountIssue::NoRange), None),
    };
    Some(StrategyAmountLimits::Used {
        arrival: range(bounds.arrival)?,
        range: range(bounds.service)?,
        issue,
        fail_lap,
    })
}

/// The figures of a feasible plan that a plan with fixed amounts is compared with.
fn figures(view: &StrategyPlanView) -> Option<StrategyAutomaticPlan> {
    let result = view.result.as_ref()?;
    let timeline = result.timeline.as_ref()?;
    Some(StrategyAutomaticPlan {
        total_seconds: result.metrics.as_ref()?.total_seconds.clone(),
        fuel_finish_liters: timeline.fuel_finish_liters.clone(),
        ve_finish_percent: timeline.ve_finish_percent.clone(),
    })
}

fn is_schedule(stints: &[u32], stops: impl Iterator<Item = u32>, race_laps: u32) -> bool {
    let mut total = 0_u32;
    let mut stops = stops;
    for &laps in stints {
        let Some(sum) = total.checked_add(laps).filter(|_| laps > 0) else {
            return false;
        };
        total = sum;
        // Every stint but the last ends in a stop on its last lap.
        if total != race_laps && stops.next() != Some(total) {
            return false;
        }
    }
    total == race_laps && stops.next().is_none()
}

pub(super) fn recalculate(
    input: &Input,
    edited: &EditedPlan,
    fixed: &[FixedStop],
    pilot: &str,
    cancel: &AtomicBool,
) -> Recalculation {
    let recalculation = recalculate_edited_plan_fixed(input, edited, fixed, cancel)
        .map_err(|error| edit_error(&error))?;
    let outcome = &recalculation.outcome;
    // The edited schedule is a constraint: no solution is about it. The crate's typed
    // fallback decides the reason, as in the calculation.
    let mut view = project_with(input, outcome, pilot, true, recalculation.fallback)
        .map_err(|_| StrategyEditError::Failed)?;
    // The plan carries exactly what was fixed (the crate guards it): say which
    // amounts are the person's, so that accepting the plan keeps it.
    if let Some(timeline) = view
        .result
        .as_mut()
        .and_then(|result| result.timeline.as_mut())
    {
        for (pit, fixed) in timeline.pits.iter_mut().zip(fixed) {
            pit.pinned.fuel_liters = fixed.fuel_liters.is_some();
            pit.pinned.ve_percent = fixed.ve_percent.is_some();
        }
    }
    Ok(Recalculated {
        view,
        feasible: outcome.result.feasible,
        unreachable_stop: recalculation.unreachable_stop,
    })
}

/// The crate reports these as fixed strings; anything else is a plain failure.
fn edit_error(error: &str) -> StrategyEditError {
    match error {
        "invalid_edited_stint_schedule" | "too_many_required_pit_windows" => {
            StrategyEditError::InvalidSchedule
        }
        "edited_stop_count_conflicts_with_event_rules" => StrategyEditError::EventRulesConflict,
        "solver_did_not_preserve_edited_schedule" => StrategyEditError::ScheduleNotPreserved,
        _ => StrategyEditError::Failed,
    }
}

#[cfg(test)]
#[path = "strategy_editing_tests.rs"]
mod tests;
