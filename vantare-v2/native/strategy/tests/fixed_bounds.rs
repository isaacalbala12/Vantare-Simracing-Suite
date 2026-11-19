//! Límites de lo que se puede fijar por parada (#2692, #2709, E5f).
//!
//! La referencia es el propio recálculo: para cada parada, recurso y cantidad
//! de la rejilla se pregunta a `recalculate_edited_plan_fixed` si hay plan y se
//! compara con lo que dicen los límites. Ni los límites niegan algo que el
//! recálculo acepta, ni prometen algo que el recálculo niega.
use std::collections::BTreeMap;
use std::sync::atomic::AtomicBool;

use serde_json::{Value, json};
use vantare_strategy::application::{EditedPlan, fixed_stop_bounds, recalculate_edited_plan_fixed};
use vantare_strategy::solver::{
    AmountRange, FixedProblem, FixedStop, Input, ResourceBounds, Scalar, StopBounds,
    runs_extended_search,
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

fn base_input() -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("entrada congelada de Fuji");
    input.extra.clear();
    input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
    input.budget.max_candidates = 2_000; // la búsqueda se rinde pronto: decide el respaldo
    input.budget.max_iterations = 1_000_000;
    input
}

/// Fuji 6 h: 236 vueltas con el calendario 43-42-42-43-42-24.
fn fuji() -> (Input, EditedPlan) {
    let mut input = base_input();
    input.race_laps = 236;
    (input, schedule(&[43, 42, 42, 43, 42, 24]))
}

fn schedule(stints: &[u32]) -> EditedPlan {
    let mut lap = 0;
    let pit_stop_laps = stints[..stints.len() - 1]
        .iter()
        .map(|&laps| {
            lap += laps;
            lap
        })
        .collect();
    EditedPlan {
        stints: stints.to_vec(),
        pit_stop_laps,
    }
}

fn recalculates(input: &Input, edited: &EditedPlan, fixed: &[FixedStop]) -> bool {
    recalculate_edited_plan_fixed(input, edited, fixed, &AtomicBool::new(false))
        .expect("un resultado, no un error")
        .outcome
        .result
        .feasible
}

fn bounds(input: &Input, edited: &EditedPlan, fixed: &[FixedStop]) -> Vec<StopBounds> {
    fixed_stop_bounds(input, edited, fixed)
        .expect("entrada válida")
        .expect("cálculo escalar")
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Fuel,
    Energy,
}

fn of(bounds: &StopBounds, kind: Kind) -> ResourceBounds {
    match kind {
        Kind::Fuel => bounds.fuel,
        Kind::Energy => bounds.ve,
    }
}

fn get(fixed: &FixedStop, kind: Kind) -> Option<f64> {
    match kind {
        Kind::Fuel => fixed.fuel_liters,
        Kind::Energy => fixed.ve_percent,
    }
}

fn set(fixed: &mut FixedStop, kind: Kind, amount: Option<f64>) {
    match kind {
        Kind::Fuel => fixed.fuel_liters = amount,
        Kind::Energy => fixed.ve_percent = amount,
    }
}

fn contains(range: Option<AmountRange>, amount: f64) -> bool {
    range
        .is_some_and(|range| micro(range.min) <= micro(amount) && micro(amount) <= micro(range.max))
}

/// Un recurso de una carrera generada, en millonésimas (modelo de la prueba).
#[derive(Clone, Copy, Debug)]
struct Tank {
    capacity: i64,
    per_lap: i64,
    step: i64,
}

impl Tank {
    fn amounts(self) -> impl Iterator<Item = f64> {
        (0..=self.capacity / self.step).map(move |n| plain(n * self.step))
    }
}

struct Race {
    input: Input,
    edited: EditedPlan,
    fixed: Vec<FixedStop>,
    fuel: Tank,
    energy: Option<Tank>,
}

impl Race {
    fn tank(&self, kind: Kind) -> Option<Tank> {
        match kind {
            Kind::Fuel => Some(self.fuel),
            Kind::Energy => self.energy,
        }
    }
}

/// Carrera pequeña con calendario al azar y cosas fijadas al azar. `None` si
/// la combinación sorteada no es una entrada escalar válida.
fn race(rng: &mut Rng) -> Option<Race> {
    let laps = u32::try_from(6 + rng.below(9)).expect("vueltas");
    let mut input = base_input();
    input.race_laps = laps;
    let reserve = |rng: &mut Rng, template: &Value| {
        let mut value = template.clone();
        value["laps"]["value"] = json!(rng.pick(&[0.0, 0.0, 0.5, 0.8, 1.2]));
        value
    };

    let capacity = rng.pick(&[8.0, 10.0, 10.5, 12.0, 20.0]);
    let per_lap = rng.pick(&[1.0, 1.5, 2.0, 2.5, 3.0]);
    let step = rng.pick(&[0.5, 1.0, 2.0, 4.0]);
    input.fuel_reserve = reserve(rng, &input.fuel_reserve);
    input.fuel_capacity_liters = Scalar::manual(capacity);
    input.fuel_per_lap_liters = Scalar::manual(per_lap);
    input.discretization.fuel_liters = step;
    let fuel = Tank {
        capacity: micro(capacity),
        per_lap: micro(per_lap),
        step: micro(step),
    };

    let energy = if rng.below(2) == 0 {
        let per_lap = rng.pick(&[12.5, 20.0, 33.0]);
        let step = rng.pick(&[10.0, 25.0]);
        input.virtual_energy_reserve = reserve(rng, &input.virtual_energy_reserve);
        input.ve_capacity_percent = Scalar::manual(100.0);
        input.ve_per_lap_percent = Scalar::manual(per_lap);
        input.discretization.ve_percent = step;
        Some(Tank {
            capacity: micro(100.0),
            per_lap: micro(per_lap),
            step: micro(step),
        })
    } else {
        input.ve_capacity_percent = Scalar::manual(0.0);
        input.ve_per_lap_percent = Scalar::manual(0.0);
        input.virtual_energy_reserve = Value::Null;
        None
    };
    // Con vida de ruedas, algunos calendarios no valen por las ruedas y no por
    // el combustible: los límites no lo ven y el recálculo sí.
    input.tyre_life_laps = Scalar::manual(rng.pick(&[0.0, 0.0, 0.0, 5.0, 8.0]));
    // Unas veces la búsqueda termina (y demuestra); otras se rinde y decide el respaldo.
    input.budget.max_candidates = rng.pick(&[50, 1_000_000]);
    if input.validate().is_err() || runs_extended_search(&input) {
        return None;
    }

    // Dos de cada tres calendarios tienen tramos que caben en el depósito, para
    // que haya límites que mirar; el resto son cortes al azar, casi siempre sin plan.
    let mut stints = vec![];
    if rng.below(3) == 0 {
        let cuts = 1 + rng.below(3);
        let mut stops: Vec<u32> = (0..cuts)
            .map(|_| u32::try_from(1 + rng.below(u64::from(laps) - 1)).expect("vuelta"))
            .collect();
        stops.sort_unstable();
        stops.dedup();
        let mut last = 0;
        for &stop in &stops {
            stints.push(stop - last);
            last = stop;
        }
        stints.push(laps - last);
    } else {
        let reach = |tank: Tank| u64::try_from(tank.capacity / tank.per_lap).expect("vueltas");
        let reach = energy.map_or(reach(fuel), |energy| reach(fuel).min(reach(energy)));
        let mut left = u64::from(laps);
        while left > 0 {
            let length = 1 + rng.below(reach.min(left));
            stints.push(u32::try_from(length).expect("tramo"));
            left -= length;
        }
        if !(2..=5).contains(&stints.len()) {
            return None;
        }
    }
    let stops = stints.len() - 1;

    let some = |rng: &mut Rng, tank: Option<Tank>| {
        let tank = tank?;
        let levels = u64::try_from(tank.capacity / tank.step).expect("niveles");
        (rng.below(3) == 0)
            .then(|| plain(i64::try_from(rng.below(levels + 1)).expect("nivel") * tank.step))
    };
    let fixed = (0..stops)
        .map(|_| FixedStop {
            fuel_liters: some(rng, Some(fuel)),
            ve_percent: some(rng, energy),
        })
        .collect();
    Some(Race {
        input,
        edited: schedule(&stints),
        fixed,
        fuel,
        energy,
    })
}

// ---------------------------------------------------------------------------
// La propiedad: los límites y el recálculo dicen lo mismo.
// ---------------------------------------------------------------------------

#[test]
fn the_bounds_and_the_recalculation_agree_on_every_amount() {
    let mut rng = Rng(0xE5F_2709);
    let (mut races, mut inside, mut outside, mut empty, mut blocked) = (0, 0, 0, 0, 0);
    while races < 220 {
        let Some(race) = race(&mut rng) else { continue };
        races += 1;
        let Race {
            input,
            edited,
            fixed,
            ..
        } = &race;
        let found = bounds(input, edited, fixed);
        assert_eq!(found.len(), edited.pit_stop_laps.len());
        for kind in [Kind::Fuel, Kind::Energy] {
            let Some(tank) = race.tank(kind) else {
                continue;
            };
            // ¿Estorba algo que no sea este recurso? Se quita todo lo fijado de él.
            let mut cleared = fixed.clone();
            for stop in &mut cleared {
                set(stop, kind, None);
            }
            let rest_allows = recalculates(input, edited, &cleared);
            blocked += usize::from(!rest_allows);
            for stop in 0..fixed.len() {
                let service = of(&found[stop], kind).service;
                empty += usize::from(service.is_none());
                for amount in tank.amounts() {
                    let mut tried = fixed.clone();
                    set(&mut tried[stop], kind, Some(amount));
                    let real = recalculates(input, edited, &tried);
                    let said = contains(service, amount);
                    let context = || {
                        format!(
                            "{kind:?} parada {stop} cantidad {amount}: límites {service:?}, {tank:?}, tramos {:?}, fijado {fixed:?}, ruedas {}",
                            edited.stints, input.tyre_life_laps.value
                        )
                    };
                    assert!(
                        !real || said,
                        "los límites niegan un plan que existe. {}",
                        context()
                    );
                    assert!(
                        !(said && rest_allows) || real,
                        "los límites prometen un plan que no existe. {}",
                        context()
                    );
                    assert!(rest_allows || !real, "la prueba razona mal. {}", context());
                    if said { inside += 1 } else { outside += 1 }
                }
            }
        }
    }
    // Las dos respuestas, los tramos vacíos y los casos donde estorba otra cosa
    // tienen que darse de verdad, o la propiedad no prueba nada.
    assert!(
        inside > 1_000 && outside > 3_000 && empty > 100 && blocked > 20,
        "{races} carreras: {inside} dentro, {outside} fuera, {empty} sin tramo, {blocked} con otra cosa estorbando"
    );
}

// Lo que dicen los avisos de las cantidades ya fijadas: hay plan exactamente
// cuando el calendario lo tiene sin fijar nada y ninguna cantidad fijada lleva
// aviso. Y los límites de una parada no dependen de lo fijado en ella.
#[test]
fn a_fixed_amount_has_a_problem_exactly_when_it_leaves_no_plan() {
    let mut rng = Rng(0xE5F_0002);
    let (mut races, mut plans, mut refused, mut below, mut above, mut none) = (0, 0, 0, 0, 0, 0);
    while races < 600 {
        let Some(race) = race(&mut rng) else { continue };
        races += 1;
        let Race {
            input,
            edited,
            fixed,
            ..
        } = &race;
        let found = bounds(input, edited, fixed);
        let mut problems = 0;
        for (stop, bounds) in found.iter().enumerate() {
            let mut without = fixed.clone();
            without[stop] = FixedStop::default();
            let free = bounds_at(input, edited, &without, stop);
            for kind in [Kind::Fuel, Kind::Energy] {
                let resource = of(bounds, kind);
                assert_eq!(resource.service, of(&free, kind).service);
                assert_eq!(resource.arrival, of(&free, kind).arrival);
                assert_eq!(
                    of(&free, kind).problem,
                    None,
                    "una automática no lleva aviso"
                );
                let expected = get(&fixed[stop], kind).and_then(|amount| match resource.service {
                    None => Some(Problem::None),
                    Some(range) if micro(amount) < micro(range.min) => Some(Problem::Below),
                    Some(range) if micro(amount) > micro(range.max) => Some(Problem::Above),
                    Some(_) => None,
                });
                let said = resource.problem.map(|problem| match problem {
                    FixedProblem::BelowMin { .. } => Problem::Below,
                    FixedProblem::AboveMax => Problem::Above,
                    FixedProblem::NoRange => Problem::None,
                });
                assert_eq!(said, expected, "parada {stop} {kind:?} {fixed:?}");
                match said {
                    Some(Problem::Below) => below += 1,
                    Some(Problem::Above) => above += 1,
                    Some(Problem::None) => none += 1,
                    None => {}
                }
                problems += usize::from(said.is_some());
            }
        }
        let automatic = recalculates(input, edited, &vec![FixedStop::default(); fixed.len()]);
        let real = recalculates(input, edited, fixed);
        assert_eq!(
            real,
            automatic && problems == 0,
            "tramos {:?} fijado {fixed:?}: {problems} avisos, automático {automatic}",
            edited.stints
        );
        if real { plans += 1 } else { refused += 1 }
    }
    assert!(
        plans > 50 && refused > 50 && below > 30 && above > 30 && none > 30,
        "{plans} con plan, {refused} sin plan; avisos: {below} poco, {above} demasiado, {none} sin tramo"
    );
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Problem {
    Below,
    Above,
    None,
}

fn bounds_at(input: &Input, edited: &EditedPlan, fixed: &[FixedStop], stop: usize) -> StopBounds {
    bounds(input, edited, fixed)[stop]
}

// ---------------------------------------------------------------------------
// La vuelta en que falla, contra una fuerza bruta escrita aparte.
// ---------------------------------------------------------------------------

/// Hasta dónde se llega probando todas las cargas de la rejilla en las paradas
/// automáticas: la primera vuelta que no se completa en el mejor reparto.
/// `None`: algún reparto completa todas las vueltas.
fn farthest_failure(tank: Tank, stints: &[u32], fixed: &[Option<i64>]) -> Option<u32> {
    /// Todas las vueltas completadas.
    const FINISHES: u32 = u32::MAX;
    /// Una cantidad fijada no cabe: por ese camino no se puede seguir.
    const NO_WAY: u32 = 0;
    fn from(
        tank: Tank,
        stints: &[u32],
        fixed: &[Option<i64>],
        stint: usize,
        level: i64,
        seen: &mut BTreeMap<(usize, i64), u32>,
    ) -> u32 {
        if let Some(&known) = seen.get(&(stint, level)) {
            return known;
        }
        let done: u32 = stints[..stint].iter().sum();
        let after = level - i64::from(stints[stint]) * tank.per_lap;
        let answer = if after < 0 {
            done + u32::try_from(level / tank.per_lap).expect("vueltas") + 1
        } else if stint + 1 == stints.len() {
            FINISHES
        } else {
            let most = (tank.capacity - after) / tank.step * tank.step;
            let loads: Vec<i64> = match fixed[stint] {
                None => (0..=most / tank.step).map(|n| n * tank.step).collect(),
                Some(amount) if amount <= most => vec![amount],
                Some(_) => vec![],
            };
            loads
                .into_iter()
                .map(|load| from(tank, stints, fixed, stint + 1, after + load, seen))
                .max()
                .unwrap_or(NO_WAY)
        };
        seen.insert((stint, level), answer);
        answer
    }
    let farthest = from(tank, stints, fixed, 0, tank.capacity, &mut BTreeMap::new());
    assert_ne!(farthest, NO_WAY, "algún reparto tiene que poder empezar");
    (farthest != FINISHES).then_some(farthest)
}

#[test]
fn the_failing_lap_is_the_farthest_one_any_loads_reach() {
    let mut rng = Rng(0xE5F_0003);
    let (mut races, mut laps, mut reserve) = (0, 0, 0);
    while races < 6_000 {
        let Some(race) = race(&mut rng) else { continue };
        races += 1;
        let found = bounds(&race.input, &race.edited, &race.fixed);
        for kind in [Kind::Fuel, Kind::Energy] {
            let Some(tank) = race.tank(kind) else {
                continue;
            };
            let fixed: Vec<Option<i64>> = race
                .fixed
                .iter()
                .map(|stop| get(stop, kind).map(micro))
                .collect();
            for (stop, bounds) in found.iter().enumerate() {
                let Some(FixedProblem::BelowMin { fail_lap }) = of(bounds, kind).problem else {
                    continue;
                };
                let expected = farthest_failure(tank, &race.edited.stints, &fixed);
                assert_eq!(
                    fail_lap, expected,
                    "{kind:?} parada {stop}: {tank:?}, tramos {:?}, fijado {fixed:?}",
                    race.edited.stints
                );
                if fail_lap.is_some() {
                    laps += 1;
                } else {
                    reserve += 1;
                }
            }
        }
    }
    // Las dos respuestas tienen que darse muchas veces: «sin vuelta de fallo»
    // solo vale cuando algún reparto completa todas las vueltas (y lo que falta
    // es la reserva), y eso lo decide la fuerza bruta, no la cuenta.
    assert!(
        laps > 150 && reserve > 40,
        "{laps} con vuelta de fallo, {reserve} sin reserva en meta"
    );
}

// ---------------------------------------------------------------------------
// Fuji (#2692).
// ---------------------------------------------------------------------------

fn fuel(liters: f64) -> FixedStop {
    FixedStop {
        fuel_liters: Some(liters),
        ve_percent: None,
    }
}

fn close(range: Option<AmountRange>, min: f64, max: f64) -> bool {
    range.is_some_and(|range| (range.min - min).abs() < 1e-4 && (range.max - max).abs() < 1e-4)
}

// 82 L a 1,83012 L por vuelta, pasos de 1 L, reserva de 0,8 vueltas. Se sale
// con el depósito lleno: a la parada 1 se llega con 3,3 L y admite como mucho
// 78 L. A las siguientes se llega con más o menos según lo que cargue la
// anterior, y por eso admiten hasta 81 L.
#[test]
fn fuji_fuel_bounds_of_every_stop() {
    let (input, edited) = fuji();
    let found = bounds(&input, &edited, &[]);
    let expected = [
        ((3.3048, 3.3048), (74.0, 78.0)),
        ((0.4398, 4.4398), (73.0, 81.0)),
        ((0.5748, 4.5748), (75.0, 81.0)),
        ((0.8796, 2.8796), (74.0, 81.0)),
        ((0.0146, 5.0146), (41.0, 81.0)),
    ];
    assert_eq!(found.len(), expected.len());
    for (stop, (bounds, (arrival, service))) in found.iter().zip(expected).enumerate() {
        assert!(
            close(bounds.fuel.arrival, arrival.0, arrival.1),
            "llegada a la parada {}: {:?}",
            stop + 1,
            bounds.fuel.arrival
        );
        assert_eq!(
            bounds.fuel.service,
            Some(AmountRange {
                min: service.0,
                max: service.1
            }),
            "parada {}",
            stop + 1
        );
        assert_eq!(bounds.fuel.problem, None);
        assert_eq!(bounds.ve.problem, None);
    }
}

// El caso de #2692: sin fijar, la parada 2 carga 77 L. Con 4 L menos (73) hay
// plan; con 5 L menos (72) no, y la culpable es la parada 2.
#[test]
fn fuji_second_stop_admits_73_litres_and_not_72() {
    let (input, edited) = fuji();
    let automatic = [FixedStop::default(), FixedStop::default()];

    let four_less = [FixedStop::default(), fuel(73.0)];
    assert_eq!(bounds(&input, &edited, &four_less)[1].fuel.problem, None);
    assert!(recalculates(&input, &edited, &four_less));

    let five_less = [FixedStop::default(), fuel(72.0)];
    let found = bounds(&input, &edited, &five_less);
    // Llegando con 4,4 L como mucho, 72 L dan para 41 vueltas: de la 86 a la
    // 126. La parada 3 es en la 127.
    assert_eq!(
        found[1].fuel.problem,
        Some(FixedProblem::BelowMin {
            fail_lap: Some(127)
        })
    );
    // Los límites de la parada 2 son los mismos que sin fijarla.
    assert_eq!(
        found[1].fuel.service,
        bounds(&input, &edited, &automatic)[1].fuel.service
    );
    // La parada 1 tendría que cargar 79 L y solo le caben 78: nada vale en ella.
    assert_eq!(found[0].fuel.service, None);
    assert_eq!(found[0].fuel.problem, None, "la parada 1 es automática");
    let recalculation =
        recalculate_edited_plan_fixed(&input, &edited, &five_less, &AtomicBool::new(false))
            .expect("un resultado, no un error");
    assert!(!recalculation.outcome.result.feasible);
    assert_eq!(recalculation.unreachable_stop, Some(1));

    // Demasiado: 82 L no caben llegando con 0,4 L.
    let too_much = [FixedStop::default(), fuel(82.0)];
    assert_eq!(
        bounds(&input, &edited, &too_much)[1].fuel.problem,
        Some(FixedProblem::AboveMax)
    );
    assert!(!recalculates(&input, &edited, &too_much));
}

// La energía de Fuji (100 %, 2,3158 % por vuelta, pasos de 1 %), en la última
// parada y con otra cantidad fijada antes: cada valor de la rejilla, contra el
// recálculo.
#[test]
fn fuji_energy_bounds_match_the_recalculation() {
    let (input, edited) = fuji();
    let mut fixed = vec![FixedStop::default(); 5];
    fixed[3].ve_percent = Some(99.0);
    let service = bounds(&input, &edited, &fixed)[4].ve.service;
    assert!(service.is_some(), "la parada 5 admite alguna cantidad");
    for percent in 0..=100 {
        let amount = f64::from(percent);
        let mut tried = fixed.clone();
        tried[4].ve_percent = Some(amount);
        assert_eq!(
            recalculates(&input, &edited, &tried),
            contains(service, amount),
            "{amount} % en la parada 5: límites {service:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// Bordes.
// ---------------------------------------------------------------------------

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

// Con pasos finos decide la búsqueda extendida: no hay límites exactos.
#[test]
fn fine_steps_have_no_bounds() {
    let mut input = twelve_laps();
    input.fuel_capacity_liters = Scalar::manual(15.0);
    input.discretization.fuel_liters = 0.05;
    assert!(runs_extended_search(&input));
    assert_eq!(
        fixed_stop_bounds(&input, &schedule(&[6, 6]), &[]).expect("entrada válida"),
        None
    );
}

// Un coche sin energía virtual: su único valor es cero.
#[test]
fn a_resource_not_in_use_admits_only_zero() {
    let found = bounds(&twelve_laps(), &schedule(&[6, 6]), &[]);
    let zero = Some(AmountRange { min: 0.0, max: 0.0 });
    assert_eq!(found[0].ve.arrival, zero);
    assert_eq!(found[0].ve.service, zero);
    // Sale con 20 L, llega con 8 y el segundo tramo pide 12: de 4 a 12 L.
    assert_eq!(
        found[0].fuel.arrival,
        Some(AmountRange { min: 8.0, max: 8.0 })
    );
    assert_eq!(
        found[0].fuel.service,
        Some(AmountRange {
            min: 4.0,
            max: 12.0
        })
    );
}

#[test]
fn a_race_without_stops_has_no_bounds_to_give() {
    let mut input = twelve_laps();
    input.race_laps = 8;
    assert_eq!(bounds(&input, &schedule(&[8]), &[]), vec![]);
}

// Un tramo que no cabe en el depósito: ninguna cantidad da plan en ninguna
// parada, y a las de después ni se llega.
#[test]
fn a_stint_longer_than_the_tank_leaves_no_range() {
    // 20 L a 2 L por vuelta dan para 10 vueltas; el tramo del medio tiene 11.
    let mut input = twelve_laps();
    input.race_laps = 13;
    let edited = schedule(&[1, 11, 1]);
    let found = bounds(&input, &edited, &[]);
    assert_eq!(found[0].fuel.service, None);
    assert!(found[0].fuel.arrival.is_some());
    assert_eq!(found[1].fuel.arrival, None);
    assert_eq!(found[1].fuel.service, None);
    let fixed = [FixedStop::default(), fuel(2.0)];
    assert_eq!(
        bounds(&input, &edited, &fixed)[1].fuel.problem,
        Some(FixedProblem::NoRange)
    );
}

// Se llega a meta, pero sin la reserva: no hay vuelta de fallo.
#[test]
fn an_amount_short_of_the_reserve_has_no_failing_lap() {
    let mut input = twelve_laps();
    input.fuel_reserve = base_input().fuel_reserve;
    input.fuel_reserve["laps"]["value"] = json!(1.0);
    // Llega a la parada con 8 L; el segundo tramo gasta 12 y la reserva pide 2.
    let edited = schedule(&[6, 6]);
    assert_eq!(
        bounds(&input, &edited, &[])[0].fuel.service,
        Some(AmountRange {
            min: 6.0,
            max: 12.0
        })
    );
    assert_eq!(
        bounds(&input, &edited, &[fuel(5.0)])[0].fuel.problem,
        Some(FixedProblem::BelowMin { fail_lap: None })
    );
    assert_eq!(
        bounds(&input, &edited, &[fuel(3.0)])[0].fuel.problem,
        Some(FixedProblem::BelowMin { fail_lap: Some(12) })
    );
}

// El mejor caso puede pasar por otra parada fijada antes de quedarse corto:
// la vuelta de fallo (o la falta de reserva) se mira al final de ese camino, no
// en el tramo siguiente a la parada. 20 L a 2 L por vuelta, reserva de una
// vuelta (2 L), tramos 4-4-4: se llega a la parada 1 con 12 L.
#[test]
fn the_best_case_goes_through_later_fixed_stops() {
    let mut input = twelve_laps();
    input.fuel_reserve = base_input().fuel_reserve;
    input.fuel_reserve["laps"]["value"] = json!(1.0);
    let edited = schedule(&[4, 4, 4]);
    let problems = |first: f64, second: f64| {
        let fixed = [fuel(first), fuel(second)];
        assert!(!recalculates(&input, &edited, &fixed));
        let found = bounds(&input, &edited, &fixed);
        (found[0].fuel.problem, found[1].fuel.problem)
    };
    // 0 L y luego 5 L: se llega a la parada 2 con 4 L, se sale con 9 y el
    // último tramo gasta 8. Se completan todas las vueltas y queda 1 L: falta
    // la reserva, no hay vuelta de fallo. Vale para las dos paradas.
    let short_of_reserve = Some(FixedProblem::BelowMin { fail_lap: None });
    assert_eq!(problems(0.0, 5.0), (short_of_reserve, short_of_reserve));
    // 0 L y luego 3 L: se sale de la parada 2 con 7 L, que dan para 3 vueltas
    // (9, 10 y 11). La 12 no se completa, y la culpa es de las dos paradas.
    let dry_in_the_last_lap = Some(FixedProblem::BelowMin { fail_lap: Some(12) });
    assert_eq!(
        problems(0.0, 3.0),
        (dry_in_the_last_lap, dry_in_the_last_lap)
    );
    // Con 1 L más en la primera (o 6 L en la segunda) ya hay plan.
    assert_eq!(
        bounds(&input, &edited, &[fuel(1.0), fuel(5.0)])[0]
            .fuel
            .problem,
        None
    );
    assert!(recalculates(&input, &edited, &[fuel(1.0), fuel(5.0)]));
    assert!(recalculates(&input, &edited, &[fuel(0.0), fuel(6.0)]));
}

// Lo que el recálculo rechaza como error, los límites lo rechazan igual y con
// el mismo texto.
#[test]
fn the_errors_are_the_ones_of_the_recalculation() {
    let input = twelve_laps();
    let good = schedule(&[6, 6]);
    let broken = EditedPlan {
        stints: vec![6, 6],
        pit_stop_laps: vec![5],
    };
    let mut rules = input.clone();
    rules.event_rules.min_pit_stops = Some(2);
    let mut invalid = input.clone();
    invalid.race_laps = 0;
    for (input, edited, fixed) in [
        (&input, &broken, vec![]),
        (&input, &good, vec![FixedStop::default(), fuel(4.0)]),
        (&input, &good, vec![fuel(4.5)]),
        (&input, &good, vec![fuel(21.0)]),
        (&input, &good, vec![fuel(-1.0)]),
        (&input, &good, vec![fuel(f64::NAN)]),
        (&rules, &good, vec![]),
        (&invalid, &good, vec![]),
    ] {
        let recalculation =
            recalculate_edited_plan_fixed(input, edited, &fixed, &AtomicBool::new(false))
                .expect_err("el recálculo lo rechaza");
        assert_eq!(
            fixed_stop_bounds(input, edited, &fixed).expect_err("los límites también"),
            recalculation,
            "{edited:?} {fixed:?}"
        );
    }
    // Una lista más larga con todo en automático no fija nada fuera del calendario.
    let padded = vec![fuel(4.0), FixedStop::default(), FixedStop::default()];
    assert_eq!(bounds(&input, &good, &padded).len(), 1);
}
