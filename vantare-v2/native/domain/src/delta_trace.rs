//! Historial corto del widget construido solo con fotos observadas.
use crate::{CarId, SessionId, SourceState};
use std::collections::VecDeque;
use std::time::Duration;

use crate::Snapshot;
use crate::format::{self, Language, Preferences};

const MAX_SAMPLES: usize = 120;
const WINDOW: Duration = Duration::from_secs(4);
const CADENCE: Duration = Duration::from_millis(50);
// El silencio supera el plazo de frescura del nucleo (500 ms).
const GAP: Duration = Duration::from_millis(500);

type Identity = (u64, SessionId, Option<CarId>, Option<u32>, Option<u64>);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sample {
    pub at: Duration,
    pub delta_seconds: Option<f64>,
    /// Comienza otro tramo, sin interpolar a traves de un hueco.
    pub break_before: bool,
}

#[derive(Clone, Debug, Default)]
pub struct Trace {
    samples: VecDeque<Sample>,
    identity: Option<Identity>,
    last_seen: Option<(u64, Duration)>,
    cut: bool,
}

impl Trace {
    pub fn samples(&self) -> &VecDeque<Sample> {
        &self.samples
    }
    pub fn push(&mut self, snapshot: &Snapshot) -> bool {
        let car = snapshot.state.player_car();
        let lap = car.and_then(|c| match c.laps {
            crate::Quality::Reliable(v)
            | crate::Quality::Estimated(v)
            | crate::Quality::Stale(v) => Some(v),
            crate::Quality::Unavailable => None,
        });
        // El DTO no lleva ID de referencia: la mejor vuelta propia es su senal.
        let reference = car
            .and_then(|c| displayed(&c.best_lap_s))
            .filter(|v| *v > 0.0)
            .map(f64::to_bits);
        let identity = (
            snapshot.epoch,
            snapshot.state.session.id,
            snapshot.state.player.map(|p| p.car),
            lap,
            reference,
        );
        let mut changed = false;
        if self.identity != Some(identity) {
            changed = !self.samples.is_empty();
            self.samples.clear();
            self.identity = Some(identity);
            self.last_seen = None;
            self.cut = true;
        }
        if snapshot.state.source_state != SourceState::Live {
            self.cut = true;
            if matches!(
                snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            ) {
                changed |= !self.samples.is_empty();
                self.samples.clear();
            }
            return changed;
        }
        let at = snapshot.origin.received_at;
        if let Some((sequence, previous)) = self.last_seen {
            if snapshot.sequence <= sequence {
                return changed;
            }
            self.cut |= sequence.checked_add(1) != Some(snapshot.sequence)
                || at.saturating_sub(previous) > GAP;
            if at < previous {
                changed |= !self.samples.is_empty();
                self.samples.clear();
                self.cut = true;
            }
        }
        self.last_seen = Some((snapshot.sequence, at));
        let value = snapshot
            .state
            .player
            .and_then(|p| p.delta_best_s.current().copied())
            .filter(|v| v.is_finite());
        self.cut |= value.is_none();
        if self
            .samples
            .back()
            .is_some_and(|p| at.saturating_sub(p.at) < CADENCE)
            || (self.samples.is_empty() && value.is_none())
        {
            return changed;
        }
        self.samples.push_back(Sample {
            at,
            delta_seconds: value,
            break_before: self.cut,
        });
        self.cut = value.is_none();
        while self.samples.len() > MAX_SAMPLES
            || self
                .samples
                .front()
                .is_some_and(|p| at.saturating_sub(p.at) > WINDOW)
        {
            self.samples.pop_front();
        }
        true
    }
}

/// Solo los valores dibujados: revisiones y cambios bajo el redondeo no repintan.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ViewModel {
    pub current_text: String,
    pub trend_text: &'static str,
    pub trend: Trend,
    pub status_text: Option<&'static str>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trend {
    Gaining,
    Losing,
    Stable,
    Unknown,
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let current = snapshot
        .state
        .player
        .filter(|_| {
            !matches!(
                snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            )
        })
        .and_then(|player| displayed(&player.delta_best_s));
    ViewModel {
        current_text: delta_text(current),
        trend_text: match prefs.language {
            Language::Es => "DESCONOCIDO",
            Language::En => "UNKNOWN",
        },
        trend: Trend::Unknown,
        status_text: match (snapshot.state.source_state, prefs.language) {
            (SourceState::Live, _) => None,
            (SourceState::Waiting, Language::Es) => Some("SIN DATOS"),
            (SourceState::Waiting, Language::En) => Some("NO DATA"),
            (SourceState::Stale, Language::Es) => Some("DATOS ANTIGUOS"),
            (SourceState::Stale, Language::En) => Some("DATA OUT OF DATE"),
            (SourceState::Lost, Language::Es) => Some("DESCONECTADO"),
            (SourceState::Lost, Language::En) => Some("DISCONNECTED"),
        },
    }
}

fn displayed(q: &crate::Quality<f64>) -> Option<f64> {
    match q {
        crate::Quality::Reliable(v) | crate::Quality::Estimated(v) | crate::Quality::Stale(v)
            if v.is_finite() =>
        {
            Some(*v)
        }
        _ => None,
    }
}

impl Trace {
    pub fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = project(snapshot, prefs);
        if matches!(
            snapshot.state.source_state,
            SourceState::Waiting | SourceState::Lost
        ) {
            return vm;
        }
        // Una ausencia actual no hereda el ultimo valor conocido como fresco.
        if snapshot
            .state
            .player
            .and_then(|p| displayed(&p.delta_best_s))
            .is_some()
            && let Some(value) = self.samples.back().and_then(|p| p.delta_seconds)
        {
            vm.current_text = delta_text(Some(value));
        }
        let recent: Vec<_> = self.samples.iter().rev().take(20).collect();
        if !self.cut
            && recent.len() == 20
            && recent.iter().take(19).all(|p| !p.break_before)
            && recent.iter().all(|p| p.delta_seconds.is_some())
        {
            let mean = |points: &[&Sample]| {
                // El productivo suma de antigua a reciente, también en los empates.
                points
                    .iter()
                    .rev()
                    .filter_map(|p| p.delta_seconds)
                    .sum::<f64>()
                    / 10.0
            };
            let current = mean(&recent[..10]);
            let previous = mean(&recent[10..]);
            vm.trend = if current < previous - 0.01 {
                Trend::Gaining
            } else if current > previous + 0.01 {
                Trend::Losing
            } else {
                Trend::Stable
            };
        }
        vm.trend_text = match (vm.trend, prefs.language) {
            (Trend::Gaining, Language::Es) => "GANANDO",
            (Trend::Gaining, Language::En) => "GAINING",
            (Trend::Losing, Language::Es) => "PERDIENDO",
            (Trend::Losing, Language::En) => "LOSING",
            (Trend::Stable, Language::Es) => "ESTABLE",
            (Trend::Stable, Language::En) => "STABLE",
            (Trend::Unknown, Language::Es) => "DESCONOCIDO",
            (Trend::Unknown, Language::En) => "UNKNOWN",
        };
        vm
    }
}

/// El kit `format` no tiene delta con signo, tres decimales y cero válido.
/// Mantener aquí hasta compartirlo con otro consumidor; empate como JS toFixed.
#[allow(clippy::float_cmp)] // La igualdad exacta distingue el empate de toFixed.
fn delta_text(seconds: Option<f64>) -> String {
    let Some(seconds) = seconds.filter(|value| value.is_finite()) else {
        return format::PLACEHOLDER.into();
    };
    let magnitude = seconds.abs();
    let scaled = magnitude * 1000.0;
    let rounded = if scaled.fract() == 0.5 && scaled / 1000.0 == magnitude {
        (scaled.floor() + 1.0) / 1000.0
    } else {
        magnitude
    };
    format!("{}{rounded:.3}", if seconds < 0.0 { "-" } else { "+" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Player, Quality, Source, State};

    #[test]
    fn projects_quality_without_inventing_a_value_or_a_trend() {
        for (quality, expected) in [
            (Quality::Reliable(0.214), "+0.214"),
            (Quality::Estimated(-0.08), "-0.080"),
            (Quality::Reliable(0.0), "+0.000"),
            (Quality::Stale(0.214), "+0.214"),
            (Quality::Unavailable, format::PLACEHOLDER),
            (Quality::Reliable(f64::NAN), format::PLACEHOLDER),
            (Quality::Estimated(f64::INFINITY), format::PLACEHOLDER),
        ] {
            let snapshot = Snapshot {
                state: State {
                    source_state: SourceState::Live,
                    player: Some(Player {
                        delta_best_s: quality,
                        ..Player::default()
                    }),
                    ..State::default()
                },
                ..Snapshot::default()
            };
            for (language, trend) in [(Language::Es, "DESCONOCIDO"), (Language::En, "UNKNOWN")] {
                let vm = project(
                    &snapshot,
                    Preferences {
                        language,
                        ..Preferences::default()
                    },
                );
                assert_eq!(vm.current_text, expected, "{quality:?}");
                assert_eq!(vm.trend_text, trend, "no hay historia canónica");
            }
        }
    }

    #[test]
    fn delta_format_matches_the_renderer_including_zero_and_ties() {
        for (value, expected) in [
            (0.256_957_161_625_497_4, "+0.257"),
            (-0.08, "-0.080"),
            (-0.0, "+0.000"),
            (-0.000_1, "-0.000"),
            (0.062_5, "+0.063"),
            (-0.062_5, "-0.063"),
            (f64::NEG_INFINITY, format::PLACEHOLDER),
        ] {
            assert_eq!(delta_text(Some(value)), expected);
        }
        assert_eq!(delta_text(None), format::PLACEHOLDER);
    }

    #[test]
    fn no_player_is_empty_and_revisions_do_not_create_history() {
        let mut snapshot = Snapshot::default();
        let expected = project(&snapshot, Preferences::default());
        assert_eq!(expected.current_text, format::PLACEHOLDER);
        for simulator in ["lmu", "acc", "unknown"] {
            snapshot.origin.source = Source {
                simulator,
                ..Source::default()
            };
            snapshot.epoch += 1;
            snapshot.sequence += 1;
            assert_eq!(project(&snapshot, Preferences::default()), expected);
        }
    }
}

#[cfg(test)]
mod trace_tests {
    use super::*;
    use crate::{Player, Quality, State};

    #[test]
    fn trend_at_the_threshold_matches_product_comparisons() {
        let mut trace = Trace::default();
        let mut s = sample(1, 0, Quality::Reliable(1.0));
        for i in 0..20 {
            s = sample(
                i + 1,
                i * 50,
                Quality::Reliable(if i < 10 { 1.0 } else { 0.99 }),
            );
            trace.push(&s);
        }
        assert_eq!(
            trace.project(&s, Preferences::default()).trend,
            Trend::Stable
        );
    }

    #[test]
    fn lap_and_reference_changes_restart_the_trace() {
        let mut trace = Trace::default();
        let mut s = sample(1, 0, Quality::Reliable(0.5));
        s.state.cars.push(crate::Car {
            id: crate::CarId(0),
            laps: Quality::Reliable(2),
            best_lap_s: Quality::Reliable(90.0),
            ..crate::Car::default()
        });
        trace.push(&s);
        s.sequence = 2;
        s.origin.received_at = CADENCE;
        trace.push(&s);
        s.state.cars[0].laps = Quality::Reliable(3);
        assert!(trace.push(&s));
        assert_eq!(trace.samples().len(), 1);
        s.sequence = 3;
        s.origin.received_at += CADENCE;
        trace.push(&s);
        s.state.cars[0].best_lap_s = Quality::Reliable(89.0);
        assert!(trace.push(&s));
        assert_eq!(trace.samples().len(), 1);
        s.state.source_state = SourceState::Stale;
        s.state.cars[0].laps = Quality::Stale(3);
        s.state.cars[0].best_lap_s = Quality::Stale(89.0);
        assert!(!trace.push(&s));
        assert_eq!(trace.samples().len(), 1);
    }

    #[test]
    fn trend_compares_two_contiguous_windows_and_never_crosses_a_cut() {
        for (slope, trend) in [
            (-0.01, Trend::Gaining),
            (0.01, Trend::Losing),
            (0.0, Trend::Stable),
        ] {
            let mut trace = Trace::default();
            let mut s = sample(1, 0, Quality::Reliable(0.0));
            for i in 0_u32..20 {
                s = sample(
                    u64::from(i) + 1,
                    u64::from(i) * 50,
                    Quality::Reliable(f64::from(i) * slope),
                );
                trace.push(&s);
            }
            assert_eq!(trace.project(&s, Preferences::default()).trend, trend);
            s = sample(22, 1000, Quality::Reliable(0.0));
            trace.push(&s);
            assert_eq!(
                trace.project(&s, Preferences::default()).trend,
                Trend::Unknown
            );
            s = sample(23, 1050, Quality::Unavailable);
            trace.push(&s);
            assert_eq!(
                trace.project(&s, Preferences::default()).current_text,
                format::PLACEHOLDER
            );
        }
    }
    fn sample(i: u64, ms: u64, value: Quality<f64>) -> Snapshot {
        let player = Player {
            delta_best_s: value,
            ..Player::default()
        };
        let mut snapshot = Snapshot {
            sequence: i,
            state: State {
                source_state: SourceState::Live,
                player: Some(player),
                ..State::default()
            },
            ..Snapshot::default()
        };
        snapshot.origin.received_at = Duration::from_millis(ms);
        snapshot
    }
    #[test]
    fn bounded_window_and_cadence_ignore_duplicates() {
        let mut trace = Trace::default();
        for i in 0..200 {
            let s = sample(
                i + 1,
                i * u64::try_from(CADENCE.as_millis()).expect("cadencia"),
                Quality::Reliable(0.5),
            );
            assert!(trace.push(&s));
            assert!(!trace.push(&s));
        }
        assert_eq!(trace.samples().len(), 81);
        let last = trace.samples().back().expect("last").at;
        assert!(
            trace
                .samples()
                .iter()
                .all(|p| last.saturating_sub(p.at) <= WINDOW)
        );
        let s = sample(
            201,
            u64::try_from(last.as_millis()).expect("instante") + 1,
            Quality::Reliable(0.6),
        );
        assert!(!trace.push(&s));
        assert!(!trace.push(&sample(199, 0, Quality::Reliable(0.2))));
    }
    #[test]
    fn epoch_session_and_car_reset_before_sampling() {
        let mut trace = Trace::default();
        let mut s = sample(1, 0, Quality::Reliable(0.5));
        trace.push(&s);
        for change in 0..3 {
            s.sequence += 1;
            s.origin.received_at += CADENCE;
            trace.push(&s);
            match change {
                0 => s.epoch += 1,
                1 => s.state.session.id.0 += 1,
                _ => s.state.player.as_mut().expect("player").car.0 += 1,
            }
            assert!(trace.push(&s));
            assert_eq!(trace.samples().len(), 1);
            assert!(trace.samples()[0].break_before);
        }
        s.state.player = None;
        assert!(trace.push(&s));
        assert!(trace.samples().is_empty());
    }
    #[test]
    fn absence_stale_and_gaps_never_join_or_become_zero() {
        let mut trace = Trace::default();
        let step = u64::try_from(CADENCE.as_millis()).expect("cadencia");
        for (i, q) in [
            Quality::Reliable(0.0),
            Quality::Unavailable,
            Quality::Reliable(0.5),
            Quality::Reliable(f64::NAN),
            Quality::Stale(0.5),
            Quality::Estimated(0.5),
        ]
        .into_iter()
        .enumerate()
        {
            trace.push(&sample(i as u64 + 1, i as u64 * step, q));
        }
        assert_eq!(trace.samples()[0].delta_seconds, Some(0.0));
        for i in [1, 3, 4] {
            assert_eq!(trace.samples()[i].delta_seconds, None);
        }
        assert!(trace.samples()[2].break_before);
        assert!(trace.samples()[5].break_before);
        trace.push(&sample(9, 6 * step, Quality::Reliable(0.5)));
        assert!(trace.samples().back().expect("gap").break_before);
        trace.push(&sample(10, 6 * step + 501, Quality::Reliable(0.5)));
        assert!(trace.samples().back().expect("time gap").break_before);
        let mut stale = sample(11, 6 * step + 502, Quality::Reliable(0.5));
        stale.state.source_state = SourceState::Stale;
        let len = trace.samples().len();
        assert!(!trace.push(&stale));
        assert_eq!(trace.samples().len(), len);
        trace.push(&sample(12, 6 * step + 551, Quality::Reliable(0.5)));
        assert!(trace.samples().back().expect("resume").break_before);
        stale.state.source_state = SourceState::Lost;
        assert!(trace.push(&stale));
        assert!(trace.samples().is_empty());
    }
    #[test]
    fn absence_between_cadenced_samples_and_clock_rollback_cut() {
        let mut trace = Trace::default();
        trace.push(&sample(1, 1000, Quality::Reliable(0.5)));
        assert!(!trace.push(&sample(2, 1001, Quality::Unavailable)));
        trace.push(&sample(3, 1100, Quality::Reliable(0.5)));
        assert!(trace.samples().back().expect("cut").break_before);
        trace.push(&sample(4, 0, Quality::Reliable(0.5)));
        assert_eq!(trace.samples().len(), 1);
        assert!(trace.samples()[0].break_before);
    }
}
