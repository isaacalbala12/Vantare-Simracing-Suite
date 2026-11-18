//! One cancellable scalar calculation per host session.
use super::{StrategyFields, valid_text};
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
    application::{self, ManualEvent, SourceStatus},
    document::Document,
    solver::{self, Input, OptimalityStatus, SolverOutcome},
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
        let mut manual = self.fields.manual()?;
        for (entry, target) in [
            (
                &self.inputs.base_pace_seconds,
                &mut manual.base_pace_seconds,
            ),
            (
                &self.inputs.fuel_per_lap_liters,
                &mut manual.fuel_per_lap_liters,
            ),
            (&self.inputs.race_laps, &mut manual.race_laps),
            (
                &self.inputs.ve_capacity_percent,
                &mut manual.ve_capacity_percent,
            ),
            (
                &self.inputs.ve_per_lap_percent,
                &mut manual.ve_per_lap_percent,
            ),
            (&self.inputs.tyre_life_laps, &mut manual.tyre_life_laps),
            (
                &self.inputs.degradation_seconds,
                &mut manual.degradation_seconds,
            ),
            (&self.inputs.refuel_rate, &mut manual.refuel_rate),
            (&self.inputs.ve_rate, &mut manual.ve_rate),
            (
                &self.inputs.tyre_service_seconds,
                &mut manual.tyre_service_seconds,
            ),
            (
                &self.inputs.formation_seconds,
                &mut manual.formation_seconds,
            ),
            (&self.inputs.fuel_step, &mut manual.fuel_step),
            (&self.inputs.ve_step, &mut manual.ve_step),
            (&self.inputs.reserve_laps, &mut manual.reserve_laps),
            (&self.inputs.service_mode, &mut manual.service_mode),
        ] {
            if !valid_text(entry) {
                return Err(HostError::StrategyInvalidText);
            }
            target.clone_from(entry);
        }
        Ok(manual)
    }
}

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
    pub result: Option<Box<StrategyCalculationView>>,
    pub error: Option<StrategyPlanError>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrategyCalculationView {
    pub certificate: Option<StrategyCertificate>,
    pub steps: StrategyServiceSteps,
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
}

pub const STRATEGY_PIT_LIMIT: usize = 16;
type Work = Result<(Document, StrategyPlanView), StrategyPlanError>;

#[derive(Default)]
pub(super) struct Calculation {
    generation: u64,
    worker: Option<Worker>,
    view: StrategyPlanView,
}

struct Worker {
    generation: u64,
    cancel: Arc<AtomicBool>,
    thread: JoinHandle<Work>,
}

impl Calculation {
    pub(super) fn running(&self) -> bool {
        self.worker.is_some()
    }

    pub(super) fn view(&self) -> &StrategyPlanView {
        &self.view
    }

    pub(super) fn invalidate(&mut self, edited: bool) {
        self.generation = self.generation.wrapping_add(1);
        if let Some(worker) = &self.worker {
            worker.cancel.store(true, Ordering::Relaxed);
        }
        self.view = StrategyPlanView {
            state: if edited && self.view.state != StrategyPlanState::Uncalculated {
                StrategyPlanState::PendingChanges
            } else {
                StrategyPlanState::Uncalculated
            },
            ..StrategyPlanView::default()
        };
    }

    pub(super) fn start(
        &mut self,
        run: impl FnOnce(&AtomicBool) -> Work + Send + 'static,
    ) -> Result<(), HostError> {
        if self.running() {
            return Err(HostError::Busy);
        }
        let cancel = Arc::new(AtomicBool::new(false));
        let signal = cancel.clone();
        let thread = thread::Builder::new()
            .name("host-strategy".into())
            .spawn(move || run(&signal))
            .map_err(|_| HostError::Io)?;
        self.worker = Some(Worker {
            generation: self.generation,
            cancel,
            thread,
        });
        self.view = StrategyPlanView {
            state: StrategyPlanState::Calculating,
            ..StrategyPlanView::default()
        };
        Ok(())
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
        let result = worker.thread.join();
        if self.generation != worker.generation {
            return None;
        }
        match result.unwrap_or(Err(StrategyPlanError::Failed)) {
            Ok((document, view)) => {
                self.view = view;
                Some(document)
            }
            Err(error) => {
                self.view = StrategyPlanView {
                    state: StrategyPlanState::Error,
                    result: None,
                    error: Some(error),
                };
                None
            }
        }
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
    let invalid = |_| StrategyPlanError::InvalidInput;
    let input = manual
        .prepare(&mut document, event, variant)
        .map_err(invalid)?;
    let input = application::prepare_manual(input).map_err(invalid)?;
    super::validate_projection(&document, HostError::StrategyInvalidText)
        .map_err(|_| StrategyPlanError::InvalidInput)?;
    let outcome = application::calculate(&input, SourceStatus::Open, cancel)
        .map_err(|_| StrategyPlanError::Failed)?;
    let view = project(input.input(), &outcome, manual.driver_name.trim())?;
    Ok((document, view))
}

fn number(value: f64) -> Result<Number, StrategyPlanError> {
    Number::from_f64(value).ok_or(StrategyPlanError::Failed)
}

fn project(
    input: &Input,
    outcome: &SolverOutcome,
    pilot: &str,
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
            metrics,
            timeline,
        })),
        error: None,
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
