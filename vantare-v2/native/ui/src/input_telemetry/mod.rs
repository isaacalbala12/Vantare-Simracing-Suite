//! Input telemetry Eficiencia, layout por defecto de 420 × 110.
//! La traza corta pertenece al widget y solo conserva muestras observadas.

use crate::efficiency::preview::PaintWindow as Window;
use std::time::{Duration, Instant};

use gpui::{
    App, BorderStyle, Corners, Edges, PathBuilder, linear_color_stop, linear_gradient, point, px,
    quad,
};
use vantare_domain::{
    CarId, SessionId, Snapshot,
    format::Preferences,
    input_telemetry::{Sample, Trace, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

const SIZE: (f32, f32) = (420.0, 110.0);
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
            history_seconds: 4,
            show_clutch: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[(
        "historySeconds=4:full-window",
        "El valor por defecto conserva 120 muestras (2,38 s a 20 ms) por compatibilidad visual",
    )];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            history_seconds: self.history_seconds.clamp(1, 8),
            ..self.clone()
        }
    }
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = vantare_domain::input_telemetry::project(snapshot, prefs);
        vm.show_clutch = self.show_clutch;
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

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let now = Instant::now();
        let pedals = self.pedals_at(now);
        let samples: Vec<_> = self.trace.samples().iter().copied().collect();
        let wake = if self.moving(now) {
            Wake::Frame
        } else {
            Wake::Idle
        };
        (
            Box::new(move |window, cx| paint(&vm, pedals, &samples, window, cx)),
            wake,
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        self.moving(Instant::now())
    }
}

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

fn paint(
    vm: &ViewModel,
    pedals: [Option<f64>; 3],
    samples: &[Sample],
    window: &mut Window,
    cx: &mut App,
) {
    paint_surface(window);
    let top = if vm.status_text.is_some() { 28.0 } else { 10.0 };
    let graph_height = SIZE.1 - top - 8.0;
    let graph_width = 286.0;
    // Solo acelerador observado: el contrato de Trace no contiene freno/embrague.
    for fraction in [0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0] {
        window.paint_quad(gpui::fill(
            rect(6.0, top + fraction * graph_height, graph_width, 1.0),
            col(tokens::INK, 0.12),
        ));
    }
    let (ox, oy) = text::origin();
    let mut path = PathBuilder::stroke(px(2.0));
    let mut connected = false;
    let mut segments = 0;
    for (index, sample) in samples.iter().enumerate() {
        if let Some(value) = sample.throttle {
            let x =
                6.0 + index as f32 / samples.len().saturating_sub(1).max(1) as f32 * graph_width;
            let y = top + graph_height * (1.0 - value as f32 / 100.0);
            let position = point(px(ox + x), px(oy + y));
            if connected && !sample.break_before {
                path.line_to(position);
                segments += 1;
            } else {
                path.move_to(position);
            }
            connected = true;
        } else {
            connected = false;
        }
    }
    if segments > 0 {
        match path.build() {
            Ok(path) => window.paint_path(path, col(0x6fae7d, 1.0)),
            Err(error) => eprintln!("input-telemetry: traza: {error}"),
        }
    }
    let value_ink = ink(11.0, 700.0, 0.0, col(tokens::INK, 1.0));
    let count = if vm.show_clutch { 3.0 } else { 2.0 };
    let step = 60.0 / count;
    for (i, color) in [0xc9a15c, tokens::LOSS, 0x6fae7d].into_iter().enumerate() {
        if i == 0 && !vm.show_clutch {
            continue;
        }
        let index = if vm.show_clutch { i } else { i - 1 };
        let middle = 294.0 + index as f32 * step + step / 2.0;
        let bar_top = top + 14.0;
        let bar_height = SIZE.1 - bar_top - 8.0;
        window.paint_quad(quad(
            rect(middle - 7.0, bar_top, 14.0, bar_height),
            Corners::all(px(3.0)),
            col(tokens::INK, 0.07),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        if let Some(value) = pedals[i] {
            let height = bar_height * value as f32 / 100.0;
            if height > 0.0 {
                window.paint_quad(quad(
                    rect(middle - 7.0, SIZE.1 - 8.0 - height, 14.0, height),
                    Corners::all(px(3.0)),
                    col(color, 1.0),
                    Edges::all(px(0.0)),
                    col(0, 0.0),
                    BorderStyle::default(),
                ));
            }
        }
        let label = pedals[i].map_or_else(|| "—".into(), |value| format!("{value:.0}"));
        text::draw(
            window,
            cx,
            &label,
            middle - text::width(window, &label, &value_ink) / 2.0,
            text::baseline(top, 14.0, 11.0),
            &value_ink,
        );
    }
    let gear = ink(33.0, 800.0, 0.0, col(tokens::INK, 1.0));
    let rpm = format!("{} RPM", vm.rpm);
    for (value, y, line, style) in [
        (&vm.gear, 16.0, 40.0, gear),
        (&vm.speed, 58.0, 18.0, value_ink),
        (&rpm, 78.0, 18.0, value_ink),
    ] {
        let fitted = text::fit(window, value, &style, 62.0);
        text::draw(
            window,
            cx,
            &fitted,
            383.0 - text::width(window, &fitted, &style) / 2.0,
            text::baseline(y, line, style.size),
            &style,
        );
    }
    if let Some(status) = vm.status_text {
        let style = ink(14.0, 700.0, 0.0, col(0xe2c568, 1.0));
        let fitted = text::fit(window, status, &style, graph_width);
        text::draw(
            window,
            cx,
            &fitted,
            6.0,
            text::baseline(4.0, 20.0, 14.0),
            &style,
        );
    }
}

fn paint_surface(window: &mut Window) {
    let (width, height) = SIZE;
    paint_panel(window, width, height, 0.87);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0, 0.0),
        BorderStyle::default(),
    ));
    paint_frame(window, width, height);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, 6.0),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0, 0.0),
        Edges {
            top: px(1.0),
            right: px(0.0),
            bottom: px(0.0),
            left: px(0.0),
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
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
            Settings::default()
                .project(&snapshot, Preferences::default())
                .pedals[0],
            Some(40.0)
        );
    }

    use super::*;
    use vantare_domain::{Player, Quality};

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
        assert_eq!(widget.frame(prefs).1, Wake::Idle);
        snapshot.state.player = None;
        assert!(widget.ingest(&snapshot, prefs));
        assert!(!widget.moving(Instant::now()));
    }
}
