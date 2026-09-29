//! Adaptadores de simulador, núcleo, flujos y ciclo de vida.

#![deny(unsafe_code)]

pub mod adapter;
pub mod core;
pub mod flows;
#[cfg(windows)]
pub mod service;
#[cfg(windows)]
pub mod shutdown;
