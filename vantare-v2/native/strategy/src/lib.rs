//! Pure Strategy document and deterministic planning. No runtime or GPUI.
// Medicion temporal #1993: cambio inerte para medir sccache en un PR de un crate.
#![forbid(unsafe_code)]
pub mod application;
pub mod document;
mod projection;
pub mod solver;
