//! ViewModel de Relative en el sistema de diseño Vantare (#1497).
//!
//! Vecinos en pista por gap firmado al jugador (la misma ventana que Relative
//! Eficiencia), con nivel y Safety Rating del piloto, tendencia del gap por
//! vuelta, tira de pista, aviso de tráfico más rápido que llega por detrás y
//! estimación de dónde se sale tras una parada. Solo se muestran valores
//! actuales; lo que la fuente no publica es `—` o se omite.

use crate::format::PLACEHOLDER;
use crate::relative::{relative_seconds, track_window_configured};
use crate::{
    Car, CarId, DriverRating, FlagKind, FlagScope, Quality, SessionKind, Snapshot, SourceState,
};

/// Alcance de la tira de pista, en segundos a cada lado.
pub const STRIP_S: f64 = 10.0;
/// Distancia por detrás a la que avisa el tráfico de una clase más rápida.
pub const TRAFFIC_S: f64 = 6.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Ahead,
    Player,
    Behind,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Board {
    pub source_state: SourceState,
    pub player_present: bool,
    pub player_in_pits: bool,
    pub pit_limiter: bool,
    pub banner: Option<Banner>,
    /// Huecos de la ventana: delante lejos→cerca, jugador, detrás cerca→lejos.
    pub slots: Vec<Option<Row>>,
    /// Coches a menos de `STRIP_S` del jugador, para la tira de pista.
    pub strip: Vec<Dot>,
    /// Clase del jugador abreviada, si no es la más rápida (aviso de tráfico).
    pub slower_class: Option<String>,
    pub traffic: Option<Traffic>,
    pub pit_exit: Option<PitExit>,
    /// Piloto, coche y dorsal de todos los coches: el ancho del nombre se
    /// ajusta a la sesión, no a los vecinos del momento.
    pub names: Vec<(String, String, String)>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Banner {
    FullCourseYellow,
    LocalYellow(u8),
    InPits,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub id: CarId,
    pub side: Side,
    pub class: String,
    /// Posición en su clase, `P3`.
    pub class_position: String,
    pub number: String,
    pub driver: String,
    pub vehicle: String,
    /// Vueltas de diferencia en carrera: negativo = doblado, positivo = te dobla.
    pub laps: Option<i32>,
    /// Segundos con signo: delante negativo, detrás positivo, `0.0` el jugador.
    pub gap: String,
    pub rating: Option<DriverRating>,
    /// `SR 84` o `—`.
    pub safety: String,
    pub trend: Option<Trend>,
    pub is_player: bool,
    pub in_pits: bool,
    /// Coche de una clase más rápida que llega por detrás a menos de `TRAFFIC_S`.
    pub fast_traffic: bool,
}

/// Tendencia del gap por vuelta: valor sin signo, si se acerca y si te
/// conviene (cazas al de delante o te escapas del de detrás).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Trend {
    pub value: String,
    pub closing: bool,
    pub good: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Dot {
    pub id: CarId,
    /// Segundos con el signo de la tabla (delante negativo).
    pub offset_s: f64,
    pub class: String,
    pub is_player: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Traffic {
    pub count: usize,
    pub class: String,
}

/// Coches entre los que se saldría tras una parada y la pérdida estimada.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PitExit {
    pub ahead: Option<String>,
    pub behind: Option<String>,
    pub loss: String,
}

pub fn project(snapshot: &Snapshot, ahead: usize, behind: usize, same_class: bool) -> Board {
    let state = &snapshot.state;
    let live = state.source_state == SourceState::Live;
    let player = state.player_car().filter(|_| live);
    let race = state.session.kind.current() == Some(&SessionKind::Race);
    let ahead = ahead.min(8);
    let behind = behind.min(8);

    // Ritmo de clase: la mejor vuelta de cada clase decide cuál es más rápida.
    let pace = |class: Option<u32>| {
        state
            .cars
            .iter()
            .filter(|car| car.class.as_ref().map(|c| c.id.0) == class)
            .filter_map(|car| car.best_lap_s.current().copied())
            .filter(|lap| lap.is_finite() && *lap > 0.0)
            .min_by(f64::total_cmp)
    };
    let player_class = player.and_then(|car| car.class.as_ref().map(|c| c.id.0));
    let player_pace = pace(player_class);
    let faster = |car: &Car| {
        let class = car.class.as_ref().map(|c| c.id.0);
        class != player_class
            && matches!((pace(class), player_pace), (Some(theirs), Some(mine)) if theirs < mine)
    };
    let traffic_car = |car: &Car| {
        relative_seconds(car).is_some_and(|gap| gap < 0.0 && -gap <= TRAFFIC_S) && faster(car)
    };

    let slots = player.map_or_else(
        || vec![None; ahead + behind + 1],
        |me| {
            track_window_configured(&state.cars, me.id, ahead, behind, same_class)
                .into_iter()
                .enumerate()
                .map(|(index, car)| {
                    let side = match index.cmp(&ahead) {
                        std::cmp::Ordering::Less => Side::Ahead,
                        std::cmp::Ordering::Equal => Side::Player,
                        std::cmp::Ordering::Greater => Side::Behind,
                    };
                    car.map(|car| row(car, side, race, traffic_car(car)))
                })
                .collect()
        },
    );

    let strip = player.map_or_else(Vec::new, |me| strip(&state.cars, me, same_class));

    let traffic_cars: Vec<&Car> = state.cars.iter().filter(|c| traffic_car(c)).collect();
    let traffic = traffic_cars.first().map(|car| Traffic {
        count: traffic_cars.len(),
        class: class_name(car),
    });
    let slower_class = player
        .filter(|me| state.cars.iter().any(|car| car.id != me.id && faster(car)))
        .map(class_name);

    let player_in_pits = player.is_some_and(|car| car.in_pits.current() == Some(&true));
    let pit_limiter = state
        .player
        .as_ref()
        .is_some_and(|p| p.pit_limiter_active.current() == Some(&true));
    let pit_exit = player
        .filter(|_| player_in_pits)
        .and_then(|me| pit_exit(&state.cars, me.id, state.player.as_ref()?.pit_loss_s));

    Board {
        source_state: state.source_state,
        player_present: player.is_some(),
        player_in_pits,
        pit_limiter,
        banner: if live {
            banner(snapshot, player_in_pits)
        } else {
            None
        },
        slots,
        strip,
        slower_class,
        traffic,
        pit_exit,
        names: if live {
            state
                .cars
                .iter()
                .map(|car| {
                    (
                        car.driver.name.clone(),
                        car.vehicle.clone(),
                        car.number.clone(),
                    )
                })
                .collect()
        } else {
            Vec::new()
        },
    }
}

/// Coches a menos de `STRIP_S` del jugador, con el signo de la tabla y el
/// mismo filtro de clase que la tabla.
fn strip(cars: &[Car], me: &Car, same_class: bool) -> Vec<Dot> {
    let my_class = me.class.as_ref().map(|c| c.id);
    let me = me.id;
    cars.iter()
        .filter(|car| !same_class || car.class.as_ref().map(|c| c.id) == my_class)
        .filter_map(|car| {
            let offset = if car.id == me {
                0.0
            } else {
                -relative_seconds(car)?
            };
            (offset.abs() <= STRIP_S).then(|| Dot {
                id: car.id,
                offset_s: offset,
                class: class_name(car),
                is_player: car.id == me,
            })
        })
        .collect()
}

fn row(car: &Car, side: Side, race: bool, fast_traffic: bool) -> Row {
    let gap = relative_seconds(car);
    Row {
        id: car.id,
        side,
        class: class_name(car),
        class_position: car
            .class_position
            .current()
            .map_or_else(|| PLACEHOLDER.into(), |p| format!("P{p}")),
        number: car.number.clone(),
        driver: car.driver.name.clone(),
        vehicle: car.vehicle.clone(),
        laps: car
            .relative_laps
            .current()
            .copied()
            .filter(|laps| race && *laps != 0 && side != Side::Player),
        gap: match (side, gap) {
            (Side::Player, _) => "0.0".into(),
            (_, Some(seconds)) => format!("{:+.1}", -seconds),
            (_, None) => PLACEHOLDER.into(),
        },
        rating: car.driver_rating.current().copied(),
        safety: car
            .safety_rating
            .current()
            .map_or_else(|| PLACEHOLDER.into(), |sr| format!("SR {sr:.0}")),
        trend: (side != Side::Player)
            .then(|| car.relative_trend_s_per_lap.current().copied())
            .flatten()
            .filter(|t| t.is_finite() && t.abs() >= 0.05)
            .map(|t| {
                let closing = t < 0.0;
                Trend {
                    value: format!("{:.1}", t.abs()),
                    closing,
                    good: if side == Side::Ahead {
                        closing
                    } else {
                        !closing
                    },
                }
            }),
        is_player: side == Side::Player,
        in_pits: car.in_pits.current() == Some(&true),
        fast_traffic,
    }
}

fn class_name(car: &Car) -> String {
    car.class
        .as_ref()
        .map_or_else(String::new, |class| class.name.clone())
}

fn surname(name: &str) -> String {
    name.rsplit(' ').next().unwrap_or(name).to_owned()
}

/// Tras perder `loss` segundos, cada rival queda `relative_s + loss` por
/// delante: se sale entre el delante más cercano y el detrás más cercano.
fn pit_exit(cars: &[Car], me: CarId, loss: Quality<f64>) -> Option<PitExit> {
    let loss = loss
        .current()
        .copied()
        .filter(|l| l.is_finite() && *l > 0.0)?;
    let label = |car: &Car| {
        if car.number.is_empty() {
            surname(&car.driver.name)
        } else {
            format!("{} (#{})", surname(&car.driver.name), car.number)
        }
    };
    let after: Vec<(f64, &Car)> = cars
        .iter()
        .filter(|car| car.id != me)
        .filter_map(|car| Some((relative_seconds(car)? + loss, car)))
        .collect();
    let ahead = after
        .iter()
        .filter(|(gap, _)| *gap > 0.0)
        .min_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, car)| label(car));
    let behind = after
        .iter()
        .filter(|(gap, _)| *gap < 0.0)
        .max_by(|a, b| a.0.total_cmp(&b.0))
        .map(|(_, car)| label(car));
    Some(PitExit {
        ahead,
        behind,
        loss: format!("{loss:.1} s"),
    })
}

fn banner(snapshot: &Snapshot, in_pits: bool) -> Option<Banner> {
    let flags = snapshot.state.flags.current();
    let yellow = |scope: fn(&FlagScope) -> Option<u8>| {
        flags
            .into_iter()
            .flatten()
            .filter(|flag| flag.kind == FlagKind::Yellow)
            .find_map(|flag| scope(&flag.scope))
    };
    if in_pits {
        return Some(Banner::InPits);
    }
    if yellow(|s| matches!(s, FlagScope::Session).then_some(0)).is_some() {
        return Some(Banner::FullCourseYellow);
    }
    yellow(|s| match s {
        FlagScope::Sector(n) => Some(*n),
        _ => None,
    })
    .map(|sector| Banner::LocalYellow(sector + 1))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Class, ClassId, Driver, Flag, Player, Session, State};

    fn car(id: u32, class: (u32, &str), relative: f64, best: f64) -> Car {
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
            class_position: Quality::Reliable(id),
            relative_s: Quality::Reliable(relative),
            best_lap_s: Quality::Reliable(best),
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
                    car: CarId(1),
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    const GT: (u32, &str) = (2, "LMGT3");
    const HY: (u32, &str) = (0, "Hypercar");

    #[test]
    fn window_signs_gaps_like_the_catalogue_and_rates_trends() {
        let me = car(1, GT, 0.0, 235.0);
        let mut ahead = car(2, GT, 3.1, 236.0);
        ahead.relative_trend_s_per_lap = Quality::Estimated(-0.2);
        ahead.driver_rating = Quality::Reliable(DriverRating::Gold);
        ahead.safety_rating = Quality::Reliable(93.4);
        let mut behind = car(3, GT, -6.9, 236.5);
        behind.relative_trend_s_per_lap = Quality::Estimated(0.3);
        let board = project(&snapshot(vec![me, ahead, behind]), 3, 3, false);
        let rows: Vec<&Row> = board.slots.iter().flatten().collect();
        assert_eq!(rows.len(), 3);
        assert_eq!(
            (
                rows[0].gap.as_str(),
                rows[1].gap.as_str(),
                rows[2].gap.as_str()
            ),
            ("-3.1", "0.0", "+6.9")
        );
        assert_eq!(
            rows[0].trend,
            Some(Trend {
                value: "0.2".into(),
                closing: true,
                good: true
            })
        );
        assert_eq!(
            rows[2].trend,
            Some(Trend {
                value: "0.3".into(),
                closing: false,
                good: true
            })
        );
        assert_eq!(rows[0].rating, Some(DriverRating::Gold));
        assert_eq!(
            (rows[0].safety.as_str(), rows[2].safety.as_str()),
            ("SR 93", "—")
        );
        assert_eq!(rows[0].class_position, "P2");
        assert!(board.traffic.is_none() && board.slower_class.is_none());
    }

    #[test]
    fn faster_class_behind_within_six_seconds_raises_traffic_and_lap_badges() {
        let me = car(1, GT, 0.0, 235.0);
        let mut hyper = car(5, HY, -1.8, 207.0);
        hyper.relative_laps = Quality::Estimated(2);
        let mut far = car(6, HY, -9.0, 207.5);
        far.relative_laps = Quality::Estimated(2);
        let board = project(&snapshot(vec![me, hyper, far]), 3, 3, false);
        assert_eq!(
            board.traffic,
            Some(Traffic {
                count: 1,
                class: "Hypercar".into()
            })
        );
        assert_eq!(board.slower_class.as_deref(), Some("LMGT3"));
        let row = board
            .slots
            .iter()
            .flatten()
            .find(|r| r.id == CarId(5))
            .expect("hypercar");
        assert!(row.fast_traffic);
        assert_eq!(row.laps, Some(2));
        assert_eq!(board.strip.len(), 3, "los tres dentro de ±10 s");
    }

    #[test]
    fn same_class_filters_the_strip_like_the_table_but_keeps_traffic() {
        let me = car(1, GT, 0.0, 235.0);
        let rival = car(2, GT, 2.0, 236.0);
        let hyper = car(5, HY, -1.8, 207.0);
        let board = project(&snapshot(vec![me, rival, hyper]), 3, 3, true);
        assert_eq!(board.strip.len(), 2, "solo LMGT3 en la tira");
        assert_eq!(board.slots.iter().flatten().count(), 2);
        assert!(
            board.traffic.is_some(),
            "el tráfico más rápido sigue avisando"
        );
    }

    #[test]
    fn pit_exit_lands_between_the_cars_around_the_loss_and_banner_says_pits() {
        let mut me = car(1, HY, 0.0, 207.0);
        me.in_pits = Quality::Reliable(true);
        let mut s = snapshot(vec![
            me,
            car(2, GT, -26.0, 235.0),
            car(3, HY, -28.5, 208.0),
            car(4, HY, 3.0, 207.5),
        ]);
        s.state.player.as_mut().expect("jugador").pit_loss_s = Quality::Estimated(27.4);
        let board = project(&s, 3, 3, false);
        assert_eq!(board.banner, Some(Banner::InPits));
        assert_eq!(
            board.pit_exit,
            Some(PitExit {
                ahead: Some("Piloto2 (#2)".into()),
                behind: Some("Piloto3 (#3)".into()),
                loss: "27.4 s".into(),
            })
        );
    }

    #[test]
    fn without_data_nothing_is_invented() {
        let mut s = snapshot(vec![
            car(1, HY, 0.0, 207.0),
            Car {
                id: CarId(2),
                ..Car::default()
            },
        ]);
        let board = project(&s, 3, 3, false);
        assert_eq!(
            board.slots.iter().flatten().count(),
            1,
            "sin gap no hay vecino"
        );
        assert!(board.pit_exit.is_none());
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert_eq!(
            project(&s, 3, 3, false).banner,
            Some(Banner::FullCourseYellow)
        );
        s.state.source_state = SourceState::Waiting;
        let board = project(&s, 2, 2, false);
        assert!(!board.player_present && board.slots.iter().all(Option::is_none));
        assert_eq!(board.slots.len(), 5);
    }
}
