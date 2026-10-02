//! ViewModel de Standings Eficiencia. Reglas de `standings-view-model-v2.ts`:
//! solo se muestran valores fiables o estimados, y un dato ausente es `—`.

use crate::format::{self, PLACEHOLDER, Preferences};
use crate::{Capability, Car, CarId, FlagKind, FlagScope, Gap, Quality, SessionKind, Snapshot};

/// Diferencia con la mejor vuelta de la sesión por debajo de la cual un coche
/// se considera el más rápido.
const SESSION_BEST_TOLERANCE_S: f64 = 0.0005;

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
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
    let state = &snapshot.state;
    let session = &state.session;
    let kind = session.kind.current();
    let gap_to_best_lap = matches!(kind, Some(SessionKind::Practice | SessionKind::Qualifying));
    let session_best = state
        .cars
        .iter()
        .filter_map(|car| positive(&car.best_lap_s))
        .min_by(f64::total_cmp);
    let player = state.player.map(|p| p.car);

    let mut cars: Vec<&Car> = state.cars.iter().collect();
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
                best_lap_gap(car, session_best, prefs)
            } else {
                let leader = car.position.current() == Some(&1);
                format::gap(car.gap_leader.current().copied(), leader, prefs)
            },
            interval: format::gap(car.gap_ahead.current().copied(), false, prefs),
            laps: number_or_dash(car.laps),
            last_lap: format::lap_time(car.last_lap_s.current().copied()),
            best_lap: format::lap_time(car.best_lap_s.current().copied()),
            in_pits: car.in_pits.current() == Some(&true),
            is_player: player == Some(car.id),
        })
        .collect();

    ViewModel {
        capability: state.capabilities.positions,
        session_label: kind.map_or_else(|| PLACEHOLDER.into(), |k| format::session_kind(k, prefs)),
        clock: format::clock(session.remaining_s.current().copied()),
        class_chip: class_chip(snapshot),
        flag: session_flag(snapshot),
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
