//! Escala las primitivas del renderer común alrededor de la esquina del widget.
//! El factor 1 conserva el pintado de las ventanas de overlay byte a byte.
use std::{
    ops::{Deref, DerefMut},
    sync::Arc,
};

use gpui::{
    App, Background, Bounds, BoxShadow, ContentMask, Corners, Hsla, PaintQuad, Path, Pixels, Point,
    RenderImage, SharedString, TransformationMatrix, Window,
};

#[derive(Clone, Copy)]
struct Transform {
    origin: Point<Pixels>,
    scale: f32,
}

impl Transform {
    fn point(self, point: Point<Pixels>) -> Point<Pixels> {
        if self.scale == 1.0 {
            point
        } else {
            self.origin + (point - self.origin) * self.scale
        }
    }

    fn bounds(self, bounds: Bounds<Pixels>) -> Bounds<Pixels> {
        if self.scale == 1.0 {
            bounds
        } else {
            Bounds::new(
                self.point(bounds.origin),
                bounds.size.map(|v| v * self.scale),
            )
        }
    }

    fn quad(self, mut quad: PaintQuad) -> PaintQuad {
        if self.scale != 1.0 {
            quad.bounds = self.bounds(quad.bounds);
            quad.corner_radii = quad.corner_radii.map(|v| *v * self.scale);
            quad.border_widths = quad.border_widths.map(|v| *v * self.scale);
        }
        quad
    }
}

/// Ventana de pintado del widget. Solo transforma primitivas; GPUI sigue siendo
/// propietario del layout, máscaras, atlas y DPI. No cambia la ventana real.
pub struct PaintWindow<'a> {
    window: &'a mut Window,
    transform: Transform,
}

impl<'a> PaintWindow<'a> {
    pub(crate) fn new(window: &'a mut Window, origin: Point<Pixels>, scale: f32) -> Self {
        Self {
            window,
            transform: Transform { origin, scale },
        }
    }

    pub fn preview_scale(&self) -> f32 {
        self.transform.scale
    }

    pub fn paint_quad(&mut self, quad: PaintQuad) {
        self.window.paint_quad(self.transform.quad(quad));
    }

    pub fn paint_path(&mut self, mut path: Path<Pixels>, color: impl Into<Background>) {
        if self.transform.scale != 1.0 {
            path.bounds = self.transform.bounds(path.bounds);
            for vertex in &mut path.vertices {
                vertex.xy_position = self.transform.point(vertex.xy_position);
            }
        }
        self.window.paint_path(path, color);
    }

    pub fn paint_drop_shadows(
        &mut self,
        bounds: Bounds<Pixels>,
        corners: Corners<Pixels>,
        shadows: &[BoxShadow],
    ) {
        let scale = self.transform.scale;
        if scale == 1.0 {
            self.window.paint_drop_shadows(bounds, corners, shadows);
        } else {
            let shadows: Vec<_> = shadows
                .iter()
                .map(|shadow| BoxShadow {
                    offset: shadow.offset * scale,
                    blur_radius: shadow.blur_radius * scale,
                    spread_radius: shadow.spread_radius * scale,
                    ..shadow.clone()
                })
                .collect();
            self.window.paint_drop_shadows(
                self.transform.bounds(bounds),
                corners.map(|v| *v * scale),
                &shadows,
            );
        }
    }

    pub fn with_content_mask<R>(
        &mut self,
        mask: Option<ContentMask<Pixels>>,
        paint: impl FnOnce(&mut PaintWindow<'_>) -> R,
    ) -> R {
        let transform = self.transform;
        let mask = mask.map(|mask| ContentMask {
            bounds: transform.bounds(mask.bounds),
        });
        self.window
            .with_content_mask(mask, |window| paint(&mut PaintWindow { window, transform }))
    }

    pub fn paint_svg(
        &mut self,
        bounds: Bounds<Pixels>,
        path: SharedString,
        data: Option<&[u8]>,
        transformation: TransformationMatrix,
        color: Hsla,
        cx: &App,
    ) -> gpui::Result<()> {
        self.window.paint_svg(
            self.transform.bounds(bounds),
            path,
            data,
            transformation,
            color,
            cx,
        )
    }

    pub fn paint_image(
        &mut self,
        bounds: Bounds<Pixels>,
        image_bounds: Bounds<Pixels>,
        corners: Corners<Pixels>,
        data: Arc<RenderImage>,
        frame_index: usize,
        grayscale: bool,
    ) -> gpui::Result<()> {
        self.window.paint_image(
            self.transform.bounds(bounds),
            self.transform.bounds(image_bounds),
            corners.map(|v| *v * self.transform.scale),
            data,
            frame_index,
            grayscale,
        )
    }
}

impl Deref for PaintWindow<'_> {
    type Target = Window;
    fn deref(&self) -> &Self::Target {
        self.window
    }
}

impl DerefMut for PaintWindow<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.window
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use gpui::{BorderStyle, Edges, point, px, quad, size};

    #[test]
    fn scales_position_size_borders_and_last_pixel_inside_the_frame() {
        let (width, height) = crate::Overlay::new(
            crate::Kind::Standings,
            vantare_domain::format::Preferences::default(),
        )
        .wanted_size();
        for scale in [700.0 / 1920.0, 0.5, 0.75, 1.0, 1.25, 1.5] {
            // Standings junto al borde derecho del overlay, con origen de ventana no nulo.
            let stage = point(px(398.0), px(298.0));
            let origin = stage + point(px(1920.0 - width - 20.0), px(40.0)) * scale;
            let transform = Transform { origin, scale };
            let source = Bounds::new(origin, size(px(width), px(height)));
            let result = transform.quad(quad(
                source,
                Corners::all(px(6.0)),
                gpui::black(),
                Edges::all(px(1.0)),
                gpui::white(),
                BorderStyle::default(),
            ));
            assert_eq!(result.bounds.origin, origin);
            assert_eq!(result.bounds.size, source.size.map(|v| v * scale));
            assert_eq!(result.corner_radii.top_left, px(6.0 * scale));
            assert_eq!(result.border_widths.right, px(scale));
            let last = transform.point(origin + point(px(width - 1.0), px(height - 1.0)));
            assert!(
                result.bounds.contains(&last),
                "el último píxel no se recorta"
            );
            assert!(result.bounds.right() < stage.x + px(1920.0 * scale));
        }
    }

    #[test]
    fn identity_preserves_fractional_and_negative_coordinates_exactly() {
        let transform = Transform {
            origin: point(px(-14.2), px(72.7)),
            scale: 1.0,
        };
        let bounds = Bounds::new(point(px(-6.9), px(18.123)), size(px(0.42), px(10.75)));
        assert_eq!(transform.bounds(bounds), bounds);
        assert_eq!(transform.point(bounds.origin), bounds.origin);
    }
}
