//! Greedy fallback plan for the scalar model (#2627).
//!
//! Longest stints that fit the tank, the battery and the tyres, refuelling just
//! enough, stopping no later than each required window's last lap. It is
//! deterministic, has no search and no clock, and returns a plan only when every
//! rule of the input holds; otherwise it names the rule it cannot meet.
use super::{
    GreedyRefusal, Input, OptimalityStatus, PitStop, Resource, ResultV2, SolverOutcome, amount,
    pit_seconds, resource_balance, runs_extended_search, solver_outcome, units,
};

pub(super) fn solve(input: &Input) -> Result<SolverOutcome, GreedyRefusal> {
    if runs_extended_search(input) {
        return Err(GreedyRefusal::NotScalar);
    }
    let resource = |capacity: f64, per_lap: f64, step: f64, reserve| {
        Resource::new(capacity, per_lap, step, reserve, input.race_laps)
            .map_err(|_| GreedyRefusal::ServiceGrid)
    };
    let fuel = resource(
        input.fuel_capacity_liters.value,
        input.fuel_per_lap_liters.value,
        input.discretization.fuel_liters,
        &input.fuel_reserve,
    )?;
    let ve = resource(
        input.ve_capacity_percent.value,
        input.ve_per_lap_percent.value,
        input.discretization.ve_percent,
        &input.virtual_energy_reserve,
    )?;
    let rules = &input.event_rules;
    let minimum = rules.min_pit_stops.unwrap_or(0);
    let race = usize::try_from(input.race_laps).map_err(|_| GreedyRefusal::ServiceGrid)?;
    if minimum >= race {
        return Err(GreedyRefusal::MinStops);
    }
    // Shorter stints add stops: lower the stint cap until the minimum is met.
    let mut cap = u32::MAX;
    let mut candidate = loop {
        let plan = plan(input, fuel, ve, cap)?;
        if plan.pit_stops.len() >= minimum {
            break plan;
        }
        let longest = plan.stints.iter().copied().max().unwrap_or(1);
        if longest <= 1 {
            return Err(GreedyRefusal::MinStops);
        }
        // `minimum` stops need `minimum + 1` stints: an even split is the first try.
        let even = input
            .race_laps
            .div_ceil(u32::try_from(minimum + 1).unwrap_or(u32::MAX));
        cap = even.min(longest - 1);
    };
    candidate.feasible = true;
    let (start, remaining) =
        resource_balance(&candidate, fuel, true).map_err(|_| GreedyRefusal::ServiceGrid)?;
    candidate.fuel_start_liters = amount(start);
    candidate.fuel_remaining_liters = amount(remaining);
    let (start, remaining) =
        resource_balance(&candidate, ve, false).map_err(|_| GreedyRefusal::ServiceGrid)?;
    candidate.ve_start_percent = amount(start);
    candidate.ve_remaining_percent = amount(remaining);
    Ok(solver_outcome(
        candidate,
        OptimalityStatus::NotProven,
        0,
        Some("greedy_fallback_plan"),
    ))
}

/// Largest stint a level can serve after one service, within the stint cap.
/// `keep` is the reserve that must remain at the finish (zero mid-race).
fn laps_for(resource: Resource, level: i64, keep: i64) -> u32 {
    if resource.per_lap == 0 {
        return u32::MAX;
    }
    let top = level + (resource.capacity - level) / resource.step * resource.step;
    u32::try_from(((top - keep) / resource.per_lap).max(0)).unwrap_or(u32::MAX)
}

/// Smallest service on the step grid that brings `level` up to `needed`.
fn service(resource: Resource, level: i64, needed: i64) -> Result<i64, GreedyRefusal> {
    if resource.per_lap == 0 || needed <= level {
        return Ok(0);
    }
    let service = (needed - level + resource.step - 1) / resource.step * resource.step;
    if level + service > resource.capacity {
        return Err(GreedyRefusal::ServiceGrid);
    }
    Ok(service)
}

fn plan(input: &Input, fuel: Resource, ve: Resource, cap: u32) -> Result<ResultV2, GreedyRefusal> {
    let rules = &input.event_rules;
    let tyres = if input.tyre_life_laps.value > 0.0 {
        u32::try_from(
            units(input.tyre_life_laps.value).map_err(|_| GreedyRefusal::ServiceGrid)? / 1_000_000,
        )
        .unwrap_or(u32::MAX)
    } else {
        u32::MAX
    };
    let mut result = ResultV2::default();
    let mut met = vec![false; rules.required_windows.len()];
    let (mut fuel_level, mut ve_level) = (fuel.capacity, ve.capacity);
    let mut done = 0u32;
    let mut service_seconds = 0.0;
    loop {
        let remaining = input.race_laps - done;
        let longest = tyres.min(cap);
        let reach = longest
            .min(laps_for(fuel, fuel_level, 0))
            .min(laps_for(ve, ve_level, 0));
        let reach_final = longest
            .min(laps_for(fuel, fuel_level, fuel.reserve))
            .min(laps_for(ve, ve_level, ve.reserve));
        let deadline = rules
            .required_windows
            .iter()
            .zip(&met)
            .filter(|(_, met)| !**met)
            .map(|(window, _)| window.to_lap)
            .min();
        let (length, last) = if deadline.is_none() && remaining <= reach_final {
            (remaining, true)
        } else {
            if reach == 0 {
                return Err(GreedyRefusal::ResourceTooSmall);
            }
            let mut stop = (done + reach).min(input.race_laps - 1);
            if let Some(deadline) = deadline {
                if deadline <= done {
                    return Err(GreedyRefusal::WindowUnreachable);
                }
                stop = stop.min(deadline);
            }
            if stop <= done {
                return Err(GreedyRefusal::ResourceTooSmall);
            }
            (stop - done, false)
        };
        let count = i64::from(length);
        if done > 0 {
            // Just enough for this stint (and the reserve at the finish).
            let reserve = |resource: Resource| if last { resource.reserve } else { 0 };
            let fuel_amount = service(fuel, fuel_level, count * fuel.per_lap + reserve(fuel))?;
            let ve_amount = service(ve, ve_level, count * ve.per_lap + reserve(ve))?;
            result.pit_stops.push(PitStop {
                lap: done,
                fuel_liters: amount(fuel_amount),
                ve_percent: amount(ve_amount),
                change_tyres: true,
                service_mode: input.pit_cost.service_mode.clone(),
            });
            service_seconds += pit_seconds(input, fuel_amount, ve_amount);
            fuel_level += fuel_amount;
            ve_level += ve_amount;
        }
        fuel_level -= count * fuel.per_lap;
        ve_level -= count * ve.per_lap;
        result.stints.push(length);
        done += length;
        let eval = &mut result.expected;
        let laps = f64::from(length);
        eval.green_seconds += laps * input.base_lap_seconds.value;
        eval.degradation_seconds +=
            input.degradation_per_lap_seconds.value * laps * (laps - 1.0) / 2.0;
        if last {
            break;
        }
        if rules
            .max_pit_stops
            .is_some_and(|max| result.pit_stops.len() + 1 > max)
        {
            return Err(GreedyRefusal::MaxStops);
        }
        for (index, window) in rules.required_windows.iter().enumerate() {
            if (window.from_lap..=window.to_lap).contains(&done) {
                met[index] = true;
            }
        }
    }
    let eval = &mut result.expected;
    eval.pit_seconds = service_seconds;
    eval.formation_seconds = input.formation.seconds.value;
    eval.total_seconds =
        eval.green_seconds + eval.degradation_seconds + eval.pit_seconds + eval.formation_seconds;
    Ok(result)
}
