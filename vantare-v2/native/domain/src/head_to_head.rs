//! H2H Eficiencia: vecinos de la clasificación general, sin reglas de simulador.
//! Falta el gap relativo firmado por `CarId` (segundos + `Quality`); no se sustituye
//! por `gap_leader` ni `gap_ahead`. Team y `sectorComparisons` tampoco los publica el
//! contrato productivo V2 y Eficiencia no los dibuja.

use crate::format::{Language, PLACEHOLDER, Preferences};
use crate::{Car, Snapshot};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Target {
    #[default]
    Ahead,
    Behind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub place: String,
    pub number: String,
    pub name: String,
    pub class_name: String,
    pub label: String,
    pub is_player: bool,
    pub selected: bool,
    /// Vacío cuando falta la señal, como `HeadToHeadFunctional.tsx`.
    pub gap: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub header: String,
    pub no_rival: String,
    /// Vacío si falta el jugador o el rival seleccionado; nunca fabrica filas.
    pub rows: Vec<Row>,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences, target: Target) -> ViewModel {
    let direction = match (prefs.language, target) {
        (Language::Es, Target::Ahead) => "DELANTE",
        (Language::Es, Target::Behind) => "DETRÁS",
        (Language::En, Target::Ahead) => "AHEAD",
        (Language::En, Target::Behind) => "BEHIND",
    };
    let mut vm = ViewModel {
        header: format!("H2H · {direction}"),
        no_rival: match prefs.language {
            Language::Es => "SIN RIVAL",
            Language::En => "NO RIVAL",
        }
        .into(),
        rows: Vec::new(),
    };
    let Some(player) = snapshot.state.player else {
        return vm;
    };
    // Si falta una posición no sabemos dónde está ese coche: no afirmar que
    // otro es el vecino inmediato saltándolo en la clasificación.
    let Some(mut cars) = snapshot
        .state
        .cars
        .iter()
        .map(|car| {
            car.position
                .current()
                .copied()
                .filter(|p| *p > 0)
                .map(|position| (position, car))
        })
        .collect::<Option<Vec<_>>>()
    else {
        return vm;
    };
    cars.sort_by_key(|(position, _)| *position);
    // Posiciones duplicadas tampoco determinan una vecindad inequívoca.
    if cars.windows(2).any(|pair| pair[0].0 == pair[1].0) {
        return vm;
    }
    let Some(index) = cars.iter().position(|(_, car)| car.id == player.car) else {
        return vm;
    };
    let ahead = index.checked_sub(1).and_then(|i| cars.get(i));
    let behind = cars.get(index + 1);
    if match target {
        Target::Ahead => ahead.is_none(),
        Target::Behind => behind.is_none(),
    } {
        return vm;
    }
    if let Some((position, car)) = ahead {
        vm.rows
            .push(row(car, *position, false, target == Target::Ahead, prefs));
    }
    vm.rows
        .push(row(cars[index].1, cars[index].0, true, false, prefs));
    if let Some((position, car)) = behind {
        vm.rows
            .push(row(car, *position, false, target == Target::Behind, prefs));
    }
    vm
}

fn row(car: &Car, position: u32, is_player: bool, selected: bool, prefs: Preferences) -> Row {
    let present = |value: &str| {
        if value.is_empty() {
            PLACEHOLDER.into()
        } else {
            value.to_owned()
        }
    };
    Row {
        place: position.to_string(),
        number: present(&car.number),
        name: present(&car.driver.name),
        class_name: car
            .class
            .as_ref()
            .map_or_else(|| PLACEHOLDER.into(), |c| present(&c.name)),
        label: match (is_player, prefs.language) {
            (true, Language::Es) => "TÚ",
            (true, Language::En) => "YOU",
            (false, _) => "RIVAL",
        }
        .into(),
        is_player,
        selected,
        gap: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CarId, Gap, Player, Quality, State};
    use Quality::{Estimated, Reliable, Stale, Unavailable};

    fn scene(player: u32) -> Snapshot {
        Snapshot {
            state: State {
                // Orden de llegada distinto del orden de clasificación.
                cars: [3, 1, 2]
                    .map(|id| Car {
                        id: CarId(id),
                        position: Reliable(id),
                        gap_leader: Reliable(Gap::Time { seconds: 1.234 }),
                        gap_ahead: Reliable(Gap::Time { seconds: 0.8 }),
                        ..Car::default()
                    })
                    .into(),
                player: Some(Player {
                    car: CarId(player),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn immediate_neighbors_and_edges_match_the_product() {
        for (player, target, places, selected) in [
            (2, Target::Ahead, vec!["1", "2", "3"], Some(0)),
            (2, Target::Behind, vec!["1", "2", "3"], Some(2)),
            (1, Target::Ahead, vec![], None),
            (1, Target::Behind, vec!["1", "2"], Some(1)),
            (3, Target::Ahead, vec!["2", "3"], Some(0)),
            (3, Target::Behind, vec![], None),
            (99, Target::Ahead, vec![], None),
        ] {
            let vm = project(&scene(player), Preferences::default(), target);
            assert_eq!(
                vm.rows.iter().map(|r| r.place.as_str()).collect::<Vec<_>>(),
                places
            );
            assert_eq!(vm.rows.iter().position(|r| r.selected), selected);
            assert!(
                vm.rows.iter().all(|r| r.gap.is_empty()),
                "no sustituir el gap relativo"
            );
            if !vm.rows.is_empty() {
                assert_eq!(vm.rows.iter().filter(|r| r.is_player).count(), 1);
            }
        }
    }

    #[test]
    fn unavailable_stale_invalid_and_ambiguous_positions_do_not_invent_neighbors() {
        for (quality, ready) in [
            (Reliable(1), true),
            (Estimated(1), true),
            (Stale(1), false),
            (Unavailable, false),
            (Reliable(0), false),
            (Reliable(2), false),
        ] {
            let mut snapshot = scene(2);
            snapshot.state.cars[1].position = quality;
            assert_eq!(
                !project(&snapshot, Preferences::default(), Target::Ahead)
                    .rows
                    .is_empty(),
                ready
            );
        }
        assert!(
            project(&Snapshot::default(), Preferences::default(), Target::Ahead)
                .rows
                .is_empty()
        );
        let mut snapshot = scene(2);
        snapshot.state.player = None;
        assert!(
            project(&snapshot, Preferences::default(), Target::Ahead)
                .rows
                .is_empty()
        );
    }

    #[test]
    fn labels_and_missing_identity_use_the_shared_placeholder() {
        for (language, target, header, you, missing) in [
            (
                Language::Es,
                Target::Ahead,
                "H2H · DELANTE",
                "TÚ",
                "SIN RIVAL",
            ),
            (
                Language::En,
                Target::Behind,
                "H2H · BEHIND",
                "YOU",
                "NO RIVAL",
            ),
        ] {
            let vm = project(
                &scene(2),
                Preferences {
                    language,
                    ..Preferences::default()
                },
                target,
            );
            assert_eq!(
                (vm.header.as_str(), vm.no_rival.as_str()),
                (header, missing)
            );
            assert_eq!(vm.rows[1].label, you);
            for row in vm.rows {
                assert_eq!(
                    (
                        row.name.as_str(),
                        row.number.as_str(),
                        row.class_name.as_str()
                    ),
                    (PLACEHOLDER, PLACEHOLDER, PLACEHOLDER)
                );
            }
        }
    }

    #[test]
    fn driver_number_and_class_are_preserved_without_a_same_class_filter() {
        let mut snapshot = scene(2);
        let rival = &mut snapshot.state.cars[1];
        rival.number = "07".into();
        rival.driver.name = "André Lotterer".into();
        rival.class = Some(crate::Class {
            name: "hypercar".into(),
            ..crate::Class::default()
        });
        let vm = project(&snapshot, Preferences::default(), Target::Ahead);
        assert_eq!(
            (
                vm.rows[0].number.as_str(),
                vm.rows[0].name.as_str(),
                vm.rows[0].class_name.as_str()
            ),
            ("07", "André Lotterer", "hypercar")
        );
        assert!(vm.rows[0].selected);
    }
}
