use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Signal {
    pub reliable: u32,
    pub estimated: u32,
    pub stale: u32,
    pub unavailable: u32,
    pub mean: Option<f64>,
    pub min: Option<f64>,
    pub max: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Lap {
    pub epoch: u64,
    pub session: u64,
    pub car: u32,
    pub lap: u32,
    pub first_chunk: u64,
    pub next_chunk: Option<u64>,
    pub sealed: bool,
    pub gap: bool,
    pub samples: u32,
    pub observed_span_s: Option<f64>,
    pub speed: Signal,
    pub throttle: Signal,
    pub brake: Signal,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq)]
pub struct Sample {
    pub distance: Option<f64>,
    pub elapsed: Option<f64>,
    pub speed: Option<f64>,
    pub throttle: Option<f64>,
    pub brake: Option<f64>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub struct Chunk {
    pub index: u64,
    pub epoch: u64,
    pub session: u64,
    pub car: u32,
    pub lap: u32,
    pub offset: usize,
    pub gap: bool,
    pub samples: Vec<Sample>,
}
