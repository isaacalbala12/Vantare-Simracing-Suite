//! Cobertura y perfil gris de `gpui_windows/direct_write.rs` y shaders.hlsl.
use super::{Error, Resultado, texto::Texto};
use crate::escena::capas::{Alineacion, Color, Fuente, Rect};
use std::{cell::RefCell, ffi::c_void, mem::ManuallyDrop};
use windows::{
    Win32::{
        Foundation::{E_NOTIMPL, E_POINTER},
        Graphics::{
            Direct2D::{
                Common::{
                    D2D_RECT_F, D2D_SIZE_U, D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_PIXEL_FORMAT,
                },
                D2D1_BITMAP_OPTIONS_NONE, D2D1_BITMAP_PROPERTIES1,
                D2D1_INTERPOLATION_MODE_NEAREST_NEIGHBOR, ID2D1DeviceContext,
            },
            DirectWrite::{
                DWRITE_GLYPH_OFFSET, DWRITE_GLYPH_RUN, DWRITE_GLYPH_RUN_DESCRIPTION,
                DWRITE_GRID_FIT_MODE, DWRITE_MATRIX, DWRITE_MEASURING_MODE,
                DWRITE_MEASURING_MODE_NATURAL, DWRITE_OUTLINE_THRESHOLD_ANTIALIASED,
                DWRITE_RENDERING_MODE1, DWRITE_RENDERING_MODE1_NATURAL_SYMMETRIC,
                DWRITE_RENDERING_MODE1_OUTLINE, DWRITE_STRIKETHROUGH,
                DWRITE_TEXT_ANTIALIAS_MODE_CLEARTYPE, DWRITE_TEXTURE_CLEARTYPE_3x1,
                DWRITE_UNDERLINE, IDWriteFontFace, IDWriteFontFace3, IDWriteGlyphRunAnalysis,
                IDWriteInlineObject, IDWritePixelSnapping_Impl, IDWriteTextRenderer,
                IDWriteTextRenderer_Impl,
            },
            Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM,
        },
    },
    core::{BOOL, ComObject, IUnknown, Interface, Ref, implement},
};

struct Run {
    cara: IDWriteFontFace,
    tamano: f32,
    ids: Vec<u16>,
    avances: Vec<f32>,
    offsets: Vec<DWRITE_GLYPH_OFFSET>,
    base: (f32, f32),
    rtl: bool,
}
// Excepciones acotadas al ABI generado: la macro añade raw casts e inline(always).
#[expect(
    clippy::ref_as_ptr,
    clippy::inline_always,
    reason = "Código generado por windows-implement 0.60.2; sin desactivar lints del renderer"
)]
mod extraccion {
    use super::{IDWriteTextRenderer, RefCell, Run, implement};
    #[implement(IDWriteTextRenderer)]
    pub(super) struct Extractor {
        pub(super) runs: RefCell<Vec<Run>>,
    }
}
use extraccion::{Extractor, Extractor_Impl};
impl IDWritePixelSnapping_Impl for Extractor_Impl {
    fn IsPixelSnappingDisabled(&self, _ctx: *const c_void) -> windows::core::Result<BOOL> {
        Ok(BOOL(1))
    }
    fn GetCurrentTransform(
        &self,
        _ctx: *const c_void,
        m: *mut DWRITE_MATRIX,
    ) -> windows::core::Result<()> {
        if m.is_null() {
            return Err(E_POINTER.into());
        }
        // SAFETY: DirectWrite suministra un parámetro de salida válido durante Draw.
        unsafe {
            *m = DWRITE_MATRIX {
                m11: 1.0,
                m22: 1.0,
                ..Default::default()
            };
        }
        Ok(())
    }
    fn GetPixelsPerDip(&self, _ctx: *const c_void) -> windows::core::Result<f32> {
        Ok(1.0)
    }
}
impl IDWriteTextRenderer_Impl for Extractor_Impl {
    fn DrawGlyphRun(
        &self,
        _ctx: *const c_void,
        x: f32,
        y: f32,
        _modo: DWRITE_MEASURING_MODE,
        run: *const DWRITE_GLYPH_RUN,
        _desc: *const DWRITE_GLYPH_RUN_DESCRIPTION,
        _efecto: Ref<IUnknown>,
    ) -> windows::core::Result<()> {
        if run.is_null() {
            return Err(E_POINTER.into());
        }
        // SAFETY: DirectWrite mantiene el run y sus arrays durante esta llamada síncrona.
        let run = unsafe { &*run };
        let n =
            usize::try_from(run.glyphCount).map_err(|_| windows::core::Error::from(E_POINTER))?;
        if n == 0 {
            return Ok(());
        }
        if run.glyphIndices.is_null() || run.glyphAdvances.is_null() || run.glyphOffsets.is_null() {
            return Err(E_POINTER.into());
        }
        let cara = run
            .fontFace
            .as_ref()
            .ok_or_else(|| windows::core::Error::from(E_POINTER))?
            .clone();
        // SAFETY: arrays no nulos con glyphCount elementos garantizados por DirectWrite.
        let (ids, avances, offsets) = unsafe {
            (
                std::slice::from_raw_parts(run.glyphIndices, n).to_vec(),
                std::slice::from_raw_parts(run.glyphAdvances, n).to_vec(),
                std::slice::from_raw_parts(run.glyphOffsets, n).to_vec(),
            )
        };
        self.runs.borrow_mut().push(Run {
            cara,
            tamano: run.fontEmSize,
            ids,
            avances,
            offsets,
            base: (x, y),
            rtl: run.bidiLevel % 2 == 1,
        });
        Ok(())
    }
    fn DrawUnderline(
        &self,
        _c: *const c_void,
        _x: f32,
        _y: f32,
        _u: *const DWRITE_UNDERLINE,
        _e: Ref<IUnknown>,
    ) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
    fn DrawStrikethrough(
        &self,
        _c: *const c_void,
        _x: f32,
        _y: f32,
        _u: *const DWRITE_STRIKETHROUGH,
        _e: Ref<IUnknown>,
    ) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
    fn DrawInlineObject(
        &self,
        _c: *const c_void,
        _x: f32,
        _y: f32,
        _i: Ref<IDWriteInlineObject>,
        _s: BOOL,
        _r: BOOL,
        _e: Ref<IUnknown>,
    ) -> windows::core::Result<()> {
        Err(E_NOTIMPL.into())
    }
}

impl Texto {
    pub(super) fn dibujar(
        &self,
        ctx: &ID2D1DeviceContext,
        contenido: &str,
        fuente: &Fuente,
        caja: Rect,
        alineacion: Alineacion,
        color: Color,
    ) -> Resultado<()> {
        let layout = self.layout(contenido, fuente, caja.ancho, caja.alto, alineacion)?;
        let extractor = ComObject::new(Extractor {
            runs: RefCell::new(Vec::new()),
        });
        // SAFETY: extractor vivo durante el Draw síncrono; el layout no tiene objetos inline.
        unsafe {
            layout.Draw(
                None,
                &*extractor.as_interface::<IDWriteTextRenderer>(),
                caja.x,
                caja.y,
            )?;
        }
        for run in extractor.get().runs.borrow().iter() {
            let mut x = run.base.0;
            let direccion = if run.rtl { -1.0 } else { 1.0 };
            for (indice, id) in run.ids.iter().enumerate() {
                let offset = run.offsets[indice];
                self.dibujar_glifo(
                    ctx,
                    &run.cara,
                    run.tamano,
                    *id,
                    (
                        x + direccion * offset.advanceOffset,
                        run.base.1 - offset.ascenderOffset,
                    ),
                    color,
                )?;
                x += direccion * run.avances[indice];
            }
        }
        Ok(())
    }
    fn dibujar_glifo(
        &self,
        ctx: &ID2D1DeviceContext,
        cara: &IDWriteFontFace,
        tamano: f32,
        id: u16,
        origen: (f32, f32),
        color: Color,
    ) -> Resultado<()> {
        let mut dpi = 96.0;
        let mut dpi_y = 96.0;
        let mut matriz =
            windows::Win32::Graphics::Direct2D::D2D1_LAYER_PARAMETERS1::default().maskTransform;
        // SAFETY: contexto D2D vivo, parámetros de salida locales válidos.
        unsafe {
            ctx.GetDpi(&raw mut dpi, &raw mut dpi_y);
            ctx.GetTransform(&raw mut matriz);
        }
        let escala = dpi / 96.0;
        let x = redondear_medio_hacia_cero((origen.0 + matriz.M31) * escala * 4.0) / 4.0;
        let y = redondear_medio_hacia_cero((origen.1 + matriz.M32) * escala);
        let fase = x.fract().max(0.0);
        let analysis = self.analizar_glifo(cara, tamano, id, escala, fase)?;
        // SAFETY: análisis vivo, textura ClearType de 3 bytes por píxel.
        let limites = unsafe { analysis.GetAlphaTextureBounds(DWRITE_TEXTURE_CLEARTYPE_3x1)? };
        let ancho =
            u32::try_from(limites.right - limites.left).map_err(|_| Error::TextoInvalido)?;
        let alto = u32::try_from(limites.bottom - limites.top).map_err(|_| Error::TextoInvalido)?;
        if ancho == 0 || alto == 0 {
            return Ok(());
        }
        let cantidad = usize::try_from(u64::from(ancho) * u64::from(alto))
            .map_err(|_| Error::TextoInvalido)?;
        let mut cobertura = vec![0; cantidad * 3];
        // SAFETY: buffer dimensionado para los límites del análisis y sus tres canales.
        unsafe {
            analysis.CreateAlphaTexture(
                DWRITE_TEXTURE_CLEARTYPE_3x1,
                &raw const limites,
                &mut cobertura,
            )?;
        }
        let mut bytes = Vec::with_capacity(cantidad * 4);
        for rgb in cobertura.chunks_exact(3) {
            let gris = u16::from(rgb[0]) + u16::from(rgb[1]) + u16::from(rgb[2]);
            let a = corregir(f32::from(gris / 3) / 255.0, color) * color.a;
            bytes.extend([
                byte(color.b * a),
                byte(color.g * a),
                byte(color.r * a),
                byte(a),
            ]);
        }
        let rect = D2D_RECT_F {
            left: (x.trunc() + coord(limites.left)) / escala - matriz.M31,
            top: (y.trunc() + coord(limites.top)) / escala - matriz.M32,
            right: (x.trunc() + coord(limites.right)) / escala - matriz.M31,
            bottom: (y.trunc() + coord(limites.bottom)) / escala - matriz.M32,
        };
        let props = D2D1_BITMAP_PROPERTIES1 {
            pixelFormat: D2D1_PIXEL_FORMAT {
                format: DXGI_FORMAT_B8G8R8A8_UNORM,
                alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
            },
            dpiX: dpi,
            dpiY: dpi_y,
            bitmapOptions: D2D1_BITMAP_OPTIONS_NONE,
            ..Default::default()
        };
        // SAFETY: bytes BGRA premultiplicados válidos hasta terminar CreateBitmap; bitmap vivo durante DrawBitmap.
        unsafe {
            let bitmap = ctx.CreateBitmap(
                D2D_SIZE_U {
                    width: ancho,
                    height: alto,
                },
                Some(bytes.as_ptr().cast()),
                ancho * 4,
                &raw const props,
            )?;
            ctx.DrawBitmap(
                &bitmap,
                Some(&raw const rect),
                1.0,
                D2D1_INTERPOLATION_MODE_NEAREST_NEIGHBOR,
                None,
                None,
            );
        }
        Ok(())
    }
    fn analizar_glifo(
        &self,
        cara: &IDWriteFontFace,
        tamano: f32,
        id: u16,
        escala: f32,
        fase: f32,
    ) -> Resultado<IDWriteGlyphRunAnalysis> {
        let transform = DWRITE_MATRIX {
            m11: escala,
            m22: escala,
            ..Default::default()
        };
        let advance = [0.0];
        let offsets = [DWRITE_GLYPH_OFFSET::default()];
        let ids = [id];
        let mut run = DWRITE_GLYPH_RUN {
            fontFace: ManuallyDrop::new(Some(cara.clone())),
            fontEmSize: tamano,
            glyphCount: 1,
            glyphIndices: ids.as_ptr(),
            glyphAdvances: advance.as_ptr(),
            glyphOffsets: offsets.as_ptr(),
            ..Default::default()
        };
        let analysis = (|| {
            let cara: IDWriteFontFace3 = cara.cast()?;
            let mut modo = DWRITE_RENDERING_MODE1::default();
            let mut ajuste = DWRITE_GRID_FIT_MODE::default();
            // SAFETY: run, arrays y matriz viven durante ambas llamadas de DirectWrite.
            unsafe {
                cara.GetRecommendedRenderingMode(
                    tamano,
                    96.0,
                    96.0,
                    Some(&raw const transform),
                    false,
                    DWRITE_OUTLINE_THRESHOLD_ANTIALIASED,
                    DWRITE_MEASURING_MODE_NATURAL,
                    None,
                    &raw mut modo,
                    &raw mut ajuste,
                )?;
                if modo == DWRITE_RENDERING_MODE1_OUTLINE {
                    modo = DWRITE_RENDERING_MODE1_NATURAL_SYMMETRIC;
                }
                self.factory.CreateGlyphRunAnalysis(
                    &raw const run,
                    Some(&raw const transform),
                    modo,
                    DWRITE_MEASURING_MODE_NATURAL,
                    ajuste,
                    DWRITE_TEXT_ANTIALIAS_MODE_CLEARTYPE,
                    fase / escala,
                    0.0,
                )
            }
        })();
        // SAFETY: liberamos exactamente la referencia clonada para el parámetro COM.
        unsafe {
            ManuallyDrop::drop(&mut run.fontFace);
        }
        Ok(analysis?)
    }
}
fn coord(v: i32) -> f32 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "Límites de un glifo DirectWrite, pequeños y exactamente representables"
    )]
    {
        v as f32
    }
}
fn byte(v: f32) -> u8 {
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "Alfa/color normalizados, saturados y redondeados al canal UNORM8"
    )]
    {
        (v.clamp(0.0, 1.0) * 255.0).round() as u8
    }
}
fn corregir(cobertura: f32, color: Color) -> f32 {
    let brillo = 0.30 * color.r + 0.59 * color.g + 0.11 * color.b;
    let contraste = 1.5 * (4.0 * (0.75 - brillo)).clamp(0.0, 1.0);
    let alfa = cobertura * (contraste + 1.0) / (cobertura * contraste + 1.0);
    let gamma = [0.204_696_06, -1.391_836_9, 2.000_7, -0.351_472_97];
    (alfa
        + alfa
            * (1.0 - alfa)
            * ((gamma[0] * brillo + gamma[1]) * alfa + (gamma[2] * brillo + gamma[3])))
        .clamp(0.0, 1.0)
}

// Misma regla que gpui 72d28c3/util.rs para los empates de subpíxel.
fn redondear_medio_hacia_cero(valor: f32) -> f32 {
    (valor.abs() - 0.5).ceil().copysign(valor)
}

#[cfg(test)]
mod tests {
    use super::redondear_medio_hacia_cero;
    #[test]
    fn los_empates_de_cuarto_de_pixel_se_redondean_hacia_cero_como_gpui() {
        for (entrada, salida) in [
            (61.125, 61.0),
            (61.126, 61.25),
            (-61.125, -61.0),
            (-61.126, -61.25),
        ] {
            let valor = redondear_medio_hacia_cero(entrada * 4.0) / 4.0;
            assert!((valor - salida).abs() < f32::EPSILON);
        }
    }
}
