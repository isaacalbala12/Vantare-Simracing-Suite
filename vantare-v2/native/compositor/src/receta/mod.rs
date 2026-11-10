//! Formato de receta y sistema de diseño. Especificación: `RECETA.md`.
mod tipos;
mod validacion;
pub use tipos::*;
pub use validacion::{Carga, Causa, Diagnostico, cargar};
