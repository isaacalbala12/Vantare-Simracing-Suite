use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::vantare::{
    paint::{Face, Kit, round_rect},
    style::{Color, Style},
};
use gpui::{App, PathBuilder, point, px};
use std::sync::Arc;
use vantare_domain::{
    Snapshot,
    delta_trace::{Sample, Trace, ViewModel},
    format::Preferences,
};

mod lap;

pub const SIZE: (f32, f32) = (760.0, 192.0);
const GRAPH_HEIGHT: f32 = 120.0;

fn paint_heading(
    details: &Details,
    kit: &Kit<'_>,
    mut draw: impl FnMut(crate::vantare::paint::Label<'_>),
) {
    let ink = kit.ink(Face::Body, 11.0, 0.3, kit.style.colors.muted.hsla());
    for (value, x, right) in [
        (&details.header, 12.0, None),
        (&details.position, 0.0, Some(748.0)),
    ] {
        draw(crate::vantare::paint::Label {
            value,
            x,
            right,
            top: 10.0,
            height: 18.0,
            face: Face::Body,
            ink,
        });
    }
}
fn paint_sector_text(
    details: &Details,
    i: usize,
    kit: &Kit<'_>,
    mut draw: impl FnMut(crate::vantare::paint::Label<'_>),
) {
    let x = 12.0 + i as f32 * 247.3;
    let ink = kit.ink(Face::Mono, 9.0, 0.0, kit.style.colors.muted.hsla());
    for (value, left, right) in [
        (["S1", "S2", "S3"][i], x, None),
        (details.sector_text[i].as_str(), 0.0, Some(x + 241.3)),
    ] {
        draw(crate::vantare::paint::Label {
            value,
            x: left,
            right,
            top: 166.0,
            height: 14.0,
            face: Face::Mono,
            ink,
        });
    }
}

fn paint(
    vm: &ViewModel,
    samples: &[Sample],
    history: &lap::History,
    details: &Details,
    prefs: Preferences,
    window: &mut Window,
    cx: &mut App,
) {
    let style = Style::compiled();
    let kit = Kit {
        style: &style,
        variant: &style.styles.neo,
        accent: style.accents.red,
        language: prefs.language,
        width: SIZE.0,
    };
    kit.panel(window, SIZE.1);
    paint_heading(details, &kit, |label| {
        label.paint(&kit, window, cx);
    });
    let muted = kit.ink(Face::Body, 11.0, 0.3, style.colors.muted.hsla());
    for fraction in [0.25, 0.5, 0.75] {
        round_rect(
            window,
            12.0,
            32.0 + GRAPH_HEIGHT * fraction,
            736.0,
            1.0,
            0.0,
            Color(0xffffff, if fraction == 0.5 { 0.35 } else { 0.05 }).hsla(),
        );
    }
    for fraction in [1.0 / 3.0, 2.0 / 3.0] {
        for y in (32..152).step_by(5) {
            round_rect(
                window,
                12.0 + 736.0 * fraction,
                y as f32,
                1.0,
                2.0,
                0.0,
                Color(0xffffff, 0.08).hsla(),
            );
        }
    }
    let tick = kit.ink(Face::Mono, 9.0, 0.0, Color(0x6e6668, 1.0).hsla());
    kit.label(
        window,
        cx,
        if kit.es() {
            "+0.25 pierdes"
        } else {
            "+0.25 lost"
        },
        16.0,
        None,
        46.0,
        12.0,
        Face::Mono,
        &tick,
    );
    kit.label(
        window,
        cx,
        if kit.es() {
            "−0.25 ganas"
        } else {
            "−0.25 gained"
        },
        16.0,
        None,
        118.0,
        12.0,
        Face::Mono,
        &tick,
    );
    if history.points.is_empty() {
        paint_trace(samples, details.invalid, window);
    } else {
        paint_lap(history, details.invalid, window);
    }
    round_rect(
        window,
        638.0,
        40.0,
        102.0,
        54.0,
        6.0,
        Color(0x110f10, 0.85).hsla(),
    );
    let color = if details.invalid {
        0x6e6668
    } else if vm.current_text.starts_with('-') || vm.current_text.starts_with('−') {
        0x4ade80
    } else {
        0xff7a82
    };
    let value = kit.ink(Face::Display, 30.0, 0.0, Color(color, 1.0).hsla());
    kit.label(
        window,
        cx,
        &vm.current_text,
        0.0,
        Some(732.0),
        42.0,
        30.0,
        Face::Display,
        &value,
    );
    kit.label(
        window,
        cx,
        if kit.es() { "ahora" } else { "now" },
        0.0,
        Some(732.0),
        74.0,
        14.0,
        Face::Mono,
        &tick,
    );
    for i in 0..3 {
        let x = 12.0 + i as f32 * 247.3;
        let delta = details.sectors[i];
        let color = delta.map_or(0x3a3335, |v| if v < 0.0 { 0x22c55e } else { 0xf25a5a });
        round_rect(window, x, 158.0, 241.3, 4.0, 2.0, Color(color, 1.0).hsla());
        paint_sector_text(details, i, &kit, |label| {
            label.paint(&kit, window, cx);
        });
    }
    if let Some(status) = vm.status_text {
        kit.label(
            window,
            cx,
            status,
            260.0,
            None,
            90.0,
            20.0,
            Face::Body,
            &muted,
        );
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub reference: String,
    pub window_seconds: f64,
    pub show_sectors: bool,
    pub show_track_map: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            reference: "best".into(),
            window_seconds: 4.0,
            show_sectors: true,
            show_track_map: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        (
            "showSectors",
            "El diseño mantiene los indicadores de sector en el pie",
        ),
        (
            "showTrackMap",
            "Snapshot no publica trackPath ni turnInsight",
        ),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            reference: match self.reference.as_str() {
                "optimal" | "leader" => self.reference.clone(),
                _ => "best".into(),
            },
            window_seconds: if self.window_seconds.is_finite() {
                self.window_seconds.clamp(1.0, 8.0)
            } else {
                4.0
            },
            ..self.clone()
        }
    }
}

fn paint_trace(samples: &[Sample], invalid: bool, window: &mut Window) {
    let (ox, oy) = text::origin();
    let mut connected = false;
    for (index, pair) in samples.windows(2).enumerate() {
        if invalid && index / 3 % 2 == 1 {
            continue;
        }
        if let (Some(a), Some(b)) = (pair[0].delta_seconds, pair[1].delta_seconds) {
            if pair[1].break_before {
                continue;
            }
            let end = samples.last().map_or(std::time::Duration::ZERO, |s| s.at);
            let start = samples.first().map_or(end, |s| s.at);
            let span = end.saturating_sub(start).as_secs_f32().max(0.001);
            let pos = |s: &Sample, v: f64| {
                point(
                    px(ox + 12.0 + 736.0 * s.at.saturating_sub(start).as_secs_f32() / span),
                    px(oy + 92.0 - 108.0 * v.clamp(-0.5, 0.5) as f32),
                )
            };
            let mut line = PathBuilder::stroke(px(2.2));
            line.move_to(pos(&pair[0], a));
            line.line_to(pos(&pair[1], b));
            if let Ok(line) = line.build() {
                window.paint_path(
                    line,
                    Color(
                        if invalid {
                            0x6e6668
                        } else if b < 0.0 {
                            0x4ade80
                        } else {
                            0xff7a82
                        },
                        1.0,
                    )
                    .hsla(),
                );
            }
            connected = true;
        }
    }
    if connected && let Some(v) = samples.last().and_then(|s| s.delta_seconds) {
        round_rect(
            window,
            744.0,
            88.0 - 108.0 * v.clamp(-0.5, 0.5) as f32,
            8.0,
            8.0,
            4.0,
            Color(0xffffff, 1.0).hsla(),
        );
    }
}

fn paint_lap(history: &lap::History, invalid: bool, window: &mut Window) {
    let (ox, oy) = text::origin();
    for (points, previous) in [(&history.previous, true), (&history.points, false)] {
        for (index, pair) in points.windows(2).enumerate() {
            if pair[1].cut {
                continue;
            }
            if invalid && !previous && index / 3 % 2 == 1 {
                continue;
            }
            let position = |p: &lap::Point| {
                point(
                    px(ox + 12.0 + 736.0 * p.progress),
                    px(oy + 92.0 - 108.0 * p.delta.clamp(-0.5, 0.5)),
                )
            };
            let mut line = PathBuilder::stroke(px(if previous { 1.2 } else { 2.2 }));
            line.move_to(position(&pair[0]));
            line.line_to(position(&pair[1]));
            let color = if previous {
                Color(0xffffff, 0.22)
            } else if invalid {
                Color(0x6e6668, 1.0)
            } else {
                Color(
                    if pair[1].delta < 0.0 {
                        0x4ade80
                    } else {
                        0xff7a82
                    },
                    1.0,
                )
            };
            if let Ok(line) = line.build() {
                window.paint_path(line, color.hsla());
            }
            if !previous && !invalid {
                let mut fill = PathBuilder::fill();
                fill.move_to(position(&pair[0]));
                fill.line_to(position(&pair[1]));
                fill.line_to(point(
                    px(ox + 12.0 + 736.0 * pair[1].progress),
                    px(oy + 92.0),
                ));
                fill.line_to(point(
                    px(ox + 12.0 + 736.0 * pair[0].progress),
                    px(oy + 92.0),
                ));
                fill.close();
                if let Ok(fill) = fill.build() {
                    window.paint_path(fill, Color(color.0, 0.22).hsla());
                }
            }
        }
    }
    if let Some(last) = history.points.last() {
        let x = 12.0 + 736.0 * last.progress;
        round_rect(
            window,
            x,
            32.0,
            1.0,
            120.0,
            0.0,
            Color(0xffffff, 0.25).hsla(),
        );
        round_rect(
            window,
            x - 4.0,
            88.0 - 108.0 * last.delta.clamp(-0.5, 0.5),
            8.0,
            8.0,
            4.0,
            Color(0xffffff, 1.0).hsla(),
        );
    }
}

#[derive(Clone, Default, PartialEq)]
struct Details {
    invalid: bool,
    header: String,
    position: String,
    sectors: [Option<f64>; 3],
    sector_text: [String; 3],
}
impl Details {
    fn from(snapshot: &Snapshot, prefs: Preferences, board: &vantare_domain::delta::Board) -> Self {
        let es = prefs.language == vantare_domain::format::Language::Es;
        let car = snapshot.state.player_car();
        let best = vantare_domain::format::lap_time(board.reference_lap_s);
        let reference = match (board.reference, es) {
            (vantare_domain::delta::Reference::Optimal, true) => "ÓPTIMA",
            (vantare_domain::delta::Reference::Optimal, false) => "OPTIMAL",
            (vantare_domain::delta::Reference::Leader, true) => "LÍDER DE CLASE",
            (vantare_domain::delta::Reference::Leader, false) => "CLASS LEADER",
            (_, true) => "TU MEJOR",
            (_, false) => "YOUR BEST",
        };
        let progress = car
            .and_then(|c| c.lap_distance_m.current())
            .zip(snapshot.state.session.track_length_m.current())
            .filter(|(d, l)| d.is_finite() && l.is_finite() && **l > 0.0 && **d >= 0.0 && d <= l)
            .map(|(d, l)| d / l * 100.0);
        let sectors = std::array::from_fn(|i| {
            car.filter(|_| board.reference != vantare_domain::delta::Reference::Leader)
                .and_then(|c| c.current_sectors_s.get(i).zip(c.best_sectors_s.get(i)))
                .and_then(|(a, b)| a.current().zip(b.current()))
                .filter(|(a, b)| a.is_finite() && b.is_finite() && **a > 0.0 && **b > 0.0)
                .map(|(a, b)| a - b)
                .filter(|v| v.is_finite())
        });
        Self {
            invalid: snapshot
                .state
                .player
                .is_some_and(|p| p.lap_invalid.current() == Some(&true)),
            header: if es {
                format!("HISTORIAL DE DELTA · VS {reference} {best}")
            } else {
                format!("DELTA HISTORY · VS {reference} {best}")
            },
            position: car
                .and_then(|c| c.laps.current())
                .zip(progress)
                .map_or_else(String::new, |(lap, p)| {
                    format!(
                        "{} {} · {p:.0} %",
                        if es { "VUELTA" } else { "LAP" },
                        lap + 1
                    )
                }),
            sectors,
            sector_text: sectors
                .map(|delta| delta.map_or_else(|| "—".into(), |v| format!("{v:+.3}"))),
        }
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
    trace: Trace,
    history: Arc<lap::History>,
    details: Arc<Details>,
    paint_samples: Option<std::sync::Arc<Vec<Sample>>>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            settings: settings.clone(),
            vm: vantare_domain::delta_trace::project(&Snapshot::default(), prefs),
            trace: Trace::default(),
            history: Arc::default(),
            details: Arc::new(Details::from(
                &Snapshot::default(),
                prefs,
                &vantare_domain::delta::project(&Snapshot::default(), prefs),
            )),
            paint_samples: None,
        }
    }

    #[allow(clippy::unused_self)] // Firma del registro; tamaño fijo del productivo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let reference = match self.settings.reference.as_str() {
            "optimal" => vantare_domain::delta::Reference::Optimal,
            "leader" => vantare_domain::delta::Reference::Leader,
            _ => vantare_domain::delta::Reference::PersonalBest,
        };
        let mut board = vantare_domain::delta::project_reference(snapshot, prefs, reference);
        if reference != vantare_domain::delta::Reference::PersonalBest
            && board.reference_lap_s.is_none()
        {
            board.delta = vantare_domain::Quality::Unavailable;
        }
        let details_changed = replace_if_changed(
            Arc::make_mut(&mut self.details),
            Details::from(snapshot, prefs, &board),
        );
        let lap_changed = Arc::make_mut(&mut self.history).push_with_board(snapshot, &board);
        let changed = self.trace.push_with_board(
            snapshot,
            std::time::Duration::from_secs_f64(self.settings.window_seconds),
            &board,
        );
        if changed {
            self.paint_samples = None;
        }
        replace_if_changed(
            &mut self.vm,
            self.trace.project_with_board(snapshot, prefs, &board),
        ) || changed
            || lap_changed
            || details_changed
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, _reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let samples = self.paint_samples();
        let history = self.history.clone();
        let details = self.details.clone();
        (
            Box::new(move |window, cx| paint(&vm, &samples, &history, &details, prefs, window, cx)),
            Wake::Idle,
        )
    }

    fn paint_samples(&mut self) -> std::sync::Arc<Vec<Sample>> {
        self.paint_samples
            .get_or_insert_with(|| {
                std::sync::Arc::new(self.trace.samples().iter().copied().collect())
            })
            .clone()
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // No hay animaciones ni avisos temporales en TSX/CSS.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod performance_tests;
#[cfg(test)]
mod render_tests;

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{
            Cars, Delta, Flags, LapCount, LapProgress, LapTimes, PitStatus, Positions, Sectors,
            SessionInfo, TrackLength,
        };
        // La historia distingue pérdida real de fotos; no introducir huecos por cadencia.
        crate::demand::signals(
            0,
            &[
                Cars,
                Positions,
                PitStatus,
                Flags,
                Delta,
                LapTimes,
                LapCount,
                LapProgress,
                TrackLength,
                Sectors,
                SessionInfo,
            ],
        )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn selected_reference_reaches_both_histories_and_missing_never_falls_back() {
        use vantare_domain::{Car, CarId, Class, ClassId, Quality::Reliable, SessionKind};
        let mut snapshot = crate::source::fixed();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.session.kind = Reliable(SessionKind::Qualifying);
        snapshot.state.session.track_length_m = Reliable(1000.0);
        let own = snapshot.state.player.expect("jugador").car;
        let class = Class {
            id: ClassId(91),
            name: "Hypercar".into(),
        };
        snapshot.state.cars = vec![
            Car {
                id: own,
                class: Some(class.clone()),
                position: Reliable(2),
                class_position: Reliable(2),
                best_lap_s: Reliable(90.0),
                best_sectors_s: vec![Reliable(29.0); 3],
                laps: Reliable(4),
                lap_distance_m: Reliable(100.0),
                ..Car::default()
            },
            Car {
                id: CarId(own.0 + 1),
                class: Some(class),
                position: Reliable(1),
                class_position: Reliable(1),
                best_lap_s: Reliable(88.0),
                ..Car::default()
            },
        ];
        let player = snapshot.state.player.as_mut().expect("jugador");
        player.delta_best_s = Reliable(-0.1);
        player.delta_optimal_s = Reliable(0.4);
        player.delta_leader_s = Reliable(0.8);
        let prefs = Preferences::default();
        for (reference, expected, title) in [
            ("best", -0.1, "TU MEJOR"),
            ("optimal", 0.4, "ÓPTIMA"),
            ("leader", 0.8, "LÍDER DE CLASE"),
        ] {
            let mut widget = Widget::new(
                &Settings {
                    reference: reference.into(),
                    ..Settings::default()
                },
                prefs,
            );
            widget.ingest(&snapshot, prefs);
            assert_eq!(
                widget
                    .trace
                    .samples()
                    .back()
                    .expect("muestra")
                    .delta_seconds,
                Some(expected)
            );
            assert_eq!(
                widget.history.points.last().expect("distancia").delta,
                expected as f32
            );
            assert!(widget.details.header.contains(title));
            let mut absent = snapshot.clone();
            absent.sequence += 1;
            absent.origin.received_at += std::time::Duration::from_millis(100);
            let player = absent.state.player.as_mut().expect("jugador");
            match reference {
                "optimal" => player.delta_optimal_s = Quality::Unavailable,
                "leader" => player.delta_leader_s = Quality::Unavailable,
                _ => player.delta_best_s = Quality::Unavailable,
            }
            widget.ingest(&absent, prefs);
            assert_eq!(
                widget.vm.current_text, "—",
                "sin sustituir por delta personal"
            );
        }
        let legacy: Settings =
            serde_json::from_str(r#"{"windowSeconds":6}"#).expect("guardado anterior");
        assert_eq!(legacy.reference, "best");
    }

    #[test]
    fn selected_history_window_changes_the_projected_observed_trace() {
        let snapshots = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/delta-trace.sequence.json"
        ))
        .expect("secuencia Workshop DTO v4");
        let prefs = Preferences::default();
        let mut default = Widget::new(&Settings::default(), prefs);
        let mut short = Widget::new(
            &Settings {
                window_seconds: 1.0,
                ..Settings::default()
            },
            prefs,
        );
        for snapshot in &snapshots {
            default.ingest(snapshot, prefs);
            short.ingest(snapshot, prefs);
        }
        assert!(short.trace.samples().len() < default.trace.samples().len());
        assert_eq!(short.trace.samples().back(), default.trace.samples().back());
    }

    use super::*;
    use vantare_domain::{Player, Quality, format::Language};

    #[test]
    fn repaint_only_when_displayed_values_or_language_change() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.player = Some(Player {
            delta_best_s: Quality::Reliable(0.214_1),
            ..Player::default()
        });
        assert!(widget.ingest(&snapshot, prefs));
        snapshot.sequence += 1;
        if let Some(player) = &mut snapshot.state.player {
            player.delta_best_s = Quality::Reliable(0.214_2);
        }
        assert!(!widget.ingest(&snapshot, prefs), "el redondeo no cambia");
        assert!(widget.ingest(
            &snapshot,
            Preferences {
                language: Language::En,
                ..prefs
            }
        ));
        snapshot.state.player = None;
        assert!(
            widget.ingest(&snapshot, prefs),
            "se retira el dato anterior"
        );
        assert!(matches!(widget.frame(prefs, false).1, Wake::Idle));
    }

    #[test]
    fn reference_sequence_reproduces_history_scalar_and_trend() {
        let snapshots = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/delta-trace.sequence.json"
        ))
        .expect("escena Workshop reconstruida en DTO v4");
        let snapshot = snapshots.last().expect("foto actual");
        assert_eq!(
            snapshot.state.player.map(|player| player.delta_best_s),
            Some(Quality::Reliable(0.214))
        );
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        for snapshot in &snapshots {
            widget.ingest(snapshot, Preferences::default());
        }
        assert_eq!(widget.trace.samples().len(), 81);
        assert_eq!(widget.vm.current_text, "+0.257");
        assert_eq!(widget.vm.trend_text, "PERDIENDO");
        assert!(matches!(
            widget.frame(Preferences::default(), false).1,
            Wake::Idle
        ));
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn a_static_widget_never_keeps_capture_waiting_for_animation() {
        assert!(!Widget::new(&Settings::default(), Preferences::default()).animating());
    }
}
