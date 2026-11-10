//! Receta + sistema de diseño + modelo → operaciones sobre capas.
//! Implementación: ver `README.md` del crate («Escena»).

pub mod capas;

use capas::Fuente;

/// Mide una línea de texto con la fuente ya resuelta: (ancho, alto) en DIP.
/// La implementa DirectWrite en la plataforma; los tests usan un medidor fijo.
pub trait Medidor {
    fn medir(&self, texto: &str, fuente: &Fuente) -> (f32, f32);
}
