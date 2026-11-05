//! Contratos puros de series v1 y análisis compartido; sin adquisición ni I/O.
use vantare_domain::{CarId, Quality, SessionId};

mod analysis;
mod series_codec;

pub use analysis::{
    ANALYSIS_VERSION, LapId, LapSummary, MAX_ANALYZED_LAPS, SeriesAnalysis, SignalSummary,
};
pub use series_codec::MAX_CHUNK_BYTES;

pub const MAX_CHUNK_SAMPLES: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LapSample {
    pub sequence: u64,
    pub distance_m: Quality<f64>,
    pub elapsed_s: Quality<f64>,
    pub speed_mps: Quality<f64>,
    pub throttle: Quality<f64>,
    pub brake: Quality<f64>,
}

/// Solo las muestras observadas: nunca interpola ni promete una vuelta entera.
#[derive(Debug, PartialEq)]
pub struct LapBlock {
    pub epoch: u64,
    pub session: SessionId,
    pub car: CarId,
    /// Contador de vueltas completadas al abrir la vuelta, como `Car::laps`.
    pub lap: u32,
    pub sealed_at: Option<u64>,
    /// Hubo datos ausentes/obsoletos, retroceso o saturación durante el bloque.
    pub gap: bool,
    pub samples: Vec<LapSample>,
}

impl LapBlock {
    /// JSON compacto de esquema v1 (ver README), sin mapas ni reloj de pared.
    /// Serializar fuera de adquisición; no persiste ni toca el bloque original.
    pub fn to_bytes(&self) -> serde_json::Result<Vec<u8>> {
        serde_json::to_vec(&self.to_value())
    }

    pub(super) fn to_value(&self) -> serde_json::Value {
        let samples: Vec<_> = self
            .samples
            .iter()
            .map(|sample| {
                serde_json::json!([
                    sample.sequence,
                    signal(sample.distance_m),
                    signal(sample.elapsed_s),
                    signal(sample.speed_mps),
                    signal(sample.throttle),
                    signal(sample.brake)
                ])
            })
            .collect();
        serde_json::json!([
            "vantare.player-lap.v1",
            self.epoch,
            self.session.0,
            self.car.0,
            self.lap,
            self.sealed_at,
            self.gap,
            samples
        ])
    }
}

fn signal(value: Quality<f64>) -> serde_json::Value {
    match value {
        Quality::Unavailable => serde_json::json!([0, null]),
        Quality::Reliable(value) => serde_json::json!([1, value]),
        Quality::Estimated(value) => serde_json::json!([2, value]),
        Quality::Stale(value) => serde_json::json!([3, value]),
    }
}

/// El bloque v1 contiene solo esta porción de la vuelta, a partir de `offset`.
/// `index` identifica intentos, incluidos los perdidos; no es un ACK durable.
#[derive(Debug, PartialEq)]
pub struct SeriesChunk {
    pub index: u64,
    pub lost_before: u64,
    pub offset: usize,
    pub block: LapBlock,
}
