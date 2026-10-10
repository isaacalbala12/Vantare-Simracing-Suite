//! Tira Eficiencia: clasificación, nombres abreviados y gaps a tres decimales.
//! La vuelta en curso es la siguiente a `Car::laps` (completadas), con su calidad.

use crate::format::{self, Language, PLACEHOLDER, Preferences};
use crate::{Capability, CarId, FlagKind, FlagScope, Gap, Quality, Snapshot, SourceState};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
    Disconnected,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Accent {
    Red,
    Blue,
    Amber,
    Neutral,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Row {
    pub id: CarId,
    pub place: Option<u32>,
    pub name: String,
    pub class: String,
    pub accent: Accent,
    pub number: String,
    pub gap: String,
    pub is_player: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub status: Status,
    pub session: String,
    pub lap: String,
    pub total_laps: Option<u32>,
    pub weather: String,
    pub flag: Option<FlagKind>,
    pub rows: Vec<Row>,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_rows(snapshot, prefs, 5)
}

/// Cantidad productiva de tarjetas, acotada entre tres y diez.
pub fn project_rows(snapshot: &Snapshot, prefs: Preferences, row_count: usize) -> ViewModel {
    let state = &snapshot.state;
    let available = !matches!(state.source_state, SourceState::Waiting | SourceState::Lost);
    let status = match (state.source_state, state.capabilities.positions) {
        (SourceState::Waiting | SourceState::Lost, _) => Status::Disconnected,
        (SourceState::Stale, _) | (_, Capability::WithData) => Status::Stale,
        (_, Capability::Fresh) if !state.cars.is_empty() => Status::Ready,
        _ => Status::Missing,
    };
    let mut cars: Vec<_> = state.cars.iter().collect();
    // Los puestos ausentes van al final, nunca pasan por líderes.
    cars.sort_by_key(|car| {
        car.position
            .current()
            .copied()
            .filter(|p| *p > 0)
            .unwrap_or(u32::MAX)
    });
    let rows = cars
        .into_iter()
        .filter(|_| status == Status::Ready)
        .take(row_count.clamp(3, 10))
        .map(|car| {
            let class = car.class.as_ref().map_or("", |class| class.name.as_str());
            let place = car.position.current().copied().filter(|p| *p > 0);
            Row {
                id: car.id,
                place,
                name: short_name(&car.driver.name).to_uppercase(),
                class: class.chars().take(3).collect::<String>().to_uppercase(),
                accent: class_accent(class),
                number: car.number.clone(),
                gap: gap_text(car.gap_leader.current().copied(), place == Some(1), prefs),
                is_player: state.player.is_some_and(|player| player.car == car.id),
            }
        })
        .collect();
    let weather = format::temperature(
        state
            .session
            .weather
            .track_temperature_k
            .current()
            .copied()
            .filter(|_| available),
        prefs,
    );
    // El diseño de la tira usa solo °, manteniendo la conversión de format.
    let weather = weather.replace(" °C", "°").replace(" °F", "°");
    ViewModel {
        status,
        session: state
            .session
            .kind
            .current()
            .filter(|_| available)
            .map_or_else(
                || PLACEHOLDER.into(),
                |kind| format::session_kind(kind, prefs),
            ),
        lap: state.player_car().filter(|_| available).map_or_else(
            || PLACEHOLDER.into(),
            |car| {
                current_lap(car.laps)
                    .current()
                    .map_or_else(|| PLACEHOLDER.into(), u32::to_string)
            },
        ),
        total_laps: state
            .session
            .laps_total
            .current()
            .copied()
            .filter(|laps| available && *laps > 0 && *laps < 2_147_483_647),
        weather,
        flag: if status == Status::Ready {
            state
                .flags
                .current()
                .and_then(|flags| flags.iter().find(|flag| flag.scope == FlagScope::Session))
                .map(|flag| flag.kind.clone())
        } else {
            None
        },
        rows,
    }
}

#[allow(clippy::float_cmp)] // Igualdad exacta del empate de Number.toFixed.
fn gap_text(gap: Option<Gap>, leader: bool, prefs: Preferences) -> String {
    if leader {
        return format::gap(gap, true, prefs);
    }
    match gap {
        Some(Gap::Time { seconds }) if seconds.is_finite() => {
            // Number.toFixed(3) redondea el empate exacto hacia arriba.
            let scaled = seconds.abs() * 1000.0;
            // A tres decimales, los empates binarios exactos son múltiplos
            // impares de 1/16. Multiplicar por 1000 fabricaría falsos empates
            // para valores como 0.0045 (JS muestra 0.004).
            let tie = seconds.abs().rem_euclid(0.125) == 0.0625;
            let value = if tie {
                (scaled.floor() + 1.0) / 1000.0
            } else {
                seconds.abs()
            };
            let sign = if seconds < 0.0 {
                "-"
            } else if seconds > 0.0 {
                "+"
            } else {
                ""
            };
            format!("{sign}{value:.3}")
        }
        Some(Gap::Laps { count }) if count > 0 => format::gap(gap, false, prefs),
        _ => PLACEHOLDER.into(),
    }
}

fn class_accent(value: &str) -> Accent {
    let value = value.trim().to_uppercase();
    if value.contains("HYPER") || matches!(value.as_str(), "HYP" | "DP") {
        Accent::Red
    } else if value.contains("LMP") || value == "P2" {
        Accent::Blue
    } else if value.contains("GTE") || value.contains("GT3") {
        Accent::Amber
    } else {
        Accent::Neutral
    }
}

fn short_name(name: &str) -> String {
    let mut cleaned = name.to_string();
    while let Some(start) = cleaned.find('(') {
        let Some(end) = cleaned[start..].find(')') else {
            break;
        };
        cleaned.replace_range(start..=start + end, " ");
    }
    let words: Vec<_> = cleaned.split_whitespace().collect();
    match words.as_slice() {
        [] => PLACEHOLDER.into(),
        [single] => (*single).into(),
        [first, rest @ ..] => format!(
            "{}. {}",
            first.chars().next().unwrap_or('—'),
            rest.join(" ")
        ),
    }
}

pub fn status_text(status: Status, language: Language) -> &'static str {
    match (status, language) {
        (Status::Ready, _) => "",
        (Status::Missing, Language::Es) => "SIN DATOS",
        (Status::Missing, Language::En) => "NO DATA",
        (Status::Stale, Language::Es) => "DATOS ANTIGUOS",
        (Status::Stale, Language::En) => "DATA OUT OF DATE",
        (Status::Disconnected, Language::Es) => "DESCONECTADO",
        (Status::Disconnected, Language::En) => "DISCONNECTED",
    }
}

fn current_lap(laps: Quality<u32>) -> Quality<u32> {
    match laps {
        Quality::Reliable(n) => n
            .checked_add(1)
            .map_or(Quality::Unavailable, Quality::Reliable),
        Quality::Estimated(n) => n
            .checked_add(1)
            .map_or(Quality::Unavailable, Quality::Estimated),
        Quality::Stale(n) => n
            .checked_add(1)
            .map_or(Quality::Unavailable, Quality::Stale),
        Quality::Unavailable => Quality::Unavailable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Car, Driver, Player, Quality, SessionKind};

    #[test]
    fn player_lap_is_the_next_completed_lap_and_never_defaults_to_one() {
        assert_eq!(current_lap(Quality::Reliable(0)), Quality::Reliable(1));
        assert_eq!(
            current_lap(Quality::Estimated(127)),
            Quality::Estimated(128)
        );
        assert_eq!(current_lap(Quality::Stale(127)), Quality::Stale(128));
        let mut data = Snapshot::default();
        data.state.source_state = crate::SourceState::Live;
        data.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        data.state.cars.push(Car {
            id: CarId(1),
            ..Car::default()
        });
        for (quality, expected) in [
            (Quality::Reliable(0), "1"),
            (Quality::Estimated(127), "128"),
            (Quality::Stale(127), "—"),
            (Quality::Unavailable, "—"),
            (Quality::Reliable(u32::MAX), "—"),
        ] {
            data.state.cars[0].laps = quality;
            assert_eq!(project(&data, Preferences::default()).lap, expected);
        }
    }

    #[test]
    fn formats_match_the_strip() {
        for (input, expected) in [
            (None, "—"),
            (Some(0.0), "0.000"),
            (Some(1.234), "+1.234"),
            (Some(-1.234), "-1.234"),
            (Some(0.0625), "+0.063"),
            (Some(0.0045), "+0.004"),
            (Some(0.0005), "+0.001"),
            (Some(f64::NAN), "—"),
            (Some(f64::INFINITY), "—"),
        ] {
            assert_eq!(
                gap_text(
                    input.map(|seconds| Gap::Time { seconds }),
                    false,
                    Preferences::default()
                ),
                expected
            );
        }
        assert_eq!(gap_text(None, true, Preferences::default()), "LÍDER");
        assert_eq!(
            gap_text(Some(Gap::Laps { count: 2 }), false, Preferences::default()),
            "+2 V"
        );
        for (name, expected) in [
            ("André Lotterer", "A. Lotterer"),
            (" Jean (PRO) van der Linde ", "J. van der Linde"),
            ("李 明", "李. 明"),
            ("Senna", "Senna"),
            ("", "—"),
        ] {
            assert_eq!(short_name(name), expected);
        }
        for (class, expected) in [
            (" hypercar ", Accent::Red),
            ("DP", Accent::Red),
            ("LMP2", Accent::Blue),
            ("P2", Accent::Blue),
            ("GTE", Accent::Amber),
            ("GT3", Accent::Amber),
            ("unknown", Accent::Neutral),
        ] {
            assert_eq!(class_accent(class), expected);
        }
    }

    #[test]
    fn regression_1549_single_word_drops_the_parenthetical_suffix() {
        assert_eq!(short_name("Speedy(PRO)"), "Speedy");
    }

    #[test]
    fn missing_and_stale_values_do_not_become_zero_or_leader() {
        for quality in [
            Quality::Unavailable,
            Quality::Stale(1),
            Quality::Reliable(0),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.state.source_state = crate::SourceState::Live;
            snapshot.state.capabilities.positions = Capability::Fresh;
            snapshot.state.cars.push(Car {
                id: CarId(1),
                position: quality,
                ..Car::default()
            });
            let vm = project(&snapshot, Preferences::default());
            assert_eq!(vm.rows[0].place, None);
            assert_eq!(vm.rows[0].gap, "—");
            assert_eq!(vm.weather, "—");
            assert_eq!(vm.lap, "—");
        }
        for (capability, status) in [
            (Capability::Unsupported, Status::Missing),
            (Capability::Supported, Status::Missing),
            (Capability::WithData, Status::Stale),
            (Capability::Fresh, Status::Ready),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.state.source_state = crate::SourceState::Live;
            snapshot.state.capabilities.positions = capability;
            snapshot.state.cars.push(Car::default());
            assert_eq!(project(&snapshot, Preferences::default()).status, status);
        }
        assert_eq!(
            project(&Snapshot::default(), Preferences::default()).status,
            Status::Disconnected
        );
    }

    #[test]
    fn orders_and_crops_while_projecting_the_player_current_lap() {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.session.kind = Quality::Reliable(SessionKind::Race);
        snapshot.state.session.weather.track_temperature_k = Quality::Reliable(301.15);
        snapshot.state.player = Some(Player {
            car: CarId(7),
            ..Player::default()
        });
        snapshot.state.cars = (1..=7)
            .rev()
            .map(|id| Car {
                id: CarId(id),
                position: Quality::Reliable(id),
                laps: Quality::Reliable(127),
                driver: Driver {
                    name: "André Lotterer".into(),
                    ..Driver::default()
                },
                ..Car::default()
            })
            .collect();
        let vm = project(&snapshot, Preferences::default());
        assert_eq!(
            vm.rows.iter().map(|row| row.id.0).collect::<Vec<_>>(),
            vec![1, 2, 3, 4, 5]
        );
        assert_eq!(vm.session, "CARRERA");
        assert_eq!(vm.weather, "28°");
        assert_eq!(vm.lap, "128");
        for (laps, expected) in [(0, None), (240, Some(240)), (2_147_483_647, None)] {
            snapshot.state.session.laps_total = Quality::Reliable(laps);
            assert_eq!(
                project(&snapshot, Preferences::default()).total_laps,
                expected
            );
        }
    }

    #[test]
    fn weather_and_session_flags_obey_quality_scope_and_preferences() {
        use crate::format::Units;
        use crate::{Flag, Quality};
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = crate::SourceState::Live;
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.cars.push(Car::default());
        for (temperature, expected) in [
            (Quality::Reliable(273.15), "0°"),
            (Quality::Estimated(301.15), "28°"),
            (Quality::Stale(301.15), "—"),
            (Quality::Unavailable, "—"),
            (Quality::Reliable(f64::NAN), "—"),
        ] {
            snapshot.state.session.weather.track_temperature_k = temperature;
            assert_eq!(project(&snapshot, Preferences::default()).weather, expected);
        }
        snapshot.state.session.weather.track_temperature_k = Quality::Reliable(273.15);
        assert_eq!(
            project(
                &snapshot,
                Preferences {
                    units: Units::Imperial,
                    language: Language::En
                }
            )
            .weather,
            "32°"
        );
        let flags = vec![
            Flag {
                kind: FlagKind::Blue,
                scope: FlagScope::Car(CarId(0)),
            },
            Flag {
                kind: FlagKind::Green,
                scope: FlagScope::Session,
            },
        ];
        snapshot.state.flags = Quality::Reliable(flags.clone());
        assert_eq!(
            project(&snapshot, Preferences::default()).flag,
            Some(FlagKind::Green)
        );
        snapshot.state.flags = Quality::Stale(flags);
        assert_eq!(project(&snapshot, Preferences::default()).flag, None);
    }
}
