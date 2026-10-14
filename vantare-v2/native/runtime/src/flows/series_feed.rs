//! Entrega volátil a un propietario: cola acotada, sin I/O ni espera al receptor.

use std::io;
use std::sync::mpsc::{Receiver, SyncSender, TrySendError, sync_channel};

use super::{LapBlock, Series};

pub const MAX_CHUNK_SAMPLES: usize = 64;
pub const MAX_QUEUED_CHUNKS: usize = 256;

/// El bloque v1 contiene solo esta porción de la vuelta, a partir de `offset`.
/// `index` identifica intentos, incluidos los perdidos; no es un ACK durable.
#[derive(Debug, PartialEq)]
pub struct SeriesChunk {
    pub index: u64,
    pub lost_before: u64,
    pub offset: usize,
    pub block: LapBlock,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PublicationStatus {
    pub attempted: u64,
    pub delivered: u64,
    pub dropped: u64,
    pub disconnected: bool,
    pub exhausted: bool,
}

pub(super) struct Publisher {
    sender: SyncSender<SeriesChunk>,
    next_sample: usize,
    last_gap: bool,
    lost_before: u64,
    status: PublicationStatus,
}

impl Series {
    /// Configurar una sola vez, antes de adquirir. Suscribir no activa recording.
    /// El receptor pertenece al worker; no clonarlo ni drenar en adquisición.
    pub fn subscribe(&mut self, capacity: usize) -> io::Result<Receiver<SeriesChunk>> {
        if !(1..=MAX_QUEUED_CHUNKS).contains(&capacity) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "cola fuera de límites",
            ));
        }
        if self.publication.is_some() || self.active.is_some() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "configurar series antes de adquirir, con un único receptor",
            ));
        }
        let (sender, receiver) = sync_channel(capacity);
        self.publication = Some(Publisher {
            sender,
            next_sample: 0,
            last_gap: false,
            lost_before: 0,
            status: PublicationStatus::default(),
        });
        Ok(receiver)
    }

    pub fn publication_status(&self) -> Option<PublicationStatus> {
        self.publication.as_ref().map(|publisher| publisher.status)
    }

    /// Publica la porción parcial y/o un hueco nuevo, para una cadencia menor
    /// que 64 muestras o antes de parar. Un flush vacío no duplica entregas.
    pub fn flush(&mut self) {
        let offset = self.active_offset();
        if let (Some(publisher), Some(block)) = (&mut self.publication, &self.active) {
            publisher.publish(block, offset);
        }
    }
}

impl Publisher {
    pub(super) fn rebase(&mut self) {
        self.next_sample = 0;
    }

    pub(super) fn reset_lap(&mut self) {
        self.next_sample = 0;
        self.last_gap = false;
    }

    pub(super) fn ready(&self, block: &LapBlock) -> bool {
        block.samples.len() - self.next_sample >= MAX_CHUNK_SAMPLES
    }

    pub(super) fn publish(&mut self, block: &LapBlock, base_offset: usize) {
        let samples = &block.samples[self.next_sample..];
        if samples.is_empty() && block.sealed_at.is_none() && block.gap == self.last_gap {
            return;
        }
        let Some(index) = self.status.attempted.checked_add(1) else {
            self.status.exhausted = true;
            self.next_sample = block.samples.len();
            return;
        };
        self.status.attempted = index;
        let offset = base_offset + self.next_sample;
        self.next_sample = block.samples.len();
        self.last_gap = block.gap;
        if self.status.disconnected {
            self.status.dropped += 1;
            self.lost_before += 1;
            return;
        }
        let chunk = SeriesChunk {
            index,
            lost_before: self.lost_before,
            offset,
            block: LapBlock {
                epoch: block.epoch,
                session: block.session,
                car: block.car,
                lap: block.lap,
                sealed_at: block.sealed_at,
                gap: block.gap,
                samples: samples.to_vec(),
            },
        };
        match self.sender.try_send(chunk) {
            Ok(()) => {
                self.status.delivered += 1;
                self.lost_before = 0;
            }
            Err(error) => {
                self.status.disconnected = matches!(error, TrySendError::Disconnected(_));
                self.status.dropped += 1;
                self.lost_before += 1;
            }
        }
    }
}
