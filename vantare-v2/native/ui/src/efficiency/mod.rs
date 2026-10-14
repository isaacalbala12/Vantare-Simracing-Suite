//! Kit mínimo Eficiencia, compartido por Standings, radar y pedales.
//! Las composiciones y efectos que solo usa un widget permanecen en él.

use crate::efficiency::preview::PaintWindow as Window;
use gpui::{BorderStyle, Bounds, Corners, Edges, Hsla, Pixels, Rgba, fill, point, px, quad, size};

pub mod preview;
pub mod text;

/// Estimación histórica de filas de información; los pintores deciden cuándo
/// aplicarla y cuánto espacio reservar. Cuenta caracteres, no bytes UTF-8.
pub(crate) fn footer_rows(
    cells: &[vantare_domain::standings::InfoCell],
    inner_width: f32,
) -> usize {
    let total = cells
        .iter()
        .map(|cell| {
            cell.label.chars().count() as f32 * 5.5 + cell.value.chars().count() as f32 * 7.5 + 26.0
        })
        .sum::<f32>();
    (total / inner_width.max(80.0)).ceil() as usize
}

/// Valores compartidos de `vantare-functional/tokens.css`.
pub mod tokens {
    pub const INK: u32 = 0xf5f5f5;
    pub const MUTED: u32 = 0xb9b9bd;
    pub const PANEL: u32 = 0x101113;
    pub const LOSS: u32 = 0xd95360;
    pub const RADIUS: f32 = 6.0;
}

pub fn col(hex: u32, alpha: f32) -> Hsla {
    Rgba {
        r: ((hex >> 16) & 0xff) as f32 / 255.0,
        g: ((hex >> 8) & 0xff) as f32 / 255.0,
        b: (hex & 0xff) as f32 / 255.0,
        a: alpha,
    }
    .into()
}

/// Bordes ajustados como Chrome (mitades hacia arriba), en coordenadas del widget.
pub fn rect(x: f32, y: f32, w: f32, h: f32) -> Bounds<Pixels> {
    let (ox, oy) = text::origin();
    let (x, y) = (x + ox, y + oy);
    let snap = |value: f32| (value + 0.5).floor();
    let (left, top) = (snap(x), snap(y));
    let (right, bottom) = (snap(x + w).max(left), snap(y + h).max(top));
    Bounds::new(
        point(px(left), px(top)),
        size(px(right - left), px(bottom - top)),
    )
}

pub fn paint_rect(window: &mut Window, x: f32, y: f32, w: f32, h: f32, color: Hsla) {
    if w > 0.0 && h > 0.0 {
        window.paint_quad(fill(rect(x, y, w, h), color));
    }
}

/// Fondo del panel. Cada widget conserva sus degradados y su opacidad actual.
pub fn paint_panel(window: &mut Window, width: f32, height: f32, alpha: f32) {
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        col(tokens::PANEL, alpha),
        Edges::all(px(0.0)),
        col(0x000000, 0.0),
        BorderStyle::default(),
    ));
}

/// Marco interior común de 1 px, blanco al 12 %.
pub fn paint_frame(window: &mut Window, width: f32, height: f32) {
    window.paint_quad(quad(
        rect(0.0, 0.0, width, height),
        Corners::all(px(tokens::RADIUS)),
        col(0x000000, 0.0),
        Edges::all(px(1.0)),
        col(0xffffff, 0.12),
        BorderStyle::default(),
    ));
}

/// Marco del panel CSS: lados al 12 % y borde superior al 24 %.
pub fn paint_highlighted_frame(window: &mut Window, width: f32, height: f32) {
    paint_frame(window, width, height);
    // Source-over: base + refuerzo * (1 - base) = opacidad del CSS.
    // Aplicar otro 24 % encima del 12 % produciría un borde al 33,12 %.
    let overlay_alpha = (0.24 - 0.12) / (1.0 - 0.12);
    window.paint_quad(quad(
        rect(0.0, 0.0, width, tokens::RADIUS),
        Corners {
            top_left: px(tokens::RADIUS),
            top_right: px(tokens::RADIUS),
            bottom_left: px(0.0),
            bottom_right: px(0.0),
        },
        col(0x000000, 0.0),
        Edges {
            top: px(1.0),
            ..Edges::all(px(0.0))
        },
        col(0xffffff, overlay_alpha),
        BorderStyle::default(),
    ));
}

#[cfg(test)]
mod tests {
    #[test]
    fn footer_row_estimate_counts_unicode_and_preserves_the_existing_widths() {
        let cell = vantare_domain::standings::InfoCell {
            id: "track".into(),
            label: "ÁÉÍÓÚÑ".into(),
            value: "123456".into(),
            stale: false,
        };
        let cells = vec![cell; 6];
        assert_eq!(super::footer_rows(&cells, 446.0), 2);
        assert_eq!(super::footer_rows(&cells, 200.0), 4);
        assert_eq!(super::footer_rows(&[], 446.0), 0);
    }

    use super::*;

    #[test]
    fn widget_rects_snap_after_translation_and_do_not_invert() {
        text::with_origin((-10.0, 20.0), || {
            let bounds = rect(0.5, 0.5, 16.0, 32.0);
            assert_eq!(bounds.origin, point(px(-9.0), px(21.0)));
            assert_eq!(bounds.size, size(px(16.0), px(32.0)));
            let empty = rect(0.5, 0.5, -2.0, -3.0);
            assert_eq!(empty.size, size(px(0.0), px(0.0)));
            text::with_origin((100.0, 200.0), || {
                assert_eq!(
                    rect(0.0, 0.0, 120.0, 160.0).origin,
                    point(px(100.0), px(200.0))
                );
            });
            assert_eq!(text::origin(), (-10.0, 20.0));
        });
        assert_eq!(text::origin(), (0.0, 0.0));
    }
}
