//! The telemetry process is inert until its versioned IPC and LMU driver are wired.

pub mod core;
pub mod derive;
pub mod ipc;
pub mod lmu;
pub mod quality;
