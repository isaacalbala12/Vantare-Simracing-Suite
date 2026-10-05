//! Adaptadores de simulador, núcleo, flujos y ciclo de vida.

#![deny(unsafe_code)]

pub mod adapter;
pub mod core;
pub mod flows;
#[cfg(feature = "paint-stats")]
#[path = "../../profiling.rs"]
pub mod profiling;
#[cfg(windows)]
pub mod rights;
#[cfg(windows)]
pub mod service;
#[cfg(windows)]
pub mod services;
#[cfg(windows)]
pub mod shutdown;
