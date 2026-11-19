//! Cantidades fijadas a mano por parada (#2690, E5e).
//!
//! La referencia es una fuerza bruta escrita aparte, sin podas: recorre todos
//! los calendarios y todas las cargas de la rejilla de carreras pequeñas. Con
//! ella se comprueba que la búsqueda da el plan más rápido entre los que
//! respetan lo fijado, que el respaldo es exacto con el calendario fijo y que la
//! parada señalada como culpable es la correcta.
use std::sync::atomic::AtomicBool;

use serde_json::{Value, json};
use vantare_strategy::application::{
    EditedPlan, Fallback, recalculate_edited_plan_detailed, recalculate_edited_plan_fixed,
};
use vantare_strategy::solver::{
    DecisionVector, ExhaustedResource, FixedResource, FixedStop, FixedStopProblem, GreedyRefusal,
    Input, InvalidFixedStop, OptimalityStatus, PitDecision, ReplayFailure, ResultV2, Scalar,
    SolverOutcome, StintDecision, Window, check_fixed_stops, replay_decision_v2,
    runs_extended_search, solve_greedy_fallback, solve_greedy_fallback_fixed, solve_v2_cancellable,
    solve_v2_fixed,
};

// ---------------------------------------------------------------------------
// Carreras pequeñas y su modelo independiente.
// ---------------------------------------------------------------------------

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
}

/// Millonésimas, como las unidades enteras del cálculo.
#[allow(clippy::cast_possible_truncation)] // valores pequeños y exactos del generador.
fn micro(value: f64) -> i64 {
    (value * 1_000_000.0).round() as i64
}

#[allow(clippy::cast_precision_loss)] // unidades pequeñas.
fn plain(units: i64) -> f64 {
    units as f64 / 1_000_000.0
}

#[derive(Clone, Copy)]
struct Tank {
    capacity: i64,
    per_lap: i64,
    step: i64,
    reserve: i64,
}

#[derive(Clone, Copy)]
enum Reserve {
    None,
    Amount(f64),
    Laps(f64),
    Percent(f64),
}

impl Reserve {
    fn json(self) -> Value {
        let evidence = json!({
            "provenance": {"kind": "manual", "sourceId": "test:e5e"},
            "confidence": {"level": "low", "basis": "carrera pequeña de prueba"},
        });
        let sourced = |value: f64| json!({"value": value, "evidence": evidence});
        match self {
            Self::None => Value::Null,
            Self::Amount(value) => {
                json!({"kind": "amount", "amount": sourced(value), "selection": evidence})
            }
            Self::Laps(value) => {
                json!({"kind": "laps", "laps": sourced(value), "selection": evidence})
            }
            Self::Percent(value) => {
                json!({"kind": "percent", "percent": sourced(value), "selection": evidence})
            }
        }
    }
    fn amount(self, per_lap: f64, laps: u32) -> f64 {
        match self {
            Self::None => 0.0,
            Self::Amount(value) => value,
            Self::Laps(value) => value * per_lap,
            Self::Percent(value) => f64::from(laps) * per_lap * value / 100.0,
        }
    }
}

/// Lo que la fuerza bruta sabe de una carrera: sale del generador, no del crate.
struct Race {
    laps: u32,
    base: f64,
    degradation: f64,
    formation: f64,
    transit: f64,
    refuel_rate: f64,
    ve_rate: f64,
    tyre_seconds: f64,
    parallel: bool,
    tyre_life: u32,
    fuel: Tank,
    ve: Tank,
    min_stops: Option<usize>,
    max_stops: Option<usize>,
    windows: Vec<(u32, u32)>,
}

impl Race {
    fn stint_seconds(&self, laps: u32) -> f64 {
        let n = f64::from(laps);
        n * self.base + self.degradation * n * (n - 1.0) / 2.0
    }
    fn pit_seconds(&self, fuel: i64, ve: i64) -> f64 {
        let (f, v) = (plain(fuel) / self.refuel_rate, plain(ve) / self.ve_rate);
        self.transit
            + if self.parallel {
                f.max(v).max(self.tyre_seconds)
            } else {
                f + v + self.tyre_seconds
            }
    }
}

fn base_input() -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("entrada congelada de Fuji");
    input.extra.clear();
    input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
    input.budget.max_candidates = 1_000_000;
    input.budget.max_iterations = 1_000_000;
    input
}

/// Carrera de 3 a 7 vueltas (más con `more_laps`) con rejilla gruesa: pocas
/// cargas posibles por parada, para que la fuerza bruta la recorra entera.
#[allow(clippy::too_many_lines)] // un solo sorteo ordenado: la entrada y su modelo independiente.
fn small_race(rng: &mut Rng, rules: bool, more_laps: u64) -> (Input, Race) {
    let laps = u32::try_from(3 + rng.below(5 + more_laps)).expect("vueltas");
    let base = rng.pick(&[60.0, 90.5]);
    let degradation = rng.pick(&[0.0, 0.0, 0.25]);
    let formation = rng.pick(&[0.0, 30.0]);
    let transit = rng.pick(&[5.0, 20.0]);
    let refuel_rate = rng.pick(&[1.0, 2.0, 4.0]);
    let ve_rate = rng.pick(&[5.0, 12.5]);
    let tyre_seconds = rng.pick(&[0.0, 3.0, 10.0]);
    let parallel = rng.below(2) == 0;
    let tyre_life = rng.pick(&[0, 0, 3, 4]);
    let fuel_capacity = rng.pick(&[8.0, 10.0, 12.0]);
    let fuel_per_lap = rng.pick(&[2.0, 3.0, 4.0]);
    let fuel_step = rng.pick(&[2.0, 4.0]);
    let fuel_reserve = rng.pick(&[
        Reserve::None,
        Reserve::None,
        Reserve::Amount(1.0),
        Reserve::Laps(0.5),
        Reserve::Percent(5.0),
    ]);
    let energy = rng.below(2) == 0;
    let ve_per_lap = rng.pick(&[20.0, 25.0, 34.0, 50.0]);
    let ve_step = rng.pick(&[25.0, 50.0]);
    let ve_reserve = rng.pick(&[
        Reserve::None,
        Reserve::Amount(5.0),
        Reserve::Laps(0.5),
        Reserve::Percent(4.0),
    ]);
    let (mut min_stops, mut max_stops, mut windows) = (None, None, Vec::new());
    if rules {
        match rng.below(5) {
            0 => min_stops = Some(usize::try_from(rng.below(3)).expect("n")),
            1 => max_stops = Some(usize::try_from(1 + rng.below(3)).expect("n")),
            2 => {
                let minimum = usize::try_from(rng.below(2)).expect("n");
                min_stops = Some(minimum);
                max_stops = Some(minimum + usize::try_from(1 + rng.below(2)).expect("n"));
            }
            _ => {}
        }
        if rng.below(3) == 0 {
            let from = u32::try_from(1 + rng.below(u64::from(laps - 1))).expect("vuelta");
            let to = (from + u32::try_from(rng.below(2)).expect("ancho")).min(laps - 1);
            windows.push((from, to));
        }
    }

    let mut input = base_input();
    input.race_laps = laps;
    input.base_lap_seconds = Scalar::manual(base);
    input.degradation_per_lap_seconds = Scalar::manual(degradation);
    input.formation.seconds = Scalar::manual(formation);
    input.pit_cost.transit_seconds = Scalar::manual(transit);
    input.pit_cost.refuel_rate_l_per_s = Scalar::manual(refuel_rate);
    input.pit_cost.ve_rate_p_per_s = Scalar::manual(ve_rate);
    input.pit_cost.tyre_seconds = Scalar::manual(tyre_seconds);
    input.pit_cost.service_mode = if parallel { "parallel" } else { "sequential" }.into();
    input.tyre_life_laps = Scalar::manual(f64::from(tyre_life));
    input.fuel_capacity_liters = Scalar::manual(fuel_capacity);
    input.fuel_per_lap_liters = Scalar::manual(fuel_per_lap);
    input.discretization.fuel_liters = fuel_step;
    input.fuel_reserve = fuel_reserve.json();
    let ve = if energy {
        input.ve_capacity_percent = Scalar::manual(100.0);
        input.ve_per_lap_percent = Scalar::manual(ve_per_lap);
        input.discretization.ve_percent = ve_step;
        input.virtual_energy_reserve = ve_reserve.json();
        Tank {
            capacity: micro(100.0),
            per_lap: micro(ve_per_lap),
            step: micro(ve_step),
            reserve: micro(ve_reserve.amount(ve_per_lap, laps)),
        }
    } else {
        input.ve_capacity_percent = Scalar::manual(0.0);
        input.ve_per_lap_percent = Scalar::manual(0.0);
        input.virtual_energy_reserve = Value::Null;
        Tank {
            capacity: 0,
            per_lap: 0,
            step: 1,
            reserve: 0,
        }
    };
    input.event_rules.min_pit_stops = min_stops;
    input.event_rules.max_pit_stops = max_stops;
    input.event_rules.required_windows = windows
        .iter()
        .map(|&(from_lap, to_lap)| Window { from_lap, to_lap })
        .collect();
    let race = Race {
        laps,
        base,
        degradation,
        formation,
        transit,
        refuel_rate,
        ve_rate,
        tyre_seconds,
        parallel,
        tyre_life,
        fuel: Tank {
            capacity: micro(fuel_capacity),
            per_lap: micro(fuel_per_lap),
            step: micro(fuel_step),
            reserve: micro(fuel_reserve.amount(fuel_per_lap, laps)),
        },
        ve,
        min_stops,
        max_stops,
        windows,
    };
    (input, race)
}

/// Una o dos de las tres primeras paradas con una cantidad cualquiera de la
/// rejilla (también cero, y también cantidades que no caben).
fn some_fixed(rng: &mut Rng, race: &Race) -> Vec<FixedStop> {
    let mut fixed = vec![FixedStop::default(); 3];
    let on_grid = |rng: &mut Rng, tank: Tank| {
        let steps = u64::try_from(tank.capacity / tank.step).expect("niveles");
        plain(i64::try_from(rng.below(steps + 1)).expect("pasos") * tank.step)
    };
    for _ in 0..=rng.below(2) {
        let stop = usize::try_from(rng.below(3)).expect("parada");
        let what = rng.below(3);
        if what != 1 || race.ve.capacity == 0 {
            fixed[stop].fuel_liters = Some(on_grid(rng, race.fuel));
        }
        if what != 0 && race.ve.capacity > 0 {
            fixed[stop].ve_percent = Some(on_grid(rng, race.ve));
        }
    }
    fixed
}

type FixedUnits = Vec<(Option<i64>, Option<i64>)>;

fn fixed_units(fixed: &[FixedStop]) -> FixedUnits {
    fixed
        .iter()
        .map(|stop| (stop.fuel_liters.map(micro), stop.ve_percent.map(micro)))
        .collect()
}

/// Paradas que hacen falta para respetar lo fijado.
fn required_stops(fixed: &FixedUnits) -> usize {
    fixed
        .iter()
        .rposition(|stop| *stop != (None, None))
        .map_or(0, |last| last + 1)
}

/// Fuerza bruta: todos los planes, sin podas de coste. Devuelve el tiempo del
/// más rápido que cumple las reglas y respeta lo fijado. Con `calendar`, solo
/// los planes con exactamente esos tramos.
struct Brute<'a> {
    race: &'a Race,
    fixed: &'a FixedUnits,
    calendar: Option<&'a [u32]>,
    best: Option<f64>,
}

impl Brute<'_> {
    fn loads(tank: Tank, level: i64, fixed: Option<i64>) -> Vec<i64> {
        match fixed {
            Some(amount) if level + amount <= tank.capacity => vec![amount],
            Some(_) => vec![],
            None => (0..=(tank.capacity - level) / tank.step)
                .map(|n| n * tank.step)
                .collect(),
        }
    }

    fn go(&mut self, done: u32, fuel: i64, ve: i64, stops: &mut Vec<u32>, seconds: f64) {
        let race = self.race;
        let stint = stops.len();
        let lengths = match self.calendar {
            Some(calendar) => match calendar.get(stint) {
                Some(&laps) => laps..=laps,
                None => return,
            },
            None => 1..=race.laps - done,
        };
        for laps in lengths {
            let (used_fuel, used_ve) = (
                i64::from(laps) * race.fuel.per_lap,
                i64::from(laps) * race.ve.per_lap,
            );
            if done + laps > race.laps
                || used_fuel > fuel
                || used_ve > ve
                || (race.tyre_life > 0 && laps > race.tyre_life)
            {
                break;
            }
            let seconds = seconds + race.stint_seconds(laps);
            let (fuel, ve) = (fuel - used_fuel, ve - used_ve);
            if done + laps == race.laps {
                let valid = fuel >= race.fuel.reserve
                    && ve >= race.ve.reserve
                    && race.min_stops.is_none_or(|n| stops.len() >= n)
                    && race.max_stops.is_none_or(|n| stops.len() <= n)
                    && stops.len() >= required_stops(self.fixed)
                    && self.calendar.is_none_or(|c| stint + 1 == c.len())
                    && race
                        .windows
                        .iter()
                        .all(|&(from, to)| stops.iter().any(|&lap| (from..=to).contains(&lap)));
                if valid && self.best.is_none_or(|best| seconds < best) {
                    self.best = Some(seconds);
                }
                continue;
            }
            if race.max_stops.is_some_and(|n| stops.len() + 1 > n) {
                continue;
            }
            let (fixed_fuel, fixed_ve) = self.fixed.get(stops.len()).copied().unwrap_or_default();
            for fuel_load in Self::loads(race.fuel, fuel, fixed_fuel) {
                for ve_load in Self::loads(race.ve, ve, fixed_ve) {
                    stops.push(done + laps);
                    self.go(
                        done + laps,
                        fuel + fuel_load,
                        ve + ve_load,
                        stops,
                        seconds + race.pit_seconds(fuel_load, ve_load),
                    );
                    stops.pop();
                }
            }
        }
    }
}

fn brute(race: &Race, fixed: &FixedUnits, calendar: Option<&[u32]>) -> Option<f64> {
    let mut search = Brute {
        race,
        fixed,
        calendar,
        best: None,
    };
    search.go(
        0,
        race.fuel.capacity,
        race.ve.capacity,
        &mut Vec::new(),
        race.formation,
    );
    search.best
}

fn close(left: f64, right: f64) -> bool {
    (left - right).abs() <= left.abs().max(right.abs()).max(1.0) * 1e-9
}

/// Comprueba un plan publicado con el modelo independiente: recursos, reglas,
/// lo fijado y el tiempo que declara.
fn assert_valid_plan(race: &Race, fixed: &FixedUnits, result: &ResultV2, context: &str) {
    assert_eq!(
        result.stints.len(),
        result.pit_stops.len() + 1,
        "{context}: tramos y paradas"
    );
    let (mut fuel, mut ve) = (race.fuel.capacity, race.ve.capacity);
    let (mut done, mut seconds) = (0u32, race.formation);
    for (index, &laps) in result.stints.iter().enumerate() {
        assert!(
            laps > 0 && (race.tyre_life == 0 || laps <= race.tyre_life),
            "{context}: tramo {index} de {laps} vueltas"
        );
        fuel -= i64::from(laps) * race.fuel.per_lap;
        ve -= i64::from(laps) * race.ve.per_lap;
        assert!(
            fuel >= 0 && ve >= 0,
            "{context}: recurso agotado en el tramo {index}"
        );
        done += laps;
        seconds += race.stint_seconds(laps);
        if let Some(stop) = result.pit_stops.get(index) {
            assert_eq!(stop.lap, done, "{context}: vuelta de la parada {index}");
            let (fuel_load, ve_load) = (micro(stop.fuel_liters), micro(stop.ve_percent));
            let (fixed_fuel, fixed_ve) = fixed.get(index).copied().unwrap_or_default();
            assert!(
                fixed_fuel.is_none_or(|amount| amount == fuel_load)
                    && fixed_ve.is_none_or(|amount| amount == ve_load),
                "{context}: la parada {index} no lleva lo fijado ({stop:?})"
            );
            assert!(
                fuel_load % race.fuel.step == 0 && ve_load % race.ve.step == 0,
                "{context}: parada {index} fuera de la rejilla"
            );
            fuel += fuel_load;
            ve += ve_load;
            assert!(
                fuel <= race.fuel.capacity && ve <= race.ve.capacity,
                "{context}: la parada {index} no cabe"
            );
            seconds += race.pit_seconds(fuel_load, ve_load);
        }
    }
    let stops = result.pit_stops.len();
    assert_eq!(done, race.laps, "{context}: vueltas");
    assert!(
        fuel >= race.fuel.reserve && ve >= race.ve.reserve,
        "{context}: reserva"
    );
    assert!(
        race.min_stops.is_none_or(|n| stops >= n)
            && race.max_stops.is_none_or(|n| stops <= n)
            && stops >= required_stops(fixed),
        "{context}: número de paradas"
    );
    assert!(
        race.windows.iter().all(|&(from, to)| result
            .pit_stops
            .iter()
            .any(|stop| (from..=to).contains(&stop.lap))),
        "{context}: ventanas"
    );
    assert!(
        close(seconds, result.expected.total_seconds),
        "{context}: declara {} s y son {seconds} s",
        result.expected.total_seconds
    );
}

fn solve_fixed(input: &Input, fixed: &[FixedStop]) -> SolverOutcome {
    solve_v2_fixed(input, fixed, &AtomicBool::new(false)).expect("resultado")
}

/// Lo que se exige de la búsqueda frente a la fuerza bruta, con y sin plan.
fn assert_search_matches_brute(
    input: &Input,
    race: &Race,
    fixed: &[FixedStop],
    context: &str,
) -> (bool, bool) {
    let units = fixed_units(fixed);
    let outcome = solve_fixed(input, fixed);
    let expected = brute(race, &units, None);
    assert_eq!(
        outcome.certificate.fixed_stops,
        units.iter().filter(|stop| **stop != (None, None)).count(),
        "{context}: paradas fijadas en el certificado"
    );
    let Some(expected) = expected else {
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
    assert_valid_plan(race, &units, &outcome.result, context);
    let cost = outcome.cost_seconds.expect("coste");
    assert!(
        close(cost, expected),
        "{context}: la búsqueda da {cost} s y el más rápido que respeta lo fijado son {expected} s"
    );
    let free = brute(race, &Vec::new(), None).expect("sin fijar también hay plan");
    assert!(expected >= free - 1e-9, "{context}: fijar no puede mejorar");
    (true, !close(expected, free))
}

// ---------------------------------------------------------------------------
// La búsqueda frente a la fuerza bruta.
// ---------------------------------------------------------------------------

#[test]
fn the_scalar_search_finds_the_fastest_plan_that_respects_what_is_fixed() {
    let mut rng = Rng(0xE5E_0001);
    let (mut plans, mut none, mut slower) = (0, 0, 0);
    for index in 0..260 {
        let (input, race) = small_race(&mut rng, true, 0);
        let fixed = some_fixed(&mut rng, &race);
        assert!(
            !runs_extended_search(&input),
            "caso {index}: debe ser escalar"
        );
        let (plan, costs_time) =
            assert_search_matches_brute(&input, &race, &fixed, &format!("caso {index} {fixed:?}"));
        plans += usize::from(plan);
        none += usize::from(!plan);
        slower += usize::from(costs_time);
    }
    assert!(
        plans > 60 && none > 60 && slower > 30,
        "corpus pobre: {plans} con plan, {none} sin plan, {slower} más lentos que sin fijar"
    );
}

/// La búsqueda extendida, con las mismas carreras: se llega a ella con una carga
/// inicial explícita (el depósito lleno, que es lo que ya supone el modelo) o
/// con más de 16 ventanas (la misma repetida).
#[test]
fn the_extended_search_finds_the_fastest_plan_that_respects_what_is_fixed() {
    let mut rng = Rng(0xE5E_0002);
    let (mut plans, mut none, mut slower) = (0, 0, 0);
    for index in 0..160 {
        let (mut input, mut race) = small_race(&mut rng, true, 0);
        if index % 2 == 0 {
            input.extra.insert(
                "initialFuelLiters".into(),
                json!(Scalar::manual(input.fuel_capacity_liters.value)),
            );
        } else {
            let lap = u32::try_from(1 + rng.below(u64::from(race.laps - 1))).expect("vuelta");
            let window = (lap, (lap + 1).min(race.laps - 1));
            race.windows = vec![window; 17];
            input.event_rules.required_windows = vec![
                Window {
                    from_lap: window.0,
                    to_lap: window.1,
                };
                17
            ];
        }
        input.budget.max_candidates = 0; // el límite propio de la búsqueda extendida
        input.budget.max_iterations = 0;
        assert!(
            runs_extended_search(&input),
            "caso {index}: debe ser extendida"
        );
        let fixed = some_fixed(&mut rng, &race);
        let (plan, costs_time) =
            assert_search_matches_brute(&input, &race, &fixed, &format!("caso {index} {fixed:?}"));
        plans += usize::from(plan);
        none += usize::from(!plan);
        slower += usize::from(costs_time);
    }
    assert!(
        plans > 40 && none > 40 && slower > 15,
        "corpus pobre: {plans} con plan, {none} sin plan, {slower} más lentos que sin fijar"
    );
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
fn expected_blame(race: &Race, fixed: &FixedUnits, calendar: &[u32]) -> Option<usize> {
    brute(race, &Vec::new(), Some(calendar))?;
    (0..fixed.len())
        .filter(|&stop| fixed[stop] != (None, None))
        .find(|&stop| brute(race, &fixed[..=stop].to_vec(), Some(calendar)).is_none())
}

#[test]
#[allow(clippy::too_many_lines)] // un recorrido: mismo caso con el respaldo y con la búsqueda.
fn with_a_fixed_calendar_the_fallback_is_exact_and_names_the_stop_to_blame() {
    let mut rng = Rng(0xE5E_0003);
    let (mut applied, mut blamed, mut calendar_fault, mut compensated) = (0, 0, 0, 0);
    for index in 0..420 {
        let (mut input, mut race) = small_race(&mut rng, false, 0);
        if rng.below(4) == 0 {
            // Una ventana del evento que el calendario puede cumplir o no.
            let lap = u32::try_from(1 + rng.below(u64::from(race.laps - 1))).expect("vuelta");
            race.windows = vec![(lap, lap)];
            input.event_rules.required_windows = vec![Window {
                from_lap: lap,
                to_lap: lap,
            }];
        }
        // La mitad de los calendarios son los del plan sin fijar (seguro que se
        // pueden seguir); el resto, al azar.
        let edited = match solve_greedy_fallback(&input) {
            Ok(plan) if index % 2 == 0 && !plan.result.pit_stops.is_empty() => EditedPlan {
                pit_stop_laps: plan.result.pit_stops.iter().map(|stop| stop.lap).collect(),
                stints: plan.result.stints,
            },
            _ => random_calendar(&mut rng, race.laps),
        };
        let stops = edited.pit_stop_laps.len();
        // Uno de cada tres casos fija solo la última parada con poco o nada: es
        // donde las paradas automáticas anteriores tienen que compensar.
        let mut fixed = if index % 3 == 0 && stops > 1 {
            let mut fixed = vec![FixedStop::default(); stops];
            fixed[stops - 1].fuel_liters = Some(plain(rng.pick(&[0, 1]) * race.fuel.step));
            fixed
        } else {
            some_fixed(&mut rng, &race)
        };
        fixed.truncate(stops);
        let units = fixed_units(&fixed);
        let context = format!("caso {index} {edited:?} {fixed:?}");
        let expected = brute(&race, &units, Some(&edited.stints));
        let blame = if expected.is_some() {
            None
        } else {
            expected_blame(&race, &units, &edited.stints)
        };
        // Con 1 candidato decide el respaldo; con un millón, la búsqueda.
        for candidates in [1, 1_000_000] {
            let mut budget = input.clone();
            budget.budget.max_candidates = candidates;
            let recalculation =
                recalculate_edited_plan_fixed(&budget, &edited, &fixed, &AtomicBool::new(false))
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
                if candidates == 1 {
                    assert!(
                        matches!(recalculation.fallback, Fallback::Refused(_)),
                        "{context}: {:?}",
                        recalculation.fallback
                    );
                } else {
                    assert_eq!(
                        recalculation.outcome.certificate.status,
                        OptimalityStatus::NoSolution,
                        "{context}"
                    );
                }
                continue;
            };
            assert_eq!(result.stints, edited.stints, "{context}");
            assert_valid_plan(&race, &units, result, &context);
            let cost = recalculation.outcome.cost_seconds.expect("coste");
            if candidates == 1 {
                assert_eq!(recalculation.fallback, Fallback::Applied, "{context}");
                assert_eq!(
                    recalculation.outcome.certificate.status,
                    OptimalityStatus::NotProven,
                    "{context}: el respaldo nunca certifica"
                );
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
            // ¿Hizo falta cargar de más antes de una parada fijada? Sin fijar, el
            // respaldo carga en cada parada lo justo para el tramo siguiente.
            let free = solve_greedy_fallback(&constrained(&input, &edited)).expect("sin fijar");
            let pinned =
                solve_greedy_fallback_fixed(&constrained(&input, &edited), &fixed).expect("fijado");
            compensated += usize::from(
                free.result
                    .pit_stops
                    .iter()
                    .zip(&pinned.result.pit_stops)
                    .zip(&units)
                    .any(|((free, pinned), fixed)| {
                        *fixed == (None, None)
                            && (pinned.fuel_liters > free.fuel_liters
                                || pinned.ve_percent > free.ve_percent)
                    }),
            );
        } else if blame.is_some() {
            blamed += 1;
        } else {
            calendar_fault += 1;
        }
    }
    assert!(
        applied > 40 && blamed > 60 && calendar_fault > 40 && compensated > 8,
        "corpus pobre: {applied} con plan, {blamed} con parada culpable, {calendar_fault} por el calendario, {compensated} compensados"
    );
}

/// La entrada restringida que construye `recalculate_edited_plan_fixed`.
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

/// Con calendario libre el respaldo no prueba todos los calendarios, pero lo
/// que devuelve tiene que ser cierto: un plan válido que respeta lo fijado, la
/// causa de siempre si tampoco hay plan sin fijar, o una parada que de verdad
/// está fijada.
#[test]
fn with_a_free_calendar_the_fallback_never_returns_a_plan_that_breaks_what_is_fixed() {
    let mut rng = Rng(0xE5E_0004);
    let (mut plans, mut blamed, mut other) = (0, 0, 0);
    for index in 0..400 {
        let (input, race) = small_race(&mut rng, true, 0);
        let fixed = some_fixed(&mut rng, &race);
        let units = fixed_units(&fixed);
        let context = format!("caso {index} {fixed:?}");
        match solve_greedy_fallback_fixed(&input, &fixed) {
            Ok(outcome) => {
                plans += 1;
                assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
                assert_valid_plan(&race, &units, &outcome.result, &context);
                let best = brute(&race, &units, None).expect("si hay respaldo, hay plan");
                assert!(
                    outcome.result.expected.total_seconds >= best - 1e-9,
                    "{context}"
                );
            }
            Err(GreedyRefusal::FixedAmountUnreachable { stop }) => {
                blamed += 1;
                assert!(
                    units[stop] != (None, None),
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
        plans > 60 && blamed > 60 && other > 20,
        "corpus pobre: {plans} planes, {blamed} con parada culpable, {other} por otra causa"
    );
}

// ---------------------------------------------------------------------------
// Casos a mano.
// ---------------------------------------------------------------------------

/// Depósito de 20 L a 2 L por vuelta, 12 vueltas, sin energía, paso de 1 L.
fn twelve_laps() -> Input {
    let mut input = base_input();
    input.race_laps = 12;
    input.fuel_capacity_liters = Scalar::manual(20.0);
    input.fuel_per_lap_liters = Scalar::manual(2.0);
    input.discretization.fuel_liters = 1.0;
    input.fuel_reserve = Value::Null;
    input.ve_capacity_percent = Scalar::manual(0.0);
    input.ve_per_lap_percent = Scalar::manual(0.0);
    input.virtual_energy_reserve = Value::Null;
    input.tyre_life_laps = Scalar::manual(0.0);
    input
}

fn three_six() -> EditedPlan {
    EditedPlan {
        stints: vec![3, 3, 6],
        pit_stop_laps: vec![3, 6],
    }
}

fn fuel(liters: f64) -> FixedStop {
    FixedStop {
        fuel_liters: Some(liters),
        ve_percent: None,
    }
}

fn loads(outcome: &SolverOutcome) -> Vec<f64> {
    outcome
        .result
        .pit_stops
        .iter()
        .map(|stop| stop.fuel_liters)
        .collect()
}

// Sin fijar: se sale con 20 L, se llega a la parada 1 con 14 (sobra para el
// segundo tramo) y a la parada 2 con 8; el último tramo pide 12, así que la
// parada 2 carga 4. Fijando la parada 2 en 0 L, esos 4 L tienen que entrar en
// la parada 1.
#[test]
fn an_automatic_stop_makes_up_for_a_fixed_one_that_loads_less() {
    let fixed = [FixedStop::default(), fuel(0.0)];
    for candidates in [1, 1_000_000] {
        let mut input = twelve_laps();
        input.budget.max_candidates = candidates;
        let free = recalculate_edited_plan_detailed(&input, &three_six(), &AtomicBool::new(false))
            .expect("sin fijar")
            .0;
        assert_eq!(loads(&free), [0.0, 4.0], "{candidates} candidatos");
        let recalculation =
            recalculate_edited_plan_fixed(&input, &three_six(), &fixed, &AtomicBool::new(false))
                .expect("fijado");
        assert_eq!(
            loads(&recalculation.outcome),
            [4.0, 0.0],
            "{candidates} candidatos"
        );
        assert_eq!(recalculation.unreachable_stop, None);
        assert_eq!(recalculation.outcome.certificate.fixed_stops, 1);
        assert_eq!(
            recalculation.outcome.certificate.status,
            if candidates == 1 {
                OptimalityStatus::NotProven
            } else {
                OptimalityStatus::Proven
            }
        );
        assert_eq!(
            json!(recalculation.outcome.certificate)["fixedStops"],
            json!(1)
        );
    }
}

// Con las dos paradas en 0 L no se llega. Solo con la primera en 0 L sí (la
// segunda carga los 4 L): la primera con la que deja de haber plan es la segunda.
#[test]
fn an_impossible_fixed_amount_has_no_plan_and_names_its_stop() {
    for candidates in [1, 1_000_000] {
        let mut input = twelve_laps();
        input.budget.max_candidates = candidates;
        let recalculation = recalculate_edited_plan_fixed(
            &input,
            &three_six(),
            &[fuel(0.0), fuel(0.0)],
            &AtomicBool::new(false),
        )
        .expect("un resultado, no un error");
        assert!(
            !recalculation.outcome.result.feasible,
            "{candidates} candidatos"
        );
        assert_eq!(
            recalculation.unreachable_stop,
            Some(1),
            "{candidates} candidatos"
        );
        if candidates == 1 {
            assert_eq!(
                recalculation.fallback,
                Fallback::Refused(GreedyRefusal::FixedAmountUnreachable { stop: 1 })
            );
            assert_eq!(
                GreedyRefusal::FixedAmountUnreachable { stop: 1 }.code(),
                "fixed_amount_unreachable"
            );
        } else {
            assert_eq!(
                recalculation.outcome.certificate.status,
                OptimalityStatus::NoSolution
            );
            assert_eq!(recalculation.fallback, Fallback::NotApplicable);
        }
    }
}

// Una cantidad que no cabe: se llega a la parada 1 con 14 L y el depósito es de
// 20 L, así que 7 L no entran (el cálculo sale siempre con el depósito lleno).
#[test]
fn a_fixed_amount_that_does_not_fit_names_its_stop() {
    for candidates in [1, 1_000_000] {
        let mut input = twelve_laps();
        input.budget.max_candidates = candidates;
        let fits = recalculate_edited_plan_fixed(
            &input,
            &three_six(),
            &[fuel(6.0)],
            &AtomicBool::new(false),
        )
        .expect("cabe");
        assert_eq!(loads(&fits.outcome), [6.0, 0.0], "{candidates} candidatos");
        let recalculation = recalculate_edited_plan_fixed(
            &input,
            &three_six(),
            &[fuel(7.0)],
            &AtomicBool::new(false),
        )
        .expect("un resultado, no un error");
        assert!(!recalculation.outcome.result.feasible);
        assert_eq!(
            recalculation.unreachable_stop,
            Some(0),
            "{candidates} candidatos"
        );
    }
}

// Si el calendario ya es imposible sin fijar nada, la culpa no es de lo fijado.
#[test]
fn an_impossible_calendar_is_not_blamed_on_what_is_fixed() {
    let edited = EditedPlan {
        stints: vec![11, 1],
        pit_stop_laps: vec![11],
    };
    for candidates in [1, 1_000_000] {
        let mut input = twelve_laps();
        input.budget.max_candidates = candidates;
        let recalculation =
            recalculate_edited_plan_fixed(&input, &edited, &[fuel(2.0)], &AtomicBool::new(false))
                .expect("un resultado, no un error");
        assert!(!recalculation.outcome.result.feasible);
        assert_eq!(
            recalculation.unreachable_stop, None,
            "{candidates} candidatos"
        );
    }
}

#[test]
fn a_fixed_stop_beyond_the_edited_calendar_is_an_input_error() {
    let error = recalculate_edited_plan_fixed(
        &twelve_laps(),
        &three_six(),
        &[FixedStop::default(), FixedStop::default(), fuel(2.0)],
        &AtomicBool::new(false),
    )
    .expect_err("la tercera parada no existe");
    assert_eq!(error, "fixed_stop_outside_edited_schedule");
    // Entradas automáticas de más no molestan.
    assert!(
        recalculate_edited_plan_fixed(
            &twelve_laps(),
            &three_six(),
            &[fuel(4.0), FixedStop::default(), FixedStop::default()],
            &AtomicBool::new(false),
        )
        .is_ok()
    );
}

// En la búsqueda libre, fijar la parada 2 obliga a que el plan tenga dos paradas.
#[test]
fn a_free_search_keeps_every_fixed_stop_in_the_plan() {
    let input = twelve_laps();
    let free = solve_v2_cancellable(&input, &AtomicBool::new(false)).expect("sin fijar");
    assert_eq!(free.result.pit_stops.len(), 1);
    assert_eq!(free.certificate.fixed_stops, 0);
    assert!(json!(free.certificate).get("fixedStops").is_none());
    let fixed = [FixedStop::default(), fuel(3.0)];
    let outcome = solve_fixed(&input, &fixed);
    assert_eq!(outcome.certificate.status, OptimalityStatus::Proven);
    assert_eq!(outcome.result.pit_stops.len(), 2);
    assert!((outcome.result.pit_stops[1].fuel_liters - 3.0).abs() < 1e-9);
    assert!(outcome.cost_seconds > free.cost_seconds);
    let greedy = solve_greedy_fallback_fixed(&input, &fixed).expect("respaldo");
    assert_eq!(greedy.result.pit_stops.len(), 2);
    assert!((greedy.result.pit_stops[1].fuel_liters - 3.0).abs() < 1e-9);
}

// Un presupuesto que se agota con algo fijado no certifica nada.
#[test]
fn a_fixed_search_that_runs_out_of_budget_is_not_proven() {
    let mut input = twelve_laps();
    input.budget.max_candidates = 5;
    let outcome = solve_fixed(&input, &[fuel(4.0)]);
    assert_eq!(outcome.certificate.status, OptimalityStatus::NotProven);
    assert_eq!(outcome.certificate.fixed_stops, 1);
}

// ---------------------------------------------------------------------------
// «Múltiplo del paso» con decimales.
// ---------------------------------------------------------------------------

fn problem(input: &Input, fixed: FixedStop) -> Option<InvalidFixedStop> {
    check_fixed_stops(input, &[FixedStop::default(), fixed]).expect("entrada válida")
}

#[test]
fn a_fixed_amount_is_a_multiple_of_the_step_within_a_millionth() {
    let off_grid = |resource| {
        Some(InvalidFixedStop {
            stop: 1,
            resource,
            problem: FixedStopProblem::OffGrid,
        })
    };
    let out_of_range = |resource| {
        Some(InvalidFixedStop {
            stop: 1,
            resource,
            problem: FixedStopProblem::OutOfRange,
        })
    };
    let mut input = twelve_laps();
    input.fuel_capacity_liters = Scalar::manual(15.0);

    // Paso de 0,1 L: 0,1 + 0,2 no es exactamente 0,3 en coma flotante, pero vale.
    input.discretization.fuel_liters = 0.1;
    let sum = 0.1 + 0.2;
    assert!(sum > 0.3, "la suma en coma flotante no es exacta");
    assert_eq!(problem(&input, fuel(sum)), None);
    assert_eq!(problem(&input, fuel(0.7 + 0.1 + 0.1)), None);
    assert_eq!(problem(&input, fuel(0.35)), off_grid(FixedResource::Fuel));

    // Paso de 0,5 L.
    input.discretization.fuel_liters = 0.5;
    for liters in [0.0, 0.5, 1.5, 15.0, 0.1 + 0.4, 2.5 - 1e-9, 2.5 + 4e-7] {
        assert_eq!(problem(&input, fuel(liters)), None, "{liters} L");
    }
    for liters in [sum, 1.2, 1.499, 2.5 + 1e-6, 2.5 - 1e-6, 0.25] {
        assert_eq!(
            problem(&input, fuel(liters)),
            off_grid(FixedResource::Fuel),
            "{liters} L"
        );
    }
    for liters in [-0.5, -1e-9, 15.5, f64::NAN, f64::INFINITY] {
        assert_eq!(
            problem(&input, fuel(liters)),
            out_of_range(FixedResource::Fuel),
            "{liters} L"
        );
    }

    // La energía, con su propio paso. Sin energía en la carrera solo vale 0.
    let energy = |percent| FixedStop {
        fuel_liters: None,
        ve_percent: Some(percent),
    };
    assert_eq!(problem(&input, energy(0.0)), None);
    assert_eq!(
        problem(&input, energy(5.0)),
        out_of_range(FixedResource::VirtualEnergy)
    );
    input.ve_capacity_percent = Scalar::manual(100.0);
    input.ve_per_lap_percent = Scalar::manual(10.0);
    input.discretization.ve_percent = 2.5;
    assert_eq!(problem(&input, energy(97.5)), None);
    assert_eq!(
        problem(&input, energy(98.0)),
        off_grid(FixedResource::VirtualEnergy)
    );
    assert_eq!(
        problem(&input, energy(102.5)),
        out_of_range(FixedResource::VirtualEnergy)
    );
}

// El paso que cuenta es el efectivo: con 0,05 L y 15 L de depósito son 301
// niveles, el cálculo lo engorda a 0,1 L y 0,15 L deja de valer.
#[test]
fn the_step_that_counts_is_the_effective_one() {
    let mut input = twelve_laps();
    input.fuel_capacity_liters = Scalar::manual(15.0);
    input.discretization.fuel_liters = 0.05;
    assert!(runs_extended_search(&input));
    assert_eq!(problem(&input, fuel(0.2)), None);
    assert_eq!(
        problem(&input, fuel(0.15)).map(|invalid| invalid.problem),
        Some(FixedStopProblem::OffGrid)
    );
}

// La búsqueda y el respaldo usan la misma regla que `check_fixed_stops`.
#[test]
fn the_search_and_the_fallback_refuse_what_the_check_refuses() {
    let mut input = twelve_laps();
    input.discretization.fuel_liters = 0.5;
    let sum = 0.1 + 0.2;
    let error = solve_v2_fixed(&input, &[fuel(sum)], &AtomicBool::new(false))
        .expect_err("0,3 L no es múltiplo de 0,5 L");
    assert!(
        error.starts_with("invalid_input: fixedStops[0].fuelLiters"),
        "{error}"
    );
    assert_eq!(
        solve_greedy_fallback_fixed(&input, &[fuel(sum)]).expect_err("fuera de la rejilla"),
        GreedyRefusal::ServiceGrid
    );
    assert!(
        recalculate_edited_plan_fixed(&input, &three_six(), &[fuel(sum)], &AtomicBool::new(false))
            .is_err()
    );
    // Con paso de 0,1 L, 3 + 0,1 + 0,2 vale: 8 vueltas con una sola parada.
    input.race_laps = 8;
    input.fuel_capacity_liters = Scalar::manual(15.0);
    input.discretization.fuel_liters = 0.1;
    input.event_rules.max_pit_stops = Some(1);
    assert!(!runs_extended_search(&input));
    let outcome = solve_fixed(&input, &[fuel(sum + 3.0)]);
    assert_eq!(outcome.certificate.status, OptimalityStatus::Proven);
    assert!((outcome.result.pit_stops[0].fuel_liters - 3.3).abs() < 1e-9);
}

// ---------------------------------------------------------------------------
// El replay dice en qué vuelta falla un plan.
// ---------------------------------------------------------------------------

fn decision(stints: &[u32], stops: &[(f64, f64, bool)]) -> DecisionVector {
    let mut lap = 0;
    DecisionVector {
        stints: stints
            .iter()
            .enumerate()
            .map(|(index, &laps)| StintDecision {
                index,
                laps,
                ..StintDecision::default()
            })
            .collect(),
        pit_stops: stops
            .iter()
            .zip(stints)
            .map(|(&(fuel_liters, ve_percent, change_tyres), &laps)| {
                lap += laps;
                PitDecision {
                    lap,
                    fuel_liters,
                    ve_percent,
                    change_tyres,
                    ..PitDecision::default()
                }
            })
            .collect(),
    }
}

#[test]
fn a_replay_that_runs_out_says_in_which_lap() {
    // 20 L a 2 L por vuelta: tras 3 vueltas quedan 14 L, que dan para 7 vueltas
    // más. Sin cargar en la parada de la vuelta 3, la vuelta 11 no se completa.
    let input = twelve_laps();
    let dry = replay_decision_v2(&input, &decision(&[3, 9], &[(0.0, 0.0, true)])).expect("replay");
    assert!(!dry.feasible);
    assert_eq!(dry.reasons[0].code, "resource_exhausted");
    assert_eq!(
        dry.failure,
        Some(ReplayFailure {
            stint: 1,
            lap: 11,
            resource: ExhaustedResource::Fuel
        })
    );
    // El JSON del replay sigue siendo el de antes: sin el dato nuevo y sin tramos.
    let wire = json!(dry);
    assert!(wire.get("failure").is_none());
    assert_eq!(wire["stints"], json!([]));

    // Con 4 L en la parada el plan llega y no hay fallo que señalar.
    let fine = replay_decision_v2(&input, &decision(&[3, 9], &[(4.0, 0.0, true)])).expect("replay");
    assert!(fine.feasible);
    assert_eq!(fine.failure, None);

    // En el primer tramo: 20 L no dan para 11 vueltas; falla la 11.
    let first =
        replay_decision_v2(&input, &decision(&[11, 1], &[(0.0, 0.0, true)])).expect("replay");
    assert_eq!(
        first.failure,
        Some(ReplayFailure {
            stint: 0,
            lap: 11,
            resource: ExhaustedResource::Fuel
        })
    );
}

#[test]
fn a_replay_names_the_resource_that_runs_out_first() {
    // Energía: 100 % a 15 % por vuelta da para 6 vueltas; la 7 no se completa.
    let mut input = twelve_laps();
    input.ve_capacity_percent = Scalar::manual(100.0);
    input.ve_per_lap_percent = Scalar::manual(15.0);
    let energy =
        replay_decision_v2(&input, &decision(&[8, 4], &[(4.0, 60.0, true)])).expect("replay");
    assert_eq!(
        energy.failure,
        Some(ReplayFailure {
            stint: 0,
            lap: 7,
            resource: ExhaustedResource::VirtualEnergy
        })
    );

    // Ruedas: aguantan 5 vueltas. Sin cambiarlas en la parada de la vuelta 4, la
    // segunda vuelta del tramo siguiente (la 6 de carrera) ya no entra.
    let mut input = twelve_laps();
    input.tyre_life_laps = Scalar::manual(5.0);
    let worn = decision(&[4, 4, 4], &[(4.0, 0.0, false), (4.0, 0.0, true)]);
    let tyres = replay_decision_v2(&input, &worn).expect("replay");
    assert_eq!(tyres.reasons[0].code, "resource_exhausted");
    assert_eq!(
        tyres.failure,
        Some(ReplayFailure {
            stint: 1,
            lap: 6,
            resource: ExhaustedResource::Tyres
        })
    );
    let changed = decision(&[4, 4, 4], &[(4.0, 0.0, true), (4.0, 0.0, true)]);
    assert!(
        replay_decision_v2(&input, &changed)
            .expect("replay")
            .feasible
    );
}

// Un plan que llega pero sin la reserva no «se queda sin» nada en una vuelta.
#[test]
fn a_replay_short_of_reserve_has_no_failure_lap() {
    let mut input = twelve_laps();
    input.fuel_reserve = Reserve::Amount(3.0).json();
    // 20 L de salida y 4 L en la parada: se gastan los 24 L y no queda reserva.
    let replay =
        replay_decision_v2(&input, &decision(&[3, 9], &[(4.0, 0.0, true)])).expect("replay");
    assert!(!replay.feasible);
    assert_eq!(replay.reasons[0].code, "reserve_not_met");
    assert_eq!(replay.failure, None);
}

// ---------------------------------------------------------------------------
// Búsqueda larga de contraejemplos (no corre por defecto).
// ---------------------------------------------------------------------------

/// Decenas de miles de carreras de hasta 10 vueltas contra la fuerza bruta, en
/// las dos búsquedas, con lo fijado cargado hacia las paradas tardías y hacia
/// cantidades extremas (nada o el depósito entero). Sirve para revisar cambios
/// en las podas: `cargo test -p vantare-strategy --test fixed_stops -- --ignored`.
/// `VANTARE_STRATEGY_CASOS` cambia el número de casos.
#[test]
#[ignore = "búsqueda larga de contraejemplos"]
fn long_hunt_for_counterexamples_against_brute_force() {
    let cases: u64 = std::env::var("VANTARE_STRATEGY_CASOS")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(30_000);
    let mut rng = Rng(0xE5E_0005);
    let (mut compared, mut unproven) = (0u64, 0u64);
    for index in 0..cases {
        let (mut input, mut race) = small_race(&mut rng, true, 3);
        // Pocas paradas: acota la fuerza bruta en las carreras largas.
        let most = race.max_stops.map_or(4, |n| n.min(4));
        race.max_stops = Some(most);
        input.event_rules.max_pit_stops = Some(most);
        if let Some(least) = race.min_stops.filter(|least| *least > most) {
            race.min_stops = Some(least.min(most));
            input.event_rules.min_pit_stops = race.min_stops;
        }
        // Una ventana de una sola vuelta obliga a parar justo ahí.
        if rng.below(2) == 0 {
            let lap = u32::try_from(1 + rng.below(u64::from(race.laps - 1))).expect("vuelta");
            race.windows.push((lap, lap));
            input.event_rules.required_windows.push(Window {
                from_lap: lap,
                to_lap: lap,
            });
        }
        if index % 2 == 0 {
            input.extra.insert(
                "initialFuelLiters".into(),
                json!(Scalar::manual(input.fuel_capacity_liters.value)),
            );
            input.budget.max_candidates = 0;
            input.budget.max_iterations = 0;
        }
        let mut fixed = vec![FixedStop::default(); 4];
        for _ in 0..=rng.below(2) {
            let stop = usize::try_from(rng.below(4)).expect("parada");
            let extreme = |rng: &mut Rng, tank: Tank| {
                let steps = tank.capacity / tank.step;
                plain(rng.pick(&[0, 1, steps - 1, steps, steps / 2]) * tank.step)
            };
            if rng.below(3) != 0 || race.ve.capacity == 0 {
                fixed[stop].fuel_liters = Some(extreme(&mut rng, race.fuel));
            } else {
                fixed[stop].ve_percent = Some(extreme(&mut rng, race.ve));
            }
        }
        let units = fixed_units(&fixed);
        let outcome = solve_fixed(&input, &fixed);
        if outcome.certificate.status == OptimalityStatus::NotProven {
            unproven += 1;
            continue;
        }
        compared += 1;
        let expected = brute(&race, &units, None);
        let context = || format!("caso {index} {fixed:?} {}", json!(input));
        match expected {
            None => assert_eq!(
                outcome.certificate.status,
                OptimalityStatus::NoSolution,
                "{}",
                context()
            ),
            Some(expected) => {
                assert_eq!(
                    outcome.certificate.status,
                    OptimalityStatus::Proven,
                    "hay plan de {expected} s: {}",
                    context()
                );
                assert_valid_plan(&race, &units, &outcome.result, "plan");
                let cost = outcome.cost_seconds.expect("coste");
                assert!(
                    close(cost, expected),
                    "da {cost} s y el más rápido son {expected} s: {}",
                    context()
                );
            }
        }
    }
    println!("comparados {compared}, sin certificar {unproven}");
    assert!(compared > cases / 2, "demasiados casos sin certificar");
}
