//! Kit mínimo Eficiencia, compartido por Standings, radar y pedales.
//! Las composiciones y efectos que solo usa un widget permanecen en él.

use gpui::{
    BorderStyle, Bounds, Corners, Edges, Hsla, Pixels, Rgba, Window, fill, point, px, quad, size,
};

pub mod text;

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

#[cfg(test)]
mod tests {
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
