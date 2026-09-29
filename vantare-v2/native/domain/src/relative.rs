//! Relative Eficiencia. La ventana canónica en pista (`relative` de Overlay V2)
//! aún no existe en Snapshot. No se sustituye por la clasificación: un doblado
//! puede estar delante en pista y detrás en carrera. Se conserva el jugador en
//! su hueco y los seis vecinos quedan vacíos hasta disponer de esa señal.

use crate::{
    Car, CarId, Quality, Snapshot,
    format::{self, PLACEHOLDER, Preferences},
};

pub const RANGE: usize = 3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Ahead,
    Player,
    Behind,
}

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
    pub position_stale: bool,
    pub best_lap_stale: bool,
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
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let state = &snapshot.state;
    let session = &state.session;
    let player = state.player_car();
    let mut slots = vec![None; RANGE * 2 + 1];
    if let Some(car) = player {
        slots[RANGE] = Some(player_row(car));
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
    }
}

fn player_row(car: &Car) -> Row {
    Row {
        id: car.id,
        side: Side::Player,
        position: displayed(&car.position)
            .filter(|p| **p > 0)
            .map_or_else(|| PLACEHOLDER.into(), ToString::to_string),
        number: car.number.clone(),
        driver: car.driver.name.clone(),
        class: car
            .class
            .as_ref()
            .map_or_else(String::new, |c| c.name.clone()),
        gap: PLACEHOLDER.into(),
        best_lap: format::lap_time(displayed(&car.best_lap_s).copied()),
        position_stale: matches!(car.position, Quality::Stale(_)),
        best_lap_stale: matches!(car.best_lap_s, Quality::Stale(_)),
        lap_delta: None,
    }
}

// Relative productivo conserva los valores stale y atenúa sus celdas al 60 %.
fn displayed<T>(quality: &Quality<T>) -> Option<&T> {
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
