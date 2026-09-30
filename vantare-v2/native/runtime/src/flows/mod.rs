//! Fronteras mínimas de eventos y series de la ADR 0099, sin tipos de simulador.

#[cfg(windows)]
pub mod client;
mod event;
#[cfg(test)]
mod facts_tests;
#[cfg(windows)]
pub mod host;
mod journal;
mod recording;
mod series;
#[cfg(all(test, windows))]
mod transport_tests;
pub mod wire;

pub use event::{Event, Fact, FactKind, FlagSignal};
pub use journal::{Consumer, Cursor, Delivery, GapReason, Journal, PitEvent, RecordingStatus};
pub use series::{LapBlock, LapSample, MAX_LAP_SAMPLES, Series};

#[cfg(test)]
mod tests;

#[cfg(test)]
mod series_tests;
