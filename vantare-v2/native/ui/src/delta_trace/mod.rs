//! Delta-trace Eficiencia, geometría congelada de `reference/delta-trace`.
//! El widget posee una traza pura de domain; Snapshot sigue siendo una foto.

use gpui::{
    App, BorderStyle, Bounds, Corners, Edges, PathBuilder, Window, fill, linear_color_stop,
    linear_gradient, point, px, quad, size,
};
use vantare_domain::{
    Snapshot,
    delta_trace::{Sample, Trace, Trend, ViewModel},
    format::Preferences,
};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

// El SVG de 300 × 70 crece al ancho interior (976 px). El frame de layout
// mide 1000 × 144, pero el renderer productivo desborda hasta 277.71875 px.
pub const SIZE: (f32, f32) = (1000.0, 277.718_75);
const GRAPH_HEIGHT: f32 = SIZE.1 - 50.0;

fn paint(vm: &ViewModel, samples: &[Sample], window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    paint_panel(window, width, height, 0.87);
    // Igual que Standings: primer tramo del brillo CSS de 120°, resto < 1 %.
    // Candidato al kit cuando su propietario reúna los paneles de este lote.
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            120.0,
            linear_color_stop(col(0xffffff, 0.03), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.38),
        ),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));
    let current_ink = ink(22.0, 700.0, 0.0, col(tokens::INK, 1.0));
    text::draw(
        window,
        cx,
        &vm.current_text,
        12.0,
        text::baseline(10.0, 22.0, 22.0),
        &current_ink,
    );
    let trend_color = match vm.trend {
        Trend::Gaining => 0x7fb686,
        Trend::Losing => 0xd95360,
        _ => tokens::MUTED,
    };
    let trend_ink = ink(9.0, 600.0, 0.08, col(trend_color, 1.0));
    let trend_x = width - 12.0 - text::width(window, vm.trend_text, &trend_ink);
    text::draw(
        window,
        cx,
        vm.trend_text,
        trend_x,
        text::baseline(10.0, 22.0, 22.0),
        &trend_ink,
    );

    // SVG stroke-width=1 escala con viewBox 300 × 70. La guía no representa
    // un dato: permanece sin fabricar el punto a cero del fallback TSX.
    // GPUI no suaviza los bordes rectos de un quad: conservar la cobertura de
    // las filas parciales del trazo SVG, en píxeles físicos después del origen.
    let (ox, oy) = text::origin();
    let scale = window.scale_factor();
    let stroke = GRAPH_HEIGHT / 70.0;
    let top = (oy + 40.0 + GRAPH_HEIGHT / 2.0 - stroke / 2.0) * scale;
    let bottom = top + stroke * scale;
    for row in top.floor() as i32..bottom.ceil() as i32 {
        let row = row as f32;
        let coverage = bottom.min(row + 1.0) - top.max(row);
        window.paint_quad(fill(
            Bounds::new(
                point(px(ox + 12.0), px(row / scale)),
                size(px(width - 24.0), px(1.0 / scale)),
            ),
            col(tokens::INK, 0.25 * coverage),
        ));
    }

    paint_trace(samples, window);
    if let Some(status) = vm.status_text {
        text::draw(
            window,
            cx,
            status,
            12.0,
            text::baseline(38.0, 18.0, 12.0),
            &ink(12.0, 700.0, 0.0, col(0xe2c568, 1.0)),
        );
    }

    paint_frame(window, width, height);
    // ::after tiene borde superior al 24 %, el resto al 12 % (como Standings).
    window.paint_quad(quad(
        rect(0.0, 0.0, width, tokens::RADIUS),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_right: px(0.0),
            bottom_left: px(0.0),
        },
        col(0x000000, 0.0),
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

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub window_seconds: f64,
    pub show_sectors: bool,
    pub show_track_map: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            window_seconds: 4.0,
            show_sectors: true,
            show_track_map: true,
        }
    }
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[
        ("showSectors", "Snapshot no publica deltas por sector"),
        (
            "showTrackMap",
            "Snapshot no publica trackPath ni turnInsight",
        ),
    ];
    #[must_use]
    pub fn normalized(&self) -> Self {
        Self {
            window_seconds: if self.window_seconds.is_finite() {
                self.window_seconds.clamp(1.0, 8.0)
            } else {
                4.0
            },
            ..self.clone()
        }
    }
}

fn paint_trace(samples: &[Sample], window: &mut Window) {
    let min = samples
        .iter()
        .filter_map(|p| p.delta_seconds)
        .fold(-0.5_f64, f64::min);
    let max = samples
        .iter()
        .filter_map(|p| p.delta_seconds)
        .fold(0.5_f64, f64::max);
    let span = (max - min).max(0.01);
    let (ox, oy) = text::origin();
    let position = |i: usize, value: f64| {
        point(
            px(ox
                + 12.0
                + i as f32 / (samples.len().saturating_sub(1).max(1)) as f32 * (SIZE.0 - 24.0)),
            px(oy + 40.0 + GRAPH_HEIGHT * (1.0 - ((value - min) / span) as f32)),
        )
    };
    let mut path = PathBuilder::stroke(px(2.0 * GRAPH_HEIGHT / 70.0));
    let mut connected = false;
    let mut segments = 0;
    for (i, sample) in samples.iter().enumerate() {
        if let Some(value) = sample.delta_seconds {
            let p = position(i, value);
            if connected && !sample.break_before {
                path.line_to(p);
                segments += 1;
            } else {
                path.move_to(p);
            }
            connected = true;
        } else {
            connected = false;
        }
    }
    if segments > 0 {
        match path.build() {
            Ok(path) => window.paint_path(path, col(0xc1121f, 1.0)),
            Err(error) => eprintln!("delta-trace: trazar: {error}"),
        }
    }
    if let Some(value) = samples.last().and_then(|p| p.delta_seconds) {
        let center = position(samples.len() - 1, value);
        let r = px(3.0 * GRAPH_HEIGHT / 70.0);
        let k = r * 0.552_284_8;
        let p = |x, y| point(center.x + x, center.y + y);
        let mut dot = PathBuilder::fill();
        dot.move_to(p(r, px(0.0)));
        dot.cubic_bezier_to(p(px(0.0), r), p(r, k), p(k, r));
        dot.cubic_bezier_to(p(-r, px(0.0)), p(-k, r), p(-r, k));
        dot.cubic_bezier_to(p(px(0.0), -r), p(-r, -k), p(-k, -r));
        dot.cubic_bezier_to(p(r, px(0.0)), p(k, -r), p(r, -k));
        dot.close();
        match dot.build() {
            Ok(path) => window.paint_path(path, col(tokens::INK, 1.0)),
            Err(error) => eprintln!("delta-trace: punto: {error}"),
        }
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
    trace: Trace,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            settings: settings.clone(),
            vm: vantare_domain::delta_trace::project(&Snapshot::default(), prefs),
            trace: Trace::default(),
        }
    }

    #[allow(clippy::unused_self)] // Firma del registro; tamaño fijo del productivo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let changed = self.trace.push_with_window(
            snapshot,
            std::time::Duration::from_secs_f64(self.settings.window_seconds),
        );
        replace_if_changed(&mut self.vm, self.trace.project(snapshot, prefs)) || changed
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let samples: Vec<_> = self.trace.samples().iter().copied().collect();
        (
            Box::new(move |window, cx| paint(&vm, &samples, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // No hay animaciones ni avisos temporales en TSX/CSS.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Delta, LapCount, LapTimes};
        // La historia distingue pérdida real de fotos; no introducir huecos por cadencia.
        crate::demand::signals(0, &[Delta, LapTimes, LapCount])
    }
}

#[cfg(test)]
mod tests {
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
        assert!(matches!(widget.frame(prefs).1, Wake::Idle));
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
        assert!(matches!(widget.frame(Preferences::default()).1, Wake::Idle));
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn a_static_widget_never_keeps_capture_waiting_for_animation() {
        assert!(!Widget::new(&Settings::default(), Preferences::default()).animating());
    }
}
