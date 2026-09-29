//! Modelo común, proyecciones y formateador. Puro: sin simuladores, GPUI ni I/O.
//!
//! Unidades SI en todo el modelo; el sufijo del campo la declara: `_s` segundos,
//! `_m` metros, `_mps` m/s, `_rad` radianes, `_rad_s` rad/s, `_k` kelvin,
//! `_pa` pascales. Sin sufijo, una
//! fracción 0–1. La conversión a km/h, mph o rpm ocurre solo en [`format`].

#![forbid(unsafe_code)]

mod adapter;
mod capability;
pub mod delta;
mod flag;
pub mod format;
mod model;
pub mod pedals;
mod quality;
pub mod radar;
pub mod standings;

pub use adapter::{Adapter, AdapterError, Observation};
pub use capability::{Capabilities, Capability};
pub use flag::{Flag, FlagKind, FlagScope};
pub use model::{
    Car, CarId, Class, ClassId, Damage, Driver, DriverId, Fuel, Gap, Origin, Player, Pose,
    SIMULATORS, Session, SessionId, SessionKind, SessionState, Snapshot, Source, SourceKind, State,
    Telemetry, UNKNOWN_SIMULATOR, Weather,
};
pub use quality::Quality;
