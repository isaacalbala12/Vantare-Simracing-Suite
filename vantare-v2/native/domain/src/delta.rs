//! Delta común: hechos, calidad y referencia únicos; el Look solo decide presentación.
use crate::format::{self, Language, Preferences};
use crate::{Car, FlagKind, FlagScope, Quality, Snapshot, SourceState};
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Reference {
    #[default]
    PersonalBest,
    Optimal,
    Leader,
    SessionBest,
    PreviousLap,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
    Disconnected,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Neutral,
    Gaining,
    Losing,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    LapCompleted,
    PersonalBest,
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
    pub identity: (u64, crate::SessionId, Option<crate::CarId>),
    pub status: Status,
    pub tone: Tone,
    pub progress: Option<f32>,
    pub completed_lap: Option<u32>,
    pub last_lap: Quality<f64>,
    pub best_lap: Quality<f64>,
    pub delta: Quality<f64>,
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
fn status(
    source: SourceState,
    reference: Reference,
    capability: crate::Capability,
    values: (Quality<f64>, Quality<f64>, Quality<f64>),
) -> Status {
    let (delta, last, best) = values;
    let has_old_values = matches!(delta, Quality::Stale(_))
        || (reference == Reference::PersonalBest && capability == crate::Capability::WithData)
        || matches!(last, Quality::Stale(_))
        || matches!(best, Quality::Stale(_));
    if matches!(source, SourceState::Waiting | SourceState::Lost) {
        Status::Disconnected
    } else if source == SourceState::Stale || has_old_values {
        Status::Stale
    } else if displayed(delta).is_some() {
        Status::Ready
    } else {
        Status::Missing
    }
}
pub fn project(snapshot: &Snapshot, prefs: Preferences) -> Board {
    project_reference(snapshot, prefs, Reference::PersonalBest)
}
#[allow(clippy::cast_possible_truncation)] // Progreso finito acotado.
pub fn project_reference(snapshot: &Snapshot, _prefs: Preferences, reference: Reference) -> Board {
    let state = &snapshot.state;
    let live = state.source_state == SourceState::Live;
    let available = !matches!(state.source_state, SourceState::Waiting | SourceState::Lost);
    let observed = state.player_car().filter(|_| available);
    let car = observed.filter(|_| live);
    let player = state.player.as_ref().filter(|_| car.is_some());

    let delta_s = player.and_then(|p| match reference {
        Reference::PersonalBest => value(&p.delta_best_s),
        Reference::Optimal => value(&p.delta_optimal_s),
        Reference::Leader => value(&p.delta_leader_s),
        Reference::SessionBest | Reference::PreviousLap => None,
    });
    let reference_lap_s = car.and_then(|me| match reference {
        Reference::PersonalBest => lap_time(&me.best_lap_s),
        Reference::Optimal => optimal(me),
        Reference::Leader => class_leader(&state.cars, me).and_then(|l| lap_time(&l.best_lap_s)),
        Reference::SessionBest | Reference::PreviousLap => None,
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
    } else if delta_s.is_none()
        || (reference_lap_s.is_none() && reference != Reference::PersonalBest)
    {
        Phase::NoReference
    } else if invalid {
        Phase::Invalid
    } else {
        Phase::Live
    };

    let predicted_s = match (reference, phase) {
        (_, Phase::Live) => car
            .filter(|_| reference == Reference::PersonalBest)
            .and_then(|c| lap_time(&c.estimated_lap_s))
            .or_else(|| reference_lap_s.zip(delta_s).map(|(r, d)| r + d)),
        _ => None,
    };

    let delta =
        state
            .player
            .filter(|_| available)
            .map_or(Quality::Unavailable, |p| match reference {
                Reference::PersonalBest => p.delta_best_s,
                Reference::Optimal => p.delta_optimal_s,
                Reference::Leader => p.delta_leader_s,
                Reference::SessionBest | Reference::PreviousLap => Quality::Unavailable,
            });
    let last = observed.map_or(Quality::Unavailable, |c| c.last_lap_s);
    let best = observed.map_or(Quality::Unavailable, |c| c.best_lap_s);
    let seconds = displayed(delta);
    let status = status(
        state.source_state,
        reference,
        state.capabilities.delta,
        (delta, last, best),
    );
    Board {
        identity: (
            snapshot.epoch,
            state.session.id,
            state.player.map(|p| p.car),
        ),
        status,
        tone: match seconds {
            Some(s) if s < 0.0 => Tone::Gaining,
            Some(s) if s > 0.0 => Tone::Losing,
            _ => Tone::Neutral,
        },
        progress: seconds.map(|s| (s / 1.5).clamp(-1.0, 1.0) as f32),
        completed_lap: observed.and_then(|c| c.laps.current().copied()),
        delta,
        last_lap: last,
        best_lap: best,
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

fn displayed(value: Quality<f64>) -> Option<f64> {
    match value {
        Quality::Reliable(s) | Quality::Estimated(s) | Quality::Stale(s) if s.is_finite() => {
            Some(s)
        }
        _ => None,
    }
}

#[allow(clippy::float_cmp)] // La igualdad exacta decide los empates de toFixed.
fn delta_text(seconds: Option<f64>) -> String {
    let Some(s) = seconds else {
        return format::PLACEHOLDER.into();
    };
    // El formateador compartido aún no expone to_fixed; mismo empate JS a 3 decimales.
    // Exact binary ties at three decimals are odd multiples of 1/16.
    let scaled = s.abs() * 1000.0;
    let magnitude = if s.abs().rem_euclid(0.125) == 0.0625 {
        (scaled.floor() + 1.0) / 1000.0
    } else {
        s.abs()
    };
    let sign = if s > 0.0 {
        "+"
    } else if s < 0.0 {
        "-"
    } else {
        ""
    };
    format!("{sign}{magnitude:.3}")
}

impl Board {
    pub fn delta_text(&self) -> String {
        delta_text(displayed(self.delta))
    }
    pub fn last_text(&self) -> String {
        format::lap_time(displayed(self.last_lap))
    }
    pub fn best_text(&self) -> String {
        format::lap_time(displayed(self.best_lap))
    }
    pub fn status_text(&self, language: Language) -> Option<&'static str> {
        match (self.status, language) {
            (Status::Ready, _) => None,
            (Status::Missing, Language::Es) => Some("SIN DATOS"),
            (Status::Missing, Language::En) => Some("NO DATA"),
            (Status::Stale, Language::Es) => Some("DATOS ANTIGUOS"),
            (Status::Stale, Language::En) => Some("DATA OUT OF DATE"),
            (Status::Disconnected, Language::Es) => Some("DESCONECTADO"),
            (Status::Disconnected, Language::En) => Some("DISCONNECTED"),
        }
    }
    pub fn reference_notice(&self, language: Language) -> Option<&'static str> {
        match (self.reference, language) {
            (Reference::SessionBest, Language::Es) => Some("Mejor de sesión: no disponible"),
            (Reference::SessionBest, Language::En) => Some("Session best: unavailable"),
            (Reference::PreviousLap, Language::Es) => Some("Vuelta anterior: no disponible"),
            (Reference::PreviousLap, Language::En) => Some("Previous lap: unavailable"),
            _ => None,
        }
    }
}
pub fn event(prev: &Board, next: &Board) -> Option<Event> {
    if prev.identity != next.identity
        || prev.reference != next.reference
        || prev.status != Status::Ready
        || next.status != Status::Ready
    {
        return None;
    }
    if let (Some(a), Some(b)) = (
        displayed(prev.best_lap).filter(|s| *s > 0.0),
        displayed(next.best_lap).filter(|s| *s > 0.0),
    ) && b < a
        && prev.best_text() != next.best_text()
    {
        return Some(Event::PersonalBest);
    }
    let completed = match (prev.completed_lap, next.completed_lap) {
        (Some(a), Some(b)) => b > a,
        _ => prev.last_text() != next.last_text() && prev.last_text() != format::PLACEHOLDER,
    };
    (completed && next.last_text() != format::PLACEHOLDER).then_some(Event::LapCompleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Formatted {
        board: Board,
        delta_text: String,
        last_lap_text: String,
        best_lap_text: String,
        reference_notice: Option<&'static str>,
    }
    impl std::ops::Deref for Formatted {
        type Target = Board;
        fn deref(&self) -> &Board {
            &self.board
        }
    }
    fn project(snapshot: &Snapshot, prefs: Preferences) -> Formatted {
        project_reference(snapshot, prefs, Reference::PersonalBest)
    }
    fn project_reference(
        snapshot: &Snapshot,
        prefs: Preferences,
        reference: Reference,
    ) -> Formatted {
        let board = super::project_reference(snapshot, prefs, reference);
        Formatted {
            delta_text: board.delta_text(),
            last_lap_text: board.last_text(),
            best_lap_text: board.best_text(),
            reference_notice: board.reference_notice(prefs.language),
            board,
        }
    }

    use crate::{Car, CarId, Player};

    fn snapshot(delta: Quality<f64>) -> Snapshot {
        let mut s = Snapshot::default();
        s.state.source_state = SourceState::Live;
        s.state.player = Some(Player {
            car: CarId(7),
            delta_best_s: delta,
            ..Player::default()
        });
        s.state.cars.push(Car {
            id: CarId(7),
            laps: Quality::Reliable(127),
            last_lap_s: Quality::Reliable(91.234),
            best_lap_s: Quality::Reliable(90.964),
            ..Car::default()
        });
        s
    }

    #[test]
    fn values_formats_and_clamped_scale() {
        for (s, text, tone, progress) in [
            (0.214, "+0.214", Tone::Losing, 0.214_f32 / 1.5),
            (-0.238, "-0.238", Tone::Gaining, -0.238_f32 / 1.5),
            (0.0, "0.000", Tone::Neutral, 0.0),
            (-0.0, "0.000", Tone::Neutral, 0.0),
            (4.2, "+4.200", Tone::Losing, 1.0),
            (-4.2, "-4.200", Tone::Gaining, -1.0),
            (0.0625, "+0.063", Tone::Losing, 0.0625_f32 / 1.5),
            (-0.0001, "-0.000", Tone::Gaining, -0.0001_f32 / 1.5),
        ] {
            let vm = project(&snapshot(Quality::Reliable(s)), Preferences::default());
            assert_eq!(
                (&*vm.delta_text, vm.tone, vm.status),
                (text, tone, Status::Ready)
            );
            assert!(vm.progress.is_some_and(|p| (p - progress).abs() < 1e-6));
            assert_eq!(vm.last_lap_text, "1:31.234");
            assert_eq!(vm.best_lap_text, "1:30.964");
        }
    }

    #[test]
    fn quality_never_invents_a_zero_and_stale_is_disclosed() {
        for (q, status, text) in [
            (Quality::Unavailable, Status::Missing, "—"),
            (Quality::Reliable(f64::NAN), Status::Missing, "—"),
            (Quality::Estimated(f64::INFINITY), Status::Missing, "—"),
            (Quality::Reliable(f64::NEG_INFINITY), Status::Missing, "—"),
            (Quality::Stale(0.2), Status::Stale, "+0.200"),
            (Quality::Estimated(-0.2), Status::Ready, "-0.200"),
        ] {
            let vm = project(&snapshot(q), Preferences::default());
            assert_eq!((vm.status, &*vm.delta_text), (status, text));
            assert_eq!(vm.progress.is_none(), text == "—");
        }
        let vm = project(&Snapshot::default(), Preferences::default());
        assert_eq!(
            (
                vm.delta_text.as_str(),
                vm.last_lap_text.as_str(),
                vm.best_lap_text.as_str()
            ),
            ("—", "—", "—")
        );
        assert_eq!(vm.completed_lap, None);
    }

    #[test]
    fn unsupported_references_are_not_personal_best_fallbacks() {
        for reference in [Reference::SessionBest, Reference::PreviousLap] {
            for language in [Language::Es, Language::En] {
                let vm = project_reference(
                    &snapshot(Quality::Reliable(0.214)),
                    Preferences {
                        language,
                        ..Preferences::default()
                    },
                    reference,
                );
                assert_eq!(vm.status, Status::Missing);
                assert_eq!(vm.delta_text, "—");
                assert!(vm.reference_notice.is_some());
                assert!(vm.progress.is_none());
            }
        }
    }

    #[test]
    fn player_identity_and_lap_quality_are_preserved() {
        for (quality, expected, status) in [
            (Quality::Unavailable, "—", Status::Ready),
            (Quality::Reliable(0.0), "—", Status::Ready),
            (Quality::Estimated(-1.0), "—", Status::Ready),
            (Quality::Reliable(f64::NAN), "—", Status::Ready),
            (Quality::Stale(91.234), "1:31.234", Status::Stale),
        ] {
            let mut s = snapshot(Quality::Reliable(0.214));
            s.state.cars[0].last_lap_s = quality;
            s.state.cars[0].laps = Quality::Unavailable;
            let vm = project(&s, Preferences::default());
            assert_eq!((vm.last_lap_text.as_str(), vm.status), (expected, status));
            assert_eq!(vm.completed_lap, None);
        }
        let mut s = snapshot(Quality::Reliable(0.214));
        s.state.cars[0].id = CarId(8);
        let vm = project(&s, Preferences::default());
        assert_eq!(
            (vm.last_lap_text.as_str(), vm.best_lap_text.as_str()),
            ("—", "—")
        );
        assert_eq!(vm.delta_text, "+0.214");
    }

    #[test]
    fn identity_quality_and_lap_events() {
        let s = snapshot(Quality::Reliable(0.214));
        let prev = project(&s, Preferences::default());
        for (lap, last, best, expected) in [
            (127, 91.234, 90.964, None),
            (128, 91.234, 90.964, Some(Event::LapCompleted)),
            (128, 90.7, 90.7, Some(Event::PersonalBest)),
            (128, 92.0, 91.1, Some(Event::LapCompleted)),
            (128, 0.0, 90.964, None),
        ] {
            let mut next = s.clone();
            next.state.cars[0].laps = Quality::Reliable(lap);
            next.state.cars[0].last_lap_s = Quality::Reliable(last);
            next.state.cars[0].best_lap_s = Quality::Reliable(best);
            assert_eq!(
                event(&prev, &project(&next, Preferences::default())),
                expected
            );
        }
        let mut next = s.clone();
        next.state.cars[0].laps = Quality::Reliable(128);
        for reset in 0..3 {
            let mut reset_snapshot = next.clone();
            match reset {
                0 => reset_snapshot.epoch += 1,
                1 => reset_snapshot.state.session.id.0 += 1,
                _ => reset_snapshot.state.player = None,
            }
            assert_eq!(
                event(&prev, &project(&reset_snapshot, Preferences::default())),
                None
            );
        }
        next.state
            .player
            .as_mut()
            .expect("player fixture")
            .delta_best_s = Quality::Stale(0.214);
        assert_eq!(event(&prev, &project(&next, Preferences::default())), None);
    }
}

#[cfg(test)]
mod supplementary_tests {
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
        let board = project_reference(&snapshot(), Preferences::default(), Reference::PersonalBest);
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
        let optimal = project_reference(&snapshot(), Preferences::default(), Reference::Optimal);
        assert_eq!(optimal.delta_s, Some(0.382));
        let sum = 69.1 + 72.6 + 66.2;
        assert!((optimal.reference_lap_s.expect("óptima") - sum).abs() < 1e-9);
        assert!((optimal.predicted_s.expect("predicha") - (sum + 0.382)).abs() < 1e-9);
        // Sin delta frente al líder publicado no se inventa: sin referencia.
        let leader = project_reference(&snapshot(), Preferences::default(), Reference::Leader);
        assert_eq!(leader.reference_lap_s, Some(207.046));
        assert_eq!(leader.phase, Phase::NoReference);
    }

    #[test]
    fn pits_out_lap_fcy_invalid_and_waiting_pause_or_grey_the_delta() {
        let mut s = snapshot();
        s.state.cars[1].in_pits = Quality::Reliable(true);
        let board = project_reference(&s, Preferences::default(), Reference::PersonalBest);
        assert_eq!(
            (board.phase, board.banner),
            (Phase::Paused(Pause::Pits), Some(Banner::InPits))
        );
        assert_eq!(board.predicted_s, None);
        let mut s = snapshot();
        player(&mut s).stint.laps = Quality::Reliable(0);
        assert_eq!(
            project_reference(&s, Preferences::default(), Reference::PersonalBest).phase,
            Phase::Paused(Pause::OutLap)
        );
        let mut s = snapshot();
        s.state.flags = Quality::Reliable(vec![Flag {
            kind: FlagKind::Yellow,
            scope: FlagScope::Session,
        }]);
        assert_eq!(
            project_reference(&s, Preferences::default(), Reference::PersonalBest).phase,
            Phase::Paused(Pause::Fcy)
        );
        let mut s = snapshot();
        player(&mut s).lap_invalid = Quality::Reliable(true);
        assert_eq!(
            project_reference(&s, Preferences::default(), Reference::PersonalBest).phase,
            Phase::Invalid
        );
        let mut s = snapshot();
        player(&mut s).delta_best_s = Quality::Unavailable;
        assert_eq!(
            project_reference(&s, Preferences::default(), Reference::PersonalBest).phase,
            Phase::NoReference
        );
        let mut s = snapshot();
        s.state.source_state = SourceState::Waiting;
        assert!(
            !project_reference(&s, Preferences::default(), Reference::PersonalBest).player_present
        );
    }
}
