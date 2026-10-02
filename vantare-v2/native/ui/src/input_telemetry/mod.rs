//! Input telemetry Eficiencia, layout por defecto de 360 × 140.
//! La traza corta pertenece al widget y solo conserva muestras observadas.

use crate::efficiency::preview::PaintWindow as Window;
use std::time::{Duration, Instant};

use gpui::{
    App, BorderStyle, Corners, Edges, FontWeight, TextAlign, TextRun, font, linear_color_stop,
    linear_gradient, point, px, quad,
};
use vantare_domain::{
    Snapshot,
    format::Preferences,
    input_telemetry::{Sample, Trace, ViewModel},
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

const SIZE: (f32, f32) = (360.0, 140.0);
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
            trace: Trace::default(),
        }
    }

    #[allow(clippy::unused_self)] // Firma del registro; tamaño por defecto fijo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let trace_changed = self.trace.push_with_window(
            snapshot,
            Duration::from_secs(u64::from(self.settings.history_seconds)),
        );
        let next = self.settings.project(snapshot, prefs);
        if next.pedals != self.vm.pedals {
            let now = Instant::now();
            self.from = self.pedals_at(now);
            self.started = Some(now);
        }
        replace_if_changed(&mut self.vm, next) || trace_changed
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
    let mut body_top = 10.0;
    if let Some(status) = vm.status_text {
        text::draw(
            window,
            cx,
            status,
            24.0,
            text::baseline(20.0, 18.0, 12.0),
            &ink(12.0, 700.0, 0.0, col(0xe2c568, 1.0)),
        );
        body_top += 38.0; // .vf-status: 18 px de línea y 20 px de padding.
    }
    let label_ink = ink(7.0, 600.0, 0.1, col(tokens::MUTED, 1.0));
    let value_ink = ink(12.0, 650.0, 0.0, col(tokens::INK, 1.0));
    text::draw(
        window,
        cx,
        &vm.gear,
        12.0,
        text::baseline(body_top, 32.0, 32.0),
        &ink(32.0, 800.0, 0.0, col(tokens::INK, 1.0)),
    );
    let speed_label_w = text::width(window, vm.speed_label, &label_ink);
    let rpm_label_w = text::width(window, "RPM", &label_ink);
    let primary_w = (speed_label_w + 4.0 + text::width(window, &vm.speed, &value_ink))
        .max(rpm_label_w + 4.0 + text::width(window, &vm.rpm, &value_ink))
        .max(text::width(
            window,
            &vm.gear,
            &ink(32.0, 800.0, 0.0, col(tokens::INK, 1.0)),
        ));
    for (label, label_w, value, top) in [
        (vm.speed_label, speed_label_w, &vm.speed, body_top + 38.0),
        ("RPM", rpm_label_w, &vm.rpm, body_top + 56.0),
    ] {
        text::draw(
            window,
            cx,
            label,
            12.0,
            text::baseline(top + 4.0, 7.0, 7.0),
            &label_ink,
        );
        text::draw(
            window,
            cx,
            value,
            12.0 + label_w + 4.0,
            text::baseline(top, 12.0, 12.0),
            &value_ink,
        );
    }
    let bars_left = 12.0 + primary_w + 14.0;
    paint_bars(
        vm,
        pedals,
        bars_left,
        body_top,
        !samples.is_empty(),
        window,
        cx,
    );
    if !samples.is_empty() {
        // CSS: 28 px, margin-top 8, padding-top 6, borde 1; contenido de 21 px.
        window.paint_quad(gpui::fill(
            rect(12.0, 102.0, 336.0, 1.0),
            col(tokens::INK, 0.12),
        ));
        let column = ((336.0 - (samples.len() - 1) as f32) / samples.len() as f32).max(2.0);
        for (i, sample) in samples.iter().enumerate() {
            if let Some(value) = sample.throttle {
                let height = 21.0 * value as f32 / 100.0;
                if height > 0.0 {
                    window.paint_quad(quad(
                        rect(
                            12.0 + i as f32 * (column + 1.0),
                            130.0 - height,
                            column,
                            height,
                        ),
                        Corners {
                            top_left: px(1.0),
                            top_right: px(1.0),
                            ..Corners::default()
                        },
                        col(0x6fae7d, 0.55),
                        Edges::all(px(0.0)),
                        col(0, 0.0),
                        BorderStyle::default(),
                    ));
                }
            }
        }
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

#[allow(clippy::cast_possible_truncation, clippy::cast_precision_loss)] // Tres columnas y 0..100 %.
fn paint_bars(
    vm: &ViewModel,
    pedals: [Option<f64>; 3],
    bars_left: f32,
    body_top: f32,
    has_trace: bool,
    window: &mut Window,
    cx: &mut App,
) {
    let width = SIZE.0;
    let track_h = (SIZE.1 - 10.0 - body_top - 9.0 - if has_trace { 36.0 } else { 0.0 }).max(40.0);
    let count = if vm.show_clutch { 3.0 } else { 2.0 };
    let column_w = (width - 12.0 - bars_left - 10.0 * (count - 1.0)) / count;
    for (i, color) in [0xc9a15c, tokens::LOSS, 0x6fae7d].into_iter().enumerate() {
        if i == 0 && !vm.show_clutch {
            continue;
        }
        let index = if vm.show_clutch { i } else { i - 1 };
        let middle = bars_left + index as f32 * (column_w + 10.0) + column_w / 2.0;
        window.paint_quad(quad(
            rect(middle - 6.0, body_top, 12.0, track_h),
            Corners::all(px(3.0)),
            col(tokens::INK, 0.07),
            Edges::all(px(0.0)),
            col(0, 0.0),
            BorderStyle::default(),
        ));
        if let Some(value) = pedals[i] {
            let fill_h = track_h * value as f32 / 100.0;
            if fill_h > 0.0 {
                window.paint_quad(quad(
                    rect(middle - 6.0, body_top + track_h - fill_h, 12.0, fill_h),
                    Corners {
                        top_left: px(3.0),
                        top_right: px(3.0),
                        // overflow:hidden de la pista recorta el pie del relleno.
                        bottom_left: px(3.0),
                        bottom_right: px(3.0),
                    },
                    col(color, 1.0),
                    Edges::all(px(0.0)),
                    col(0, 0.0),
                    BorderStyle::default(),
                ));
            }
        }
        let label = if vm.pedals[i].is_some() {
            vm.pedal_labels[i].to_owned()
        } else {
            format!("{} —", vm.pedal_labels[i])
        };
        paint_label(&label, middle, body_top + track_h + 3.0, window, cx);
    }
}

// El kit solo registra Inter. Chrome resuelve ui-monospace a Consolas en Windows;
// el tracking .18em de estos rótulos se conserva sin añadir fuentes/dependencias.
fn paint_label(label: &str, middle: f32, top: f32, window: &mut Window, cx: &mut App) {
    let (ox, oy) = text::origin();
    let scale = window.preview_scale();
    let mut font = font("Consolas");
    font.weight = FontWeight(600.0);
    let glyphs: Vec<_> = label
        .chars()
        .map(|ch| {
            let glyph = ch.to_string();
            let run = TextRun {
                len: glyph.len(),
                font: font.clone(),
                color: col(tokens::MUTED, 1.0),
                background_color: None,
                underline: None,
                strikethrough: None,
            };
            window
                .text_system()
                .shape_line(glyph.into(), px(6.0 * scale), &[run], None)
        })
        .collect();
    let width: f32 = glyphs
        .iter()
        .map(|line| f32::from(line.width) + 1.08 * scale)
        .sum();
    let mut x = middle * scale - width / 2.0 + ox;
    for line in glyphs {
        let ascent = f32::from(line.ascent);
        let descent = f32::from(line.descent);
        let baseline = top * scale + oy + ascent + ((6.0 * scale - ascent - descent) / 2.0).floor();
        if let Err(error) = line.paint(
            point(px(x), px(baseline - ascent)),
            px(ascent + descent),
            TextAlign::Left,
            None,
            window,
            cx,
        ) {
            eprintln!("input-telemetry: pintar rótulo: {error}");
        }
        x += f32::from(line.width) + 1.08 * scale;
    }
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
