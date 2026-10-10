//! Pedales en el sistema de diseño Vantare (#1566): tres columnas con la
//! misma huella que Eficiencia (`width_for_gap` x 160), pintadas con el kit
//! `ui/src/vantare/`. Mismo ViewModel; solo cambia el pintado.

use super::{SIZE, width_for_gap};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{rect, text};
use crate::standings::{Accent, Look};
use crate::vantare::paint::{Face, Kit, round_rect, transparent};
use crate::vantare::style::{Color, Style, Variant};
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use std::sync::Arc;
use vantare_domain::format::Language;
use vantare_domain::pedals::ViewModel;

/// Margen lateral y ancho de columna iguales a Eficiencia: misma huella.
const PAD_X: f32 = 10.0;
const COLUMN_W: f32 = 28.0;
const TRACK_W: f32 = 10.0;
const VALUE_TOP: f32 = 10.0;
const VALUE_H: f32 = 14.0;
const LABEL_H: f32 = 14.0;
const PAD_BOTTOM: f32 = 8.0;
/// Opacidad del extremo inferior del relleno; el que avanza es opaco.
const FILL_FROM: f32 = 0.55;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Options {
    pub look: Look,
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
            Look::Neo => &style.styles.neo,
            Look::Neutro => &style.styles.neutro,
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

/// Rótulos localizados: embrague, freno y acelerador.
fn labels(language: Language) -> [&'static str; 3] {
    match language {
        Language::Es => ["EMB", "FRE", "ACE"],
        Language::En => ["CLU", "BRK", "THR"],
    }
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
        let f = &self.style.fonts;
        let top = match vm.status_text {
            Some(status) => self.status(&kit, status, window, cx),
            None => 0.0,
        };
        let value_top = top + VALUE_TOP;
        let track_top = value_top + VALUE_H + 6.0;
        let track_h = height - track_top - 6.0 - LABEL_H - PAD_BOTTOM;
        let value_ink = kit.ink(Face::Mono, f.mono_small, 0.0, c.text.hsla());
        let label_ink = kit.ink(Face::Display, 12.0, 0.8, c.muted.hsla());
        let pedals = [
            (vm.clutch, &vm.clutch_text, c.compound_wet),
            (vm.brake, &vm.brake_text, c.flash_loss),
            (vm.throttle, &vm.throttle_text, c.green),
        ];
        for (index, ((value, value_text, color), label)) in
            pedals.into_iter().zip(labels(language)).enumerate()
        {
            let mid = PAD_X + index as f32 * (COLUMN_W + self.options.gap) + COLUMN_W / 2.0;
            let x = mid - TRACK_W / 2.0;
            round_rect(
                window,
                x,
                track_top,
                TRACK_W,
                track_h,
                TRACK_W / 2.0,
                self.style.fuel.track.hsla(),
            );
            if let Some(value) = value {
                let fill = fill_height(value, track_h);
                fill_bar(window, x, track_top + track_h - fill, fill, color);
            }
            let w = text::width(window, value_text, &value_ink);
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
            let w = text::width(window, label, &label_ink);
            kit.label(
                window,
                cx,
                label,
                mid - w / 2.0,
                None,
                track_top + track_h + 6.0,
                LABEL_H,
                Face::Display,
                &label_ink,
            );
        }
    }

    /// Franja de aviso arriba, centrada y reducida si no cabe en el ancho.
    /// Devuelve su altura.
    fn status(&self, kit: &Kit<'_>, status: &str, window: &mut Window, cx: &mut App) -> f32 {
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let h = self.style.geometry.banner_height;
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
        let mut ink = kit.ink(Face::Display, f.banner, 0.6, c.yellow_text.hsla());
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
    fn keeps_the_eficiencia_footprint_for_every_gap() {
        for gap in [0.0, super::super::DEFAULT_GAP, 8.0, 12.0] {
            let settings = super::super::Settings {
                gap,
                ..super::super::Settings::for_look(crate::look::Look::Vantare)
            };
            let visual = Visual::new(Options::from_settings(&settings));
            assert_eq!(visual.size(), (width_for_gap(gap), 160.0));
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

    #[test]
    fn labels_follow_the_language() {
        assert_eq!(labels(Language::Es), ["EMB", "FRE", "ACE"]);
        assert_eq!(labels(Language::En), ["CLU", "BRK", "THR"]);
    }
}
