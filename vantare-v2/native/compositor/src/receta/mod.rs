//! Formato de receta y sistema de diseño. Especificación: `RECETA.md`.
mod tipos;
mod validacion;
pub use tipos::*;
pub use validacion::{Carga, Causa, Diagnostico, cargar, cargar_con_fuentes};

mod compilar;
mod lectura;
pub(crate) mod programa;
pub use compilar::leer_transicion;
pub use programa::{Programa, Transicion};
