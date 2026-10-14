//! Adaptadores de simulador. Cada uno traduce su fuente al modelo común de
//! `vantare-domain` y no deja escapar ningún tipo propio.

// El unsafe Win32 queda confinado a los módulos `shm` de cada adaptador.
#![deny(unsafe_code)]

mod acc;
mod lmu;

#[cfg(windows)]
pub use acc::Acc;
pub use acc::{AccReplay, open_acc_replay};

#[cfg(windows)]
pub use lmu::Lmu;
pub use lmu::{Replay, ReplayEvent, open_replay};
