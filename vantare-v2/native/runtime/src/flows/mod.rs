//! Fronteras mínimas de eventos y series de la ADR 0099, sin tipos de simulador.

mod journal;
mod recording;
mod series;

pub use journal::{Consumer, Cursor, Delivery, GapReason, Journal, PitEvent, RecordingStatus};
pub use series::{LapBlock, LapSample, MAX_LAP_SAMPLES, Series};

#[cfg(test)]
mod tests;

#[cfg(test)]
mod series_tests;
