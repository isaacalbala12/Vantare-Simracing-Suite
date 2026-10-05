//! Miniapp owner. El servidor decide permisos; el modo demo nunca hace red.
#![forbid(unsafe_code)]
mod cache;
pub mod client;
mod diagnostics;
pub mod session;
pub mod state;
pub mod view;
