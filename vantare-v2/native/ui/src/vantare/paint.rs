//! Primitivas de pintado Vantare: texto en sus tres caras, panel, franja de
//! aviso, fila resaltada, punto de clase, chip de dorsal, píldoras, esqueleto
//! y espera. Coordenadas del widget; GPUI directo mediante el kit.

use super::style::{ClassColors, Color, Style, Variant};
use crate::efficiency::preview::PaintWindow as Window;
use crate::efficiency::{rect, text};
use gpui::{
    App, BorderStyle, BoxShadow, Corners, Edges, Hsla, linear_color_stop, linear_gradient, point,
    px, quad,
};
use vantare_domain::format::Language;

/// Blanco de la fila propia en Limpio.
pub(crate) const WHITE: Color = Color(0xffffff, 1.0);

/// Píldora de boxes: igual en español e inglés, como el catálogo.
pub(crate) const BOX: &str = "BOX";

/// Cara tipográfica: Inter, Rajdhani 600 o Space Mono.
#[derive(Clone, Copy)]
pub(crate) enum Face {
    Body,
    Display,
    Mono,
}

pub(crate) fn transparent() -> Hsla {
    gpui::transparent_black()
}

pub(crate) fn round_rect(
    window: &mut Window,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    radius: f32,
    color: Hsla,
) {
    if w > 0.0 && h > 0.0 {
        window.paint_quad(quad(
            rect(x, y, w, h),
            Corners::all(px(radius)),
            color,
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
    }
}

/// Ancho de un texto Inter 400 sin medir con la ventana: los layouts son puros.
/// Usa los avances reales de la fuente (sin kerning); `text::fit` recorta al
/// pintar si alguna vez se queda corto.
pub(crate) fn estimate(text: &str, size: f32) -> f32 {
    text.chars()
        .map(|c| {
            let milli = match c as u32 {
                code @ 0x20..=0xff => LATIN1[(code - 0x20) as usize],
                0x2014 => 1000,
                0x2026 => 864,
                0x2212 => 662,
                _ => 600,
            };
            f32::from(milli) / 1000.0
        })
        .sum::<f32>()
        * size
}

/// Avance de Inter 400 en milésimas de em para U+0020..=U+00FF (generado de Inter-400.ttf).
const LATIN1: [u16; 224] = [
    281, 288, 466, 633, 642, 982, 644, 300, 365, 365, 501, 662, 288, 460, 288, 360, 631, 407, 610,
    618, 646, 593, 620, 566, 619, 620, 288, 302, 662, 662, 662, 511, 966, 690, 654, 730, 722, 601,
    590, 746, 743, 269, 571, 672, 565, 903, 753, 765, 639, 765, 644, 642, 646, 744, 690, 985, 682,
    679, 629, 365, 360, 365, 471, 456, 323, 562, 612, 571, 612, 583, 370, 613, 591, 242, 242, 549,
    242, 876, 591, 600, 612, 612, 376, 528, 327, 591, 562, 818, 546, 562, 552, 426, 333, 426, 662,
    656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656,
    656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 656, 281, 288, 571, 611, 725,
    550, 270, 568, 591, 914, 454, 583, 662, 656, 666, 478, 456, 662, 442, 446, 323, 586, 603, 288,
    268, 304, 482, 583, 802, 847, 882, 511, 690, 690, 690, 690, 690, 690, 994, 730, 601, 601, 601,
    601, 269, 269, 269, 269, 735, 753, 765, 765, 765, 765, 765, 662, 765, 744, 744, 744, 744, 679,
    636, 616, 562, 562, 562, 562, 562, 562, 917, 571, 583, 583, 583, 583, 242, 242, 242, 242, 583,
    591, 600, 600, 600, 600, 600, 662, 600, 591, 591, 591, 591, 562, 612, 562,
];

/// Contexto de pintado de un widget Vantare: estilo, variante, acento,
/// idioma y ancho del panel.
pub(crate) struct Kit<'a> {
    pub style: &'a Style,
    pub variant: &'a Variant,
    pub accent: Color,
    pub language: Language,
    pub width: f32,
}

impl Kit<'_> {
    pub(crate) fn es(&self) -> bool {
        self.language == Language::Es
    }

    pub(crate) fn ink(
        &self,
        face: Face,
        size: f32,
        tracking: f32,
        color: Hsla,
    ) -> text::TextInk<'_> {
        let f = &self.style.fonts;
        let (family, weight) = match face {
            Face::Body => (None, f.regular_weight),
            Face::Display => (Some(f.display_family.as_str()), 600.0),
            Face::Mono => (Some(f.mono_family.as_str()), 400.0),
        };
        text::TextInk {
            family,
            size,
            weight,
            tracking,
            color,
        }
    }

    pub(crate) fn baseline(&self, face: Face, top: f32, height: f32, size: f32) -> f32 {
        let offset = match face {
            Face::Body => 0.0,
            Face::Display => self.style.fonts.display_baseline,
            Face::Mono => self.style.fonts.mono_baseline,
        };
        text::baseline(top, height, size) + offset
    }

    /// Texto alineado a la izquierda (`right = None`) o al borde derecho dado.
    #[allow(clippy::too_many_arguments)] // Celda de texto: posición, caja, cara e ink.
    pub(crate) fn label(
        &self,
        window: &mut Window,
        cx: &mut App,
        value: &str,
        x: f32,
        right: Option<f32>,
        top: f32,
        height: f32,
        face: Face,
        ink: &text::TextInk<'_>,
    ) -> f32 {
        let width = text::width(window, value, ink);
        let left = right.map_or(x, |r| r - width);
        let base = self.baseline(face, top, height, ink.size);
        text::draw(window, cx, value, left, base, ink);
        width
    }

    pub(crate) fn class_dot(&self, window: &mut Window, x: f32, y: f32, class: &ClassColors) {
        let g = &self.style.geometry;
        let dot = g.class_dot;
        round_rect(
            window,
            x,
            y + (g.row_height - dot) / 2.0,
            dot,
            dot,
            if self.variant.square_dots {
                1.0
            } else {
                dot / 2.0
            },
            class.dot.hsla(),
        );
    }

    /// Fondo de fila con el perfil de la fila propia (degradado o plano).
    pub(crate) fn highlight(&self, window: &mut Window, y: f32, color: Color, scale: f32) {
        if scale <= 0.0 {
            return;
        }
        let v = self.variant;
        let g = &self.style.geometry;
        let x0 = v.padding_x - g.player_bleed;
        let background = if v.player_white > 0.0 {
            // Limpio: plano; el blanco propio y los destellos con la misma opacidad base.
            let base = if color == WHITE { v.player_white } else { 0.3 };
            color.alpha(base * scale).into()
        } else {
            linear_gradient(
                if v.player_vertical { 180.0 } else { 90.0 },
                linear_color_stop(color.alpha(v.player_from * scale), 0.0),
                linear_color_stop(color.alpha(v.player_to * scale), 1.0),
            )
        };
        window.paint_quad(quad(
            rect(x0, y, self.width - 2.0 * x0, g.row_height),
            Corners::all(px(v.player_radius)),
            background,
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
    }

    pub(crate) fn pill_ink(&self, color: Hsla) -> text::TextInk<'_> {
        let f = &self.style.fonts;
        let mut ink = self.ink(Face::Body, f.pill, f.pill_tracking, color);
        ink.weight = f.pill_weight;
        ink
    }

    pub(crate) fn pill_width(&self, window: &Window, label: &str) -> f32 {
        text::width(window, label, &self.pill_ink(transparent()))
            + 2.0 * self.style.geometry.pill_padding
    }

    pub(crate) fn wait(&self, window: &mut Window, cx: &mut App, y: f32) {
        let g = &self.style.geometry;
        let f = &self.style.fonts;
        let c = &self.style.colors;
        let center = self.width / 2.0;
        let pulse = g.pulse;
        round_rect(
            window,
            center - pulse / 2.0,
            y + 10.0,
            pulse,
            pulse,
            pulse / 2.0,
            c.pulse.hsla(),
        );
        let title = if self.es() {
            "ESPERANDO AL SIMULADOR"
        } else {
            "WAITING FOR THE SIMULATOR"
        };
        let ink = self.ink(
            Face::Display,
            f.wait_title,
            f.separator_tracking,
            c.header_em.hsla(),
        );
        let width = text::width(window, title, &ink);
        self.label(
            window,
            cx,
            title,
            center - width / 2.0,
            None,
            y + 22.0,
            f.wait_title,
            Face::Display,
            &ink,
        );
        let hint = if self.es() {
            "Abre el simulador y entra en una sesión"
        } else {
            "Open the simulator and join a session"
        };
        let ink = self.ink(Face::Body, f.small, 0.0, c.muted.hsla());
        let width = text::width(window, hint, &ink);
        self.label(
            window,
            cx,
            hint,
            center - width / 2.0,
            None,
            y + 40.0,
            20.0,
            Face::Body,
            &ink,
        );
    }

    pub(crate) fn skeleton(&self, window: &mut Window, y: f32, index: usize) {
        let g = &self.style.geometry;
        let color = self.style.colors.skeleton.hsla();
        let (pad, w, h) = (self.variant.padding_x, self.width, g.row_height);
        let bar = g.skeleton_bar;
        let top = y + (h - bar) / 2.0;
        let mut x = pad;
        round_rect(window, x, top, 16.0, bar, 2.0, color);
        x += 16.0 + g.cell_gap;
        let dot = g.class_dot;
        round_rect(window, x, y + (h - dot) / 2.0, dot, dot, dot / 2.0, color);
        x += dot + g.cell_gap;
        let name = 110.0 + ((index * 37) % 70) as f32;
        round_rect(window, x, top, name, bar, 2.0, color);
        round_rect(window, w - pad - 48.0, top, 48.0, bar, 2.0, color);
    }

    /// Panel: sombra exterior, degradado vertical y borde (o borde del acento).
    pub(crate) fn panel(&self, window: &mut Window, height: f32) {
        let (w, h) = (self.width, height);
        let v = self.variant;
        let corners = Corners::all(px(v.radius));
        if v.shadow_alpha > 0.0 {
            window.paint_drop_shadows(
                rect(0.0, 0.0, w, h),
                corners,
                &[BoxShadow {
                    color: self.style.colors.shadow.alpha(v.shadow_alpha),
                    offset: point(px(0.0), px(v.shadow_y)),
                    blur_radius: px(v.shadow_blur),
                    spread_radius: px(0.0),
                    inset: false,
                }],
            );
        }
        let border = if v.border_accent > 0.0 {
            self.accent.alpha(v.border_accent)
        } else {
            v.border.hsla()
        };
        window.paint_quad(quad(
            rect(0.0, 0.0, w, h),
            corners,
            linear_gradient(
                180.0,
                linear_color_stop(v.top.hsla(), 0.0),
                linear_color_stop(v.bottom.hsla(), 1.0),
            ),
            Edges::all(px(if border.a > 0.0 { 1.0 } else { 0.0 })),
            border,
            BorderStyle::default(),
        ));
    }

    /// Franja de aviso arriba del panel: título en Rajdhani y, a la derecha, un
    /// texto mono opcional. `chequered` dibuja la bandera a cuadros (8 celdas).
    #[allow(clippy::too_many_arguments)] // Franja: colores, textos y adornos.
    pub(crate) fn band(
        &self,
        window: &mut Window,
        cx: &mut App,
        fill: Color,
        ink: Color,
        title: &str,
        right: Option<&str>,
        chequered: bool,
        line: Option<Color>,
    ) {
        let f = &self.style.fonts;
        let g = &self.style.geometry;
        let (w, h) = (self.width, g.banner_height);
        let radius = (self.variant.radius - 1.0).max(0.0);
        window.paint_quad(quad(
            rect(0.0, 0.0, w, h),
            Corners {
                top_left: px(radius),
                top_right: px(radius),
                bottom_right: px(0.0),
                bottom_left: px(0.0),
            },
            fill.hsla(),
            Edges::all(px(0.0)),
            transparent(),
            BorderStyle::default(),
        ));
        if let Some(line) = line {
            round_rect(window, 0.0, h - 1.0, w, 1.0, 0.0, line.hsla());
        }
        let pad = self.variant.padding_x;
        let mut x = pad;
        if chequered {
            // Bandera a cuadros: 8 celdas de 4 px, damero de 4 × 2.
            let top = (h - 8.0) / 2.0;
            for (col, row) in [(0, 0), (2, 0), (1, 1), (3, 1)] {
                round_rect(
                    window,
                    x + col as f32 * 4.0,
                    top + row as f32 * 4.0,
                    4.0,
                    4.0,
                    0.0,
                    ink.hsla(),
                );
            }
            x += 16.0 + 8.0;
        }
        if let Some(right) = right {
            let mono = self.ink(Face::Mono, f.mono_small, 0.0, ink.hsla());
            self.label(
                window,
                cx,
                right,
                0.0,
                Some(w - pad),
                0.0,
                h,
                Face::Mono,
                &mono,
            );
        }
        let display = self.ink(Face::Display, f.banner, f.banner_tracking, ink.hsla());
        self.label(
            window,
            cx,
            &title.to_uppercase(),
            x,
            None,
            0.0,
            h,
            Face::Display,
            &display,
        );
    }

    /// Ancho del chip de dorsal con este texto.
    pub(crate) fn chip_width(&self, window: &Window, label: &str) -> f32 {
        let g = &self.style.geometry;
        let ink = self.ink(Face::Mono, self.style.fonts.mono_small, 0.0, transparent());
        (text::width(window, label, &ink) + 2.0 * g.number_padding).max(g.number_min_width)
    }

    /// Chip de dorsal con el tinte de la clase, centrado en la fila.
    pub(crate) fn chip(
        &self,
        window: &mut Window,
        cx: &mut App,
        label: &str,
        class: &ClassColors,
        x: f32,
        y: f32,
    ) {
        let g = &self.style.geometry;
        let width = self.chip_width(window, label);
        let top = y + (g.row_height - g.number_height) / 2.0;
        round_rect(
            window,
            x,
            top,
            width,
            g.number_height,
            g.chip_radius,
            class.tint.hsla(),
        );
        let ink = self.ink(
            Face::Mono,
            self.style.fonts.mono_small,
            0.0,
            class.ink.hsla(),
        );
        let text_width = text::width(window, label, &ink);
        self.label(
            window,
            cx,
            label,
            x + (width - text_width) / 2.0,
            None,
            top,
            g.number_height,
            Face::Mono,
            &ink,
        );
    }

    /// Píldora rectangular (BOX, paradas, vueltas…), centrada en la fila.
    #[allow(clippy::too_many_arguments)] // Píldora: texto, posición y colores.
    pub(crate) fn pill(
        &self,
        window: &mut Window,
        cx: &mut App,
        label: &str,
        x: f32,
        y: f32,
        fill: Hsla,
        ink: Hsla,
    ) -> f32 {
        let g = &self.style.geometry;
        let width = self.pill_width(window, label);
        let top = y + (g.row_height - g.pill_height) / 2.0;
        round_rect(window, x, top, width, g.pill_height, g.chip_radius, fill);
        let ink = self.pill_ink(ink);
        self.label(
            window,
            cx,
            label,
            x + g.pill_padding,
            None,
            top,
            g.pill_height,
            Face::Body,
            &ink,
        );
        width
    }

    /// Línea superior de un pie.
    pub(crate) fn rule(&self, window: &mut Window, y: f32) {
        let pad = self.variant.padding_x;
        round_rect(
            window,
            pad,
            y,
            self.width - 2.0 * pad,
            1.0,
            0.0,
            self.style.colors.line.hsla(),
        );
    }
}
