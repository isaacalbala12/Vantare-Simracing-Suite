//! TEMPORAL: sustituir por `crate::eficiencia` cuando exista (PR de B).
//! Tokens y medidas mínimos del Look Eficiencia: Inter, colores y recorte.
use rune::{Color, Family, TextStyle, text};

pub(super) const INK: u32 = 0xf5f5f5;
pub(super) const MUTED: u32 = 0xb9b9bd;
pub(super) const PANEL: u32 = 0x101113;
pub(super) const RADIUS: f32 = 6.0;

pub(super) fn color(hex: u32, alpha: f32) -> Color {
    Color {
        r: ((hex >> 16) & 0xff) as f32 / 255.0,
        g: ((hex >> 8) & 0xff) as f32 / 255.0,
        b: (hex & 0xff) as f32 / 255.0,
        a: alpha,
    }
}

/// Inter con la altura de línea igual al tamaño, como el CSS del producto.
pub(super) fn font(size: f32, weight: f32) -> TextStyle {
    TextStyle {
        family: Family::Named("Inter"),
        features: "'tnum' 1",
        line_height: size,
        tracking: 0.0,
        ..TextStyle::new(size, weight)
    }
}

pub(super) fn width(value: &str, size: f32, weight: f32) -> f32 {
    text::measure(value, &[], font(size, weight), None).0
}

/// Recorta con puntos suspensivos hasta caber, como el `fit` de GPUI.
pub(super) fn fit(value: &str, max: f32, size: f32, weight: f32) -> String {
    if width(value, size, weight) <= max + 0.01 {
        return value.to_string();
    }
    let chars: Vec<char> = value.chars().collect();
    for keep in (0..chars.len()).rev() {
        let candidate: String = chars[..keep].iter().collect::<String>() + "…";
        if width(&candidate, size, weight) <= max + 0.01 {
            return candidate;
        }
    }
    String::new()
}
