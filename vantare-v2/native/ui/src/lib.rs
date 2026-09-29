//! Biblioteca visual de Vantare (ADR 0099): overlays GPUI sobre el `ViewModel`
//! de `domain`.
//!
//! GPUI se usa directamente; este crate solo añade la integración con Windows
//! ([`overlay`]) y las primitivas visuales (texto Inter con `letter-spacing`,
//! pintado a bajo nivel) que GPUI no trae.
//!
//! El pintado es aritmética de píxeles con `f32`: los `as` entre enteros y
//! flotantes son deliberados y acotados por el tamaño de la ventana.
#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap,
    clippy::too_many_arguments,
    clippy::too_many_lines,
    clippy::many_single_char_names,
    clippy::similar_names,
    clippy::float_cmp,
    clippy::unreadable_literal // colores hex de CSS
)]

mod app;
#[cfg(feature = "parity-capture")]
pub mod capture;
pub mod efficiency;
mod overlay;
pub mod source;
#[cfg(feature = "paint-stats")]
mod stats;
pub mod workshop;

include!("registry.rs");

// Hub incrusta el mismo renderer productivo; no expone el despacho interno de widgets.
pub use app::{Overlay, layout_row, run, run_placed};
