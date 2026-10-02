//! Historial corto del widget construido solo con fotos observadas.
use crate::{CarId, SessionId, SourceState};
use std::collections::VecDeque;
use std::time::Duration;

use crate::format::{self, Language, Preferences, Units};
use crate::{Quality, Snapshot};

const MAX_SAMPLES: usize = 120;
// Hasta ocho segundos a la cadencia del widget, incluyendo ambos extremos.
const EXTENDED_MAX_SAMPLES: usize = 401;
const WINDOW: Duration = Duration::from_secs(4);
const CADENCE: Duration = Duration::from_millis(20);
// El silencio supera el plazo de frescura del nucleo (500 ms).
const GAP: Duration = Duration::from_millis(500);

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sample {
    pub at: Duration,
    /// Porcentaje redondeado dibujado por Eficiencia; None es ausencia.
    pub throttle: Option<f64>,
    /// Comienza otro tramo, sin interpolar a traves de un hueco.
    pub break_before: bool,
}

#[derive(Clone, Debug, Default)]
pub struct Trace {
    samples: VecDeque<Sample>,
    identity: Option<(u64, SessionId, Option<CarId>)>,
    last_seen: Option<(u64, Duration)>,
    cut: bool,
}

impl Trace {
    pub fn samples(&self) -> &VecDeque<Sample> {
        &self.samples
    }
    pub fn push(&mut self, snapshot: &Snapshot) -> bool {
        self.push_with_window(snapshot, WINDOW)
    }
    pub fn push_with_window(&mut self, snapshot: &Snapshot, window: Duration) -> bool {
        let window = window.clamp(Duration::from_secs(1), Duration::from_secs(8));
        let identity = (
            snapshot.epoch,
            snapshot.state.session.id,
            snapshot.state.player.map(|p| p.car),
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
            .and_then(|p| p.telemetry.throttle.current().copied())
            .filter(|v| v.is_finite())
            .map(|v| (v.clamp(0.0, 1.0) * 100.0).round());
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
            throttle: value,
            break_before: self.cut,
        });
        self.cut = value.is_none();
        // La ventana predeterminada conserva el límite visual heredado de 120.
        let max_samples = if window == WINDOW {
            MAX_SAMPLES
        } else {
            EXTENDED_MAX_SAMPLES
        };
        while self.samples.len() > max_samples
            || self
                .samples
                .front()
                .is_some_and(|p| at.saturating_sub(p.at) > window)
        {
            self.samples.pop_front();
        }
        true
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Missing,
    Stale,
    Disconnected,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ViewModel {
    pub show_clutch: bool,
    pub status: Status,
    pub status_text: Option<&'static str>,
    pub gear: String,
    pub speed: String,
    pub rpm: String,
    pub speed_label: &'static str,
    /// Embrague, freno y acelerador. Porcentaje redondeado como el CSS, o ausencia.
    pub pedals: [Option<f64>; 3],
    pub pedal_labels: [&'static str; 3],
}

pub fn project(snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
    let telemetry = snapshot
        .state
        .player
        .filter(|_| {
            !matches!(
                snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            )
        })
        .map(|p| p.telemetry)
        .unwrap_or_default();
    let pedals = [telemetry.clutch, telemetry.brake, telemetry.throttle].map(|q| {
        displayed(&q)
            .filter(|v| v.is_finite())
            .map(|v| (v.clamp(0.0, 1.0) * 100.0).round())
    });
    let gear = displayed(&telemetry.gear);
    let speed_mps = nonnegative(&telemetry.speed_mps);
    let engine_speed = nonnegative(&telemetry.engine_speed_rad_s);
    let status = if snapshot.state.source_state == SourceState::Lost {
        Status::Disconnected
    } else if snapshot.state.source_state == SourceState::Stale {
        Status::Stale
    } else if pedals.iter().all(Option::is_none)
        && gear.is_none()
        && speed_mps.is_none()
        && engine_speed.is_none()
    {
        Status::Missing
    } else if matches!(telemetry.gear, Quality::Stale(_))
        || [
            telemetry.clutch,
            telemetry.brake,
            telemetry.throttle,
            telemetry.speed_mps,
            telemetry.engine_speed_rad_s,
        ]
        .iter()
        .any(|q| matches!(q, Quality::Stale(v) if v.is_finite()))
    {
        Status::Stale
    } else {
        Status::Ready
    };
    let (speed_label, pedal_labels, missing, stale) = match prefs.language {
        Language::Es => (
            "VELOCIDAD",
            ["EMBRAGUE", "FRENO", "ACELERADOR"],
            "SIN DATOS",
            "DATOS ANTIGUOS",
        ),
        Language::En => (
            "SPEED",
            ["CLUTCH", "BRAKE", "THROTTLE"],
            "NO DATA",
            "DATA OUT OF DATE",
        ),
    };
    // El productivo usa Math.round, KPH y R1; el formateador común usa km/h y R.
    // Estas adaptaciones concretas permanecen aquí hasta tener otro consumidor.
    let speed_factor = match prefs.units {
        Units::Metric => 3.6,
        Units::Imperial => 2.236_936_292_054_4,
    };
    ViewModel {
        show_clutch: true,
        status,
        status_text: match status {
            Status::Ready => None,
            Status::Missing => Some(missing),
            Status::Stale => Some(stale),
            Status::Disconnected => Some(match prefs.language {
                Language::Es => "DESCONECTADO",
                Language::En => "DISCONNECTED",
            }),
        },
        gear: match gear {
            Some(g) if g < 0 => format!("R{}", i16::from(g).abs()),
            _ => format::gear(gear),
        },
        speed: format::speed(
            speed_mps.map(|v| (v * speed_factor).round() / speed_factor),
            prefs,
        )
        .replace("km/h", "KPH"),
        rpm: format::rpm(engine_speed.map(|v| {
            let factor = 30.0 / std::f64::consts::PI;
            (v * factor).round() / factor
        })),
        speed_label,
        pedals,
        pedal_labels,
    }
}

// El productivo conserva los valores stale, acompañados de su aviso visible.
fn displayed<T: Copy>(quality: &Quality<T>) -> Option<T> {
    match quality {
        Quality::Reliable(v) | Quality::Estimated(v) | Quality::Stale(v) => Some(*v),
        Quality::Unavailable => None,
    }
}

fn nonnegative(quality: &Quality<f64>) -> Option<f64> {
    displayed(quality).filter(|v| v.is_finite() && *v >= 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Player, Telemetry};

    fn snapshot(telemetry: Telemetry) -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.player = Some(Player {
            telemetry,
            ..Player::default()
        });
        snapshot
    }

    #[test]
    fn quality_and_rounding_never_replace_missing_with_zero() {
        for (input, expected, status) in [
            (Quality::Unavailable, None, Status::Missing),
            (Quality::Reliable(f64::NAN), None, Status::Missing),
            (Quality::Reliable(f64::INFINITY), None, Status::Missing),
            (Quality::Reliable(0.0), Some(0.0), Status::Ready),
            (Quality::Reliable(0.125), Some(13.0), Status::Ready),
            (Quality::Estimated(0.75), Some(75.0), Status::Ready),
            (Quality::Stale(0.75), Some(75.0), Status::Stale),
            (Quality::Reliable(-0.1), Some(0.0), Status::Ready),
            (Quality::Reliable(1.2), Some(100.0), Status::Ready),
        ] {
            let vm = project(
                &snapshot(Telemetry {
                    throttle: input,
                    ..Telemetry::default()
                }),
                Preferences::default(),
            );
            assert_eq!(vm.pedals, [None, None, expected]);
            assert_eq!(vm.status, status);
        }
        let vm = project(&Snapshot::default(), Preferences::default());
        assert_eq!(vm.status_text, Some("SIN DATOS"));
        assert_eq!(
            (vm.gear.as_str(), vm.speed.as_str(), vm.rpm.as_str()),
            ("—", "—", "—")
        );
    }

    #[test]
    fn readouts_follow_production_and_preferences() {
        for (gear, text) in [
            (None, "—"),
            (Some(-1), "R1"),
            (Some(-2), "R2"),
            (Some(0), "N"),
            (Some(4), "4"),
        ] {
            let vm = project(
                &snapshot(Telemetry {
                    gear: gear.map_or(Quality::Unavailable, Quality::Reliable),
                    ..Telemetry::default()
                }),
                Preferences::default(),
            );
            assert_eq!(vm.gear, text);
        }
        for (units, speed) in [(Units::Metric, "180 KPH"), (Units::Imperial, "112 mph")] {
            let vm = project(
                &snapshot(Telemetry {
                    speed_mps: Quality::Reliable(50.0),
                    engine_speed_rad_s: Quality::Reliable(240.0 * std::f64::consts::PI),
                    ..Telemetry::default()
                }),
                Preferences {
                    units,
                    language: Language::En,
                },
            );
            assert_eq!(vm.speed, speed);
            assert_eq!(vm.rpm, "7200");
            assert_eq!(vm.speed_label, "SPEED");
            assert_eq!(vm.pedal_labels, ["CLUTCH", "BRAKE", "THROTTLE"]);
        }
        let vm = project(
            &snapshot(Telemetry {
                speed_mps: Quality::Reliable(2.5 / 3.6),
                engine_speed_rad_s: Quality::Reliable(2.5 * std::f64::consts::PI / 30.0),
                ..Telemetry::default()
            }),
            Preferences::default(),
        );
        assert_eq!(vm.speed, "3 KPH");
        assert_eq!(vm.rpm, "3");
    }

    #[test]
    fn invalid_powertrain_and_stale_readouts() {
        for value in [f64::NAN, f64::INFINITY, -1.0] {
            let vm = project(
                &snapshot(Telemetry {
                    speed_mps: Quality::Reliable(value),
                    engine_speed_rad_s: Quality::Reliable(value),
                    ..Telemetry::default()
                }),
                Preferences::default(),
            );
            assert_eq!((vm.speed.as_str(), vm.rpm.as_str()), ("—", "—"));
            assert_eq!(vm.status, Status::Missing);
        }
        let vm = project(
            &snapshot(Telemetry {
                gear: Quality::Stale(4),
                ..Telemetry::default()
            }),
            Preferences::default(),
        );
        assert_eq!(vm.status_text, Some("DATOS ANTIGUOS"));
        assert_eq!(vm.gear, "4");
    }
}

#[cfg(test)]
mod trace_tests {

    #[test]
    fn selected_windows_retain_the_full_span_at_native_cadence() {
        let step = u64::try_from(CADENCE.as_millis()).expect("cadencia acotada");
        for seconds in [1, 3, 8] {
            let mut trace = Trace::default();
            let expected = seconds * 1000 / step + 1;
            for i in 0..=expected {
                let snapshot = sample(i + 1, i * step, Quality::Reliable(0.2));
                trace.push_with_window(&snapshot, Duration::from_secs(seconds));
            }
            assert_eq!(
                trace.samples().len(),
                usize::try_from(expected).expect("ventana acotada")
            );
            let first = trace.samples().front().expect("primera muestra");
            let last = trace.samples().back().expect("última muestra");
            assert_eq!(
                last.at.checked_sub(first.at),
                Some(Duration::from_secs(seconds))
            );
        }
    }

    #[test]
    fn configurable_window_clips_observed_samples_and_stays_bounded() {
        let mut short = Trace::default();
        let mut long = Trace::default();
        let mut snapshot = sample(1, 0, Quality::Reliable(0.2));
        for i in 0..=80_u64 {
            snapshot.sequence = i + 1;
            snapshot.origin.received_at = Duration::from_millis(i * 100);
            short.push_with_window(&snapshot, Duration::from_secs(1));
            long.push_with_window(&snapshot, Duration::from_secs(8));
        }
        assert_eq!(short.samples().len(), 11);
        assert_eq!(long.samples().len(), 81);
        assert!(long.samples().len() <= MAX_SAMPLES);
        assert_eq!(
            short.samples().front().expect("sample").at,
            Duration::from_secs(7)
        );
        snapshot.sequence += 2;
        snapshot.origin.received_at += Duration::from_millis(100);
        long.push_with_window(&snapshot, Duration::from_secs(8));
        assert!(long.samples().back().expect("sample").break_before);
    }

    use super::*;
    use crate::{Player, Quality, State};

    #[test]
    fn source_state_is_visible_and_unavailable_sources_hide_values() {
        let mut s = sample(1, 0, Quality::Reliable(0.5));
        for (state, status, text, pedal) in [
            (SourceState::Live, Status::Ready, None, Some(50.0)),
            (
                SourceState::Stale,
                Status::Stale,
                Some("DATOS ANTIGUOS"),
                Some(50.0),
            ),
            (
                SourceState::Waiting,
                Status::Missing,
                Some("SIN DATOS"),
                None,
            ),
            (
                SourceState::Lost,
                Status::Disconnected,
                Some("DESCONECTADO"),
                None,
            ),
        ] {
            s.state.source_state = state;
            let vm = project(&s, Preferences::default());
            assert_eq!(
                (vm.status, vm.status_text, vm.pedals[2]),
                (status, text, pedal)
            );
        }
    }
    fn sample(i: u64, ms: u64, value: Quality<f64>) -> Snapshot {
        let mut player = Player::default();
        player.telemetry.throttle = value;
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
        assert_eq!(trace.samples().len(), 120);
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
        assert_eq!(trace.samples()[0].throttle, Some(0.0));
        for i in [1, 3, 4] {
            assert_eq!(trace.samples()[i].throttle, None);
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
