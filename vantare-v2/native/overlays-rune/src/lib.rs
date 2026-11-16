//! Arranque y política del proceso de overlays; sin crear dispositivos gráficos.
pub mod host;
#[cfg(any(windows, test))]
mod monitores;
mod native_window;
pub mod options;
pub mod supervisor;
#[cfg(windows)]
mod topologia_windows;

pub mod feed;
pub mod scene;

mod motion;
mod multiclass_relative;
pub mod pedals;
mod radar;
pub mod relative;
mod renderer;
pub mod stats;
mod track_map;
pub mod vantare;
mod widget;

#[cfg(test)]
mod testdata;
