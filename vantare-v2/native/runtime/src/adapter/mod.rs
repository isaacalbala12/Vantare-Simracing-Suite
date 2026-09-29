//! Adaptadores de simulador. Cada uno traduce su fuente al modelo común de
//! `vantare-domain` y no deja escapar ningún tipo propio.

// El único `unsafe` (Win32 de LMU) vive en `lmu::shm`, que lo permite expresamente.
#![deny(unsafe_code)]

mod lmu;

#[cfg(windows)]
pub use lmu::Lmu;
pub use lmu::{Replay, ReplayEvent};
