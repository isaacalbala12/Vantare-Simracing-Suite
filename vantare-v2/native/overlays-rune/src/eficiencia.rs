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

/// Ángulo del brillo del panel, en grados, como GPUI (Rune lo pide en radianes).
pub const PANEL_ANGLE_DEG: f32 = 120.0;

pub fn panel(w: f32, h: f32) -> El {
    el().size(w, h)
        .radius(RADIUS)
        .fill(color(PANEL, 0.87))
        .child(
            el().absolute(0.0, 0.0)
                .size(w, h)
                .radius(RADIUS)
                .linear_gradient(
                    PANEL_ANGLE_DEG.to_radians(),
                    [(0.0, color(0xffffff, 0.03)), (0.38, color(0xffffff, 0.0))],
                ),
        )
}

/// Alfa del refuerzo superior para que, sobre `base`, componga `top`.
#[must_use]
pub fn top_overlay(base: f32, top: f32) -> f32 {
    let (base, top) = (base.clamp(0.0, 1.0), top.clamp(0.0, 1.0));
    if top <= base {
        0.0
    } else {
        (top - base) / (1.0 - base)
    }
}

/// Marco del panel en dos capas, como GPUI: el anillo completo a `base` y,
/// encima, una tira de `RADIUS` de alto con el borde a `top` compuesto.
pub fn outline(w: f32, h: f32, base: f32, top: f32) -> El {
    let overlay = top_overlay(base, top);
    el().size(w, h)
        .absolute(0.0, 0.0)
        .child(
            el().absolute(0.0, 0.0)
                .size(w, h)
                .radius(RADIUS)
                .border(1.0, color(0xffffff, base.clamp(0.0, 1.0))),
        )
        .child(
            el().absolute(0.0, 0.0)
                .size(w, RADIUS)
                .radius(RADIUS)
                .border_sides([1.0, 0.0, 0.0, 0.0], color(0xffffff, overlay)),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn font_selects_the_static_inter_family_without_synthesizing_its_weight() {
        for (weight, family) in [
            (400, "Inter W400"),
            (500, "Inter W500"),
            (600, "Inter W600"),
            (650, "Inter W650"),
            (700, "Inter W700"),
            (750, "Inter W750"),
            (800, "Inter W800"),
            (550, "Inter W400"),
        ] {
            let style = font(14.0, weight, 0.0);
            assert!(matches!(style.family, Family::Named(name) if name == family));
            assert_eq!(style.weight, 400.0, "weight is baked into the static font");
        }
    }

    #[test]
    fn fit_preserves_fitting_unicode_and_elides_with_the_loaded_fonts_own_measurements() {
        let _fonts = rune::text::TextSystem::new(FONTS, ("Inter W400", "Inter W400"));
        for weight in [400, 500, 600, 650, 700, 750, 800] {
            let style = font(14.0, weight, -0.025);
            let name = "ANDRÉ LOTTERER";
            assert_eq!(fit(name, style, width(name, style)), name);
            assert_eq!(fit("", style, 0.0), "");
            assert_eq!(fit(name, style, 0.0), "");
            let budget = width("ANDRÉ…", style);
            let short = fit(name, style, budget);
            let prefix = short.strip_suffix('…').expect("ellipsis for a long name");
            assert!(!prefix.is_empty());
            assert!(name.starts_with(prefix));
            assert_ne!(short, name);
            assert_eq!(fit(&short, style, budget), short, "the elided text fits");
        }
    }
}

#[cfg(test)]
mod width_tests {
    use super::*;

    #[test]
    fn width_adds_the_tracking_of_every_character_like_gpui() {
        let _fonts = rune::text::TextSystem::new(FONTS, ("Inter W400", "Inter W400"));
        let plain = font(14.0, 600, 0.0);
        let tracked = font(14.0, 600, 0.14);
        let value = "SIN DATOS";
        let chars = value.chars().count() as f32;
        let delta = width(value, tracked) - width(value, plain);
        let expected = chars * 0.14 * 14.0;
        assert!(
            (delta - expected).abs() <= 0.5,
            "Rune mide {delta} px de tracking; GPUI suma {expected} px ({chars} caracteres)"
        );
    }
}

#[cfg(test)]
mod parity_tests {
    use super::*;

    #[test]
    fn panel_angle_is_gpui_120_degrees_in_runes_radians() {
        assert_eq!(PANEL_ANGLE_DEG, 120.0);
        let radians = PANEL_ANGLE_DEG.to_radians();
        assert!(
            (radians - std::f32::consts::TAU / 3.0).abs() < 1e-6,
            "120° = 2π/3"
        );
        assert!(
            (radians.to_degrees() - 120.0).abs() < 1e-3,
            "vuelta a grados {radians:?}"
        );
    }

    #[test]
    fn outline_composes_the_top_edge_over_the_base_ring() {
        let overlay = top_overlay(0.12, 0.24);
        assert!((overlay - 0.136_363_64).abs() < 1e-5, "overlay {overlay}");
        assert!(
            (0.12 + overlay * (1.0 - 0.12) - 0.24).abs() < 1e-6,
            "compone 24 %"
        );
        assert_eq!(top_overlay(0.085, 0.085), 0.0, "Relative: marco uniforme");
        assert_eq!(
            top_overlay(0.12, 0.12),
            0.0,
            "Delta/Pedales: marco uniforme"
        );
        assert_eq!(top_overlay(0.2, 0.1), 0.0, "un tope menor no resta");
        assert_eq!(top_overlay(2.0, 3.0), 0.0, "fuera de rango se recorta");
    }

    #[test]
    fn font_keeps_the_css_line_height_and_the_tracking_in_points() {
        let style = font(14.0, 600, 0.14);
        let normal = (14.0_f32 * 1984.0 / 2048.0).round() + (14.0_f32 * 494.0 / 2048.0).round();
        assert_eq!(style.line_height, normal, "línea normal CSS");
        assert!(
            (style.tracking - 0.14 * 14.0).abs() < 1e-6,
            "tracking en puntos"
        );
        assert_eq!(style.weight, 400.0, "el peso va en la familia estática");
    }

    #[test]
    fn baseline_matches_the_css_half_leading_of_gpui() {
        let ascent = (11.0_f32 * 1984.0 / 2048.0).round();
        let descent = (11.0_f32 * 494.0 / 2048.0).round();
        let expected = 22.0 + ascent + ((11.0_f32 - ascent - descent) / 2.0).floor();
        assert_eq!(baseline(22.0, 11.0, 11.0), expected);
        assert_eq!(
            baseline(14.0, 14.0, 14.0),
            14.0 + 14.0 + ((14.0_f32 - 14.0 - 3.0) / 2.0).floor()
        );
    }

    #[test]
    fn tokens_are_the_gpui_efficiency_ones() {
        assert_eq!(INK, 0xf5f5f5);
        assert_eq!(MUTED, 0xb9b9bd);
        assert_eq!(PANEL, 0x101113);
        assert_eq!(RADIUS, 6.0);
        let ink = color(INK, 0.5);
        assert!((ink.r - 245.0 / 255.0).abs() < 1e-6);
        assert!((ink.g - 245.0 / 255.0).abs() < 1e-6);
        assert!((ink.b - 245.0 / 255.0).abs() < 1e-6);
        assert_eq!(ink.a, 0.5);
        assert_eq!(color(0x000000, 0.0).r, 0.0);
    }
}
