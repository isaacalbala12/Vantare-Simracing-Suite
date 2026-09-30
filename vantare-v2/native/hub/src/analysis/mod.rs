//! Análisis histórico del Hub: solo proceso SQL read-only, fuera de carrera.
pub mod model;
mod reader;
mod view;
pub use view::Analysis;

#[cfg(test)]
mod tests;
