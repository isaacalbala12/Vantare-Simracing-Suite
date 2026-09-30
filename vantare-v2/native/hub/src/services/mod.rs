//! Consumidor del proceso de servicios. Solo DTO/IPC; no HTTP ni tokens.
pub mod client;

// Wiring acotado a rutas del worker; el DTO es la misma fuente, no una copia.
#[path = "../../../services/src/protocol.rs"]
pub mod protocol;
