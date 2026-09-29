//! Delta Eficiencia: comparación ya resuelta por el núcleo, nunca reconstruida aquí.

use crate::format::{self, Language, Preferences};
use crate::{Capability, Quality, SessionId, Snapshot};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reference {
    PersonalBest,
    SessionBest,
    PreviousLap,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
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

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub identity: (u64, SessionId, Option<crate::CarId>),
    pub status: Status,
    pub status_text: Option<&'static str>,
    pub requested_reference: Reference,
    pub reference_notice: Option<&'static str>,
    pub tone: Tone,
    pub delta_text: String,
    /// None significa sin dato, incluso cuando la barra vacía parece un cero.
    pub progress: Option<f32>,
    pub last_lap_text: String,
    pub best_lap_text: String,
    pub completed_lap: Option<u32>,
    pub best_label: &'static str,
    pub last_label: &'static str,
    best_lap_s: Option<f64>,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    project_reference(snapshot, prefs, Reference::PersonalBest)
}

/// El modelo solo representa la referencia personal. Otra petición no toma
/// prestado ese delta: se declara no disponible, como el builder productivo.
#[allow(clippy::cast_possible_truncation)] // Progreso finito acotado a [-1, 1].
pub fn project_reference(
    snapshot: &Snapshot,
    prefs: Preferences,
    reference: Reference,
) -> ViewModel {
    let state = &snapshot.state;
    let car = state.player_car();
    let delta = state.player.map(|p| p.delta_best_s).unwrap_or_default();
    let last = car.map(|c| c.last_lap_s).unwrap_or_default();
    let best = car.map(|c| c.best_lap_s).unwrap_or_default();
    // Stale conserva el valor y lo etiqueta; no se presenta como fresco.
    let seconds = (reference == Reference::PersonalBest)
        .then(|| displayed(delta))
        .flatten();
    let has_stale_value = (reference == Reference::PersonalBest
        && (matches!(delta, Quality::Stale(_))
            || state.capabilities.delta == Capability::WithData))
        || matches!(last, Quality::Stale(_))
        || matches!(best, Quality::Stale(_));
    let status = if has_stale_value {
        Status::Stale
    } else if seconds.is_some() {
        Status::Ready
    } else {
        Status::Missing
    };
    let status_text = match (status, prefs.language) {
        (Status::Ready, _) => None,
        (Status::Missing, Language::Es) => Some("SIN DATOS"),
        (Status::Missing, Language::En) => Some("NO DATA"),
        (Status::Stale, Language::Es) => Some("DATOS ANTIGUOS"),
        (Status::Stale, Language::En) => Some("STALE DATA"),
    };
    let reference_notice = match (reference, prefs.language) {
        (Reference::PersonalBest, _) => None,
        (Reference::SessionBest, Language::Es) => Some("Mejor de sesión: no disponible"),
        (Reference::SessionBest, Language::En) => Some("Session best: unavailable"),
        (Reference::PreviousLap, Language::Es) => Some("Vuelta anterior: no disponible"),
        (Reference::PreviousLap, Language::En) => Some("Previous lap: unavailable"),
    };
    ViewModel {
        identity: (
            snapshot.epoch,
            state.session.id,
            state.player.map(|p| p.car),
        ),
        status,
        status_text,
        requested_reference: reference,
        reference_notice,
        tone: match seconds {
            Some(s) if s < 0.0 => Tone::Gaining,
            Some(s) if s > 0.0 => Tone::Losing,
            _ => Tone::Neutral,
        },
        delta_text: delta_text(seconds),
        progress: seconds.map(|s| (s / 1.5).clamp(-1.0, 1.0) as f32),
        last_lap_text: format::lap_time(displayed(last)),
        best_lap_text: format::lap_time(displayed(best)),
        completed_lap: car.and_then(|c| c.laps.current().copied()),
        best_label: if prefs.language == Language::Es {
            "MEJOR PERSONAL"
        } else {
            "PERSONAL BEST"
        },
        last_label: if prefs.language == Language::Es {
            "ÚLT. VUELTA"
        } else {
            "LAST LAP"
        },
        best_lap_s: displayed(best).filter(|s| *s > 0.0),
    }
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
    let scaled = s.abs() * 1000.0;
    let magnitude = if scaled.fract() == 0.5 && scaled / 1000.0 == s.abs() {
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

pub fn event(prev: &ViewModel, next: &ViewModel) -> Option<Event> {
    if prev.identity != next.identity
        || prev.requested_reference != next.requested_reference
        || prev.status != Status::Ready
        || next.status != Status::Ready
    {
        return None;
    }
    if let (Some(a), Some(b)) = (prev.best_lap_s, next.best_lap_s)
        && b < a
        && prev.best_lap_text != next.best_lap_text
    {
        return Some(Event::PersonalBest);
    }
    let completed = match (prev.completed_lap, next.completed_lap) {
        (Some(a), Some(b)) => b > a,
        _ => prev.last_lap_text != next.last_lap_text && prev.last_lap_text != format::PLACEHOLDER,
    };
    (completed && next.last_lap_text != format::PLACEHOLDER).then_some(Event::LapCompleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Car, CarId, Player};

    fn snapshot(delta: Quality<f64>) -> Snapshot {
        let mut s = Snapshot::default();
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
