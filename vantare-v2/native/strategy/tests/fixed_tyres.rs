//! Cambiar o no cambiar ruedas, fijado por parada (#2691).
//!
//! `FixedStop::change_tyres` decide en una parada si se montan ruedas nuevas
//! (`Some(true)`), si se sigue con las mismas (`Some(false)`) o si se hace lo
//! de siempre (`None`: en el cálculo escalar, ruedas nuevas). Sin cambio no se
//! paga el tiempo de ruedas, la edad sigue y el desgaste se acumula.
//!
//! La referencia es una fuerza bruta escrita aparte, sin podas ni código del
//! crate: recorre todos los calendarios, todas las cargas de la rejilla y, en
//! cada parada, lo que se haga con las ruedas.
use std::sync::atomic::AtomicBool;

use serde_json::json;
use vantare_strategy::application::{EditedPlan, Fallback, recalculate_edited_plan_fixed};
use vantare_strategy::solver::{
    DecisionVector, FixedStop, GreedyRefusal, Input, OptimalityStatus, PitDecision, ResultV2,
    Scalar, SolverOutcome, StintDecision, replay_decision_v2, runs_extended_search,
    solve_greedy_fallback, solve_greedy_fallback_fixed, solve_v2_cancellable, solve_v2_fixed,
};

struct Rng(u64);
impl Rng {
    fn below(&mut self, bound: u64) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) % bound
    }
    fn pick<T: Copy>(&mut self, options: &[T]) -> T {
        options[usize::try_from(self.below(options.len() as u64)).expect("índice")]
    }
    fn index(&mut self, bound: usize) -> usize {
        usize::try_from(self.below(bound as u64)).expect("índice")
    }
}

fn close(left: f64, right: f64) -> bool {
    (left - right).abs() <= left.abs().max(right.abs()).max(1.0) * 1e-9
}

// ---------------------------------------------------------------------------
// Carreras pequeñas y su modelo independiente.
// ---------------------------------------------------------------------------

/// Lo que la fuerza bruta sabe de una carrera: sale del generador, no del crate.
/// Combustible en litros enteros; sin energía virtual.
#[derive(Clone, Debug)]
struct Race {
    laps: u32,
    base: f64,
    /// Lo que pierde cada vuelta por cada vuelta de edad de las ruedas.
    wear: f64,
    formation: f64,
    transit: f64,
    refuel_rate: f64,
    tyre_seconds: f64,
    parallel: bool,
    tyre_life: u32,
    capacity: u32,
    per_lap: u32,
    step: u32,
    min_stops: Option<usize>,
    max_stops: Option<usize>,
}

/// Lo fijado en una parada: litros y qué se hace con las ruedas.
type Fixed = (Option<u32>, Option<bool>);

impl Race {
    fn random(rng: &mut Rng, rules: bool, more_laps: u64) -> Self {
        let laps = u32::try_from(3 + rng.below(6 + more_laps)).expect("vueltas");
        let (mut min_stops, mut max_stops) = (None, None);
        if rules {
            match rng.below(5) {
                0 => min_stops = Some(rng.index(3)),
                1 => max_stops = Some(1 + rng.index(3)),
                2 => {
                    let minimum = rng.index(2);
                    min_stops = Some(minimum);
                    max_stops = Some(minimum + 1 + rng.index(2));
                }
                _ => {}
            }
        }
        Self {
            laps,
            base: rng.pick(&[60.0, 90.5]),
            wear: rng.pick(&[0.0, 0.25, 0.8, 2.0]),
            formation: rng.pick(&[0.0, 30.0]),
            transit: rng.pick(&[5.0, 20.0]),
            refuel_rate: rng.pick(&[1.0, 2.0, 4.0]),
            tyre_seconds: rng.pick(&[0.0, 3.0, 10.0]),
            parallel: rng.below(2) == 0,
            tyre_life: rng.pick(&[0, 0, 3, 4, 6]),
            capacity: rng.pick(&[8, 10, 12]),
            per_lap: rng.pick(&[2, 3, 4]),
            step: rng.pick(&[2, 4]),
            min_stops,
            max_stops,
        }
    }

    fn input(&self) -> Input {
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
                .expect("entrada congelada de Fuji");
        input.extra.clear();
        input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
        input.budget.max_candidates = 1_000_000;
        input.budget.max_iterations = 1_000_000;
        input.race_laps = self.laps;
        input.base_lap_seconds = Scalar::manual(self.base);
        input.degradation_per_lap_seconds = Scalar::manual(self.wear);
        input.formation.seconds = Scalar::manual(self.formation);
        input.pit_cost.transit_seconds = Scalar::manual(self.transit);
        input.pit_cost.refuel_rate_l_per_s = Scalar::manual(self.refuel_rate);
        input.pit_cost.tyre_seconds = Scalar::manual(self.tyre_seconds);
        input.pit_cost.service_mode = if self.parallel {
            "parallel"
        } else {
            "sequential"
        }
        .into();
        input.tyre_life_laps = Scalar::manual(f64::from(self.tyre_life));
        input.fuel_capacity_liters = Scalar::manual(f64::from(self.capacity));
        input.fuel_per_lap_liters = Scalar::manual(f64::from(self.per_lap));
        input.discretization.fuel_liters = f64::from(self.step);
        input.fuel_reserve = serde_json::Value::Null;
        input.virtual_energy_reserve = serde_json::Value::Null;
        input.ve_capacity_percent = Scalar::manual(0.0);
        input.ve_per_lap_percent = Scalar::manual(0.0);
        input.event_rules.min_pit_stops = self.min_stops;
        input.event_rules.max_pit_stops = self.max_stops;
        input.event_rules.required_windows.clear();
        input
    }

    /// Un tramo de `laps` vueltas con ruedas que ya llevaban `age` vueltas:
    /// la vuelta en que las ruedas hacen su vuelta número `a` pierde
    /// `wear × (a − 1)`.
    fn stint_seconds(&self, age: u32, laps: u32) -> f64 {
        f64::from(laps) * self.base
            + (1..=laps)
                .map(|lap| self.wear * f64::from(age + lap - 1))
                .sum::<f64>()
    }

    fn pit_seconds(&self, liters: u32, change: bool) -> f64 {
        let fuel = f64::from(liters) / self.refuel_rate;
        let tyres = if change { self.tyre_seconds } else { 0.0 };
        self.transit
            + if self.parallel {
                fuel.max(tyres)
            } else {
                fuel + tyres
            }
    }
}

fn fixed_stops(fixed: &[Fixed]) -> Vec<FixedStop> {
    fixed
        .iter()
        .map(|&(fuel, change_tyres)| FixedStop {
            fuel_liters: fuel.map(f64::from),
            ve_percent: None,
            change_tyres,
        })
        .collect()
}

/// Paradas que hacen falta para respetar lo fijado.
fn required_stops(fixed: &[Fixed]) -> usize {
    fixed
        .iter()
        .rposition(|stop| *stop != (None, None))
        .map_or(0, |last| last + 1)
}

/// Fuerza bruta: todos los planes, sin podas de coste. Con `calendar`, solo los
/// planes con exactamente esos tramos. Con `free_tyres`, en cada parada se
/// prueba a cambiar y a no cambiar; si no, se hace lo fijado, y cambiar si no
/// hay nada fijado.
struct Brute<'a> {
    race: &'a Race,
    fixed: &'a [Fixed],
    calendar: Option<&'a [u32]>,
    free_tyres: bool,
    best: Option<f64>,
}

impl Brute<'_> {
    fn go(&mut self, done: u32, fuel: u32, age: u32, stops: usize, seconds: f64) {
        let race = self.race;
        let lengths = match self.calendar {
            Some(calendar) => match calendar.get(stops) {
                Some(&laps) => laps..=laps,
                None => return,
            },
            None => 1..=race.laps - done,
        };
        for laps in lengths {
            if done + laps > race.laps
                || laps * race.per_lap > fuel
                || (race.tyre_life > 0 && age + laps > race.tyre_life)
            {
                break;
            }
            let seconds = seconds + race.stint_seconds(age, laps);
            let left = fuel - laps * race.per_lap;
            if done + laps == race.laps {
                let valid = race.min_stops.is_none_or(|n| stops >= n)
                    && race.max_stops.is_none_or(|n| stops <= n)
                    && stops >= required_stops(self.fixed)
                    && self.calendar.is_none_or(|c| stops + 1 == c.len());
                if valid && self.best.is_none_or(|best| seconds < best) {
                    self.best = Some(seconds);
                }
                continue;
            }
            if race.max_stops.is_some_and(|n| stops + 1 > n) {
                continue;
            }
            let (fixed_fuel, fixed_tyres) = self.fixed.get(stops).copied().unwrap_or_default();
            let loads: Vec<u32> = match fixed_fuel {
                Some(liters) if left + liters <= race.capacity => vec![liters],
                Some(_) => vec![],
                None => (0..=(race.capacity - left) / race.step)
                    .map(|n| n * race.step)
                    .collect(),
            };
            let tyres: &[bool] = if self.free_tyres {
                &[true, false]
            } else if fixed_tyres == Some(false) {
                &[false]
            } else {
                &[true]
            };
            for &load in &loads {
                for &change in tyres {
                    self.go(
                        done + laps,
                        left + load,
                        if change { 0 } else { age + laps },
                        stops + 1,
                        seconds + race.pit_seconds(load, change),
                    );
                }
            }
        }
    }
}

fn brute(race: &Race, fixed: &[Fixed], calendar: Option<&[u32]>) -> Option<f64> {
    let mut search = Brute {
        race,
        fixed,
        calendar,
        free_tyres: false,
        best: None,
    };
    search.go(0, race.capacity, 0, 0, race.formation);
    search.best
}

/// El plan más rápido si en cada parada se pudiera elegir qué hacer con las ruedas.
fn brute_choosing_tyres(race: &Race) -> Option<f64> {
    let mut search = Brute {
        race,
        fixed: &[],
        calendar: None,
        free_tyres: true,
        best: None,
    };
    search.go(0, race.capacity, 0, 0, race.formation);
    search.best
}

/// Comprueba un plan publicado con el modelo independiente: combustible, vida
/// de las ruedas, reglas, lo fijado y el tiempo que declara.
fn assert_valid_plan(race: &Race, fixed: &[Fixed], result: &ResultV2, context: &str) {
    assert_eq!(
        result.stints.len(),
        result.pit_stops.len() + 1,
        "{context}: tramos y paradas"
    );
    let (mut fuel, mut age, mut done) = (i64::from(race.capacity), 0u32, 0u32);
    let mut seconds = race.formation;
    for (index, &laps) in result.stints.iter().enumerate() {
        assert!(laps > 0, "{context}: tramo {index} vacío");
        assert!(
            race.tyre_life == 0 || age + laps <= race.tyre_life,
            "{context}: las ruedas no aguantan el tramo {index} ({age} + {laps} vueltas)"
        );
        fuel -= i64::from(laps * race.per_lap);
        assert!(fuel >= 0, "{context}: sin combustible en el tramo {index}");
        seconds += race.stint_seconds(age, laps);
        age += laps;
        done += laps;
        if let Some(stop) = result.pit_stops.get(index) {
            assert_eq!(stop.lap, done, "{context}: vuelta de la parada {index}");
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            // litros enteros y pequeños del generador.
            let load = stop.fuel_liters.round() as u32;
            assert!(
                close(stop.fuel_liters, f64::from(load)) && load.is_multiple_of(race.step),
                "{context}: parada {index} fuera de la rejilla"
            );
            let (fixed_fuel, fixed_tyres) = fixed.get(index).copied().unwrap_or_default();
            assert!(
                fixed_fuel.is_none_or(|liters| liters == load),
                "{context}: la parada {index} no carga lo fijado ({stop:?})"
            );
            assert_eq!(
                stop.change_tyres,
                fixed_tyres.unwrap_or(true),
                "{context}: ruedas de la parada {index}"
            );
            fuel += i64::from(load);
            assert!(
                fuel <= i64::from(race.capacity),
                "{context}: la parada {index} no cabe"
            );
            seconds += race.pit_seconds(load, stop.change_tyres);
            if stop.change_tyres {
                age = 0;
            }
        }
    }
    let stops = result.pit_stops.len();
    assert_eq!(done, race.laps, "{context}: vueltas");
    assert!(
        race.min_stops.is_none_or(|n| stops >= n)
            && race.max_stops.is_none_or(|n| stops <= n)
            && stops >= required_stops(fixed),
        "{context}: número de paradas"
    );
    assert!(
        close(seconds, result.expected.total_seconds),
        "{context}: declara {} s y son {seconds} s",
        result.expected.total_seconds
    );
}

fn solve_fixed(input: &Input, fixed: &[Fixed]) -> SolverOutcome {
    solve_v2_fixed(input, &fixed_stops(fixed), &AtomicBool::new(false)).expect("resultado")
}

/// Una o dos de las tres primeras paradas con las ruedas fijadas (casi siempre
/// «no cambiar») y, a veces, también los litros.
fn some_fixed(rng: &mut Rng, race: &Race) -> Vec<Fixed> {
    let mut fixed: Vec<Fixed> = vec![(None, None); 3];
    for _ in 0..=rng.below(2) {
        let stop = rng.index(3);
        fixed[stop].1 = Some(rng.below(5) == 0);
        if rng.below(4) == 0 {
            let steps =
                u32::try_from(rng.below(u64::from(race.capacity / race.step) + 1)).expect("pasos");
            fixed[stop].0 = Some(steps * race.step);
        }
    }
    fixed
}

/// Lo que se exige de la búsqueda frente a la fuerza bruta, con y sin plan.
/// Devuelve si hay plan y si alguna parada del plan no cambia ruedas.
fn assert_search_matches_brute(
    input: &Input,
    race: &Race,
    fixed: &[Fixed],
    context: &str,
) -> (bool, bool) {
    let outcome = solve_fixed(input, fixed);
    assert_eq!(
        outcome.certificate.fixed_stops,
        fixed.iter().filter(|stop| **stop != (None, None)).count(),
        "{context}: paradas fijadas en el certificado"
    );
    let Some(expected) = brute(race, fixed, None) else {
        assert_eq!(
            outcome.certificate.status,
            OptimalityStatus::NoSolution,
            "{context}: la fuerza bruta no encuentra ningún plan"
        );
        assert!(!outcome.result.feasible, "{context}");
        return (false, false);
    };
    assert_eq!(
        outcome.certificate.status,
        OptimalityStatus::Proven,
        "{context}: hay plan ({expected} s) y la búsqueda dice {:?}",
        outcome.certificate.reason
    );
    assert_valid_plan(race, fixed, &outcome.result, context);
    let cost = outcome.cost_seconds.expect("coste");
    assert!(
        close(cost, expected),
        "{context}: la búsqueda da {cost} s y el más rápido que respeta lo fijado son {expected} s"
    );
    // El replay del plan publicado da el mismo tiempo que la búsqueda.
    let replay = replay_decision_v2(input, &decision_of(&outcome.result)).expect("replay");
    assert!(replay.feasible, "{context}: {:?}", replay.reasons);
    assert!(
        close(replay.evaluation.total_seconds, cost),
        "{context}: el replay da {} s",
        replay.evaluation.total_seconds
    );
    let kept = outcome
        .result
        .pit_stops
        .iter()
        .any(|stop| !stop.change_tyres);
    (true, kept)
}

fn decision_of(result: &ResultV2) -> DecisionVector {
    result.best.clone().unwrap_or_else(|| DecisionVector {
        stints: result
            .stints
            .iter()
            .enumerate()
            .map(|(index, &laps)| StintDecision {
                index,
                laps,
                ..StintDecision::default()
            })
            .collect(),
        pit_stops: result
            .pit_stops
            .iter()
            .map(|stop| PitDecision {
                lap: stop.lap,
                fuel_liters: stop.fuel_liters,
                ve_percent: stop.ve_percent,
                change_tyres: stop.change_tyres,
                ..PitDecision::default()
            })
            .collect(),
    })
}

// ---------------------------------------------------------------------------
// La búsqueda frente a la fuerza bruta.
// ---------------------------------------------------------------------------

#[test]
fn the_scalar_search_finds_the_fastest_plan_with_the_tyres_fixed_per_stop() {
    let mut rng = Rng(0x2691_1001);
    let (mut plans, mut none, mut kept) = (0, 0, 0);
    for index in 0..300 {
        let race = Race::random(&mut rng, true, 0);
        let input = race.input();
        let fixed = some_fixed(&mut rng, &race);
        assert!(
            !runs_extended_search(&input),
            "caso {index}: debe ser escalar"
        );
        let context = format!("caso {index} {race:?} {fixed:?}");
        let (plan, keeps) = assert_search_matches_brute(&input, &race, &fixed, &context);
        plans += usize::from(plan);
        none += usize::from(!plan);
        kept += usize::from(keeps);
    }
    assert!(
        plans > 80 && none > 60 && kept > 60,
        "corpus pobre: {plans} con plan, {none} sin plan, {kept} con ruedas sin cambiar"
    );
}

/// La búsqueda extendida, con las mismas carreras: se llega a ella con una carga
/// inicial explícita (el depósito lleno, que es lo que ya supone el modelo).
#[test]
fn the_extended_search_finds_the_fastest_plan_with_the_tyres_fixed_per_stop() {
    let mut rng = Rng(0x2691_1002);
    let (mut plans, mut none, mut kept) = (0, 0, 0);
    for index in 0..160 {
        let race = Race::random(&mut rng, true, 0);
        let mut input = race.input();
        input.extra.insert(
            "initialFuelLiters".into(),
            json!(Scalar::manual(input.fuel_capacity_liters.value)),
        );
        input.budget.max_candidates = 0; // el límite propio de la búsqueda extendida
        input.budget.max_iterations = 0;
        assert!(
            runs_extended_search(&input),
            "caso {index}: debe ser extendida"
        );
        let fixed = some_fixed(&mut rng, &race);
        let context = format!("caso {index} {race:?} {fixed:?}");
        let (plan, keeps) = assert_search_matches_brute(&input, &race, &fixed, &context);
        plans += usize::from(plan);
        none += usize::from(!plan);
        kept += usize::from(keeps);
    }
    assert!(
        plans > 40 && none > 30 && kept > 30,
        "corpus pobre: {plans} con plan, {none} sin plan, {kept} con ruedas sin cambiar"
    );
}

/// Todas las formas de fijar las ruedas, una a una: la mejor de todas es el plan
/// que elegiría alguien que pudiera decidir en cada parada si cambia o no.
#[test]
fn the_best_over_every_way_of_fixing_the_tyres_is_the_best_plan_choosing_them() {
    let mut rng = Rng(0x2691_1003);
    let (mut keeping_wins, mut changing_wins) = (0, 0);
    for index in 0..80 {
        let mut race = Race::random(&mut rng, false, 0);
        race.max_stops = Some(3);
        let expected = brute_choosing_tyres(&race);
        let (mut best, mut best_keeps) = (None::<f64>, false);
        for stops in 0..=3usize {
            // Exactamente `stops` paradas, con cada combinación de ruedas.
            let mut exact = race.clone();
            exact.min_stops = Some(stops);
            exact.max_stops = Some(stops);
            for pattern in 0..1u32 << stops {
                let fixed: Vec<Fixed> = (0..stops)
                    .map(|stop| (None, Some(pattern & (1 << stop) != 0)))
                    .collect();
                let context = format!("caso {index} {exact:?} {fixed:?}");
                let outcome = solve_fixed(&exact.input(), &fixed);
                let Some(cost) = outcome.cost_seconds else {
                    assert_eq!(
                        outcome.certificate.status,
                        OptimalityStatus::NoSolution,
                        "{context}"
                    );
                    assert_eq!(brute(&exact, &fixed, None), None, "{context}");
                    continue;
                };
                assert_valid_plan(&exact, &fixed, &outcome.result, &context);
                if best.is_none_or(|best| cost < best - 1e-9) {
                    best = Some(cost);
                    best_keeps = fixed.iter().any(|stop| stop.1 == Some(false));
                }
            }
        }
        match (best, expected) {
            (Some(best), Some(expected)) => assert!(
                close(best, expected),
                "caso {index} {race:?}: {best} s frente a {expected} s"
            ),
            (None, None) => {}
            other => panic!("caso {index} {race:?}: {other:?}"),
        }
        if best.is_some() {
            keeping_wins += usize::from(best_keeps);
            changing_wins += usize::from(!best_keeps);
        }
    }
    assert!(
        keeping_wins > 10 && changing_wins > 10,
        "corpus pobre: gana no cambiar en {keeping_wins} y cambiar en {changing_wins}"
    );
}

/// Fijar «ruedas nuevas» en todas las paradas es lo que el cálculo hace solo.
#[test]
fn fixing_new_tyres_at_every_stop_is_what_the_calculation_does_by_itself() {
    let mut rng = Rng(0x2691_1004);
    let mut plans = 0;
    for index in 0..120 {
        let mut race = Race::random(&mut rng, false, 0);
        let stops = rng.index(4);
        race.min_stops = Some(stops);
        race.max_stops = Some(stops);
        let input = race.input();
        let automatic = solve_v2_cancellable(&input, &AtomicBool::new(false)).expect("resultado");
        let fixed: Vec<Fixed> = vec![(None, Some(true)); stops];
        let pinned = solve_fixed(&input, &fixed);
        assert_eq!(
            json!(pinned.result),
            json!(automatic.result),
            "caso {index} {race:?}"
        );
        assert_eq!(pinned.certificate.status, automatic.certificate.status);
        assert_eq!(pinned.certificate.fixed_stops, stops);
        plans += usize::from(pinned.result.feasible);
    }
    assert!(plans > 40, "corpus pobre: {plans} con plan");
}

// ---------------------------------------------------------------------------
// «Ajustar paradas»: calendario fijo. El respaldo es exacto y señala la parada.
// ---------------------------------------------------------------------------

fn random_calendar(rng: &mut Rng, laps: u32) -> EditedPlan {
    let mut stops: Vec<u32> = (0..=rng.below(3))
        .map(|_| u32::try_from(1 + rng.below(u64::from(laps - 1))).expect("vuelta"))
        .collect();
    stops.sort_unstable();
    stops.dedup();
    let mut stints = Vec::new();
    let mut last = 0;
    for &stop in &stops {
        stints.push(stop - last);
        last = stop;
    }
    stints.push(laps - last);
    EditedPlan {
        stints,
        pit_stop_laps: stops,
    }
}

/// Primera parada fijada con la que la fuerza bruta deja de encontrar plan en
/// ese calendario; `None` si tampoco lo hay sin fijar nada.
fn expected_blame(race: &Race, fixed: &[Fixed], calendar: &[u32]) -> Option<usize> {
    brute(race, &[], Some(calendar))?;
    (0..fixed.len())
        .filter(|&stop| fixed[stop] != (None, None))
        .find(|&stop| brute(race, &fixed[..=stop], Some(calendar)).is_none())
}

#[test]
fn with_a_fixed_calendar_kept_tyres_have_a_plan_exactly_when_one_exists() {
    let mut rng = Rng(0x2691_1005);
    let (mut applied, mut blamed, mut calendar_fault, mut kept) = (0, 0, 0, 0);
    for index in 0..420 {
        let race = Race::random(&mut rng, false, 3);
        let input = race.input();
        // Dos de cada tres calendarios son los del plan sin fijar (seguro que se
        // pueden seguir); el resto, al azar.
        let edited = match solve_greedy_fallback(&input) {
            Ok(plan) if index % 3 != 0 && !plan.result.pit_stops.is_empty() => EditedPlan {
                pit_stop_laps: plan.result.pit_stops.iter().map(|stop| stop.lap).collect(),
                stints: plan.result.stints,
            },
            _ => random_calendar(&mut rng, race.laps),
        };
        let stops = edited.pit_stop_laps.len();
        let mut fixed = some_fixed(&mut rng, &race);
        fixed.truncate(stops);
        let context = format!("caso {index} {race:?} {edited:?} {fixed:?}");
        let expected = brute(&race, &fixed, Some(&edited.stints));
        let blame = if expected.is_some() {
            None
        } else {
            expected_blame(&race, &fixed, &edited.stints)
        };
        // Con 1 candidato decide el respaldo; con un millón, la búsqueda.
        for candidates in [1, 1_000_000] {
            let mut budget = input.clone();
            budget.budget.max_candidates = candidates;
            let recalculation = recalculate_edited_plan_fixed(
                &budget,
                &edited,
                &fixed_stops(&fixed),
                &AtomicBool::new(false),
            )
            .unwrap_or_else(|error| panic!("{context}: {error}"));
            let result = &recalculation.outcome.result;
            assert_eq!(
                result.feasible,
                expected.is_some(),
                "{context} ({candidates} candidatos): {:?}",
                recalculation.fallback
            );
            assert_eq!(
                recalculation.unreachable_stop, blame,
                "{context} ({candidates} candidatos): parada culpable"
            );
            let Some(expected) = expected else {
                continue;
            };
            assert_eq!(result.stints, edited.stints, "{context}");
            assert_valid_plan(&race, &fixed, result, &context);
            let cost = recalculation.outcome.cost_seconds.expect("coste");
            if candidates == 1 {
                assert_eq!(recalculation.fallback, Fallback::Applied, "{context}");
                assert!(cost >= expected - 1e-9, "{context}");
            } else {
                assert_eq!(
                    recalculation.outcome.certificate.status,
                    OptimalityStatus::Proven,
                    "{context}"
                );
                assert!(
                    close(cost, expected),
                    "{context}: {cost} s frente a {expected} s"
                );
            }
        }
        if expected.is_some() {
            applied += 1;
            kept += usize::from(fixed.iter().any(|stop| stop.1 == Some(false)));
        } else if blame.is_some() {
            blamed += 1;
        } else {
            calendar_fault += 1;
        }
    }
    assert!(
        applied > 40 && blamed > 40 && calendar_fault > 40 && kept > 25,
        "corpus pobre: {applied} con plan, {blamed} con parada culpable, {calendar_fault} por el calendario, {kept} con ruedas sin cambiar"
    );
}

/// Con calendario libre el respaldo no prueba todos los calendarios, pero lo
/// que devuelve tiene que ser cierto: un plan válido que respeta lo fijado, la
/// causa de siempre si tampoco hay plan sin fijar, o una parada que de verdad
/// está fijada.
#[test]
fn with_a_free_calendar_the_fallback_never_returns_a_plan_that_breaks_the_tyres() {
    let mut rng = Rng(0x2691_1006);
    let (mut plans, mut blamed, mut other, mut kept) = (0, 0, 0, 0);
    for index in 0..400 {
        let race = Race::random(&mut rng, true, 3);
        let input = race.input();
        let fixed = some_fixed(&mut rng, &race);
        let context = format!("caso {index} {race:?} {fixed:?}");
        match solve_greedy_fallback_fixed(&input, &fixed_stops(&fixed)) {
            Ok(outcome) => {
                plans += 1;
                assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
                assert_valid_plan(&race, &fixed, &outcome.result, &context);
                let best = brute(&race, &fixed, None).expect("si hay respaldo, hay plan");
                assert!(
                    outcome.result.expected.total_seconds >= best - 1e-9,
                    "{context}"
                );
                kept += usize::from(outcome.result.pit_stops.iter().any(|s| !s.change_tyres));
            }
            Err(GreedyRefusal::FixedAmountUnreachable { stop }) => {
                blamed += 1;
                assert!(
                    fixed[stop] != (None, None),
                    "{context}: parada {stop} no fijada"
                );
                assert!(solve_greedy_fallback(&input).is_ok(), "{context}");
            }
            Err(refusal) => {
                other += 1;
                assert_eq!(
                    solve_greedy_fallback(&input).expect_err("sin fijar tampoco hay plan"),
                    refusal,
                    "{context}"
                );
            }
        }
    }
    assert!(
        plans > 60 && blamed > 30 && other > 20 && kept > 40,
        "corpus pobre: {plans} planes, {blamed} con parada culpable, {other} por otra causa, {kept} con ruedas sin cambiar"
    );
}

// ---------------------------------------------------------------------------
// Casos a mano.
// ---------------------------------------------------------------------------

/// Doce vueltas, depósito de 12 L a 2 L por vuelta, vida de ruedas de 8 vueltas,
/// 0,5 s de pérdida por vuelta de edad y 10 s de cambio de ruedas.
fn twelve_laps() -> Race {
    Race {
        laps: 12,
        base: 90.0,
        wear: 0.5,
        formation: 0.0,
        transit: 20.0,
        refuel_rate: 2.0,
        tyre_seconds: 10.0,
        parallel: false,
        tyre_life: 8,
        capacity: 12,
        per_lap: 2,
        step: 2,
        min_stops: None,
        max_stops: None,
    }
}

fn keep() -> FixedStop {
    FixedStop {
        change_tyres: Some(false),
        ..FixedStop::default()
    }
}

#[test]
fn keeping_the_tyres_pays_the_accumulated_wear_and_saves_the_tyre_service() {
    let race = twelve_laps();
    let edited = EditedPlan {
        stints: vec![6, 2, 4],
        pit_stop_laps: vec![6, 8],
    };
    let recalculate = |fixed: &[FixedStop]| {
        recalculate_edited_plan_fixed(&race.input(), &edited, fixed, &AtomicBool::new(false))
            .expect("recálculo")
    };
    let automatic = recalculate(&[]);
    let kept = recalculate(&[keep()]);
    let (automatic, kept) = (&automatic.outcome.result, &kept.outcome.result);
    assert!(automatic.feasible && kept.feasible);
    assert_eq!(
        kept.pit_stops
            .iter()
            .map(|stop| stop.change_tyres)
            .collect::<Vec<_>>(),
        [false, true]
    );
    // Desgaste: 6 vueltas nuevas (0,5 × 15), 2 vueltas con edad 6 (0,5 × (6 + 7))
    // y 4 nuevas (0,5 × 6), frente a 0,5 × (15 + 1 + 6) cambiando siempre.
    assert!(close(automatic.expected.degradation_seconds, 11.0));
    assert!(close(kept.expected.degradation_seconds, 17.0));
    // En boxes se ahorra el cambio de ruedas de la primera parada.
    assert!(close(
        automatic.expected.pit_seconds - kept.expected.pit_seconds,
        10.0
    ));
    assert!(close(
        kept.expected.total_seconds - automatic.expected.total_seconds,
        6.0 - 10.0
    ));
}

#[test]
fn kept_tyres_that_outlast_their_life_have_no_plan_and_name_their_stop() {
    let race = twelve_laps();
    let edited = EditedPlan {
        stints: vec![4, 4, 4],
        pit_stop_laps: vec![4, 8],
    };
    for candidates in [1, 1_000_000] {
        let mut input = race.input();
        input.budget.max_candidates = candidates;
        let recalculate = |fixed: &[FixedStop]| {
            recalculate_edited_plan_fixed(&input, &edited, fixed, &AtomicBool::new(false))
                .expect("recálculo")
        };
        // Ocho vueltas con las mismas ruedas: justo la vida.
        let fits = recalculate(&[keep()]);
        assert!(fits.outcome.result.feasible, "{candidates} candidatos");
        assert_eq!(fits.unreachable_stop, None);
        // Doce vueltas: la segunda parada sin cambio ya no cabe.
        let worn_out = recalculate(&[keep(), keep()]);
        assert!(!worn_out.outcome.result.feasible, "{candidates} candidatos");
        assert_eq!(
            worn_out.unreachable_stop,
            Some(1),
            "{candidates} candidatos"
        );
    }
}

/// Con calendario libre el respaldo alarga cada tramo todo lo que puede. Si la
/// parada siguiente no cambia ruedas, tiene que guardarles vida para el tramo
/// de después: aquí, ocho vueltas de vida para dos tramos.
#[test]
fn the_fallback_shares_the_tyre_life_between_the_stints_that_keep_the_tyres() {
    let race = twelve_laps();
    let outcome = solve_greedy_fallback_fixed(&race.input(), &[keep()]).expect("plan");
    let result = &outcome.result;
    assert_valid_plan(&race, &[(None, Some(false))], result, "respaldo");
    assert!(!result.pit_stops[0].change_tyres);
    assert_eq!(
        result.stints[0] + result.stints[1],
        8,
        "{:?}",
        result.stints
    );
    // Sin esa previsión el primer tramo gastaría las ocho vueltas de vida.
    assert!(result.stints[0] < 8);
}

#[test]
fn a_fixed_tyre_choice_counts_as_a_fixed_stop_and_survives_in_the_plan() {
    let race = twelve_laps();
    let outcome = solve_v2_fixed(
        &race.input(),
        &[FixedStop::default(), keep()],
        &AtomicBool::new(false),
    )
    .expect("resultado");
    assert_eq!(outcome.certificate.status, OptimalityStatus::Proven);
    assert_eq!(outcome.certificate.fixed_stops, 1);
    assert!(outcome.result.pit_stops.len() >= 2);
    assert!(outcome.result.pit_stops[0].change_tyres);
    assert!(!outcome.result.pit_stops[1].change_tyres);
}

/// Sin nada fijado en las ruedas, el JSON de lo fijado es el de antes.
#[test]
fn an_automatic_tyre_choice_is_not_written() {
    let fuel_only = FixedStop {
        fuel_liters: Some(4.0),
        ..FixedStop::default()
    };
    assert_eq!(json!(fuel_only), json!({"fuelLiters": 4.0}));
    assert_eq!(json!(keep()), json!({"changeTyres": false}));
    let read: FixedStop = serde_json::from_value(json!({"fuelLiters": 4.0})).expect("lectura");
    assert_eq!(read, fuel_only);
}

// ---------------------------------------------------------------------------
// Medición.
// ---------------------------------------------------------------------------

/// Medición de la búsqueda escalar con ruedas sin cambiar y calendario libre
/// (#2691). Con la edad de las ruedas en la clave, planes que antes se fundían
/// (mismas cargas, distinta edad) son estados distintos: aquí se ve cuánto
/// trabajo y cuánto tiempo cuesta. Ignorado por defecto:
/// `cargo test -p vantare-strategy --release --test fixed_tyres -- --ignored --nocapture --test-threads=1`.
#[test]
#[ignore = "measurement"]
fn measuring_the_scalar_search_with_kept_tyres_and_a_free_calendar() {
    let fuji = |laps: u32, candidates: usize| {
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
                .expect("entrada congelada de Fuji");
        input.extra.clear();
        input.race_laps = laps;
        input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
        input.budget.max_candidates = candidates;
        input.budget.max_iterations = 1_000_000;
        input.ve_capacity_percent.value = 0.0;
        input.ve_per_lap_percent.value = 0.0;
        input.degradation_per_lap_seconds.value = 0.05;
        input.tyre_life_laps.value = 30.0;
        input
    };
    // Una carrera que la búsqueda termina entera y otra que corta el límite.
    let mut small = fuji(30, 1_000_000);
    small.fuel_capacity_liters.value = 24.0;
    small.discretization.fuel_liters = 2.0;
    let change = FixedStop {
        change_tyres: Some(true),
        ..FixedStop::default()
    };
    for (race, input) in [("30 vueltas", small), ("60 vueltas", fuji(60, 250_000))] {
        for (name, fixed) in [
            ("nada", vec![]),
            ("parada 1: nuevas", vec![change]),
            ("parada 1: no cambiar", vec![keep()]),
            ("paradas 1 y 2: no cambiar", vec![keep(), keep()]),
            ("parada 2: no cambiar", vec![FixedStop::default(), keep()]),
            ("paradas 1, 2 y 3: no cambiar", vec![keep(), keep(), keep()]),
        ] {
            let mut times = Vec::new();
            let mut outcome = None;
            for _ in 0..5 {
                let started = std::time::Instant::now();
                outcome = Some(
                    solve_v2_fixed(&input, &fixed, &AtomicBool::new(false)).expect("resultado"),
                );
                times.push(started.elapsed());
            }
            times.sort_unstable();
            let outcome = outcome.expect("resultado");
            println!(
                "SIN-CAMBIO carrera={race} fijado=«{name}» min={:?} mediana={:?} trabajo={} estado={:?} motivo={:?} coste={:?} tramos={:?} cambia={:?}",
                times[0],
                times[2],
                outcome.certificate.explored_work_items,
                outcome.certificate.status,
                outcome.certificate.reason,
                outcome.cost_seconds,
                outcome.result.stints,
                outcome
                    .result
                    .pit_stops
                    .iter()
                    .map(|stop| stop.change_tyres)
                    .collect::<Vec<_>>(),
            );
        }
    }
}
