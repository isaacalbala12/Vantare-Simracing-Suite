//! Imágenes del pintor GPUI; caché propiedad del widget, sin estado global.
use super::{
    model::Config,
    style::{Shadow, Style},
};
use rune::{Image, ImageCache};
use std::sync::Arc;

pub(super) const LOGO: &[u8] = include_bytes!("logo-24.rgba");
type ShadowKey = (u32, u32, u32, Shadow);
pub(super) struct Assets {
    cache: Arc<ImageCache>,
    pub logo: Image,
    pub shadow: Option<(ShadowKey, Image)>,
}
impl Assets {
    pub fn new(cache: &Arc<ImageCache>) -> Self {
        Self {
            cache: cache.clone(),
            logo: cache.rgba(24, 24, LOGO),
            shadow: None,
        }
    }
    pub fn sync(&mut self, config: &Config, pit: bool) {
        if !pit {
            self.shadow = None;
            return;
        }
        let style = &config.style;
        let height = config.height as u32;
        let key = (
            height,
            config.width.to_bits(),
            style.geometry.pit_rail_width.to_bits(),
            style.shadow.clone(),
        );
        if self.shadow.as_ref().is_some_and(|(last, _)| *last == key) {
            return;
        }
        let pixels = shadow_strip(style, config.width, height);
        self.shadow = Some((
            key,
            self.cache
                .rgba(style.geometry.pit_rail_width as u32, height, pixels),
        ));
    }
}

// Literal view::shadow_strip: sigma=blur/2, rectángulo reducido y desplazado.
pub(super) fn shadow_strip(style: &Style, width: f32, height: u32) -> Vec<u8> {
    fn phi(x: f32) -> f32 {
        let z = x.abs() / std::f32::consts::SQRT_2;
        let t = 1.0 / (1.0 + 0.327_591_1 * z);
        let poly = t
            * (0.254_829_6
                + t * (-0.284_496_74 + t * (1.421_413_8 + t * (-1.453_152_1 + t * 1.061_405_4))));
        let erf = 1.0 - poly * (-z * z).exp();
        f32::midpoint(1.0, erf.copysign(x))
    }
    let (sigma, edge_x, top, bottom) = (
        style.shadow.sigma,
        width + style.shadow.spread,
        -style.shadow.spread + style.shadow.offset_y,
        height as f32 + style.shadow.spread + style.shadow.offset_y,
    );
    let mut pixels =
        Vec::with_capacity((style.geometry.pit_rail_width as u32 * height * 4) as usize);
    for y in 0..height {
        let gy = phi((y as f32 + 0.5 - top) / sigma) - phi((y as f32 + 0.5 - bottom) / sigma);
        for x in 0..style.geometry.pit_rail_width as u32 {
            let gx = phi((edge_x - (width + x as f32 + 0.5)) / sigma);
            let alpha = (style.shadow.alpha * gx * gy * 255.0)
                .round()
                .clamp(0.0, 255.0) as u8;
            pixels.extend_from_slice(&[0, 0, 0, alpha]);
        }
    }
    pixels
}
