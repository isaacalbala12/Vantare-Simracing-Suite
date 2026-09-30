//! Radar en diseño Eficiencia (`RadarFunctional.tsx`): lienzo de 220 x 220 con
//! el jugador en el centro y 3 px por metro. Geometría y colores del CSS de
//! producción; escena de paridad congelada en `ui/reference/radar.geometry.json`.

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

/// Coche de 16 x 32 con trazo SVG centrado: 2 px, o 3 si es doblado cercano.
fn paint_car(window: &mut Window, cx: f32, cy: f32, fill: u32, highlighted: bool) {
    let (w, h) = CAR;
    let stroke_width = if highlighted { 3.0 } else { 2.0 };
    let outset = stroke_width / 2.0;
    window.paint_quad(quad(
        rect(
            cx - w / 2.0 - outset,
            cy - h / 2.0 - outset,
            w + stroke_width,
            h + stroke_width,
        ),
        Corners::all(px(CAR_RADIUS + outset)),
        col(fill, 1.0),
        Edges::all(px(stroke_width)),
        if highlighted {
            col(0xf1c16c, 1.0)
        } else {
            col(STROKE, 0.9)
        },
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
    // Trazos de 5 px de y = 94 a 126; los extremos redondos sobresalen 2,5 px.
    for (active, x) in [(vm.overlap_left, 92.0), (vm.overlap_right, 128.0)] {
        if active {
            window.paint_quad(quad(
                rect(x - 2.5, 91.5, 5.0, 37.0),
                Corners::all(px(2.5)),
                col(0xf09a52, 1.0),
                Edges::all(px(0.0)),
                col(0x000000, 0.0),
                BorderStyle::default(),
            ));
        }
    }
    paint_car(window, CENTER, CENTER, tokens::INK, false);
    for car in &vm.cars {
        // Precedencia CSS: solape > doblado > cercano > normal.
        let fill = if car.overlap {
            0xf09a52
        } else if car.lapped {
            0x35688f
        } else if car.near {
            0xf1c16c
        } else {
            0x76b7da
        };
        // `right_m` crece a la derecha y `ahead_m` hacia delante (arriba en pantalla).
        paint_car(
            window,
            CENTER + car.right_m as f32 * SCALE,
            CENTER - car.ahead_m as f32 * SCALE,
            fill,
            car.lapped && car.near && !car.overlap,
        );
    }
}

use crate::app::{Paint, Wake, replace_if_changed};
use vantare_domain::{Snapshot, format::Preferences};

empty_settings!();

pub(crate) struct Widget {
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(_settings: &Settings, _prefs: Preferences) -> Self {
        Self {
            vm: vantare_domain::radar::project(&Snapshot::default()),
        }
    }

    // Firma común del registro: este widget tiene tamaño fijo.
    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, _prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, vantare_domain::radar::project(snapshot))
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
    fn parity_scene_keeps_the_reference_sides() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/radar.snapshot.json"))
                .expect("escena Radar DTO v3 válida");
        let vm = vantare_domain::radar::project(&snapshot);
        let positions: Vec<_> = vm
            .cars
            .iter()
            .map(|car| (car.ahead_m, car.right_m))
            .collect();
        assert_eq!(positions, [(0.0, -4.0), (-12.0, 8.0), (20.0, -2.0)]);
        assert!(vm.overlap_left && !vm.overlap_right);
        let flags: Vec<_> = vm
            .cars
            .iter()
            .map(|car| (car.overlap, car.near, car.lapped))
            .collect();
        assert_eq!(
            flags,
            [
                (true, true, false),
                (false, false, false),
                (false, false, true)
            ]
        );
    }

    #[test]
    fn repaint_only_on_a_new_view_model() {
        let mut widget = Widget::new(&Settings, Preferences::default());
        assert!(widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(!widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(widget.ingest(&source::synthetic(300), Preferences::default()));
    }
}
