//! Application entry point for recalculating an edited stint and stop schedule.
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};

use super::Fallback;
use super::solver::{self, FixedStop, GreedyRefusal, Input, SolverOutcome, StopBounds, Window};

const MAX_PIT_STOPS: usize = 16;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditedPlan {
    /// Competitive laps in each stint; their sum must equal raceLaps.
    pub stints: Vec<u32>,
    /// The lap completed immediately before each pit stop.
    pub pit_stop_laps: Vec<u32>,
}

/// Recalculates cost with the edited stint boundaries fixed as required stops.
///
/// The scalar solver still chooses service amounts. Its current public input
/// cannot pin fuel, VE, or tyre actions from edited pit-stop details.
pub fn recalculate_edited_plan(
    input: &Input,
    edited: &EditedPlan,
    cancel: &AtomicBool,
) -> Result<SolverOutcome, String> {
    recalculate_edited_plan_detailed(input, edited, cancel).map(|(outcome, _)| outcome)
}

/// Like [`recalculate_edited_plan`], also saying whether the greedy fallback was
/// needed, applied or refused, so that the caller can report the cause.
pub fn recalculate_edited_plan_detailed(
    input: &Input,
    edited: &EditedPlan,
    cancel: &AtomicBool,
) -> Result<(SolverOutcome, Fallback), String> {
    recalculate_edited_plan_fixed(input, edited, &[], cancel)
        .map(|recalculation| (recalculation.outcome, recalculation.fallback))
}

/// Un recálculo con cantidades fijadas a mano y su resultado.
#[derive(Clone, Debug)]
pub struct FixedRecalculation {
    pub outcome: SolverOutcome,
    pub fallback: Fallback,
    /// Cuando no hay plan por culpa de lo fijado, la primera parada fijada con la
    /// que deja de haberlo (0 = primera parada). `None` si hay plan, si la causa
    /// es otra (el calendario, las reglas) o si no se puede saber (pasos finos).
    pub unreachable_stop: Option<usize>,
}

/// Como [`recalculate_edited_plan_detailed`], respetando además las cantidades
/// fijadas a mano por parada (`fixed[0]` es la primera parada del calendario
/// editado). El plan lleva exactamente lo fijado o no hay plan; nunca se devuelve
/// uno que lo cambie. Con la lista vacía es el mismo recálculo.
pub fn recalculate_edited_plan_fixed(
    input: &Input,
    edited: &EditedPlan,
    fixed: &[FixedStop],
    cancel: &AtomicBool,
) -> Result<FixedRecalculation, String> {
    let constrained = constrain(input, edited, fixed)?;
    let (outcome, fallback) = solve_with_fallback(&constrained, fixed, cancel)?;
    // This guard is for the scalar solver. A greedy plan cannot trip it: the edited stops
    // are fixed (min = max = their count, one exact window each), so a plan with that many
    // stops has every stop on a window lap, and the greedy plan refuses (`MaxStops`) as
    // soon as it needs one more.
    if outcome.result.feasible
        && (outcome.result.stints != edited.stints
            || outcome
                .result
                .pit_stops
                .iter()
                .map(|stop| stop.lap)
                .collect::<Vec<_>>()
                != edited.pit_stop_laps)
    {
        return Err("solver_did_not_preserve_edited_schedule".into());
    }
    // Defensa: la búsqueda y el respaldo solo prueban la cantidad fijada.
    if outcome.result.feasible
        && outcome
            .result
            .pit_stops
            .iter()
            .zip(fixed)
            .any(|(stop, fixed)| !fixed.kept_by(stop))
    {
        return Err("solver_did_not_preserve_fixed_stops".into());
    }
    let unreachable_stop = unreachable_stop(&constrained, fixed, &outcome, fallback);
    Ok(FixedRecalculation {
        outcome,
        fallback,
        unreachable_stop,
    })
}

/// La entrada con el calendario editado como restricción: tantas paradas como
/// las editadas y una ventana exacta en la vuelta de cada una. Comprueba antes
/// la entrada, el calendario y que nada esté fijado fuera de él. El recálculo y
/// los límites parten de aquí, así que rechazan lo mismo y con el mismo texto.
fn constrain(input: &Input, edited: &EditedPlan, fixed: &[FixedStop]) -> Result<Input, String> {
    input.validate()?;
    validate_edited_plan(input.race_laps, edited)?;

    let stops = edited.pit_stop_laps.len();
    if fixed
        .iter()
        .skip(stops)
        .any(|stop| *stop != FixedStop::default())
    {
        return Err("fixed_stop_outside_edited_schedule".into());
    }
    if input
        .event_rules
        .min_pit_stops
        .is_some_and(|minimum| stops < minimum)
        || input
            .event_rules
            .max_pit_stops
            .is_some_and(|maximum| stops > maximum)
    {
        return Err("edited_stop_count_conflicts_with_event_rules".into());
    }

    let mut constrained = input.clone();
    constrained.event_rules.min_pit_stops = Some(stops);
    constrained.event_rules.max_pit_stops = Some(stops);
    for &lap in &edited.pit_stop_laps {
        if !constrained
            .event_rules
            .required_windows
            .iter()
            .any(|window| window.from_lap == lap && window.to_lap == lap)
        {
            constrained.event_rules.required_windows.push(Window {
                from_lap: lap,
                to_lap: lap,
            });
        }
    }
    if constrained.event_rules.required_windows.len() > MAX_PIT_STOPS {
        return Err("too_many_required_pit_windows".into());
    }
    Ok(constrained)
}

/// Límites de lo que se puede fijar a mano en cada parada del calendario
/// editado (una entrada por parada, en orden), con lo fijado en las demás, en
/// el mismo modelo que [`recalculate_edited_plan_fixed`]: salida con el depósito
/// lleno, misma rejilla y misma tolerancia. Los límites son por recurso: los de
/// combustible no miran la energía, ni las ruedas o las reglas del calendario.
///
/// `Ok(None)`: con pasos finos decide la búsqueda extendida y no hay límites
/// exactos (tampoco parada culpable, como en el recálculo). Los errores son los
/// del recálculo con la misma entrada.
pub fn fixed_stop_bounds(
    input: &Input,
    edited: &EditedPlan,
    fixed: &[FixedStop],
) -> Result<Option<Vec<StopBounds>>, String> {
    let constrained = constrain(input, edited, fixed)?;
    if solver::runs_extended_search(&constrained) {
        return Ok(None);
    }
    solver::stop_bounds(&constrained, &edited.stints, fixed).map(Some)
}

/// La parada fijada que impide el plan. El respaldo ya la trae cuando se negó
/// por eso; si la búsqueda terminó sin plan por su cuenta (lo demostró, o el
/// respaldo no llegó a usarse), se le pregunta al respaldo, que con el calendario
/// fijo es exacto y no prueba ningún plan.
fn unreachable_stop(
    constrained: &Input,
    fixed: &[FixedStop],
    outcome: &SolverOutcome,
    fallback: Fallback,
) -> Option<usize> {
    if outcome.result.feasible || fixed.iter().all(|stop| *stop == FixedStop::default()) {
        return None;
    }
    let refusal = match fallback {
        Fallback::Refused(refusal) => refusal,
        Fallback::NotApplicable | Fallback::Applied => {
            solver::solve_greedy_fallback_fixed(constrained, fixed).err()?
        }
    };
    match refusal {
        GreedyRefusal::FixedAmountUnreachable { stop } => Some(stop),
        _ => None,
    }
}

/// The scalar search first. Only when it ends without any plan (`not_proven`, no
/// feasible plan) the greedy plan is tried on the same constrained input; it keeps
/// the fixed stops and windows or refuses with its typed cause, and the result is
/// never `proven`. A plan, a partial plan or a proven "no solution" is returned
/// untouched. When the greedy plan refuses, the outcome is still the scalar one, which
/// had no plan to begin with, with the cause appended to `certificate.reason` (the
/// typed cause is the returned `Fallback`; no consumer reads the text).
/// `solve_with_hooks` runs `before` and `after` around the greedy plan; tests place a
/// cancellation there.
fn solve_with_fallback(
    constrained: &Input,
    fixed: &[FixedStop],
    cancel: &AtomicBool,
) -> Result<(SolverOutcome, Fallback), String> {
    solve_with_hooks(constrained, fixed, cancel, &|| {}, &|| {})
}

fn solve_with_hooks(
    constrained: &Input,
    fixed: &[FixedStop],
    cancel: &AtomicBool,
    before: &dyn Fn(),
    after: &dyn Fn(),
) -> Result<(SolverOutcome, Fallback), String> {
    let mut outcome = solver::solve_v2_fixed(constrained, fixed, cancel)?;
    let without_plan = outcome.certificate.status == solver::OptimalityStatus::NotProven
        && !outcome.result.feasible;
    if !without_plan {
        return Ok((outcome, Fallback::NotApplicable));
    }
    if solver::runs_extended_search(constrained) {
        return Ok((outcome, Fallback::Refused(solver::GreedyRefusal::NotScalar)));
    }
    before();
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    let greedy = solver::solve_greedy_fallback_fixed(constrained, fixed);
    after();
    if cancel.load(Ordering::Relaxed) {
        return Err("cancelled".into());
    }
    match greedy {
        Ok(plan) => Ok((plan, Fallback::Applied)),
        Err(refusal) => {
            let cause = format!("greedy_plan_unavailable: {}", refusal.code());
            outcome.certificate.reason = Some(match outcome.certificate.reason.take() {
                Some(reason) => format!("{reason}; {cause}"),
                None => cause,
            });
            Ok((outcome, Fallback::Refused(refusal)))
        }
    }
}

fn validate_edited_plan(race_laps: u32, edited: &EditedPlan) -> Result<(), String> {
    if edited.stints.is_empty()
        || edited.stints.len() > MAX_PIT_STOPS + 1
        || edited.pit_stop_laps.len() + 1 != edited.stints.len()
    {
        return Err("invalid_edited_stint_schedule".into());
    }
    let mut completed = 0_u32;
    for (index, &stint_laps) in edited.stints.iter().enumerate() {
        if stint_laps == 0 {
            return Err("invalid_edited_stint_schedule".into());
        }
        completed = completed
            .checked_add(stint_laps)
            .ok_or("invalid_edited_stint_schedule")?;
        if let Some(&stop_lap) = edited.pit_stop_laps.get(index)
            && completed != stop_lap
        {
            return Err("invalid_edited_stint_schedule".into());
        }
    }
    if completed != race_laps || edited.pit_stop_laps.last() == Some(&race_laps) {
        return Err("invalid_edited_stint_schedule".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    /// Bounds of the budget scan of the partial-plan test (it fails loudly past them).
    const MAX_COMPLETING_BUDGET: usize = 20_000;
    const MAX_SCANNED_BUDGETS: usize = 2_000;

    fn solver_input() -> Input {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../../testdata/oracle/solver.json"))
                .expect("scalar input corpus");
        serde_json::from_value(cases[0]["input"].clone()).expect("valid scalar input")
    }

    #[test]
    fn edited_schedule_is_a_solver_constraint_and_returns_recalculated_cost() {
        let input = solver_input();
        let edited = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        let outcome =
            recalculate_edited_plan(&input, &edited, &AtomicBool::new(false)).expect("recalculate");
        assert!(outcome.result.feasible);
        assert_eq!(outcome.result.stints, edited.stints);
        assert_eq!(outcome.result.pit_stops[0].lap, edited.pit_stop_laps[0]);
        assert_eq!(
            outcome.cost_seconds,
            Some(outcome.result.expected.total_seconds)
        );
        let golden: Value =
            serde_json::from_str(include_str!("../../testdata/oracle/edited-plan-v1-go.json"))
                .expect("Go generated edited-plan fixture");
        assert_eq!(outcome.result.feasible, golden["feasible"]);
        let expected_stints: Vec<u32> =
            serde_json::from_value(golden["stints"].clone()).expect("Go stint schedule");
        assert_eq!(outcome.result.stints, expected_stints);
        let expected_stop_laps: Vec<u32> =
            serde_json::from_value(golden["pitStopLaps"].clone()).expect("Go pit stop schedule");
        assert_eq!(
            outcome
                .result
                .pit_stops
                .iter()
                .map(|stop| stop.lap)
                .collect::<Vec<_>>(),
            expected_stop_laps
        );
        assert_eq!(outcome.cost_seconds, golden["costSeconds"].as_f64());
    }

    #[test]
    fn edited_stint_and_stop_shapes_are_checked() {
        let input = solver_input();
        for edited in [
            EditedPlan {
                stints: vec![],
                pit_stop_laps: vec![],
            },
            EditedPlan {
                stints: vec![0, 3],
                pit_stop_laps: vec![1],
            },
            EditedPlan {
                stints: vec![1, 1],
                pit_stop_laps: vec![1],
            },
            EditedPlan {
                stints: vec![1, 2],
                pit_stop_laps: vec![2],
            },
            EditedPlan {
                stints: vec![1, 2],
                pit_stop_laps: vec![3],
            },
        ] {
            assert!(
                recalculate_edited_plan(&input, &edited, &AtomicBool::new(false)).is_err(),
                "{edited:?}"
            );
        }
    }

    #[test]
    fn edited_stop_count_must_fit_existing_event_rules() {
        let mut input = solver_input();
        input.event_rules.min_pit_stops = Some(2);
        let edited = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        assert_eq!(
            recalculate_edited_plan(&input, &edited, &AtomicBool::new(false))
                .expect_err("event minimum conflicts with edit"),
            "edited_stop_count_conflicts_with_event_rules"
        );
    }

    fn manual(laps: u32) -> Input {
        let mut input: Input =
            serde_json::from_str(include_str!("../../testdata/fuji-1450-input.json"))
                .expect("frozen Fuji input");
        input.extra.clear();
        input.race_laps = laps;
        input.budget.p95_millis = 60_000; // the candidate limit, not the clock, ends the search
        input.budget.max_candidates = 250_000;
        input.budget.max_iterations = 1_000_000;
        input
    }

    /// The Fuji witness (236 laps; stints 43-42-42-43-42-24), edited by one lap.
    fn witness(index: Option<usize>, delta: i32) -> EditedPlan {
        let mut edited = EditedPlan {
            stints: vec![43, 42, 42, 43, 42, 24],
            pit_stop_laps: vec![43, 85, 127, 170, 212],
        };
        if let Some(index) = index {
            edited.pit_stop_laps[index] = edited.pit_stop_laps[index]
                .checked_add_signed(delta)
                .expect("lap");
            edited.stints[index] = edited.stints[index].checked_add_signed(delta).expect("lap");
            edited.stints[index + 1] = edited.stints[index + 1]
                .checked_add_signed(-delta)
                .expect("lap");
        }
        edited
    }

    // The scalar search alone ends without a plan for a Fuji race with virtual
    // energy and an exact calendar; the greedy fallback must keep that calendar.
    #[test]
    fn fuji_with_virtual_energy_recalculates_the_edited_schedule_with_the_fallback() {
        for (index, delta) in [(None, 0), (Some(0), -1), (Some(3), -1), (Some(4), -1)] {
            let edited = witness(index, delta);
            // 20.000 candidates are enough for the scalar search to give up without a plan
            // (it does not find one with 250.000 either) and keep the test short.
            let mut input = manual(236);
            input.budget.max_candidates = 20_000;
            let (outcome, fallback) =
                recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                    .expect("recalculate");
            assert!(outcome.result.feasible, "{edited:?}: no plan");
            assert_eq!(outcome.result.stints, edited.stints);
            assert_eq!(
                outcome
                    .result
                    .pit_stops
                    .iter()
                    .map(|s| s.lap)
                    .collect::<Vec<_>>(),
                edited.pit_stop_laps
            );
            assert_eq!(
                outcome.certificate.status,
                solver::OptimalityStatus::NotProven
            );
            assert!(outcome.certificate.proof.is_none());
            assert_eq!(fallback, Fallback::Applied, "{edited:?}");
        }
    }

    // Moving the second stop by +1 gives stints 43-43-41-43-42-24. On the 1 % grid a
    // second 43-lap stint is impossible after a first one of 43: the battery left (0.41 %)
    // plus the largest whole-step top-up is 99.41 %, short of the 99.59 % it needs. The
    // scalar model has the same limit, so this edit has no plan. The greedy plan would
    // need one more stop than the edit allows, so it refuses with `MaxStops` instead of
    // returning a plan that breaks the calendar.
    #[test]
    fn an_edit_that_needs_an_extra_stop_is_refused_with_max_stops() {
        let (outcome, fallback) = recalculate_edited_plan_detailed(
            &manual(236),
            &witness(Some(1), 1),
            &AtomicBool::new(false),
        )
        .expect("a result, not an error");
        assert!(!outcome.result.feasible);
        assert_eq!(fallback, Fallback::Refused(solver::GreedyRefusal::MaxStops));
    }

    // A calendar no plan can follow is still "no plan", never a plan that breaks it,
    // and the cause is typed.
    #[test]
    fn an_impossible_calendar_has_no_plan_and_a_typed_cause() {
        let mut input = manual(236);
        input.budget.max_candidates = 1; // the scalar search ends at once, without a plan
        let edited = EditedPlan {
            stints: vec![100, 136],
            pit_stop_laps: vec![100],
        };
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                .expect("a result, not an error");
        assert!(!outcome.result.feasible);
        assert_eq!(
            fallback,
            Fallback::Refused(solver::GreedyRefusal::MaxStops),
            "a 100-lap stint needs more stops than the one edited"
        );
    }

    // Where the scalar search already gives its answer, nothing changes: the
    // result is the scalar solver's on the same constrained input.
    #[test]
    fn a_calendar_the_scalar_search_solves_is_the_scalar_result() {
        let input = solver_input();
        let edited = EditedPlan {
            stints: vec![1, 2],
            pit_stop_laps: vec![1],
        };
        let mut constrained = input.clone();
        constrained.event_rules.min_pit_stops = Some(1);
        constrained.event_rules.max_pit_stops = Some(1);
        constrained.event_rules.required_windows.push(Window {
            from_lap: 1,
            to_lap: 1,
        });
        let expected = solver::solve_v2_cancellable(&constrained, &AtomicBool::new(false))
            .expect("scalar result");
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                .expect("recalculate");
        assert_eq!(fallback, Fallback::NotApplicable);
        assert_eq!(
            serde_json::to_value(&outcome).expect("json"),
            serde_json::to_value(&expected).expect("json")
        );
    }

    /// The constrained input `recalculate_edited_plan` builds, for comparisons.
    fn constrained(input: &Input, edited: &EditedPlan) -> Input {
        let mut constrained = input.clone();
        constrained.event_rules.min_pit_stops = Some(edited.pit_stop_laps.len());
        constrained.event_rules.max_pit_stops = Some(edited.pit_stop_laps.len());
        for &lap in &edited.pit_stop_laps {
            constrained.event_rules.required_windows.push(Window {
                from_lap: lap,
                to_lap: lap,
            });
        }
        constrained
    }

    // A proven "no solution" of the scalar search is not "fixed" by the greedy plan: the
    // calendar has a 100-lap stint and a 44-lap tank, so there is none, and the search
    // (no virtual energy, a real budget) proves it.
    #[test]
    fn a_proven_no_solution_stays_identical() {
        let mut input = manual(236);
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
        let edited = EditedPlan {
            stints: vec![100, 136],
            pit_stop_laps: vec![100],
        };
        let expected =
            solver::solve_v2_cancellable(&constrained(&input, &edited), &AtomicBool::new(false))
                .expect("scalar result");
        assert_eq!(
            expected.certificate.status,
            solver::OptimalityStatus::NoSolution,
            "the precondition: the scalar search proves it"
        );
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                .expect("recalculate");
        assert_eq!(fallback, Fallback::NotApplicable);
        assert_eq!(
            serde_json::to_value(&outcome).expect("json"),
            serde_json::to_value(&expected).expect("json")
        );
    }

    // A partial scalar result (`not_proven`, but with a plan) is not replaced either.
    // The budget is found by scanning (deterministic, no clock involved).
    #[test]
    fn a_partial_scalar_plan_stays_identical() {
        // A 9-lap race with a tank of about six laps: the scalar search is small, so
        // completing it and scanning the budgets below costs milliseconds.
        let mut input = manual(9);
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
        input.fuel_capacity_liters.value = 12.0;
        let edited = EditedPlan {
            stints: vec![3, 3, 3],
            pit_stop_laps: vec![3, 6],
        };
        let scalar_with = |candidates: usize| {
            let mut budget = input.clone();
            budget.budget.max_candidates = candidates;
            let scalar = solver::solve_v2_cancellable(
                &constrained(&budget, &edited),
                &AtomicBool::new(false),
            )
            .expect("scalar result");
            (budget, scalar)
        };
        // The plan of this calendar is found at the very end of the search, so the
        // partial answers sit just below the budget that completes it: double the
        // budget until the search completes, then scan downwards. Both loops have an
        // explicit bound and fail loudly when it is reached, never by running long.
        let mut complete = 50_usize;
        while scalar_with(complete).1.certificate.status == solver::OptimalityStatus::NotProven {
            complete *= 2;
            assert!(
                complete <= MAX_COMPLETING_BUDGET,
                "the scalar search of this tiny race must complete within {MAX_COMPLETING_BUDGET} candidates"
            );
        }
        let found = (1..complete)
            .rev()
            .take(MAX_SCANNED_BUDGETS)
            .find_map(|candidates| {
                let (budget, scalar) = scalar_with(candidates);
                (scalar.certificate.status == solver::OptimalityStatus::NotProven
                    && scalar.result.feasible)
                    .then_some((budget, scalar))
            });
        let (budget, expected) = found.expect(
            "no budget below the completing one ends partial with a plan (scanned the bounded range)",
        );
        let (outcome, fallback) =
            recalculate_edited_plan_detailed(&budget, &edited, &AtomicBool::new(false))
                .expect("recalculate");
        assert_eq!(fallback, Fallback::NotApplicable);
        assert_eq!(
            serde_json::to_value(&outcome).expect("json"),
            serde_json::to_value(&expected).expect("json")
        );
    }

    // The guard on the edited schedule cannot be tripped by a greedy plan (the edited
    // stops are fixed, so any plan with that many stops is on the window laps): for many
    // generated calendars the recalculation never errors, and any plan is exactly the
    // edited one.
    #[test]
    fn no_generated_calendar_makes_the_schedule_guard_fail() {
        let mut state = 0x2648_u64;
        let mut next = |bound: u64| {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (state >> 33) % bound
        };
        let (mut applied, mut refused, mut other) = (0, 0, 0);
        for _ in 0..120 {
            let mut input = manual(60);
            input.ve_capacity_percent.value = 0.0;
            input.ve_per_lap_percent.value = 0.0;
            input.budget.max_candidates = 200; // the scalar search gives up: the greedy plan decides
            let cuts = 1 + next(3);
            let mut stops: Vec<u32> = (0..cuts)
                .map(|_| u32::try_from(1 + next(59)).expect("lap"))
                .collect();
            stops.sort_unstable();
            stops.dedup();
            let mut stints = vec![];
            let mut last = 0;
            for &stop in &stops {
                stints.push(stop - last);
                last = stop;
            }
            stints.push(60 - last);
            let edited = EditedPlan {
                stints,
                pit_stop_laps: stops,
            };
            let (outcome, fallback) =
                recalculate_edited_plan_detailed(&input, &edited, &AtomicBool::new(false))
                    .expect("never the schedule guard, never an error");
            match fallback {
                Fallback::Applied => {
                    applied += 1;
                    assert!(outcome.result.feasible);
                    assert_eq!(outcome.result.stints, edited.stints);
                }
                Fallback::Refused(_) => {
                    refused += 1;
                    assert!(!outcome.result.feasible);
                }
                Fallback::NotApplicable => other += 1,
            }
        }
        // Both ends of the greedy route must really run, or the guard is never tried.
        assert!(
            applied > 10 && refused > 10,
            "{applied} applied, {refused} refused, {other} not needed"
        );
    }

    // The two cancellation checks around the greedy plan are each protected.
    fn without_plan_input() -> (Input, EditedPlan) {
        let mut input = manual(236);
        input.budget.max_candidates = 1; // the scalar search ends at once, without a plan
        (input, witness(None, 0))
    }

    #[test]
    fn a_cancellation_before_the_greedy_plan_stops_it_from_running() {
        let (input, edited) = without_plan_input();
        let cancel = AtomicBool::new(false);
        let ran = AtomicBool::new(false);
        let result = solve_with_hooks(
            &constrained(&input, &edited),
            &[],
            &cancel,
            &|| cancel.store(true, Ordering::Relaxed),
            &|| ran.store(true, Ordering::Relaxed),
        );
        assert!(!ran.load(Ordering::Relaxed), "the greedy plan must not run");
        assert_eq!(result.expect_err("cancelled"), "cancelled");
    }

    #[test]
    fn a_cancellation_while_the_greedy_plan_runs_publishes_no_plan() {
        let (input, edited) = without_plan_input();
        let cancel = AtomicBool::new(false);
        let result = solve_with_hooks(&constrained(&input, &edited), &[], &cancel, &|| {}, &|| {
            cancel.store(true, Ordering::Relaxed);
        });
        assert_eq!(result.expect_err("cancelled"), "cancelled");
    }
}
