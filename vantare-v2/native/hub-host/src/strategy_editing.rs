//! Editing of the calculated plan in memory: move a stint boundary or a pit stop,
//! recalculate with the edited schedule as a constraint, or reset to the last
//! feasible plan. The document is never touched: the schedule lives only here.
use super::calculation::{
    STRATEGY_PIT_LIMIT, StrategyPlanState, StrategyPlanView, StrategyStint, project,
};
use crate::protocol::HostError;
use serde::{Deserialize, Serialize};
use serde_json::Number;
use std::sync::atomic::AtomicBool;
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_strategy::{
    application::{EditedPlan, recalculate_edited_plan},
    solver::{Input, SolverOutcome},
};

/// The editable schedule of a feasible plan. Fuel and VE of each stop come from
/// the plan it started from: the solver decides the amounts, they are not edited.
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
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub fuel_liters: Number,
    #[cfg_attr(any(test, feature = "bindings"), ts(type = "number"))]
    pub ve_percent: Number,
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
            // A plan that does not cover the input's laps (a timed race) cannot be
            // constrained: the crate would reject every edited schedule of it.
            || result.stints.iter().sum::<u32>() != input.race_laps
        {
            return None;
        }
        let schedule = EditedPlan {
            stints: result.stints.clone(),
            pit_stop_laps: result.pit_stops.iter().map(|stop| stop.lap).collect(),
        };
        Some(Self {
            input: input.clone(),
            pilot: pilot.into(),
            base: view.clone(),
            base_schedule: schedule.clone(),
            shown: view.clone(),
            edited: schedule,
            pending: false,
            error: None,
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
        let stops = self
            .edited
            .pit_stop_laps
            .iter()
            .enumerate()
            .filter_map(|(index, &lap)| {
                let (min_lap, max_lap) = self.range(index)?;
                let pit = pits.get(index)?;
                Some(StrategyEditStop {
                    lap,
                    min_lap,
                    max_lap,
                    fuel_liters: pit.fuel_liters.clone(),
                    ve_percent: pit.ve_percent.clone(),
                })
            })
            .collect();
        StrategyEditView {
            stints,
            stops,
            can_reset: self.pending || self.shown != self.base,
            error: self.error,
        }
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
        self.pending = true;
        self.error = None;
        Ok(())
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

    pub(super) fn reset(&mut self) {
        self.edited = self.base_schedule.clone();
        self.shown = self.base.clone();
        self.pending = false;
        self.error = None;
    }

    /// The closure the worker runs: the edited schedule as a constraint.
    pub(super) fn job(&self) -> impl FnOnce(&AtomicBool) -> Recalculation + Send + 'static + use<> {
        let input = self.input.clone();
        let edited = self.edited.clone();
        let pilot = self.pilot.clone();
        move |cancel| recalculate(&input, &edited, &pilot, cancel)
    }

    pub(super) fn apply(&mut self, done: Recalculation) {
        match done {
            Ok(recalculated) => {
                if recalculated.feasible {
                    self.base = recalculated.view.clone();
                    self.base_schedule = self.edited.clone();
                }
                self.shown = recalculated.view;
                self.pending = false;
                self.error = None;
            }
            Err(error) => self.error = Some(error),
        }
    }
}

pub(super) fn recalculate(
    input: &Input,
    edited: &EditedPlan,
    pilot: &str,
    cancel: &AtomicBool,
) -> Recalculation {
    let outcome = recalculate_edited_plan(input, edited, cancel).map_err(|error| edit_error(&error))?;
    let view = project(input, &outcome, pilot).map_err(|_| StrategyEditError::Failed)?;
    Ok(Recalculated {
        view,
        feasible: outcome.result.feasible,
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
