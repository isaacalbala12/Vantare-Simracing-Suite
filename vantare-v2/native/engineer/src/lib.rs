//! Consumidor neutral de Engineer. Ninguna lectura de simulador ni UI.
#![deny(unsafe_code)]

mod checkpoint;
pub mod control;
pub mod local;
pub mod radio;
pub mod spotter;
pub mod voice;
pub mod worker;
pub use checkpoint::load_cursor;

use std::io;
use std::path::Path;

use vantare_domain::Snapshot;
use vantare_runtime::flows::wire::Frame;
use vantare_runtime::flows::{Cursor, Delivery, Fact, GapReason, PitEvent};

#[derive(Debug, Default)]
pub struct Applied {
    pub event: Option<PitEvent>,
    pub fact: Option<Fact>,
    pub gap: Option<GapReason>,
    pub baseline: bool,
}

#[derive(Default)]
pub struct Engineer {
    cursor: Option<Cursor>,
    snapshot: Option<Snapshot>,
}

impl Engineer {
    pub fn resume(path: &Path) -> io::Result<Self> {
        Ok(Self {
            cursor: load_cursor(path)?,
            snapshot: None,
        })
    }

    pub fn cursor(&self) -> Option<Cursor> {
        self.cursor
    }

    pub fn snapshot(&self) -> Option<&Snapshot> {
        self.snapshot.as_ref()
    }

    /// Checkpoint antes de ACK. Un fallo no adelanta memoria ni cursor.
    /// El cursor garantiza deduplicación del hecho; no exactamente una vez
    /// para audio externo ante muerte entre checkpoint y reproducción.
    pub fn apply(&mut self, frame: &Frame, checkpoint: &Path) -> io::Result<Applied> {
        frame.validate()?;
        if self.snapshot.as_ref().is_some_and(|previous| {
            previous.epoch > frame.snapshot.epoch
                || (previous.epoch == frame.snapshot.epoch
                    && previous.sequence > frame.snapshot.sequence)
        }) {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "foto retrocede"));
        }
        let mut result = Applied::default();
        let next = match frame.delivery {
            Some(Delivery::Event(_) | Delivery::Fact(_)) => {
                let (event_cursor, pit, fact) = match frame.delivery {
                    Some(Delivery::Event(event)) => (event.cursor, Some(event), None),
                    Some(Delivery::Fact(event)) => (event.cursor, None, Some(event)),
                    _ => return Err(io::Error::other("entrega incoherente")),
                };
                let Some(cursor) = self.cursor else {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "falta base inicial",
                    ));
                };
                if cursor.epoch == event_cursor.epoch && event_cursor.index <= cursor.index {
                    cursor // Reentrega atrasada: ACK actual, nunca retroceder.
                } else {
                    if cursor.epoch != event_cursor.epoch
                        || cursor.index.checked_add(1) != Some(event_cursor.index)
                    {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            "evento sin continuidad",
                        ));
                    }
                    result.event = pit;
                    result.fact = fact;
                    event_cursor
                }
            }
            Some(Delivery::Gap { reason, resume_at }) => {
                result.gap = Some(reason);
                result.baseline = true;
                resume_at
            }
            None => {
                if self.cursor.is_some_and(|cursor| cursor != frame.tail) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "faltan eventos o hueco",
                    ));
                }
                result.baseline = self.snapshot.is_none();
                frame.tail
            }
        };
        if self.cursor != Some(next) {
            checkpoint::save_cursor(checkpoint, next)?;
        }
        self.cursor = Some(next);
        self.snapshot = Some(frame.snapshot.clone());
        Ok(result)
    }
}
