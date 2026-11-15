//! Piezas del Look Eficiencia. Mismas fuentes y medidas que UI; sin enlazar GPUI.
use rune::{Color, El, Family, TextStyle, el, text};

pub const INK: u32 = 0xf5f5f5;
pub const MUTED: u32 = 0xb9b9bd;
pub const PANEL: u32 = 0x101113;
pub const RADIUS: f32 = 6.0;
// Referencias al recurso del producto, sin otra copia de los ficheros.
pub const FONTS: &[&[u8]] = &[
    include_bytes!("../../ui/assets/fonts/Inter-400.ttf"),
    include_bytes!("../../ui/assets/fonts/Inter-500.ttf"),
    include_bytes!("../../ui/assets/fonts/Inter-600.ttf"),
    include_bytes!("../../ui/assets/fonts/Inter-650.ttf"),
    include_bytes!("../../ui/assets/fonts/Inter-700.ttf"),
    include_bytes!("../../ui/assets/fonts/Inter-750.ttf"),
    include_bytes!("../../ui/assets/fonts/Inter-800.ttf"),
];

pub fn color(rgb: u32, alpha: f32) -> Color {
    Color {
        r: ((rgb >> 16) & 255) as f32 / 255.0,
        g: ((rgb >> 8) & 255) as f32 / 255.0,
        b: (rgb & 255) as f32 / 255.0,
        a: alpha,
    }
}

pub fn font(size: f32, weight: u16, tracking_em: f32) -> TextStyle {
    // Las instancias estáticas tienen familia propia y peso interno 400.
    let family = match weight {
        500 => "Inter W500",
        600 => "Inter W600",
        650 => "Inter W650",
        700 => "Inter W700",
        750 => "Inter W750",
        800 => "Inter W800",
        _ => "Inter W400",
    };
    TextStyle {
        family: Family::Named(family),
        tracking: tracking_em * size,
        features: "'tnum' 1, 'kern' 1",
        line_height: (size * 1984.0 / 2048.0).round() + (size * 494.0 / 2048.0).round(),
        ..TextStyle::new(size, 400.0)
    }
}

pub fn width(value: &str, style: TextStyle) -> f32 {
    if value.is_empty() {
        0.0
    } else {
        rune::text::measure(value, &[], style, None).0
    }
}

pub fn fit(value: &str, style: TextStyle, max: f32) -> String {
    if width(value, style) <= max + 0.01 {
        return value.to_owned();
    }
    let mut value = value.to_owned();
    while value.pop().is_some() {
        let candidate = format!("{value}…");
        if width(&candidate, style) <= max + 0.01 {
            return candidate;
        }
    }
    String::new()
}

/// Baseline CSS compartida con Eficiencia de GPUI (semileading redondeado abajo).
pub fn baseline(top: f32, line_height: f32, size: f32) -> f32 {
    let ascent = (size * 1984.0 / 2048.0).round();
    let descent = (size * 494.0 / 2048.0).round();
    top + ascent + ((line_height - ascent - descent) / 2.0).floor()
}

pub fn label(value: &str, x: f32, base: f32, style: TextStyle, ink: Color) -> El {
    let ascent = (style.size * 1984.0 / 2048.0).round();
    text(value)
        .font(style)
        .color(ink)
        .absolute(x, base - ascent)
}

pub fn rect(x: f32, y: f32, w: f32, h: f32, ink: Color) -> El {
    el().absolute(x, y).size(w.max(0.0), h.max(0.0)).fill(ink)
}

pub fn panel(w: f32, h: f32) -> El {
    el().size(w, h)
        .radius(RADIUS)
        .fill(color(PANEL, 0.87))
        .child(
            el().absolute(0.0, 0.0)
                .size(w, h)
                .radius(RADIUS)
                .linear_gradient(
                    120.0,
                    [(0.0, color(0xffffff, 0.03)), (0.38, color(0xffffff, 0.0))],
                ),
        )
}

pub fn outline(w: f32, h: f32) -> El {
    el().size(w, h)
        .absolute(0.0, 0.0)
        .radius(RADIUS)
        .border(1.0, color(0xffffff, 0.085))
        .child(
            el().absolute(0.0, 0.0)
                .size(w, 6.0)
                .radius(RADIUS)
                .border_sides([1.0, 0.0, 0.0, 0.0], color(0xffffff, 0.085)),
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn original_inter_instances_measure_and_fit_unicode_without_a_device() {
        let _fonts = rune::text::TextSystem::new(FONTS, ("Inter W400", "Inter W400"));
        let style = font(14.0, 700, -0.025);
        let name = "ANDRÉ LOTTERER";
        let max = width("ANDRÉ…", style);
        let short = fit(name, style, max);
        assert!(short.ends_with('…'));
        assert!(width(&short, style) <= max + 0.01);
        assert_eq!(fit(name, style, 0.0), "");
        assert_eq!(fit(name, style, 1000.0), name);
        assert_eq!(width("", style), 0.0);
        assert_eq!(baseline(36.0, 29.0, 14.0), 56.0);
    }
}
