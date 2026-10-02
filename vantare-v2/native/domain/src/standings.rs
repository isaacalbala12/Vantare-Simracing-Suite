//! ViewModel de Standings Eficiencia. Reglas de `standings-view-model-v2.ts`:
//! solo se muestran valores fiables o estimados, y un dato ausente es `—`.

use crate::format::{self, PLACEHOLDER, Preferences};
use crate::{
    Capability, Car, CarId, FlagKind, FlagScope, Gap, Quality, SessionKind, Snapshot, SourceState,
};

/// Diferencia con la mejor vuelta de la sesión por debajo de la cual un coche
/// se considera el más rápido.
const SESSION_BEST_TOLERANCE_S: f64 = 0.0005;

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub source_state: SourceState,
    pub capability: Capability,
    pub session_label: String,
    /// Tiempo restante de la sesión.
    pub clock: String,
    /// Tres primeras letras de la clase del jugador.
    pub class_chip: String,
    pub flag: Option<FlagKind>,
    /// En práctica y clasificación la columna de gap compara mejores vueltas
    /// ("al mejor"); en carrera es la distancia al líder.
    pub gap_to_best_lap: bool,
    pub track: String,
    /// Vueltas restantes; solo en carrera (`≈N` si es una estimación).
    pub laps_remaining: String,
    /// Todos los coches por posición global; quien pinta elige la ventana.
    pub rows: Vec<Row>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: CarId,
    pub position: String,
    pub number: String,
    pub driver: String,
    pub class: String,
    pub gap: String,
    pub interval: String,
    pub laps: String,
    pub last_lap: String,
    pub best_lap: String,
    pub in_pits: bool,
    pub is_player: bool,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_scoped(snapshot, prefs, false, false)
}

/// Clasificación de la clase del jugador; conserva la posición global y usa
/// exclusivamente los gaps de clase que ya publica el núcleo.
pub fn project_player_class(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_scoped(snapshot, prefs, true, true)
}

pub fn project_classification(
    snapshot: &Snapshot,
    prefs: Preferences,
    player_class: bool,
    class_gaps: bool,
) -> ViewModel {
    project_scoped(snapshot, prefs, player_class, class_gaps)
}

#[allow(clippy::too_many_lines)] // Proyección cerrada de clasificación; mantener juntas las reglas de calidad y ámbito.
fn project_scoped(
    snapshot: &Snapshot,
    prefs: Preferences,
    player_class: bool,
    class_gaps: bool,
) -> ViewModel {
    let state = &snapshot.state;
    let available = !matches!(state.source_state, SourceState::Waiting | SourceState::Lost);
    let session = &state.session;
    let kind = session.kind.current().filter(|_| available);
    let gap_to_best_lap = matches!(kind, Some(SessionKind::Practice | SessionKind::Qualifying));
    let class = state
        .player_car()
        .or_else(|| state.cars.first())
        .and_then(|car| car.class.as_ref());
    let mut cars: Vec<&Car> = state
        .cars
        .iter()
        .filter(|car| {
            available
                && (!player_class
                    || car
                        .class
                        .as_ref()
                        .is_none_or(|c| Some(c.id) == class.map(|c| c.id)))
        })
        .collect();
    let session_best = cars
        .iter()
        .filter_map(|car| positive(&car.best_lap_s))
        .min_by(f64::total_cmp);
    let mut class_best = std::collections::HashMap::<crate::ClassId, f64>::new();
    if class_gaps && gap_to_best_lap {
        for car in &cars {
            if let (Some(class), Some(lap)) = (&car.class, positive(&car.best_lap_s)) {
                class_best
                    .entry(class.id)
                    .and_modify(|best| *best = best.min(lap))
                    .or_insert(lap);
            }
        }
    }
    let player = state.player.map(|p| p.car);

    cars.sort_by_key(|car| car.position.current().copied().unwrap_or(u32::MAX));
    let rows = cars
        .into_iter()
        .map(|car| Row {
            id: car.id,
            position: number_or_dash(car.position),
            number: car.number.clone(),
            driver: car.driver.name.clone(),
            class: car
                .class
                .as_ref()
                .map_or_else(String::new, |c| c.name.clone()),
            gap: if gap_to_best_lap {
                best_lap_gap(
                    car,
                    if class_gaps {
                        car.class
                            .as_ref()
                            .and_then(|class| class_best.get(&class.id))
                            .copied()
                    } else {
                        session_best
                    },
                    prefs,
                )
            } else {
                let (gap, leader) = if class_gaps {
                    (
                        car.gap_class_leader,
                        car.class.is_some() && car.class_position.current() == Some(&1),
                    )
                } else {
                    (car.gap_leader, car.position.current() == Some(&1))
                };
                format::gap(gap.current().copied(), leader, prefs)
            },
            interval: format::gap(
                if class_gaps {
                    car.gap_class_ahead
                } else {
                    car.gap_ahead
                }
                .current()
                .copied(),
                false,
                prefs,
            ),
            laps: number_or_dash(car.laps),
            last_lap: format::lap_time(car.last_lap_s.current().copied()),
            best_lap: format::lap_time(car.best_lap_s.current().copied()),
            in_pits: car.in_pits.current() == Some(&true),
            is_player: player == Some(car.id),
        })
        .collect();

    ViewModel {
        source_state: state.source_state,
        capability: state.capabilities.positions,
        session_label: kind.map_or_else(|| PLACEHOLDER.into(), |k| format::session_kind(k, prefs)),
        clock: format::clock(session.remaining_s.current().copied()),
        class_chip: class_chip(snapshot),
        flag: if state.source_state == SourceState::Live {
            session_flag(snapshot)
        } else {
            None
        },
        gap_to_best_lap,
        track: session
            .track_name
            .current()
            .filter(|name| !name.is_empty())
            .map_or_else(|| PLACEHOLDER.into(), Clone::clone),
        laps_remaining: laps_remaining(snapshot),
        rows,
    }
}

fn positive(lap: &Quality<f64>) -> Option<f64> {
    lap.current().copied().filter(|s| s.is_finite() && *s > 0.0)
}

fn number_or_dash(value: Quality<u32>) -> String {
    value
        .current()
        .map_or_else(|| PLACEHOLDER.into(), u32::to_string)
}

fn best_lap_gap(car: &Car, session_best: Option<f64>, prefs: Preferences) -> String {
    match (positive(&car.best_lap_s), session_best) {
        (Some(lap), Some(best)) => {
            let seconds = lap - best;
            let fastest = seconds <= SESSION_BEST_TOLERANCE_S;
            format::gap(Some(Gap::Time { seconds }), fastest, prefs)
        }
        _ => PLACEHOLDER.into(),
    }
}

/// Clase del jugador (o, sin jugador, del primer coche), en tres letras.
fn class_chip(snapshot: &Snapshot) -> String {
    let car = snapshot
        .state
        .player_car()
        .or_else(|| snapshot.state.cars.first());
    match car.and_then(|car| car.class.as_ref()) {
        Some(class) if !class.name.is_empty() => class
            .name
            .chars()
            .take(3)
            .collect::<String>()
            .to_uppercase(),
        _ => PLACEHOLDER.into(),
    }
}

/// Primera bandera de ámbito sesión; el adaptador ordena por relevancia.
fn session_flag(snapshot: &Snapshot) -> Option<FlagKind> {
    snapshot
        .state
        .flags
        .current()?
        .iter()
        .find(|flag| flag.scope == FlagScope::Session)
        .map(|flag| flag.kind.clone())
}

fn laps_remaining(snapshot: &Snapshot) -> String {
    let session = &snapshot.state.session;
    if session.kind.current() != Some(&SessionKind::Race) {
        return PLACEHOLDER.into();
    }
    match session.laps_remaining {
        Quality::Reliable(n) => n.to_string(),
        Quality::Estimated(n) => format!("≈{n}"),
        Quality::Stale(_) | Quality::Unavailable => PLACEHOLDER.into(),
    }
}

/// Celdas de información puras: ausencia y calidad se conservan por señal.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InfoCell {
    pub id: String,
    pub label: String,
    pub value: String,
    pub stale: bool,
}

/// Vocabulario SessionInfo/footer-slots del productivo. `slots` distingue
/// "track" (temperatura) del circuito en `SessionInfo`. Gap lo recibe del VM
/// seleccionado, por lo que no sustituye un gap de clase por el global.
#[allow(clippy::too_many_lines)] // Tabla cerrada de métricas y calidad; separar cada brazo oculta el contrato.
pub fn information(
    snapshot: &Snapshot,
    prefs: Preferences,
    ids: &[String],
    slots: bool,
    player_gap: Option<&str>,
) -> Vec<InfoCell> {
    let session = &snapshot.state.session;
    let available = !matches!(
        snapshot.state.source_state,
        SourceState::Waiting | SourceState::Lost
    );
    let player = snapshot.state.player_car().filter(|_| available);
    let temperature = |value: Quality<f64>| {
        let Some(kelvin) = crate::relative::displayed(&value)
            .copied()
            .filter(|k| available && k.is_finite() && *k >= 0.0)
        else {
            return PLACEHOLDER.into();
        };
        let fahrenheit = prefs.units == format::Units::Imperial;
        let degrees = if fahrenheit {
            (kelvin - 273.15) * 1.8 + 32.0
        } else {
            kelvin - 273.15
        };
        if slots {
            return format!("{degrees:.0}°");
        }
        let text = format!("{degrees:.1}");
        let number = text.strip_suffix(".0").unwrap_or(&text);
        format!("{number}°{}", if fahrenheit { "F" } else { "C" })
    };
    let number = |value: Quality<u32>| {
        crate::relative::displayed(&value)
            .filter(|_| available)
            .map_or_else(|| PLACEHOLDER.into(), u32::to_string)
    };
    ids.iter()
        .filter(|id| id.as_str() != "none")
        .map(|id| {
            let metric = if slots
                && ![
                    "time", "lap", "position", "gap", "bestLap", "lastLap", "track", "ambient",
                    "wind",
                ]
                .contains(&id.as_str())
            {
                ""
            } else {
                id.as_str()
            };
            let (value, stale) = match metric {
                "trackTemperature" | "track" if slots || id == "trackTemperature" => (
                    temperature(session.weather.track_temperature_k),
                    matches!(session.weather.track_temperature_k, Quality::Stale(_)),
                ),
                "airTemperature" | "ambient" => (
                    temperature(session.weather.air_temperature_k),
                    matches!(session.weather.air_temperature_k, Quality::Stale(_)),
                ),
                "track" => (
                    crate::relative::displayed(&session.track_name)
                        .filter(|_| available)
                        .cloned()
                        .unwrap_or_else(|| PLACEHOLDER.into()),
                    matches!(session.track_name, Quality::Stale(_)),
                ),
                "estimatedLaps" => (
                    if available {
                        laps_remaining(snapshot)
                    } else {
                        PLACEHOLDER.into()
                    },
                    matches!(session.laps_remaining, Quality::Stale(_)),
                ),
                "totalLaps" => (
                    number(session.laps_total),
                    matches!(session.laps_total, Quality::Stale(_)),
                ),
                "remaining" | "time" => (
                    format::clock(
                        crate::relative::displayed(&session.remaining_s)
                            .copied()
                            .filter(|_| available),
                    ),
                    matches!(session.remaining_s, Quality::Stale(_)),
                ),
                "rain" => (
                    format::percent(
                        crate::relative::displayed(&session.weather.rain)
                            .copied()
                            .filter(|v| available && (0.0..=1.0).contains(v)),
                    ),
                    matches!(session.weather.rain, Quality::Stale(_)),
                ),
                "wetness" => (
                    format::percent(
                        crate::relative::displayed(&session.weather.track_wetness)
                            .copied()
                            .filter(|v| available && (0.0..=1.0).contains(v)),
                    ),
                    matches!(session.weather.track_wetness, Quality::Stale(_)),
                ),
                "wind" => (
                    format::speed(
                        crate::relative::displayed(&session.weather.wind_speed_mps)
                            .copied()
                            .filter(|_| available),
                        prefs,
                    ),
                    matches!(session.weather.wind_speed_mps, Quality::Stale(_)),
                ),
                "lap" => (
                    player.map_or_else(|| PLACEHOLDER.into(), |car| number(car.laps)),
                    false,
                ),
                "position" => (
                    player.map_or_else(|| PLACEHOLDER.into(), |car| number(car.position)),
                    player.is_some_and(|car| matches!(car.position, Quality::Stale(_))),
                ),
                "gap" => (player_gap.unwrap_or(PLACEHOLDER).into(), false),
                "bestLap" => (
                    format::lap_time(player.and_then(|car| car.best_lap_s.current().copied())),
                    player.is_some_and(|car| matches!(car.best_lap_s, Quality::Stale(_))),
                ),
                "lastLap" => (
                    format::lap_time(player.and_then(|car| car.last_lap_s.current().copied())),
                    player.is_some_and(|car| matches!(car.last_lap_s, Quality::Stale(_))),
                ),
                _ => (PLACEHOLDER.into(), false),
            };
            let label = information_label(id, prefs.language, session.kind.current());
            InfoCell {
                id: id.clone(),
                label: label.to_uppercase(),
                value,
                stale: stale || snapshot.state.source_state == SourceState::Stale,
            }
        })
        .collect()
}

fn information_label<'a>(
    id: &'a str,
    language: format::Language,
    kind: Option<&SessionKind>,
) -> &'a str {
    let pair = match id {
        "track" | "trackTemperature" => ("PISTA", "TRACK"),
        "ambient" | "airTemperature" => ("AIRE", "AIR"),
        "estimatedLaps" => ("V. REST. EST.", "EST. LAPS LEFT"),
        "totalLaps" => ("V. TOTALES", "TOTAL LAPS"),
        "time" | "remaining" => ("RESTANTE", "REMAINING"),
        "rain" => ("LLUVIA", "RAIN"),
        "wetness" => ("HÚMEDO", "WET"),
        "wind" => ("VIENTO", "WIND"),
        "lap" => ("VUELTA", "LAP"),
        "position" => ("POS", "POS"),
        "bestLap" => ("MEJOR V.", "BEST LAP"),
        "lastLap" => ("ÚLT. VUELTA", "LAST LAP"),
        "gap" if matches!(kind, Some(SessionKind::Practice | SessionKind::Qualifying)) => {
            ("AL MEJOR", "TO BEST")
        }
        "gap" => ("AL LÍDER", "TO LEADER"),
        _ => (id, id),
    };
    if language == format::Language::En {
        pair.1
    } else {
        pair.0
    }
}

/// Formato productivo de las columnas de vuelta: 0..3 decimales y compact/full.
#[allow(clippy::float_cmp)] // El empate binario exacto de toFixed debe distinguirse de valores próximos.
pub fn lap_time_column(seconds: Option<f64>, compact: bool, decimals: u8) -> String {
    let Some(seconds) = seconds.filter(|s| s.is_finite() && *s > 0.0) else {
        return PLACEHOLDER.into();
    };
    let decimals = usize::from(decimals.min(3));
    let mut minutes = (seconds / 60.0).floor();
    let remaining = seconds - minutes * 60.0;
    let binary_unit = 2.0_f64.powi(i32::try_from(decimals).unwrap_or(3));
    let tie = remaining.rem_euclid(1.0 / binary_unit) == 0.5 / binary_unit;
    let value = if tie {
        remaining + f64::EPSILON * remaining.abs().max(1.0)
    } else {
        remaining
    };
    let mut text = format!("{value:.decimals$}");
    if text.parse::<f64>().is_ok_and(|value| value >= 60.0) {
        minutes += 1.0;
        text = format!("{:.decimals$}", 0.0);
    }
    if compact {
        text
    } else {
        let width = if decimals == 0 { 2 } else { 3 + decimals };
        format!("{minutes:.0}:{text:0>width$}")
    }
}

/// Formato del nombre de columna; solo transforma presentación, sin identidad.
pub fn driver_name(value: &str, mode: &str, max_chars: usize) -> String {
    if matches!(mode, "initial" | "surname") {
        let mut cleaned = value.to_owned();
        while let Some(start) = cleaned.find('(') {
            let Some(end) = cleaned[start..].find(')') else {
                break;
            };
            cleaned.replace_range(start..=start + end, " ");
        }
        let words: Vec<_> = cleaned.split_whitespace().collect();
        if let [first, rest @ ..] = words.as_slice()
            && !rest.is_empty()
        {
            return if mode == "initial" {
                format!(
                    "{}. {}",
                    first.chars().next().unwrap_or('—'),
                    rest.join(" ")
                )
            } else {
                rest.join(" ")
            };
        }
    } else if mode == "truncate" && value.chars().count() > max_chars {
        return format!(
            "{}…",
            value
                .chars()
                .take(max_chars.saturating_sub(1))
                .collect::<String>()
        );
    }
    value.into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Capabilities, Class, ClassId, Driver, Flag, Player, Session, State};
    use Quality::{Reliable, Stale, Unavailable};

    fn car(id: u32, position: u32, name: &str) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            driver: Driver {
                name: name.into(),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(1),
                name: "LMP2".into(),
            }),
            position: Reliable(position),
            ..Car::default()
        }
    }

    fn snapshot(kind: SessionKind, cars: Vec<Car>) -> Snapshot {
        Snapshot {
            state: State {
                source_state: crate::SourceState::Live,
                capabilities: Capabilities {
                    positions: Capability::Fresh,
                    ..Capabilities::default()
                },
                session: Session {
                    kind: Reliable(kind),
                    remaining_s: Reliable(3492.4),
                    track_name: Reliable("Barcelona".into()),
                    laps_remaining: Quality::Estimated(12),
                    ..Session::default()
                },
                flags: Reliable(vec![
                    Flag {
                        kind: FlagKind::Blue,
                        scope: FlagScope::Car(CarId(1)),
                    },
                    Flag {
                        kind: FlagKind::Yellow,
                        scope: FlagScope::Session,
                    },
                ]),
                cars,
                player: Some(Player {
                    car: CarId(2),
                    ..Player::default()
                }),
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn lap_column_formats_compact_precision_rounding_and_missing_quality() {
        assert_eq!(lap_time_column(Some(109.667), false, 3), "1:49.667");
        assert_eq!(lap_time_column(Some(109.667), false, 1), "1:49.7");
        assert_eq!(lap_time_column(Some(109.667), true, 2), "49.67");
        assert_eq!(lap_time_column(Some(119.9999), false, 0), "2:00");
        assert_eq!(lap_time_column(Some(60.625), true, 2), "0.63");
        assert_eq!(lap_time_column(None, false, 3), PLACEHOLDER);
    }

    #[test]
    fn information_projects_each_metric_and_never_substitutes_missing_signals() {
        let mut scene = snapshot(SessionKind::Race, vec![car(2, 5, "André Lotterer")]);
        scene.state.session.weather.air_temperature_k = Reliable(294.15);
        scene.state.session.weather.track_temperature_k = Reliable(301.15);
        scene.state.session.weather.rain = Reliable(0.25);
        scene.state.session.weather.track_wetness = Reliable(0.5);
        scene.state.session.laps_total = Reliable(40);
        let ids = [
            "trackTemperature",
            "airTemperature",
            "estimatedLaps",
            "totalLaps",
            "track",
            "remaining",
            "rain",
            "wetness",
        ]
        .map(str::to_owned);
        let cells = information(&scene, Preferences::default(), &ids, false, None);
        assert_eq!(
            cells.iter().map(|c| c.value.as_str()).collect::<Vec<_>>(),
            [
                "28°C",
                "21°C",
                "≈12",
                "40",
                "Barcelona",
                "58:12",
                "25%",
                "50%"
            ]
        );
        scene.state.session.weather.rain = Stale(0.25);
        let cells = information(
            &scene,
            Preferences::default(),
            &["rain".into(), "unknown".into()],
            false,
            None,
        );
        assert_eq!(cells[0].value, "25%");
        assert!(cells[0].stale);
        assert_eq!(cells[1].value, PLACEHOLDER);
        assert_eq!(driver_name("André Lotterer", "initial", 16), "A. Lotterer");
        assert_eq!(driver_name("André Lotterer", "surname", 16), "Lotterer");
        assert_eq!(driver_name("André Lotterer", "truncate", 6), "André…");
    }

    #[test]
    fn multiclass_practice_uses_each_class_best_without_global_fallback() {
        let mut first = car(1, 1, "Ana");
        first.best_lap_s = Reliable(100.0);
        let mut second = car(2, 2, "Ben");
        second.class.as_mut().expect("clase").id = ClassId(2);
        second.best_lap_s = Reliable(110.0);
        let mut third = car(3, 3, "Cy");
        third.class.as_mut().expect("clase").id = ClassId(2);
        third.best_lap_s = Reliable(110.5);
        let snapshot = snapshot(SessionKind::Practice, vec![first, second, third]);
        let vm = project_classification(&snapshot, Preferences::default(), false, true);
        assert_eq!(
            vm.rows.iter().map(|r| r.gap.as_str()).collect::<Vec<_>>(),
            ["LÍDER", "LÍDER", "+0.50s"]
        );
        let slots = information(
            &snapshot,
            Preferences::default(),
            &["trackTemperature".into()],
            true,
            None,
        );
        assert_eq!(slots[0].value, PLACEHOLDER, "vocabulario de slots cerrado");
    }

    #[test]
    fn player_class_keeps_global_positions_and_never_substitutes_global_gaps() {
        let mut leader = car(1, 2, "Ana");
        leader.class_position = Reliable(1);
        let mut second = car(2, 5, "Ben");
        second.class_position = Reliable(2);
        second.gap_leader = Reliable(Gap::Time { seconds: 20.0 });
        second.gap_class_leader = Stale(Gap::Time { seconds: 2.0 });
        let mut other = car(3, 1, "Cy");
        other.class.as_mut().expect("clase").id = ClassId(2);
        let mut snapshot = snapshot(SessionKind::Race, vec![second, other, leader]);
        let prefs = Preferences::default();
        let vm = project_player_class(&snapshot, prefs);
        assert_eq!(
            vm.rows.len(),
            2,
            "se filtra por ID, no por el nombre de clase"
        );
        assert_eq!(vm.rows[0].position, "2");
        assert_eq!(vm.rows[0].gap, "LÍDER");
        assert_eq!(vm.rows[1].gap, PLACEHOLDER);
        snapshot.state.cars[0].gap_class_leader = Reliable(Gap::Laps { count: 1 });
        snapshot.state.cars[0].gap_class_ahead = Reliable(Gap::Time { seconds: 0.8 });
        let vm = project_player_class(&snapshot, prefs);
        assert_eq!(vm.rows[1].gap, "+1 V");
        assert_eq!(vm.rows[1].interval, "+0.80s");
        assert_eq!(project(&snapshot, prefs).rows.len(), 3);
    }

    #[test]
    fn player_class_practice_compares_only_fresh_scoped_best_laps() {
        let mut player = car(2, 2, "Ben");
        player.best_lap_s = Reliable(110.0);
        let mut other = car(1, 1, "Ana");
        other.class.as_mut().expect("clase").id = ClassId(2);
        other.best_lap_s = Reliable(100.0);
        let mut same_class = car(3, 3, "Cy");
        same_class.best_lap_s = Stale(109.0);
        let vm = project_player_class(
            &snapshot(SessionKind::Practice, vec![other, player, same_class]),
            Preferences::default(),
        );
        assert_eq!(vm.rows.len(), 2);
        assert_eq!(vm.rows[0].gap, "LÍDER");
        assert_eq!(vm.rows[1].gap, PLACEHOLDER);
    }

    #[test]
    fn race_rows_are_sorted_and_show_gaps_to_the_leader() {
        let mut second = car(2, 2, "Ben");
        second.gap_leader = Reliable(Gap::Time { seconds: 1.234 });
        second.gap_ahead = Reliable(Gap::Time { seconds: 1.234 });
        second.best_lap_s = Stale(101.0);
        second.in_pits = Reliable(true);
        let mut third = car(3, 3, "Cy");
        third.gap_leader = Reliable(Gap::Laps { count: 2 });
        let lost = Car {
            position: Unavailable,
            ..car(4, 0, "Di")
        };
        let first = car(1, 1, "Ana");

        let vm = project(
            &snapshot(SessionKind::Race, vec![lost, third, second, first]),
            Preferences::default(),
        );

        let order: Vec<&str> = vm.rows.iter().map(|r| r.driver.as_str()).collect();
        assert_eq!(order, ["Ana", "Ben", "Cy", "Di"]);
        assert_eq!(vm.rows[0].gap, "LÍDER");
        assert_eq!(vm.rows[1].gap, "+1.23s");
        assert_eq!(vm.rows[1].interval, "+1.23s");
        assert_eq!(
            vm.rows[1].best_lap, PLACEHOLDER,
            "un dato obsoleto no se muestra"
        );
        assert!(vm.rows[1].in_pits && vm.rows[1].is_player && !vm.rows[0].is_player);
        assert_eq!(vm.rows[2].gap, "+2 V");
        assert_eq!(vm.rows[3].position, PLACEHOLDER);
        assert_eq!(vm.rows[3].gap, PLACEHOLDER);
        assert_eq!(
            (
                vm.session_label.as_str(),
                vm.clock.as_str(),
                vm.class_chip.as_str(),
                vm.track.as_str()
            ),
            ("CARRERA", "58:12", "LMP", "Barcelona")
        );
        assert_eq!(vm.laps_remaining, "≈12");
        assert_eq!(
            vm.flag,
            Some(FlagKind::Yellow),
            "la bandera de coche no es de sesión"
        );
        assert!(!vm.gap_to_best_lap);
    }

    #[test]
    fn practice_compares_best_laps() {
        let mut fast = car(1, 1, "Ana");
        fast.best_lap_s = Reliable(100.0);
        let mut slow = car(2, 2, "Ben");
        slow.best_lap_s = Reliable(100.8);
        let none = car(3, 3, "Cy");

        let vm = project(
            &snapshot(SessionKind::Practice, vec![fast, slow, none]),
            Preferences::default(),
        );

        assert!(vm.gap_to_best_lap);
        assert_eq!(vm.rows[0].gap, "LÍDER");
        assert_eq!(vm.rows[1].gap, "+0.80s");
        assert_eq!(vm.rows[2].gap, PLACEHOLDER);
        assert_eq!(vm.laps_remaining, PLACEHOLDER, "solo se muestra en carrera");
    }
}
