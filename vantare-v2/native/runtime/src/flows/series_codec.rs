//! Wire incremental v1; validar fuera de adquisición antes de analizar o guardar.

use std::io;

use serde_json::Value;
use vantare_domain::{CarId, Quality, SessionId};

use super::{LapBlock, LapSample, MAX_CHUNK_SAMPLES, SeriesChunk};

pub const MAX_CHUNK_BYTES: usize = 32 * 1024;

impl SeriesChunk {
    pub fn to_bytes(&self) -> io::Result<Vec<u8>> {
        self.validate()?;
        let bytes = serde_json::to_vec(&serde_json::json!([
            "vantare.series-chunk.v1",
            self.index,
            self.lost_before,
            self.offset,
            self.block.to_value()
        ]))?;
        if bytes.len() > MAX_CHUNK_BYTES {
            return Err(invalid());
        }
        Ok(bytes)
    }

    pub fn from_bytes(bytes: &[u8]) -> io::Result<Self> {
        if bytes.len() > MAX_CHUNK_BYTES {
            return Err(invalid());
        }
        let value: Value = serde_json::from_slice(bytes)?;
        let fields = array(&value, 5)?;
        if fields[0].as_str() != Some("vantare.series-chunk.v1") {
            return Err(invalid());
        }
        let header = array(&fields[4], 8)?;
        if header[0].as_str() != Some("vantare.player-lap.v1") {
            return Err(invalid());
        }
        let raw_samples = header[7].as_array().ok_or_else(invalid)?;
        if raw_samples.len() > MAX_CHUNK_SAMPLES {
            return Err(invalid());
        }
        let samples = raw_samples
            .iter()
            .map(|raw| {
                let fields = array(raw, 6)?;
                Ok(LapSample {
                    sequence: number(&fields[0])?,
                    distance_m: decode_signal(&fields[1])?,
                    elapsed_s: decode_signal(&fields[2])?,
                    speed_mps: decode_signal(&fields[3])?,
                    throttle: decode_signal(&fields[4])?,
                    brake: decode_signal(&fields[5])?,
                })
            })
            .collect::<io::Result<Vec<_>>>()?;
        let chunk = Self {
            index: number(&fields[1])?,
            lost_before: number(&fields[2])?,
            offset: usize::try_from(number(&fields[3])?).map_err(|_| invalid())?,
            block: LapBlock {
                epoch: number(&header[1])?,
                session: SessionId(number(&header[2])?),
                car: CarId(u32::try_from(number(&header[3])?).map_err(|_| invalid())?),
                lap: u32::try_from(number(&header[4])?).map_err(|_| invalid())?,
                sealed_at: if header[5].is_null() {
                    None
                } else {
                    Some(number(&header[5])?)
                },
                gap: header[6].as_bool().ok_or_else(invalid)?,
                samples,
            },
        };
        chunk.validate()?;
        Ok(chunk)
    }

    pub fn validate(&self) -> io::Result<()> {
        if self.index == 0
            || self.lost_before >= self.index
            || self.block.epoch == 0
            || self.block.samples.len() > MAX_CHUNK_SAMPLES
            || self.offset.checked_add(self.block.samples.len()).is_none()
            || self.block.sealed_at == Some(0)
        {
            return Err(invalid());
        }
        for sample in &self.block.samples {
            if sample.sequence == 0
                || self
                    .block
                    .sealed_at
                    .is_some_and(|seal| seal <= sample.sequence)
                || !valid_signal(sample.distance_m, f64::MAX)
                || !valid_signal(sample.elapsed_s, f64::MAX)
                || !valid_signal(sample.speed_mps, f64::MAX)
                || !valid_signal(sample.throttle, 1.0)
                || !valid_signal(sample.brake, 1.0)
            {
                return Err(invalid());
            }
        }
        for pair in self.block.samples.windows(2) {
            if pair[1].sequence <= pair[0].sequence
                || regressed(pair[0].elapsed_s, pair[1].elapsed_s)
                || regressed(pair[0].distance_m, pair[1].distance_m)
            {
                return Err(invalid());
            }
        }
        Ok(())
    }
}

pub(super) fn invalid() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "bloque de series inválido")
}

fn array(value: &Value, len: usize) -> io::Result<&[Value]> {
    value
        .as_array()
        .filter(|fields| fields.len() == len)
        .map(Vec::as_slice)
        .ok_or_else(invalid)
}

fn number(value: &Value) -> io::Result<u64> {
    value.as_u64().ok_or_else(invalid)
}

fn decode_signal(value: &Value) -> io::Result<Quality<f64>> {
    let fields = array(value, 2)?;
    if fields[0].as_u64() == Some(0) && fields[1].is_null() {
        return Ok(Quality::Unavailable);
    }
    let value = fields[1].as_f64().ok_or_else(invalid)?;
    match fields[0].as_u64() {
        Some(1) => Ok(Quality::Reliable(value)),
        Some(2) => Ok(Quality::Estimated(value)),
        Some(3) => Ok(Quality::Stale(value)),
        _ => Err(invalid()),
    }
}

fn valid_signal(value: Quality<f64>, max: f64) -> bool {
    match value {
        Quality::Unavailable => true,
        Quality::Reliable(value) | Quality::Estimated(value) | Quality::Stale(value) => {
            value.is_finite() && (0.0..=max).contains(&value)
        }
    }
}

pub(super) fn regressed(previous: Quality<f64>, next: Quality<f64>) -> bool {
    matches!((previous, next), (Quality::Reliable(a), Quality::Reliable(b)) if b < a)
}
