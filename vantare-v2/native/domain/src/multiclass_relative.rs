//! Multiclass Relative Eficiencia: clasificación filtrada y centrada en el jugador.
//! Selección por clasificación; gaps de la señal relativa en pista.

use crate::format::{PLACEHOLDER, Preferences};
use crate::relative::{displayed, relative_seconds, source_status};
use crate::{Car, CarId, Snapshot, SourceState};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ClassMode {
    #[default]
    All,
    Same,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Content {
    pub row_count: usize,
    pub class_mode: ClassMode,
    pub show_class_divider: bool,
}

impl Default for Content {
    fn default() -> Self {
        Self {
            row_count: 5,
            class_mode: ClassMode::All,
            show_class_divider: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub id: CarId,
    pub place: String,
    pub class_label: String,
    pub number: String,
    pub name: String,
    pub gap: String,
    pub is_player: bool,
    pub divider: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ViewModel {
    pub rows: Vec<Row>,
    pub status: Option<String>,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences, content: Content) -> ViewModel {
    let state = &snapshot.state;
    let missing = || ViewModel {
        rows: Vec::new(),
        status: source_status(SourceState::Waiting, prefs),
    };
    if matches!(state.source_state, SourceState::Waiting | SourceState::Lost) {
        return ViewModel {
            rows: Vec::new(),
            status: source_status(state.source_state, prefs),
        };
    }
    let Some(player) = state.player_car() else {
        return missing();
    };
    let position = |car: &Car| {
        if state.source_state == SourceState::Stale {
            displayed(&car.position).copied()
        } else {
            car.position.current().copied()
        }
        .filter(|p| *p > 0)
    };
    let Some(player_position) = position(player) else {
        return missing();
    };
    let player_class = class_name(player).to_uppercase();
    let mut candidates: Vec<(&Car, u32)> = state
        .cars
        .iter()
        .filter_map(|car| {
            let position = position(car)?;
            let same = class_name(car).to_uppercase() == player_class;
            match content.class_mode {
                ClassMode::Same if !same => None,
                ClassMode::Other if same => None,
                _ => Some((car, position)),
            }
        })
        .collect();
    candidates.sort_by_key(|(_, position)| *position);
    let player_index = if content.class_mode == ClassMode::Other {
        candidates
            .iter()
            .filter(|(_, position)| *position < player_position)
            .count()
    } else {
        candidates
            .iter()
            .position(|(car, _)| car.id == player.id)
            .unwrap_or(0)
    };
    let count = content.row_count.clamp(3, 7);
    let start = player_index
        .saturating_sub((count - 1) / 2)
        .min(candidates.len().saturating_sub(count));
    let selected: Vec<_> = candidates.into_iter().skip(start).take(count).collect();
    let rows = selected
        .iter()
        .enumerate()
        .map(|(index, (car, position))| {
            let class = class_name(car);
            let is_player = car.id == player.id;
            Row {
                id: car.id,
                place: position.to_string(),
                class_label: class_label(class),
                number: if car.number.is_empty() {
                    PLACEHOLDER.into()
                } else {
                    car.number.clone()
                },
                name: if car.driver.name.is_empty() {
                    "?".into()
                } else {
                    car.driver.name.clone()
                },
                gap: gap_text(if is_player {
                    Some(0.0)
                } else {
                    relative_seconds(car)
                }),
                is_player,
                divider: content.show_class_divider
                    && index > 0
                    && class_name(selected[index - 1].0) != class,
            }
        })
        .collect::<Vec<_>>();
    if rows.is_empty() {
        return missing();
    }
    ViewModel {
        rows,
        status: source_status(state.source_state, prefs),
    }
}

fn class_name(car: &Car) -> &str {
    car.class
        .as_ref()
        .map_or("UNKNOWN", |class| class.name.as_str())
}

fn class_label(class: &str) -> String {
    if class.to_uppercase().contains("HYPER") {
        "HC".into()
    } else {
        class.chars().take(3).collect::<String>().to_uppercase()
    }
}

/// Formato concreto del renderer, sin unidad y con una decimal; `format::gap`
/// usa dos decimales, sufijo s y trata cero como ausente, por lo que no sirve aquí.
pub fn gap_text(seconds: Option<f64>) -> String {
    match seconds.filter(|s| s.is_finite()) {
        Some(0.0) => "0.0".into(),
        Some(s) => {
            // Los únicos empates binarios exactos a una decimal son .25/.75.
            // Rust redondea al par, JS hacia arriba. No usar s*10: 2.55*10
            // redondea a 25.5 y convertiría un falso empate en +2.6 (JS: +2.5).
            let magnitude = if matches!(s.abs().fract(), 0.25 | 0.75) {
                s.abs() + 0.05
            } else {
                s.abs()
            };
            format!("{}{magnitude:.1}", if s > 0.0 { "+" } else { "-" })
        }
        None => PLACEHOLDER.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::Language;
    use crate::{Capability, Class, ClassId, Gap, Player, Quality};

    fn scene(player: u32) -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.player = Some(Player {
            car: CarId(player),
            ..Player::default()
        });
        snapshot.state.cars = (1..=10)
            .rev()
            .map(|id| Car {
                id: CarId(id),
                position: Quality::Reliable(id),
                class: Some(Class {
                    id: ClassId(id % 2),
                    name: if id % 2 == 0 { "LMP2" } else { "hypercar" }.into(),
                }),
                gap_leader: Quality::Reliable(Gap::Time {
                    seconds: f64::from(id),
                }),
                ..Car::default()
            })
            .collect();
        snapshot
    }

    #[test]
    fn relative_gap_does_not_change_classification_selection() {
        let mut snapshot = scene(3);
        snapshot.state.source_state = crate::SourceState::Live;
        for car in &mut snapshot.state.cars {
            car.relative_s = Quality::Reliable(if car.id == CarId(1) { -2.3 } else { 4.5 });
        }
        let vm = project(&snapshot, Preferences::default(), Content::default());
        assert_eq!(
            vm.rows.iter().map(|r| r.id.0).collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5]
        );
        assert_eq!(vm.rows[0].gap, "-2.3");
        assert_eq!(vm.rows[1].gap, "+4.5");
        assert_eq!(vm.rows[2].gap, "0.0");
    }

    #[test]
    fn source_states_and_relative_quality_never_invent_gaps() {
        for (state, status, count) in [
            (SourceState::Waiting, Some("SIN DATOS"), 0),
            (SourceState::Live, None, 5),
            (SourceState::Stale, Some("DATOS ANTIGUOS"), 5),
            (SourceState::Lost, Some("DESCONECTADO"), 0),
        ] {
            let mut snapshot = scene(3);
            snapshot.state.source_state = state;
            let vm = project(&snapshot, Preferences::default(), Content::default());
            assert_eq!(vm.status.as_deref(), status);
            assert_eq!(vm.rows.len(), count);
        }
        for (quality, expected) in [
            (Quality::Reliable(0.0), "0.0"),
            (Quality::Estimated(4.5), "+4.5"),
            (Quality::Stale(-2.3), "-2.3"),
            (Quality::Reliable(f64::NAN), "—"),
            (Quality::Reliable(f64::INFINITY), "—"),
            (Quality::Unavailable, "—"),
        ] {
            let mut snapshot = scene(3);
            for car in &mut snapshot.state.cars {
                car.relative_s = quality;
            }
            assert_eq!(
                project(&snapshot, Preferences::default(), Content::default()).rows[0].gap,
                expected
            );
        }
    }

    #[test]
    fn centred_selection_and_class_filters_match_product() {
        for (player, mode, count, expected) in [
            (1, ClassMode::All, 5, vec![1, 2, 3, 4, 5]),
            (6, ClassMode::All, 5, vec![4, 5, 6, 7, 8]),
            (10, ClassMode::All, 5, vec![6, 7, 8, 9, 10]),
            (9, ClassMode::All, 6, vec![5, 6, 7, 8, 9, 10]),
            (5, ClassMode::Same, 5, vec![1, 3, 5, 7, 9]),
            (5, ClassMode::Other, 3, vec![4, 6, 8]),
            (5, ClassMode::All, 99, vec![2, 3, 4, 5, 6, 7, 8]),
            (5, ClassMode::All, 0, vec![4, 5, 6]),
        ] {
            let vm = project(
                &scene(player),
                Preferences::default(),
                Content {
                    row_count: count,
                    class_mode: mode,
                    ..Content::default()
                },
            );
            assert_eq!(
                vm.rows.iter().map(|row| row.id.0).collect::<Vec<_>>(),
                expected
            );
            assert_eq!(vm.status, None);
        }
    }

    #[test]
    fn absent_relative_signal_never_uses_leader_gaps() {
        let vm = project(&scene(3), Preferences::default(), Content::default());
        for row in &vm.rows {
            assert_eq!(row.gap, if row.is_player { "0.0" } else { PLACEHOLDER });
            assert_eq!(row.number, PLACEHOLDER);
            assert_eq!(row.name, "?");
        }
        assert!(!vm.rows[0].divider);
        assert!(vm.rows[1..].iter().all(|row| row.divider));
        let vm = project(
            &scene(3),
            Preferences::default(),
            Content {
                show_class_divider: false,
                ..Content::default()
            },
        );
        assert!(vm.rows.iter().all(|row| !row.divider));
    }

    #[test]
    fn no_player_or_no_current_position_is_missing() {
        for position in [
            Quality::Unavailable,
            Quality::Stale(3),
            Quality::Reliable(0),
        ] {
            let mut snapshot = scene(3);
            snapshot
                .state
                .cars
                .iter_mut()
                .find(|c| c.id == CarId(3))
                .expect("player")
                .position = position;
            let vm = project(&snapshot, Preferences::default(), Content::default());
            assert!(vm.rows.is_empty());
            assert_eq!(vm.status.as_deref(), Some("SIN DATOS"));
        }
        for snapshot in [Snapshot::default(), scene(99)] {
            assert!(
                project(&snapshot, Preferences::default(), Content::default())
                    .rows
                    .is_empty()
            );
        }
    }

    #[test]
    fn stale_positions_and_empty_other_class_are_labelled() {
        let mut snapshot = scene(3);
        snapshot.state.capabilities.positions = Capability::WithData;
        snapshot.state.source_state = SourceState::Stale;
        for car in &mut snapshot.state.cars {
            car.position = Quality::Stale(car.id.0);
            car.relative_s = Quality::Stale(-2.3);
        }
        let vm = project(
            &snapshot,
            Preferences {
                language: Language::En,
                ..Preferences::default()
            },
            Content::default(),
        );
        assert_eq!(vm.rows.len(), 5);
        assert_eq!(vm.rows[0].gap, "-2.3");
        assert_eq!(vm.status.as_deref(), Some("DATA OUT OF DATE"));
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.cars.retain(|car| car.id.0 % 2 == 1);
        assert!(
            project(
                &snapshot,
                Preferences::default(),
                Content {
                    class_mode: ClassMode::Other,
                    ..Content::default()
                }
            )
            .rows
            .is_empty()
        );
    }

    #[test]
    fn estimated_positions_are_current_and_missing_rivals_are_omitted() {
        let mut snapshot = scene(3);
        for car in &mut snapshot.state.cars {
            car.position = if car.id == CarId(2) {
                Quality::Stale(2)
            } else {
                Quality::Estimated(car.id.0)
            };
        }
        let vm = project(&snapshot, Preferences::default(), Content::default());
        assert_eq!(
            vm.rows.iter().map(|row| row.id.0).collect::<Vec<_>>(),
            vec![1, 3, 4, 5, 6]
        );
        assert_eq!(vm.status, None);
    }

    #[test]
    fn class_labels_and_gap_formats() {
        for (class, expected) in [
            ("hypercar", "HC"),
            ("LMP2", "LMP"),
            ("gte", "GTE"),
            ("UNKNOWN", "UNK"),
        ] {
            assert_eq!(class_label(class), expected);
        }
        for (seconds, expected) in [
            (None, "—"),
            (Some(f64::NAN), "—"),
            (Some(f64::INFINITY), "—"),
            (Some(0.0), "0.0"),
            (Some(-0.0), "0.0"),
            (Some(4.5), "+4.5"),
            (Some(-2.3), "-2.3"),
            (Some(1.25), "+1.3"),
            (Some(-1.25), "-1.3"),
            (Some(2.55), "+2.5"),
            (Some(0.04), "+0.0"),
            (Some(-0.04), "-0.0"),
        ] {
            assert_eq!(gap_text(seconds), expected);
        }
    }
}
