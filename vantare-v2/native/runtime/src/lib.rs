//! Adaptadores de simulador, núcleo, flujos y ciclo de vida.

#![deny(unsafe_code)]

pub mod adapter;
pub mod core;
pub mod flows;
#[cfg(feature = "paint-stats")]
pub use vantare_profiling as profiling;
#[cfg(windows)]
pub mod rights;
pub mod service;
#[cfg(windows)]
pub mod services;
#[cfg(windows)]
pub mod shutdown;
