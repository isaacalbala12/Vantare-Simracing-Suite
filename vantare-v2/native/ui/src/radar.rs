//! Radar en diseño Eficiencia (`RadarFunctional.tsx`): lienzo de 220 x 220 con
//! el jugador en el centro y 3 px por metro. Geometría y colores del CSS de
//! producción; sin paridad de píxel en esta fase.

use gpui::{App, BorderStyle, Corners, Edges, Window, px, quad};
use vantare_domain::{Capability, radar::ViewModel};

use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_rect, rect, tokens};

pub const SIZE: (f32, f32) = (220.0, 220.0);
const CENTER: f32 = 110.0;
/// Píxeles por metro (`SCALE` de `RadarFunctional.tsx`).
const SCALE: f32 = 3.0;
const CAR: (f32, f32) = (16.0, 32.0);
const CAR_RADIUS: f32 = 5.0;
const STROKE: u32 = 0x0c0e11;

/// Coche de 16 x 32 con contorno de 2 px hacia fuera, como el trazo SVG.
fn paint_car(window: &mut Window, cx: f32, cy: f32, fill: u32) {
    let (w, h) = CAR;
    window.paint_quad(quad(
        rect(cx - w / 2.0 - 1.0, cy - h / 2.0 - 1.0, w + 2.0, h + 2.0),
        Corners::all(px(CAR_RADIUS + 1.0)),
        col(fill, 1.0),
        Edges::all(px(2.0)),
        col(STROKE, 0.9),
        BorderStyle::default(),
    ));
}

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    if vm.capability < Capability::WithData {
        let ink = ink(11.0, 500.0, 0.0, col(0xd5d5d8, 1.0));
        let message = "Sin posición espacial";
        let x = (SIZE.0 - text::width(window, message, &ink)) / 2.0;
        text::draw(
            window,
            cx,
            message,
            x,
            text::baseline(8.0, 13.0, 11.0),
            &ink,
        );
        return;
    }
    // Cruz: `M110 10V210 M10 110H210`.
    let cross = col(0xffffff, 0.09);
    paint_rect(window, CENTER - 0.5, 10.0, 1.0, 200.0, cross);
    paint_rect(window, 10.0, CENTER - 0.5, 200.0, 1.0, cross);
    // Avisos de coche al lado: trazos de 5 px de x = 92 / 128, de y = 94 a 126.
    for (active, x) in [(vm.overlap_left, 92.0), (vm.overlap_right, 128.0)] {
        if active {
            window.paint_quad(quad(
                rect(x - 2.5, 94.0, 5.0, 32.0),
                Corners::all(px(2.5)),
                col(0xf09a52, 1.0),
                Edges::all(px(0.0)),
                col(0x000000, 0.0),
                BorderStyle::default(),
            ));
        }
    }
    paint_car(window, CENTER, CENTER, tokens::INK);
    for car in &vm.cars {
        let fill = if car.overlap { 0xf09a52 } else { 0x76b7da };
        // `right_m` crece a la derecha y `ahead_m` hacia delante (arriba en pantalla).
        paint_car(
            window,
            CENTER + car.right_m as f32 * SCALE,
            CENTER - car.ahead_m as f32 * SCALE,
            fill,
        );
    }
}
