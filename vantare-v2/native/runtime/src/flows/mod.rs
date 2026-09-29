//! Fronteras mínimas de eventos y series de la ADR 0099, sin tipos de simulador.

mod journal;
mod recording;

pub use journal::{Consumer, Cursor, Delivery, GapReason, Journal, PitEvent};

#[cfg(test)]
mod tests;
