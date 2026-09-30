//! Pedales en diseño Eficiencia (`PedalsFunctional.tsx`): tres barras
//! (embrague, freno, acelerador) con su rótulo y su valor. Geometría y colores
//! del CSS de producción para el tamaño por defecto (120 x 160); sin paridad de
//! píxel en esta fase.

use gpui::{App, BorderStyle, Corners, Edges, Window, px, quad};
use vantare_domain::pedals::ViewModel;

use crate::standings::view::{col, rect};
use crate::text::{self, Ink};

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
    let panel = rect(0.0, 0.0, width, height);
    window.paint_quad(quad(
        panel,
        Corners::all(px(6.0)),
        col(0x101113, 0.90),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));
    // Marco interior de 1 px; la bandera de sesión no está en el ViewModel de pedales.
    window.paint_quad(quad(
        panel,
        Corners::all(px(6.0)),
        col(0x000000, 0.0),
        Edges::all(px(1.0)),
        col(0xffffff, 0.12),
        BorderStyle::default(),
    ));

    let columns = [
        ("C", vm.clutch, &vm.clutch_text, 0xc9a15c),
        ("B", vm.brake, &vm.brake_text, 0xd95360),
        ("T", vm.throttle, &vm.throttle_text, 0x6fae7d),
    ];
    let column_w = (width - 2.0 * PAD_X - GAP * 2.0) / 3.0;
    let track_top = PAD_TOP;
    // Columna: pista (flexible) + 4 + rótulo + 4 + valor.
    let track_h = height - PAD_TOP - PAD_BOTTOM - (4.0 + LABEL_H + 4.0 + VALUE_H);
    let label_ink = Ink {
        size: 6.0,
        weight: 600.0,
        tracking: 0.18 * 6.0,
        color: col(0xb9b9bd, 0.78),
    };
    let value_ink = Ink {
        size: 10.0,
        weight: 700.0,
        tracking: 0.0,
        color: col(0xf5f5f5, 1.0),
    };
    for (index, (label, value, text_value, color)) in columns.into_iter().enumerate() {
        let left = PAD_X + index as f32 * (column_w + GAP);
        let mid = left + column_w / 2.0;
        let track_x = mid - TRACK_W / 2.0;
        window.paint_quad(quad(
            rect(track_x, track_top, TRACK_W, track_h),
            Corners::all(px(4.0)),
            col(0xf5f5f5, 0.065),
            Edges::all(px(1.0)),
            col(0xf5f5f5, 0.08),
            BorderStyle::default(),
        ));
        if let Some(value) = value {
            // Relleno dentro del borde de 1 px, anclado abajo.
            let inner_h = track_h - 2.0;
            let fill_h = (value as f32 * inner_h).round();
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
}
