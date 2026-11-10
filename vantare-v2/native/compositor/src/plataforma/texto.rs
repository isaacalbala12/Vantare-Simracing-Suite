use super::{Error, Resultado, ventana::ancho};
use crate::escena::{
    Medidor,
    capas::{Alineacion, Fuente},
};
use std::path::Path;
use windows::{
    Win32::Graphics::DirectWrite::{
        DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_FEATURE, DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES,
        DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_WEIGHT,
        DWRITE_LINE_METRICS, DWRITE_LINE_SPACING_METHOD_UNIFORM, DWRITE_TEXT_ALIGNMENT_CENTER,
        DWRITE_TEXT_ALIGNMENT_LEADING, DWRITE_TEXT_ALIGNMENT_TRAILING, DWRITE_TEXT_METRICS,
        DWRITE_TEXT_RANGE, DWRITE_TRIMMING, DWRITE_TRIMMING_GRANULARITY_CHARACTER,
        DWRITE_WORD_WRAPPING_NO_WRAP, DWriteCreateFactory, IDWriteFactory3, IDWriteFactory5,
        IDWriteFontCollection1, IDWriteRenderingParams, IDWriteTextLayout1,
    },
    core::{Interface, PCWSTR, w},
};

/// Colección privada: las fuentes se leen del paquete, nunca del registro global.
pub struct Texto {
    factory: IDWriteFactory3,
    fuentes: IDWriteFontCollection1,
    pub(super) parametros: IDWriteRenderingParams,
}

impl Texto {
    pub fn nuevo(carpeta: &Path) -> Resultado<Self> {
        unsafe {
            let factory: IDWriteFactory5 = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)?;
            let builder = factory.CreateFontSetBuilder()?;
            let mut cantidad = 0;
            for entrada in std::fs::read_dir(carpeta)? {
                let ruta = entrada?.path();
                if ruta
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("ttf"))
                {
                    let ruta = ancho(ruta.as_os_str());
                    let archivo = factory.CreateFontFileReference(PCWSTR(ruta.as_ptr()), None)?;
                    builder.AddFontFile(&archivo)?;
                    cantidad += 1;
                }
            }
            if cantidad == 0 {
                return Err(Error::Entrada(
                    "No hay fuentes TTF en la carpeta configurada",
                ));
            }
            let fuentes = factory
                .cast::<IDWriteFactory3>()?
                .CreateFontCollectionFromFontSet(&builder.CreateFontSet()?)?;
            Ok(Self {
                factory: factory.cast()?,
                fuentes,
                parametros: factory.CreateRenderingParams()?,
            })
        }
    }

    pub(super) fn layout(
        &self,
        texto: &str,
        fuente: &Fuente,
        ancho_caja: f32,
        alto: f32,
        alineacion: Alineacion,
    ) -> Resultado<IDWriteTextLayout1> {
        unsafe {
            let (familia, peso) = familia_estatica(fuente);
            let familia: Vec<u16> = familia.encode_utf16().chain(Some(0)).collect();
            let mut indice = 0;
            let mut existe = windows::core::BOOL::default();
            self.fuentes.FindFamilyName(
                PCWSTR(familia.as_ptr()),
                &raw mut indice,
                &raw mut existe,
            )?;
            if !existe.as_bool() {
                return Err(Error::Entrada(
                    "La familia de fuente no está en la colección del paquete",
                ));
            }
            let formato = self.factory.CreateTextFormat(
                PCWSTR(familia.as_ptr()),
                &self.fuentes,
                DWRITE_FONT_WEIGHT(i32::from(peso)),
                DWRITE_FONT_STYLE_NORMAL,
                DWRITE_FONT_STRETCH_NORMAL,
                fuente.tamano,
                w!("es-ES"),
            )?;
            formato.SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP)?;
            formato.SetTextAlignment(match alineacion {
                Alineacion::Inicio => DWRITE_TEXT_ALIGNMENT_LEADING,
                Alineacion::Centro => DWRITE_TEXT_ALIGNMENT_CENTER,
                Alineacion::Fin => DWRITE_TEXT_ALIGNMENT_TRAILING,
            })?;
            // Centra el cuerpo natural de la fuente dentro de la interlínea, como CSS.
            let caracteres: Vec<u16> = if fuente.mayusculas {
                texto.to_uppercase().encode_utf16().collect()
            } else {
                texto.encode_utf16().collect()
            };
            let layout: IDWriteTextLayout1 = self
                .factory
                .CreateTextLayout(&caracteres, &formato, ancho_caja, alto)?
                .cast()?;
            let rango = DWRITE_TEXT_RANGE {
                startPosition: 0,
                length: u32::try_from(caracteres.len())
                    .map_err(|_| Error::Entrada("Texto demasiado largo"))?,
            };
            layout.SetCharacterSpacing(
                fuente.interletra / 2.0,
                fuente.interletra / 2.0,
                0.0,
                rango,
            )?;
            let mut linea = [DWRITE_LINE_METRICS::default()];
            let mut numero = 0;
            layout.GetLineMetrics(Some(&mut linea), &raw mut numero)?;
            let interlinea = if fuente.interlinea > 0.0 {
                fuente.interlinea
            } else {
                linea[0].height
            };
            layout.SetLineSpacing(
                DWRITE_LINE_SPACING_METHOD_UNIFORM,
                interlinea,
                linea[0].baseline + (interlinea - linea[0].height) / 2.0,
            )?;
            if fuente.tabulares {
                let tipografia = self.factory.CreateTypography()?;
                tipografia.AddFontFeature(DWRITE_FONT_FEATURE {
                    nameTag: DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES,
                    parameter: 1,
                })?;
                layout.SetTypography(&tipografia, rango)?;
            }
            let signo = self.factory.CreateEllipsisTrimmingSign(&formato)?;
            layout.SetTrimming(
                &DWRITE_TRIMMING {
                    granularity: DWRITE_TRIMMING_GRANULARITY_CHARACTER,
                    ..Default::default()
                },
                &signo,
            )?;
            Ok(layout)
        }
    }

    pub fn medir_resultado(&self, texto: &str, fuente: &Fuente) -> Resultado<(f32, f32)> {
        let layout = self.layout(texto, fuente, 1_000_000.0, 1_000_000.0, Alineacion::Inicio)?;
        let mut medidas = DWRITE_TEXT_METRICS::default();
        unsafe {
            layout.GetMetrics(&raw mut medidas)?;
        }
        Ok((medidas.widthIncludingTrailingWhitespace, medidas.height))
    }
}

impl Medidor for Texto {
    fn medir(&self, texto: &str, fuente: &Fuente) -> (f32, f32) {
        match self.medir_resultado(texto, fuente) {
            Ok(medidas) => medidas,
            Err(error) => {
                eprintln!("DirectWrite no pudo medir el texto: {error}");
                // El contrato no admite Result: un tamaño inválido impide fingir éxito.
                (f32::NAN, f32::NAN)
            }
        }
    }
}

// GPUI usa estas mismas familias estáticas con peso nativo Regular (400).
// El peso visual está en el TTF, no en una negrita sintetizada por DirectWrite.
fn familia_estatica(fuente: &Fuente) -> (String, u16) {
    if fuente.familia == "Inter" {
        let peso = [400_u16, 500, 600, 650, 700, 750, 800]
            .into_iter()
            .min_by_key(|peso| peso.abs_diff(fuente.peso))
            .unwrap_or(400);
        (format!("Inter W{peso}"), 400)
    } else if fuente.familia.starts_with("Inter W") {
        (fuente.familia.clone(), 400)
    } else {
        (fuente.familia.clone(), fuente.peso)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mide_inter_del_paquete_con_cifras_tabulares_y_sin_fallback_del_sistema() -> Resultado<()> {
        let texto = Texto::nuevo(Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../ui/assets/fonts"
        )))?;
        for peso in [400, 500, 650, 800, 900] {
            let fuente = Fuente {
                familia: "Inter".into(),
                peso,
                tamano: 16.0,
                interletra: 0.0,
                interlinea: 24.0,
                tabulares: true,
                mayusculas: false,
            };
            let (unos, alto) = texto.medir_resultado("1111", &fuente)?;
            let (ochos, _) = texto.medir_resultado("8888", &fuente)?;
            assert!(unos > 0.0 && alto > 0.0);
            assert!(
                (unos - ochos).abs() < 0.01,
                "peso {peso}: {unos} frente a {ochos}"
            );
        }
        Ok(())
    }
}
