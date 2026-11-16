//! Arranque y política del proceso de overlays; sin crear dispositivos gráficos.
pub mod host;
pub mod input_telemetry;
#[cfg(any(windows, test))]
mod monitores;
mod native_window;
pub mod options;
pub mod supervisor;
#[cfg(windows)]
mod topologia_windows;

pub mod feed;
pub mod scene;

pub mod fastest_lap;
mod fuel;
mod head_to_head;
mod motion;
mod multiclass_relative;
pub mod pedals;
pub mod pedals_telemetry;
pub mod racing_flags;
mod radar;
pub mod relative;
mod renderer;
pub mod stats;
mod tower;
mod track_map;
pub mod vantare;
mod widget;

#[cfg(test)]
mod testdata;
