//! Desgaste de neumáticos acumulado (#2691).
//!
//! El desgaste de cada vuelta depende de la edad de las ruedas en esa vuelta, y
//! la edad solo vuelve a cero al montar ruedas nuevas. La referencia de estos
//! tests es un modelo escrito aparte, desde esa definición y sin código del
//! crate: una cuenta vuelta a vuelta para evaluar un plan y una búsqueda propia
//! (todas las decisiones posibles, con memoria) para saber cuál es el mejor.
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;

use serde_json::{Value, json};
use vantare_strategy::solver::{
    DecisionVector, ExhaustedResource, Fitment, Input, OptimalityStatus, PitDecision, Scalar,
    StintDecision, replay_decision_v2, runs_extended_search, solve_v2_cancellable,
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
    fn pick<T: Clone>(&mut self, options: &[T]) -> T {
        options[usize::try_from(self.below(options.len() as u64)).expect("índice")].clone()
    }
    fn laps(&mut self, bound: u32) -> u32 {
        u32::try_from(self.below(u64::from(bound))).expect("vueltas")
    }
}

fn close(left: f64, right: f64) -> bool {
    (left - right).abs() <= left.abs().max(right.abs()).max(1.0) * 1e-9
}

// ---------------------------------------------------------------------------
// El modelo independiente.
// ---------------------------------------------------------------------------

/// Lo que pierde una vuelta según la edad de las ruedas. La edad de una vuelta
/// es su número de orden en la vida de las ruedas: 1 en la primera.
#[derive(Clone, Debug)]
enum Wear {
    /// Cada vuelta pierde `0` más que la anterior; la primera no pierde nada.
    Linear(f64),
    /// Puntos (edad, pérdida) ordenados por edad. Antes del primero vale el
    /// primero; entre dos puntos, la recta que los une; después del último
    /// sigue con la pendiente del último tramo, o con `tail` si es mayor, y
    /// nunca hacia abajo.
    Curve { points: Vec<(u32, f64)>, tail: f64 },
}

impl Wear {
    fn lap(&self, age: u32) -> f64 {
        match self {
            Self::Linear(slope) => slope * f64::from(age - 1),
            Self::Curve { points, tail } => {
                let (first, last) = (points[0], points[points.len() - 1]);
                if age <= first.0 {
                    return first.1;
                }
                if age > last.0 {
                    let slope = if points.len() > 1 {
                        let before = points[points.len() - 2];
                        (last.1 - before.1) / f64::from(last.0 - before.0)
                    } else {
                        0.0
                    };
                    return last.1 + f64::from(age - last.0) * slope.max(*tail).max(0.0);
                }
                let right = points
                    .iter()
                    .position(|point| age <= point.0)
                    .expect("hay un punto a la derecha");
                let (left, right) = (points[right - 1], points[right]);
                left.1 + f64::from(age - left.0) / f64::from(right.0 - left.0) * (right.1 - left.1)
            }
        }
    }

    /// Un tramo de `laps` vueltas con ruedas que ya llevaban `age` vueltas.
    fn stint(&self, age: u32, laps: u32) -> f64 {
        (1..=laps).map(|lap| self.lap(age + lap)).sum()
    }
}

fn base_input() -> Input {
    let mut input: Input = serde_json::from_str(include_str!("../testdata/fuji-1450-input.json"))
        .expect("entrada congelada de Fuji");
    input.extra.clear();
    input.budget.p95_millis = 60_000; // manda el límite de candidatos, no el reloj
    input.budget.max_candidates = 0;
    input.budget.max_iterations = 0;
    input.fuel_reserve = Value::Null;
    input.virtual_energy_reserve = Value::Null;
    input.ve_capacity_percent = Scalar::manual(0.0);
    input.ve_per_lap_percent = Scalar::manual(0.0);
    input
}

// ---------------------------------------------------------------------------
// Sin inventario: el replay de un plan con paradas que no cambian ruedas.
// ---------------------------------------------------------------------------

/// Una carrera sin compuestos: desgaste lineal, un solo tipo de rueda.
#[derive(Clone, Debug)]
struct Plain {
    laps: u32,
    base: f64,
    wear: f64,
    formation: f64,
    transit: f64,
    tyre_seconds: f64,
    parallel: bool,
    life: u32,
}

impl Plain {
    fn random(rng: &mut Rng) -> Self {
        Self {
            laps: 4 + rng.laps(20),
            base: rng.pick(&[60.0, 90.5]),
            wear: rng.pick(&[0.0, 0.05, 0.25, 0.8]),
            formation: rng.pick(&[0.0, 30.0]),
            transit: rng.pick(&[5.0, 20.0]),
            tyre_seconds: rng.pick(&[0.0, 3.0, 10.0]),
            parallel: rng.below(2) == 0,
            life: rng.pick(&[0, 0, 6, 9, 14]),
        }
    }

    /// El depósito cubre la carrera entera: las paradas no cargan nada y lo
    /// único que cambia de un plan a otro son las ruedas.
    fn input(&self) -> Input {
        let mut input = base_input();
        input.race_laps = self.laps;
        input.base_lap_seconds = Scalar::manual(self.base);
        input.degradation_per_lap_seconds = Scalar::manual(self.wear);
        input.formation.seconds = Scalar::manual(self.formation);
        input.pit_cost.transit_seconds = Scalar::manual(self.transit);
        input.pit_cost.refuel_rate_l_per_s = Scalar::manual(2.0);
        input.pit_cost.tyre_seconds = Scalar::manual(self.tyre_seconds);
        input.pit_cost.service_mode = if self.parallel {
            "parallel"
        } else {
            "sequential"
        }
        .into();
        input.tyre_life_laps = Scalar::manual(f64::from(self.life));
        input.fuel_capacity_liters = Scalar::manual(f64::from(self.laps));
        input.fuel_per_lap_liters = Scalar::manual(1.0);
        input.discretization.fuel_liters = 1.0;
        input
    }

    /// Una parada sin carga: el paso por boxes y, si se cambian, las ruedas.
    fn pit_seconds(&self, change: bool) -> f64 {
        self.transit + if change { self.tyre_seconds } else { 0.0 }
    }
}

/// Lo que el modelo independiente dice de un plan.
struct Expected {
    /// Primera vuelta que las ruedas no aguantan, si la vida no llega.
    worn_out_at: Option<u32>,
    wear: f64,
    /// Desgaste de cada tramo.
    stint_wear: Vec<f64>,
    pit: f64,
    total: f64,
    /// Tiempo al empezar la última vuelta.
    final_lap_start: f64,
}

fn expected(race: &Plain, stints: &[u32], changes: &[bool]) -> Expected {
    let wear = Wear::Linear(race.wear);
    let (mut age, mut done) = (0u32, 0u32);
    let mut result = Expected {
        worn_out_at: None,
        wear: 0.0,
        stint_wear: Vec::new(),
        pit: 0.0,
        total: race.formation,
        final_lap_start: 0.0,
    };
    for (index, &laps) in stints.iter().enumerate() {
        if race.life > 0 && age + laps > race.life && result.worn_out_at.is_none() {
            result.worn_out_at = Some(done + race.life - age + 1);
        }
        let stint = wear.stint(age, laps);
        if index + 1 == stints.len() {
            result.final_lap_start =
                result.total + f64::from(laps - 1) * race.base + wear.stint(age, laps - 1);
        }
        result.stint_wear.push(stint);
        result.wear += stint;
        result.total += f64::from(laps) * race.base + stint;
        age += laps;
        done += laps;
        if let Some(&change) = changes.get(index) {
            result.pit += race.pit_seconds(change);
            result.total += race.pit_seconds(change);
            if change {
                age = 0;
            }
        }
    }
    result
}

fn plain_decision(stints: &[u32], changes: &[bool]) -> DecisionVector {
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
        pit_stops: stints
            .iter()
            .zip(changes)
            .map(|(&laps, &change_tyres)| {
                lap += laps;
                PitDecision {
                    lap,
                    change_tyres,
                    ..PitDecision::default()
                }
            })
            .collect(),
    }
}

/// Reparte las vueltas en tramos al azar y decide en cada parada si cambia.
fn random_plan(rng: &mut Rng, laps: u32) -> (Vec<u32>, Vec<bool>) {
    let mut stints = Vec::new();
    let mut left = laps;
    while left > 0 {
        let stint = if stints.len() == 4 {
            left
        } else {
            1 + rng.laps(left.min(8))
        };
        stints.push(stint);
        left -= stint;
    }
    let changes = (1..stints.len()).map(|_| rng.below(3) == 0).collect();
    (stints, changes)
}

#[test]
fn a_replay_adds_exactly_the_wear_of_the_tyre_age() {
    let mut rng = Rng(0x2691_0001);
    let (mut kept, mut worn_out, mut slower) = (0, 0, 0);
    for index in 0..400 {
        let race = Plain::random(&mut rng);
        let (stints, changes) = random_plan(&mut rng, race.laps);
        let context = format!("caso {index} {race:?} tramos {stints:?} cambia {changes:?}");
        let want = expected(&race, &stints, &changes);
        let replay = replay_decision_v2(&race.input(), &plain_decision(&stints, &changes))
            .unwrap_or_else(|error| panic!("{context}: {error}"));
        if let Some(lap) = want.worn_out_at {
            worn_out += 1;
            assert!(!replay.feasible, "{context}: las ruedas no aguantan");
            assert_eq!(replay.reasons[0].code, "resource_exhausted", "{context}");
            let failure = replay.failure.expect("vuelta de fallo");
            assert_eq!(failure.resource, ExhaustedResource::Tyres, "{context}");
            assert_eq!(failure.lap, lap, "{context}: vuelta de fallo");
            continue;
        }
        assert!(replay.feasible, "{context}: {:?}", replay.reasons);
        kept += usize::from(changes.contains(&false));
        let evaluation = &replay.evaluation;
        assert!(
            close(evaluation.degradation_seconds, want.wear),
            "{context}: desgaste {} y son {}",
            evaluation.degradation_seconds,
            want.wear
        );
        assert!(close(evaluation.pit_seconds, want.pit), "{context}: boxes");
        assert!(
            close(evaluation.total_seconds, want.total),
            "{context}: total {} y son {}",
            evaluation.total_seconds,
            want.total
        );
        assert!(
            close(replay.final_lap_start_seconds, want.final_lap_start),
            "{context}: inicio de la última vuelta {} y son {}",
            replay.final_lap_start_seconds,
            want.final_lap_start
        );
        for (stint, &wear) in replay.stints.iter().zip(&want.stint_wear) {
            assert!(
                close(stint.evaluation.degradation_seconds, wear),
                "{context}: desgaste del tramo {}",
                stint.index
            );
        }
        // Frente a cambiar ruedas en todas las paradas (lo que se calculaba
        // antes): el desgaste sube `pérdida × edad × vueltas` en cada tramo que
        // empieza con ruedas usadas.
        let fresh = expected(&race, &stints, &vec![true; changes.len()]);
        let (mut age, mut extra) = (0u32, 0.0);
        for (index, &laps) in stints.iter().enumerate() {
            extra += race.wear * f64::from(age) * f64::from(laps);
            age = if changes.get(index) == Some(&false) {
                age + laps
            } else {
                0
            };
        }
        assert!(
            close(want.wear, fresh.wear + extra),
            "{context}: fórmula cerrada"
        );
        slower += usize::from(extra > 0.0);
    }
    assert!(
        kept > 150 && worn_out > 40 && slower > 100,
        "corpus pobre: {kept} con ruedas sin cambiar, {worn_out} sin vida, {slower} con desgaste de más"
    );
}

/// Con pérdida por desgaste cero, no cambiar ruedas solo ahorra su tiempo en boxes.
#[test]
fn without_wear_keeping_the_tyres_only_saves_their_service_time() {
    let mut rng = Rng(0x2691_0002);
    for index in 0..120 {
        let mut race = Plain::random(&mut rng);
        race.wear = 0.0;
        race.life = 0;
        let (stints, changes) = random_plan(&mut rng, race.laps);
        let all = vec![true; changes.len()];
        let input = race.input();
        let kept = replay_decision_v2(&input, &plain_decision(&stints, &changes)).expect("replay");
        let fresh = replay_decision_v2(&input, &plain_decision(&stints, &all)).expect("replay");
        assert!(kept.feasible && fresh.feasible, "caso {index}");
        assert_eq!(
            kept.evaluation.degradation_seconds.to_bits(),
            0.0f64.to_bits()
        );
        assert_eq!(
            kept.evaluation.green_seconds.to_bits(),
            fresh.evaluation.green_seconds.to_bits()
        );
        let saved =
            f64::from(u32::try_from(changes.iter().filter(|change| !**change).count()).expect("n"))
                * race.tyre_seconds;
        assert!(
            close(
                fresh.evaluation.total_seconds - kept.evaluation.total_seconds,
                saved
            ),
            "caso {index}: {} frente a {}",
            fresh.evaluation.total_seconds,
            kept.evaluation.total_seconds
        );
    }
}

/// Un plan que cambia ruedas en todas las paradas se evalúa igual que antes de
/// #2691, bit a bit: la cuenta de siempre, `pérdida × n × (n − 1) / 2` por tramo.
#[test]
fn a_plan_that_always_fits_new_tyres_keeps_the_old_formula_bit_for_bit() {
    let mut rng = Rng(0x2691_0003);
    for index in 0..200 {
        let mut race = Plain::random(&mut rng);
        race.life = 0;
        let (stints, changes) = random_plan(&mut rng, race.laps);
        let all = vec![true; changes.len()];
        let replay =
            replay_decision_v2(&race.input(), &plain_decision(&stints, &all)).expect("replay");
        let mut wear = 0.0;
        for (stint, &laps) in replay.stints.iter().zip(&stints) {
            let count = f64::from(laps);
            let old = count * (count - 1.0) / 2.0 * race.wear;
            assert_eq!(
                stint.evaluation.degradation_seconds.to_bits(),
                old.to_bits(),
                "caso {index}: tramo {}",
                stint.index
            );
            wear += old;
        }
        assert_eq!(
            replay.evaluation.degradation_seconds.to_bits(),
            wear.to_bits(),
            "caso {index}"
        );
    }
}

/// El ejemplo de la issue: 0,05 s por vuelta y dos tramos de 42 vueltas con las
/// mismas ruedas. El segundo tramo sale 0,05 × 42 × 42 = 88,2 s más lento que
/// con ruedas nuevas.
#[test]
fn two_stints_of_forty_two_laps_on_the_same_tyres_lose_eighty_eight_seconds() {
    let race = Plain {
        laps: 84,
        base: 90.0,
        wear: 0.05,
        formation: 0.0,
        transit: 25.0,
        tyre_seconds: 0.0,
        parallel: true,
        life: 0,
    };
    let input = race.input();
    let kept = replay_decision_v2(&input, &plain_decision(&[42, 42], &[false])).expect("replay");
    let fresh = replay_decision_v2(&input, &plain_decision(&[42, 42], &[true])).expect("replay");
    assert!(kept.feasible && fresh.feasible);
    assert!(close(
        fresh.evaluation.degradation_seconds,
        2.0 * 0.05 * 42.0 * 41.0 / 2.0
    ));
    assert!(close(
        kept.evaluation.total_seconds - fresh.evaluation.total_seconds,
        88.2
    ));
    assert!(close(
        kept.evaluation.degradation_seconds,
        0.05 * 84.0 * 83.0 / 2.0
    ));
}

// ---------------------------------------------------------------------------
// Con inventario físico: compuestos y juegos de ruedas.
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct Compound {
    name: &'static str,
    pace: f64,
    wear: Wear,
}

/// Una carrera con juegos de ruedas contados. `sets[i]` es el compuesto del
/// juego `i`. Un juego usado se puede volver a montar: sigue con su edad.
#[derive(Clone, Debug)]
struct Inventory {
    laps: u32,
    base: f64,
    formation: f64,
    transit: f64,
    refuel_rate: f64,
    tyre_seconds: f64,
    parallel: bool,
    life: u32,
    /// Depósito, consumo por vuelta y paso de carga, en litros enteros.
    capacity: u32,
    per_lap: u32,
    step: u32,
    compounds: Vec<Compound>,
    sets: Vec<usize>,
}

type Memo = HashMap<(u32, u32, usize, Vec<u32>), Option<f64>>;

impl Inventory {
    fn random(rng: &mut Rng) -> Self {
        let curve = Wear::Curve {
            points: vec![(1, 0.0), (2, rng.pick(&[0.5, 1.0])), (3, 2.0)],
            tail: 0.0,
        };
        let soft = Compound {
            name: "soft",
            pace: rng.pick(&[-1.0, -2.0]),
            wear: if rng.below(3) == 0 {
                curve
            } else {
                Wear::Linear(rng.pick(&[0.4, 0.8, 1.5]))
            },
        };
        let hard = Compound {
            name: "hard",
            pace: 0.0,
            wear: Wear::Linear(rng.pick(&[0.0, 0.1, 0.3])),
        };
        let compounds = if rng.below(4) == 0 {
            vec![soft]
        } else {
            vec![hard, soft]
        };
        let mut sets = Vec::new();
        for compound in 0..compounds.len() {
            for _ in 0..=rng.below(2) {
                sets.push(compound);
            }
        }
        Self {
            laps: 3 + rng.laps(4),
            base: 90.0,
            formation: rng.pick(&[0.0, 3.0]),
            transit: rng.pick(&[4.0, 10.0]),
            refuel_rate: rng.pick(&[1.0, 2.0]),
            tyre_seconds: rng.pick(&[0.0, 1.0, 3.0]),
            parallel: rng.below(2) == 0,
            life: rng.pick(&[0, 0, 3, 4]),
            capacity: rng.pick(&[2, 4]),
            per_lap: 1,
            step: rng.pick(&[1, 2]),
            compounds,
            sets,
        }
    }

    fn tyre_id(&self, set: usize, corner: usize) -> String {
        format!("{}-{set}-{corner}", self.compounds[self.sets[set]].name)
    }

    fn fitment(&self, set: usize) -> Fitment {
        Fitment {
            front_left: self.tyre_id(set, 0),
            front_right: self.tyre_id(set, 1),
            rear_left: self.tyre_id(set, 2),
            rear_right: self.tyre_id(set, 3),
        }
    }

    /// El juego al que pertenece una rueda, por su identificador.
    fn set_of(&self, fitment: &Fitment) -> usize {
        (0..self.sets.len())
            .find(|&set| self.tyre_id(set, 0) == fitment.front_left)
            .expect("juego del inventario")
    }

    fn input(&self) -> Input {
        let manual = json!({"kind": "manual", "sourceId": "test:2691"});
        let mut input = base_input();
        input.race_laps = self.laps;
        input.base_lap_seconds = Scalar::manual(self.base);
        input.degradation_per_lap_seconds = Scalar::manual(0.0);
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
        input.tyre_life_laps = Scalar::manual(f64::from(self.life));
        input.fuel_capacity_liters = Scalar::manual(f64::from(self.capacity));
        input.fuel_per_lap_liters = Scalar::manual(f64::from(self.per_lap));
        input.discretization.fuel_liters = f64::from(self.step);
        let tyres: Vec<Value> = (0..self.sets.len())
            .flat_map(|set| (0..4).map(move |corner| (set, corner)))
            .map(|(set, corner)| {
                json!({
                    "id": self.tyre_id(set, corner),
                    "compound": self.compounds[self.sets[set]].name,
                    "origin": "event_allocation",
                    "condition": {
                        "minimumRemainingPercent": 100,
                        "maximumRemainingPercent": 100,
                        "provenance": manual,
                        "confidence": {"level": "high", "basis": "prueba"},
                    },
                    "state": "free",
                    "stints": 0,
                })
            })
            .collect();
        input.extra.insert(
            "tyreInventory".into(),
            json!({"maximum": tyres.len(), "tyres": tyres}),
        );
        let pace: Vec<Value> = self
            .compounds
            .iter()
            .map(|compound| {
                let mut entry = json!({
                    "compound": compound.name,
                    "presence": "valid",
                    "provenance": manual,
                    "confidence": {"sampleSize": 1, "computationVersion": "solver-input.v2"},
                    "paceDeltaSeconds": compound.pace,
                    "degradationPerLapSeconds": 0.0,
                });
                match &compound.wear {
                    Wear::Linear(slope) => entry["degradationPerLapSeconds"] = json!(slope),
                    Wear::Curve { points, .. } => {
                        entry["curve"] = points
                            .iter()
                            .map(|(age, delta)| json!({"lapInStint": age, "deltaSeconds": delta}))
                            .collect();
                    }
                }
                entry
            })
            .collect();
        input.extra.insert("compoundPace".into(), json!(pace));
        input
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

    fn drive_seconds(&self, set: usize, age: u32, laps: u32) -> f64 {
        let compound = &self.compounds[self.sets[set]];
        f64::from(laps) * (self.base + compound.pace) + compound.wear.stint(age, laps)
    }

    /// El plan más rápido, probando todo: con qué juego se sale, cuánto dura
    /// cada tramo, cuánto se carga en cada parada y si se sigue con el mismo
    /// juego o se monta otro (nuevo o usado). `None`: no hay plan.
    fn best(&self) -> Option<f64> {
        let mut memo = Memo::new();
        let mut usage = vec![0; self.sets.len()];
        (0..self.sets.len())
            .filter_map(|set| self.rest(0, self.capacity, set, &mut usage, &mut memo))
            .min_by(f64::total_cmp)
            .map(|seconds| self.formation + seconds)
    }

    /// Lo mínimo que queda de carrera al empezar un tramo en la vuelta `done`
    /// con `fuel` litros, el juego `set` montado y lo que ha rodado cada juego.
    fn rest(
        &self,
        done: u32,
        fuel: u32,
        set: usize,
        usage: &mut Vec<u32>,
        memo: &mut Memo,
    ) -> Option<f64> {
        let key = (done, fuel, set, usage.clone());
        if let Some(&known) = memo.get(&key) {
            return known;
        }
        let mut best: Option<f64> = None;
        for laps in 1..=self.laps - done {
            if laps * self.per_lap > fuel || (self.life > 0 && usage[set] + laps > self.life) {
                break;
            }
            let drive = self.drive_seconds(set, usage[set], laps);
            let left = fuel - laps * self.per_lap;
            let after = if done + laps == self.laps {
                Some(0.0)
            } else {
                usage[set] += laps;
                let mut least: Option<f64> = None;
                for load in (0..=(self.capacity - left) / self.step).map(|n| n * self.step) {
                    for next in 0..self.sets.len() {
                        let tail = self.rest(done + laps, left + load, next, usage, memo);
                        if let Some(tail) = tail {
                            let seconds = self.pit_seconds(load, next != set) + tail;
                            if least.is_none_or(|least| seconds < least) {
                                least = Some(seconds);
                            }
                        }
                    }
                }
                usage[set] -= laps;
                least
            };
            if let Some(after) = after
                && best.is_none_or(|best| drive + after < best)
            {
                best = Some(drive + after);
            }
        }
        memo.insert(key, best);
        best
    }

    /// Evalúa un plan dado vuelta a vuelta. `Err(vuelta)`: la primera vuelta
    /// que las ruedas montadas no aguantan.
    fn evaluate(&self, plan: &[(usize, u32)], loads: &[u32]) -> Result<(f64, f64), u32> {
        let mut usage = vec![0; self.sets.len()];
        let (mut done, mut wear, mut total) = (0u32, 0.0, self.formation);
        for (index, &(set, laps)) in plan.iter().enumerate() {
            if self.life > 0 && usage[set] + laps > self.life {
                return Err(done + self.life - usage[set] + 1);
            }
            let compound = &self.compounds[self.sets[set]];
            wear += compound.wear.stint(usage[set], laps);
            total += self.drive_seconds(set, usage[set], laps);
            usage[set] += laps;
            done += laps;
            if let Some(&(next, _)) = plan.get(index + 1) {
                total += self.pit_seconds(loads[index], next != set);
            }
        }
        Ok((wear, total))
    }

    fn decision(&self, plan: &[(usize, u32)], loads: &[u32]) -> DecisionVector {
        let mut lap = 0;
        DecisionVector {
            stints: plan
                .iter()
                .enumerate()
                .map(|(index, &(set, laps))| StintDecision {
                    index,
                    laps,
                    compound: self.compounds[self.sets[set]].name.into(),
                    tyre_fitment: Some(self.fitment(set)),
                    ..StintDecision::default()
                })
                .collect(),
            pit_stops: plan
                .windows(2)
                .zip(loads)
                .map(|(pair, &load)| {
                    lap += pair[0].1;
                    PitDecision {
                        lap,
                        fuel_liters: f64::from(load),
                        change_tyres: pair[1].0 != pair[0].0,
                        ..PitDecision::default()
                    }
                })
                .collect(),
        }
    }

    /// El plan publicado, en los términos del modelo: juego y vueltas de cada
    /// tramo y litros de cada parada.
    fn plan_of(&self, decision: &DecisionVector) -> (Vec<(usize, u32)>, Vec<u32>) {
        let plan: Vec<(usize, u32)> = decision
            .stints
            .iter()
            .map(|stint| {
                let fitment = stint.tyre_fitment.as_ref().expect("juego montado");
                (self.set_of(fitment), stint.laps)
            })
            .collect();
        let loads = decision
            .pit_stops
            .iter()
            .map(|stop| {
                #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                // litros enteros y pequeños del generador.
                let liters = stop.fuel_liters.round() as u32;
                assert!(close(stop.fuel_liters, f64::from(liters)), "carga entera");
                liters
            })
            .collect();
        for (index, stop) in decision.pit_stops.iter().enumerate() {
            assert_eq!(
                stop.change_tyres,
                plan[index].0 != plan[index + 1].0,
                "parada {index}: «cambia ruedas» es montar otro juego"
            );
        }
        (plan, loads)
    }
}

/// Un plan cualquiera con el inventario: tramos al azar y, en cada parada,
/// seguir con el juego o montar otro, también uno ya usado.
fn random_set_plan(rng: &mut Rng, race: &Inventory) -> (Vec<(usize, u32)>, Vec<u32>) {
    let sets = race.sets.len() as u64;
    let mut plan: Vec<(usize, u32)> = Vec::new();
    let mut left = race.laps;
    while left > 0 {
        let laps = if plan.len() == 4 {
            left
        } else {
            1 + rng.laps(left.min(4))
        };
        let set = match plan.last() {
            Some(&(current, _)) if rng.below(2) == 0 => current,
            _ => usize::try_from(rng.below(sets)).expect("juego"),
        };
        plan.push((set, laps));
        left -= laps;
    }
    let loads = vec![0; plan.len() - 1];
    (plan, loads)
}

#[test]
fn a_replay_with_tyre_sets_wears_each_set_by_its_own_age() {
    let mut rng = Rng(0x2691_0004);
    let (mut kept, mut remounted, mut worn_out, mut curves) = (0, 0, 0, 0);
    for index in 0..400 {
        let mut race = Inventory::random(&mut rng);
        // El depósito cubre la carrera: aquí solo se miran las ruedas.
        race.laps += rng.laps(6);
        race.capacity = race.laps;
        race.life = rng.pick(&[0, 0, 5, 8]);
        let (plan, loads) = random_set_plan(&mut rng, &race);
        let context = format!("caso {index} {race:?} plan {plan:?}");
        let replay = replay_decision_v2(&race.input(), &race.decision(&plan, &loads))
            .unwrap_or_else(|error| panic!("{context}: {error}"));
        match race.evaluate(&plan, &loads) {
            Err(lap) => {
                worn_out += 1;
                assert!(!replay.feasible, "{context}: las ruedas no aguantan");
                let failure = replay.failure.expect("vuelta de fallo");
                assert_eq!(failure.resource, ExhaustedResource::Tyres, "{context}");
                assert_eq!(failure.lap, lap, "{context}: vuelta de fallo");
            }
            Ok((wear, total)) => {
                assert!(replay.feasible, "{context}: {:?}", replay.reasons);
                assert!(
                    close(replay.evaluation.degradation_seconds, wear),
                    "{context}: desgaste {} y son {wear}",
                    replay.evaluation.degradation_seconds
                );
                assert!(
                    close(replay.evaluation.total_seconds, total),
                    "{context}: total {} y son {total}",
                    replay.evaluation.total_seconds
                );
                kept += usize::from(plan.windows(2).any(|pair| pair[0].0 == pair[1].0));
                remounted += usize::from((2..plan.len()).any(|later| {
                    plan[later].0 != plan[later - 1].0
                        && plan[..later - 1]
                            .iter()
                            .any(|stint| stint.0 == plan[later].0)
                }));
                curves += usize::from(plan.iter().any(|stint| {
                    matches!(race.compounds[race.sets[stint.0]].wear, Wear::Curve { .. })
                }));
            }
        }
    }
    assert!(
        kept > 100 && remounted > 25 && worn_out > 40 && curves > 40,
        "corpus pobre: {kept} sin cambiar, {remounted} con juego usado, {worn_out} sin vida, {curves} con curva"
    );
}

fn solved(input: &Input) -> vantare_strategy::solver::SolverOutcome {
    solve_v2_cancellable(input, &AtomicBool::new(false)).expect("resultado")
}

#[test]
fn the_search_with_tyre_sets_finds_the_fastest_plan() {
    let mut rng = Rng(0x2691_0005);
    let (mut plans, mut none, mut kept, mut changed, mut remounted) = (0, 0, 0, 0, 0);
    for index in 0..110 {
        let mut race = Inventory::random(&mut rng);
        race.laps = race.laps.min(5);
        let input = race.input();
        assert!(runs_extended_search(&input), "caso {index}: con inventario");
        let context = format!("caso {index} {race:?}");
        let outcome = solved(&input);
        let Some(best) = race.best() else {
            none += 1;
            assert_eq!(
                outcome.certificate.status,
                OptimalityStatus::NoSolution,
                "{context}: no hay plan"
            );
            continue;
        };
        plans += 1;
        assert_eq!(
            outcome.certificate.status,
            OptimalityStatus::Proven,
            "{context}: hay plan ({best} s) y la búsqueda dice {:?}",
            outcome.certificate.reason
        );
        let cost = outcome.cost_seconds.expect("coste");
        assert!(
            close(cost, best),
            "{context}: la búsqueda da {cost} s y el más rápido son {best} s"
        );
        // El plan publicado vale lo que dice, contado vuelta a vuelta.
        let decision = outcome.result.best.as_ref().expect("decisión");
        let (plan, loads) = race.plan_of(decision);
        let (wear, total) = race.evaluate(&plan, &loads).expect("la vida aguanta");
        assert!(close(total, cost), "{context}: el plan vale {total} s");
        assert!(
            close(outcome.result.expected.degradation_seconds, wear),
            "{context}: desgaste"
        );
        kept += usize::from(plan.windows(2).any(|pair| pair[0].0 == pair[1].0));
        changed += usize::from(plan.windows(2).any(|pair| pair[0].0 != pair[1].0));
        remounted += usize::from((2..plan.len()).any(|later| {
            plan[later].0 != plan[later - 1].0
                && plan[..later - 1]
                    .iter()
                    .any(|stint| stint.0 == plan[later].0)
        }));
    }
    assert!(
        plans > 60 && none > 3 && kept > 10 && changed > 15,
        "corpus pobre: {plans} con plan, {none} sin plan, {kept} sin cambiar, {changed} cambiando, {remounted} con juego usado"
    );
}

// ---------------------------------------------------------------------------
// Los casos del oráculo Go que se apartan de él (#2691).
// ---------------------------------------------------------------------------

fn oracle_case(file: &str, name: &str) -> Value {
    let cases: Vec<Value> = serde_json::from_str(file).expect("oráculo");
    cases
        .into_iter()
        .find(|case| case["name"] == name)
        .unwrap_or_else(|| panic!("caso {name}"))
}

/// El modelo independiente de un caso de `solver-tyres.json`: blando y duro con
/// desgaste lineal, uno o dos juegos de cada uno.
fn oracle_tyres(input: &Value) -> Inventory {
    let value = |field: &str| input[field]["value"].as_f64().expect("valor");
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    // enteros pequeños del oráculo.
    let whole = |number: f64| number.round() as u32;
    let compounds: Vec<Compound> = ["hard", "soft"]
        .into_iter()
        .map(|name| {
            let pace = input["compoundPace"]
                .as_array()
                .expect("compuestos")
                .iter()
                .find(|pace| pace["compound"] == name)
                .expect("compuesto");
            assert!(pace["curve"].is_null(), "desgaste lineal");
            Compound {
                name,
                pace: pace["paceDeltaSeconds"].as_f64().expect("ritmo"),
                wear: Wear::Linear(pace["degradationPerLapSeconds"].as_f64().expect("pérdida")),
            }
        })
        .collect();
    let tyres = input["tyreInventory"]["tyres"].as_array().expect("ruedas");
    let mut sets = Vec::new();
    for (index, compound) in compounds.iter().enumerate() {
        let count = tyres
            .iter()
            .filter(|tyre| tyre["compound"] == compound.name)
            .count();
        assert_eq!(count % 4, 0, "juegos completos");
        sets.extend(std::iter::repeat_n(index, count / 4));
    }
    assert_eq!(value("veCapacityPercent").to_bits(), 0.0f64.to_bits());
    Inventory {
        laps: whole(input["raceLaps"].as_f64().expect("vueltas")),
        base: value("baseLapSeconds"),
        formation: input["formation"]["seconds"]["value"]
            .as_f64()
            .expect("formación"),
        transit: input["pitCost"]["transitSeconds"]["value"]
            .as_f64()
            .expect("paso"),
        refuel_rate: input["pitCost"]["refuelRateLPerS"]["value"]
            .as_f64()
            .expect("ritmo"),
        tyre_seconds: input["pitCost"]["tyreSeconds"]["value"]
            .as_f64()
            .expect("ruedas"),
        parallel: input["pitCost"]["serviceMode"] == "parallel",
        life: whole(value("tyreLifeLaps")),
        capacity: whole(value("fuelCapacityLiters")),
        per_lap: whole(value("fuelPerLapLiters")),
        step: whole(
            input["serviceDiscretization"]["fuelLiters"]
                .as_f64()
                .expect("paso"),
        ),
        compounds,
        sets,
    }
}

/// Los cuatro casos de `solver-tyres.json` en que Go elegía estirar el blando
/// sin cambiar ruedas: blando, tramos de 2 y 3 vueltas, 3,2 s de desgaste,
/// 461,7 s. Con el desgaste acumulado ese plan cuesta 8,0 s de desgaste
/// (0,8 × (0+1+2+3+4)) y 466,5 s, y deja de ser el mejor.
#[test]
fn the_four_oracle_cases_that_kept_the_soft_tyres_now_pay_their_real_wear() {
    let file = include_str!("../testdata/oracle/solver-tyres.json");
    for (name, new_best) in [
        ("tyres-parallel-life0-sets1", 464.5),
        ("tyres-parallel-life0-sets2", 464.2),
        ("tyres-sequential-life0-sets1", 464.5),
        ("tyres-sequential-life0-sets2", 464.5),
    ] {
        let case = oracle_case(file, name);
        let input: Input = serde_json::from_value(case["input"].clone()).expect("entrada");
        let go = &case["result"];
        // Lo que dice Go: no cambia ruedas y cuenta el desgaste de cada tramo desde cero.
        assert_eq!(go["best"]["pitStops"][0]["changeTyres"], false, "{name}");
        assert!(close(
            go["expected"]["degradationSeconds"].as_f64().expect("Go"),
            3.2
        ));
        assert!(close(
            go["expected"]["totalSeconds"].as_f64().expect("Go"),
            461.7
        ));
        // El mismo plan, ahora.
        let decision: DecisionVector =
            serde_json::from_value(go["best"].clone()).expect("plan de Go");
        let replay = replay_decision_v2(&input, &decision).expect("replay");
        assert!(replay.feasible, "{name}");
        assert!(close(replay.evaluation.degradation_seconds, 8.0), "{name}");
        assert!(close(replay.evaluation.total_seconds, 466.5), "{name}");
        // El mejor plan de ahora, según el modelo independiente y según la búsqueda.
        let race = oracle_tyres(&case["input"]);
        let best = race.best().expect("hay plan");
        assert!(close(best, new_best), "{name}: el modelo dice {best} s");
        let outcome = solved(&input);
        assert_eq!(
            outcome.certificate.status,
            OptimalityStatus::Proven,
            "{name}"
        );
        let cost = outcome.cost_seconds.expect("coste");
        assert!(close(cost, new_best), "{name}: la búsqueda dice {cost} s");
    }
}

// ---------------------------------------------------------------------------
// Curva combinada de la proyección y compuestos con valores propios por clima.
// ---------------------------------------------------------------------------

/// Un plan del oráculo con todas sus paradas sin cambio de ruedas.
fn kept_tyres(best: &Value) -> DecisionVector {
    let mut plan = best.clone();
    for stop in plan["pitStops"].as_array_mut().expect("paradas") {
        stop["changeTyres"] = json!(false);
    }
    serde_json::from_value(plan).expect("plan")
}

/// `projection-curve`: la curva combinada vale −0,5 s en la vuelta 1 y 1,0 s
/// en la 3, y sigue subiendo 0,75 s por vuelta. Go cambia ruedas tras 2 vueltas
/// (−0,5 + 0,25 y −0,5 + 0,25 + 1,0 = 0,5 s). Sin cambiarlas, las cinco vueltas
/// siguen la curva por la edad de las ruedas: −0,5 + 0,25 + 1,0 + 1,75 + 2,5 = 5,0 s.
#[test]
fn the_combined_curve_follows_the_tyre_age_when_tyres_are_kept() {
    let case = oracle_case(
        include_str!("../testdata/oracle/solver-projection.json"),
        "projection-curve",
    );
    let input: Input = serde_json::from_value(case["input"].clone()).expect("entrada");
    let go = &case["result"];
    assert!(close(
        go["expected"]["degradationSeconds"].as_f64().expect("Go"),
        0.5
    ));
    let stints: Vec<u64> = go["best"]["stints"]
        .as_array()
        .expect("tramos")
        .iter()
        .map(|stint| stint["laps"].as_u64().expect("vueltas"))
        .collect();
    assert_eq!(stints, [2, 3]);
    let curve = Wear::Curve {
        points: vec![(1, -0.5), (3, 1.0)],
        tail: (1.0 - -0.5) / 5.0f64.sqrt(),
    };
    assert!(close(curve.stint(0, 2) + curve.stint(0, 3), 0.5));
    assert!(close(curve.stint(0, 5), 5.0));
    let replay = replay_decision_v2(&input, &kept_tyres(&go["best"])).expect("replay");
    assert!(replay.feasible, "{:?}", replay.reasons);
    assert!(
        close(replay.evaluation.degradation_seconds, 5.0),
        "{}",
        replay.evaluation.degradation_seconds
    );
}

/// `weather-override-compound`: cinco vueltas, seca, húmeda y tres mojadas. El
/// blando pierde 0,8 s por vuelta de edad y, en mojado, 1,0 s. Con el blando
/// sin cambiar tras 2 vueltas, la edad sigue: 0 + 0,8 en las dos primeras y
/// 1,0 × (2 + 3 + 4) en las mojadas = 9,8 s. Contando cada tramo desde cero
/// eran 0 + 0,8 + 1,0 × (0 + 1 + 2) = 3,8 s.
#[test]
fn a_compound_with_its_own_wear_in_the_wet_follows_the_tyre_age() {
    let case = oracle_case(
        include_str!("../testdata/oracle/solver-weather.json"),
        "weather-override-compound",
    );
    let input: Input = serde_json::from_value(case["input"].clone()).expect("entrada");
    let soft = input.extra["tyreInventory"]["tyres"]
        .as_array()
        .expect("ruedas")
        .iter()
        .filter(|tyre| tyre["compound"] == "soft")
        .map(|tyre| tyre["id"].as_str().expect("id").to_owned())
        .collect::<Vec<_>>();
    let fitment = Fitment {
        front_left: soft[0].clone(),
        front_right: soft[1].clone(),
        rear_left: soft[2].clone(),
        rear_right: soft[3].clone(),
    };
    let decision = DecisionVector {
        stints: [2u32, 3]
            .into_iter()
            .enumerate()
            .map(|(index, laps)| StintDecision {
                index,
                laps,
                compound: "soft".into(),
                tyre_fitment: Some(fitment.clone()),
                ..StintDecision::default()
            })
            .collect(),
        pit_stops: vec![PitDecision {
            lap: 2,
            fuel_liters: 2.0,
            change_tyres: false,
            ..PitDecision::default()
        }],
    };
    let kept = replay_decision_v2(&input, &decision).expect("replay");
    assert!(kept.feasible, "{:?}", kept.reasons);
    assert!(
        close(kept.evaluation.degradation_seconds, 9.8),
        "{}",
        kept.evaluation.degradation_seconds
    );
}
