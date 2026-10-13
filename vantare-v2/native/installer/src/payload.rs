//! Bytes prepared only after the application package and uninstaller have been built.
include!(concat!(env!("OUT_DIR"), "/payload.rs"));
pub const CANDIDATE: &[u8] = include_bytes!("../../packaging/candidate.ps1");
pub const BETA: &[u8] = include_bytes!("../../packaging/beta.ps1");
pub const DRIVER: &[u8] = include_bytes!("../../packaging/installer-driver.ps1");
