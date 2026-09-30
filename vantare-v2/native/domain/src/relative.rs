//! Relative Eficiencia: vecinos en pista por gap firmado al jugador, nunca
//! por clasificación. Los huecos vacíos pertenecen solo a la presentación.

use crate::{
    Car, CarId, Quality, SessionKind, Snapshot, SourceState,
    format::{self, Language, PLACEHOLDER, Preferences},
};

pub const RANGE: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Ahead,
    Player,
    Behind,
}

#[allow(clippy::struct_excessive_bools)] // Calidad independiente por celda, no estados excluyentes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub id: CarId,
    pub side: Side,
    pub position: String,
    pub number: String,
    pub driver: String,
    pub class: String,
    pub gap: String,
    pub best_lap: String,
    pub last_lap: String,
    pub last_lap_stale: bool,
    pub position_stale: bool,
    pub best_lap_stale: bool,
    pub gap_stale: bool,
    /// Diferencia canónica de vueltas; no se deduce de vueltas completadas.
    pub lap_delta: Option<i32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub track: String,
    pub player_badge: String,
    pub session: String,
    pub remaining: String,
    pub air: String,
    pub track_temperature: String,
    pub wind: String,
    /// Huecos de presentación: delante lejos → cerca, jugador, detrás cerca → lejos.
    pub slots: Vec<Option<Row>>,
    pub status: Option<String>,
}

/// Ventana pura: delante lejos→cerca, jugador, detrás cerca→lejos. Un gap
/// ausente, no finito o cero no demuestra de qué lado está un rival.
pub fn track_window(cars: &[Car], player: CarId, range: usize) -> Vec<Option<&Car>> {
    track_window_configured(cars, player, range, range, false)
}

pub fn track_window_configured(
    cars: &[Car],
    player: CarId,
    ahead_count: usize,
    behind_count: usize,
    same_class: bool,
) -> Vec<Option<&Car>> {
    let ahead_count = ahead_count.min(8);
    let behind_count = behind_count.min(8);
    let mut slots = vec![None; ahead_count + behind_count + 1];
    let Some(anchor) = cars.iter().find(|car| car.id == player) else {
        return slots;
    };
    slots[ahead_count] = Some(anchor);
    for ahead in [true, false] {
        let mut neighbors: Vec<_> = cars
            .iter()
            .filter_map(|car| {
                if same_class
                    && car.class.as_ref().map(|c| c.id) != anchor.class.as_ref().map(|c| c.id)
                {
                    return None;
                }
                let gap = relative_seconds(car)?;
                (car.id != player && gap != 0.0 && (gap > 0.0) == ahead).then_some((car, gap.abs()))
            })
            .collect();
        neighbors.sort_by(|(a, da), (b, db)| da.total_cmp(db).then(a.id.0.cmp(&b.id.0)));
        for (index, (car, _)) in neighbors
            .into_iter()
            .take(if ahead { ahead_count } else { behind_count })
            .enumerate()
        {
            slots[if ahead {
                ahead_count - 1 - index
            } else {
                ahead_count + 1 + index
            }] = Some(car);
        }
    }
    slots
}

/// Los tres widgets consumen la misma señal; no restan gaps al líder.
pub(crate) fn relative_seconds(car: &Car) -> Option<f64> {
    displayed(&car.relative_s)
        .copied()
        .filter(|s| s.is_finite())
}

pub(crate) fn source_status(state: SourceState, prefs: Preferences) -> Option<String> {
    match (state, prefs.language) {
        (SourceState::Live, _) => None,
        (SourceState::Waiting, Language::Es) => Some("SIN DATOS"),
        (SourceState::Waiting, Language::En) => Some("NO DATA"),
        (SourceState::Stale, Language::Es) => Some("DATOS ANTIGUOS"),
        (SourceState::Stale, Language::En) => Some("DATA OUT OF DATE"),
        (SourceState::Lost, Language::Es) => Some("DESCONECTADO"),
        (SourceState::Lost, Language::En) => Some("DISCONNECTED"),
    }
    .map(str::to_owned)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Content {
    pub range_ahead: usize,
    pub range_behind: usize,
    pub same_class: bool,
    pub include_player: bool,
}
impl Default for Content {
    fn default() -> Self {
        Self {
            range_ahead: RANGE,
            range_behind: RANGE,
            same_class: false,
            include_player: true,
        }
    }
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_content(snapshot, prefs, Content::default())
}

pub fn project_content(snapshot: &Snapshot, prefs: Preferences, content: Content) -> ViewModel {
    let ahead = content.range_ahead.min(8);
    let behind = content.range_behind.min(8);
    let state = &snapshot.state;
    let session = &state.session;
    let player = state.player_car();
    let mut slots = if state.source_state == SourceState::Live {
        player.map_or_else(
            || vec![None; ahead + behind + 1],
            |car| {
                track_window_configured(&state.cars, car.id, ahead, behind, content.same_class)
                    .into_iter()
                    .enumerate()
                    .map(|(index, car)| {
                        car.map(|car| {
                            row(
                                car,
                                match index.cmp(&ahead) {
                                    std::cmp::Ordering::Less => Side::Ahead,
                                    std::cmp::Ordering::Equal => Side::Player,
                                    std::cmp::Ordering::Greater => Side::Behind,
                                },
                                session.kind.current() == Some(&SessionKind::Race),
                            )
                        })
                    })
                    .collect()
            },
        )
    } else {
        vec![None; ahead + behind + 1]
    };
    if !content.include_player {
        slots.remove(ahead);
    }
    let player_badge = player.map_or_else(String::new, |car| {
        let Some(position) = displayed(&car.position).filter(|p| **p > 0) else {
            return String::new();
        };
        let class = car
            .class
            .as_ref()
            .filter(|c| !c.name.is_empty())
            .map(|c| c.name.to_uppercase());
        class.map_or_else(
            || format!("P{position}"),
            |class| format!("P{position} · {class}"),
        )
    });
    ViewModel {
        track: displayed(&session.track_name).map_or_else(String::new, |v| v.to_uppercase()),
        player_badge,
        session: displayed(&session.kind)
            .map_or_else(String::new, |v| format::session_kind(v, prefs)),
        remaining: optional(format::clock(displayed(&session.remaining_s).copied())),
        air: temperature(
            displayed(&session.weather.air_temperature_k).copied(),
            prefs,
        ),
        track_temperature: temperature(
            displayed(&session.weather.track_temperature_k).copied(),
            prefs,
        ),
        wind: optional(format::speed(
            displayed(&session.weather.wind_speed_mps).copied(),
            prefs,
        )),
        slots,
        status: source_status(
            if player.is_none() && state.source_state == SourceState::Live {
                SourceState::Waiting
            } else {
                state.source_state
            },
            prefs,
        ),
    }
}

/// Footer slots reutilizan el vocabulario común; Relative no publica lapText.
pub fn footer_slots(
    snapshot: &Snapshot,
    prefs: Preferences,
    vm: &ViewModel,
    ids: &[String],
) -> Vec<crate::standings::InfoCell> {
    let mut cells = crate::standings::information(snapshot, prefs, ids, true, None);
    let player = vm
        .slots
        .iter()
        .flatten()
        .find(|row| row.side == Side::Player);
    for cell in &mut cells {
        if player.is_none() && ["position", "bestLap", "lastLap"].contains(&cell.id.as_str()) {
            cell.value = PLACEHOLDER.into();
            cell.stale = false;
            continue;
        }
        match cell.id.as_str() {
            "lap" => cell.value = PLACEHOLDER.into(),
            "position" => {
                if let Some(row) = player {
                    cell.value.clone_from(&row.position);
                    cell.stale = row.position_stale;
                }
            }
            "gap" => {
                if let Some(row) = player {
                    cell.value.clone_from(&row.gap);
                }
            }
            "bestLap" => {
                if let Some(row) = player {
                    cell.value.clone_from(&row.best_lap);
                    cell.stale = row.best_lap_stale;
                }
            }
            "lastLap" => {
                if let Some(row) = player {
                    cell.value.clone_from(&row.last_lap);
                    cell.stale = row.last_lap_stale;
                }
            }
            "time" => {
                cell.value = if vm.remaining.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.remaining.clone()
                }
            }
            "track" => {
                cell.value = if vm.track_temperature.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.track_temperature.clone()
                }
            }
            "ambient" => {
                cell.value = if vm.air.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.air.clone()
                }
            }
            "wind" => {
                cell.value = if vm.wind.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    vm.wind.clone()
                }
            }
            _ => {}
        }
    }
    cells
}

fn row(car: &Car, side: Side, race: bool) -> Row {
    Row {
        id: car.id,
        side,
        position: displayed(&car.position)
            .filter(|p| **p > 0)
            .map_or_else(|| PLACEHOLDER.into(), ToString::to_string),
        number: car.number.clone(),
        driver: car.driver.name.clone(),
        class: car
            .class
            .as_ref()
            .map_or_else(String::new, |c| c.name.clone()),
        gap: if side == Side::Player {
            PLACEHOLDER.into()
        } else {
            crate::multiclass_relative::gap_text(relative_seconds(car))
        },
        best_lap: format::lap_time(displayed(&car.best_lap_s).copied()),
        last_lap: format::lap_time(displayed(&car.last_lap_s).copied()),
        last_lap_stale: matches!(car.last_lap_s, Quality::Stale(_)),
        position_stale: matches!(car.position, Quality::Stale(_)),
        best_lap_stale: matches!(car.best_lap_s, Quality::Stale(_)),
        gap_stale: matches!(car.relative_s, Quality::Stale(_)),
        lap_delta: if race && side != Side::Player {
            car.relative_laps.current().copied()
        } else {
            None
        },
    }
}

// Relative productivo conserva los valores stale y atenúa sus celdas al 60 %.
pub(crate) fn displayed<T>(quality: &Quality<T>) -> Option<&T> {
    match quality {
        Quality::Reliable(value) | Quality::Estimated(value) | Quality::Stale(value) => Some(value),
        Quality::Unavailable => None,
    }
}

fn optional(value: String) -> String {
    if value == PLACEHOLDER {
        String::new()
    } else {
        value
    }
}

fn temperature(value: Option<f64>, prefs: Preferences) -> String {
    let unit = match prefs.units {
        format::Units::Metric => " °C",
        format::Units::Imperial => " °F",
    };
    optional(format::temperature(value, prefs)).replace(unit, "°")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Driver, Player, Quality, SessionKind};

    fn scene() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.player = Some(Player {
            car: CarId(7),
            ..Player::default()
        });
        snapshot.state.cars.push(Car {
            id: CarId(7),
            position: Quality::Reliable(2),
            driver: Driver {
                name: "Piloto".into(),
                ..Driver::default()
            },
            best_lap_s: Quality::Reliable(91.234),
            ..Car::default()
        });
        snapshot
    }

    #[test]
    fn configured_window_projects_asymmetric_ranges_class_and_player() {
        let mut snapshot = scene();
        snapshot.state.cars[0].class = Some(crate::Class {
            id: crate::ClassId(1),
            name: "GT3".into(),
        });
        for (id, gap, class) in [(8, 0.2, 2), (9, 0.5, 1), (10, -0.3, 1), (11, -0.8, 2)] {
            snapshot.state.cars.push(Car {
                id: CarId(id),
                relative_s: Quality::Reliable(gap),
                class: Some(crate::Class {
                    id: crate::ClassId(class),
                    name: class.to_string(),
                }),
                ..Car::default()
            });
        }
        let prefs = Preferences::default();
        for ahead in [0, 1, 8] {
            for behind in [0, 2, 8] {
                for same_class in [true, false] {
                    let content = Content {
                        range_ahead: ahead,
                        range_behind: behind,
                        same_class,
                        include_player: true,
                    };
                    let vm = project_content(&snapshot, prefs, content);
                    assert_eq!(vm.slots.len(), ahead + behind + 1);
                    assert_eq!(vm.slots[ahead].as_ref().expect("jugador").id, CarId(7));
                    if same_class {
                        assert!(
                            vm.slots
                                .iter()
                                .flatten()
                                .all(|row| ![CarId(8), CarId(11)].contains(&row.id))
                        );
                    }
                }
            }
        }
        let vm = project_content(
            &snapshot,
            prefs,
            Content {
                include_player: false,
                ..Content::default()
            },
        );
        assert_eq!(vm.slots.len(), 6);
        assert!(
            vm.slots
                .iter()
                .flatten()
                .all(|row| row.side != Side::Player)
        );
        snapshot.state.cars[0].last_lap_s = Quality::Stale(92.345);
        let vm = project(&snapshot, prefs);
        let cells = footer_slots(
            &snapshot,
            prefs,
            &vm,
            &["lastLap".into(), "lap".into(), "gap".into()],
        );
        assert_eq!(cells[0].value, "1:32.345");
        assert!(cells[0].stale);
        assert_eq!(cells[1].value, PLACEHOLDER);
        assert_eq!(cells[2].value, PLACEHOLDER);
        let without_player = project_content(
            &snapshot,
            prefs,
            Content {
                include_player: false,
                ..Content::default()
            },
        );
        let hidden = footer_slots(
            &snapshot,
            prefs,
            &without_player,
            &["position".into(), "lastLap".into()],
        );
        assert!(hidden.iter().all(|cell| cell.value == PLACEHOLDER));
    }

    #[test]
    fn track_neighbors_use_signed_relative_gaps_not_classification() {
        let mut snapshot = scene();
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot
            .state
            .cars
            .extend(
                [(8, 0.4), (9, 4.2), (10, 1.8), (11, -2.6), (12, -0.3)].map(|(id, gap)| Car {
                    id: CarId(id),
                    position: Quality::Reliable(100 - id),
                    relative_s: Quality::Reliable(gap),
                    relative_laps: Quality::Reliable(-1),
                    ..Car::default()
                }),
            );
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(
            vm.slots
                .iter()
                .flatten()
                .map(|r| r.id.0)
                .collect::<Vec<_>>(),
            vec![9, 10, 8, 7, 12, 11]
        );
        let ahead = vm.slots[2].as_ref().expect("vecino en pista");
        assert_eq!(ahead.gap, "+0.4");
        assert_eq!(ahead.lap_delta, Some(-1));
    }

    #[test]
    fn track_window_crops_ties_and_ignores_missing_invalid_and_zero_gaps() {
        let mut snapshot = scene();
        snapshot.state.cars.extend(
            [
                (9, Quality::Reliable(0.4)),
                (8, Quality::Estimated(0.4)),
                (10, Quality::Stale(-0.3)),
                (11, Quality::Reliable(f64::NAN)),
                (12, Quality::Reliable(f64::INFINITY)),
                (13, Quality::Unavailable),
                (14, Quality::Reliable(0.0)),
            ]
            .map(|(id, gap)| Car {
                id: CarId(id),
                relative_s: gap,
                ..Car::default()
            }),
        );
        let window = track_window(&snapshot.state.cars, CarId(7), 1);
        assert_eq!(
            window
                .iter()
                .flatten()
                .map(|car| car.id.0)
                .collect::<Vec<_>>(),
            vec![8, 7, 10]
        );
        assert_eq!(track_window(&snapshot.state.cars, CarId(7), 0).len(), 1);
        assert!(
            track_window(&snapshot.state.cars, CarId(99), 3)
                .iter()
                .all(Option::is_none)
        );
    }

    #[test]
    fn source_states_hide_rows_and_lap_badges_require_fresh_race_data() {
        let mut snapshot = scene();
        snapshot.state.cars.push(Car {
            id: CarId(8),
            relative_s: Quality::Reliable(0.4),
            relative_laps: Quality::Reliable(1),
            ..Car::default()
        });
        for (state, status) in [
            (SourceState::Waiting, Some("SIN DATOS")),
            (SourceState::Live, None),
            (SourceState::Stale, Some("DATOS ANTIGUOS")),
            (SourceState::Lost, Some("DESCONECTADO")),
        ] {
            snapshot.state.source_state = state;
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(vm.status.as_deref(), status);
            assert_eq!(
                vm.slots.iter().flatten().count(),
                if state == SourceState::Live { 2 } else { 0 }
            );
        }
        snapshot.state.source_state = SourceState::Live;
        for (kind, laps, expected) in [
            (SessionKind::Race, Quality::Reliable(1), Some(1)),
            (SessionKind::Race, Quality::Estimated(1), Some(1)),
            (SessionKind::Race, Quality::Stale(1), None),
            (SessionKind::Practice, Quality::Reliable(1), None),
        ] {
            snapshot.state.session.kind = Quality::Reliable(kind);
            snapshot.state.cars[1].relative_laps = laps;
            assert_eq!(
                project(&snapshot, Preferences::default()).slots[2]
                    .as_ref()
                    .expect("rival")
                    .lap_delta,
                expected
            );
        }
    }

    #[test]
    fn player_is_centered_and_leaderboard_never_becomes_track_neighbours() {
        let mut snapshot = scene();
        snapshot.state.cars.push(Car {
            id: CarId(8),
            position: Quality::Reliable(1),
            gap_leader: Quality::Reliable(crate::Gap::Time { seconds: 0.4 }),
            ..Car::default()
        });
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(vm.slots.len(), 7);
        assert_eq!(vm.slots.iter().flatten().count(), 1);
        let row = vm.slots[RANGE].as_ref().expect("jugador");
        assert_eq!(row.id, CarId(7));
        assert_eq!(row.gap, PLACEHOLDER);
        assert_eq!(row.best_lap, "1:31.234");
        assert_eq!(row.lap_delta, None);
    }

    #[test]
    fn absent_player_never_creates_a_zero_row() {
        for remove_car in [false, true] {
            let mut snapshot = scene();
            if remove_car {
                snapshot.state.cars.clear();
            } else {
                snapshot.state.player = None;
            }
            let vm = project(&snapshot, Preferences::default());
            assert!(vm.slots.iter().all(Option::is_none));
            assert!(vm.player_badge.is_empty());
            assert_eq!(vm.status.as_deref(), Some("SIN DATOS"));
        }
    }

    #[test]
    fn qualities_and_invalid_numbers_are_not_invented_zeroes() {
        for (quality, expected) in [
            (Quality::Reliable(91.234), "1:31.234"),
            (Quality::Estimated(91.234), "1:31.234"),
            (Quality::Stale(91.234), "1:31.234"),
            (Quality::Unavailable, PLACEHOLDER),
            (Quality::Reliable(0.0), PLACEHOLDER),
            (Quality::Reliable(f64::NAN), PLACEHOLDER),
            (Quality::Reliable(f64::INFINITY), PLACEHOLDER),
        ] {
            let mut snapshot = scene();
            snapshot.state.cars[0].best_lap_s = quality;
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(
                vm.slots[RANGE].as_ref().expect("jugador").best_lap_stale,
                matches!(quality, Quality::Stale(_))
            );
            assert_eq!(
                vm.slots[RANGE].as_ref().expect("jugador").best_lap,
                expected
            );
        }
    }

    #[test]
    fn metadata_uses_shared_formats_and_omits_missing_fields() {
        let mut snapshot = scene();
        snapshot.state.session.track_name = Quality::Reliable("Sebring".into());
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot.state.session.remaining_s = Quality::Reliable(7198.0);
        snapshot.state.session.weather.air_temperature_k = Quality::Reliable(294.15);
        snapshot.state.session.weather.wind_speed_mps = Quality::Reliable(14.0 / 3.6);
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(vm.track, "SEBRING");
        assert_eq!(vm.session, "CARRERA");
        assert_eq!(vm.remaining, "01:59:58");
        assert_eq!(vm.air, "21°");
        assert_eq!(vm.wind, "14 km/h");
        assert!(vm.track_temperature.is_empty());
        let mut next = snapshot.clone();
        next.epoch += 1;
        next.sequence += 100;
        assert_eq!(vm, project(&next, Preferences::default()));
    }
}
