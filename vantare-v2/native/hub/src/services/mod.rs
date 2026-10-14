//! Consumidor del proceso de servicios. Solo DTO/IPC; no HTTP ni tokens.
pub mod client;
pub mod view;

// Wiring acotado a rutas del worker; el DTO es la misma fuente, no una copia.
pub use vantare_ipc::services_protocol as protocol;
