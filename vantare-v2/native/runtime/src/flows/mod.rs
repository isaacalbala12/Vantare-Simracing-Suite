//! Fronteras mínimas de eventos y series de la ADR 0099, sin tipos de simulador.

#[cfg(any(windows, unix))]
pub mod client;
mod event;
#[cfg(test)]
mod facts_tests;
#[cfg(any(windows, unix))]
pub mod host;
mod journal;
mod recording;
mod series;
mod series_feed;
mod series_worker;
#[cfg(all(test, any(windows, unix)))]
mod transport_tests;
pub mod wire;

pub use event::{Event, Fact, FactKind, FlagSignal};
pub use journal::{Consumer, Cursor, Delivery, GapReason, Journal, PitEvent, RecordingStatus};
pub use series::{MAX_LAP_SAMPLES, Series};
pub use series_feed::{MAX_QUEUED_CHUNKS, PublicationStatus};
pub use series_worker::{
    MAX_STORAGE_PAGE_CHUNKS, RecordedSeriesSummary, SeriesReader, SeriesStorageState, SeriesWorker,
};
pub use vantare_ipc::series::{
    ANALYSIS_VERSION, LapBlock, LapId, LapSample, LapSummary, MAX_ANALYZED_LAPS, MAX_CHUNK_BYTES,
    MAX_CHUNK_SAMPLES, SeriesAnalysis, SeriesChunk, SignalSummary,
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
