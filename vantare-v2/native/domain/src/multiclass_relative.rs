//! Multiclass Relative Eficiencia: clasificación filtrada y centrada en el jugador.
//! Ventana física compartida con Relative; jugador siempre en el hueco central.

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
            row_count: 7,
            class_mode: ClassMode::All,
            show_class_divider: false,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[allow(clippy::struct_excessive_bools)] // Hechos independientes de la fila: jugador, divisor y tráfico próximo.
pub struct Row {
    pub id: CarId,
    pub slot: usize,
    pub class_name: String,
    pub fast_traffic: bool,
    pub nearby: bool,
    pub trend: Option<(String, bool)>,
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
    pub player_class: String,
    pub fcy: bool,
}

/// Las únicas ventanas nuevas del contrato son ±3 y ±4.
pub fn row_count(count: usize) -> usize {
    if count >= 9 { 9 } else { 7 }
}

pub fn project(snapshot: &Snapshot, prefs: Preferences, content: Content) -> ViewModel {
    let state = &snapshot.state;
    let missing = || ViewModel {
        status: source_status(SourceState::Waiting, prefs),
        ..Default::default()
    };
    if matches!(state.source_state, SourceState::Waiting | SourceState::Lost) {
        return ViewModel {
            status: source_status(state.source_state, prefs),
            ..Default::default()
        };
    }
    let Some(player) = state.player_car() else {
        return missing();
    };
    let half = row_count(content.row_count) / 2;
    let slots = crate::relative::track_window(
        &state.cars,
        Some(player),
        half,
        half,
        content.class_mode == ClassMode::Same,
        content.class_mode == ClassMode::Other,
    );
    let paces = crate::relative::class_paces(&state.cars);
    let class_id = |car: &Car| car.class.as_ref().map(|c| c.id.0);
    let mine = paces.get(&class_id(player));
    let mut previous_class = None;
    let rows = slots
        .into_iter()
        .enumerate()
        .filter_map(|(slot, car)| {
            let car = car?;
            let class = class_name(car);
            let is_player = car.id == player.id;
            let gap = relative_seconds(car);
            let fast_traffic = !is_player
                && gap.is_some_and(|v| v < 0.0 && -v <= 6.0)
                && class_id(car) != class_id(player)
                && mine.is_some_and(|mine| {
                    paces
                        .get(&class_id(car))
                        .is_some_and(|theirs| theirs < mine)
                });
            let divider =
                content.show_class_divider && previous_class.is_some_and(|last| last != class);
            previous_class = Some(class);
            Some(project_row(
                car,
                slot,
                player.id,
                state.source_state,
                prefs,
                divider,
                fast_traffic,
            ))
        })
        .collect();
    ViewModel {
        rows,
        status: source_status(state.source_state, prefs),
        player_class: class_name(player).into(),
        fcy: state.flags.current().is_some_and(|flags| {
            flags
                .iter()
                .any(|f| f.kind == crate::FlagKind::Yellow && f.scope == crate::FlagScope::Session)
        }),
    }
}

fn project_row(
    car: &Car,
    slot: usize,
    player: CarId,
    source: SourceState,
    prefs: Preferences,
    divider: bool,
    fast_traffic: bool,
) -> Row {
    let class = class_name(car);
    let is_player = car.id == player;
    let gap = relative_seconds(car);
    let position = if source == SourceState::Stale {
        displayed(&car.class_position)
    } else {
        car.class_position.current()
    };
    Row {
        id: car.id,
        slot,
        class_name: class.to_owned(),
        fast_traffic,
        nearby: fast_traffic && gap.is_some_and(|v| -v <= 1.0),
        trend: car
            .relative_trend_s_per_lap
            .current()
            .copied()
            .filter(|v| v.is_finite() && *v != 0.0)
            .map(|value| {
                (
                    format!("{} {:.1}", if value < 0.0 { "▲" } else { "▼" }, value.abs()),
                    gap.is_some_and(|gap| (gap > 0.0) == (value < 0.0)),
                )
            }),
        place: position
            .filter(|p| **p > 0)
            .map_or_else(|| PLACEHOLDER.into(), |p| format!("P{p}")),
        class_label: class_label(class),
        number: if car.number.is_empty() {
            PLACEHOLDER.into()
        } else {
            car.number.clone()
        },
        name: if is_player {
            if prefs.language == crate::format::Language::Es {
                "Tú"
            } else {
                "You"
            }
            .into()
        } else {
            crate::standings::driver_name(&car.driver.name, "initial", 24)
        },
        gap: gap_text(if is_player {
            Some(0.0)
        } else {
            gap.map(|v| -v)
        }),
        is_player,
        divider,
    }
}

fn class_name(car: &Car) -> &str {
    car.class
        .as_ref()
        .map_or("UNKNOWN", |class| class.name.as_str())
}

fn class_label(class: &str) -> String {
    if class.to_uppercase().contains("HYPER") {
        "HY".into()
    } else if class.to_uppercase().contains("LMP2") {
        "LMP2".into()
    } else if class.to_uppercase().contains("GT3") {
        "GT3".into()
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
                class_position: Quality::Reliable(id.div_ceil(2)),
                relative_s: Quality::Reliable(f64::from(player) - f64::from(id)),
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
    fn physical_neighbors_are_independent_of_classification_and_keep_player_in_center() {
        let mut snapshot = scene(5);
        let before = project(&snapshot, Preferences::default(), Content::default());
        for car in &mut snapshot.state.cars {
            car.position = Quality::Reliable(100 - car.id.0);
        }
        let after = project(&snapshot, Preferences::default(), Content::default());
        assert_eq!(
            before.rows.iter().map(|r| r.id).collect::<Vec<_>>(),
            after.rows.iter().map(|r| r.id).collect::<Vec<_>>()
        );
        let player = after.rows.iter().find(|r| r.is_player).expect("jugador");
        assert_eq!(player.slot, 3);
        assert_eq!(player.gap, "0.0");
        assert_eq!(
            after.rows.iter().map(|r| r.id.0).collect::<Vec<_>>(),
            [2, 3, 4, 5, 6, 7, 8]
        );
    }

    #[test]
    fn every_class_filter_and_track_edge_keeps_the_player_slot() {
        for player in [1, 5, 10] {
            for mode in [ClassMode::All, ClassMode::Same, ClassMode::Other] {
                for count in [7, 9] {
                    let vm = project(
                        &scene(player),
                        Preferences::default(),
                        Content {
                            row_count: count,
                            class_mode: mode,
                            ..Default::default()
                        },
                    );
                    let own = vm
                        .rows
                        .iter()
                        .find(|r| r.is_player)
                        .expect("siempre jugador");
                    assert_eq!(own.slot, count / 2);
                    assert!(vm.rows.iter().all(|r| r.slot < count));
                    let own_class = &own.class_name;
                    for row in vm.rows.iter().filter(|r| !r.is_player) {
                        match mode {
                            ClassMode::Same => assert_eq!(&row.class_name, own_class),
                            ClassMode::Other => assert_ne!(&row.class_name, own_class),
                            ClassMode::All => {}
                        }
                        assert_eq!(row.gap.starts_with('-'), row.slot < count / 2);
                    }
                }
            }
        }
    }

    #[test]
    fn missing_zero_and_non_finite_relative_data_never_use_leader_gaps() {
        for quality in [
            Quality::Unavailable,
            Quality::Reliable(0.0),
            Quality::Reliable(f64::NAN),
            Quality::Reliable(f64::INFINITY),
        ] {
            let mut snapshot = scene(5);
            for car in &mut snapshot.state.cars {
                car.relative_s = quality;
            }
            let vm = project(&snapshot, Preferences::default(), Content::default());
            assert_eq!(vm.rows.len(), 1, "solo el ancla conocida");
            assert!(vm.rows[0].is_player);
            assert_eq!(vm.rows[0].slot, 3);
        }
    }

    #[test]
    fn source_states_and_stale_gaps_keep_their_quality_label() {
        for (state, label, present) in [
            (SourceState::Waiting, Some("SIN DATOS"), false),
            (SourceState::Live, None, true),
            (SourceState::Stale, Some("DATOS ANTIGUOS"), true),
            (SourceState::Lost, Some("DESCONECTADO"), false),
        ] {
            let mut snapshot = scene(5);
            snapshot.state.source_state = state;
            let vm = project(&snapshot, Preferences::default(), Content::default());
            assert_eq!(vm.status.as_deref(), label);
            assert_eq!(vm.rows.iter().any(|r| r.is_player), present);
        }
        let mut snapshot = scene(5);
        snapshot.state.source_state = SourceState::Stale;
        for car in &mut snapshot.state.cars {
            car.relative_s = Quality::Stale(f64::from(5) - f64::from(car.id.0));
        }
        let vm = project(
            &snapshot,
            Preferences {
                language: Language::En,
                ..Default::default()
            },
            Content::default(),
        );
        assert_eq!(vm.status.as_deref(), Some("DATA OUT OF DATE"));
        assert_eq!(
            vm.rows
                .iter()
                .find(|r| r.id == CarId(4))
                .expect("delante")
                .gap,
            "-1.0"
        );
    }

    #[test]
    fn missing_player_is_empty_and_missing_rank_is_a_placeholder() {
        assert!(
            project(&scene(99), Preferences::default(), Content::default())
                .rows
                .is_empty()
        );
        let mut snapshot = scene(5);
        snapshot
            .state
            .cars
            .iter_mut()
            .find(|c| c.id == CarId(5))
            .expect("jugador")
            .class_position = Quality::Unavailable;
        let vm = project(&snapshot, Preferences::default(), Content::default());
        assert_eq!(
            vm.rows.iter().find(|r| r.is_player).expect("jugador").place,
            PLACEHOLDER
        );
    }

    #[test]
    fn class_labels_and_gap_formats() {
        for (class, expected) in [
            ("hypercar", "HY"),
            ("LMP2", "LMP2"),
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
