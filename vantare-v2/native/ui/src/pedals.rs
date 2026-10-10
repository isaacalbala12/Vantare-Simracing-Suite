//! Pedales en diseño Eficiencia (`PedalsFunctional.tsx`): tres barras
//! (embrague, freno, acelerador) con su rótulo y su valor. Geometría y colores
//! del CSS de producción para el tamaño por defecto (108 x 160, separación de
//! 2 px); con el ajuste histórico de 8 px el ancho es 120 px.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use vantare_domain::pedals::ViewModel;

use crate::efficiency::text::{self, ink};
use crate::efficiency::{col, paint_frame, paint_panel, rect, tokens};

/// Tamaño por defecto, con la separación casi pegada de 2 px (ISA-1563); el
/// ancho real para otro ajuste lo da `width_for_gap`.
pub const SIZE: (f32, f32) = (108.0, 160.0);
const PAD_X: f32 = 10.0;
const PAD_TOP: f32 = 8.0;
const PAD_BOTTOM: f32 = 10.0;
/// Ancho de cada columna con el `GAP = 8.0` original: se conserva y solo varía
/// la separación, así el widget se estrecha en proporción.
const COLUMN_W: f32 = 28.0;
/// Separación por defecto entre barras: casi pegadas.
pub const DEFAULT_GAP: f32 = 2.0;
/// Rango del ajuste en Studio: de pegadas (0) a más aire que el 8 original.
pub const GAP_MIN: f32 = 0.0;
pub const GAP_MAX: f32 = 12.0;
const TRACK_W: f32 = 14.0;
const LABEL_H: f32 = 11.0;
const VALUE_H: f32 = 11.0;

/// Ancho del widget para una separación dada (las columnas no cambian).
#[must_use]
pub fn width_for_gap(gap: f32) -> f32 {
    2.0 * PAD_X + 3.0 * COLUMN_W + 2.0 * gap
}

pub fn paint(vm: &ViewModel, gap: f32, window: &mut Window, cx: &mut App) {
    let (width, height) = (width_for_gap(gap), SIZE.1);
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
    let column_w = COLUMN_W;
    let status_height = if let Some(message) = vm.status_text {
        let mut status_ink = ink(14.0, 700.0, 0.0, col(0xe2c568, 1.0));
        // El productivo permite envolver el aviso en el ancho del widget.
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
        let left = PAD_X + index as f32 * (column_w + gap);
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

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub transparent_background: bool,
    pub gap: f32,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            transparent_background: false,
            gap: DEFAULT_GAP,
        }
    }
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
        Self {
            gap: if self.gap.is_finite() {
                self.gap.clamp(GAP_MIN, GAP_MAX)
            } else {
                DEFAULT_GAP
            },
            ..self.clone()
        }
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

    // Tamaño intrínseco: depende de la separación entre barras.
    pub(crate) fn size(&self) -> (f32, f32) {
        (width_for_gap(self.settings.gap), SIZE.1)
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        replace_if_changed(&mut self.vm, self.settings.project(snapshot, prefs))
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let vm = self.vm.clone();
        let gap = self.settings.gap;
        (
            Box::new(move |window, cx| paint(&vm, gap, window, cx)),
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
            ..Settings::default()
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

    #[test]
    fn old_layouts_without_gap_default_to_almost_touching() {
        // La app anterior no tenía este ajuste (gap fijo de 8 px en el CSS):
        // los layouts guardados cargan con el 2 por defecto, casi pegadas.
        for json in [r#"{"kind":"pedals"}"#, r#"{"kind":"pedals","transparentBackground":true}"#] {
            let settings: crate::Settings =
                serde_json::from_str(json).expect("layout antiguo");
            let crate::Settings::Pedals(value) = settings.normalized() else {
                panic!("pedales");
            };
            assert_eq!(value.gap, DEFAULT_GAP);
            assert_eq!(value.gap, 2.0);
        }
        let settings: Settings = serde_json::from_str("{}").expect("opciones parciales");
        assert_eq!(settings, Settings::default());
        let explicit: Settings =
            serde_json::from_str(r#"{"gap":8.0}"#).expect("separación guardada");
        assert_eq!(explicit.gap, 8.0);
        assert_eq!(explicit.normalized(), explicit);
        // Workshop envía enteros (u64) para este f32: deben convertirse.
        let integer: Settings = serde_json::from_str(r#"{"gap":5}"#).expect("entero de Studio");
        assert_eq!(integer.gap, 5.0);
        assert_eq!(integer.normalized(), integer);
    }

    #[test]
    fn gap_normalization_clamps_and_recovers_a_finite_default() {
        for (input, expected) in [
            (f32::NAN, DEFAULT_GAP),
            (f32::INFINITY, DEFAULT_GAP),
            (-4.0, GAP_MIN),
            (0.0, 0.0),
            (2.0, 2.0),
            (8.0, 8.0),
            (12.0, 12.0),
            (99.0, GAP_MAX),
        ] {
            let settings = Settings {
                gap: input,
                ..Settings::default()
            }
            .normalized();
            assert_eq!(settings.gap, expected, "gap {input}");
            assert_eq!(settings.normalized(), settings, "idempotente con {input}");
        }
    }

    #[test]
    fn width_follows_gap_and_keeps_the_old_column_width() {
        // Con el 8 original el ancho es el histórico de 120 px; por defecto
        // (2 px, casi pegadas) el widget se estrecha a 108 px.
        assert_eq!(width_for_gap(8.0), 120.0);
        assert_eq!(width_for_gap(DEFAULT_GAP), 108.0);
        assert_eq!(SIZE, (108.0, 160.0));
        for gap in [GAP_MIN, DEFAULT_GAP, 8.0, GAP_MAX] {
            let settings = Settings {
                gap,
                ..Settings::default()
            };
            let widget = Widget::new(&settings, Preferences::default());
            let width = width_for_gap(gap);
            assert_eq!(widget.size(), (width, 160.0));
            // Tres columnas de 28 px con la separación entre ellas y el
            // margen de 10 px a cada lado, como el productivo original.
            for index in 0..3 {
                let left = PAD_X + index as f32 * (COLUMN_W + gap);
                assert_eq!(left, PAD_X + index as f32 * (28.0 + gap));
            }
            let right = PAD_X + 2.0 * (COLUMN_W + gap) + COLUMN_W;
            assert_eq!(right, width - PAD_X);
        }
    }
}
