//! Derivaciones que necesitan Standings: posición de clase y gaps al líder y
//! al coche de delante. Un dato nativo actual siempre gana; uno obsoleto o
//! ausente se sustituye por el derivado, marcado `Estimated`.
//!
//! Los gaps de solo tiempo: con un `Gap::Laps` de por medio no hay resta que valga.

use std::collections::HashSet;

use vantare_domain::{Car, Gap, Quality};

pub(super) fn derive(cars: &mut [Car]) {
    class_positions(cars);
    gaps(cars);
}

/// Posición dentro de la clase = orden por posición global entre los coches de
/// su clase. Si a algún coche de la clase le falta la posición, el orden no es
/// fiable y esa clase no se deriva.
fn class_positions(cars: &mut [Car]) {
    let incomplete: HashSet<u32> = cars
        .iter()
        .filter(|car| car.position.current().is_none())
        .filter_map(|car| Some(car.class.as_ref()?.id.0))
        .collect();
    let mut ranked: Vec<(u32, u32, usize)> = cars
        .iter()
        .enumerate()
        .filter_map(|(index, car)| {
            Some((car.class.as_ref()?.id.0, *car.position.current()?, index))
        })
        .collect();
    ranked.sort_unstable();
    let (mut class, mut rank) = (None, 0);
    for (id, _, index) in ranked {
        if class != Some(id) {
            (class, rank) = (Some(id), 0);
        }
        rank += 1;
        let car = &mut cars[index];
        if !incomplete.contains(&id) && car.class_position.current().is_none() {
            car.class_position = Quality::Estimated(rank);
        }
    }
}

/// Recorre los coches por posición global. Solo relaciona posiciones
/// consecutivas: `gap_ahead(n) = gap_leader(n) - gap_leader(n-1)` y, al revés,
/// `gap_leader(n) = gap_leader(n-1) + gap_ahead(n)`.
fn gaps(cars: &mut [Car]) {
    let mut order: Vec<(u32, usize)> = cars
        .iter()
        .enumerate()
        .filter_map(|(index, car)| Some((*car.position.current()?, index)))
        .collect();
    order.sort_unstable();
    // Posición y gap al líder (s) del coche anterior en el orden.
    let mut previous: Option<(u32, Option<f64>)> = None;
    for (position, index) in order {
        let car = &mut cars[index];
        let mut leader_s = if position == 1 {
            Some(0.0)
        } else {
            seconds(car.gap_leader)
        };
        if let Some((previous_position, Some(previous_leader_s))) = previous
            && previous_position.checked_add(1) == Some(position)
        {
            if let (None, Some(ahead_s)) = (leader_s, seconds(car.gap_ahead)) {
                let derived = previous_leader_s + ahead_s;
                leader_s = Some(derived);
                car.gap_leader = Quality::Estimated(Gap::Time { seconds: derived });
            }
            if let Some(leader_s) = leader_s
                && car.gap_ahead.current().is_none()
                && leader_s >= previous_leader_s
            {
                car.gap_ahead = Quality::Estimated(Gap::Time {
                    seconds: leader_s - previous_leader_s,
                });
            }
        }
        previous = Some((position, leader_s));
    }
}

fn seconds(gap: Quality<Gap>) -> Option<f64> {
    match gap.current()? {
        Gap::Time { seconds } => Some(*seconds),
        Gap::Laps { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use vantare_domain::{Class, ClassId};

    use super::*;

    fn car(id: u32, position: u32, class: u32) -> Car {
        Car {
            id: vantare_domain::CarId(id),
            position: Quality::Reliable(position),
            class: Some(Class {
                id: ClassId(class),
                name: String::new(),
            }),
            ..Car::default()
        }
    }

    fn time(seconds: f64) -> Quality<Gap> {
        Quality::Reliable(Gap::Time { seconds })
    }

    #[test]
    fn class_position_ranks_within_class_and_native_wins() {
        // Global: 1 A, 2 B, 3 A, 4 B, 5 A.
        let mut cars = vec![
            car(1, 1, 10),
            car(2, 2, 20),
            car(3, 3, 10),
            car(4, 4, 20),
            car(5, 5, 10),
        ];
        cars[2].class_position = Quality::Reliable(9); // nativo fiable: se respeta
        cars[4].class_position = Quality::Stale(1); // nativo obsoleto: no gana
        class_positions(&mut cars);
        let got: Vec<_> = cars.iter().map(|c| c.class_position).collect();
        assert_eq!(
            got,
            [
                Quality::Estimated(1),
                Quality::Estimated(1),
                Quality::Reliable(9),
                Quality::Estimated(2),
                Quality::Estimated(3),
            ]
        );
    }

    #[test]
    fn class_without_full_positions_is_not_derived() {
        let mut cars = vec![car(1, 1, 10), car(2, 2, 10), car(3, 3, 20)];
        cars[1].position = Quality::Unavailable;
        class_positions(&mut cars);
        assert_eq!(cars[0].class_position, Quality::Unavailable);
        assert_eq!(cars[2].class_position, Quality::Estimated(1));
    }

    #[test]
    fn gaps_fill_each_other_from_consecutive_positions() {
        let mut cars = vec![car(1, 1, 0), car(2, 2, 0), car(3, 3, 0), car(4, 4, 0)];
        cars[1].gap_leader = time(2.0); // falta el intervalo de 2
        cars[2].gap_ahead = time(1.5); // falta el líder de 3
        cars[3].gap_leader = time(9.0); // 4 recibe el intervalo por encadenamiento
        gaps(&mut cars);
        assert_eq!(
            cars[1].gap_ahead,
            Quality::Estimated(Gap::Time { seconds: 2.0 })
        );
        assert_eq!(
            cars[2].gap_leader,
            Quality::Estimated(Gap::Time { seconds: 3.5 })
        );
        assert_eq!(
            cars[3].gap_ahead,
            Quality::Estimated(Gap::Time { seconds: 5.5 })
        );
        assert_eq!(
            cars[0].gap_ahead,
            Quality::Unavailable,
            "el líder no tiene delante"
        );
    }

    #[test]
    fn gaps_skip_laps_holes_stale_and_inconsistent_data() {
        let mut cars = vec![car(1, 1, 0), car(2, 2, 0), car(3, 4, 0), car(4, 5, 0)];
        cars[1].gap_leader = Quality::Reliable(Gap::Laps { count: 1 });
        cars[2].gap_leader = time(8.0);
        cars[3].gap_leader = time(7.0); // detrás pero más cerca del líder: incoherente
        gaps(&mut cars);
        assert_eq!(
            cars[1].gap_ahead,
            Quality::Unavailable,
            "vuelta de diferencia"
        );
        assert_eq!(
            cars[2].gap_ahead,
            Quality::Unavailable,
            "falta la posición 3"
        );
        assert_eq!(cars[3].gap_ahead, Quality::Unavailable, "resta negativa");
        let mut native = vec![car(1, 1, 0), car(2, 2, 0)];
        native[1].gap_leader = time(3.0);
        native[1].gap_ahead = Quality::Stale(Gap::Time { seconds: 99.0 });
        gaps(&mut native);
        assert_eq!(
            native[1].gap_ahead,
            Quality::Estimated(Gap::Time { seconds: 3.0 })
        );
    }
}
