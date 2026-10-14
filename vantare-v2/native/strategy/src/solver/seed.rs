//! A capacity-first incumbent, never a proof. Every prefix and final plan uses
//! the same replay as the editor; an unsuccessful heuristic leaves search intact.
use super::model::Model;
use super::replay::{ReplayResult, replay_model, time_cmp};
use super::{
    AtomicBool, AtomicOrdering, DecisionVector, Ordering, PitDecision, StintDecision, amount, units,
};
use std::time::Instant;

#[allow(clippy::too_many_lines)] // One bounded walk owns the prefix, loads and replay validation.
pub(super) fn greedy(
    m: &Model,
    cancel: &AtomicBool,
    started: &Instant,
    deadline_millis: Option<u64>,
) -> Result<Option<(ReplayResult, u128)>, String> {
    // Reserve most of the budget for the exact search. The seed also checks
    // cancellation inside its walk, including short/depleted horizons.
    let seed_deadline = Some(deadline_millis.map_or(200, |d| (d / 4).min(200)));
    if m.dims.race_duration_seconds.is_none() {
        return Ok(None);
    }
    let initial = (
        m.dims
            .initial_fuel_liters
            .as_ref()
            .map_or(amount(m.fuel.capacity), |s| s.value),
        m.dims
            .initial_ve_percent
            .as_ref()
            .map_or(amount(m.ve.capacity), |s| s.value),
    );
    let minimum_stints = m.dims.driver_sequence.len().max(
        m.input
            .event_rules
            .min_pit_stops
            .unwrap_or(0)
            .saturating_add(1),
    );
    let full_pit_seconds = m
        .pit(&PitDecision {
            fuel_liters: amount(m.fuel.capacity),
            ve_percent: amount(m.ve.capacity),
            change_tyres: true,
            ..PitDecision::default()
        })
        .1;
    let fastest_lap = m
        .drivers
        .iter()
        .map(|d| d.base)
        .fold(f64::INFINITY, f64::min);
    for initial_tyre in m.tyres.initial() {
        for level in &m.levels {
            let mut decision = DecisionVector::default();
            let mut tyre = initial_tyre.clone();
            let (mut fuel, mut ve) = (units(initial.0)?, units(initial.1)?);
            let mut lap = 0;
            let mut elapsed = m.input.formation.seconds.value;
            let mut repaired_last_stint = false;
            while lap < m.input.race_laps {
                let mut selected = None;
                for driver in &m.drivers {
                    if !m.sequence_allows(decision.stints.len(), &driver.id) {
                        continue;
                    }
                    // Accumulate one authoritative lap at a time. Asking usage
                    // for the entire horizon first is quadratic (and can itself
                    // exceed the deadline before the next cancellation check).
                    let (mut used_f, mut used_v, mut upper) = (0i64, 0i64, 0u32);
                    for laps in 1..=m.input.race_laps - lap {
                        if cancel.load(AtomicOrdering::Relaxed) {
                            return Err("cancelled".into());
                        }
                        if super::deadline_exceeded(started, seed_deadline) {
                            trace_stop(started, lap, &decision, "seed_deadline");
                            return Ok(None);
                        }
                        let (f, v) = m.usage(lap + laps, 1, &driver.id, level)?;
                        used_f += f;
                        used_v += v;
                        if used_f > fuel
                            || used_v > ve
                            || (m.input.tyre_life_laps.value > 0.0
                                && f64::from(laps) > m.input.tyre_life_laps.value)
                        {
                            break;
                        }
                        upper = laps;
                    }
                    for laps in (1..=upper).rev() {
                        if cancel.load(AtomicOrdering::Relaxed) {
                            return Err("cancelled".into());
                        }
                        if super::deadline_exceeded(started, seed_deadline) {
                            trace_stop(started, lap, &decision, "seed_deadline");
                            return Ok(None);
                        }
                        let (f, v) = m.usage(lap + 1, laps, &driver.id, level)?;
                        if f > fuel || v > ve {
                            continue;
                        }
                        // With fixed initial fuel (or no weight cost), replay's
                        // clock is known. Skip oversized terminal stints before
                        // replaying their entire history and constructing pit JSON.
                        if (m.fuel_weight == 0.0 || m.dims.initial_fuel_liters.is_some())
                            && laps > 1
                        {
                            let before_last = m
                                .stint(lap + 1, laps - 1, fuel, &driver.id, level, &tyre.compound)?
                                .total_seconds;
                            if m.dims.race_duration_seconds.is_some_and(|d| {
                                time_cmp(elapsed + before_last, d) != Ordering::Less
                            }) {
                                continue;
                            }
                        }
                        if m.input.event_rules.required_windows.iter().any(|w| {
                            lap + laps > w.to_lap
                                && !decision
                                    .pit_stops
                                    .iter()
                                    .any(|p| p.lap >= w.from_lap && p.lap <= w.to_lap)
                        }) {
                            continue;
                        }
                        let mut trial = decision.clone();
                        trial.stints.push(StintDecision {
                            index: trial.stints.len(),
                            laps,
                            driver: driver.id.clone(),
                            saving_level: level.level.clone(),
                            compound: tyre.compound.clone(),
                            tyre_fitment: tyre.fitment.clone(),
                            ..StintDecision::default()
                        });
                        let replayed = replay_model(m, &trial, Some(initial), false)?;
                        if !replayed.feasible {
                            continue;
                        }
                        let remaining_stints = minimum_stints.saturating_sub(trial.stints.len());
                        let remaining_stints = u32::try_from(remaining_stints).unwrap_or(u32::MAX);
                        if remaining_stints > 0
                            && m.dims.race_duration_seconds.is_some_and(|d| {
                                replayed.evaluation.total_seconds
                                    + f64::from(remaining_stints) * (fastest_lap + full_pit_seconds)
                                    >= d
                            })
                        {
                            continue;
                        }
                        if (m.fuel_weight != 0.0 && m.dims.initial_fuel_liters.is_none())
                            || m.dims.race_duration_seconds.is_some_and(|d| {
                                time_cmp(replayed.evaluation.total_seconds, d) != Ordering::Less
                            })
                        {
                            let complete = replay_model(m, &trial, None, true)?;
                            if complete.feasible {
                                let first_micros = started.elapsed().as_micros();
                                return trim_last_pit(m, complete, cancel, started, seed_deadline)
                                    .map(|plan| Some((plan, first_micros)));
                            }
                        }
                        // Retain a terminal reserve even on intermediate stints.
                        // This is only a heuristic; it does not alter search rules.
                        if !replayed.reserve.satisfied
                            || m.dims.race_duration_seconds.is_some_and(|d| {
                                time_cmp(replayed.evaluation.total_seconds, d) != Ordering::Less
                            })
                        {
                            continue;
                        }
                        selected = Some((trial, replayed, laps));
                        break;
                    }
                    if selected.is_some() {
                        break;
                    }
                }
                let (trial, replayed, end) = if let Some((trial, replayed, laps)) = selected {
                    (trial, replayed, lap + laps)
                } else {
                    trace_stop(started, lap, &decision, "no_continuation");
                    if repaired_last_stint {
                        break;
                    }
                    // A greedy stint may end just before duration while its
                    // next service ends after it. Move that stop one lap earlier
                    // and refill from the replayed resources, without adding wait.
                    let mut trial = decision.clone();
                    trial.pit_stops.pop();
                    let Some(last) = trial.stints.last_mut() else {
                        break;
                    };
                    if last.laps <= 1 {
                        break;
                    }
                    last.laps -= 1;
                    tyre = super::tyres::Choice {
                        compound: last.compound.clone(),
                        fitment: last.tyre_fitment.clone(),
                    };
                    let replayed = replay_model(m, &trial, Some(initial), false)?;
                    if !replayed.feasible {
                        break;
                    }
                    repaired_last_stint = true;
                    (trial, replayed, lap - 1)
                };
                decision = trial;
                lap = end;
                fuel = units(replayed.reserve.fuel.remaining_amount)?;
                ve = units(replayed.reserve.virtual_energy.remaining_amount)?;
                if m.input
                    .event_rules
                    .max_pit_stops
                    .is_some_and(|n| decision.pit_stops.len() >= n)
                {
                    break;
                }
                let Some((next_tyre, change_tyres)) =
                    m.tyres.next(&tyre).into_iter().find(|(_, change)| *change)
                else {
                    break;
                };
                let f = ((m.fuel.capacity - fuel) / m.fuel.step) * m.fuel.step;
                let v = ((m.ve.capacity - ve) / m.ve.step) * m.ve.step;
                let pit = PitDecision {
                    lap,
                    fuel_liters: amount(f),
                    ve_percent: amount(v),
                    compound: next_tyre.compound.clone(),
                    tyre_fitment: next_tyre.fitment.clone(),
                    change_tyres,
                    ..PitDecision::default()
                };
                elapsed = replayed.evaluation.total_seconds + m.pit(&pit).1;
                decision.pit_stops.push(pit);
                fuel += f;
                ve += v;
                tyre = next_tyre;
            }
        }
    }
    Ok(None)
}

fn trace_stop(started: &Instant, lap: u32, decision: &DecisionVector, reason: &str) {
    if std::env::var_os("VANTARE_STRATEGY_TRACE").is_some() {
        eprintln!(
            "{}",
            serde_json::json!({"seedTrace": {"reason": reason,
            "lap": lap, "stints": decision.stints.iter().map(|s| s.laps).collect::<Vec<_>>(),
            "elapsedMicros": started.elapsed().as_micros()}})
        );
    }
}

fn trim_last_pit(
    m: &Model,
    mut best: ReplayResult,
    cancel: &AtomicBool,
    started: &Instant,
    deadline: Option<u64>,
) -> Result<ReplayResult, String> {
    // At most 200 steps per resource; retain the original if less service
    // would move the last lap before the duration or violate its reserve.
    for fuel in [true, false] {
        loop {
            if cancel.load(AtomicOrdering::Relaxed) {
                return Err("cancelled".into());
            }
            if super::deadline_exceeded(started, deadline) {
                return Ok(best);
            }
            let mut trial = best.decision.clone();
            let Some(pit) = trial.pit_stops.last_mut() else {
                break;
            };
            let (load, step) = if fuel {
                (&mut pit.fuel_liters, m.fuel.step)
            } else {
                (&mut pit.ve_percent, m.ve.step)
            };
            let current = units(*load)?;
            if current < step {
                break;
            }
            *load = amount(current - step);
            let replayed = replay_model(m, &trial, None, true)?;
            if !replayed.feasible {
                break;
            }
            best = replayed;
        }
    }
    Ok(best)
}
