//! Cálculos puros, idénticos para bloques live y replay. Sin DB ni simuladores.

use std::collections::VecDeque;
use std::io;

use vantare_domain::{CarId, Quality, SessionId};

use super::series_codec::{invalid, regressed};
use super::{LapBlock, LapSample, SeriesChunk};

pub const MAX_ANALYZED_LAPS: usize = 256;
pub const ANALYSIS_VERSION: &str = "series-summary.v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LapId {
    pub epoch: u64,
    pub session: SessionId,
    pub car: CarId,
    pub lap: u32,
}

impl From<&LapBlock> for LapId {
    fn from(block: &LapBlock) -> Self {
        Self {
            epoch: block.epoch,
            session: block.session,
            car: block.car,
            lap: block.lap,
        }
    }
}

/// Media aritmética de muestras Reliable; no es media ponderada por tiempo.
/// Estimados/obsoletos/ausentes se cuentan, sin convertirlos en observaciones.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SignalSummary {
    pub reliable: u32,
    pub estimated: u32,
    pub stale: u32,
    pub unavailable: u32,
    pub mean: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

impl SignalSummary {
    fn consume(&mut self, signal: Quality<f64>) {
        match signal {
            Quality::Reliable(value) => {
                self.reliable += 1;
                let mean = self.mean.get_or_insert(value);
                *mean += (value - *mean) / f64::from(self.reliable);
                self.min = Some(self.min.map_or(value, |min| min.min(value)));
                self.max = Some(self.max.map_or(value, |max| max.max(value)));
            }
            Quality::Estimated(_) => self.estimated += 1,
            Quality::Stale(_) => self.stale += 1,
            Quality::Unavailable => self.unavailable += 1,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct LapSummary {
    /// Estadísticas derivadas de las muestras, con algoritmo versionado.
    pub computation_version: &'static str,
    pub id: LapId,
    pub first_chunk: u64,
    pub sealed_at: Option<u64>,
    pub gap: bool,
    pub samples: u32,
    pub first_sequence: Option<u64>,
    pub last_sequence: Option<u64>,
    pub first_elapsed_s: Option<f64>,
    pub last_elapsed_s: Option<f64>,
    pub speed_mps: SignalSummary,
    pub throttle: SignalSummary,
    pub brake: SignalSummary,
}

impl LapSummary {
    /// Ventana observada continua, no duración de vuelta. No deriva a través
    /// de un hueco ni interpola el cruce de meta.
    pub fn continuous_span_s(&self) -> Option<f64> {
        if self.gap {
            return None;
        }
        Some(self.last_elapsed_s? - self.first_elapsed_s?)
    }

    fn new(chunk: &SeriesChunk, gap: bool) -> Self {
        Self {
            computation_version: ANALYSIS_VERSION,
            id: LapId::from(&chunk.block),
            first_chunk: chunk.index,
            sealed_at: None,
            gap,
            samples: 0,
            first_sequence: None,
            last_sequence: None,
            first_elapsed_s: None,
            last_elapsed_s: None,
            speed_mps: SignalSummary::default(),
            throttle: SignalSummary::default(),
            brake: SignalSummary::default(),
        }
    }
}

struct Active {
    summary: LapSummary,
    next_offset: usize,
    last: Option<LapSample>,
}

/// Una vuelta activa y como máximo `retention` resúmenes cerrados/incompletos.
/// No retiene muestras ni realiza escritura. Queries leen resúmenes inmutables.
pub struct SeriesAnalysis {
    retention: usize,
    last_index: u64,
    active: Option<Active>,
    recent: VecDeque<LapSummary>,
}

impl SeriesAnalysis {
    pub fn new(retention: usize) -> io::Result<Self> {
        if !(1..=MAX_ANALYZED_LAPS).contains(&retention) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "retención fuera de límites",
            ));
        }
        Ok(Self {
            retention,
            last_index: 0,
            active: None,
            recent: VecDeque::new(),
        })
    }

    pub fn active(&self) -> Option<&LapSummary> {
        self.active.as_ref().map(|active| &active.summary)
    }

    /// Orden de entrega, conserva también las vueltas abandonadas/incompletas.
    pub fn recent(&self) -> &VecDeque<LapSummary> {
        &self.recent
    }

    pub fn find_lap(&self, id: LapId) -> Option<&LapSummary> {
        self.active()
            .filter(|summary| summary.id == id)
            .or_else(|| self.recent.iter().rev().find(|summary| summary.id == id))
    }

    /// La entrada inválida o repetida falla sin cambiar el estado. Un hueco de
    /// índice/offset se conserva explícito; nunca se rellenan las muestras.
    pub fn consume(&mut self, chunk: &SeriesChunk) -> io::Result<()> {
        chunk.validate()?;
        let id = LapId::from(&chunk.block);
        if chunk.index <= self.last_index {
            return Err(invalid());
        }
        if let Some(active) = &self.active
            && active.summary.id == id
        {
            if chunk.offset < active.next_offset
                || chunk.block.sealed_at.is_some_and(|seal| {
                    active
                        .summary
                        .last_sequence
                        .is_some_and(|last| seal <= last)
                })
            {
                return Err(invalid());
            }
            if let (Some(previous), Some(next)) = (active.last, chunk.block.samples.first())
                && (next.sequence <= previous.sequence
                    || regressed(previous.elapsed_s, next.elapsed_s)
                    || regressed(previous.distance_m, next.distance_m))
            {
                return Err(invalid());
            }
        }
        let stream_gap =
            self.last_index.checked_add(1) != Some(chunk.index) || chunk.lost_before > 0;
        self.last_index = chunk.index;
        if self
            .active
            .as_ref()
            .is_some_and(|active| active.summary.id != id)
        {
            self.finish_active(true);
        }
        let active = self.active.get_or_insert_with(|| Active {
            summary: LapSummary::new(chunk, stream_gap || chunk.offset != 0),
            next_offset: 0,
            last: None,
        });
        active.summary.gap |= stream_gap || chunk.block.gap || chunk.offset != active.next_offset;
        active.next_offset = chunk.offset + chunk.block.samples.len();
        for sample in &chunk.block.samples {
            active.summary.samples += 1;
            active.summary.first_sequence.get_or_insert(sample.sequence);
            active.summary.last_sequence = Some(sample.sequence);
            if let Quality::Reliable(elapsed) = sample.elapsed_s {
                active.summary.first_elapsed_s.get_or_insert(elapsed);
                active.summary.last_elapsed_s = Some(elapsed);
            } else {
                active.summary.gap = true;
            }
            active.summary.speed_mps.consume(sample.speed_mps);
            active.summary.throttle.consume(sample.throttle);
            active.summary.brake.consume(sample.brake);
            active.last = Some(*sample);
        }
        active.summary.sealed_at = chunk.block.sealed_at;
        if chunk.block.sealed_at.is_some() {
            self.finish_active(false);
        }
        Ok(())
    }

    fn finish_active(&mut self, abandoned: bool) {
        if let Some(mut active) = self.active.take() {
            active.summary.gap |= abandoned;
            if self.recent.len() == self.retention {
                self.recent.pop_front();
            }
            self.recent.push_back(active.summary);
        }
    }
}
