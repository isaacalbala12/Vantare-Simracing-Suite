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
    scale_y: f32,
}

impl Transform {
    /// La vista previa de Workshop con anchura original y altura distinta
    /// (escala X=1, Y≠1) también transforma: paths y sombras no pueden
    /// omitir el eje Y.
    fn scaled(self) -> bool {
        self.scale != 1.0 || self.scale_y != 1.0
    }

    fn point(self, point: Point<Pixels>) -> Point<Pixels> {
        if self.scaled() {
            gpui::point(
                self.origin.x + (point.x - self.origin.x) * self.scale,
                self.origin.y + (point.y - self.origin.y) * self.scale_y,
            )
        } else {
            point
        }
    }

    fn bounds(self, bounds: Bounds<Pixels>) -> Bounds<Pixels> {
        if self.scaled() {
            Bounds::new(
                self.point(bounds.origin),
                gpui::size(
                    bounds.size.width * self.scale,
                    bounds.size.height * self.scale_y,
                ),
            )
        } else {
            bounds
        }
    }

    fn quad(self, mut quad: PaintQuad) -> PaintQuad {
        if self.scaled() {
            quad.bounds = self.bounds(quad.bounds);
            quad.corner_radii = quad.corner_radii.map(|v| *v * self.scale);
            quad.border_widths = quad.border_widths.map(|v| *v * self.scale);
        }
        quad
    }

    fn path(self, mut path: Path<Pixels>) -> Path<Pixels> {
        if self.scaled() {
            path.bounds = self.bounds(path.bounds);
            for vertex in &mut path.vertices {
                vertex.xy_position = self.point(vertex.xy_position);
            }
        }
        path
    }

    fn shadow(self, shadow: &BoxShadow) -> BoxShadow {
        BoxShadow {
            offset: gpui::point(shadow.offset.x * self.scale, shadow.offset.y * self.scale_y),
            blur_radius: shadow.blur_radius * self.scale,
            spread_radius: shadow.spread_radius * self.scale,
            ..shadow.clone()
        }
    }
}

/// Ventana de pintado del widget. Solo transforma primitivas; GPUI sigue siendo
/// propietario del layout, máscaras, atlas y DPI. No cambia la ventana real.
pub struct PaintWindow<'a> {
    window: &'a mut Window,
    transform: Transform,
}

impl<'a> PaintWindow<'a> {
    pub(crate) fn new(
        window: &'a mut Window,
        origin: Point<Pixels>,
        scale: f32,
        scale_y: f32,
    ) -> Self {
        Self {
            window,
            transform: Transform {
                origin,
                scale,
                scale_y,
            },
        }
    }

    pub fn preview_scale(&self) -> f32 {
        self.transform.scale_y
    }
    pub fn preview_axes(&self) -> (f32, f32) {
        (self.transform.scale, self.transform.scale_y)
    }

    pub fn paint_quad(&mut self, quad: PaintQuad) {
        self.window.paint_quad(self.transform.quad(quad));
    }

    pub fn paint_path(&mut self, path: Path<Pixels>, color: impl Into<Background>) {
        self.window.paint_path(self.transform.path(path), color);
    }

    pub fn paint_drop_shadows(
        &mut self,
        bounds: Bounds<Pixels>,
        corners: Corners<Pixels>,
        shadows: &[BoxShadow],
    ) {
        let transform = self.transform;
        if transform.scaled() {
            let shadows: Vec<_> = shadows
                .iter()
                .map(|shadow| transform.shadow(shadow))
                .collect();
            self.window.paint_drop_shadows(
                transform.bounds(bounds),
                corners.map(|v| *v * transform.scale),
                &shadows,
            );
        } else {
            self.window.paint_drop_shadows(bounds, corners, shadows);
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
    use gpui::{BorderStyle, Edges, PathBuilder, point, px, quad, size};

    /// Workshop con anchura original y altura distinta (X=1, Y≠1): paths y
    /// sombras también se transforman (#1540).
    #[test]
    fn height_only_scale_counts_as_scaled() {
        let transform = Transform {
            origin: point(px(10.0), px(20.0)),
            scale: 1.0,
            scale_y: 0.5,
        };
        assert!(transform.scaled());
        assert!(
            !Transform {
                origin: transform.origin,
                scale: 1.0,
                scale_y: 1.0,
            }
            .scaled()
        );
    }

    #[test]
    fn height_only_scale_transforms_path_bounds_and_vertices() {
        let origin = point(px(10.0), px(20.0));
        let transform = Transform {
            origin,
            scale: 1.0,
            scale_y: 0.5,
        };
        let mut builder = PathBuilder::fill();
        builder.move_to(point(px(10.0), px(20.0)));
        builder.line_to(point(px(30.0), px(20.0)));
        builder.line_to(point(px(30.0), px(60.0)));
        let result = transform.path(builder.build().expect("path de prueba"));
        assert_eq!(result.bounds.origin, origin);
        assert_eq!(result.bounds.size, size(px(20.0), px(20.0)));
        let expected = [
            point(px(10.0), px(20.0)),
            point(px(30.0), px(20.0)),
            point(px(30.0), px(40.0)),
        ];
        assert!(!result.vertices.is_empty());
        for vertex in &result.vertices {
            assert!(expected.contains(&vertex.xy_position));
        }
    }

    #[test]
    fn height_only_scale_moves_shadow_offset_on_y() {
        let transform = Transform {
            origin: point(px(0.0), px(0.0)),
            scale: 1.0,
            scale_y: 0.5,
        };
        let shadow = BoxShadow {
            offset: point(px(4.0), px(8.0)),
            blur_radius: px(6.0),
            spread_radius: px(2.0),
            color: gpui::black(),
            inset: false,
        };
        let result = transform.shadow(&shadow);
        assert_eq!(result.offset, point(px(4.0), px(4.0)));
        assert_eq!(result.blur_radius, px(6.0));
        assert_eq!(result.spread_radius, px(2.0));
    }

    #[test]
    fn independent_axes_scale_bounds_and_keep_widget_origin() {
        let origin = point(px(30.0), px(50.0));
        let transform = Transform {
            origin,
            scale: 2.0,
            scale_y: 0.5,
        };
        let result = transform.bounds(Bounds::new(
            origin + point(px(10.0), px(20.0)),
            size(px(100.0), px(80.0)),
        ));
        assert_eq!(result.origin, origin + point(px(20.0), px(10.0)));
        assert_eq!(result.size, size(px(200.0), px(40.0)));
    }

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
            let transform = Transform {
                origin,
                scale,
                scale_y: scale,
            };
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
            scale_y: 1.0,
        };
        let bounds = Bounds::new(point(px(-6.9), px(18.123)), size(px(0.42), px(10.75)));
        assert_eq!(transform.bounds(bounds), bounds);
        assert_eq!(transform.point(bounds.origin), bounds.origin);
    }
}
