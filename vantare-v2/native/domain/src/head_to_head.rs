//! H2H Eficiencia: vecinos de la clasificación general, sin reglas de simulador.
//! El gap viene de `relative_s`; nunca de `gap_leader` ni `gap_ahead`.
//! El duelo Vantare fuera de carrera compara mejores vueltas; no predice alcance.
//! Sectores y mejor vuelta solo usan tiempos fiables del contrato neutral.

use crate::format::{self, Language, PLACEHOLDER, Preferences};
use crate::{Car, Quality, Snapshot, SourceState, relative::relative_seconds};

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
    pub sectors: [String; 3],
    pub best_lap: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub header: String,
    pub no_rival: String,
    /// Vacío si falta el jugador o el rival seleccionado; nunca fabrica filas.
    pub rows: Vec<Row>,
    pub duel: Option<Duel>,
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
        duel: None,
    };
    if snapshot.state.source_state != SourceState::Live {
        vm.no_rival = match prefs.language {
            Language::Es => "ESPERANDO A LMU",
            Language::En => "WAITING FOR LMU",
        }
        .into();
        return vm;
    }
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
    vm.duel = duel(snapshot, &vm.rows, prefs, target);
    if vm.duel.as_ref().is_some_and(|d| d.best_laps) && target == Target::Ahead {
        vm.header = "H2H · POLE".into();
    }
    vm
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Duel {
    pub best_laps: bool,
    pub left: Row,
    pub right: Row,
    pub laps: [String; 2],
    pub sectors: [String; 3],
    pub gap: String,
    pub trend: String,
    pub catch: String,
    pub good: bool,
}
fn duel(snapshot: &Snapshot, rows: &[Row], prefs: Preferences, target: Target) -> Option<Duel> {
    let es = prefs.language == Language::Es;
    let player = rows.iter().find(|r| r.is_player)?;
    let rival = rows.iter().find(|r| r.selected)?;
    let player_car = snapshot.state.player_car()?;
    let mut rival_car = snapshot.state.cars.iter().find(|c| {
        c.position.current().map(u32::to_string).as_deref() == Some(rival.place.as_str())
    })?;
    let best = snapshot
        .state
        .session
        .kind
        .current()
        .is_some_and(crate::SessionKind::ranks_by_best_lap);
    let lap = |car: &Car| {
        reliable_time(Some(if best {
            &car.best_lap_s
        } else {
            &car.last_lap_s
        }))
    };
    let pole_row;
    let rival = if best && target == Target::Ahead {
        let class = player_car.class.as_ref()?;
        rival_car = snapshot
            .state
            .cars
            .iter()
            .filter(|car| {
                car.id != player_car.id
                    && car.class.as_ref().is_some_and(|other| other.id == class.id)
            })
            .filter_map(|car| lap(car).map(|time| (car, time)))
            .min_by(|(_, a), (_, b)| a.total_cmp(b))
            .map(|(car, _)| car)?;
        if lap(rival_car)? > lap(player_car)? {
            return None;
        }
        pole_row = row(
            rival_car,
            *rival_car.position.current()?,
            false,
            true,
            prefs,
        );
        &pole_row
    } else {
        rival
    };
    let player_left = player.place.parse::<u32>().ok()? < rival.place.parse::<u32>().ok()?;
    let (left, right, left_car, right_car) = if player_left {
        (player, rival, player_car, rival_car)
    } else {
        (rival, player, rival_car, player_car)
    };
    let advantage = lap(rival_car).zip(lap(player_car)).map(|(a, b)| a - b);
    let (trend, catch) = race_pace(
        advantage.filter(|_| !best),
        player_left,
        crate::relative::relative_seconds(rival_car),
        es,
    );
    let sector_delta = sector_deltas(player_car, rival_car, best);
    let trend = if best {
        losing_sectors(&sector_delta, es)
    } else {
        trend
    };
    Some(Duel {
        best_laps: best,
        left: left.clone(),
        right: right.clone(),
        gap: if best {
            lap(player_car)
                .zip(lap(rival_car))
                .map_or_else(|| PLACEHOLDER.into(), |(a, b)| format!("{:+.3}", a - b))
        } else {
            rival.gap.clone()
        },
        laps: [
            format::lap_time(lap(left_car)),
            format::lap_time(lap(right_car)),
        ],
        sectors: sector_delta.map(|delta| {
            delta.map_or_else(
                || PLACEHOLDER.into(),
                |v| {
                    if best {
                        format!("{v:+.3}")
                    } else {
                        format!("{v:+.2}")
                    }
                },
            )
        }),
        trend,
        catch,
        good: advantage.is_some_and(|v| v > 0.0),
    })
}

fn sector_deltas(player_car: &Car, rival_car: &Car, best: bool) -> [Option<f64>; 3] {
    std::array::from_fn(|i| {
        reliable_time(if best {
            player_car.best_sectors_s.get(i)
        } else {
            player_car.last_sectors_s.get(i)
        })
        .zip(reliable_time(if best {
            rival_car.best_sectors_s.get(i)
        } else {
            rival_car.last_sectors_s.get(i)
        }))
        .map(|(a, b)| a - b)
    })
}

fn losing_sectors(sector_delta: &[Option<f64>; 3], es: bool) -> String {
    let losing: Vec<_> = sector_delta
        .iter()
        .enumerate()
        .filter(|(_, delta)| delta.is_some_and(|v| v > 0.0))
        .map(|(i, _)| format!("S{}", i + 1))
        .collect();
    if losing.is_empty() {
        String::new()
    } else {
        format!(
            "{} {}",
            if es { "pierdes en" } else { "losing in" },
            losing.join(if es { " y " } else { " and " })
        )
    }
}

fn race_pace(
    advantage: Option<f64>,
    player_left: bool,
    gap: Option<f64>,
    es: bool,
) -> (String, String) {
    advantage.map_or_else(
        || (String::new(), String::new()),
        |adv| {
            let closing = if player_left { -adv } else { adv };
            let trend = if player_left {
                if closing > 0.0 {
                    format!(
                        "{} {closing:.2} {}",
                        if es { "te recorta" } else { "closing on you" },
                        if es { "s/v" } else { "s/lap" }
                    )
                } else {
                    format!(
                        "{} {:.2} {}",
                        if es { "te alejas" } else { "pulling away" },
                        closing.abs(),
                        if es { "s/v" } else { "s/lap" }
                    )
                }
            } else if closing > 0.0 {
                format!(
                    "{} {closing:.2} {}",
                    if es { "recortas" } else { "you gain" },
                    if es { "s/v" } else { "s/lap" }
                )
            } else {
                format!(
                    "{} {:.2} {}",
                    if es { "se aleja" } else { "rival pulls away" },
                    closing.abs(),
                    if es { "s/v" } else { "s/lap" }
                )
            };
            let catch = gap
                .filter(|_| closing > 0.01)
                .map(|gap| (gap.abs() / closing).ceil())
                .filter(|n| n.is_finite() && *n <= 999.0)
                .map_or_else(String::new, |n| {
                    format!(
                        "{} ~{n:.0} {}",
                        match (player_left, es) {
                            (true, true) => "te alcanza en",
                            (true, false) => "catches you in",
                            (false, true) => "le alcanzas en",
                            (false, false) => "catch in",
                        },
                        if es { "v" } else { "laps" }
                    )
                });
            (trend, catch)
        },
    )
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
        sectors: std::array::from_fn(|index| {
            if is_player {
                return PLACEHOLDER.into();
            }
            reliable_time(car.last_sectors_s.get(index))
                .map_or_else(|| PLACEHOLDER.into(), |seconds| format!("{seconds:.3}"))
        }),
        best_lap: crate::format::lap_time(if is_player {
            None
        } else {
            reliable_time(Some(&car.best_lap_s))
        }),
        gap: if selected {
            gap_text(relative_seconds(car))
        } else {
            String::new()
        },
    }
}

fn reliable_time(quality: Option<&Quality<f64>>) -> Option<f64> {
    match quality {
        Some(Quality::Reliable(seconds)) if seconds.is_finite() && *seconds > 0.0 => Some(*seconds),
        _ => None,
    }
}

fn gap_text(seconds: Option<f64>) -> String {
    match seconds.filter(|s| s.is_finite()) {
        Some(0.0) => "0.000".into(),
        Some(s) => {
            // Empates binarios exactos a tres decimales: fracciones impares
            // de 1/16. JS redondea hacia arriba; Rust lo haría al par.
            let magnitude = if matches!((s.abs().fract() * 8.0).fract(), 0.5) {
                s.abs() + 0.0005
            } else {
                s.abs()
            };
            format!("{}{magnitude:.3}", if s > 0.0 { "+" } else { "-" })
        }
        None => String::new(),
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
                source_state: SourceState::Live,
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
    fn qualifying_duel_uses_the_measured_class_pole_instead_of_the_neighbour() {
        let mut snapshot = scene(3);
        snapshot.state.session.kind = Reliable(crate::SessionKind::Qualifying);
        for car in &mut snapshot.state.cars {
            car.class = Some(crate::Class {
                id: crate::ClassId(7),
                name: "Hypercar".into(),
            });
            car.best_lap_s = Reliable(match car.id.0 {
                1 => 204.502,
                2 => 204.689,
                _ => 204.911,
            });
            car.relative_s = Reliable(99.0);
        }
        let vm = project(&snapshot, Preferences::default(), Target::Ahead);
        let duel = vm.duel.expect("pole medida");
        assert_eq!(vm.header, "H2H · POLE");
        assert!(duel.best_laps);
        assert_eq!(duel.left.place, "1");
        assert_eq!(duel.right.place, "3");
        assert_eq!(duel.gap, "+0.409");
        assert_eq!(duel.laps, ["3:24.502", "3:24.911"]);
        assert!(
            duel.trend.is_empty() && duel.catch.is_empty(),
            "no se predice alcance con mejores vueltas de qualy"
        );
        for car in &mut snapshot.state.cars {
            if car.id != crate::CarId(3) {
                car.best_lap_s = Unavailable;
            }
        }
        assert!(
            project(&snapshot, Preferences::default(), Target::Ahead)
                .duel
                .is_none()
        );
    }

    #[test]
    fn duel_uses_observed_last_laps_and_never_extrapolates_missing_pace() {
        let mut snapshot = scene(2);
        snapshot.state.cars[1].last_lap_s = Reliable(208.19);
        snapshot.state.cars[2].last_lap_s = Reliable(207.904);
        snapshot.state.cars[1].relative_s = Reliable(-1.284);
        let vm = project(&snapshot, Preferences::default(), Target::Ahead);
        let duel = vm.duel.expect("pareja");
        assert_eq!(duel.laps, ["3:28.190", "3:27.904"]);
        assert_eq!(duel.catch, "le alcanzas en ~5 v");
        assert!(duel.good);
        let english = project(
            &snapshot,
            Preferences {
                language: Language::En,
                ..Preferences::default()
            },
            Target::Ahead,
        )
        .duel
        .expect("English duel");
        assert_eq!(english.catch, "catch in ~5 laps");
        assert_eq!(english.trend, "you gain 0.29 s/lap");
        snapshot.state.cars[2].last_lap_s = Unavailable;
        let duel = project(&snapshot, Preferences::default(), Target::Ahead)
            .duel
            .expect("pareja sin ritmo");
        assert!(duel.trend.is_empty());
        assert!(duel.catch.is_empty());
    }

    #[test]
    fn timing_uses_only_positive_finite_reliable_adapter_values() {
        let mut snapshot = scene(2);
        for quality in [
            Estimated(38.047),
            Stale(38.047),
            Unavailable,
            Reliable(0.0),
            Reliable(-1.0),
            Reliable(f64::NAN),
            Reliable(f64::INFINITY),
        ] {
            snapshot.state.cars[1].last_sectors_s = vec![quality];
            snapshot.state.cars[1].best_lap_s = quality;
            let vm = project(&snapshot, Preferences::default(), Target::Ahead);
            assert_eq!(vm.rows[0].sectors, [PLACEHOLDER; 3]);
            assert_eq!(vm.rows[0].best_lap, PLACEHOLDER);
        }
        snapshot.state.cars[1].last_sectors_s = vec![Reliable(38.047), Reliable(42.735)];
        snapshot.state.cars[1].best_lap_s = Reliable(116.092);
        let vm = project(&snapshot, Preferences::default(), Target::Ahead);
        assert_eq!(vm.rows[0].sectors, ["38.047", "42.735", PLACEHOLDER]);
        assert_eq!(vm.rows[0].best_lap, "1:56.092");
    }

    #[test]
    fn selected_classification_rival_uses_track_gap() {
        let mut snapshot = scene(2);
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.cars[1].relative_s = Reliable(-4.5);
        let vm = project(&snapshot, Preferences::default(), Target::Ahead);
        assert_eq!(vm.rows[0].place, "1");
        assert_eq!(vm.rows[0].gap, "-4.500");
        assert!(vm.rows[1..].iter().all(|r| r.gap.is_empty()));
    }

    #[test]
    fn source_state_and_gap_quality_match_the_product() {
        for (state, ready) in [
            (SourceState::Waiting, false),
            (SourceState::Live, true),
            (SourceState::Stale, false),
            (SourceState::Lost, false),
        ] {
            let mut snapshot = scene(2);
            snapshot.state.source_state = state;
            assert_eq!(
                !project(&snapshot, Preferences::default(), Target::Ahead)
                    .rows
                    .is_empty(),
                ready
            );
        }
        for (quality, expected) in [
            (Reliable(0.0), "0.000"),
            (Estimated(1.0625), "+1.063"),
            (Stale(-1.0625), "-1.063"),
            (Reliable(-0.0), "0.000"),
            (Reliable(f64::NAN), ""),
            (Reliable(f64::INFINITY), ""),
            (Unavailable, ""),
        ] {
            let mut snapshot = scene(2);
            snapshot.state.cars[1].relative_s = quality;
            assert_eq!(
                project(&snapshot, Preferences::default(), Target::Ahead).rows[0].gap,
                expected
            );
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
