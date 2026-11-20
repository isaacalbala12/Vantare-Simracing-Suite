//! Ruedas que caben sin cambiar, por parada (#2743, E5h).
//!
//! `fixed_stop_tyres` dice, para cada parada del calendario editado, cuántas
//! vueltas llevan las ruedas al llegar, cuántas llevarían al acabar el tramo
//! siguiente si en ella no se cambian, y si lo fijado hoy («no cambiar») pasa
//! de la vida máxima.
//!
//! Hay dos referencias, ninguna es el código que se prueba. Las vueltas se
//! comparan con una cuenta escrita aparte, que va hacia atrás desde cada
//! parada. «Cabe o no cabe» se compara con el propio recálculo: hay plan
//! exactamente cuando ninguna parada pasa de la vida (y las cantidades fijadas
//! cuadran), y la parada culpable del recálculo es la primera que pasa.
use std::sync::atomic::AtomicBool;

use serde_json::json;
use vantare_strategy::application::{
    EditedPlan, fixed_stop_bounds, fixed_stop_tyres, recalculate_edited_plan_fixed,
};
use vantare_strategy::solver::{
    FixedStop, Input, Scalar, TyreBounds, runs_extended_search, solve_greedy_fallback,
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

// ---------------------------------------------------------------------------
// Carreras pequeñas, calendarios y cosas fijadas al azar.
// ---------------------------------------------------------------------------

/// Una carrera pequeña sin energía virtual ni reglas de paradas: combustible
/// en litros enteros, con vida de ruedas (0 = sin límite) y desgaste.
#[derive(Clone, Copy, Debug)]
struct Race {
    laps: u32,
    tyre_life: u32,
    capacity: u32,
    per_lap: u32,
    step: u32,
}

impl Race {
    fn random(rng: &mut Rng) -> Self {
        Self {
            laps: u32::try_from(4 + rng.below(9)).expect("vueltas"),
            tyre_life: rng.pick(&[0, 3, 4, 5, 6, 8]),
            capacity: rng.pick(&[8, 10, 12]),
            per_lap: rng.pick(&[2, 3]),
            step: rng.pick(&[1, 2]),
        }
    }

    fn input(self, candidates: usize) -> Input {
        let mut input: Input =
            serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
                .expect("entrada congelada de Fuji");
        input.extra.clear();
        input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
        input.budget.max_candidates = candidates;
        input.budget.max_iterations = 1_000_000;
        input.race_laps = self.laps;
        input.degradation_per_lap_seconds = Scalar::manual(0.25);
        input.pit_cost.tyre_seconds = Scalar::manual(10.0);
        input.tyre_life_laps = Scalar::manual(f64::from(self.tyre_life));
        input.fuel_capacity_liters = Scalar::manual(f64::from(self.capacity));
        input.fuel_per_lap_liters = Scalar::manual(f64::from(self.per_lap));
        input.discretization.fuel_liters = f64::from(self.step);
        input.fuel_reserve = serde_json::Value::Null;
        input.virtual_energy_reserve = serde_json::Value::Null;
        input.ve_capacity_percent = Scalar::manual(0.0);
        input.ve_per_lap_percent = Scalar::manual(0.0);
        input.event_rules.min_pit_stops = None;
        input.event_rules.max_pit_stops = None;
        input.event_rules.required_windows.clear();
        input
    }
}

fn schedule(stints: &[u32]) -> EditedPlan {
    let mut lap = 0;
    EditedPlan {
        stints: stints.to_vec(),
        pit_stop_laps: stints[..stints.len() - 1]
            .iter()
            .map(|&laps| {
                lap += laps;
                lap
            })
            .collect(),
    }
}

/// De una a tres paradas en vueltas al azar.
fn random_schedule(rng: &mut Rng, laps: u32) -> EditedPlan {
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
    schedule(&stints)
}

/// Dos de cada tres calendarios son los del plan de respaldo (seguro que se
/// pueden seguir sin fijar nada); el resto, al azar.
fn some_schedule(rng: &mut Rng, race: Race, index: usize) -> EditedPlan {
    match solve_greedy_fallback(&race.input(1)) {
        Ok(plan) if !index.is_multiple_of(3) && !plan.result.pit_stops.is_empty() => {
            schedule(&plan.result.stints)
        }
        _ => random_schedule(rng, race.laps),
    }
}

fn tyres(change: Option<bool>) -> FixedStop {
    FixedStop {
        change_tyres: change,
        ..FixedStop::default()
    }
}

fn keep() -> FixedStop {
    tyres(Some(false))
}

/// Qué se hace con las ruedas en cada parada: lo normal es no cambiar, que es
/// lo que se quiere probar.
fn some_tyres(rng: &mut Rng, stops: usize) -> Vec<FixedStop> {
    (0..stops)
        .map(|_| tyres(rng.pick(&[None, Some(true), Some(false), Some(false)])))
        .collect()
}

fn found(input: &Input, edited: &EditedPlan, fixed: &[FixedStop]) -> Vec<TyreBounds> {
    fixed_stop_tyres(input, edited, fixed).expect("entrada válida")
}

fn feasible(input: &Input, edited: &EditedPlan, fixed: &[FixedStop]) -> (bool, Option<usize>) {
    let recalculation =
        recalculate_edited_plan_fixed(input, edited, fixed, &AtomicBool::new(false))
            .expect("recálculo");
    (
        recalculation.outcome.result.feasible,
        recalculation.unreachable_stop,
    )
}

// ---------------------------------------------------------------------------
// Las vueltas, contra una cuenta escrita aparte.
// ---------------------------------------------------------------------------

/// Vueltas que llevan las ruedas al llegar a la parada `stop`: su tramo y los
/// anteriores, hacia atrás, mientras la parada de antes tenga fijado no cambiar.
fn arrival_by_hand(stints: &[u32], fixed: &[FixedStop], stop: usize) -> u32 {
    let mut laps = stints[stop];
    let mut first = stop;
    while first > 0
        && fixed
            .get(first - 1)
            .is_some_and(|before| before.change_tyres == Some(false))
    {
        first -= 1;
        laps += stints[first];
    }
    laps
}

#[test]
fn the_laps_of_the_tyres_are_the_ones_of_a_count_made_apart() {
    let mut rng = Rng(0x2743_0001);
    let (mut kept_stops, mut beyond, mut without_life) = (0, 0, 0);
    for index in 0..600 {
        let race = Race::random(&mut rng);
        let input = race.input(1);
        let edited = random_schedule(&mut rng, race.laps);
        let stops = edited.pit_stop_laps.len();
        // La lista puede ser más corta que el calendario: lo que falta es automático.
        let mut fixed = some_tyres(&mut rng, stops);
        fixed.truncate(usize::try_from(rng.below(stops as u64 + 1)).expect("paradas"));
        let context = format!("caso {index} {race:?} {edited:?} {fixed:?}");
        let bounds = found(&input, &edited, &fixed);
        assert_eq!(bounds.len(), stops, "{context}");
        for (stop, tyres) in bounds.iter().enumerate() {
            let arrival = arrival_by_hand(&edited.stints, &fixed, stop);
            let kept = arrival + edited.stints[stop + 1];
            let life = (race.tyre_life > 0).then_some(race.tyre_life);
            let keeps = fixed
                .get(stop)
                .is_some_and(|f| f.change_tyres == Some(false));
            assert_eq!(
                *tyres,
                TyreBounds {
                    life_laps: life,
                    arrival_laps: arrival,
                    kept_laps: kept,
                    beyond_life: keeps && life.is_some_and(|life| kept > life),
                },
                "{context}: parada {stop}"
            );
            kept_stops += usize::from(keeps);
            beyond += usize::from(tyres.beyond_life);
            without_life += usize::from(life.is_none());
        }
    }
    assert!(
        kept_stops > 200 && beyond > 80 && without_life > 80,
        "corpus pobre: {kept_stops} sin cambio, {beyond} que pasan de la vida, {without_life} sin vida"
    );
}

// ---------------------------------------------------------------------------
// «Cabe o no cabe», contra el recálculo.
// ---------------------------------------------------------------------------

/// Solo con ruedas fijadas, y en calendarios que tienen plan sin fijar nada:
/// hay plan exactamente cuando ninguna parada pasa de la vida, y si no lo hay
/// la parada culpable es la primera que pasa. Con 1 candidato decide el
/// respaldo; con un millón, la búsqueda.
#[test]
fn with_only_tyres_fixed_there_is_a_plan_exactly_when_no_stop_outlasts_the_life() {
    let mut rng = Rng(0x2743_0002);
    let (mut plans, mut blamed, mut calendar_fault) = (0, 0, 0);
    for index in 0..420 {
        let race = Race::random(&mut rng);
        let edited = some_schedule(&mut rng, race, index);
        let fixed = some_tyres(&mut rng, edited.pit_stop_laps.len());
        let context = format!("caso {index} {race:?} {edited:?} {fixed:?}");
        let bounds = found(&race.input(1), &edited, &fixed);
        let first_beyond = bounds.iter().position(|tyres| tyres.beyond_life);
        for candidates in [1, 1_000_000] {
            let input = race.input(candidates);
            assert_eq!(found(&input, &edited, &fixed), bounds, "{context}");
            let (automatic, _) = feasible(&input, &edited, &[]);
            let (plan, blame) = feasible(&input, &edited, &fixed);
            if !automatic {
                // El calendario no vale ni sin fijar nada: no es culpa de las ruedas.
                assert!(!plan, "{context} ({candidates} candidatos)");
                assert_eq!(blame, None, "{context} ({candidates} candidatos)");
                continue;
            }
            assert_eq!(
                plan,
                first_beyond.is_none(),
                "{context} ({candidates} candidatos)"
            );
            assert_eq!(
                blame, first_beyond,
                "{context} ({candidates} candidatos): parada culpable"
            );
        }
        match (feasible(&race.input(1), &edited, &[]).0, first_beyond) {
            (false, _) => calendar_fault += 1,
            (true, None) => plans += 1,
            (true, Some(_)) => blamed += 1,
        }
    }
    assert!(
        plans > 60 && blamed > 60 && calendar_fault > 30,
        "corpus pobre: {plans} con plan, {blamed} con parada culpable, {calendar_fault} por el calendario"
    );
}

/// Con ruedas y litros fijados a la vez son restricciones independientes: hay
/// plan exactamente cuando el calendario lo tiene sin fijar nada, ninguna
/// cantidad fijada lleva problema y ninguna parada pasa de la vida.
#[test]
fn with_tyres_and_amounts_fixed_there_is_a_plan_exactly_when_nothing_is_marked() {
    let mut rng = Rng(0x2743_0003);
    let (mut plans, mut by_tyres, mut by_fuel, mut by_both) = (0, 0, 0, 0);
    for index in 0..500 {
        let race = Race::random(&mut rng);
        let edited = some_schedule(&mut rng, race, index);
        let mut fixed = some_tyres(&mut rng, edited.pit_stop_laps.len());
        for stop in &mut fixed {
            if rng.below(2) == 0 {
                let steps = rng.below(u64::from(race.capacity / race.step) + 1);
                stop.fuel_liters =
                    Some(f64::from(u32::try_from(steps).expect("pasos") * race.step));
            }
        }
        let context = format!("caso {index} {race:?} {edited:?} {fixed:?}");
        for candidates in [1, 1_000_000] {
            let input = race.input(candidates);
            assert!(!runs_extended_search(&input), "{context}");
            let (automatic, _) = feasible(&input, &edited, &[]);
            if !automatic {
                assert!(!feasible(&input, &edited, &fixed).0, "{context}");
                continue;
            }
            let fuel = fixed_stop_bounds(&input, &edited, &fixed)
                .expect("entrada válida")
                .expect("rejilla escalar")
                .iter()
                .any(|stop| stop.fuel.problem.is_some());
            let tyres = found(&input, &edited, &fixed)
                .iter()
                .any(|stop| stop.beyond_life);
            assert_eq!(
                feasible(&input, &edited, &fixed).0,
                !fuel && !tyres,
                "{context} ({candidates} candidatos): litros {fuel}, ruedas {tyres}"
            );
            if candidates == 1 {
                match (fuel, tyres) {
                    (false, false) => plans += 1,
                    (false, true) => by_tyres += 1,
                    (true, false) => by_fuel += 1,
                    (true, true) => by_both += 1,
                }
            }
        }
    }
    assert!(
        plans > 25 && by_tyres > 25 && by_fuel > 25 && by_both > 25,
        "corpus pobre: {plans} con plan, {by_tyres} por ruedas, {by_fuel} por litros, {by_both} por las dos"
    );
}

// ---------------------------------------------------------------------------
// Casos a mano.
// ---------------------------------------------------------------------------

/// Doce vueltas, depósito de 12 L a 2 L por vuelta y vida de ruedas de 8 vueltas.
fn twelve_laps() -> Race {
    Race {
        laps: 12,
        tyre_life: 8,
        capacity: 12,
        per_lap: 2,
        step: 2,
    }
}

fn bounds(life: Option<u32>, arrival: u32, kept: u32, beyond: bool) -> TyreBounds {
    TyreBounds {
        life_laps: life,
        arrival_laps: arrival,
        kept_laps: kept,
        beyond_life: beyond,
    }
}

// Tres tramos de cuatro vueltas y ocho de vida. Sin cambiar en la primera
// parada las ruedas hacen ocho vueltas: justo la vida, cabe. Sin cambiar
// tampoco en la segunda harían doce: no cabe, y es la segunda la que lo dice.
#[test]
fn eight_laps_of_life_last_two_stints_of_four_and_not_three() {
    let input = twelve_laps().input(1);
    let edited = schedule(&[4, 4, 4]);
    assert_eq!(
        found(&input, &edited, &[]),
        [bounds(Some(8), 4, 8, false), bounds(Some(8), 4, 8, false)],
        "sin fijar nada: en cada parada se llega con las ruedas de un tramo"
    );
    assert_eq!(
        found(&input, &edited, &[keep()]),
        [bounds(Some(8), 4, 8, false), bounds(Some(8), 8, 12, false)],
        "la segunda parada no tiene nada fijado: no se marca, pero ya se ve que no cabría"
    );
    assert_eq!(
        found(&input, &edited, &[keep(), keep()]),
        [bounds(Some(8), 4, 8, false), bounds(Some(8), 8, 12, true)]
    );
    assert_eq!(feasible(&input, &edited, &[keep()]), (true, None));
    assert_eq!(
        feasible(&input, &edited, &[keep(), keep()]),
        (false, Some(1))
    );
}

// Una vuelta más en el segundo tramo y ya no cabe en la primera parada.
#[test]
fn one_lap_over_the_life_is_too_much() {
    let input = twelve_laps().input(1);
    let edited = schedule(&[4, 5, 3]);
    assert_eq!(
        found(&input, &edited, &[keep()])[0],
        bounds(Some(8), 4, 9, true)
    );
    assert_eq!(feasible(&input, &edited, &[keep()]), (false, Some(0)));
}

// Vida 0 es «sin límite»: no hay vida que enseñar y nada pasa de ella.
#[test]
fn without_a_life_nothing_outlasts_it() {
    let mut race = twelve_laps();
    race.tyre_life = 0;
    let input = race.input(1);
    let edited = schedule(&[4, 4, 4]);
    assert_eq!(
        found(&input, &edited, &[keep(), keep()]),
        [bounds(None, 4, 8, false), bounds(None, 8, 12, false)]
    );
    assert_eq!(feasible(&input, &edited, &[keep(), keep()]), (true, None));
}

// Ruedas nuevas ponen la cuenta a cero, estén fijadas o las decida el cálculo.
#[test]
fn new_tyres_start_from_zero_whether_fixed_or_automatic() {
    let input = twelve_laps().input(1);
    let edited = schedule(&[3, 3, 3, 3]);
    let automatic = found(&input, &edited, &[]);
    assert_eq!(
        automatic,
        found(&input, &edited, &[tyres(Some(true)); 3]),
        "fijar «cambiar» es lo que el cálculo hace solo"
    );
    assert_eq!(automatic, [bounds(Some(8), 3, 6, false); 3]);
    // Sin cambiar en la primera, cambiando en la segunda: la tercera vuelve a
    // llegar con las ruedas de un solo tramo.
    for second in [None, Some(true)] {
        assert_eq!(
            found(&input, &edited, &[keep(), tyres(second), keep()]),
            [
                bounds(Some(8), 3, 6, false),
                bounds(Some(8), 6, 9, false),
                bounds(Some(8), 3, 6, false),
            ],
            "segunda parada {second:?}"
        );
    }
}

// Las vueltas de una parada no dependen de lo fijado en ella ni después: así
// sirven de ayuda antes de elegir. Solo la marca depende de lo fijado en ella.
#[test]
fn what_is_fixed_here_or_later_does_not_move_the_laps_of_a_stop() {
    let input = twelve_laps().input(1);
    let edited = schedule(&[3, 3, 3, 3]);
    let options = [None, Some(true), Some(false)];
    for first in options {
        let reference = found(&input, &edited, &[tyres(first)]);
        for second in options {
            for third in options {
                let fixed = [tyres(first), tyres(second), tyres(third)];
                let all = found(&input, &edited, &fixed);
                // La primera parada no se mueve con nada; la segunda, solo con la primera.
                assert_eq!((all[0].arrival_laps, all[0].kept_laps), (3, 6), "{fixed:?}");
                assert_eq!(
                    (all[1].arrival_laps, all[1].kept_laps),
                    (reference[1].arrival_laps, reference[1].kept_laps),
                    "{fixed:?}"
                );
                assert_eq!(
                    all[1].beyond_life,
                    second == Some(false) && all[1].kept_laps > 8,
                    "{fixed:?}"
                );
            }
        }
    }
}

// Con pasos finos decide la búsqueda extendida y no hay límites de cantidades,
// pero las ruedas no dependen de la rejilla: se cuentan igual.
#[test]
fn fine_steps_still_count_the_tyres() {
    let mut input = twelve_laps().input(1);
    input.fuel_capacity_liters = Scalar::manual(15.0);
    input.discretization.fuel_liters = 0.05;
    assert!(runs_extended_search(&input));
    let edited = schedule(&[4, 4, 4]);
    assert_eq!(
        fixed_stop_bounds(&input, &edited, &[keep(), keep()]).expect("entrada válida"),
        None
    );
    assert_eq!(
        found(&input, &edited, &[keep(), keep()]),
        [bounds(Some(8), 4, 8, false), bounds(Some(8), 8, 12, true)]
    );
}

// Si el calendario no tiene plan ni sin fijar nada, la culpa no es de las
// ruedas aunque una parada salga marcada: aquí el primer tramo ya pasa de la
// vida. El recálculo no señala parada, y quien enseñe la marca tampoco debe
// culpar a las ruedas.
#[test]
fn a_calendar_without_a_plan_is_not_the_fault_of_the_tyres() {
    let race = Race {
        per_lap: 1,
        step: 1,
        ..twelve_laps()
    };
    let input = race.input(1);
    let edited = schedule(&[10, 2]);
    assert_eq!(feasible(&input, &edited, &[]), (false, None));
    assert_eq!(
        found(&input, &edited, &[keep()]),
        [bounds(Some(8), 10, 12, true)]
    );
    assert_eq!(feasible(&input, &edited, &[keep()]), (false, None));
}

// ---------------------------------------------------------------------------
// Entradas que no valen: las mismas negativas que el recálculo.
// ---------------------------------------------------------------------------

/// La reserva de la entrada congelada de Fuji: 0,8 vueltas, bien formada.
fn fuji_reserve() -> serde_json::Value {
    let fuji: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("entrada congelada de Fuji");
    fuji.fuel_reserve
}

#[test]
fn the_refusals_are_the_ones_of_the_recalculation() {
    let input = twelve_laps().input(1);
    let good = schedule(&[4, 4, 4]);
    let fuel = |liters: f64| FixedStop {
        fuel_liters: Some(liters),
        ..FixedStop::default()
    };
    let mut no_laps = input.clone();
    no_laps.race_laps = 0;
    let mut one_stop_at_most = input.clone();
    one_stop_at_most.event_rules.max_pit_stops = Some(1);
    // La reserva también es entrada del recálculo, aunque no mueva las ruedas.
    let mut unknown_reserve = input.clone();
    unknown_reserve.fuel_reserve = fuji_reserve();
    unknown_reserve.fuel_reserve["kind"] = json!("bogus");
    let mut negative_reserve = input.clone();
    negative_reserve.fuel_reserve = fuji_reserve();
    negative_reserve.fuel_reserve["laps"]["value"] = json!(-1);
    let mut reserve_over_all = input.clone();
    reserve_over_all.virtual_energy_reserve = fuji_reserve();
    reserve_over_all.virtual_energy_reserve["kind"] = json!("percent");
    reserve_over_all.virtual_energy_reserve["percent"] = json!({
        "value": 150,
        "evidence": fuji_reserve()["selection"],
    });
    let mut reserve_without_source = input.clone();
    reserve_without_source.virtual_energy_reserve = fuji_reserve();
    reserve_without_source.virtual_energy_reserve["selection"]["provenance"]["kind"] =
        json!("bogus");
    let cases: Vec<(&str, Input, EditedPlan, Vec<FixedStop>)> = vec![
        (
            "reserva de combustible de un tipo desconocido",
            unknown_reserve,
            good.clone(),
            vec![keep()],
        ),
        (
            "reserva de combustible negativa",
            negative_reserve,
            good.clone(),
            vec![],
        ),
        (
            "reserva de energía de más del 100 %",
            reserve_over_all,
            good.clone(),
            vec![keep()],
        ),
        (
            "reserva de energía sin un origen válido",
            reserve_without_source,
            good.clone(),
            vec![],
        ),
        ("entrada no válida", no_laps, good.clone(), vec![]),
        (
            "el calendario no suma la carrera",
            input.clone(),
            schedule(&[4, 4, 5]),
            vec![],
        ),
        (
            "una parada fuera de su vuelta",
            input.clone(),
            EditedPlan {
                stints: vec![4, 4, 4],
                pit_stop_laps: vec![4, 9],
            },
            vec![],
        ),
        (
            "más paradas de las que dejan las reglas",
            one_stop_at_most,
            good.clone(),
            vec![],
        ),
        (
            "ruedas fijadas en una parada que no existe",
            input.clone(),
            good.clone(),
            vec![keep(), keep(), keep()],
        ),
        (
            "litros fuera de la rejilla",
            input.clone(),
            good.clone(),
            vec![fuel(3.0)],
        ),
        (
            "más litros que el depósito",
            input.clone(),
            good.clone(),
            vec![keep(), fuel(14.0)],
        ),
    ];
    for (name, input, edited, fixed) in cases {
        let refusal = fixed_stop_tyres(&input, &edited, &fixed).expect_err(name);
        let recalculation =
            recalculate_edited_plan_fixed(&input, &edited, &fixed, &AtomicBool::new(false))
                .expect_err(name);
        assert_eq!(refusal, recalculation, "{name}");
    }
    // Una reserva válida no es una negativa, y no mueve las ruedas.
    let mut with_reserve = input.clone();
    with_reserve.fuel_reserve = fuji_reserve();
    with_reserve.virtual_energy_reserve = fuji_reserve();
    assert_eq!(
        found(&with_reserve, &good, &[keep(), keep()]),
        found(&input, &good, &[keep(), keep()])
    );
    // Y lo que vale para el recálculo vale aquí: una lista más larga que el
    // calendario, si lo que sobra es automático.
    assert_eq!(
        found(
            &input,
            &good,
            &[keep(), tyres(None), tyres(None), tyres(None)]
        ),
        found(&input, &good, &[keep()])
    );
}
