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

pub mod relative;
mod renderer;
pub mod stats;
pub mod vantare;

#[cfg(test)]
mod testdata;
