use super::model::{Model, require};
use super::replay::{completed_reason, replay_model, time_cmp};
use super::{
    AtomicBool, AtomicOrdering, DecisionVector, Evaluation, Input, OptimalityStatus, Ordering,
    PitDecision, PitStop, ResultV2, SolverOutcome, StintDecision, amount, populated,
    solver_outcome, units,
};
use serde_json::json;

pub(super) fn needs_extended(input: &Input) -> bool {
    input.event_rules.required_windows.len() > 16
        || input.extra.values().any(populated)
        || input.event_rules.extra.values().any(populated)
}
#[derive(Clone)]
struct State {
    fuel_used: i64,
    ve_used: i64,
    worst_fuel: i64,
    worst_ve: i64,
    worst_feasible: bool,
    fuel: i64,
    ve: i64,
    age: u32,
    tyre: super::tyres::Choice,
    drivers: super::drivers::DriverState,
    tyre_usage: std::collections::BTreeMap<String, u32>,
    decision: DecisionVector,
    evaluation: Evaluation,
}
fn decision_cmp(l: &DecisionVector, r: &DecisionVector) -> Ordering {
    let mut order = l.pit_stops.len().cmp(&r.pit_stops.len());
    for (a, b) in l.pit_stops.iter().zip(&r.pit_stops) {
        order = order
            .then(a.lap.cmp(&b.lap))
            .then(a.fuel_liters.total_cmp(&b.fuel_liters))
            .then(a.ve_percent.total_cmp(&b.ve_percent));
    }
    // Struct declaration order mirrors Go's observable JSON key.
    order.then_with(|| {
        serde_json::to_string(l)
            .unwrap_or_default()
            .cmp(&serde_json::to_string(r).unwrap_or_default())
    })
}
fn compare_state(l: &State, r: &State) -> Ordering {
    time_cmp(l.evaluation.total_seconds, r.evaluation.total_seconds)
        .then_with(|| decision_cmp(&l.decision, &r.decision))
}
fn dominates(l: &State, r: &State, m: &Model, risk: bool) -> bool {
    if risk
        && ((!l.worst_feasible && r.worst_feasible)
            || (l.worst_feasible && (l.worst_fuel < r.worst_fuel || l.worst_ve < r.worst_ve)))
    {
        return false;
    }
    if (m.input.fuel_reserve["kind"] == "percent" && l.fuel_used != r.fuel_used)
        || (m.input.virtual_energy_reserve["kind"] == "percent" && l.ve_used != r.ve_used)
    {
        return false;
    }
    let rules = &m.input.event_rules;
    if (m.dims.race_duration_seconds.is_some()
        || m.rules
            .driver_limits
            .values()
            .any(|l| !l.unavailable_time.is_empty()))
        && time_cmp(l.evaluation.total_seconds, r.evaluation.total_seconds) != Ordering::Equal
    {
        return false;
    }
    if (rules.min_pit_stops.is_some()
        || rules.max_pit_stops.is_some()
        || !m.dims.driver_sequence.is_empty())
        && l.decision.pit_stops.len() != r.decision.pit_stops.len()
    {
        return false;
    }
    if l.decision.pit_stops.len() > r.decision.pit_stops.len()
        || m.fuel_weight > 0.0 && l.fuel != r.fuel
    {
        return false;
    }
    if l.drivers != r.drivers {
        return false;
    }
    if l.tyre != r.tyre || l.tyre_usage != r.tyre_usage || l.age != r.age {
        return false;
    }
    for w in &rules.required_windows {
        let covered = |d: &DecisionVector| {
            d.pit_stops
                .iter()
                .any(|p| p.lap >= w.from_lap && p.lap <= w.to_lap)
        };
        if covered(&l.decision) != covered(&r.decision) {
            return false;
        }
    }
    for compound in &m.rules.mandatory_compounds {
        let used = |d: &DecisionVector| d.stints.iter().any(|s| &s.compound == compound);
        if used(&l.decision) != used(&r.decision) {
            return false;
        }
    }
    l.fuel >= r.fuel && l.ve >= r.ve && compare_state(l, r) != Ordering::Greater
}

// ponytail: bound retained histories instead of adding a new approximate
// frontier/index. Reaching either limit returns NotProven, never NoSolution.
const MAX_FRONTIER_STATES: usize = 4_096;
const MAX_FRONTIER_DECISION_ITEMS: usize = 16_384;

fn decision_items(state: &State) -> usize {
    state.decision.stints.len() + state.decision.pit_stops.len()
}

fn cannot_improve(
    end: u32,
    seconds: f64,
    m: &Model,
    minimum_lap_seconds: Option<f64>,
    incumbent: Option<(u32, f64)>,
) -> bool {
    let (Some(pace), Some((best_laps, best_seconds))) = (minimum_lap_seconds, incumbent) else {
        return false;
    };
    let Some(duration) = m.dims.race_duration_seconds else {
        return false;
    };
    // Ignore future pit/degradation/resource/driver costs. This is an
    // optimistic upper bound on laps, including the lap crossing duration.
    let mut upper = end;
    for finish in end + 1..=m.input.race_laps {
        let final_start = seconds + f64::from(finish - end - 1) * pace;
        if time_cmp(final_start, duration) != Ordering::Less {
            break;
        }
        upper = finish;
    }
    upper < best_laps
        || (upper == best_laps
            && time_cmp(
                seconds + f64::from(best_laps.saturating_sub(end)) * pace,
                best_seconds,
            ) == Ordering::Greater)
}

#[allow(clippy::too_many_lines)] // One bounded walk owns budget, cancellation and proof completion.
pub(super) fn solve(
    input: &Input,
    cancel: &AtomicBool,
    partial: bool,
    deadline_millis: Option<u64>,
) -> Result<SolverOutcome, String> {
    if cancel.load(AtomicOrdering::Relaxed) {
        return Err("cancelled".into());
    }
    let started = std::time::Instant::now();
    let (effective, requested) = super::budget::effective(input);
    let input = &effective;
    let m = Model::new(input)?;
    let worst = Model::new(&super::risk::envelope(input, true))?;
    let cost = Model::new(&super::risk::envelope(input, false))?;
    let risk = super::risk::active(&m, &worst);
    let certified =
        super::certified::one_pit(&m, &worst, &cost, risk, cancel, &started, deadline_millis)?;
    let bound_certified = certified.is_some();
    let max_work = if input.budget.max_candidates == 0 {
        10_000_000
    } else {
        input.budget.max_candidates
    };
    let max_iterations = if input.budget.max_iterations == 0 {
        100_000_000
    } else {
        input.budget.max_iterations
    };
    let mut pruned = 0;
    let (mut work, mut iterations) = (0usize, 0usize);
    let mut reason = None;
    let seed = if bound_certified {
        None
    } else {
        super::seed::greedy(&m, cancel, &started, deadline_millis)?
    };
    let seed_finished_micros = started.elapsed().as_micros();
    let mut first_incumbent_micros = seed.as_ref().map(|(_, micros)| *micros);
    let mut incumbent = seed.as_ref().map(|(s, _)| {
        (
            s.decision.stints.iter().map(|s| s.laps).sum::<u32>(),
            s.evaluation.total_seconds,
        )
    });
    // These models have no negative or age-dependent pace adjustments.
    // Other dimensions retain the original enumeration without this bound.
    let minimum_lap_seconds = (!risk
        && m.dims.weather.is_none()
        && !m.tyres.enabled()
        && m.dims.compound_pace.is_empty()
        && m.pace_points.is_empty()
        && m.fuel_weight == 0.0
        && m.input.degradation_per_lap_seconds.value >= 0.0
        && m.levels.iter().all(|l| l.time_cost_per_lap >= 0.0))
    .then(|| {
        m.drivers
            .iter()
            .map(|d| d.base)
            .fold(f64::INFINITY, f64::min)
    });
    // Only populated laps consume memory; the horizon does not allocate an
    // empty vector per lap. pop_first keeps the original lap ordering.
    let mut frontier: std::collections::BTreeMap<u32, Vec<State>> =
        std::collections::BTreeMap::default();
    let mut frontier_peaks: std::collections::BTreeMap<u32, usize> =
        std::collections::BTreeMap::default();
    let mut expanded_states_by_lap = std::collections::BTreeMap::new();
    let mut created_states = 0usize;
    for choice in m.tyres.initial() {
        frontier.entry(0).or_default().push(State {
            fuel_used: 0,
            ve_used: 0,
            drivers: super::drivers::DriverState::default(),
            worst_fuel: units(
                worst
                    .dims
                    .initial_fuel_liters
                    .as_ref()
                    .map_or(amount(worst.fuel.capacity), |s| s.value),
            )?,
            worst_ve: units(
                worst
                    .dims
                    .initial_ve_percent
                    .as_ref()
                    .map_or(amount(worst.ve.capacity), |s| s.value),
            )?,
            worst_feasible: true,
            tyre: choice,
            tyre_usage: std::collections::BTreeMap::new(),
            fuel: units(
                m.dims
                    .initial_fuel_liters
                    .as_ref()
                    .map_or(amount(m.fuel.capacity), |s| s.value),
            )?,
            ve: units(
                m.dims
                    .initial_ve_percent
                    .as_ref()
                    .map_or(amount(m.ve.capacity), |s| s.value),
            )?,
            age: 0,
            decision: DecisionVector::default(),
            evaluation: Evaluation {
                formation_seconds: input.formation.seconds.value,
                total_seconds: input.formation.seconds.value,
                ..Evaluation::default()
            },
        });
    }
    let mut completed: Vec<State> = vec![];
    let mut safe_completed: Vec<State> = vec![];
    let mut retained_states = frontier.get(&0).map_or(0, Vec::len);
    frontier_peaks.insert(0, retained_states);
    let mut retained_items = 0usize;
    let mut peak_retained_states = retained_states;
    let mut peak_retained_items = 0usize;
    if bound_certified {
        frontier.clear();
    }
    'search: while let Some((lap, nodes)) = frontier.pop_first() {
        expanded_states_by_lap.insert(lap, nodes.len());
        for node in nodes {
            retained_states -= 1;
            retained_items -= decision_items(&node);
            for driver in &m.drivers {
                if !m.sequence_allows(node.decision.stints.len(), &driver.id) {
                    continue;
                }
                for level in &m.levels {
                    for laps in 1..=input.race_laps - lap {
                        if cancel.load(AtomicOrdering::Relaxed) {
                            return Err("cancelled".into());
                        }
                        if super::deadline_exceeded(&started, deadline_millis) {
                            reason = Some("deadline_exceeded");
                            break 'search;
                        }
                        if !m.weather.allowed(&node.tyre.compound, lap + 1, laps) {
                            continue;
                        }
                        let (f, v) = m.usage(lap + 1, laps, &driver.id, level)?;
                        if f > node.fuel
                            || v > node.ve
                            || (m.input.tyre_life_laps.value > 0.0
                                && f64::from(
                                    super::tyres::age(&node.tyre, &node.tyre_usage, node.age)
                                        + laps,
                                ) > m.input.tyre_life_laps.value)
                        {
                            break;
                        }
                        let mut after = node.clone();
                        let eval = m.stint(
                            lap + 1,
                            laps,
                            node.fuel,
                            &driver.id,
                            level,
                            &node.tyre.compound,
                        )?;
                        after.evaluation.add(&eval);
                        if m.apply_driver(
                            &mut after.drivers,
                            &driver.id,
                            lap + 1,
                            laps,
                            &node.evaluation,
                            &after.evaluation,
                        )
                        .is_some()
                        {
                            continue;
                        }
                        let worst_level = worst.level(&level.level)?;
                        let (wf, wv) = worst.usage(lap + 1, laps, &driver.id, worst_level)?;
                        after.worst_fuel -= wf;
                        after.worst_ve -= wv;
                        if after.worst_fuel < 0
                            || after.worst_ve < 0
                            || (worst.input.tyre_life_laps.value > 0.0
                                && f64::from(
                                    super::tyres::age(&node.tyre, &node.tyre_usage, node.age)
                                        + laps,
                                ) > worst.input.tyre_life_laps.value)
                        {
                            after.worst_feasible = false;
                        }
                        after.fuel_used += f;
                        after.ve_used += v;
                        after.fuel -= f;
                        after.ve -= v;
                        after.age += laps;
                        super::tyres::use_fitment(&node.tyre, &mut after.tyre_usage, laps);
                        after.decision.stints.push(StintDecision {
                            driver: driver.id.clone(),
                            compound: node.tyre.compound.clone(),
                            tyre_fitment: node.tyre.fitment.clone(),
                            index: after.decision.stints.len(),
                            laps,
                            saving_level: level.level.clone(),
                            fuel_saved_per_lap: level.fuel_saved_per_lap,
                            ve_saved_per_lap: level.ve_saved_per_lap,
                            time_cost_per_lap: level.time_cost_per_lap,
                            saving_cost_seconds: level.time_cost_per_lap * f64::from(laps),
                        });
                        if let Some(pit) = after.decision.pit_stops.last_mut() {
                            pit.saving_level.clone_from(&level.level);
                            pit.driver.clone_from(&driver.id);
                        }
                        let end = lap + laps;
                        let timed_complete = m.dims.race_duration_seconds.is_some_and(|d| {
                            time_cmp(after.evaluation.total_seconds, d) != Ordering::Less
                        });
                        if (m.dims.race_duration_seconds.is_none() && end == input.race_laps)
                            || timed_complete
                        {
                            if completed_reason(&m, &after.decision).is_none() {
                                let replayed = replay_model(&m, &after.decision, None, true)?;
                                if replayed.feasible {
                                    first_incumbent_micros
                                        .get_or_insert_with(|| started.elapsed().as_micros());
                                    let cost = replayed.evaluation.total_seconds;
                                    if incumbent.is_none_or(|(n, t)| {
                                        end > n || (end == n && time_cmp(cost, t) == Ordering::Less)
                                    }) {
                                        incumbent = Some((end, cost));
                                    }
                                    if after.worst_feasible {
                                        safe_completed.push(after.clone());
                                        safe_completed.sort_by(compare_state);
                                        safe_completed.truncate(8);
                                    }
                                    completed.push(after);
                                    completed.sort_by(|l, r| {
                                        let laps = |s: &State| {
                                            s.decision.stints.iter().map(|s| s.laps).sum::<u32>()
                                        };
                                        let order = if m.dims.race_duration_seconds.is_some() {
                                            laps(r).cmp(&laps(l))
                                        } else {
                                            Ordering::Equal
                                        };
                                        order.then_with(|| compare_state(l, r))
                                    });
                                    completed.truncate(8);
                                }
                            }
                            continue;
                        }
                        if end == input.race_laps {
                            continue;
                        }
                        if input
                            .event_rules
                            .max_pit_stops
                            .is_some_and(|n| after.decision.pit_stops.len() >= n)
                        {
                            continue;
                        }
                        for (next_tyre, change_tyres) in m.tyres.next(&after.tyre) {
                            for f in m.fuel.amounts(after.fuel) {
                                for v in m.ve.amounts(after.ve) {
                                    work += 1;
                                    if work > max_work {
                                        reason = Some("candidate_budget_exhausted");
                                        break 'search;
                                    }
                                    let mut next = after.clone();
                                    created_states += 1;
                                    let (pit, seconds) = m.pit(&PitDecision {
                                        lap: end,
                                        fuel_liters: amount(f),
                                        ve_percent: amount(v),
                                        compound: next_tyre.compound.clone(),
                                        tyre_fitment: next_tyre.fitment.clone(),
                                        change_tyres,
                                        saving_level: "none".into(),
                                        ..PitDecision::default()
                                    });
                                    next.worst_fuel += f;
                                    next.worst_ve += v;
                                    next.fuel += f;
                                    next.ve += v;
                                    next.tyre = next_tyre.clone();
                                    if change_tyres {
                                        next.age = 0;
                                    }
                                    next.evaluation.pit_seconds += seconds;
                                    next.evaluation.total();
                                    if cannot_improve(
                                        end,
                                        next.evaluation.total_seconds,
                                        &m,
                                        minimum_lap_seconds,
                                        incumbent,
                                    ) {
                                        pruned += 1;
                                        continue;
                                    }
                                    next.decision.pit_stops.push(pit);
                                    let target = frontier.entry(end).or_default();
                                    let mut dominated = false;
                                    for existing in target.iter() {
                                        iterations += 1;
                                        if iterations > max_iterations {
                                            reason = Some("iteration_budget_exhausted");
                                            break 'search;
                                        }
                                        if cancel.load(AtomicOrdering::Relaxed) {
                                            return Err("cancelled".into());
                                        }
                                        if super::deadline_exceeded(&started, deadline_millis) {
                                            reason = Some("deadline_exceeded");
                                            break 'search;
                                        }
                                        if dominates(existing, &next, &m, risk) {
                                            dominated = true;
                                            break;
                                        }
                                    }
                                    if dominated {
                                        pruned += 1;
                                    }
                                    if !dominated {
                                        let mut retained = Vec::with_capacity(target.len() + 1);
                                        for existing in std::mem::take(target) {
                                            iterations += 1;
                                            if iterations > max_iterations {
                                                reason = Some("iteration_budget_exhausted");
                                                break 'search;
                                            }
                                            if cancel.load(AtomicOrdering::Relaxed) {
                                                return Err("cancelled".into());
                                            }
                                            if super::deadline_exceeded(&started, deadline_millis) {
                                                reason = Some("deadline_exceeded");
                                                break 'search;
                                            }
                                            if dominates(&next, &existing, &m, risk) {
                                                pruned += 1;
                                                retained_states -= 1;
                                                retained_items -= decision_items(&existing);
                                            } else {
                                                retained.push(existing);
                                            }
                                        }
                                        *target = retained;
                                        let items = decision_items(&next);
                                        // Public APIs always supply a deadline budget. Keep the
                                        // test-only lap oracle without a deadline exhaustive.
                                        if (deadline_millis.is_some()
                                            || m.dims.race_duration_seconds.is_some())
                                            && (retained_states >= MAX_FRONTIER_STATES
                                                || retained_items + items
                                                    > MAX_FRONTIER_DECISION_ITEMS)
                                        {
                                            reason = Some("frontier_memory_budget_exhausted");
                                            break 'search;
                                        }
                                        target.push(next);
                                        retained_states += 1;
                                        retained_items += items;
                                        peak_retained_states =
                                            peak_retained_states.max(retained_states);
                                        peak_retained_items =
                                            peak_retained_items.max(retained_items);
                                        let peak = frontier_peaks.entry(end).or_default();
                                        *peak = (*peak).max(target.len());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if !partial {
        require(
            reason.is_none(),
            "native_budget_exhausted: no se ha demostrado el óptimo",
        )?;
    }
    if std::env::var_os("VANTARE_STRATEGY_TRACE").is_some() {
        eprintln!(
            "{}",
            json!({"searchTrace": {"frontierPeaksByLap": frontier_peaks,
            "expandedStatesByLap": expanded_states_by_lap,
            "createdStates": created_states, "prunedStates": pruned, "comparisons": iterations,
            "firstIncumbentMicros": first_incumbent_micros,
            "seedFinishedMicros": seed_finished_micros,
            "peakRetainedStates": peak_retained_states,
            "peakRetainedDecisionItems": peak_retained_items,
            "elapsedMicros": started.elapsed().as_micros()}})
        );
    }
    let mut candidates = Vec::new();
    let mut keys = std::collections::BTreeSet::new();
    // Completed enumeration keeps its existing candidate/variant policy.
    // The seed supplies an incumbent when that enumeration is interrupted.
    if reason.is_some()
        && let Some((seeded, _)) = seed
    {
        keys.insert(serde_json::to_string(&seeded.decision).map_err(|e| e.to_string())?);
        candidates.push(seeded);
    }
    for state in completed.into_iter().chain(safe_completed) {
        let key = serde_json::to_string(&state.decision).map_err(|e| e.to_string())?;
        if !keys.insert(key) {
            continue;
        }
        let replayed = replay_model(&m, &state.decision, None, true)?;
        if replayed.feasible {
            candidates.push(replayed);
        }
    }
    let adverse_policy = risk && bound_certified;
    if let Some(plans) = certified {
        candidates = plans;
    }
    candidates.sort_by(|l, r| {
        let laps = |d: &DecisionVector| d.stints.iter().map(|s| s.laps).sum::<u32>();
        let order = if m.dims.race_duration_seconds.is_some() {
            laps(&r.decision).cmp(&laps(&l.decision))
        } else {
            Ordering::Equal
        };
        order
            .then(time_cmp(
                l.evaluation.total_seconds,
                r.evaluation.total_seconds,
            ))
            .then_with(|| decision_cmp(&l.decision, &r.decision))
    });
    let mut result = ResultV2::default();
    if let Some(best) = candidates.first() {
        let req = super::replay::requirements(&m, &best.decision)?;
        result = ResultV2 {
            feasible: true,
            stints: best.decision.stints.iter().map(|s| s.laps).collect(),
            pit_stops: best
                .decision
                .pit_stops
                .iter()
                .map(|p| PitStop {
                    lap: p.lap,
                    fuel_liters: p.fuel_liters,
                    ve_percent: p.ve_percent,
                    change_tyres: p.change_tyres,
                    service_mode: p.service_mode.clone(),
                })
                .collect(),
            expected: best.evaluation.clone(),
            fuel_start_liters: req.initial.fuel_liters,
            ve_start_percent: req.initial.ve_percent,
            fuel_remaining_liters: best.reserve.fuel.remaining_amount,
            ve_remaining_percent: best.reserve.virtual_energy.remaining_amount,
            best: Some(best.decision.clone()),
            reserve: Some(best.reserve.clone()),
            worst_case: None,
            candidate_details: Vec::new(),
            variants: Vec::new(),
            resolved_inputs: Some(
                json!({"baseLapSeconds":m.input.base_lap_seconds,"fuelCapacityLiters":m.input.fuel_capacity_liters,"veCapacityPercent":m.input.ve_capacity_percent,"tyreLifeLaps":m.input.tyre_life_laps,"fuelPerLapLiters":m.input.fuel_per_lap_liters,"vePerLapPercent":m.input.ve_per_lap_percent,"degradationPerLapSeconds":m.input.degradation_per_lap_seconds,"formationSeconds":m.input.formation.seconds,"pitCost":m.input.pit_cost}),
            ),
            candidates: candidates.iter().map(|r| r.decision.clone()).collect(),
        };
    }
    for replayed in &candidates {
        result
            .candidate_details
            .push(super::risk::detail(replayed, &cost, &worst)?);
    }
    if let Some(resolved) = result.resolved_inputs.as_mut() {
        if let Some(initial) = &m.dims.initial_fuel_liters {
            resolved["initialFuelLiters"] = json!(initial);
        }
        if let Some(initial) = &m.dims.initial_ve_percent {
            resolved["initialVEPercent"] = json!(initial);
        }
    }
    result.variants = super::risk::variants(&result.candidate_details);
    result.worst_case = result
        .candidate_details
        .first()
        .map(|d| d.worst_case.clone());
    if cancel.load(AtomicOrdering::Relaxed) {
        return Err("cancelled".into());
    }
    let search_completed = reason.is_none();
    // Go ranks the bounded capacity-start search, then replays at the minimum
    // initial load. With fuel-weight cost that can reorder or hide plans: the
    // enumeration proves neither the automatic initial-load optimum nor the
    // UI cost's lower bound. Publish the result without claiming that proof.
    if search_completed && m.fuel_weight > 0.0 && m.dims.initial_fuel_liters.is_none() {
        reason = Some("automatic_initial_load_optimality_not_proven");
    }
    let status = if reason.is_some() {
        OptimalityStatus::NotProven
    } else if result.feasible {
        OptimalityStatus::Proven
    } else {
        OptimalityStatus::NoSolution
    };
    let mut outcome = solver_outcome(result, status, work, reason);
    outcome.certificate.scope = if adverse_policy {
        "validated_adverse_feasible_input"
    } else {
        "validated_discrete_input"
    };
    let proven = status == OptimalityStatus::Proven;
    outcome.certificate.proof = Some(super::SearchProof {
        algorithm: if bound_certified {
            "combined_curve_partition_bound"
        } else {
            "dominance_pruned_enumeration"
        },
        objective: if m.dims.race_duration_seconds.is_some() {
            "maximum_completed_laps_then_minimum_expected_time"
        } else if adverse_policy {
            "minimum_expected_time_among_adverse_feasible_plans"
        } else {
            "minimum_expected_time"
        },
        search_completed,
        iterations,
        pruned_states: pruned,
        duration_millis: started.elapsed().as_millis(),
        relative_time_tolerance: 1e-12,
        discretization_degraded: requested
            .fuel_liters
            .total_cmp(&effective.discretization.fuel_liters)
            .is_ne()
            || requested
                .ve_percent
                .total_cmp(&effective.discretization.ve_percent)
                .is_ne(),
        requested_discretization: requested,
        effective_discretization: m.input.discretization.clone(),
        budget: input.budget.clone(),
        incumbent_seconds: outcome.cost_seconds,
        lower_bound_seconds: if proven { outcome.cost_seconds } else { None },
        absolute_gap_seconds: proven.then_some(0.0),
    });
    Ok(outcome)
}
