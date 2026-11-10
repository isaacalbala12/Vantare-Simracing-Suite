#![deny(unsafe_code)]
pub mod args;
#[cfg(windows)]
mod control_stdin;
#[cfg(windows)]
pub mod core;
pub mod frame;
pub mod protocol;
#[cfg(windows)]
pub mod ready;
#[cfg(windows)]
pub mod ui_process;
