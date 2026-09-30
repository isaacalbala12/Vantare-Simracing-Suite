//! Deterministic scalar subspace of Go `SolveV2`. Unsupported dimensions fail closed.
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::document::{evidence, projection_confidence};
use super::projection::provenance;

const SCALE: f64 = 1_000_000.0;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scalar {
    pub value: f64,
    pub provenance: Value,
    pub confidence: Value,
    pub role: String,
}
impl Scalar {
    pub fn manual(value: f64) -> Self {
        Self {
            value,
            provenance: json!({"kind":"manual","sourceId":"native:strategy-editor"}),
            confidence: json!({"sampleSize":1,"computationVersion":"solver-input.v2"}),
            role: "user_override".into(),
        }
    }
    fn validate(&self, zero: bool) -> Result<(), String> {
        if !self.value.is_finite() || self.value < 0.0 || (!zero && self.value == 0.0) {
            return Err("invalid_input: valor escalar fuera de rango".into());
        }
        let kind = self.provenance["kind"].as_str().unwrap_or("");
        let allowed = match self.role.as_str() {
            "fallback" => ["manual", "reference"].contains(&kind),
            "user_override" => ["manual", "corrected"].contains(&kind),
            _ => false,
        };
        if !allowed {
            return Err("invalid_input: rol/procedencia escalar".into());
        }
        provenance(&self.provenance)?;
        projection_confidence(&self.confidence)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PitCost {
    pub transit_seconds: Scalar,
    pub refuel_rate_l_per_s: Scalar,
    pub ve_rate_p_per_s: Scalar,
    pub tyre_seconds: Scalar,
    pub service_mode: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Formation {
    pub seconds: Scalar,
    pub presence: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Budget {
    pub p95_millis: u64,
    pub max_candidates: usize,
    #[serde(default)]
    pub max_iterations: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Discretization {
    pub fuel_liters: f64,
    pub ve_percent: f64,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    pub min_pit_stops: Option<usize>,
    pub max_pit_stops: Option<usize>,
    #[serde(default)]
    pub required_windows: Vec<Window>,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Window {
    pub from_lap: u32,
    pub to_lap: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    pub contract_version: String,
    pub race_laps: u32,
    pub base_lap_seconds: Scalar,
    pub pit_cost: PitCost,
    pub formation: Formation,
    pub event_rules: Rules,
    pub budget: Budget,
    pub fuel_capacity_liters: Scalar,
    pub ve_capacity_percent: Scalar,
    pub tyre_life_laps: Scalar,
    pub fuel_per_lap_liters: Scalar,
    pub ve_per_lap_percent: Scalar,
    pub degradation_per_lap_seconds: Scalar,
    #[serde(rename = "serviceDiscretization")]
    pub discretization: Discretization,
    #[serde(default)]
    pub fuel_reserve: Value,
    #[serde(default)]
    pub virtual_energy_reserve: Value,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

fn populated(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Array(values) => !values.is_empty(),
        Value::Object(values) => !values.is_empty(),
        _ => true,
    }
}

impl Input {
    pub fn validate(&self) -> Result<(), String> {
        if self.contract_version != "strategy.solver.v2"
            || self.race_laps == 0
            || self.race_laps > 100_000
        {
            return Err("invalid_input: versión o raceLaps".into());
        }
        for (field, value) in &self.extra {
            if populated(value) {
                return Err(format!("unsupported_native_dimension: {field}"));
            }
        }
        for (field, value) in &self.event_rules.extra {
            if populated(value) {
                return Err(format!("unsupported_native_dimension: eventRules.{field}"));
            }
        }
        for scalar in [
            &self.base_lap_seconds,
            &self.pit_cost.refuel_rate_l_per_s,
            &self.pit_cost.ve_rate_p_per_s,
        ] {
            scalar.validate(false)?;
        }
        for scalar in [
            &self.pit_cost.transit_seconds,
            &self.pit_cost.tyre_seconds,
            &self.formation.seconds,
            &self.fuel_capacity_liters,
            &self.ve_capacity_percent,
            &self.tyre_life_laps,
            &self.fuel_per_lap_liters,
            &self.ve_per_lap_percent,
            &self.degradation_per_lap_seconds,
        ] {
            scalar.validate(true)?;
        }
        if self.ve_capacity_percent.value > 100.0
            || self.tyre_life_laps.value > 100_000.0
            || self.tyre_life_laps.value.fract() != 0.0
        {
            return Err("invalid_input: capacidad VE o vida neumático".into());
        }
        if !["parallel", "sequential"].contains(&self.pit_cost.service_mode.as_str()) {
            return Err("invalid_input: serviceMode".into());
        }
        if self.budget.p95_millis == 0 {
            return Err("invalid_input: budget.p95Millis".into());
        }
        if self.event_rules.required_windows.len() > 16 {
            return Err("invalid_input: demasiadas ventanas".into());
        }
        for window in &self.event_rules.required_windows {
            if window.from_lap == 0
                || window.from_lap > window.to_lap
                || window.to_lap >= self.race_laps
            {
                return Err("invalid_input: ventana boxes".into());
            }
        }
        if let (Some(min), Some(max)) = (
            self.event_rules.min_pit_stops,
            self.event_rules.max_pit_stops,
        ) && min > max
        {
            return Err("invalid_input: rango de paradas".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PitStop {
    pub lap: u32,
    pub fuel_liters: f64,
    pub ve_percent: f64,
    pub change_tyres: bool,
    pub service_mode: String,
}
#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub total_seconds: f64,
    pub green_seconds: f64,
    pub degradation_seconds: f64,
    pub compound_seconds: f64,
    pub fuel_weight_seconds: f64,
    pub saving_seconds: f64,
    pub weather_seconds: f64,
    pub pit_seconds: f64,
    pub formation_seconds: f64,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultV2 {
    pub feasible: bool,
    pub stints: Vec<u32>,
    pub pit_stops: Vec<PitStop>,
    pub expected: Evaluation,
    pub fuel_start_liters: f64,
    pub ve_start_percent: f64,
    pub fuel_remaining_liters: f64,
    pub ve_remaining_percent: f64,
}
#[derive(Clone)]
struct Node {
    fuel: i64,
    ve: i64,
    windows: u16,
    result: ResultV2,
}

#[derive(Clone, Copy)]
struct Resource {
    capacity: i64,
    per_lap: i64,
    step: i64,
    reserve: i64,
}
impl Resource {
    fn new(
        capacity: f64,
        per_lap: f64,
        step: f64,
        reserve: &Value,
        laps: u32,
    ) -> Result<Self, String> {
        let step = units(if step == 0.0 { 1.0 } else { step })?;
        let amount = reserve_amount(reserve, per_lap, laps)?;
        if capacity == 0.0 && per_lap == 0.0 {
            return Ok(Self {
                capacity: 0,
                per_lap: 0,
                step: 1,
                reserve: 0,
            });
        }
        let result = Self {
            capacity: units(capacity)?,
            per_lap: units(per_lap)?,
            step,
            reserve: units(amount)?,
        };
        if result.capacity <= 0 || result.per_lap <= 0 || step <= 0 || result.capacity / step > 200
        {
            return Err("invalid_input: capacidad/consumo/paso, máximo 200 niveles".into());
        }
        Ok(result)
    }
    fn max_laps(self, level: i64, remaining: u32) -> u32 {
        if self.per_lap == 0 {
            remaining
        } else {
            u32::try_from(level / self.per_lap)
                .unwrap_or(u32::MAX)
                .min(remaining)
        }
    }
    fn amounts(self, current: i64) -> impl Iterator<Item = i64> {
        (0..=(self.capacity - current) / self.step).map(move |n| n * self.step)
    }
}

#[allow(clippy::cast_possible_truncation)] // range checked before conversion; precision matches Go serviceUnits.
fn units(value: f64) -> Result<i64, String> {
    let scaled = value * SCALE;
    if !scaled.is_finite() || !(0.0..=1_000_000_000_000.0).contains(&scaled) {
        return Err("invalid_input: precisión de servicio".into());
    }
    Ok(scaled.round() as i64)
}
#[allow(clippy::cast_precision_loss)] // bounded service units, same f64 output as Go.
fn amount(value: i64) -> f64 {
    value as f64 / SCALE
}

fn reserve_amount(value: &Value, consumption: f64, laps: u32) -> Result<f64, String> {
    let kind = value["kind"].as_str().unwrap_or("");
    if kind.is_empty() {
        return Ok(0.0);
    }
    evidence(&value["selection"])?;
    let field = match kind {
        "none" => return Ok(0.0),
        "amount" => "amount",
        "laps" => "laps",
        "percent" => "percent",
        _ => return Err("invalid_input: reserve.kind".into()),
    };
    evidence(&value[field]["evidence"])?;
    let number = value[field]["value"]
        .as_f64()
        .ok_or("invalid_input: reserve.value")?;
    if !number.is_finite() || number < 0.0 || (field == "percent" && number > 100.0) {
        return Err("invalid_input: reserve.value".into());
    }
    Ok(match field {
        "laps" => number * consumption,
        "percent" => f64::from(laps) * consumption * number / 100.0,
        _ => number,
    })
}

fn compare(left: &ResultV2, right: &ResultV2) -> Ordering {
    let tolerance = left
        .expected
        .total_seconds
        .abs()
        .max(right.expected.total_seconds.abs())
        .max(1.0)
        * 1e-12;
    let delta = left.expected.total_seconds - right.expected.total_seconds;
    if delta.abs() > tolerance {
        return delta.total_cmp(&0.0);
    }
    let order = left.pit_stops.len().cmp(&right.pit_stops.len());
    if order != Ordering::Equal {
        return order;
    }
    for (l, r) in left.pit_stops.iter().zip(&right.pit_stops) {
        let order = l
            .lap
            .cmp(&r.lap)
            .then(l.fuel_liters.total_cmp(&r.fuel_liters))
            .then(l.ve_percent.total_cmp(&r.ve_percent));
        if order != Ordering::Equal {
            return order;
        }
    }
    Ordering::Equal
}

fn pit_seconds(input: &Input, fuel: i64, ve: i64) -> f64 {
    let pit = &input.pit_cost;
    let f = amount(fuel) / pit.refuel_rate_l_per_s.value;
    let v = amount(ve) / pit.ve_rate_p_per_s.value;
    let tyres = pit.tyre_seconds.value;
    pit.transit_seconds.value
        + if pit.service_mode == "parallel" {
            f.max(v).max(tyres)
        } else {
            f + v + tyres
        }
}

pub fn solve(input: &Input) -> Result<ResultV2, String> {
    solve_cancellable(input, &AtomicBool::new(false))
}

/// Bounded exact search in the supported scalar space; no result on exhaustion.
/// Caller owns cancellation. This runs off the GPUI thread.
#[allow(clippy::too_many_lines)] // Keep the bounded state-space walk in one place, rather than a search manager.
pub fn solve_cancellable(input: &Input, cancel: &AtomicBool) -> Result<ResultV2, String> {
    input.validate()?;
    let fuel = Resource::new(
        input.fuel_capacity_liters.value,
        input.fuel_per_lap_liters.value,
        input.discretization.fuel_liters,
        &input.fuel_reserve,
        input.race_laps,
    )?;
    let ve = Resource::new(
        input.ve_capacity_percent.value,
        input.ve_per_lap_percent.value,
        input.discretization.ve_percent,
        &input.virtual_energy_reserve,
        input.race_laps,
    )?;
    if let Some(result) = single_fuel_decision(input, fuel, ve, cancel)? {
        return Ok(result);
    }
    let max_work = if input.budget.max_candidates == 0 {
        250_000
    } else {
        input.budget.max_candidates.min(1_000_000)
    };
    let max_iterations = if input.budget.max_iterations == 0 {
        1_000_000
    } else {
        input.budget.max_iterations.min(1_000_000)
    };
    let started = std::time::Instant::now();
    let mut work = 0;
    let mut iterations = 0;
    let mut frontier =
        vec![HashMap::new(); usize::try_from(input.race_laps).map_err(|e| e.to_string())? + 1];
    let initial = Node {
        fuel: fuel.capacity,
        ve: ve.capacity,
        windows: 0,
        result: ResultV2::default(),
    };
    frontier[0].insert((fuel.capacity, ve.capacity, 0usize, 0u16), initial);
    let mut best: Option<ResultV2> = None;
    for lap in 0..input.race_laps {
        let nodes = std::mem::take(&mut frontier[usize::try_from(lap).map_err(|e| e.to_string())?]);
        for node in nodes.into_values() {
            let remaining = input.race_laps - lap;
            let mut limit = fuel
                .max_laps(node.fuel, remaining)
                .min(ve.max_laps(node.ve, remaining));
            if input.tyre_life_laps.value > 0.0 {
                limit = limit.min(
                    u32::try_from(units(input.tyre_life_laps.value)? / 1_000_000)
                        .map_err(|e| e.to_string())?,
                );
            }
            for count in 1..=limit {
                work += 1;
                if work > max_work || iterations > max_iterations {
                    return Err("native_budget_exhausted: no se ha demostrado el óptimo".into());
                }
                if cancel.load(AtomicOrdering::Relaxed) {
                    return Err("cancelled".into());
                }
                if started.elapsed().as_millis() > u128::from(input.budget.p95_millis) {
                    return Err("native_deadline_exceeded: no se ha demostrado el óptimo".into());
                }
                let end = lap + count;
                let mut after = node.clone();
                after.fuel -= i64::from(count) * fuel.per_lap;
                after.ve -= i64::from(count) * ve.per_lap;
                after.result.stints.push(count);
                let eval = &mut after.result.expected;
                eval.green_seconds += f64::from(count) * input.base_lap_seconds.value;
                eval.degradation_seconds += input.degradation_per_lap_seconds.value
                    * f64::from(count)
                    * f64::from(count - 1)
                    / 2.0;
                eval.formation_seconds = input.formation.seconds.value;
                eval.total_seconds = eval.green_seconds
                    + eval.degradation_seconds
                    + eval.pit_seconds
                    + eval.formation_seconds;
                if !eval.total_seconds.is_finite() {
                    return Err("overflow: tiempo total".into());
                }
                if end == input.race_laps {
                    let stops = after.result.pit_stops.len();
                    let all_windows = (1u32 << input.event_rules.required_windows.len()) - 1;
                    if after.fuel < fuel.reserve
                        || after.ve < ve.reserve
                        || u32::from(after.windows) != all_windows
                        || input.event_rules.min_pit_stops.is_some_and(|n| stops < n)
                        || input.event_rules.max_pit_stops.is_some_and(|n| stops > n)
                    {
                        continue;
                    }
                    after.result.feasible = true;
                    if best
                        .as_ref()
                        .is_none_or(|existing| compare(&after.result, existing) == Ordering::Less)
                    {
                        best = Some(after.result);
                    }
                    continue;
                }
                if input
                    .event_rules
                    .max_pit_stops
                    .is_some_and(|n| after.result.pit_stops.len() >= n)
                {
                    continue;
                }
                for (index, window) in input.event_rules.required_windows.iter().enumerate() {
                    if (window.from_lap..=window.to_lap).contains(&end) {
                        after.windows |= 1 << index;
                    }
                }
                if input
                    .event_rules
                    .required_windows
                    .iter()
                    .enumerate()
                    .any(|(index, w)| end > w.to_lap && after.windows & (1 << index) == 0)
                {
                    continue;
                }
                for f in fuel.amounts(after.fuel) {
                    for v in ve.amounts(after.ve) {
                        work += 1;
                        if work > max_work {
                            return Err(
                                "native_budget_exhausted: no se ha demostrado el óptimo".into()
                            );
                        }
                        if work % 256 == 0 {
                            if cancel.load(AtomicOrdering::Relaxed) {
                                return Err("cancelled".into());
                            }
                            if started.elapsed().as_millis() > u128::from(input.budget.p95_millis) {
                                return Err(
                                    "native_deadline_exceeded: no se ha demostrado el óptimo"
                                        .into(),
                                );
                            }
                        }
                        let mut next = after.clone();
                        next.fuel += f;
                        next.ve += v;
                        next.result.pit_stops.push(PitStop {
                            lap: end,
                            fuel_liters: amount(f),
                            ve_percent: amount(v),
                            change_tyres: true,
                            service_mode: input.pit_cost.service_mode.clone(),
                        });
                        next.result.expected.pit_seconds += pit_seconds(input, f, v);
                        next.result.expected.total_seconds += pit_seconds(input, f, v);
                        let key = (
                            next.fuel,
                            next.ve,
                            next.result.pit_stops.len(),
                            next.windows,
                        );
                        let target =
                            &mut frontier[usize::try_from(end).map_err(|e| e.to_string())?];
                        iterations += 1;
                        if target.get(&key).is_none_or(|existing| {
                            compare(&next.result, &existing.result) == Ordering::Less
                        }) {
                            target.insert(key, next);
                        }
                    }
                }
            }
        }
    }
    let mut result = best.unwrap_or_default();
    if result.feasible {
        let (start, remaining) = resource_balance(&result, fuel, true)?;
        result.fuel_start_liters = amount(start);
        result.fuel_remaining_liters = amount(remaining);
        let (start, remaining) = resource_balance(&result, ve, false)?;
        result.ve_start_percent = amount(start);
        result.ve_remaining_percent = amount(remaining);
    }
    Ok(result)
}

fn resource_balance(
    result: &ResultV2,
    resource: Resource,
    fuel: bool,
) -> Result<(i64, i64), String> {
    let mut used = 0;
    let mut serviced = 0;
    let mut minimum_start = 0;
    for (index, count) in result.stints.iter().enumerate() {
        used += i64::from(*count) * resource.per_lap;
        minimum_start = minimum_start.max(used - serviced);
        if let Some(pit) = result.pit_stops.get(index) {
            serviced += units(if fuel {
                pit.fuel_liters
            } else {
                pit.ve_percent
            })?;
        }
    }
    minimum_start = minimum_start.max(used + resource.reserve - serviced);
    Ok((minimum_start, minimum_start + serviced - used))
}

// Exact Go simpleSingleFuelDecision fast path, not a heuristic: opening another
// stint costs more transit than the maximum service it could avoid.
fn single_fuel_decision(
    input: &Input,
    fuel: Resource,
    ve: Resource,
    cancel: &AtomicBool,
) -> Result<Option<ResultV2>, String> {
    if fuel.capacity == 0
        || ve.capacity != 0
        || input.degradation_per_lap_seconds.value != 0.0
        || input.pit_cost.tyre_seconds.value != 0.0
        || input.event_rules.min_pit_stops.is_some()
        || input.event_rules.max_pit_stops.is_some()
        || !input.event_rules.required_windows.is_empty()
        || input.pit_cost.transit_seconds.value
            <= input.fuel_capacity_liters.value / input.pit_cost.refuel_rate_l_per_s.value
    {
        return Ok(None);
    }
    let mut maximum = fuel.capacity / fuel.per_lap;
    if input.tyre_life_laps.value > 0.0 {
        maximum = maximum.min(units(input.tyre_life_laps.value)? / 1_000_000);
    }
    let final_maximum = maximum.min((fuel.capacity - fuel.reserve) / fuel.per_lap);
    if maximum < 1 || final_maximum < 1 || fuel.reserve > fuel.capacity {
        return Ok(Some(ResultV2::default()));
    }
    let race = i64::from(input.race_laps);
    let stint_count = if race <= final_maximum {
        1
    } else {
        1 + (race - final_maximum + maximum - 1) / maximum
    };
    if stint_count > race {
        return Ok(Some(ResultV2::default()));
    }
    let mut remaining = race;
    let mut level = (race * fuel.per_lap + fuel.reserve).min(fuel.capacity);
    let mut result = ResultV2 {
        feasible: true,
        ..ResultV2::default()
    };
    let mut lap = 0u32;
    let started = std::time::Instant::now();
    for index in 0..stint_count {
        if cancel.load(AtomicOrdering::Relaxed) {
            return Err("cancelled".into());
        }
        if started.elapsed().as_millis() > u128::from(input.budget.p95_millis) {
            return Err("native_deadline_exceeded: no se ha demostrado el óptimo".into());
        }
        let after = stint_count - index - 1;
        let maximum_after = if after > 0 {
            final_maximum + (after - 1) * maximum
        } else {
            0
        };
        let count = (remaining - maximum_after).max(1);
        if count > if after == 0 { final_maximum } else { maximum } {
            return Ok(None);
        }
        let count = u32::try_from(count).map_err(|e| e.to_string())?;
        result.stints.push(count);
        level -= i64::from(count) * fuel.per_lap;
        remaining -= i64::from(count);
        lap += count;
        if after == 0 {
            continue;
        }
        let following_after = after - 1;
        let following_maximum = if following_after > 0 {
            final_maximum + (following_after - 1) * maximum
        } else {
            0
        };
        let next_count = (remaining - following_maximum).max(1);
        let required = next_count * fuel.per_lap + if after == 1 { fuel.reserve } else { 0 };
        let raw = (required - level).max(0);
        let quantity = (raw + fuel.step - 1) / fuel.step * fuel.step;
        if quantity > fuel.capacity - level {
            return Ok(None);
        }
        level += quantity;
        result.pit_stops.push(PitStop {
            lap,
            fuel_liters: amount(quantity),
            ve_percent: 0.0,
            change_tyres: true,
            service_mode: input.pit_cost.service_mode.clone(),
        });
        result.expected.pit_seconds += pit_seconds(input, quantity, 0);
    }
    result.expected.green_seconds = f64::from(input.race_laps) * input.base_lap_seconds.value;
    result.expected.formation_seconds = input.formation.seconds.value;
    result.expected.total_seconds = result.expected.green_seconds
        + result.expected.pit_seconds
        + result.expected.formation_seconds;
    if !result.expected.total_seconds.is_finite() {
        return Err("overflow: tiempo total".into());
    }
    let (start, remaining) = resource_balance(&result, fuel, true)?;
    result.fuel_start_liters = amount(start);
    result.fuel_remaining_liters = amount(remaining);
    Ok(Some(result))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compare_fields(actual: &Value, expected: &Value, path: &str) {
        match (actual, expected) {
            (Value::Object(a), Value::Object(b)) => {
                assert_eq!(a.len(), b.len(), "{path}");
                for (key, value) in b {
                    compare_fields(&a[key], value, &format!("{path}/{key}"));
                }
            }
            (Value::Array(a), Value::Array(b)) => {
                assert_eq!(a.len(), b.len(), "{path}");
                for (index, (l, r)) in a.iter().zip(b).enumerate() {
                    compare_fields(l, r, &format!("{path}/{index}"));
                }
            }
            (Value::Number(a), Value::Number(b)) => {
                let l = a.as_f64().expect("number");
                let r = b.as_f64().expect("number");
                assert!(
                    (l - r).abs() <= l.abs().max(r.abs()).max(1.0) * 1e-10,
                    "{path}: {l} != {r}"
                );
            }
            _ => assert_eq!(actual, expected, "{path}"),
        }
    }

    #[test]
    fn frozen_go_scalar_solver_parity() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../testdata/oracle/solver.json"))
                .expect("Go fixtures");
        assert!(cases.len() >= 36);
        for case in cases {
            let input: Input = serde_json::from_value(case["input"].clone()).expect("input shape");
            let result = solve(&input);
            if case.get("error").is_some() {
                assert!(result.is_err(), "{}", case["name"]);
            } else {
                compare_fields(
                    &serde_json::to_value(result.expect("native solve")).expect("result"),
                    &case["parity"],
                    case["name"].as_str().expect("name"),
                );
            }
        }
    }

    #[test]
    fn unsupported_forecast_and_cancel_do_not_emit_plans() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../testdata/oracle/solver.json"))
                .expect("Go fixtures");
        let mut input: Input = serde_json::from_value(cases[0]["input"].clone()).expect("input");
        input
            .extra
            .insert("weather".into(), json!({"scenarioId":"not-ported"}));
        assert!(
            solve(&input)
                .expect_err("unsupported")
                .contains("unsupported_native_dimension")
        );
        input.extra.clear();
        assert_eq!(
            solve_cancellable(&input, &AtomicBool::new(true)).expect_err("cancel"),
            "cancelled"
        );
        input.budget.max_candidates = 1;
        assert!(
            solve(&input)
                .expect_err("bounded")
                .contains("budget_exhausted")
        );
    }
}
