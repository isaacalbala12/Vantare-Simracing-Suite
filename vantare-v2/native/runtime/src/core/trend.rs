//! Respaldo de la tendencia del gap de cada rival al jugador (#1497).
//!
//! Esto debería darlo LMU; mientras no lo lea el adaptador, el núcleo compara
//! el gap con cada coche cada vez que el jugador cruza la meta: la diferencia
//! de su valor absoluto es la tendencia por vuelta (negativo = se acerca).
//! Solo cuando el rival sigue del mismo lado: al adelantar no hay tendencia.
//! Un valor nativo actual siempre gana.

use std::collections::HashMap;

use vantare_domain::{Car, CarId, Quality};

#[derive(Debug, Default)]
pub(super) struct Tracker {
    /// Vuelta del jugador en la última medida.
    lap: Option<u32>,
    /// Gap con signo a cada coche en la última meta.
    gaps: HashMap<CarId, f64>,
    /// Tendencia medida en la última meta.
    trends: HashMap<CarId, f64>,
}

impl Tracker {
    pub(super) fn reset(&mut self) {
        *self = Self::default();
    }

    pub(super) fn derive(&mut self, cars: &mut [Car], player: CarId) {
        let lap = cars
            .iter()
            .find(|c| c.id == player)
            .and_then(|c| c.laps.current().copied());
        if lap.is_some() && lap != self.lap {
            let crossed = self.lap.is_some();
            self.lap = lap;
            let mut gaps = HashMap::with_capacity(cars.len());
            let mut trends = HashMap::new();
            for car in cars.iter().filter(|c| c.id != player) {
                let Some(gap) = car.relative_s.current().copied().filter(|g| g.is_finite()) else {
                    continue;
                };
                if crossed
                    && let Some(old) = self.gaps.get(&car.id)
                    && old.signum() == gap.signum()
                {
                    trends.insert(car.id, gap.abs() - old.abs());
                }
                gaps.insert(car.id, gap);
            }
            self.gaps = gaps;
            self.trends = trends;
        }
        for car in cars.iter_mut() {
            if car.relative_trend_s_per_lap.current().is_none()
                && let Some(trend) = self.trends.get(&car.id)
            {
                car.relative_trend_s_per_lap = Quality::Estimated(*trend);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cars(lap: u32, gaps: &[(u32, f64)]) -> Vec<Car> {
        let mut cars = vec![Car {
            id: CarId(1),
            laps: Quality::Reliable(lap),
            ..Car::default()
        }];
        cars.extend(gaps.iter().map(|(id, gap)| Car {
            id: CarId(*id),
            relative_s: Quality::Reliable(*gap),
            ..Car::default()
        }));
        cars
    }

    #[test]
    fn trend_is_the_change_of_the_gap_per_lap_on_the_same_side() {
        let mut tracker = Tracker::default();
        tracker.derive(&mut cars(5, &[(2, 3.0), (3, -2.0)]), CarId(1));
        // Misma vuelta: aún sin tendencia.
        let mut same = cars(5, &[(2, 2.5), (3, -2.2)]);
        tracker.derive(&mut same, CarId(1));
        assert!(same[1].relative_trend_s_per_lap.current().is_none());
        // Meta: el de delante se acerca 0.6 s; el de detrás pasa delante.
        let mut next = cars(6, &[(2, 2.4), (3, 0.5)]);
        tracker.derive(&mut next, CarId(1));
        let trend = next[1].relative_trend_s_per_lap.current().copied().unwrap();
        assert!((trend + 0.6).abs() < 1e-9);
        assert!(
            next[2].relative_trend_s_per_lap.current().is_none(),
            "cambió de lado"
        );
        // Durante la vuelta se mantiene la última medida.
        let mut during = cars(6, &[(2, 2.0), (3, 0.4)]);
        tracker.derive(&mut during, CarId(1));
        assert_eq!(
            during[1].relative_trend_s_per_lap,
            Quality::Estimated(trend)
        );
    }
}
