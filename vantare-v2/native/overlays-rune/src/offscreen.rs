//! Destino fuera de pantalla del pintor público de Rune. No crea App, ventana,
//! event loop ni superficie de escritorio. Solo el ejecutor gráfico lo llama;
//! servidor/CI prueban el contrato mediante un pintor falso y Runtime CPU.
use rune::{
    Runtime,
    render::{Gpu, OFFSCREEN_FORMAT, Offscreen, Renderer},
};

/// Cota previa a reservar memoria o crear un dispositivo. 4096² RGBA = 64 MiB.
const MAX_EDGE: u32 = 4096;
const MAX_PIXELS: u64 = 4096 * 4096;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Size {
    logical: (f32, f32),
    scale: f32,
    pixels: (u32, u32),
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Error {
    InvalidSize,
    InvalidPixels,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidSize => "tamaño o escala de captura inválidos (máximo 4096 × 4096)",
            Self::InvalidPixels => "el pintor devolvió un tamaño RGBA distinto al solicitado",
        })
    }
}
impl std::error::Error for Error {}

impl Size {
    pub fn new(logical: (f32, f32), scale: f32) -> Result<Self, Error> {
        if ![logical.0, logical.1, scale]
            .into_iter()
            .all(|v| v.is_finite() && v > 0.0)
        {
            return Err(Error::InvalidSize);
        }
        let (w, h) = (
            (logical.0 as f64 * scale as f64).round(),
            (logical.1 as f64 * scale as f64).round(),
        );
        if w < 1.0
            || h < 1.0
            || w > MAX_EDGE as f64
            || h > MAX_EDGE as f64
            || w * h > MAX_PIXELS as f64
        {
            return Err(Error::InvalidSize);
        }
        Ok(Self {
            logical,
            scale,
            pixels: (w as u32, h as u32),
        })
    }
    pub fn logical(self) -> (f32, f32) {
        self.logical
    }
    pub fn scale(self) -> f32 {
        self.scale
    }
    pub fn pixels(self) -> (u32, u32) {
        self.pixels
    }
    fn len(self) -> usize {
        self.pixels.0 as usize * self.pixels.1 as usize * 4
    }
}

/// RGBA8 sRGB con alfa recta: se puede codificar con rune::render::write_png.
pub struct Rgba {
    pub size: Size,
    pub pixels: Vec<u8>,
}

/// El punto de sustitución es una función, no un segundo renderizador ni una
/// ventana oculta. Las pruebas de CI nunca invocan render_gpu.
pub fn render_with<S: 'static, E: From<Error>>(
    runtime: &mut Runtime<S>,
    size: Size,
    painter: impl FnOnce(&mut Runtime<S>, Size) -> Result<Vec<u8>, E>,
) -> Result<Rgba, E> {
    runtime.transparent = true;
    runtime.set_viewport(size.logical, size.scale);
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    let pixels = painter(runtime, size)?;
    if pixels.len() != size.len() {
        return Err(Error::InvalidPixels.into());
    }
    Ok(Rgba { size, pixels })
}

/// Solo PC de juego autorizado. Usa las instancias del mismo Runtime que pista;
/// no delega a las opciones internas --snap/--frames de Rune.
pub fn render_gpu<S: 'static>(
    runtime: &mut Runtime<S>,
    size: Size,
) -> Result<Rgba, Box<dyn std::error::Error>> {
    let gpu = Gpu::try_new(Gpu::instance(), None).map_err(std::io::Error::other)?;
    // Rune puede componer en lineal o en sRGB; el PNG siempre sale en sRGB.
    let srgb_blend = runtime.srgb_blend();
    let format = if srgb_blend {
        OFFSCREEN_FORMAT.remove_srgb_suffix()
    } else {
        OFFSCREEN_FORMAT
    };
    let mut renderer = Renderer::new(&gpu.device, format);
    renderer.set_srgb_blend(srgb_blend);
    renderer.attach_text(&mut runtime.text.atlas);
    render_with(runtime, size, |runtime, size| {
        let (w, h) = size.pixels;
        let target = Offscreen::with_format(&gpu.device, w, h, format);
        renderer.upload_images(&gpu.device, &gpu.queue, &mut runtime.images);
        renderer.prepare_surfaces(&gpu.device, &gpu.queue, &runtime.surfaces, size.pixels);
        renderer.prepare(
            &gpu.device,
            &gpu.queue,
            &mut runtime.text.atlas,
            &runtime.instances,
            size.pixels,
        );
        let mut encoder = gpu.device.create_command_encoder(&Default::default());
        renderer.draw(&mut encoder, &target.view, [0.0; 4]);
        target.copy(&mut encoder);
        renderer.submit(&gpu.queue, encoder);
        let mut pixels = target.read(&gpu.device);
        straight_alpha(&mut pixels, srgb_blend);
        Ok(pixels)
    })
}

// Equivalente CPU del AlphaSurface privado de Rune. El target sRGB contiene
// color premultiplicado en lineal: dividir sus bytes sRGB produce halos.
fn straight_alpha(pixels: &mut [u8], srgb_blend: bool) {
    for pixel in pixels.as_chunks_mut::<4>().0 {
        let alpha = pixel[3] as f32 / 255.0;
        for channel in &mut pixel[..3] {
            let encoded = *channel as f32 / 255.0;
            let straight = if alpha == 0.0 {
                0.0
            } else if srgb_blend {
                encoded / alpha
            } else {
                encode((decode(encoded) / alpha).clamp(0.0, 1.0))
            };
            *channel = (straight.clamp(0.0, 1.0) * 255.0).round() as u8;
        }
    }
}
fn decode(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}
fn encode(v: f32) -> f32 {
    if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Cx, El, Env, el};
    fn view(_: &(), _: &mut Cx<()>) -> El {
        el().size(20.0, 10.0).key("same-widget")
    }

    #[test]
    fn rejects_invalid_or_unbounded_capture_before_any_painter() {
        for (logical, scale) in [
            ((0.0, 10.0), 1.0),
            ((1.0, 1.0), 0.0),
            ((f32::NAN, 10.0), 1.0),
            ((20.0, f32::INFINITY), 1.0),
            ((4096.0, 4097.0), 1.0),
            ((4096.0, 1.0), 1.25),
            ((0.1, 0.1), 0.1),
        ] {
            assert_eq!(Size::new(logical, scale), Err(Error::InvalidSize));
        }
        assert_eq!(Size::new((470.0, 277.0), 1.5).unwrap().pixels(), (705, 416));
    }
    #[test]
    fn fake_painter_sees_same_cpu_layout_at_each_scale_and_size_is_checked() {
        for scale in [1.0, 1.25, 1.5] {
            let mut rt = Runtime::new((), view, (1.0, 1.0), Env::new(true, scale));
            let size = Size::new((20.0, 10.0), scale).unwrap();
            let image = render_with::<_, Error>(&mut rt, size, |rt, size| {
                assert!(rt.transparent);
                assert_eq!(
                    rt.presented("same-widget").unwrap().0,
                    [0.0, 0.0, 20.0, 10.0]
                );
                Ok(vec![0; size.len()])
            })
            .unwrap();
            assert_eq!(image.pixels.len(), size.len());
            assert!(matches!(
                render_with::<_, Error>(&mut rt, size, |_, _| Ok(Vec::new())),
                Err(Error::InvalidPixels)
            ));
        }
    }
    #[test]
    fn transparent_edges_unpremultiply_in_compositing_space() {
        for srgb_blend in [false, true] {
            let mut pixels = vec![99, 99, 99, 0, 70, 130, 230, 255];
            straight_alpha(&mut pixels, srgb_blend);
            assert_eq!(pixels, [0, 0, 0, 0, 70, 130, 230, 255]);
            let alpha = 128.0 / 255.0;
            let input = if srgb_blend {
                0.5 * alpha
            } else {
                encode(decode(0.5) * alpha)
            };
            let byte = (input * 255.0).round() as u8;
            let mut pixels = [byte, byte, byte, 128];
            straight_alpha(&mut pixels, srgb_blend);
            assert!(pixels[0].abs_diff(128) <= 1);
            assert_eq!(pixels[3], 128);
        }
    }
}
