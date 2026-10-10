//! Pedales en diseño Eficiencia (`PedalsFunctional.tsx`): tres barras
//! (embrague, freno, acelerador) con su rótulo y su valor. Geometría y colores
//! del CSS de producción para el tamaño por defecto (120 x 160).

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use vantare_domain::pedals::ViewModel;

use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

pub const SIZE: (f32, f32) = (120.0, 160.0);
const PAD_X: f32 = 10.0;
const PAD_TOP: f32 = 8.0;
const PAD_BOTTOM: f32 = 10.0;
const GAP: f32 = 8.0;
const TRACK_W: f32 = 14.0;
const LABEL_H: f32 = 11.0;
const VALUE_H: f32 = 11.0;

pub fn paint(vm: &ViewModel, window: &mut Window, cx: &mut App) {
    let (width, height) = SIZE;
    if !vm.transparent_background {
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
    }
    let columns = [
        ("C", vm.clutch, &vm.clutch_text, 0xc9a15c),
        ("B", vm.brake, &vm.brake_text, tokens::LOSS),
        ("T", vm.throttle, &vm.throttle_text, 0x6fae7d),
    ];
    let column_w = (width - 2.0 * PAD_X - GAP * 2.0) / 3.0;
    let status_height = if let Some(message) = vm.status_text {
        let mut status_ink = ink(14.0, 700.0, 0.0, col(0xe2c568, 1.0));
        // El productivo permite envolver el aviso en la columna de 120 px.
        let lines: Vec<_> = match message {
            "DATOS ANTIGUOS" => vec!["DATOS", "ANTIGUOS"],
            "DATA OUT OF DATE" => vec!["DATA OUT OF", "DATE"],
            _ => vec![message],
        };
        let longest = lines
            .iter()
            .map(|line| text::width(window, line, &status_ink))
            .fold(0.0, f32::max);
        if longest > width - 24.0 {
            status_ink.size *= (width - 24.0) / longest;
        }
        for (index, line) in lines.iter().enumerate() {
            text::draw(
                window,
                cx,
                line,
                12.0,
                text::baseline(10.0 + index as f32 * 18.0, 18.0, status_ink.size),
                &status_ink,
            );
        }
        20.0 + lines.len() as f32 * 18.0
    } else {
        0.0
    };
    let value_top = PAD_TOP + status_height;
    let track_top = value_top + VALUE_H + 4.0;
    // Valor sobre la pista; rótulo debajo, con los mismos márgenes.
    let track_h = height - PAD_TOP - PAD_BOTTOM - status_height - (4.0 + LABEL_H + 4.0 + VALUE_H);
    let label_ink = ink(11.0, 600.0, 0.18, col(tokens::MUTED, 0.78));
    let value_ink = ink(11.0, 700.0, 0.0, col(tokens::INK, 1.0));
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
            text::baseline(label_top, LABEL_H, LABEL_H),
            &label_ink,
        );
        let value_x = mid - text::width(window, text_value, &value_ink) / 2.0;
        text::draw(
            window,
            cx,
            text_value,
            value_x,
            text::baseline(value_top, VALUE_H, VALUE_H),
            &value_ink,
        );
    }
    // El marco (::after) se compone al final; 12 % en los lados y 24 % arriba.
    // La bandera no está en este ViewModel: se conserva el borde neutro.
    if !vm.transparent_background {
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
}

fn fill_height(value: f64, inner_h: f32) -> f32 {
    // PedalsFunctional redondea primero el porcentaje, no la altura en píxeles.
    (value * 100.0).round() as f32 / 100.0 * inner_h
}

use crate::app::{Paint, Wake, replace_if_changed};
use vantare_domain::{Snapshot, format::Preferences};

#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub transparent_background: bool,
}
impl Settings {
    pub const UNSUPPORTED: &'static [(&'static str, &'static str)] = &[];
    fn project(&self, snapshot: &Snapshot, prefs: Preferences) -> ViewModel {
        let mut vm = vantare_domain::pedals::project(snapshot, prefs);
        vm.transparent_background = self.transparent_background;
        vm
    }

    #[must_use]
    pub fn normalized(&self) -> Self {
        self.clone()
    }
}

pub(crate) struct Widget {
    settings: Settings,
    vm: ViewModel,
}

impl Widget {
    pub(crate) fn new(settings: &Settings, prefs: Preferences) -> Self {
        let settings = settings.normalized();
        Self {
            vm: settings.project(&Snapshot::default(), prefs),
            settings,
        }
    }

    // Firma común del registro: este widget tiene tamaño fijo.
    #[allow(clippy::unused_self)]
    pub(crate) fn size(&self) -> (f32, f32) {
        SIZE
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, self.settings.project(snapshot, prefs))
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

impl Settings {
    #[allow(clippy::unused_self)] // Contrato común de demanda por renderer.
    pub fn demand(&self) -> vantare_ipc::Demand {
        use vantare_ipc::Signal::{Clutch, Pedals, Powertrain};
        crate::demand::signals(16, &[Pedals, Clutch, Powertrain])
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn transparent_projection_keeps_the_same_inputs() {
        let snapshot =
            vantare_ipc::snapshot_from_json(include_str!("../fixtures/pedals.snapshot.json"))
                .expect("escena");
        let settings = Settings {
            transparent_background: true,
        };
        let mut vm = settings.project(&snapshot, Preferences::default());
        assert!(vm.transparent_background);
        vm.transparent_background = false;
        assert_eq!(
            vm,
            Settings::default().project(&snapshot, Preferences::default())
        );
    }

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
        let mut widget = Widget::new(&Settings::default(), Preferences::default());
        assert!(widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(!widget.ingest(&source::synthetic(0), Preferences::default()));
        assert!(widget.ingest(&source::synthetic(300), Preferences::default()));
    }
}
