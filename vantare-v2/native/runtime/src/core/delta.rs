//! Delta de respaldo del jugador frente a su mejor vuelta completada
//! (matemática de ISA-1403 `derive/delta.rs`). La vuelta de referencia se
//! muestrea con la distancia y el tiempo de la vuelta en curso del modelo; sin
//! reloj de pared.

use std::cmp::Ordering;

use vantare_domain::{Car, Player, Quality};

/// Cadencia de muestreo, en tiempo de vuelta (el original usaba 100 ms de su
/// reloj de fuente).
const SAMPLE_INTERVAL_S: f64 = 0.1;
/// Caída de distancia que delata el cruce de meta (el contador de vueltas
/// puede llegar en una foto posterior).
const WRAP_MINIMUM_DROP_M: f64 = 100.0;
/// Tope de muestras por vuelta. El original invalidaba la vuelta al llenarse;
/// aquí se invalida la candidata para que una truncada nunca gane.
const MAX_LAP_SAMPLES: usize = 18_000;
// Cobertura de distancia: muestras dentro del 2 % inicial y final, y un cruce
// observado entre ambas. No certifica validez deportiva ni trazada continua.

/// Estado entre fotos del delta del jugador. Vive en el núcleo, no en `domain`.
#[derive(Debug, Default)]
pub(super) struct Tracker {
    last: Option<Reading>,
    candidate: Vec<Point>,
    reference: Option<Reference>,
    /// Se cruzó la meta y el contador de vueltas aún no lo refleja.
    wrapped: bool,
    truncated: bool,
    started_at_line: bool,
}

#[derive(Clone, Copy, Debug)]
struct Reading {
    lap: u32,
    distance_m: f64,
    elapsed_s: f64,
    length_m: f64,
}

#[derive(Clone, Copy, Debug)]
struct Point {
    distance_m: f64,
    elapsed_s: f64,
}

/// Vuelta completada que sirve de referencia.
#[derive(Debug)]
struct Reference {
    duration_s: f64,
    samples: Vec<Point>,
}

impl Tracker {
    /// Olvida todo: sesión nueva o cambio de coche del jugador.
    pub(super) fn reset(&mut self) {
        *self = Self::default();
    }

    /// Pierde la vuelta en curso (dato ausente o boxes); la referencia se
    /// conserva.
    pub(super) fn invalidate(&mut self) {
        self.last = None;
        self.candidate.clear();
        self.wrapped = false;
        self.truncated = false;
        self.started_at_line = false;
    }

    pub(super) fn derive(&mut self, player: &mut Player, car: &Car, track_length: Quality<f64>) {
        let Some(reading) = reading(car, track_length) else {
            self.invalidate();
            return;
        };
        if car.in_pits.current().copied() == Some(true) {
            self.invalidate();
            return;
        }
        self.advance(reading);
        // Un delta nativo actual siempre gana; si no, se marca `Estimated`.
        if player.delta_best_s.current().is_some() {
            return;
        }
        if let Some(delta) = self.delta(reading) {
            player.delta_best_s = Quality::Estimated(delta);
        }
    }

    fn advance(&mut self, reading: Reading) {
        let Some(last) = self.last else {
            self.last = Some(reading);
            self.start_lap(reading, false);
            return;
        };
        let step = i64::from(reading.lap) - i64::from(last.lap);
        match step.cmp(&0) {
            Ordering::Less => {
                // Vuelta hacia atrás: nada comparable.
                self.reset();
                self.last = Some(reading);
                self.start_lap(reading, false);
            }
            Ordering::Equal => {
                if reading.distance_m + WRAP_MINIMUM_DROP_M <= last.distance_m {
                    // Cruzó la meta: la distancia y el tiempo ya son de la
                    // vuelta siguiente, así que el punto no se muestrea.
                    self.wrapped = last.distance_m >= 0.98 * last.length_m
                        && reading.distance_m <= 0.02 * reading.length_m;
                    if !self.wrapped {
                        self.candidate.clear();
                        self.started_at_line = false;
                    }
                    self.last = Some(reading);
                } else if self.wrapped || reading.distance_m < last.distance_m {
                    // Esperando al contador de vueltas, o retroceso menor: la
                    // foto no aporta muestra.
                    self.last = Some(reading);
                } else if reading.elapsed_s >= last.elapsed_s {
                    self.sample(reading);
                    self.last = Some(reading);
                }
            }
            Ordering::Greater => {
                let crossed = self.wrapped
                    || (last.distance_m >= 0.98 * last.length_m
                        && reading.distance_m <= 0.02 * reading.length_m);
                if step == 1 && crossed {
                    self.complete_lap(last.length_m);
                }
                self.last = Some(reading);
                self.start_lap(reading, step == 1 && crossed);
            }
        }
    }

    /// Añade una muestra de la vuelta en curso: muestrea cada
    /// `SAMPLE_INTERVAL_S` de tiempo de vuelta y sustituye la última muestra si
    /// la distancia no cambió.
    fn sample(&mut self, reading: Reading) {
        let point = Point {
            distance_m: reading.distance_m,
            elapsed_s: reading.elapsed_s,
        };
        let Some(last) = self.candidate.last_mut() else {
            self.candidate.push(point);
            return;
        };
        if reading.elapsed_s - last.elapsed_s < SAMPLE_INTERVAL_S {
            return;
        }
        if (reading.distance_m - last.distance_m).abs() < f64::EPSILON {
            *last = point;
        } else if self.candidate.len() < MAX_LAP_SAMPLES {
            self.candidate.push(point);
        } else {
            self.truncated = true;
        }
    }

    /// Cierra la vuelta candidata: si es la más rápida vista hasta ahora, pasa a
    /// ser la referencia del delta.
    fn complete_lap(&mut self, length_m: f64) {
        let Some(last) = self.candidate.last() else {
            return;
        };
        let covers_lap = self.started_at_line
            && self
                .candidate
                .first()
                .is_some_and(|first| first.distance_m <= 0.02 * length_m)
            && last.distance_m >= 0.98 * length_m;
        if self.truncated || !covers_lap || self.candidate.len() < 2 || last.elapsed_s <= 0.0 {
            self.candidate.clear();
            return;
        }
        let duration_s = last.elapsed_s;
        let better = self
            .reference
            .as_ref()
            .is_none_or(|reference| duration_s < reference.duration_s);
        if better {
            let samples = std::mem::take(&mut self.candidate);
            self.reference = Some(Reference {
                duration_s,
                samples,
            });
        } else {
            self.candidate.clear();
        }
    }

    /// Delta = tiempo de esta vuelta en la distancia actual − tiempo de la
    /// referencia interpolado linealmente en esa distancia.
    fn delta(&self, reading: Reading) -> Option<f64> {
        let reference = self.reference.as_ref()?;
        let reference_elapsed = interpolate(&reference.samples, reading.distance_m)?;
        let delta = reading.elapsed_s - reference_elapsed;
        delta.is_finite().then_some(delta)
    }

    fn start_lap(&mut self, reading: Reading, crossed: bool) {
        self.started_at_line = crossed;
        self.candidate.clear();
        self.candidate.push(Point {
            distance_m: reading.distance_m,
            elapsed_s: reading.elapsed_s,
        });
        self.wrapped = false;
        self.truncated = false;
    }
}

/// Vista del coche del jugador; `None` si falta cualquier señal o hay valores
/// imposibles.
/// Deltas frente a la vuelta óptima (suma de los mejores sectores propios) y
/// a la mejor vuelta del líder de la clase (#1497). Sin traza de esas vueltas,
/// la de la mejor vuelta propia se escala en el tiempo por `r = referencia /
/// mejor`: `delta = transcurrido · (1 − r) + delta_mejor · r`. En meta coincide
/// exactamente con la vuelta menos la referencia. Un valor nativo gana.
pub(super) fn references(player: &mut Player, car: &Car, cars: &[Car]) {
    let finite = |q: &Quality<f64>| q.current().copied().filter(|v| v.is_finite());
    let positive = |q: &Quality<f64>| finite(q).filter(|v| *v > 0.0);
    let (Some(delta), Some(elapsed), Some(best)) = (
        finite(&player.delta_best_s),
        finite(&car.lap_elapsed_s).filter(|e| *e >= 0.0),
        positive(&car.best_lap_s),
    ) else {
        return;
    };
    if car.in_pits.current().copied() == Some(true) {
        return;
    }
    let scaled = |reference: f64| {
        let r = reference / best;
        Quality::Estimated(elapsed * (1.0 - r) + delta * r)
    };
    if player.delta_optimal_s.current().is_none() && !car.best_sectors_s.is_empty() {
        let optimal: Option<f64> = car.best_sectors_s.iter().map(positive).sum();
        if let Some(optimal) = optimal {
            player.delta_optimal_s = scaled(optimal);
        }
    }
    if player.delta_leader_s.current().is_none() {
        let class = car.class.as_ref().map(|c| c.id);
        let leader = cars
            .iter()
            .filter(|c| c.class.as_ref().map(|c| c.id) == class)
            .find(|c| c.class_position.current() == Some(&1))
            .and_then(|c| positive(&c.best_lap_s));
        if let Some(leader) = leader {
            player.delta_leader_s = scaled(leader);
        }
    }
}

fn reading(car: &Car, track_length: Quality<f64>) -> Option<Reading> {
    let length_m = *track_length.current()?;
    let lap = car.laps.current().copied()?;
    let distance_m = car.lap_distance_m.current().copied()?;
    let elapsed_s = car.lap_elapsed_s.current().copied()?;
    (length_m.is_finite()
        && length_m > 0.0
        && distance_m.is_finite()
        && elapsed_s.is_finite()
        && (0.0..=length_m).contains(&distance_m)
        && elapsed_s >= 0.0)
        .then_some(Reading {
            lap,
            distance_m,
            elapsed_s,
            length_m,
        })
}

/// Interpolación lineal por distancia; `None` fuera del tramo muestreado.
fn interpolate(samples: &[Point], distance_m: f64) -> Option<f64> {
    let first = samples.first()?;
    let last = samples.last()?;
    if samples.len() < 2 || distance_m < first.distance_m || distance_m > last.distance_m {
        return None;
    }
    let mut index = 0;
    while index + 1 < samples.len() && samples[index + 1].distance_m < distance_m {
        index += 1;
    }
    let left = samples[index];
    let right = *samples.get(index + 1)?;
    let span = right.distance_m - left.distance_m;
    if span <= 0.0 {
        return None;
    }
    let ratio = (distance_m - left.distance_m) / span;
    let interpolated = left.elapsed_s + ratio * (right.elapsed_s - left.elapsed_s);
    interpolated.is_finite().then_some(interpolated)
}

#[cfg(test)]
mod tests {
    #[test]
    fn optimal_and_leader_deltas_scale_the_best_lap_reference() {
        use vantare_domain::{CarId, Class, ClassId};
        let class = Some(Class {
            id: ClassId(1),
            name: "Hypercar".into(),
        });
        let me = Car {
            id: CarId(50),
            class: class.clone(),
            class_position: Quality::Estimated(3),
            best_lap_s: Quality::Reliable(208.0),
            best_sectors_s: vec![
                Quality::Reliable(69.0),
                Quality::Reliable(72.5),
                Quality::Estimated(66.0),
            ],
            lap_elapsed_s: Quality::Reliable(104.0),
            in_pits: Quality::Reliable(false),
            ..Car::default()
        };
        let leader = Car {
            id: CarId(6),
            class,
            class_position: Quality::Estimated(1),
            best_lap_s: Quality::Reliable(206.0),
            ..Car::default()
        };
        let mut player = Player {
            car: CarId(50),
            delta_best_s: Quality::Estimated(-0.2),
            ..Player::default()
        };
        let cars = vec![leader, me.clone()];
        references(&mut player, &me, &cars);
        let at = |reference: f64| 104.0 * (1.0 - reference / 208.0) - 0.2 * reference / 208.0;
        let optimal = player.delta_optimal_s.current().copied().unwrap();
        assert!((optimal - at(207.5)).abs() < 1e-9);
        let leader = player.delta_leader_s.current().copied().unwrap();
        assert!((leader - at(206.0)).abs() < 1e-9);
        // En meta: la vuelta menos la referencia, sin escalar.
        let mut finished = me.clone();
        finished.lap_elapsed_s = Quality::Reliable(207.7);
        let mut player = Player {
            car: CarId(50),
            delta_best_s: Quality::Estimated(-0.3),
            ..Player::default()
        };
        references(&mut player, &finished, &cars);
        assert!((player.delta_leader_s.current().unwrap() - (207.7 - 206.0)).abs() < 1e-9);
        // En boxes o sin delta propio no hay referencias.
        let mut pits = me.clone();
        pits.in_pits = Quality::Reliable(true);
        let mut player = Player {
            delta_best_s: Quality::Estimated(-0.2),
            ..Player::default()
        };
        references(&mut player, &pits, &cars);
        assert!(player.delta_optimal_s.current().is_none());
    }

    use vantare_domain::Quality;

    use super::*;

    #[test]
    fn a_lap_observed_only_from_the_middle_is_not_a_reference() {
        let mut tracker = Tracker::default();
        for car in [
            car(1, 50.0, 0.25, false),
            car(1, 100.0, 0.5, false),
            car(2, 0.0, 0.0, false),
        ] {
            step(&mut tracker, &car);
        }
        assert!(tracker.reference.is_none(), "una parcial no gana");
    }

    #[test]
    fn counter_changes_without_distance_coverage_do_not_win() {
        let mut tracker = Tracker::default();
        for car in [
            car(0, 100.0, 0.5, false),
            car(1, 0.0, 0.0, false),
            car(1, 50.0, 0.5, false),
            car(2, 0.0, 0.0, false),
        ] {
            step(&mut tracker, &car);
        }
        assert!(
            tracker.reference.is_none(),
            "contador sin cobertura no cierra vuelta"
        );
        for car in [
            car(2, 100.0, 1.0, false),
            car(3, 0.0, 0.0, false),
            car(3, 100.0, 1.0, false),
            car(4, 0.0, 0.0, false),
        ] {
            step(&mut tracker, &car);
        }
        assert!((tracker.reference.as_ref().expect("completa").duration_s - 1.0).abs() < 1e-9);
    }

    #[test]
    fn a_distance_reset_without_crossing_loses_the_open_lap() {
        let mut tracker = Tracker::default();
        for car in [
            car(0, 990.0, 99.0, false),
            car(1, 0.0, 0.0, false),
            car(1, 500.0, 50.0, false),
            car(1, 0.0, 0.0, false), // retrocede desde media vuelta, no cruza meta
            car(1, 1.0, 0.1, false),
            car(1, 990.0, 99.0, false),
            car(2, 0.0, 0.0, false),
        ] {
            tracker.derive(&mut Player::default(), &car, Quality::Reliable(1000.0));
        }
        assert!(
            tracker.reference.is_none(),
            "el reset no acredita una apertura"
        );
    }

    #[test]
    fn a_truncated_faster_lap_never_replaces_a_full_reference() {
        let mut tracker = Tracker::default();
        let length = Quality::Reliable(20_000.0);
        for car in [
            car(0, 20_000.0, 4000.0, false),
            car(1, 0.0, 0.0, false),
            car(1, 20_000.0, 4000.0, false),
            car(2, 0.0, 0.0, false),
        ] {
            tracker.derive(&mut Player::default(), &car, length);
        }
        assert!((tracker.reference.as_ref().expect("completa").duration_s - 4000.0).abs() < 1e-9);
        // 18 000 muestras llenan el límite durante la vuelta siguiente.
        for i in 1..=18_000 {
            let distance = f64::from(i);
            tracker.derive(
                &mut Player::default(),
                &car(2, distance, distance * 0.2, false),
                length,
            );
        }
        tracker.derive(
            &mut Player::default(),
            &car(2, 20_000.0, 3999.0, false),
            length,
        );
        tracker.derive(&mut Player::default(), &car(3, 0.0, 0.0, false), length);
        assert!((tracker.reference.as_ref().expect("conservada").duration_s - 4000.0).abs() < 1e-9);
    }

    fn car(lap: u32, distance_m: f64, elapsed_s: f64, in_pit: bool) -> Car {
        Car {
            laps: Quality::Reliable(lap),
            lap_distance_m: Quality::Reliable(distance_m),
            lap_elapsed_s: Quality::Reliable(elapsed_s),
            in_pits: Quality::Reliable(in_pit),
            ..Car::default()
        }
    }

    /// Cada foto estrena jugador, como el adaptador: el valor derivado de la
    /// foto anterior no viaja.
    fn step(tracker: &mut Tracker, car: &Car) -> Player {
        let mut player = Player::default();
        tracker.derive(&mut player, car, Quality::Reliable(100.0));
        player
    }

    /// Deja una referencia: vueltas 1 y 2, la 2 más rápida (0,5 s en 100 m).
    fn reach_reference(tracker: &mut Tracker) {
        for car in [
            car(0, 100.0, 0.5, false),
            car(1, 0.0, 0.0, false),
            car(1, 100.0, 0.5, false),
            car(2, 0.0, 0.0, false),
        ] {
            step(tracker, &car);
        }
    }

    fn player_with_delta(delta: Quality<f64>) -> Player {
        Player {
            delta_best_s: delta,
            ..Player::default()
        }
    }

    #[test]
    fn reference_lap_and_linear_interpolation() {
        let mut tracker = Tracker::default();
        step(&mut tracker, &car(0, 100.0, 0.5, false));
        for car in [car(1, 0.0, 0.0, false), car(1, 100.0, 0.5, false)] {
            let player = step(&mut tracker, &car);
            assert_eq!(
                player.delta_best_s,
                Quality::Unavailable,
                "sin vuelta completada no hay referencia"
            );
        }
        // La foto que cierra la vuelta 1 ya compara en el punto de salida.
        let player = step(&mut tracker, &car(2, 0.0, 0.0, false));
        assert_eq!(player.delta_best_s, Quality::Estimated(0.0));
        // A 50 m de la vuelta 2 el delta es 0,15 − 0,25 = −0,1 s.
        let player = step(&mut tracker, &car(2, 50.0, 0.15, false));
        let delta = player.delta_best_s.current().copied().unwrap();
        assert!((delta + 0.1).abs() < 1e-9, "delta = {delta}");
    }

    #[test]
    fn only_the_best_completed_lap_becomes_the_reference() {
        let mut tracker = Tracker::default();
        let mut player = Player::default();
        for car in [
            car(0, 100.0, 0.5, false),
            car(1, 0.0, 0.0, false),
            car(1, 100.0, 1.0, false),
            car(2, 0.0, 0.0, false),
            car(2, 100.0, 0.8, false),
            car(3, 0.0, 0.0, false), // cierra la 2 (0,8 s): referencia
            car(3, 100.0, 1.3, false),
            car(4, 0.0, 0.0, false), // cierra la 3 (1,3 s): peor, no cambia
            car(4, 50.0, 0.4, false),
        ] {
            player = step(&mut tracker, &car);
        }
        let delta = player.delta_best_s.current().copied().unwrap();
        assert!(
            (delta - 0.0).abs() < 1e-9,
            "comparado con la referencia de 0,8 s, delta = {delta}"
        );
    }

    #[test]
    fn native_delta_wins_but_a_stale_one_is_replaced() {
        let mut tracker = Tracker::default();
        reach_reference(&mut tracker);
        let mut native = player_with_delta(Quality::Reliable(-0.3));
        tracker.derive(
            &mut native,
            &car(2, 50.0, 0.15, false),
            Quality::Reliable(100.0),
        );
        assert_eq!(native.delta_best_s, Quality::Reliable(-0.3));

        let mut stale = player_with_delta(Quality::Stale(1.0));
        tracker.derive(
            &mut stale,
            &car(2, 50.0, 0.15, false),
            Quality::Reliable(100.0),
        );
        assert_eq!(stale.delta_best_s, Quality::Estimated(-0.1));
    }

    #[test]
    fn pit_stop_suspends_the_delta_without_losing_the_reference() {
        let mut tracker = Tracker::default();
        reach_reference(&mut tracker);
        let player = step(&mut tracker, &car(2, 50.0, 0.15, true));
        assert_eq!(
            player.delta_best_s,
            Quality::Unavailable,
            "en boxes no hay delta"
        );
        let player = step(&mut tracker, &car(2, 60.0, 0.2, false));
        let delta = player.delta_best_s.current().copied().unwrap();
        assert!((delta + 0.1).abs() < 1e-9, "la referencia sigue: {delta}");
    }

    #[test]
    fn lap_regression_clears_the_reference() {
        let mut tracker = Tracker::default();
        reach_reference(&mut tracker);
        let player = step(&mut tracker, &car(1, 50.0, 0.2, false));
        assert_eq!(player.delta_best_s, Quality::Unavailable);
        assert!(tracker.reference.is_none());
    }

    #[test]
    fn distance_wrap_before_the_lap_counter_does_not_break_the_reference() {
        let mut tracker = Tracker::default();
        let mut player = Player::default();
        for car in [
            car(0, 500.0, 0.5, false),
            car(1, 0.0, 0.0, false),
            car(1, 500.0, 0.5, false),
            car(1, 5.0, 0.05, false), // cruza meta; el contador llega después
            car(1, 50.0, 0.15, false), // aún sin contador: no se muestrea
            car(2, 100.0, 0.2, false), // cierra la vuelta 1 y abre la 2
            car(2, 250.0, 0.3, false),
        ] {
            player = Player::default();
            tracker.derive(&mut player, &car, Quality::Reliable(500.0));
        }
        let delta = player.delta_best_s.current().copied().unwrap();
        assert!((delta - 0.05).abs() < 1e-9, "delta = {delta}");
        assert_eq!(tracker.reference.as_ref().unwrap().samples.len(), 2);
    }

    #[test]
    fn missing_signals_suspend_the_delta() {
        let mut tracker = Tracker::default();
        reach_reference(&mut tracker);
        let mut bare = car(2, 50.0, 0.15, false);
        bare.lap_elapsed_s = Quality::Unavailable;
        let player = step(&mut tracker, &bare);
        assert_eq!(player.delta_best_s, Quality::Unavailable);
        assert!(tracker.reference.is_some());
    }
}
