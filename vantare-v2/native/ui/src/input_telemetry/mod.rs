//! Telemetría de entrada aprobada: tira fija 600×84.
//! La traza corta pertenece al widget y solo conserva muestras observadas.

use crate::efficiency::preview::PaintWindow as Window;
use std::time::{Duration, Instant};

use gpui::{App, PathBuilder, Pixels, Point, point, px};
use vantare_domain::{
    CarId, SessionId, Snapshot,
    format::Preferences,
    input_telemetry::{Sample, Trace, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text;
use crate::vantare::paint::{Face, Kit, round_rect};
use crate::vantare::style::{Color, Style};
const SIZE: (f32, f32) = (600.0, 84.0);
const TRANSITION: Duration = Duration::from_millis(80);

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub history_seconds: u8,
    pub show_clutch: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            history_seconds: 6,
            show_clutch: false,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            history_seconds: self.history_seconds.clamp(1, 8),
            ..self.clone()
        }
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = vantare_domain::input_telemetry::project(snapshot, prefs);
        vm.show_clutch = self.show_clutch && vm.pedals[0].is_some();
        if !self.show_clutch {
            vm.pedals[0] = None;
        }
        vm
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
    from: [Option<f64>; 3],
    started: Option<Instant>,
    identity: Option<(u64, SessionId, Option<CarId>)>,
    trace: Trace,
    paint_samples: Option<std::sync::Arc<Vec<Sample>>>,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            settings: settings.clone(),
            vm: settings.project(&Snapshot::default(), prefs),
            from: [None; 3],
            started: None,
            identity: None,
            trace: Trace::default(),
            paint_samples: None,
        }
    }

    #[allow(clippy::unused_self)] // Firma del registro; tamaño por defecto fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        self.ingest_at(snapshot, prefs, Instant::now())
    }

    fn ingest_at(&mut self, snapshot: &Snapshot, prefs: Preferences, now: Instant) -> bool {
        let identity = (
            snapshot.epoch,
            snapshot.state.session.id,
            snapshot.state.player.map(|p| p.car),
        );
        let reset = self.identity != Some(identity);
        let was_moving = self.moving(now);
        self.identity = Some(identity);
        let trace_changed = self.trace.push_with_window(
            snapshot,
            Duration::from_secs(u64::from(self.settings.history_seconds)),
        );
        if trace_changed {
            self.paint_samples = None;
        }
        let next = self.settings.project(snapshot, prefs);
        if reset {
            self.from = next.pedals;
            self.started = None;
        } else if next.pedals != self.vm.pedals {
            self.from = self.pedals_at(now);
            self.started = Some(now);
        }
        replace_if_changed(&mut self.vm, next) || trace_changed || (reset && was_moving)
    }

    fn pedals_at(&self, now: Instant) -> [Option<f64>; 3] {
        interpolate(
            self.from,
            self.vm.pedals,
            self.started
                .map_or(TRANSITION, |start| now.duration_since(start)),
        )
    }

    fn moving(&self, now: Instant) -> bool {
        self.started
            .is_some_and(|start| now.duration_since(start) < TRANSITION)
            && self.from != self.vm.pedals
            && self.vm.pedals.iter().any(Option::is_some)
    }

    pub(crate) fn frame(&mut self, prefs: Preferences, reduced: bool) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let now = Instant::now();
        let pedals = if reduced {
            self.vm.pedals
        } else {
            self.pedals_at(now)
        };
        let samples = self.paint_samples();
        let seconds = self.settings.history_seconds;
        let wake = if !reduced && self.moving(now) {
            Wake::Frame
        } else {
            Wake::Idle
        };
        (
            Box::new(move |window, cx| paint(&vm, pedals, &samples, seconds, prefs, window, cx)),
            wake,
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
    pub(crate) fn animating(&self) -> bool {
        self.moving(Instant::now())
    }
}

#[cfg(test)]
mod performance_tests;

fn interpolate(
    from: [Option<f64>; 3],
    to: [Option<f64>; 3],
    elapsed: Duration,
) -> [Option<f64>; 3] {
    let progress = (elapsed.as_secs_f64() / TRANSITION.as_secs_f64()).min(1.0);
    std::array::from_fn(|i| {
        to[i].map(|target| {
            let origin = from[i].unwrap_or(0.0); // Solo origen visual de una barra con dato.
            origin + (target - origin) * progress
        })
    })
}

fn paint_segment(points: &[Point<Pixels>], color: Color, window: &mut Window) {
    if points.len() < 2 {
        return;
    }
    let (_, oy) = text::origin();
    let mut fill = PathBuilder::fill();
    let first = points[0];
    let last = points[points.len() - 1];
    fill.move_to(point(first.x, px(oy + 74.0)));
    for &p in points {
        fill.line_to(p);
    }
    fill.line_to(point(last.x, px(oy + 74.0)));
    fill.close();
    match fill.build() {
        Ok(path) => window.paint_path(path, Color(color.0, 0.14).hsla()),
        Err(error) => eprintln!("input-telemetry: relleno: {error}"),
    }
    let mut line = PathBuilder::stroke(px(2.0));
    line.move_to(first);
    for &p in &points[1..] {
        line.line_to(p);
    }
    match line.build() {
        Ok(path) => window.paint_path(path, color.hsla()),
        Err(error) => eprintln!("input-telemetry: traza: {error}"),
    }
}

fn paint_traces(vm: &ViewModel, samples: &[Sample], seconds: u8, window: &mut Window) {
    let (ox, oy) = text::origin();
    for (signal, color) in [0x4f8ef7, 0xe14a54, 0x22c55e].into_iter().enumerate() {
        if signal == 0 && !vm.show_clutch {
            continue;
        }
        let mut segment = Vec::new();
        let end = samples.last().map_or(Duration::ZERO, |sample| sample.at);
        for sample in samples {
            if sample.break_before || sample.break_pedals[2 - signal] {
                paint_segment(&segment, Color(color, 1.0), window);
                segment.clear();
            }
            let value = match signal {
                0 => sample.clutch,
                1 => sample.brake,
                _ => sample.throttle,
            };
            if let Some(value) = value {
                let age = end.saturating_sub(sample.at).as_secs_f32();
                let x = 12.0 + 440.0 * (1.0 - age / f32::from(seconds)).clamp(0.0, 1.0);
                let y = 73.0 - 62.0 * value as f32 / 100.0;
                segment.push(point(px(ox + x), px(oy + y)));
            } else {
                paint_segment(&segment, Color(color, 1.0), window);
                segment.clear();
            }
        }
        paint_segment(&segment, Color(color, 1.0), window);
    }
}

fn paint(
    vm: &ViewModel,
    pedals: [Option<f64>; 3],
    samples: &[Sample],
    seconds: u8,
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
    for (fraction, alpha) in [(0.25, 0.05), (0.5, 0.05), (0.75, 0.05), (1.0, 0.12)] {
        round_rect(
            window,
            12.0,
            10.0 + fraction * 64.0 - 0.5,
            440.0,
            1.0,
            0.0,
            Color(0xffffff, alpha).hsla(),
        );
    }
    paint_traces(vm, samples, seconds, window);
    if let Some(value) = samples.last().and_then(|sample| sample.throttle) {
        round_rect(
            window,
            448.0,
            70.0 - 62.0 * value as f32 / 100.0,
            6.0,
            6.0,
            3.0,
            Color(0xffffff, 1.0).hsla(),
        );
    }
    let muted = kit.ink(Face::Mono, 9.0, 0.0, style.colors.column.hsla());
    kit.label(
        window,
        cx,
        &format!("{seconds} s"),
        16.0,
        None,
        60.0,
        14.0,
        Face::Mono,
        &muted,
    );
    if let Some(status) = vm.status_text {
        let ink = kit.ink(Face::Display, 12.0, 1.4, style.colors.muted.hsla());
        let width = text::width(window, status, &ink);
        kit.label(
            window,
            cx,
            status,
            12.0 + (440.0 - width) / 2.0,
            None,
            34.0,
            16.0,
            Face::Display,
            &ink,
        );
    }
    let start = usize::from(!vm.show_clutch);
    for (index, signal) in (start..3).enumerate() {
        let x = 462.0 + index as f32 * 12.0;
        round_rect(
            window,
            x,
            10.0,
            9.0,
            64.0,
            4.0,
            Color(0xffffff, 0.08).hsla(),
        );
        if let Some(value) = pedals[signal] {
            let h = 64.0 * value as f32 / 100.0;
            if h > 0.0 {
                round_rect(
                    window,
                    x,
                    74.0 - h,
                    9.0,
                    h,
                    4.0f32.min(h / 2.0),
                    Color([0x4f8ef7, 0xe14a54, 0x22c55e][signal], 1.0).hsla(),
                );
            }
        }
    }
    let center = if vm.show_clutch { 550.0 } else { 544.0 };
    // Sin régimen máximo del motor no se inventa el umbral de cambio.
    let rpm = kit.ink(Face::Mono, 9.0, 0.0, style.colors.muted.hsla());
    let label = format!("{} rpm", vm.rpm);
    let width = text::width(window, &label, &rpm);
    kit.label(
        window,
        cx,
        &label,
        center - width / 2.0,
        None,
        10.0,
        10.0,
        Face::Mono,
        &rpm,
    );
    let gear = kit.ink(Face::Display, 40.0, 0.0, style.colors.text.hsla());
    let width = text::width(window, &vm.gear, &gear);
    kit.label(
        window,
        cx,
        &vm.gear,
        center - width / 2.0,
        None,
        22.0,
        36.0,
        Face::Display,
        &gear,
    );
    let speed = vm.speed.replace("KPH", "km/h");
    let ink = kit.ink(Face::Mono, 10.0, 0.0, style.colors.muted.hsla());
    let width = text::width(window, &speed, &ink);
    kit.label(
        window,
        cx,
        &speed,
        center - width / 2.0,
        None,
        60.0,
        14.0,
        Face::Mono,
        &ink,
    );
}

impl Settings {
    #[allow(clippy::unused_self)] // El estado de ausencia también depende de clutch, aunque su barra esté oculta.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Clutch, Pedals, Powertrain};
        // La traza necesita observar cada revisión para detectar pérdidas reales.
        crate::demand::signals(0, &[Pedals, Clutch, Powertrain])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn approved_example_contains_six_seconds_of_observed_input() {
        let photos = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/input-telemetry-design-system.sequence.json"
        ))
        .expect("ejemplo DTO");
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        for photo in &photos {
            widget.ingest(photo, prefs);
        }
        assert_eq!(widget.trace.samples().len(), 91);
        assert_eq!(
            widget
                .trace
                .samples()
                .back()
                .expect("final")
                .at
                .checked_sub(widget.trace.samples().front().expect("inicio").at)
                .expect("tiempo creciente"),
            Duration::from_secs(6)
        );
        assert!(!widget.vm.show_clutch);
        assert_eq!(widget.vm.gear, "3");
    }

    #[test]
    fn approved_strip_keeps_its_size_with_partial_or_missing_signals() {
        let prefs = Preferences::default();
        for show_clutch in [false, true] {
            let mut widget = Widget::new(
                &Settings {
                    show_clutch,
                    ..Default::default()
                },
                prefs,
            );
            for mut photo in [crate::source::fixed(), Snapshot::default()] {
                for state in [
                    vantare_domain::SourceState::Live,
                    vantare_domain::SourceState::Paused,
                    vantare_domain::SourceState::Lost,
                ] {
                    photo.state.source_state = state;
                    widget.ingest(&photo, prefs);
                    assert_eq!(widget.size(), (600.0, 84.0));
                }
            }
        }
    }

    #[test]
    fn first_photo_is_immediate_and_the_same_identity_keeps_its_linear_transition() {
        let prefs = Preferences::default();
        let now = Instant::now();
        let mut snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../../fixtures/pedals.snapshot.json"))
                .expect("foto de pedales");
        let mut widget = Widget::new(&Settings::default(), prefs);
        widget.ingest_at(&snapshot, prefs, now);
        assert_eq!(widget.pedals_at(now), widget.vm.pedals);
        assert!(!widget.moving(now));
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .throttle = Quality::Reliable(0.25);
        snapshot.sequence += 1;
        let start = now + Duration::from_millis(100);
        widget.ingest_at(&snapshot, prefs, start);
        assert!(widget.moving(start));
        assert_eq!(
            widget.pedals_at(start + Duration::from_millis(40))[2],
            Some(50.0)
        );
        assert_eq!(widget.pedals_at(start + TRANSITION)[2], Some(25.0));
        assert!(!widget.moving(start + TRANSITION));
        snapshot.state.player = None;
        widget.ingest_at(&snapshot, prefs, start + TRANSITION);
        assert_eq!(widget.pedals_at(start + TRANSITION), [None; 3]);
        assert!(!widget.moving(start + TRANSITION));
    }

    #[test]
    fn identity_changes_cut_input_motion_even_when_values_are_unchanged() {
        use vantare_domain::{CarId, SessionId, SourceState, Telemetry};
        let prefs = Preferences::default();
        let now = Instant::now();
        for source_state in [SourceState::Live, SourceState::Stale] {
            for changed in 0..3 {
                for throttle in [0.0, 0.5] {
                    let mut snapshot = Snapshot {
                        epoch: 1,
                        sequence: 1,
                        ..Snapshot::default()
                    };
                    snapshot.state.source_state = source_state;
                    snapshot.state.session.id = SessionId(1);
                    snapshot.state.player = Some(Player {
                        car: CarId(1),
                        telemetry: Telemetry {
                            throttle: Quality::Reliable(1.0),
                            ..Telemetry::default()
                        },
                        ..Player::default()
                    });
                    let mut widget = Widget::new(&Settings::default(), prefs);
                    widget.ingest_at(&snapshot, prefs, now);
                    let player = snapshot.state.player.as_mut().expect("jugador");
                    player.telemetry.throttle = Quality::Reliable(0.0);
                    snapshot.sequence = 2;
                    snapshot.origin.received_at = Duration::from_millis(100);
                    widget.ingest_at(&snapshot, prefs, now + Duration::from_millis(100));
                    assert!(widget.moving(now + Duration::from_millis(120)));
                    match changed {
                        0 => snapshot.epoch += 1,
                        1 => snapshot.state.session.id = SessionId(2),
                        _ => snapshot.state.player.as_mut().expect("jugador").car = CarId(2),
                    }
                    snapshot
                        .state
                        .player
                        .as_mut()
                        .expect("jugador")
                        .telemetry
                        .throttle = Quality::Reliable(throttle);
                    snapshot.sequence = 3;
                    snapshot.origin.received_at = Duration::from_millis(120);
                    let reset_at = now + Duration::from_millis(120);
                    assert!(
                        widget.ingest_at(&snapshot, prefs, reset_at),
                        "repintar el corte"
                    );
                    assert_eq!(
                        widget.pedals_at(reset_at),
                        widget.vm.pedals,
                        "no arrastrar entradas de otra identidad"
                    );
                    assert!(!widget.moving(reset_at));
                }
            }
        }
    }

    #[test]
    fn selected_history_window_changes_the_projected_observed_trace() {
        let snapshots = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/input-telemetry.sequence.json"
        ))
        .expect("secuencia Workshop DTO v4");
        let prefs = Preferences::default();
        let mut default = Widget::new(&Settings::default(), prefs);
        let mut short = Widget::new(
            &Settings {
                history_seconds: 1,
                ..Settings::default()
            },
            prefs,
        );
        for (index, snapshot) in snapshots.iter().enumerate() {
            let mut snapshot = snapshot.clone();
            snapshot.origin.received_at = Duration::from_millis(index as u64 * 100);
            default.ingest(&snapshot, prefs);
            short.ingest(&snapshot, prefs);
        }
        assert!(short.trace.samples().len() < default.trace.samples().len());
        assert_eq!(short.trace.samples().back(), default.trace.samples().back());
    }

    #[test]
    fn hiding_clutch_removes_its_displayed_value_from_the_projection() {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.player = Some(vantare_domain::Player {
            telemetry: vantare_domain::Telemetry {
                clutch: vantare_domain::Quality::Reliable(0.4),
                ..vantare_domain::Telemetry::default()
            },
            ..vantare_domain::Player::default()
        });
        let settings = Settings {
            show_clutch: false,
            ..Settings::default()
        };
        let vm = settings.project(&snapshot, Preferences::default());
        assert!(!vm.show_clutch);
        assert_eq!(vm.pedals[0], None);
        assert_eq!(
            Settings {
                show_clutch: true,
                ..Settings::default()
            }
            .project(&snapshot, Preferences::default())
            .pedals[0],
            Some(40.0)
        );
    }

    use super::*;
    use vantare_domain::{Player, Quality};

    #[test]
    fn real_lmu_and_acc_inputs_reach_all_three_observed_traces() {
        for json in [
            include_str!("../../fixtures/telemetry-real/lmu47-input.sequence.json"),
            include_str!("../../fixtures/telemetry-real/acc.snapshot.json"),
        ] {
            let snapshots = crate::workshop::snapshots_from_json(json).expect("corpus real");
            let mut widget = Widget::new(&Settings::default(), Preferences::default());
            for snapshot in &snapshots {
                widget.ingest(snapshot, Preferences::default());
            }
            if snapshots.len() > 1 {
                assert!(widget.trace.samples().len() > 1);
            }
            let sample = widget.trace.samples().back().expect("muestra observada");
            let player = snapshots
                .last()
                .expect("foto")
                .state
                .player
                .expect("jugador");
            let percent = |q: Quality<f64>| q.current().map(|v| (v * 100.0).round());
            assert_eq!(sample.throttle, percent(player.telemetry.throttle));
            assert_eq!(sample.brake, percent(player.telemetry.brake));
            assert_eq!(sample.clutch, percent(player.telemetry.clutch));
        }
    }

    #[test]
    fn unsupported_clutch_uses_two_bars_and_has_no_trace() {
        let mut snapshot = vantare_ipc::snapshot_from_json(include_str!(
            "../../fixtures/telemetry-real/lmu47.snapshot.json"
        ))
        .expect("corpus");
        snapshot
            .state
            .player
            .as_mut()
            .expect("jugador")
            .telemetry
            .clutch = Quality::Unavailable;
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        widget.ingest(&snapshot, Preferences::default());
        assert!(!widget.vm.show_clutch);
        assert_eq!(widget.trace.samples()[0].clutch, None);
        assert_eq!(widget.trace.samples()[0].brake, Some(100.0));
    }

    #[test]
    fn reconstructed_workshop_scene_keeps_the_frozen_available_channels() {
        let snapshots = crate::workshop::snapshots_from_json(include_str!(
            "../../fixtures/input-telemetry.sequence.json"
        ))
        .expect("secuencia DTO");
        let snapshot = snapshots.last().expect("foto actual");
        let vm = vantare_domain::input_telemetry::project(snapshot, Preferences::default());
        assert_eq!(vm.status_text, None);
        assert_eq!(
            (vm.gear.as_str(), vm.speed.as_str(), vm.rpm.as_str()),
            ("4", "180 KPH", "7200")
        );
        assert_eq!(vm.pedals, [Some(6.0), Some(13.0), Some(75.0)]);
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        for snapshot in &snapshots {
            widget.ingest(snapshot, Preferences::default());
        }
        assert_eq!(widget.trace.samples().len(), 40);
        assert_eq!(widget.trace.samples()[0].throttle, Some(55.0));
        assert_eq!(widget.trace.samples()[23].throttle, Some(0.0));
        assert_eq!(widget.trace.samples()[39].throttle, Some(100.0));
    }

    #[test]
    fn transition_is_linear_bounded_and_does_not_animate_missing_data() {
        for (ms, expected) in [(0, 20.0), (40, 60.0), (80, 100.0), (1000, 100.0)] {
            assert_eq!(
                interpolate(
                    [Some(20.0), None, Some(80.0)],
                    [Some(100.0), Some(0.0), None],
                    Duration::from_millis(ms)
                ),
                [Some(expected), Some(0.0), None]
            );
        }
    }

    #[test]
    fn repaint_depends_on_visible_values_and_motion_finishes() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(&Settings::default(), prefs);
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.player = Some(Player {
            ..Player::default()
        });
        assert!(!widget.ingest(&snapshot, prefs));
        if let Some(player) = snapshot.state.player.as_mut() {
            player.telemetry.throttle = Quality::Reliable(0.75);
        }
        snapshot.sequence += 1;
        assert!(widget.ingest(&snapshot, prefs));
        assert!(widget.moving(Instant::now()));
        snapshot.sequence += 1;
        assert!(!widget.ingest(&snapshot, prefs));
        widget.started = Instant::now().checked_sub(TRANSITION);
        assert!(!widget.moving(Instant::now()));
        assert_eq!(widget.frame(prefs, false).1, Wake::Idle);
        snapshot.state.player = None;
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.moving(Instant::now()));
    }
}
