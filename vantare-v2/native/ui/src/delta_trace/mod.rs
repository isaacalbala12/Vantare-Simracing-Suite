//! Delta-trace Eficiencia, geometría congelada de `reference/delta-trace`.
//! El delta actual se proyecta en domain. Sin historia canónica en Snapshot,
//! no hay curva, punto ni tendencia inferidos; solo la guía estática de cero.

use gpui::{
    App, BorderStyle, Bounds, Corners, Edges, Window, fill, linear_color_stop, linear_gradient,
    point, px, quad, size,
};
use vantare_domain::{Snapshot, delta_trace::ViewModel, format::Preferences};

use crate::app::{Paint, Wake, replace_if_changed};
use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

// El SVG de 300 × 70 crece al ancho interior (976 px). El frame de layout
// mide 1000 × 144, pero el renderer productivo desborda hasta 277.71875 px.
pub const SIZE: (f32, f32) = (1000.0, 277.718_75);
const GRAPH_HEIGHT: f32 = SIZE.1 - 50.0;

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
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
    let trend_ink = ink(9.0, 600.0, 0.08, col(tokens::MUTED, 1.0));
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

pub(crate) struct Widget {
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: vantare_domain::delta_trace::project(&Snapshot::default(), prefs),
        }
    }

    #[allow(clippy::unused_self)] // Firma del registro; tamaño fijo del productivo.
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(
            &mut self.vm,
            vantare_domain::delta_trace::project(snapshot, prefs),
        )
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        (
            Box::new(move |window, cx| paint(&vm, window, cx)),
            Wake::Idle,
        )
    }

    #[cfg(feature = "parity-capture")]
    #[allow(clippy::unused_self)] // No hay animaciones ni avisos temporales en TSX/CSS.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Player, Quality, format::Language};

    #[test]
    fn repaint_only_when_displayed_values_or_language_change() {
        let prefs = Preferences::default();
        let mut widget = Widget::new(prefs);
        let mut snapshot = Snapshot::default();
        assert!(!widget.ingest(&snapshot, prefs));
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

    #[cfg(feature = "parity-capture")]
    #[test]
    fn a_static_widget_never_keeps_capture_waiting_for_animation() {
        assert!(!Widget::new(Preferences::default()).animating());
    }
}
