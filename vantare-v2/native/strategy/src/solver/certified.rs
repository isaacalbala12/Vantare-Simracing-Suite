//! Go's bounded combined-curve path optimizes adverse-feasible plans when
//! consumption/life uncertainty is active. Keep that explicit policy confined
//! to the same eligibility and multi-pit lower-bound proof as the Go oracle.
use super::model::Model;
use super::replay::{ReplayResult, replay_model, time_cmp};
use super::{DecisionVector, Ordering, PitDecision, StintDecision, amount, reserve_amount, units};

pub(super) fn one_pit(
    m: &Model,
    worst: &Model,
    cost: &Model,
    risk: bool,
) -> Result<Option<Vec<ReplayResult>>, String> {
    let n = m.input.race_laps;
    let rules = &m.input.event_rules;
    if !(2..=64).contains(&n)
        || m.dims.race_duration_seconds.is_some()
        || m.dims.initial_fuel_liters.is_some()
        || m.dims.initial_ve_percent.is_some()
        || m.pace_points.is_empty()
        || m.tyres.enabled()
        || !m.dims.compound_pace.is_empty()
        || m.fuel_weight != 0.0
        || m.dims.weather.is_some()
        || m.fuel.per_lap <= 0
        || m.ve.per_lap <= 0
        || m.drivers.len() != 1
        || m.levels.len() != 1
        || !m.dims.driver_sequence.is_empty()
        || rules.min_pit_stops.is_some()
        || rules.max_pit_stops.is_some()
        || !rules.required_windows.is_empty()
        || !m.rules.mandatory_compounds.is_empty()
        || !m.rules.driver_limits.is_empty()
        || !m.rules.allowed_compounds_by_climate.is_empty()
    {
        return Ok(None);
    }
    let driver = &m.drivers[0];
    if driver.fuel != m.fuel.per_lap || driver.ve != m.ve.per_lap {
        return Ok(None);
    }
    let required = |resource: super::Resource, spec: &serde_json::Value| -> Result<i64, String> {
        let reserve = units(reserve_amount(spec, amount(resource.per_lap), n)?)?;
        Ok((i64::from(n) * resource.per_lap + reserve - resource.capacity).max(0))
    };
    let f = required(m.fuel, &m.input.fuel_reserve)?
        .max(required(worst.fuel, &worst.input.fuel_reserve)?);
    let v = required(m.ve, &m.input.virtual_energy_reserve)?
        .max(required(worst.ve, &worst.input.virtual_energy_reserve)?);
    let f = ((f + m.fuel.step - 1) / m.fuel.step) * m.fuel.step;
    let v = ((v + m.ve.step - 1) / m.ve.step) * m.ve.step;
    if f > m.fuel.capacity.min(worst.fuel.capacity) || v > m.ve.capacity.min(worst.ve.capacity) {
        return Ok(None);
    }
    let stint = |index, laps| StintDecision {
        index,
        laps,
        driver: driver.id.clone(),
        saving_level: "none".into(),
        ..StintDecision::default()
    };
    let mut candidates = vec![];
    for split in 1..n {
        let decision = DecisionVector {
            stints: vec![stint(0, split), stint(1, n - split)],
            pit_stops: vec![PitDecision {
                lap: split,
                fuel_liters: amount(f),
                ve_percent: amount(v),
                driver: driver.id.clone(),
                saving_level: "none".into(),
                service_mode: m.input.pit_cost.service_mode.clone(),
                change_tyres: true,
                ..PitDecision::default()
            }],
        };
        if let Ok(replayed) = replay_model(m, &decision, None, true)
            && replayed.feasible
            && (!risk || super::risk::detail(&replayed, cost, worst)?.worst_case_feasible)
        {
            candidates.push(replayed);
        }
    }
    if candidates.is_empty() {
        return Ok(None);
    }
    let no_pit = DecisionVector {
        stints: vec![stint(0, n)],
        pit_stops: vec![],
    };
    if let Ok(replayed) = replay_model(m, &no_pit, None, true)
        && replayed.feasible
        && (!risk || super::risk::detail(&replayed, cost, worst)?.worst_case_feasible)
    {
        candidates.push(replayed);
    }
    let bound = multi_pit_bound(m)?;
    let best = candidates
        .iter()
        .map(|c| c.evaluation.total_seconds)
        .fold(f64::INFINITY, f64::min);
    Ok((time_cmp(best, bound) == Ordering::Less).then_some(candidates))
}

fn multi_pit_bound(m: &Model) -> Result<f64, String> {
    // Free resources and service, unrestricted fresh tyres: an optimistic
    // lower bound for every partition with at least three stints.
    let n = m.input.race_laps;
    let driver = &m.drivers[0];
    let mut costs = vec![0.0; n as usize + 1];
    for length in 1..=n {
        costs[length as usize] = m
            .stint(1, length, m.fuel.capacity, &driver.id, &m.levels[0], "")?
            .degradation_seconds;
    }
    let fixed = m.pit(&PitDecision::default()).1;
    let mut previous = vec![f64::INFINITY; n as usize + 1];
    previous[0] = 0.0;
    let mut bound = f64::INFINITY;
    for stints in 1..=n {
        let mut next = vec![f64::INFINITY; n as usize + 1];
        for used in 0..n as usize {
            for length in 1..=n as usize - used {
                next[used + length] = next[used + length].min(previous[used] + costs[length]);
            }
        }
        if stints >= 3 {
            bound = bound.min(next[n as usize] + f64::from(stints - 1) * fixed);
        }
        previous = next;
    }
    bound += m.input.formation.seconds.value + f64::from(n) * driver.base;
    Ok(bound)
}
