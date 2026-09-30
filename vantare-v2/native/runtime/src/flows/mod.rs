//! Fronteras mínimas de eventos y series de la ADR 0099, sin tipos de simulador.

mod analysis;
mod journal;
mod recording;
mod series;
mod series_codec;
mod series_feed;
mod series_worker;

pub use analysis::{
    ANALYSIS_VERSION, LapId, LapSummary, MAX_ANALYZED_LAPS, SeriesAnalysis, SignalSummary,
};
pub use journal::{Consumer, Cursor, Delivery, GapReason, Journal, PitEvent};
pub use series::{LapBlock, LapSample, MAX_LAP_SAMPLES, Series};
pub use series_codec::MAX_CHUNK_BYTES;
pub use series_feed::{MAX_CHUNK_SAMPLES, MAX_QUEUED_CHUNKS, PublicationStatus, SeriesChunk};
pub use series_worker::{
    MAX_STORAGE_PAGE_CHUNKS, RecordedSeriesSummary, SeriesReader, SeriesStorageState, SeriesWorker,
};

#[cfg(test)]
mod tests;

#[cfg(test)]
mod series_tests;

#[cfg(test)]
mod series_feed_tests;

#[cfg(test)]
mod analysis_tests;

#[cfg(test)]
mod series_load_tests;
