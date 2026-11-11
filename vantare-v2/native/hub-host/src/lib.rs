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
#[cfg(any(windows, test))]
mod service_queue;
#[cfg(windows)]
pub mod ui_process;

pub mod favorite;

#[cfg(windows)]
mod job;

#[cfg(all(test, windows))]
mod test_support;

include!(concat!(env!("OUT_DIR"), "/models.rs"));

#[cfg(test)]
mod dispatch_contract_tests;
#[cfg(test)]
#[path = "../build_support.rs"]
mod wire_source_tests;

pub mod widget_defaults;
