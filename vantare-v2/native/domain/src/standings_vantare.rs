//! ViewModel de Standings en el sistema de diseño Vantare (#1497).
//!
//! Clasificación multiclase agrupada por clase: posiciones ganadas, compuesto,
//! paradas, sectores de la vuelta en curso, última y mejor vuelta y gap al
//! líder de clase. Solo se muestran valores fiables o estimados; lo que la
//! fuente no publica es `—` o se omite, nunca un valor inventado.

use crate::format::{self, Language, PLACEHOLDER, Preferences};
use crate::{
    Car, CarId, FlagKind, FlagScope, Gap, Quality, SessionKind, Snapshot, SourceState, TyreCompound,
};

/// Diferencia por debajo de la cual dos tiempos se consideran iguales.
const TOLERANCE_S: f64 = 0.0005;

#[derive(Clone, Debug, PartialEq)]
pub struct Board {
    pub source_state: SourceState,
    /// «Carrera», «Práctica»…; `—` sin sesión.
    pub session: String,
    /// Vuelta en curso del líder, `14/38` o `14`; vacío fuera de carrera.
    pub lap: String,
    pub final_lap: bool,
    /// Tiempo restante `h:mm:ss`; `—` si no se publica.
    pub remaining: String,
    pub banner: Option<Banner>,
    pub groups: Vec<Group>,
    /// Hay coche del jugador en la sesión.
    pub player_present: bool,
    pub player_in_pits: bool,
    /// Vuelta rápida de la sesión: tiempo y apellido del piloto.
    pub fastest: Option<(String, String)>,
    /// Temperatura de pista (`31 °C`) y estado de la superficie.
    pub track_temperature: String,
    pub surface: String,
}

/// Avisos de sesión que ocupan la franja superior.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Banner {
    /// Amarilla en todo el circuito (FCY).
    FullCourseYellow,
    /// Amarilla local en un sector (desde 1).
    LocalYellow(u8),
    FinalLap,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Group {
    pub class: String,
    /// Abreviatura de cabecera: `HY`, `LMP2`, `LMGT3`.
    pub short: String,
    pub cars: usize,
    pub best_lap: String,
    pub rows: Vec<Row>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: CarId,
    pub position: String,
    /// Posiciones ganadas (+) o perdidas (−) desde la salida.
    pub gained: Option<i64>,
    pub number: String,
    pub driver: String,
    pub vehicle: String,
    pub compound: Option<TyreCompound>,
    pub pit: Pit,
    pub sectors: Vec<Mark>,
    pub last_lap: String,
    pub best_lap: String,
    pub best_mark: Mark,
    pub gap: String,
    pub interval: String,
    pub is_player: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pit {
    InPits,
    Stops(u32),
    Unknown,
}

/// Color de un tiempo: morado mejor de la clase, verde mejor personal,
/// amarillo más lento; `Pending` es un sector aún sin completar o sin dato.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mark {
    Pending,
    Fastest,
    Personal,
    Slower,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> Board {
    let state = &snapshot.state;
    let available = !matches!(state.source_state, SourceState::Waiting | SourceState::Lost);
    let session = &state.session;
    let kind = session.kind.current().filter(|_| available);
    let race = kind == Some(&SessionKind::Race);
    let player = state.player.as_ref().map(|p| p.car);

    let mut cars: Vec<&Car> = if available {
        state.cars.iter().collect()
    } else {
        Vec::new()
    };
    cars.sort_by_key(|car| car.position.current().copied().unwrap_or(u32::MAX));

    // Grupos en orden de su mejor posición; los coches sin clase van juntos.
    let mut groups: Vec<(Option<u32>, Vec<&Car>)> = Vec::new();
    for car in cars {
        let key = car.class.as_ref().map(|c| c.id.0);
        match groups.iter_mut().find(|(k, _)| *k == key) {
            Some((_, list)) => list.push(car),
            None => groups.push((key, vec![car])),
        }
    }

    let groups: Vec<Group> = groups
        .into_iter()
        .map(|(_, list)| group(&list, player, prefs))
        .collect();

    let leader_laps = state
        .cars
        .iter()
        .filter(|car| car.position.current() == Some(&1))
        .find_map(|car| car.laps.current().copied());
    let current_lap = leader_laps.map(|laps| laps + 1);
    let total = session.laps_total.current().copied();
    let lap = match (race, current_lap, total) {
        (true, Some(lap), Some(total)) => format!("{}/{total}", lap.min(total)),
        (true, Some(lap), None) => lap.to_string(),
        (true, None, _) => PLACEHOLDER.into(),
        (false, ..) => String::new(),
    };
    let final_lap = race && matches!((current_lap, total), (Some(l), Some(t)) if l >= t);

    let player_car = state.player_car().filter(|_| available);
    let fastest = state
        .cars
        .iter()
        .filter(|_| available)
        .filter_map(|car| positive(&car.best_lap_s).map(|lap| (lap, car)))
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(lap, car)| (format::lap_time(Some(lap)), surname(&car.driver.name)));

    Board {
        source_state: state.source_state,
        session: kind.map_or_else(|| PLACEHOLDER.into(), |k| session_name(k, prefs)),
        lap,
        final_lap,
        remaining: remaining(session.remaining_s.current().copied()),
        banner: if state.source_state == SourceState::Live {
            banner(snapshot, final_lap)
        } else {
            None
        },
        groups,
        player_present: player_car.is_some(),
        player_in_pits: player_car.is_some_and(|car| car.in_pits.current() == Some(&true)),
        fastest,
        track_temperature: format::temperature(
            session.weather.track_temperature_k.current().copied(),
            prefs,
        ),
        surface: surface(session.weather.track_wetness.current().copied(), prefs),
    }
}

fn group(cars: &[&Car], player: Option<CarId>, prefs: Preferences) -> Group {
    let class = cars
        .first()
        .and_then(|car| car.class.as_ref())
        .map_or_else(String::new, |c| c.name.clone());
    let best = cars
        .iter()
        .filter_map(|car| positive(&car.best_lap_s))
        .min_by(f64::total_cmp);
    let sectors = cars
        .iter()
        .map(|car| car.best_sectors_s.len())
        .max()
        .unwrap_or(0);
    let best_sectors: Vec<Option<f64>> = (0..sectors)
        .map(|i| {
            cars.iter()
                .filter_map(|car| car.best_sectors_s.get(i).and_then(positive))
                .min_by(f64::total_cmp)
        })
        .collect();
    Group {
        short: short(&class),
        class,
        cars: cars.len(),
        best_lap: format::lap_time(best),
        rows: cars
            .iter()
            .map(|car| row(car, best, &best_sectors, player, prefs))
            .collect(),
    }
}

fn row(
    car: &Car,
    class_best: Option<f64>,
    class_sectors: &[Option<f64>],
    player: Option<CarId>,
    prefs: Preferences,
) -> Row {
    let leader = car.class_position.current() == Some(&1);
    let best = positive(&car.best_lap_s);
    let best_mark = match (best, class_best) {
        (Some(lap), Some(top)) if lap <= top + TOLERANCE_S => Mark::Fastest,
        (Some(lap), _) if positive(&car.last_lap_s).is_some_and(|l| l <= lap + TOLERANCE_S) => {
            Mark::Personal
        }
        _ => Mark::Pending,
    };
    let count = class_sectors.len().max(car.current_sectors_s.len());
    let sectors = (0..count)
        .map(|i| {
            let Some(time) = car.current_sectors_s.get(i).and_then(positive) else {
                return Mark::Pending;
            };
            let own = car.best_sectors_s.get(i).and_then(positive);
            match class_sectors.get(i).copied().flatten() {
                Some(top) if time <= top + TOLERANCE_S => Mark::Fastest,
                _ if own.is_some_and(|own| time <= own + TOLERANCE_S) => Mark::Personal,
                _ => Mark::Slower,
            }
        })
        .collect();
    let gained = match (car.grid_position.current(), car.position.current()) {
        (Some(&grid), Some(&now)) => Some(i64::from(grid) - i64::from(now)),
        _ => None,
    };
    Row {
        id: car.id,
        position: car
            .position
            .current()
            .map_or_else(|| PLACEHOLDER.into(), u32::to_string),
        gained,
        number: car.number.clone(),
        driver: car.driver.name.clone(),
        vehicle: car.vehicle.clone(),
        compound: car.tyre_compound.current().copied(),
        pit: if car.in_pits.current() == Some(&true) {
            Pit::InPits
        } else {
            car.pit_stops
                .current()
                .map_or(Pit::Unknown, |n| Pit::Stops(*n))
        },
        sectors,
        last_lap: format::lap_time(car.last_lap_s.current().copied()),
        best_lap: format::lap_time(best),
        best_mark,
        gap: gap(car.gap_class_leader, leader, prefs),
        interval: gap(car.gap_class_ahead, leader, prefs),
        is_player: player == Some(car.id),
    }
}

fn positive(time: &Quality<f64>) -> Option<f64> {
    time.current()
        .copied()
        .filter(|s| s.is_finite() && *s > 0.0)
}

/// `Líder`, `+1.284` o `+1 V`, como el catálogo r10b.
fn gap(gap: Quality<Gap>, leader: bool, prefs: Preferences) -> String {
    if leader {
        return match prefs.language {
            Language::Es => "Líder",
            Language::En => "Leader",
        }
        .into();
    }
    match gap.current() {
        Some(Gap::Time { seconds }) if seconds.is_finite() && *seconds >= 0.0 => {
            format!("+{}", format::to_fixed(*seconds, 3))
        }
        Some(Gap::Laps { count }) if *count > 0 => {
            let unit = match prefs.language {
                Language::Es => "V",
                Language::En => "L",
            };
            format!("+{count} {unit}")
        }
        _ => PLACEHOLDER.into(),
    }
}

/// `5:42:18` o `42:18`.
fn remaining(seconds: Option<f64>) -> String {
    let Some(seconds) = seconds.filter(|s| s.is_finite() && *s >= 0.0) else {
        return PLACEHOLDER.into();
    };
    let total = format::whole(seconds);
    let (h, m, s) = (total / 3600, total % 3600 / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn session_name(kind: &SessionKind, prefs: Preferences) -> String {
    match (kind, prefs.language) {
        (SessionKind::Race, Language::Es) => "Carrera".into(),
        (SessionKind::Race, Language::En) => "Race".into(),
        (SessionKind::Practice, Language::Es) => "Práctica".into(),
        (SessionKind::Practice, Language::En) => "Practice".into(),
        (SessionKind::Qualifying, Language::Es) => "Clasificación".into(),
        (SessionKind::Qualifying, Language::En) => "Qualifying".into(),
        (SessionKind::Other(name), _) => name.clone(),
    }
}

/// Abreviatura de clase: hasta cinco letras se conserva; si no, dos letras.
fn short(class: &str) -> String {
    let compact: String = class.chars().filter(|c| !c.is_whitespace()).collect();
    if compact.chars().count() <= 5 {
        compact.to_uppercase()
    } else {
        compact.chars().take(2).collect::<String>().to_uppercase()
    }
}

fn surname(name: &str) -> String {
    name.rsplit(' ').next().unwrap_or(name).to_owned()
}

fn surface(wetness: Option<f64>, prefs: Preferences) -> String {
    let Some(wet) = wetness.filter(|w| w.is_finite()) else {
        return PLACEHOLDER.into();
    };
    let (dry, damp, soaked) = match prefs.language {
        Language::Es => ("seca", "húmeda", "mojada"),
        Language::En => ("dry", "damp", "wet"),
    };
    if wet < 0.05 {
        dry
    } else if wet < 0.4 {
        damp
    } else {
        soaked
    }
    .into()
}

fn banner(snapshot: &Snapshot, final_lap: bool) -> Option<Banner> {
    let flags = snapshot.state.flags.current();
    let yellow = |scope: fn(&FlagScope) -> Option<u8>| {
        flags
            .into_iter()
            .flatten()
            .filter(|flag| flag.kind == FlagKind::Yellow)
            .find_map(|flag| scope(&flag.scope))
    };
    if yellow(|s| matches!(s, FlagScope::Session).then_some(0)).is_some() {
        return Some(Banner::FullCourseYellow);
    }
    if let Some(sector) = yellow(|s| match s {
        FlagScope::Sector(n) => Some(*n),
        _ => None,
    }) {
        return Some(Banner::LocalYellow(sector + 1));
    }
    final_lap.then_some(Banner::FinalLap)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Class, ClassId, Driver, Flag, Player, Session, State};

    fn car(id: u32, class: (u32, &str), position: u32, class_position: u32) -> Car {
        Car {
            id: CarId(id),
            number: id.to_string(),
            driver: Driver {
                name: format!("A. Piloto{id}"),
                ..Driver::default()
            },
            class: Some(Class {
                id: ClassId(class.0),
                name: class.1.into(),
            }),
            position: Quality::Reliable(position),
            class_position: Quality::Reliable(class_position),
            ..Car::default()
        }
    }

    fn snapshot(cars: Vec<Car>) -> Snapshot {
        Snapshot {
            state: State {
                source_state: SourceState::Live,
                session: Session {
                    kind: Quality::Reliable(SessionKind::Race),
                    ..Session::default()
                },
                cars,
                player: Some(Player {
                    car: CarId(2),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    #[test]
    fn groups_by_class_in_position_order_with_class_gaps() {
        let mut a = car(1, (0, "Hypercar"), 1, 1);
        a.laps = Quality::Reliable(13);
        let mut b = car(2, (0, "Hypercar"), 2, 2);
        b.gap_class_leader = Quality::Reliable(Gap::Time { seconds: 1.2844 });
        b.gap_class_ahead = Quality::Estimated(Gap::Laps { count: 1 });
        let c = car(3, (1, "LMGT3"), 3, 1);
        let mut s = snapshot(vec![c, b, a]);
        s.state.session.laps_total = Quality::Reliable(38);
        s.state.session.remaining_s = Quality::Reliable(20_538.4);
        let board = project(&s, Preferences::default());
        assert_eq!(board.lap, "14/38");
        assert_eq!(board.remaining, "5:42:18");
        assert_eq!(board.session, "Carrera");
        let names: Vec<_> = board
            .groups
            .iter()
            .map(|g| (g.short.as_str(), g.cars))
            .collect();
        assert_eq!(names, [("HY", 2), ("LMGT3", 1)]);
        let hy = &board.groups[0].rows;
        assert_eq!(
            (hy[0].gap.as_str(), hy[1].gap.as_str()),
            ("Líder", "+1.284")
        );
        assert_eq!(hy[1].interval, "+1 V");
        assert!(hy[1].is_player && board.player_present);
        assert_eq!(board.banner, None);
    }

    #[test]
    fn absent_signals_stay_absent() {
        let s = snapshot(vec![car(2, (0, "Hypercar"), 1, 1)]);
        let board = project(&s, Preferences::default());
        let row = &board.groups[0].rows[0];
        assert_eq!(row.gained, None);
        assert_eq!(row.compound, None);
        assert_eq!(row.pit, Pit::Unknown);
        assert!(row.sectors.is_empty());
        assert!(row.vehicle.is_empty());
        assert_eq!((row.last_lap.as_str(), row.best_lap.as_str()), ("—", "—"));
        assert_eq!(row.best_mark, Mark::Pending);
        assert_eq!(board.fastest, None);
        assert_eq!(
            (board.track_temperature.as_str(), board.surface.as_str()),
            ("—", "—")
        );
        assert_eq!(board.remaining, "—");
        assert_eq!(board.lap, "—");
    }

    #[test]
    fn marks_class_best_personal_best_and_sector_progress() {
        let mut fast = car(1, (0, "Hypercar"), 1, 1);
        fast.best_lap_s = Quality::Reliable(207.046);
        fast.last_lap_s = Quality::Reliable(208.412);
        fast.best_sectors_s = vec![
            Quality::Reliable(70.0),
            Quality::Reliable(68.0),
            Quality::Reliable(69.0),
        ];
        let mut me = car(2, (0, "Hypercar"), 2, 2);
        me.best_lap_s = Quality::Reliable(207.904);
        me.last_lap_s = Quality::Reliable(207.904);
        me.best_sectors_s = vec![
            Quality::Reliable(69.5),
            Quality::Reliable(68.5),
            Quality::Reliable(70.0),
        ];
        me.current_sectors_s = vec![Quality::Reliable(69.5), Quality::Reliable(68.6)];
        me.grid_position = Quality::Reliable(4);
        me.pit_stops = Quality::Reliable(1);
        me.tyre_compound = Quality::Estimated(TyreCompound::Medium);
        let mut boxed = car(3, (0, "Hypercar"), 3, 3);
        boxed.in_pits = Quality::Reliable(true);
        boxed.pit_stops = Quality::Reliable(1);
        boxed.grid_position = Quality::Stale(1);
        let board = project(&snapshot(vec![fast, me, boxed]), Preferences::default());
        let rows = &board.groups[0].rows;
        assert_eq!(rows[0].best_mark, Mark::Fastest);
        assert_eq!(rows[1].best_mark, Mark::Personal);
        assert_eq!(
            rows[1].sectors,
            [Mark::Fastest, Mark::Slower, Mark::Pending]
        );
        assert_eq!(rows[1].gained, Some(2));
        assert_eq!(rows[1].pit, Pit::Stops(1));
        assert_eq!(rows[1].compound, Some(TyreCompound::Medium));
        assert_eq!(rows[2].pit, Pit::InPits);
        assert_eq!(rows[2].gained, None, "una parrilla obsoleta no se muestra");
        assert_eq!(board.fastest, Some(("3:27.046".into(), "Piloto1".into())));
    }

    #[test]
    fn banners_and_unavailable_sources() {
        let mut s = snapshot(vec![car(2, (0, "Hypercar"), 1, 1)]);
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Sector(1),
        }]);
        assert_eq!(
            project(&s, Preferences::default()).banner,
            Some(Banner::LocalYellow(2))
        );
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert_eq!(
            project(&s, Preferences::default()).banner,
            Some(Banner::FullCourseYellow)
        );
        s.state.flags = Quality::Unavailable;
        s.state.cars[0].laps = Quality::Reliable(37);
        s.state.session.laps_total = Quality::Reliable(38);
        let board = project(&s, Preferences::default());
        assert!(board.final_lap);
        assert_eq!(board.banner, Some(Banner::FinalLap));
        s.state.source_state = SourceState::Waiting;
        let board = project(&s, Preferences::default());
        assert!(board.groups.is_empty() && !board.player_present);
        assert_eq!(board.session, "—");
        s.state.source_state = SourceState::Live;
        s.state.player = None;
        assert!(!project(&s, Preferences::default()).player_present);
    }

    #[test]
    fn surface_and_temperature_follow_preferences() {
        let mut s = snapshot(vec![car(2, (0, "Hypercar"), 1, 1)]);
        s.state.session.weather.track_temperature_k = Quality::Reliable(304.15);
        s.state.session.weather.track_wetness = Quality::Reliable(0.0);
        let board = project(&s, Preferences::default());
        assert_eq!(
            (board.track_temperature.as_str(), board.surface.as_str()),
            ("31 °C", "seca")
        );
        s.state.session.weather.track_wetness = Quality::Reliable(0.6);
        let en = Preferences {
            language: Language::En,
            ..Preferences::default()
        };
        assert_eq!(project(&s, en).surface, "wet");
    }
}
