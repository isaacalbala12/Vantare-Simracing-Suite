//! Bandera del país del piloto (#1612): franjas planas compartidas por los
//! widgets (fila propia) y el perfil del Hub. Sin recursos ni fuentes emoji:
//! Windows no pinta banderas emoji y el texto ISO ya lo pinta quien llama.
//!
//! ponytail: solo banderas de franjas iguales o proporcionales; escudos,
//! cruces y estrellas devuelven `None` y el llamador muestra el código ISO.
//! Añadir SVG por país cuando haga falta una bandera fuera de esta tabla.

use crate::efficiency::{col, paint_rect, preview::PaintWindow as Window};

/// Orientación de las franjas.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Bands {
    /// De arriba abajo.
    Horizontal,
    /// De izquierda a derecha.
    Vertical,
}

/// Bandera de franjas: color RGB y peso relativo de cada franja.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Flag {
    pub bands: Bands,
    pub stripes: &'static [(u32, u8)],
}

/// Proporción de la bandera pintada en widgets (ancho / alto).
pub const ASPECT: f32 = 1.5;

const fn h(stripes: &'static [(u32, u8)]) -> Flag {
    Flag {
        bands: Bands::Horizontal,
        stripes,
    }
}
const fn v(stripes: &'static [(u32, u8)]) -> Flag {
    Flag {
        bands: Bands::Vertical,
        stripes,
    }
}

/// Bandera de un código ISO 3166-1 alfa-2 (mayúsculas o minúsculas).
pub fn flag(country: &str) -> Option<Flag> {
    let code = country.trim().to_ascii_uppercase();
    Some(match code.as_str() {
        "ES" => h(&[(0xaa151b, 1), (0xf1bf00, 2), (0xaa151b, 1)]),
        "FR" => v(&[(0x002395, 1), (0xffffff, 1), (0xed2939, 1)]),
        "IT" => v(&[(0x009246, 1), (0xffffff, 1), (0xce2b37, 1)]),
        "DE" => h(&[(0x000000, 1), (0xdd0000, 1), (0xffce00, 1)]),
        "NL" => h(&[(0xae1c28, 1), (0xffffff, 1), (0x21468b, 1)]),
        "BE" => v(&[(0x000000, 1), (0xfdda24, 1), (0xef3340, 1)]),
        "IE" => v(&[(0x169b62, 1), (0xffffff, 1), (0xff883e, 1)]),
        "AT" => h(&[(0xc8102e, 1), (0xffffff, 1), (0xc8102e, 1)]),
        "PL" => h(&[(0xffffff, 1), (0xdc143c, 1)]),
        "HU" => h(&[(0xce2939, 1), (0xffffff, 1), (0x477050, 1)]),
        "RU" => h(&[(0xffffff, 1), (0x0039a6, 1), (0xd52b1e, 1)]),
        "UA" => h(&[(0x0057b7, 1), (0xffd700, 1)]),
        "LU" => h(&[(0xed2939, 1), (0xffffff, 1), (0x00a1de, 1)]),
        "LT" => h(&[(0xfdb913, 1), (0x006a44, 1), (0xc1272d, 1)]),
        "LV" => h(&[(0x9e3039, 2), (0xffffff, 1), (0x9e3039, 2)]),
        "EE" => h(&[(0x0072ce, 1), (0x000000, 1), (0xffffff, 1)]),
        "RO" => v(&[(0x002b7f, 1), (0xfcd116, 1), (0xce1126, 1)]),
        "BG" => h(&[(0xffffff, 1), (0x00966e, 1), (0xd62612, 1)]),
        "CO" => h(&[(0xfcd116, 2), (0x003893, 1), (0xce1126, 1)]),
        "PE" => v(&[(0xd91023, 1), (0xffffff, 1), (0xd91023, 1)]),
        "NG" => v(&[(0x008751, 1), (0xffffff, 1), (0x008751, 1)]),
        "ID" | "MC" => h(&[(0xce1126, 1), (0xffffff, 1)]),
        "TH" => h(&[
            (0xa51931, 1),
            (0xf4f5f8, 1),
            (0x2d2a4a, 2),
            (0xf4f5f8, 1),
            (0xa51931, 1),
        ]),
        "AR" => h(&[(0x74acdf, 1), (0xffffff, 1), (0x74acdf, 1)]),
        "MX" => v(&[(0x006847, 1), (0xffffff, 1), (0xce1126, 1)]),
        "CL" => h(&[(0xffffff, 1), (0xd52b1e, 1)]),
        "CA" => v(&[(0xd52b1e, 1), (0xffffff, 2), (0xd52b1e, 1)]),
        _ => return None,
    })
}

/// Pinta `flag` en coordenadas del widget con alto `height` y su [`ASPECT`].
/// Devuelve el ancho ocupado para que la fila desplace el nombre.
pub fn paint(window: &mut Window, flag: Flag, x: f32, y: f32, height: f32, opacity: f32) -> f32 {
    let width = (height * ASPECT).round();
    let total = flag
        .stripes
        .iter()
        .map(|(_, weight)| f32::from(*weight))
        .sum::<f32>();
    let mut offset = 0.0;
    for (color, weight) in flag.stripes {
        let share = f32::from(*weight) / total;
        let color = col(*color, opacity);
        match flag.bands {
            Bands::Horizontal => {
                paint_rect(window, x, y + offset * height, width, share * height, color);
            }
            Bands::Vertical => {
                paint_rect(window, x + offset * width, y, share * width, height, color);
            }
        }
        offset += share;
    }
    // Contorno al 18 %: las franjas blancas no se funden con el panel claro.
    let edge = col(0x000000, 0.18 * opacity);
    paint_rect(window, x, y, width, 1.0, edge);
    paint_rect(window, x, y + height - 1.0, width, 1.0, edge);
    paint_rect(window, x, y, 1.0, height, edge);
    paint_rect(window, x + width - 1.0, y, 1.0, height, edge);
    width
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_case_insensitive_and_unknown_is_none() {
        assert_eq!(flag("es"), flag(" ES "));
        assert!(flag("ES").is_some());
        assert_eq!(flag("GB"), None, "cruces: se muestra el código ISO");
        assert_eq!(flag(""), None);
        assert_eq!(flag("ESP"), None, "solo alfa-2");
    }

    #[test]
    fn spain_keeps_its_one_two_one_proportion() {
        let spain = flag("ES").unwrap();
        assert_eq!(spain.bands, Bands::Horizontal);
        let weights: Vec<u8> = spain.stripes.iter().map(|(_, w)| *w).collect();
        assert_eq!(weights, [1, 2, 1]);
    }
}
