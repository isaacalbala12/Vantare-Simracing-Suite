//! Pedales en diseño Eficiencia (`PedalsFunctional.tsx`): tres barras
//! (embrague, freno, acelerador) con su rótulo y su valor. Geometría y colores
//! del CSS de producción para el tamaño por defecto (120 x 160).

use gpui::{
    App, BorderStyle, Corners, Edges, Window, linear_color_stop, linear_gradient, px, quad,
};
use vantare_domain::pedals::ViewModel;

use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

pub const SIZE: (f32, f32) = (120.0, 160.0);
const PAD_X: f32 = 10.0;
const PAD_TOP: f32 = 8.0;
const PAD_BOTTOM: f32 = 10.0;
const GAP: f32 = 8.0;
const TRACK_W: f32 = 14.0;
const LABEL_H: f32 = 6.0;
const VALUE_H: f32 = 10.0;

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    paint_panel(window, width, height, 0.90);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        linear_gradient(
            180.0,
            linear_color_stop(col(0xffffff, 0.04), 0.0),
            linear_color_stop(col(0xffffff, 0.0), 0.32),
        ),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));

    let columns = [
        ("C", vm.clutch, &vm.clutch_text, 0xc9a15c),
        ("B", vm.brake, &vm.brake_text, tokens::LOSS),
        ("T", vm.throttle, &vm.throttle_text, 0x6fae7d),
    ];
    let column_w = (width - 2.0 * PAD_X - GAP * 2.0) / 3.0;
    let track_top = PAD_TOP;
    // Columna: pista (flexible) + 4 + rótulo + 4 + valor.
    let track_h = height - PAD_TOP - PAD_BOTTOM - (4.0 + LABEL_H + 4.0 + VALUE_H);
    let label_ink = ink(6.0, 600.0, 0.18, col(tokens::MUTED, 0.78));
    let value_ink = ink(10.0, 700.0, 0.0, col(tokens::INK, 1.0));
    for (index, (label, value, text_value, color)) in columns.into_iter().enumerate() {
        let left = PAD_X + index as f32 * (column_w + GAP);
        let mid = left + column_w / 2.0;
        let track_x = mid - TRACK_W / 2.0;
        window.paint_quad(quad(
            rect(track_x, track_top, TRACK_W, track_h),
            Corners::all(px(4.0)),
            linear_gradient(
                180.0,
                linear_color_stop(col(tokens::INK, 0.08), 0.0),
                linear_color_stop(col(tokens::INK, 0.05), 1.0),
            ),
            Edges::all(px(1.0)),
            col(tokens::INK, 0.08),
            BorderStyle::default(),
        ));
        if let Some(value) = value {
            // Relleno dentro del borde de 1 px, anclado abajo.
            let inner_h = track_h - 2.0;
            let fill_h = fill_height(value, inner_h);
            window.paint_quad(quad(
                rect(
                    track_x + 1.0,
                    track_top + 1.0 + inner_h - fill_h,
                    TRACK_W - 2.0,
                    fill_h,
                ),
                Corners {
                    top_left: px(3.0),
                    top_right: px(3.0),
                    bottom_right: px(0.0),
                    bottom_left: px(0.0),
                },
                col(color, 1.0),
                Edges::all(px(0.0)),
                col(0x000000, 0.0),
                BorderStyle::default(),
            ));
        }
        let label_top = track_top + track_h + 4.0;
        let label_x = mid - text::width(window, label, &label_ink) / 2.0;
        text::draw(
            window,
            cx,
            label,
            label_x,
            text::baseline(label_top, LABEL_H, 6.0),
            &label_ink,
        );
        let value_top = label_top + LABEL_H + 4.0;
        let value_x = mid - text::width(window, text_value, &value_ink) / 2.0;
        text::draw(
            window,
            cx,
            text_value,
            value_x,
            text::baseline(value_top, VALUE_H, 10.0),
            &value_ink,
        );
    }
    // El marco (::after) se compone al final; 12 % en los lados y 24 % arriba.
    // La bandera no está en este ViewModel: se conserva el borde neutro.
    paint_frame(window, width, height);
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
            ..Edges::all(px(0.0))
        },
        col(0xffffff, 0.136),
        BorderStyle::default(),
    ));
}

fn fill_height(value: f64, inner_h: f32) -> f32 {
    // PedalsFunctional redondea primero el porcentaje, no la altura en píxeles.
    (value * 100.0).round() as f32 / 100.0 * inner_h
}

use crate::app::{Paint, Wake, replace_if_changed};
use vantare_domain::{Snapshot, format::Preferences};

pub(crate) struct Widget {
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: vantare_domain::pedals::project(&Snapshot::default(), prefs),
        }
    }

    // Firma común del registro: este widget tiene tamaño fijo.
    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(
            &mut self.vm,
            vantare_domain::pedals::project(snapshot, prefs),
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
    #[allow(clippy::unused_self)] // Firma común; este widget no anima.
    pub(crate) fn animating(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::source;

    #[test]
    fn fill_rounds_percent_before_resolving_the_track_height() {
        assert!((fill_height(0.125, 116.0) - 15.08).abs() < 0.001);
        assert!(fill_height(0.0, 116.0).abs() < f32::EPSILON);
        assert!((fill_height(1.0, 116.0) - 116.0).abs() < f32::EPSILON);
    }

    #[test]
    fn repaint_only_on_a_new_view_model() {
        let mut widget = Widget::new(Preferences::default());
        assert!(widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(!widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(widget.ingest(&source::synthetic(300), Preferences::default()));
    }
}
