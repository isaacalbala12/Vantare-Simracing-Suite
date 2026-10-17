//! Pedales en el sistema de diseño Vantare (#1566): tres columnas juntas,
//! sin rótulos (el color identifica cada pedal), con el porcentaje encima,
//! pintadas con el kit `ui/src/vantare/`. Mismo ViewModel y separación
//! ajustable (#1563); solo cambia el pintado.

use super::SIZE;
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{rect, text};
use crate::look::{Accent, Tone};
use crate::vantare::paint::{Face, Kit, round_rect, transparent};
use crate::vantare::style::{Color, Style, Variant};
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use std::sync::Arc;
use vantare_domain::format::Language;
use vantare_domain::pedals::ViewModel;

const PAD_X: f32 = 10.0;
/// Columna justa para «100%» en mono 10; barras anchas y poco hueco entre ellas.
const COLUMN_W: f32 = 24.0;
const TRACK_W: f32 = 16.0;
const VALUE_SIZE: f32 = 10.0;
const VALUE_TOP: f32 = 11.0;
const VALUE_H: f32 = 14.0;
const PAD_BOTTOM: f32 = 11.0;
/// Opacidad del extremo inferior del relleno; el que avanza es opaco.
const FILL_FROM: f32 = 0.55;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Options {
    pub look: Tone,
    pub accent: Accent,
    pub gap: f32,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        Self {
            look: settings.style,
            accent: settings.accent,
            gap: settings.gap,
        }
    }
    fn variant<'a>(&self, style: &'a Style) -> &'a Variant {
        match self.look {
            Tone::Neo => &style.styles.neo,
            Tone::Neutro => &style.styles.neutro,
        }
    }
    fn accent(&self, style: &Style) -> Color {
        match self.accent {
            Accent::Red => style.accents.red,
            Accent::Amber => style.accents.amber,
            Accent::Green => style.accents.green,
            Accent::White => style.accents.white,
        }
    }
}

#[derive(Clone)]
pub(crate) struct Visual {
    options: Options,
    style: Arc<Style>,
}

/// Ancho del widget para una separación dada: tres columnas y dos huecos.
fn width_for_gap(gap: f32) -> f32 {
    2.0 * PAD_X + 3.0 * COLUMN_W + 2.0 * gap
}

/// Altura del relleno: el porcentaje redondeado como el texto que lo acompaña.
fn fill_height(value: f64, track_h: f32) -> f32 {
    (value.clamp(0.0, 1.0) * 100.0).round() as f32 / 100.0 * track_h
}

impl Visual {
    pub(crate) fn new(options: Options) -> Self {
        Self {
            options,
            style: Style::compiled(),
        }
    }
    pub(crate) fn set_style(&mut self, style: Arc<Style>) {
        self.style = style;
    }
    pub(crate) fn size(&self) -> (f32, f32) {
        (width_for_gap(self.options.gap), SIZE.1)
    }

    pub(crate) fn paint(
        &self,
        vm: &ViewModel,
        brake_peak: Option<f64>,
        limiter: bool,
        language: Language,
        window: &mut Window,
        cx: &mut App,
    ) {
        let (width, height) = self.size();
        let kit = Kit {
            style: &self.style,
            variant: self.options.variant(&self.style),
            accent: self.options.accent(&self.style),
            language,
            width,
        };
        if !vm.transparent_background {
            kit.panel(window, height);
        }
        let c = &self.style.colors;
        let top = paint_status_band(vm, limiter, &kit, |status, height, size| {
            self.status(&kit, status, height, size, window, cx);
        });
        let value_top = top + VALUE_TOP;
        let track_top = value_top + VALUE_H + 6.0;
        let track_h = height - track_top - PAD_BOTTOM;
        let value_ink = kit.ink(Face::Mono, VALUE_SIZE, 0.0, c.text.hsla());
        let pedals = [
            (vm.clutch, &vm.clutch_text, c.compound_wet),
            (vm.brake, &vm.brake_text, c.flash_loss),
            (vm.throttle, &vm.throttle_text, c.green),
        ];
        for (index, (value, value_text, color)) in pedals.into_iter().enumerate() {
            // CSS border-box reparte los dos píxeles de borde entre las tres columnas.
            let column_w = COLUMN_W - 2.0 / 3.0;
            let mid = PAD_X + 1.0 + index as f32 * (column_w + self.options.gap) + column_w / 2.0;
            let x = mid - TRACK_W / 2.0;
            round_rect(
                window,
                x,
                track_top,
                TRACK_W,
                track_h,
                TRACK_W / 2.0,
                if vm.transparent_background {
                    Color(0, 0.5).hsla()
                } else {
                    self.style.fuel.track.hsla()
                },
            );
            if vm.transparent_background {
                window.paint_quad(quad(
                    rect(x - 1.0, track_top - 1.0, TRACK_W + 2.0, track_h + 2.0),
                    Corners::all(px(TRACK_W / 2.0 + 1.0)),
                    transparent(),
                    Edges::all(px(1.0)),
                    Color(0xffffff, 0.14).hsla(),
                    BorderStyle::default(),
                ));
            }
            if let Some(value) = value {
                let fill = fill_height(value, track_h);
                fill_bar(window, x, track_top + track_h - fill, fill, color);
            }
            if index == 1
                && let Some(peak) = brake_peak
            {
                round_rect(
                    window,
                    x - 3.0,
                    track_top + track_h * (1.0 - peak.clamp(0.0, 1.0) as f32) - 1.0,
                    TRACK_W + 6.0,
                    2.0,
                    1.0,
                    Color(0xffffff, 0.85).hsla(),
                );
            }
            let w = text::width(window, value_text, &value_ink);
            if vm.transparent_background {
                kit.label_shadow(
                    window,
                    cx,
                    value_text,
                    mid - w / 2.0,
                    None,
                    value_top,
                    VALUE_H,
                    Face::Mono,
                    &value_ink,
                );
            } else {
                kit.label(
                    window,
                    cx,
                    value_text,
                    mid - w / 2.0,
                    None,
                    value_top,
                    VALUE_H,
                    Face::Mono,
                    &value_ink,
                );
            }
        }
    }

    /// Franja de aviso arriba, centrada y reducida si no cabe en el ancho.
    /// Devuelve su altura.
    fn status(
        &self,
        kit: &Kit<'_>,
        status: &str,
        h: f32,
        size: f32,
        window: &mut Window,
        cx: &mut App,
    ) -> f32 {
        let c = &self.style.colors;
        let radius = (kit.variant.radius - 1.0).max(0.0);
        window.paint_quad(quad(
            rect(0.0, 0.0, kit.width, h),
            Corners {
                top_left: px(radius),
                top_right: px(radius),
                bottom_right: px(0.0),
                bottom_left: px(0.0),
            },
            c.yellow_fill.hsla(),
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
        round_rect(
            window,
            0.0,
            h - 1.0,
            kit.width,
            1.0,
            0.0,
            c.yellow_line.hsla(),
        );
        let mut ink = kit.ink(Face::Display, size, 0.6, c.yellow_text.hsla());
        let room = kit.width - 2.0 * PAD_X;
        let w = text::width(window, status, &ink);
        if w > room {
            ink.size *= room / w;
        }
        let w = text::width(window, status, &ink);
        kit.label(
            window,
            cx,
            status,
            (kit.width - w) / 2.0,
            None,
            0.0,
            h,
            Face::Display,
            &ink,
        );
        h
    }
}

/// La banda ocupa espacio aunque ninguno de los pedales tenga datos.
fn paint_status_band(
    vm: &ViewModel,
    limiter: bool,
    kit: &Kit<'_>,
    mut draw: impl FnMut(&str, f32, f32),
) -> f32 {
    let band = if limiter {
        Some((if kit.es() { "LIMITADOR" } else { "LIMITER" }, 20.0, 11.0))
    } else {
        vm.status_text.map(|status| {
            (
                status,
                kit.style.geometry.banner_height,
                kit.style.fonts.banner,
            )
        })
    };
    if let Some((status, height, size)) = band {
        draw(status, height, size);
        height
    } else {
        0.0
    }
}

#[cfg(test)]
mod status_render_tests {
    use super::*;
    #[test]
    fn waiting_and_lost_paint_the_status_without_any_pedal_values() {
        use vantare_domain::{Snapshot, SourceState, format::Preferences};
        for (state, language, expected) in [
            (SourceState::Waiting, Language::Es, "DESCONECTADO"),
            (SourceState::Lost, Language::Es, "DESCONECTADO"),
            (SourceState::Waiting, Language::En, "DISCONNECTED"),
            (SourceState::Lost, Language::En, "DISCONNECTED"),
        ] {
            let mut snapshot = Snapshot::default();
            snapshot.state.source_state = state;
            let prefs = Preferences {
                language,
                ..Preferences::default()
            };
            let vm = vantare_domain::pedals::project(&snapshot, prefs);
            crate::paint_tests::with_kit(96.0, language, |kit| {
                let mut painted = Vec::new();
                let height =
                    paint_status_band(&vm, false, kit, |text, _, _| painted.push(text.to_owned()));
                assert_eq!(painted, [expected]);
                assert!(height > 0.0, "la banda reserva espacio sobre las barras");
            });
        }
    }
}

/// Relleno vertical anclado abajo, más intenso en el extremo que avanza.
fn fill_bar(window: &mut Window, x: f32, y: f32, h: f32, color: Color) {
    if h <= 0.0 {
        return;
    }
    window.paint_quad(quad(
        rect(x, y, TRACK_W, h),
        // Valores bajos: radio limitado al alto, sin óvalo aplastado.
        Corners::all(px(TRACK_W.min(h) / 2.0)),
        linear_gradient(
            0.0,
            linear_color_stop(color.alpha(FILL_FROM), 0.0),
            linear_color_stop(color.alpha(1.0), 1.0),
        ),
        Edges::all(px(0.0)),
        transparent(),
        BorderStyle::default(),
    ));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn columns_stay_together_and_follow_the_adjustable_gap() {
        for gap in [0.0, super::super::DEFAULT_GAP, 8.0, 12.0] {
            let settings = super::super::Settings {
                gap,
                ..super::super::Settings::for_look(crate::look::Look::Vantare)
            };
            let visual = Visual::new(Options::from_settings(&settings));
            assert_eq!(visual.size(), (92.0 + 2.0 * gap, 160.0));
            // Más juntas que Eficiencia: 8 px de aire entre barras más la separación.
            assert_eq!(COLUMN_W - TRACK_W, 8.0);
            assert!(visual.size().0 < super::super::width_for_gap(gap));
            // La última columna termina en el margen derecho de 10 px.
            let right = PAD_X + 2.0 * (COLUMN_W + gap) + COLUMN_W;
            assert_eq!(right, visual.size().0 - PAD_X);
        }
    }

    #[test]
    fn fill_matches_the_rounded_percent_and_clamps() {
        assert!((fill_height(0.125, 100.0) - 13.0).abs() < 0.001);
        assert!(fill_height(-0.2, 100.0).abs() < f32::EPSILON);
        assert!((fill_height(1.4, 100.0) - 100.0).abs() < f32::EPSILON);
    }
}
