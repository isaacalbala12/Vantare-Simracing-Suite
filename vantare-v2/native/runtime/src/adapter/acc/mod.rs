//! ACC: shared memory del jugador y broadcasting UDP v4 de la parrilla.
//! Solo salen adaptadores y `Observation` neutrales; el protocolo queda aquí.

mod bytes;
#[cfg(windows)]
mod live;
mod protocol;
mod replay;
#[cfg(windows)]
#[allow(unsafe_code)]
mod shm;
mod translate;
#[cfg(windows)]
mod udp;
mod velocity;

#[cfg(test)]
mod velocity_corpus_tests;

#[cfg(windows)]
pub use live::Acc;
pub use replay::{AccReplay, open_acc_replay};
