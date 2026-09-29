//! Derivaciones por foto que necesitan Standings: posición de clase, gaps
//! generales y de clase, y vueltas restantes. Un dato nativo actual siempre
//! gana; uno obsoleto o ausente se sustituye por el derivado, marcado
//! `Estimated`.
//!
//! Los gaps de solo tiempo: con un `Gap::Laps` de por medio no hay resta que valga.

use std::collections::HashSet;

use vantare_domain::{Car, Gap, Quality, Session, State};

pub(super) fn derive(state: &mut State) {
    let State { session, cars, .. } = state;
    class_positions(cars);
    gaps(cars);
    class_gaps(cars);
    laps_remaining(session, cars);
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
            // Solo si no hay ningún gap actual: uno en vueltas no se sustituye por
            // segundos derivados (lo detectó el oráculo Go en P9–P12 del corpus).
            if let (None, Some(ahead_s)) = (leader_s, seconds(car.gap_ahead))
                && car.gap_leader.current().is_none()
            {
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

/// Gaps de clase: la misma resta que `gaps` pero con la clase como vecindad,
/// sobre los gaps generales (un dato nativo de clase actual siempre gana). El
/// líder de la clase queda a 0 s. Solo relaciona rangos consecutivos.
fn class_gaps(cars: &mut [Car]) {
    let mut order: Vec<(u32, u32, usize)> = cars
        .iter()
        .enumerate()
        .filter_map(|(index, car)| {
            let class = car.class.as_ref()?.id.0;
            Some((class, *car.class_position.current()?, index))
        })
        .collect();
    order.sort_unstable();
    // Clase, rango, gap general y gap de clase al líder del último coche visto.
    let mut previous: Option<(u32, u32, Option<f64>, Option<f64>)> = None;
    // Gap general del líder de la clase en curso: la base de las restas.
    let mut baseline: Option<(u32, Option<f64>)> = None;
    for (class, rank, index) in order {
        let car = &mut cars[index];
        let overall = seconds(car.gap_leader);
        if rank == 1 {
            if car.gap_class_leader.current().is_none() {
                car.gap_class_leader = Quality::Estimated(Gap::Time { seconds: 0.0 });
            }
            baseline = Some((class, overall));
            previous = Some((class, rank, overall, Some(0.0)));
            continue;
        }
        let mut leader_s = seconds(car.gap_class_leader);
        if let Some((previous_class, previous_rank, previous_overall, Some(previous_leader_s))) =
            previous
            && previous_class == class
            && previous_rank.checked_add(1) == Some(rank)
        {
            let leader_overall = baseline
                .filter(|(baseline_class, _)| *baseline_class == class)
                .and_then(|(_, gap)| gap);
            if leader_s.is_none()
                && let Some(derived) = class_leader_gap(
                    overall,
                    leader_overall,
                    seconds(car.gap_class_ahead),
                    previous_leader_s,
                )
            {
                leader_s = Some(derived);
                car.gap_class_leader = Quality::Estimated(Gap::Time { seconds: derived });
            }
            if car.gap_class_ahead.current().is_none()
                && let Some(derived) =
                    class_ahead_gap(overall, previous_overall, leader_s, previous_leader_s)
            {
                car.gap_class_ahead = Quality::Estimated(Gap::Time { seconds: derived });
            }
        }
        previous = Some((class, rank, overall, leader_s));
    }
}

/// Gap de clase al líder: la resta de gaps generales contra el líder de la
/// clase, o el encadenado desde el coche de delante.
fn class_leader_gap(
    overall: Option<f64>,
    leader_overall: Option<f64>,
    ahead: Option<f64>,
    previous_leader: f64,
) -> Option<f64> {
    if let (Some(overall), Some(leader_overall)) = (overall, leader_overall)
        && overall >= leader_overall
    {
        return Some(overall - leader_overall);
    }
    Some(previous_leader + ahead?)
}

/// Gap de clase al de delante: la resta de gaps generales contra el coche
/// anterior de la clase, o el encadenado desde los dos gaps al líder.
fn class_ahead_gap(
    overall: Option<f64>,
    previous_overall: Option<f64>,
    leader: Option<f64>,
    previous_leader: f64,
) -> Option<f64> {
    if let (Some(overall), Some(previous_overall)) = (overall, previous_overall)
        && overall >= previous_overall
    {
        return Some(overall - previous_overall);
    }
    let leader = leader?;
    (leader >= previous_leader).then_some(leader - previous_leader)
}

/// Vueltas restantes = vueltas totales de la sesión − vueltas completadas por
/// el líder (posición 1). Solo si `laps_total` es actual y el líder declara sus
/// vueltas.
fn laps_remaining(session: &mut Session, cars: &[Car]) {
    if session.laps_remaining.current().is_some() {
        return;
    }
    let Some(total) = session.laps_total.current().copied() else {
        return;
    };
    let Some(leader_laps) = cars
        .iter()
        .find(|car| car.position.current().copied() == Some(1))
        .and_then(|car| car.laps.current().copied())
    else {
        return;
    };
    session.laps_remaining = Quality::Estimated(total.saturating_sub(leader_laps));
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
    fn a_native_gap_in_laps_is_never_replaced_by_derived_seconds() {
        let mut cars = vec![car(1, 1, 0), car(2, 2, 0)];
        let lapped = Quality::Reliable(Gap::Laps { count: 1 });
        cars[1].gap_leader = lapped;
        cars[1].gap_ahead = time(1.5);
        gaps(&mut cars);
        assert_eq!(cars[1].gap_leader, lapped);
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

    #[test]
    fn class_gaps_come_from_general_gaps_between_class_neighbours() {
        // Clase 10: 1º, 3º y 5º globales, a 0, 2 y 3,5 s del líder general.
        let mut cars = vec![car(1, 1, 10), car(2, 3, 10), car(3, 5, 10)];
        class_positions(&mut cars);
        cars[0].gap_leader = time(0.0);
        cars[1].gap_leader = time(2.0);
        cars[2].gap_leader = time(3.5);
        class_gaps(&mut cars);
        assert_eq!(
            cars[0].gap_class_leader,
            Quality::Estimated(Gap::Time { seconds: 0.0 })
        );
        assert_eq!(
            cars[1].gap_class_leader,
            Quality::Estimated(Gap::Time { seconds: 2.0 })
        );
        assert_eq!(
            cars[1].gap_class_ahead,
            Quality::Estimated(Gap::Time { seconds: 2.0 })
        );
        assert_eq!(
            cars[2].gap_class_leader,
            Quality::Estimated(Gap::Time { seconds: 3.5 })
        );
        assert_eq!(
            cars[2].gap_class_ahead,
            Quality::Estimated(Gap::Time { seconds: 1.5 })
        );
    }

    #[test]
    fn class_gaps_chain_and_native_values_win() {
        // Clase 10: 1º y 3º globales; clase 20: 2º y 4º.
        let mut cars = vec![car(1, 1, 10), car(2, 2, 20), car(3, 3, 10), car(4, 4, 20)];
        class_positions(&mut cars);
        cars[2].gap_class_ahead = time(1.5); // rank 2 de la clase 10, sin gaps generales
        cars[3].gap_class_leader = time(6.0); // clase 20: nativo actual, manda
        class_gaps(&mut cars);
        assert_eq!(
            cars[0].gap_class_leader,
            Quality::Estimated(Gap::Time { seconds: 0.0 })
        );
        assert_eq!(
            cars[2].gap_class_leader,
            Quality::Estimated(Gap::Time { seconds: 1.5 })
        );
        assert_eq!(
            cars[2].gap_class_ahead,
            time(1.5),
            "el nativo actual no se pisa"
        );
        assert_eq!(
            cars[3].gap_class_leader,
            time(6.0),
            "el nativo actual permanece"
        );
        assert_eq!(
            cars[3].gap_class_ahead,
            Quality::Estimated(Gap::Time { seconds: 6.0 }),
            "encadenado desde el líder de clase"
        );
        assert_eq!(
            cars[1].gap_class_ahead,
            Quality::Unavailable,
            "el líder de clase no tiene a nadie delante"
        );
    }

    #[test]
    fn class_gaps_skip_holes_laps_and_unordered_data() {
        let mut holed = vec![car(1, 1, 10), car(2, 2, 10), car(3, 3, 10)];
        class_positions(&mut holed);
        holed[1].class_position = Quality::Unavailable; // hueco de rango
        holed[0].gap_leader = time(0.0);
        holed[2].gap_leader = time(4.0);
        class_gaps(&mut holed);
        assert_eq!(
            holed[2].gap_class_leader,
            Quality::Unavailable,
            "falta la posición de clase 2"
        );

        let mut lapped = vec![car(1, 1, 10), car(2, 2, 10)];
        class_positions(&mut lapped);
        lapped[0].gap_leader = time(30.0);
        lapped[1].gap_leader = Quality::Reliable(Gap::Laps { count: 1 });
        class_gaps(&mut lapped);
        assert_eq!(
            lapped[1].gap_class_leader,
            Quality::Unavailable,
            "vuelta de por medio"
        );
        assert_eq!(lapped[1].gap_class_ahead, Quality::Unavailable);
    }

    #[test]
    fn laps_remaining_uses_the_leader_and_native_wins() {
        let mut state = State {
            session: Session {
                laps_total: Quality::Reliable(50),
                ..Session::default()
            },
            cars: vec![car(1, 1, 10), car(2, 2, 10)],
            ..State::default()
        };
        state.cars[0].laps = Quality::Reliable(10);
        state.cars[1].laps = Quality::Reliable(9);
        derive(&mut state);
        assert_eq!(state.session.laps_remaining, Quality::Estimated(40));

        state.session.laps_remaining = Quality::Reliable(39);
        derive(&mut state);
        assert_eq!(
            state.session.laps_remaining,
            Quality::Reliable(39),
            "un dato nativo actual gana"
        );

        state.session.laps_remaining = Quality::Stale(12);
        derive(&mut state);
        assert_eq!(
            state.session.laps_remaining,
            Quality::Estimated(40),
            "un nativo obsoleto se sustituye"
        );
    }

    #[test]
    fn laps_remaining_needs_total_leader_and_laps() {
        let mut state = State {
            cars: vec![car(1, 1, 10)],
            ..State::default()
        };
        state.cars[0].laps = Quality::Reliable(10);
        derive(&mut state);
        assert_eq!(state.session.laps_remaining, Quality::Unavailable);

        state.session.laps_total = Quality::Reliable(50);
        state.cars[0].laps = Quality::Stale(10);
        derive(&mut state);
        assert_eq!(
            state.session.laps_remaining,
            Quality::Unavailable,
            "sin vueltas del líder no hay resta"
        );

        state.cars[0].laps = Quality::Reliable(60);
        derive(&mut state);
        assert_eq!(
            state.session.laps_remaining,
            Quality::Estimated(0),
            "datos incoherentes se acotan a cero"
        );
    }
}
