use super::model::{Model, require};
use super::replay::{completed_reason, replay, time_cmp};
use super::{
    AtomicBool, AtomicOrdering, DecisionVector, Evaluation, Input, OptimalityStatus, Ordering,
    PitDecision, PitStop, ResultV2, SolverOutcome, StintDecision, amount, populated,
    solver_outcome, units,
};

pub(super) fn needs_extended(input: &Input) -> bool {
    input.extra.values().any(populated) || input.event_rules.extra.values().any(populated)
}
#[derive(Clone)]
struct State {
    fuel: i64,
    ve: i64,
    age: u32,
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
fn dominates(l: &State, r: &State, m: &Model) -> bool {
    let rules = &m.input.event_rules;
    if m.dims.race_duration_seconds.is_some()
        && time_cmp(l.evaluation.total_seconds, r.evaluation.total_seconds) != Ordering::Equal
    {
        return false;
    }
    if (rules.min_pit_stops.is_some() || rules.max_pit_stops.is_some())
        && l.decision.pit_stops.len() != r.decision.pit_stops.len()
    {
        return false;
    }
    if l.decision.pit_stops.len() > r.decision.pit_stops.len()
        || m.fuel_weight > 0.0 && l.fuel != r.fuel
    {
        return false;
    }
    if l.age != r.age {
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
    l.fuel >= r.fuel && l.ve >= r.ve && compare_state(l, r) != Ordering::Greater
}

#[allow(clippy::too_many_lines)] // One bounded walk owns budget, cancellation and proof completion.
pub(super) fn solve(
    input: &Input,
    cancel: &AtomicBool,
    partial: bool,
) -> Result<SolverOutcome, String> {
    let m = Model::new(input)?;
    let started = std::time::Instant::now();
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
    let (mut work, mut iterations) = (0usize, 0usize);
    let mut reason = None;
    let count = usize::try_from(input.race_laps).map_err(|e| e.to_string())? + 1;
    let mut frontier: Vec<Vec<State>> = vec![vec![]; count];
    frontier[0].push(State {
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
    let mut completed: Vec<State> = vec![];
    'search: for lap in 0..input.race_laps {
        let nodes = std::mem::take(&mut frontier[usize::try_from(lap).map_err(|e| e.to_string())?]);
        for node in nodes {
            for level in &m.levels {
                for laps in 1..=input.race_laps - lap {
                    if cancel.load(AtomicOrdering::Relaxed) {
                        return Err("cancelled".into());
                    }
                    if started.elapsed().as_millis() > u128::from(input.budget.p95_millis) {
                        reason = Some("deadline_exceeded");
                        break 'search;
                    }
                    let (f, v) = m.usage(lap + 1, laps, "", level)?;
                    if f > node.fuel
                        || v > node.ve
                        || (input.tyre_life_laps.value > 0.0
                            && f64::from(node.age + laps) > input.tyre_life_laps.value)
                    {
                        break;
                    }
                    let mut after = node.clone();
                    let eval = m.stint(lap + 1, laps, node.fuel, "", level)?;
                    after.evaluation.add(&eval);
                    after.fuel -= f;
                    after.ve -= v;
                    after.age += laps;
                    after.decision.stints.push(StintDecision {
                        index: after.decision.stints.len(),
                        laps,
                        saving_level: level.level.clone(),
                        fuel_saved_per_lap: level.fuel_saved_per_lap,
                        ve_saved_per_lap: level.ve_saved_per_lap,
                        time_cost_per_lap: level.time_cost_per_lap,
                        saving_cost_seconds: level.time_cost_per_lap * f64::from(laps),
                        ..StintDecision::default()
                    });
                    if let Some(pit) = after.decision.pit_stops.last_mut() {
                        pit.saving_level.clone_from(&level.level);
                    }
                    let end = lap + laps;
                    let timed_complete = m.dims.race_duration_seconds.is_some_and(|d| {
                        time_cmp(after.evaluation.total_seconds, d) != Ordering::Less
                    });
                    if (m.dims.race_duration_seconds.is_none() && end == input.race_laps)
                        || timed_complete
                    {
                        if completed_reason(&m, &after.decision).is_none() {
                            let mut replay_input = input.clone();
                            if m.dims.race_duration_seconds.is_some() {
                                replay_input.race_laps = input.race_laps;
                            }
                            let replayed = replay(&replay_input, &after.decision, None, true)?;
                            if replayed.feasible {
                                completed.push(after);
                                completed.sort_by(compare_state);
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
                    for f in m.fuel.amounts(after.fuel) {
                        for v in m.ve.amounts(after.ve) {
                            work += 1;
                            if work > max_work {
                                reason = Some("candidate_budget_exhausted");
                                break 'search;
                            }
                            let mut next = after.clone();
                            let (pit, seconds) = m.pit(&PitDecision {
                                lap: end,
                                fuel_liters: amount(f),
                                ve_percent: amount(v),
                                change_tyres: true,
                                saving_level: "none".into(),
                                ..PitDecision::default()
                            });
                            next.fuel += f;
                            next.ve += v;
                            next.age = 0;
                            next.evaluation.pit_seconds += seconds;
                            next.evaluation.total();
                            next.decision.pit_stops.push(pit);
                            let target =
                                &mut frontier[usize::try_from(end).map_err(|e| e.to_string())?];
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
                                if started.elapsed().as_millis()
                                    > u128::from(input.budget.p95_millis)
                                {
                                    reason = Some("deadline_exceeded");
                                    break 'search;
                                }
                                if dominates(existing, &next, &m) {
                                    dominated = true;
                                    break;
                                }
                            }
                            if !dominated {
                                target.retain(|existing| !dominates(&next, existing, &m));
                                target.push(next);
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
    let mut candidates = Vec::new();
    for state in completed {
        let replayed = replay(input, &state.decision, None, true)?;
        if replayed.feasible {
            candidates.push(replayed);
        }
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
            candidates: candidates.iter().map(|r| r.decision.clone()).collect(),
        };
    }
    let status = if reason.is_some() {
        OptimalityStatus::NotProven
    } else if result.feasible {
        OptimalityStatus::Proven
    } else {
        OptimalityStatus::NoSolution
    };
    let mut outcome = solver_outcome(result, status, work, reason);
    outcome.certificate.scope = "validated_discrete_input";
    Ok(outcome)
}
