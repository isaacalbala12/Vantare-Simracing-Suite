use serde::Deserialize;

const LAP_START_MAX_ELAPSED_S: f64 = 0.25;

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
    #[serde(default)]
    pub first_elapsed_s: Option<f64>,
    #[serde(default)]
    pub last_elapsed_s: Option<f64>,
    pub speed: Signal,
    pub throttle: Signal,
    pub brake: Signal,
}

impl Lap {
    /// Tiempo aproximado de la última foto antes de meta, no el oficial del simulador.
    /// Error <= una foto (aprox. 17 ms a 60 Hz por defecto).
    pub fn lap_time_approx_s(&self) -> Option<f64> {
        if self.sealed && !self.gap && self.first_elapsed_s? <= LAP_START_MAX_ELAPSED_S {
            self.last_elapsed_s
        } else {
            None
        }
    }
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

/// Metadatos internos del helper; no forman parte del contrato del puente.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionKind {
    Practice,
    Qualifying,
    Race,
    Other,
    Unknown,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionEndReason {
    SessionChanged,
    CoreStopped,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionSummary {
    pub epoch: u64,
    pub session: u64,
    pub kind: SessionKind,
    #[serde(deserialize_with = "bounded_text")]
    pub kind_text: String,
    #[serde(deserialize_with = "bounded_text")]
    pub track_name: String,
    #[serde(deserialize_with = "bounded_text")]
    pub vehicle: String,
    #[serde(deserialize_with = "bounded_text")]
    pub class_name: String,
    pub started_at_ms: u64,
    #[serde(deserialize_with = "nullable")]
    pub ended_at_ms: Option<u64>,
    #[serde(deserialize_with = "elapsed")]
    pub sim_elapsed_s: Option<f64>,
    #[serde(deserialize_with = "nullable")]
    pub final_position: Option<u32>,
    #[serde(deserialize_with = "nullable")]
    pub final_class_position: Option<u32>,
    #[serde(deserialize_with = "nullable")]
    pub laps_completed: Option<u32>,
    #[serde(deserialize_with = "nullable")]
    pub best_lap_ms: Option<u32>,
    #[serde(deserialize_with = "nullable")]
    pub end_reason: Option<SessionEndReason>,
    pub sealed: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LapTime {
    pub epoch: u64,
    pub session: u64,
    pub car: u32,
    pub lap: u32,
    #[serde(deserialize_with = "nullable")]
    pub official_ms: Option<u32>,
    #[serde(deserialize_with = "sectors")]
    pub sector_ms: Option<Vec<u32>>,
}

// deserialize_with exige presencia del campo: null es distinto de omitirlo.
fn nullable<'de, D, T>(deserializer: D) -> std::result::Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer)
}
fn bounded_text<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<String, D::Error> {
    let text = String::deserialize(deserializer)?;
    if text.len() > 256 {
        return Err(serde::de::Error::custom("Texto de sesión fuera de límites"));
    }
    Ok(text)
}
fn elapsed<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<f64>, D::Error> {
    let value: Option<f64> = nullable(deserializer)?;
    if value.is_some_and(|value| !value.is_finite() || value < 0.0) {
        return Err(serde::de::Error::custom("Tiempo de sesión inválido"));
    }
    Ok(value)
}
fn sectors<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<Option<Vec<u32>>, D::Error> {
    let value: Option<Vec<u32>> = nullable(deserializer)?;
    if value.as_ref().is_some_and(|value| value.len() > 16) {
        return Err(serde::de::Error::custom("Sectores fuera de límites"));
    }
    Ok(value)
}
