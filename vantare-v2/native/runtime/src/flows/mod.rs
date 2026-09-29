//! Fronteras mínimas de eventos y series de la ADR 0099, sin tipos de simulador.

mod journal;
mod recording;
mod series;
mod series_feed;

pub use journal::{Consumer, Cursor, Delivery, GapReason, Journal, PitEvent};
pub use series::{LapBlock, LapSample, MAX_LAP_SAMPLES, Series};
pub use series_feed::{MAX_CHUNK_SAMPLES, MAX_QUEUED_CHUNKS, PublicationStatus, SeriesChunk};

#[cfg(test)]
mod tests;

#[cfg(test)]
mod series_tests;

#[cfg(test)]
mod series_feed_tests;
