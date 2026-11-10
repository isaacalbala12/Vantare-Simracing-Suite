use super::{Error, Resultado, ventana::ancho};
use crate::escena::{
    Medidor,
    capas::{Alineacion, Fuente},
};
use std::path::Path;
use windows::{
    Win32::Graphics::DirectWrite::{
        DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_FEATURE, DWRITE_FONT_FEATURE_TAG_KERNING,
        DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES, DWRITE_FONT_SIMULATIONS_NONE,
        DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL, DWRITE_LINE_SPACING_METHOD_UNIFORM,
        DWRITE_TEXT_ALIGNMENT_CENTER, DWRITE_TEXT_ALIGNMENT_LEADING,
        DWRITE_TEXT_ALIGNMENT_TRAILING, DWRITE_TEXT_METRICS, DWRITE_TEXT_RANGE,
        DWRITE_WORD_WRAPPING_NO_WRAP, DWriteCreateFactory, IDWriteFactory3, IDWriteFactory5,
        IDWriteFontCollection1, IDWriteRenderingParams, IDWriteTextFormat, IDWriteTextLayout1,
    },
    core::{Interface, PCWSTR, w},
};

/// Colección privada de todos los TTF del paquete, sin sustitución por fuentes del sistema.
pub struct Texto {
    pub(super) factory: IDWriteFactory3,
    error_medicion: std::cell::RefCell<Option<Error>>,
    fuentes: IDWriteFontCollection1,
    pub(super) parametros: IDWriteRenderingParams,
}

fn fuente_ausente(fuente: &Fuente) -> Error {
    Error::FuenteNoDisponible {
        familia: fuente.familia.clone(),
        peso: fuente.peso,
    }
}

// Misma referencia Inter y redondeo que efficiency/text.rs. El desplazamiento
// Display (+1 DIP en Vantare) es estilo: el productor lo incorpora en caja.y.
fn linea_base(fuente: &Fuente) -> (f32, f32) {
    let ascenso = (fuente.tamano * 1984.0 / 2048.0).round();
    let descenso = (fuente.tamano * 494.0 / 2048.0).round();
    let altura = if fuente.interlinea > 0.0 {
        fuente.interlinea
    } else {
        ascenso + descenso
    };
    (
        altura,
        ascenso + ((altura - ascenso - descenso) / 2.0).floor(),
    )
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
                    .is_some_and(|e| e.eq_ignore_ascii_case("ttf"))
                {
                    let ruta = ancho(ruta.as_os_str());
                    builder.AddFontFile(
                        &factory.CreateFontFileReference(PCWSTR(ruta.as_ptr()), None)?,
                    )?;
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
                error_medicion: std::cell::RefCell::new(None),
                fuentes,
                parametros: factory.CreateRenderingParams()?,
            })
        }
    }

    pub fn tomar_error_medicion(&self) -> Option<Error> {
        self.error_medicion.borrow_mut().take()
    }
    fn formato(&self, fuente: &Fuente, alineacion: Alineacion) -> Resultado<IDWriteTextFormat> {
        if ![fuente.tamano, fuente.interletra, fuente.interlinea]
            .iter()
            .all(|v| v.is_finite())
            || fuente.tamano <= 0.0
            || fuente.interlinea < 0.0
        {
            return Err(Error::TextoInvalido);
        }
        let (nombre, peso) = if fuente.familia == "Inter" {
            (format!("Inter W{}", fuente.peso), 400)
        } else {
            (fuente.familia.clone(), fuente.peso)
        };
        let mut nombre: Vec<u16> = nombre.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let mut indice = 0;
            let mut existe = windows::core::BOOL::default();
            self.fuentes.FindFamilyName(
                PCWSTR(nombre.as_ptr()),
                &raw mut indice,
                &raw mut existe,
            )?;
            if !existe.as_bool() && fuente.familia == "Rajdhani" {
                nombre = "Rajdhani SemiBold".encode_utf16().chain(Some(0)).collect();
                self.fuentes.FindFamilyName(
                    PCWSTR(nombre.as_ptr()),
                    &raw mut indice,
                    &raw mut existe,
                )?;
            }
            if !existe.as_bool() {
                return Err(fuente_ausente(fuente));
            }
            let familia = self.fuentes.GetFontFamily(indice)?;
            // Enumerar caras reales: GetFirstMatchingFont puede devolver una cara
            // sintetizada cuyo GetWeight ya coincide con el peso inexistente.
            let mut elegida = None;
            for indice in 0..familia.GetFontCount() {
                let cara = familia.GetFont(indice)?;
                if (fuente.familia == "Inter" || cara.GetWeight().0 == i32::from(peso))
                    && cara.GetStyle() == DWRITE_FONT_STYLE_NORMAL
                    && cara.GetStretch() == DWRITE_FONT_STRETCH_NORMAL
                    && cara.GetSimulations() == DWRITE_FONT_SIMULATIONS_NONE
                {
                    elegida = Some(cara);
                    break;
                }
            }
            let cara = elegida.ok_or_else(|| fuente_ausente(fuente))?;
            let peso_real = cara.GetWeight();
            let formato = self.factory.CreateTextFormat(
                PCWSTR(nombre.as_ptr()),
                &self.fuentes,
                peso_real,
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
            let (altura, base) = linea_base(fuente);
            formato.SetLineSpacing(DWRITE_LINE_SPACING_METHOD_UNIFORM, altura, base)?;
            Ok(formato)
        }
    }

    fn crear_layout(
        &self,
        contenido: &str,
        fuente: &Fuente,
        formato: &IDWriteTextFormat,
        ancho: f32,
        alto: f32,
    ) -> Resultado<IDWriteTextLayout1> {
        let caracteres: Vec<u16> = contenido.encode_utf16().collect();
        unsafe {
            let layout: IDWriteTextLayout1 = self
                .factory
                .CreateTextLayout(&caracteres, formato, ancho, alto)?
                .cast()?;
            let rango = DWRITE_TEXT_RANGE {
                startPosition: 0,
                length: u32::try_from(caracteres.len())
                    .map_err(|_| Error::Entrada("Texto demasiado largo"))?,
            };
            // GPUI desplaza i*tracking y cuenta también el espacio tras el último carácter.
            layout.SetCharacterSpacing(0.0, fuente.interletra, 0.0, rango)?;
            let tipografia = self.factory.CreateTypography()?;
            tipografia.AddFontFeature(DWRITE_FONT_FEATURE {
                nameTag: DWRITE_FONT_FEATURE_TAG_KERNING,
                parameter: 1,
            })?;
            tipografia.AddFontFeature(DWRITE_FONT_FEATURE {
                nameTag: DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES,
                parameter: u32::from(fuente.tabulares),
            })?;
            layout.SetTypography(&tipografia, rango)?;
            Ok(layout)
        }
    }

    pub(super) fn layout(
        &self,
        contenido: &str,
        fuente: &Fuente,
        ancho: f32,
        alto: f32,
        alineacion: Alineacion,
    ) -> Resultado<IDWriteTextLayout1> {
        let contenido = if fuente.mayusculas {
            contenido.to_uppercase()
        } else {
            contenido.to_owned()
        };
        let caracteres: Vec<char> = contenido.chars().collect();
        if caracteres.len() > 256 {
            return Err(Error::Entrada("Texto de capa: máximo 256 caracteres"));
        }
        let formato = self.formato(fuente, alineacion)?;
        let layout = self.crear_layout(&contenido, fuente, &formato, ancho, alto)?;
        if medidas(&layout)?.widthIncludingTrailingWhitespace <= ancho + 0.01 {
            return Ok(layout);
        }
        // Mismo ajuste por caracteres y tolerancia que fit_measured de GPUI.
        for cuantos in (0..caracteres.len()).rev() {
            let candidato = caracteres[..cuantos].iter().collect::<String>() + "…";
            let layout = self.crear_layout(&candidato, fuente, &formato, ancho, alto)?;
            if medidas(&layout)?.widthIncludingTrailingWhitespace <= ancho + 0.01 {
                return Ok(layout);
            }
        }
        self.crear_layout("", fuente, &formato, ancho, alto)
    }

    pub fn medir_resultado(&self, contenido: &str, fuente: &Fuente) -> Resultado<(f32, f32)> {
        let layout = self.layout(
            contenido,
            fuente,
            1_000_000.0,
            1_000_000.0,
            Alineacion::Inicio,
        )?;
        let medidas = medidas(&layout)?;
        Ok((medidas.widthIncludingTrailingWhitespace, medidas.height))
    }
}
fn medidas(layout: &IDWriteTextLayout1) -> Resultado<DWRITE_TEXT_METRICS> {
    let mut medidas = DWRITE_TEXT_METRICS::default();
    unsafe {
        layout.GetMetrics(&raw mut medidas)?;
    }
    Ok(medidas)
}
impl Medidor for Texto {
    fn medir(&self, contenido: &str, fuente: &Fuente) -> (f32, f32) {
        match self.medir_resultado(contenido, fuente) {
            Ok(m) => m,
            Err(e) => {
                let mut error = self.error_medicion.borrow_mut();
                if error.is_none() {
                    *error = Some(e);
                }
                // No propaga NaN/infinito a la maquetación; aplicar devuelve el error tipado.
                (0.0, 0.0)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fuente(familia: &str, peso: u16) -> Fuente {
        Fuente {
            familia: familia.into(),
            peso,
            tamano: 16.0,
            interletra: 0.0,
            interlinea: 24.0,
            tabulares: true,
            mayusculas: false,
        }
    }
    #[test]
    fn mide_las_tres_familias_del_paquete_y_rechaza_pesos_inexistentes() -> Resultado<()> {
        let texto = Texto::nuevo(Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../ui/assets/fonts"
        )))?;
        for (familia, peso) in [
            ("Inter", 400),
            ("Inter", 500),
            ("Inter", 650),
            ("Inter", 800),
            ("Rajdhani", 600),
            ("Space Mono", 400),
        ] {
            let fuente = fuente(familia, peso);
            let formato = texto.formato(&fuente, Alineacion::Inicio)?;
            eprintln!("Fuente {familia} {peso}: peso nativo {}", unsafe {
                formato.GetFontWeight().0
            });
            let (unos, alto) = texto.medir_resultado("1111", &fuente)?;
            let (ochos, _) = texto.medir_resultado("8888", &fuente)?;
            assert!(unos > 0.0 && alto > 0.0);
            if familia == "Rajdhani" {
                // El TTF incluido no tiene tnum: GPUI y DirectWrite conservan
                // sus cifras proporcionales aunque se solicite esa característica.
                assert!((unos - ochos).abs() > 1.0);
            } else {
                assert!(
                    (unos - ochos).abs() < 0.01,
                    "familia {familia} peso {peso}: {unos} frente a {ochos}"
                );
            }
        }
        for (familia, peso) in [
            ("Inter", 900),
            ("Rajdhani", 400),
            ("Space Mono", 700),
            ("NoExiste", 400),
        ] {
            assert!(matches!(
                texto.medir_resultado("texto", &fuente(familia, peso)),
                Err(Error::FuenteNoDisponible { .. })
            ));
        }
        let normal = fuente("Inter", 400);
        let mut espaciada = normal.clone();
        espaciada.interletra = 1.0;
        let ancho = texto.medir_resultado("ABCD", &normal)?.0;
        let ancho_espaciado = texto.medir_resultado("ABCD", &espaciada)?.0;
        assert!((ancho_espaciado - ancho - 4.0).abs() < 0.01);
        Ok(())
    }
}
