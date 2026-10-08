//! Modelo común, proyecciones y formateador. Puro: sin simuladores, GPUI ni I/O.
//!
//! Unidades SI en todo el modelo; el sufijo del campo la declara: `_s` segundos,
//! `_m` metros, `_mps` m/s, `_rad` radianes, `_rad_s` rad/s, `_k` kelvin,
//! `_pa` pascales. Sin sufijo, una
//! fracción 0–1. La conversión a km/h, mph o rpm ocurre solo en [`format`].

#![forbid(unsafe_code)]

mod adapter;
pub mod broadcast_tower;
mod capability;
pub mod car_damage_numbers;
pub mod car_damage_visual;
pub mod delta;
pub mod delta_trace;
pub mod fastest_lap;
mod flag;
pub mod format;
pub mod fuel_strategy;
pub mod head_to_head;
pub mod input_telemetry;
mod model;
pub mod multiclass_relative;
pub mod pedals;
pub mod pedals_telemetry;
mod quality;
pub mod racing_flags;
pub mod radar;
pub mod relative;
pub mod relative_vantare;
pub mod standings;
pub mod standings_vantare;
pub mod track_map;
pub mod track_weather;

pub use adapter::{Adapter, AdapterError, Observation};
pub use capability::{Capabilities, Capability};
pub use flag::{Flag, FlagKind, FlagScope};
pub use model::{
    Car, CarId, Class, ClassId, Damage, Driver, DriverId, DriverRating, Fuel, Gap, Origin, Player,
    Pose, Session, SessionId, SessionKind, SessionState, Snapshot, Source, SourceKind, SourceState,
    State, Telemetry, TyreCompound, UNKNOWN_SIMULATOR, Weather, degrade,
};
pub use quality::Quality;
pub mod text;
