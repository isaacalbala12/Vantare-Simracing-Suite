//! Pedales en el sistema de diseño Vantare (#1566). Mismo ViewModel que
//! Eficiencia; solo cambia el pintado con el kit `ui/src/vantare/`.

use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::text;
use crate::standings::{Accent, Look};
use crate::vantare::paint::{Face, Kit, round_rect, transparent};
use crate::vantare::style::{Color, Style, Variant};
use gpui::{App, BorderStyle, Corners, Edges, linear_color_stop, linear_gradient, px, quad};
use std::sync::Arc;
use vantare_domain::format::Language;
use vantare_domain::pedals::ViewModel;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Options {
    pub look: Look,
    pub accent: Accent,
    pub brand: bool,
    pub gap: f32,
}

impl Options {
    pub(crate) fn from_settings(settings: &super::Settings) -> Self {
        Self {
            look: settings.style,
            accent: settings.accent,
            brand: settings.brand_visible == Some(true),
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

// ponytail: prototipo de las dos direcciones para elegir (#1566); tras la
// elección queda solo una y desaparece la variable.
fn horizontal() -> bool {
    std::env::var("VANTARE_PEDALS_PROTO").is_ok_and(|v| v == "b")
}

#[derive(Clone)]
pub(crate) struct Visual {
    options: Options,
    style: Arc<Style>,
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
        let gap = self.options.gap;
        if horizontal() {
            (250.0, 92.0 + 2.0 * gap)
        } else {
            (2.0 * 12.0 + 3.0 * 28.0 + 2.0 * gap, 168.0)
        }
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
        let es = kit.es();
        let pedals = [
            (
                if es { "EMB" } else { "CLU" },
                vm.clutch,
                &vm.clutch_text,
                c.compound_wet,
            ),
            (
                if es { "FRE" } else { "BRK" },
                vm.brake,
                &vm.brake_text,
                c.flash_loss,
            ),
            (
                if es { "ACE" } else { "THR" },
                vm.throttle,
                &vm.throttle_text,
                c.green,
            ),
        ];
        let mut top = 0.0;
        if let Some(status) = vm.status_text {
            kit.band(
                window,
                cx,
                c.yellow_fill,
                c.yellow_text,
                status,
                None,
                false,
                Some(c.yellow_line),
            );
            top = self.style.geometry.banner_height;
        }
        if horizontal() {
            self.paint_rows(&kit, &pedals, vm, top, window, cx);
        } else {
            self.paint_columns(&kit, &pedals, top, height, window, cx);
        }
    }

    fn paint_columns(
        &self,
        kit: &Kit<'_>,
        pedals: &[(&str, Option<f64>, &String, Color); 3],
        top: f32,
        height: f32,
        window: &mut Window,
        cx: &mut App,
    ) {
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let pad = 12.0;
        let col = 28.0;
        let track_w = 10.0;
        let value_top = top + 10.0;
        let track_top = value_top + 18.0;
        let label_h = 16.0;
        let track_h = height - track_top - 8.0 - label_h - 6.0;
        let value_ink = kit.ink(Face::Mono, f.mono_small, 0.0, c.text.hsla());
        let label_ink = kit.ink(Face::Display, 12.0, 0.8, c.muted.hsla());
        for (index, (label, value, text_value, color)) in pedals.iter().enumerate() {
            let mid = pad + index as f32 * (col + self.options.gap) + col / 2.0;
            let x = mid - track_w / 2.0;
            round_rect(
                window,
                x,
                track_top,
                track_w,
                track_h,
                track_w / 2.0,
                self.style.fuel.track.hsla(),
            );
            if let Some(v) = value {
                let fill = (*v as f32).clamp(0.0, 1.0) * track_h;
                fill_quad(
                    window,
                    x,
                    track_top + track_h - fill,
                    track_w,
                    fill,
                    *color,
                    true,
                );
            }
            let w = text::width(window, text_value, &value_ink);
            kit.label(
                window,
                cx,
                text_value,
                mid - w / 2.0,
                None,
                value_top,
                14.0,
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
                label_h,
                Face::Display,
                &label_ink,
            );
        }
    }

    fn paint_rows(
        &self,
        kit: &Kit<'_>,
        pedals: &[(&str, Option<f64>, &String, Color); 3],
        vm: &ViewModel,
        top: f32,
        window: &mut Window,
        cx: &mut App,
    ) {
        let c = &self.style.colors;
        let f = &self.style.fonts;
        let v = kit.variant;
        let pad = v.padding_x;
        let mut y = top + v.padding_y;
        let header = kit.ink(
            Face::Body,
            v.header_size,
            v.header_tracking,
            v.header_color.hsla(),
        );
        kit.label(
            window,
            cx,
            if kit.es() { "PEDALES" } else { "PEDALS" },
            pad,
            None,
            y,
            v.header_height,
            Face::Body,
            &header,
        );
        if self.options.brand {
            kit.brand(window, cx, kit.width - pad, y, v.header_height);
        }
        y += v.header_height + v.header_gap;
        // Bloque de marcha: número grande en Rajdhani y velocidad en mono.
        let block = 54.0;
        let rows_h = 3.0 * 16.0 + 2.0 * self.options.gap;
        let gear = kit.ink(Face::Display, 38.0, 0.0, c.text.hsla());
        let w = text::width(window, &vm.gear, &gear);
        kit.label(
            window,
            cx,
            &vm.gear,
            pad + (block - w) / 2.0,
            None,
            y,
            rows_h - 14.0,
            Face::Display,
            &gear,
        );
        let speed = kit.ink(Face::Mono, f.mono_small - 1.0, 0.0, c.muted.hsla());
        let w = text::width(window, &vm.speed, &speed);
        kit.label(
            window,
            cx,
            &vm.speed,
            pad + (block - w) / 2.0,
            None,
            y + rows_h - 14.0,
            14.0,
            Face::Mono,
            &speed,
        );
        round_rect(
            window,
            pad + block + 6.0,
            y,
            1.0,
            rows_h,
            0.0,
            c.line.hsla(),
        );
        let left = pad + block + 14.0;
        let label_w = 30.0;
        let value_w = 36.0;
        let label_ink = kit.ink(Face::Display, 12.0, 0.8, c.muted.hsla());
        let value_ink = kit.ink(Face::Mono, f.mono_small, 0.0, c.text.hsla());
        let track_x = left + label_w;
        let track_w = kit.width - pad - value_w - track_x;
        for (index, (label, value, text_value, color)) in pedals.iter().enumerate() {
            let row = y + index as f32 * (16.0 + self.options.gap);
            kit.label(
                window,
                cx,
                label,
                left,
                None,
                row,
                16.0,
                Face::Display,
                &label_ink,
            );
            let bar = 6.0;
            let by = row + (16.0 - bar) / 2.0;
            round_rect(
                window,
                track_x,
                by,
                track_w,
                bar,
                bar / 2.0,
                self.style.fuel.track.hsla(),
            );
            if let Some(v) = value {
                let fill = (*v as f32).clamp(0.0, 1.0) * track_w;
                fill_quad(window, track_x, by, fill, bar, *color, false);
            }
            kit.label(
                window,
                cx,
                text_value,
                0.0,
                Some(kit.width - pad),
                row,
                16.0,
                Face::Mono,
                &value_ink,
            );
        }
    }
}

/// Relleno con degradado: opaco en el extremo que avanza.
fn fill_quad(window: &mut Window, x: f32, y: f32, w: f32, h: f32, color: Color, vertical: bool) {
    if w <= 0.0 || h <= 0.0 {
        return;
    }
    let radius = if vertical { w } else { h } / 2.0;
    window.paint_quad(quad(
        crate::efficiency::rect(x, y, w, h),
        Corners::all(px(radius)),
        linear_gradient(
            if vertical { 0.0 } else { 90.0 },
            linear_color_stop(color.alpha(0.55), 0.0),
            linear_color_stop(color.alpha(1.0), 1.0),
        ),
        Edges::all(px(0.0)),
        transparent(),
        BorderStyle::default(),
    ));
}
