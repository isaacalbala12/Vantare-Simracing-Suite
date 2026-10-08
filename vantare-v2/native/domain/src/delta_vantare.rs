//! ViewModel de Delta en el sistema de diseño Vantare (#1497).
//!
//! La diferencia en vivo la resuelve el núcleo para cada referencia (mejor
//! vuelta propia, vuelta óptima y mejor vuelta del líder de la clase); aquí no
//! se reconstruye. Se añaden el tiempo de la referencia, la vuelta predicha,
//! el estado (en pausa en boxes, vuelta de salida o FCY; invalidada; sin
//! referencia) y los sectores de la vuelta en curso frente a los mejores.

use crate::{Car, FlagKind, FlagScope, Quality, Snapshot, SourceState};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Reference {
    #[default]
    Best,
    Optimal,
    Leader,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pause {
    Pits,
    OutLap,
    Fcy,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Live,
    Paused(Pause),
    Invalid,
    NoReference,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Banner {
    InPits,
    FullCourseYellow,
}

/// Color de un sector completado.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SectorTone {
    /// Mejor de la sesión entre todos los coches.
    SessionBest,
    /// Mejor propio.
    PersonalBest,
    Slower,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Sector {
    /// Completado en esta vuelta; diferencia con el mejor propio si lo hay.
    Done(SectorTone, Option<f64>),
    /// En curso: fracción recorrida frente al mejor propio (0–1).
    Live(Option<f64>),
    Pending,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Board {
    pub source_state: SourceState,
    pub player_present: bool,
    pub banner: Option<Banner>,
    pub reference: Reference,
    /// Tiempo de vuelta de la referencia.
    pub reference_lap_s: Option<f64>,
    /// Negativo = más rápido que la referencia.
    pub delta_s: Option<f64>,
    pub phase: Phase,
    pub predicted_s: Option<f64>,
    /// Vuelta en curso y sector en curso (desde 1).
    pub lap: Option<u32>,
    pub sector: Option<u8>,
    pub sectors: Vec<Sector>,
    /// Mejor vuelta propia: al bajar, hay vuelta récord personal.
    pub best_lap_s: Option<f64>,
}

fn value(quality: &Quality<f64>) -> Option<f64> {
    quality.current().copied().filter(|v| v.is_finite())
}

fn lap_time(quality: &Quality<f64>) -> Option<f64> {
    value(quality).filter(|v| *v > 0.0)
}

pub fn project(snapshot: &Snapshot, reference: Reference) -> Board {
    let state = &snapshot.state;
    let live = state.source_state == SourceState::Live;
    let car = state.player_car().filter(|_| live);
    let player = state.player.as_ref().filter(|_| car.is_some());

    let delta_s = player.and_then(|p| match reference {
        Reference::Best => value(&p.delta_best_s),
        Reference::Optimal => value(&p.delta_optimal_s),
        Reference::Leader => value(&p.delta_leader_s),
    });
    let reference_lap_s = car.and_then(|me| match reference {
        Reference::Best => lap_time(&me.best_lap_s),
        Reference::Optimal => optimal(me),
        Reference::Leader => class_leader(&state.cars, me).and_then(|l| lap_time(&l.best_lap_s)),
    });

    let in_pits = car.is_some_and(|c| c.in_pits.current() == Some(&true));
    let fcy = live && full_course_yellow(snapshot);
    let out_lap = player.is_some_and(|p| p.stint.laps.current() == Some(&0));
    let invalid = player.is_some_and(|p| p.lap_invalid.current() == Some(&true));
    let phase = if in_pits {
        Phase::Paused(Pause::Pits)
    } else if fcy {
        Phase::Paused(Pause::Fcy)
    } else if out_lap {
        Phase::Paused(Pause::OutLap)
    } else if delta_s.is_none() || (reference_lap_s.is_none() && reference != Reference::Best) {
        Phase::NoReference
    } else if invalid {
        Phase::Invalid
    } else {
        Phase::Live
    };

    let predicted_s = match (reference, phase) {
        (_, Phase::Live) => car
            .filter(|_| reference == Reference::Best)
            .and_then(|c| lap_time(&c.estimated_lap_s))
            .or_else(|| reference_lap_s.zip(delta_s).map(|(r, d)| r + d)),
        _ => None,
    };

    Board {
        source_state: state.source_state,
        player_present: car.is_some(),
        banner: if in_pits {
            Some(Banner::InPits)
        } else if fcy {
            Some(Banner::FullCourseYellow)
        } else {
            None
        },
        reference,
        reference_lap_s,
        delta_s,
        phase,
        predicted_s,
        lap: car.and_then(|c| c.laps.current().map(|laps| laps + 1)),
        sector: car.and_then(|c| c.current_sector.current().map(|s| s + 1)),
        sectors: car.map_or_else(Vec::new, |me| sectors(&state.cars, me)),
        best_lap_s: car.and_then(|c| lap_time(&c.best_lap_s)),
    }
}

/// Suma de los mejores sectores propios, si están todos.
fn optimal(car: &Car) -> Option<f64> {
    if car.best_sectors_s.is_empty() {
        return None;
    }
    car.best_sectors_s.iter().map(lap_time).sum::<Option<f64>>()
}

/// Primero de la clase del jugador (él mismo si lidera).
fn class_leader<'a>(cars: &'a [Car], me: &Car) -> Option<&'a Car> {
    let class = me.class.as_ref().map(|c| c.id);
    cars.iter()
        .filter(|c| c.class.as_ref().map(|c| c.id) == class)
        .find(|c| c.class_position.current() == Some(&1))
}

fn full_course_yellow(snapshot: &Snapshot) -> bool {
    snapshot
        .state
        .flags
        .current()
        .into_iter()
        .flatten()
        .any(|flag| flag.kind == FlagKind::Yellow && matches!(flag.scope, FlagScope::Session))
}

fn sectors(cars: &[Car], me: &Car) -> Vec<Sector> {
    let count = me.best_sectors_s.len().max(me.current_sectors_s.len());
    let current = me.current_sector.current().map(|s| usize::from(*s));
    let elapsed = value(&me.lap_elapsed_s);
    let mut done = 0.0;
    (0..count)
        .map(|index| {
            let best = me.best_sectors_s.get(index).and_then(lap_time);
            if let Some(time) = me.current_sectors_s.get(index).and_then(lap_time) {
                done += time;
                let session = cars
                    .iter()
                    .filter_map(|c| c.best_sectors_s.get(index).and_then(lap_time))
                    .fold(f64::INFINITY, f64::min);
                let tone = if time <= session + 1e-6 {
                    SectorTone::SessionBest
                } else if best.is_some_and(|b| time <= b + 1e-6) {
                    SectorTone::PersonalBest
                } else {
                    SectorTone::Slower
                };
                Sector::Done(tone, best.map(|b| time - b))
            } else if Some(index) == current {
                Sector::Live(
                    elapsed
                        .zip(best)
                        .map(|(e, b)| ((e - done) / b).clamp(0.0, 1.0)),
                )
            } else {
                Sector::Pending
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CarId, Class, ClassId, Flag, Player, State, Stint};

    fn car(id: u32, position: u32, best: f64, sectors: [f64; 3]) -> Car {
        Car {
            id: CarId(id),
            class: Some(Class {
                id: ClassId(1),
                name: "Hypercar".into(),
            }),
            class_position: Quality::Reliable(position),
            best_lap_s: Quality::Reliable(best),
            best_sectors_s: sectors.map(Quality::Reliable).to_vec(),
            ..Car::default()
        }
    }

    /// Vas 0.214 más rápido que tu mejor 3:27.904 en el S2 de la vuelta 15.
    fn snapshot() -> Snapshot {
        let leader = car(6, 1, 207.046, [68.9, 72.1, 66.0]);
        let mut me = car(50, 3, 207.904, [69.1, 72.6, 66.2]);
        me.laps = Quality::Reliable(14);
        me.current_sector = Quality::Reliable(1);
        me.current_sectors_s = vec![Quality::Reliable(68.98)];
        me.lap_elapsed_s = Quality::Reliable(68.98 + 43.56);
        me.estimated_lap_s = Quality::Estimated(207.690);
        Snapshot {
            state: State {
                source_state: SourceState::Live,
                cars: vec![leader, me],
                player: Some(Player {
                    car: CarId(50),
                    delta_best_s: Quality::Reliable(-0.214),
                    delta_optimal_s: Quality::Estimated(0.382),
                    lap_invalid: Quality::Reliable(false),
                    stint: Stint {
                        laps: Quality::Reliable(5),
                        ..Stint::default()
                    },
                    ..Player::default()
                }),
                ..State::default()
            },
            ..Snapshot::default()
        }
    }

    fn player(s: &mut Snapshot) -> &mut Player {
        s.state.player.as_mut().expect("jugador")
    }

    #[test]
    fn live_delta_predicts_the_lap_and_colours_the_sectors() {
        let board = project(&snapshot(), Reference::Best);
        assert_eq!(board.phase, Phase::Live);
        assert_eq!(board.delta_s, Some(-0.214));
        assert_eq!(board.reference_lap_s, Some(207.904));
        assert_eq!(board.predicted_s, Some(207.690), "predicción nativa");
        assert_eq!((board.lap, board.sector), (Some(15), Some(2)));
        let Sector::Done(tone, Some(delta)) = board.sectors[0] else {
            panic!("S1 completado");
        };
        // 68.98 no baja del 68.9 del líder, pero sí de tu 69.1.
        assert_eq!(tone, SectorTone::PersonalBest);
        assert!((delta + 0.12).abs() < 1e-9);
        let Sector::Live(Some(fill)) = board.sectors[1] else {
            panic!("S2 en curso");
        };
        assert!((fill - 43.56 / 72.6).abs() < 1e-9);
        assert_eq!(board.sectors[2], Sector::Pending);
    }

    #[test]
    fn references_use_their_own_delta_and_lap() {
        let optimal = project(&snapshot(), Reference::Optimal);
        assert_eq!(optimal.delta_s, Some(0.382));
        let sum = 69.1 + 72.6 + 66.2;
        assert!((optimal.reference_lap_s.expect("óptima") - sum).abs() < 1e-9);
        assert!((optimal.predicted_s.expect("predicha") - (sum + 0.382)).abs() < 1e-9);
        // Sin delta frente al líder publicado no se inventa: sin referencia.
        let leader = project(&snapshot(), Reference::Leader);
        assert_eq!(leader.reference_lap_s, Some(207.046));
        assert_eq!(leader.phase, Phase::NoReference);
    }

    #[test]
    fn pits_out_lap_fcy_invalid_and_waiting_pause_or_grey_the_delta() {
        let mut s = snapshot();
        s.state.cars[1].in_pits = Quality::Reliable(true);
        let board = project(&s, Reference::Best);
        assert_eq!(
            (board.phase, board.banner),
            (Phase::Paused(Pause::Pits), Some(Banner::InPits))
        );
        assert_eq!(board.predicted_s, None);
        let mut s = snapshot();
        player(&mut s).stint.laps = Quality::Reliable(0);
        assert_eq!(
            project(&s, Reference::Best).phase,
            Phase::Paused(Pause::OutLap)
        );
        let mut s = snapshot();
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert_eq!(
            project(&s, Reference::Best).phase,
            Phase::Paused(Pause::Fcy)
        );
        let mut s = snapshot();
        player(&mut s).lap_invalid = Quality::Reliable(true);
        assert_eq!(project(&s, Reference::Best).phase, Phase::Invalid);
        let mut s = snapshot();
        player(&mut s).delta_best_s = Quality::Unavailable;
        assert_eq!(project(&s, Reference::Best).phase, Phase::NoReference);
        let mut s = snapshot();
        s.state.source_state = SourceState::Waiting;
        assert!(!project(&s, Reference::Best).player_present);
    }
}
