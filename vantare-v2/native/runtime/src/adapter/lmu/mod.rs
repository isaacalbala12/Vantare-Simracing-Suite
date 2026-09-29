//! Adaptador de Le Mans Ultimate: memoria compartida `LMU_Data` (rF2
//! `InternalsPlugin`) más REST local. Todo tipo de LMU es privado de este módulo;
//! hacia fuera solo salen `Observation` del dominio. Ver `REVIEW.md`.

mod frame;
mod gate;
#[cfg(windows)]
mod live;
mod replay;
mod rest;
#[cfg(windows)]
#[allow(unsafe_code)]
mod shm;
mod translate;

#[cfg(windows)]
pub use live::Lmu;
pub use replay::{Replay, ReplayEvent};
