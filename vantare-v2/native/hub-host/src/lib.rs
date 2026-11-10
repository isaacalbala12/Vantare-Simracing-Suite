#![deny(unsafe_code)]
pub mod args;
#[cfg(windows)]
mod control_stdin;
#[cfg(windows)]
pub mod core;
pub mod frame;
#[cfg(windows)]
mod integrity;
pub mod protocol;
#[cfg(windows)]
pub mod ready;
#[cfg(windows)]
pub mod ui_process;

pub mod settings;

pub mod favorite;

#[cfg(windows)]
mod job;

#[cfg(all(test, windows))]
mod test_support;

pub mod shortcuts;

pub mod updates;

pub mod diagnostics;
pub mod privacy;

pub mod pilot;

pub mod roadmap;
pub mod testing;
mod testing_legacy;
