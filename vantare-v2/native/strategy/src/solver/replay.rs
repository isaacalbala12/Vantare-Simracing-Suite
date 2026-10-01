use super::model::{Model, require};
use super::{
    DecisionResourceRequirements, DecisionVector, Evaluation, Input, Ordering, ReserveStatus,
    ResourceRequirement, ResourceReserveStatus, Serialize, StintDecision, Value, amount, json,
    populated, reserve_amount, units,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayStint {
    pub index: usize,
    pub laps: u32,
    pub evaluation: Evaluation,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayResult {
    pub contract_version: &'static str,
    pub final_lap_start_seconds: f64,
    pub decision: DecisionVector,
    pub evaluation: Evaluation,
    pub stints: Vec<ReplayStint>,
    pub reserve: ReserveStatus,
    pub feasible: bool,
    pub reasons: Vec<SolverReason>,
}
#[derive(Clone, Debug, Serialize)]
pub struct SolverReason {
    pub code: String,
    pub message: String,
}

fn validate_shape(input: &Input, d: &DecisionVector) -> Result<(), String> {
    require(
        !d.stints.is_empty() && d.pit_stops.len() + 1 == d.stints.len(),
        "stints must equal pits + 1",
    )?;
    let mut lap = 0u32;
    for (i, stint) in d.stints.iter().enumerate() {
        require(stint.laps > 0, "stint.laps")?;
        lap = lap
            .checked_add(stint.laps)
            .ok_or("invalid_input: laps overflow")?;
        if let Some(pit) = d.pit_stops.get(i) {
            require(
                pit.lap == lap,
                "pit lap must equal preceding stint boundary",
            )?;
            units(pit.fuel_liters)?;
            units(pit.ve_percent)?;
        }
    }
    let timed = input
        .extra
        .get("raceDurationSeconds")
        .is_some_and(populated);
    require(
        if timed {
            lap <= input.race_laps
        } else {
            lap == input.race_laps
        },
        "stint laps do not match horizon",
    )
}

pub fn resource_requirements_v2(
    input: &Input,
    decision: &DecisionVector,
) -> Result<DecisionResourceRequirements, String> {
    let model = Model::new(input)?;
    validate_shape(input, decision)?;
    requirements(&model, decision)
}

pub(super) fn requirements(
    model: &Model,
    decision: &DecisionVector,
) -> Result<DecisionResourceRequirements, String> {
    let mut result = DecisionResourceRequirements::default();
    let (mut used_f, mut used_v, mut service_f, mut service_v, mut min_f, mut min_v) =
        (0i64, 0i64, 0i64, 0i64, 0i64, 0i64);
    let mut lap = 0;
    for (i, stint) in decision.stints.iter().enumerate() {
        let level = model.level(&stint.saving_level)?;
        let (f, v) = model.usage(lap + 1, stint.laps, &stint.driver, level)?;
        result.stints.push(ResourceRequirement {
            fuel_liters: amount(f),
            ve_percent: amount(v),
        });
        used_f += f;
        used_v += v;
        min_f = min_f.max(used_f - service_f);
        min_v = min_v.max(used_v - service_v);
        lap += stint.laps;
        if let Some(pit) = decision.pit_stops.get(i) {
            service_f += units(pit.fuel_liters)?;
            service_v += units(pit.ve_percent)?;
        }
    }
    let last = decision
        .stints
        .last()
        .ok_or("invalid_input: missing stint")?;
    let (terminal_f, terminal_v) =
        model.usage(lap, 1, &last.driver, model.level(&last.saving_level)?)?;
    let f = required_reserve(&model.input.fuel_reserve, terminal_f, used_f, lap)?;
    let v = required_reserve(&model.input.virtual_energy_reserve, terminal_v, used_v, lap)?;
    result.finish = ResourceRequirement {
        fuel_liters: amount(f),
        ve_percent: amount(v),
    };
    min_f = min_f.max(used_f + f - service_f).min(model.fuel.capacity);
    min_v = min_v.max(used_v + v - service_v).min(model.ve.capacity);
    result.initial = ResourceRequirement {
        fuel_liters: model
            .dims
            .initial_fuel_liters
            .as_ref()
            .map_or(amount(min_f), |s| s.value),
        ve_percent: model
            .dims
            .initial_ve_percent
            .as_ref()
            .map_or(amount(min_v), |s| s.value),
    };
    Ok(result)
}
fn required_reserve(value: &Value, terminal: i64, used: i64, laps: u32) -> Result<i64, String> {
    let consumption = if value["kind"] == "percent" {
        amount(used) / f64::from(laps)
    } else {
        amount(terminal)
    };
    units(reserve_amount(value, consumption, laps)?)
}

fn resource_status(
    value: &Value,
    name: &str,
    capacity: i64,
    remaining: i64,
    terminal: i64,
    used: i64,
    laps: u32,
) -> Result<ResourceReserveStatus, String> {
    let kind = value["kind"].as_str().unwrap_or("");
    let active = capacity > 0 && !kind.is_empty() && kind != "none";
    let required = if active {
        required_reserve(value, terminal, used, laps)?
    } else {
        0
    };
    let evidence = if kind == "laps" {
        value["laps"]["evidence"].clone()
    } else {
        value["selection"].clone()
    };
    Ok(ResourceReserveStatus {
        resource: name.into(),
        configured: !kind.is_empty(),
        active,
        kind: kind.into(),
        requested_laps: if kind == "laps" {
            value["laps"]["value"].as_f64().unwrap_or(0.0)
        } else {
            0.0
        },
        required_amount: amount(required),
        remaining_amount: amount(remaining),
        effective_laps: if active && terminal > 0 {
            amount(remaining) / amount(terminal)
        } else {
            0.0
        },
        effective_laps_available: active && terminal > 0,
        satisfied: !active || remaining >= required,
        evidence: if evidence.is_null() {
            json!({"provenance":{"kind":"","sourceId":""},"confidence":{"level":"","basis":""}})
        } else {
            evidence
        },
    })
}
pub(super) fn reserve_status(
    model: &Model,
    d: &DecisionVector,
    f: i64,
    v: i64,
) -> Result<ReserveStatus, String> {
    let laps: u32 = d.stints.iter().map(|s| s.laps).sum();
    let last = d.stints.last().ok_or("invalid_input: missing stint")?;
    let (terminal_f, terminal_v) =
        model.usage(laps, 1, &last.driver, model.level(&last.saving_level)?)?;
    let req = requirements(model, d)?;
    let used_f = units(req.stints.iter().map(|s| s.fuel_liters).sum())?;
    let used_v = units(req.stints.iter().map(|s| s.ve_percent).sum())?;
    let fuel = resource_status(
        &model.input.fuel_reserve,
        "fuel",
        model.fuel.capacity,
        f,
        terminal_f,
        used_f,
        laps,
    )?;
    let virtual_energy = resource_status(
        &model.input.virtual_energy_reserve,
        "virtual_energy",
        model.ve.capacity,
        v,
        terminal_v,
        used_v,
        laps,
    )?;
    let mut status = ReserveStatus {
        satisfied: fuel.satisfied && virtual_energy.satisfied,
        fuel,
        virtual_energy,
        ..ReserveStatus::default()
    };
    for resource in [&status.fuel, &status.virtual_energy] {
        if resource.active
            && resource.effective_laps_available
            && (status.limiting_resource.is_empty()
                || resource.effective_laps < status.effective_laps)
        {
            status.effective_laps = resource.effective_laps;
            status.limiting_resource.clone_from(&resource.resource);
        }
    }
    Ok(status)
}

/// Re-evaluates exact edited services and stint choices. Never optimizes edits.
pub fn replay_decision_v2(
    input: &Input,
    decision: &DecisionVector,
) -> Result<ReplayResult, String> {
    replay(input, decision, None, true)
}
/// Uses the editor's exact initial load, without increasing it to repair a plan.
pub fn replay_decision_v2_with_resources(
    input: &Input,
    decision: &DecisionVector,
    fuel: f64,
    ve: f64,
) -> Result<ReplayResult, String> {
    replay(input, decision, Some((fuel, ve)), true)
}
#[allow(clippy::too_many_lines, clippy::float_cmp)] // Fixed-plan walk; exact configured loads match Go.
pub(super) fn replay(
    input: &Input,
    decision: &DecisionVector,
    initial: Option<(f64, f64)>,
    complete: bool,
) -> Result<ReplayResult, String> {
    let model = Model::new(input)?;
    validate_shape(input, decision)?;
    replay_model(&model, decision, initial, complete)
}

#[allow(clippy::too_many_lines, clippy::float_cmp)] // Shared fixed-plan walk with an already validated immutable model.
pub(super) fn replay_model(
    model: &Model,
    decision: &DecisionVector,
    initial: Option<(f64, f64)>,
    complete: bool,
) -> Result<ReplayResult, String> {
    let req = requirements(model, decision)?;
    let (fuel, ve) = initial.unwrap_or((req.initial.fuel_liters, req.initial.ve_percent));
    require(
        model
            .dims
            .initial_fuel_liters
            .as_ref()
            .is_none_or(|s| s.value == fuel),
        "explicit fuel differs from configured load",
    )?;
    require(
        model
            .dims
            .initial_ve_percent
            .as_ref()
            .is_none_or(|s| s.value == ve),
        "explicit VE differs from configured load",
    )?;
    let (mut f, mut v) = (units(fuel)?, units(ve)?);
    require(
        f <= model.fuel.capacity && v <= model.ve.capacity,
        "initial load exceeds capacity",
    )?;
    let mut result = ReplayResult {
        contract_version: "strategy.solver.replay.v1",
        final_lap_start_seconds: 0.0,
        decision: DecisionVector::default(),
        evaluation: Evaluation {
            formation_seconds: model.input.formation.seconds.value,
            ..Evaluation::default()
        },
        stints: vec![],
        reserve: ReserveStatus::default(),
        feasible: false,
        reasons: vec![],
    };
    result.evaluation.total();
    let mut lap = 0;
    let mut tyre_age = 0;
    let first = &decision.stints[0];
    let Some(mut tyre) =
        model
            .tyres
            .resolve(&first.compound, first.tyre_fitment.as_ref(), None, true)
    else {
        return Ok(failed(result, decision, "tyre_inventory_insufficient"));
    };
    let mut driver_state = super::drivers::DriverState::default();
    let mut tyre_usage = std::collections::BTreeMap::new();
    for (index, requested) in decision.stints.iter().enumerate() {
        let driver = model.driver(&requested.driver)?;
        if !model.sequence_allows(index, &driver.id) {
            return Ok(failed(result, decision, "driver_sequence"));
        }
        let level = model.level(&requested.saving_level)?;
        if !model
            .weather
            .allowed(&tyre.compound, lap + 1, requested.laps)
        {
            return Ok(failed(result, decision, "compound_not_allowed_for_climate"));
        }
        let (used_f, used_v) = model.usage(lap + 1, requested.laps, &requested.driver, level)?;
        if used_f > f
            || used_v > v
            || (model.input.tyre_life_laps.value > 0.0
                && f64::from(super::tyres::age(&tyre, &tyre_usage, tyre_age) + requested.laps)
                    > model.input.tyre_life_laps.value)
        {
            return Ok(failed(result, decision, "resource_exhausted"));
        }
        let mut eval = model.stint(
            lap + 1,
            requested.laps,
            f,
            &requested.driver,
            level,
            &tyre.compound,
        )?;
        if index + 1 == decision.stints.len() {
            result.final_lap_start_seconds = result.evaluation.total_seconds;
            if requested.laps > 1 {
                result.final_lap_start_seconds += model
                    .stint(
                        lap + 1,
                        requested.laps - 1,
                        f,
                        &requested.driver,
                        level,
                        &tyre.compound,
                    )?
                    .total_seconds;
            }
        }
        let before = result.evaluation.clone();
        result.evaluation.add(&eval);
        if let Some(code) = model.apply_driver(
            &mut driver_state,
            &driver.id,
            lap + 1,
            requested.laps,
            &before,
            &result.evaluation,
        ) {
            return Ok(failed(result, decision, code));
        }
        if index == 0 {
            eval.formation_seconds = model.input.formation.seconds.value;
            eval.total();
        }
        result.stints.push(ReplayStint {
            index,
            laps: requested.laps,
            evaluation: eval,
        });
        result.decision.stints.push(StintDecision {
            index,
            laps: requested.laps,
            driver: driver.id.clone(),
            compound: tyre.compound.clone(),
            tyre_fitment: tyre.fitment.clone(),
            saving_level: level.level.clone(),
            fuel_saved_per_lap: level.fuel_saved_per_lap,
            ve_saved_per_lap: level.ve_saved_per_lap,
            time_cost_per_lap: level.time_cost_per_lap,
            saving_cost_seconds: level.time_cost_per_lap * f64::from(requested.laps),
        });
        if let Some(pit) = result.decision.pit_stops.last_mut() {
            pit.driver.clone_from(&driver.id);
            pit.saving_level.clone_from(&level.level);
        }
        f -= used_f;
        v -= used_v;
        lap += requested.laps;
        tyre_age += requested.laps;
        super::tyres::use_fitment(&tyre, &mut tyre_usage, requested.laps);
        if let Some(requested_pit) = decision.pit_stops.get(index) {
            let pf = units(requested_pit.fuel_liters)?;
            let pv = units(requested_pit.ve_percent)?;
            require(
                pf <= model.fuel.capacity - f && pv <= model.ve.capacity - v,
                "pit service exceeds capacity",
            )?;
            let following = &decision.stints[index + 1];
            let Some(next_tyre) = model.tyres.resolve(
                &following.compound,
                following.tyre_fitment.as_ref(),
                Some(&tyre),
                requested_pit.change_tyres,
            ) else {
                return Ok(failed(result, decision, "tyre_choice_invalid"));
            };
            let mut pit_request = requested_pit.clone();
            pit_request.compound.clone_from(&next_tyre.compound);
            pit_request.tyre_fitment.clone_from(&next_tyre.fitment);
            let (pit, seconds) = model.pit(&pit_request);
            tyre = next_tyre;
            result.decision.pit_stops.push(pit);
            result.evaluation.pit_seconds += seconds;
            result.evaluation.total();
            let stint_eval = &mut result.stints[index].evaluation;
            stint_eval.pit_seconds += seconds;
            stint_eval.total();
            f += pf;
            v += pv;
            if requested_pit.change_tyres {
                tyre_age = 0;
            }
        }
    }
    result.reserve = reserve_status(model, &result.decision, f, v)?;
    if complete {
        if !result.reserve.satisfied {
            return Ok(failed(result, decision, "reserve_not_met"));
        }
        if let Some(reason) = completed_reason(model, &result.decision) {
            return Ok(failed(result, decision, &reason));
        }
        if let Some(duration) = model.dims.race_duration_seconds
            && (time_cmp(result.final_lap_start_seconds, duration) != Ordering::Less
                || time_cmp(result.evaluation.total_seconds, duration) == Ordering::Less)
        {
            return Ok(failed(result, decision, "timed_horizon"));
        }
    }
    result.feasible = true;
    Ok(result)
}
pub(super) fn completed_reason(model: &Model, d: &DecisionVector) -> Option<String> {
    let rules = &model.input.event_rules;
    if !model.dims.driver_sequence.is_empty()
        && (d.stints.len() < model.dims.driver_sequence.len()
            || d.stints
                .iter()
                .enumerate()
                .any(|(i, s)| !model.sequence_allows(i, &s.driver)))
    {
        return Some("driver_sequence".into());
    }
    for (id, limit) in &model.rules.driver_limits {
        let laps: u32 = d
            .stints
            .iter()
            .filter(|s| &s.driver == id)
            .map(|s| s.laps)
            .sum();
        if limit.min_laps.is_some_and(|n| laps < n) {
            return Some("driver_minimum_laps".into());
        }
    }
    if rules.min_pit_stops.is_some_and(|n| d.pit_stops.len() < n) {
        return Some("minimum_pit_stops".into());
    }
    if rules.max_pit_stops.is_some_and(|n| d.pit_stops.len() > n) {
        return Some("maximum_pit_stops".into());
    }
    if rules.required_windows.iter().any(|w| {
        !d.pit_stops
            .iter()
            .any(|p| p.lap >= w.from_lap && p.lap <= w.to_lap)
    }) {
        return Some("required_pit_window".into());
    }
    if model
        .rules
        .mandatory_compounds
        .iter()
        .any(|c| !d.stints.iter().any(|s| &s.compound == c))
    {
        return Some("mandatory_compound".into());
    }
    None
}
fn failed(mut result: ReplayResult, decision: &DecisionVector, code: &str) -> ReplayResult {
    result.decision = decision.clone();
    result.stints.clear();
    result.reasons.push(SolverReason {
        code: code.into(),
        message: code.into(),
    });
    result
}
pub(super) fn time_cmp(l: f64, r: f64) -> Ordering {
    if (l - r).abs() <= l.abs().max(r.abs()).max(1.0) * 1e-12 {
        Ordering::Equal
    } else {
        l.total_cmp(&r)
    }
}
