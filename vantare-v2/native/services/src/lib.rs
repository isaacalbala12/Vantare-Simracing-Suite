//! Servicios de usuario bajo demanda. Sin GPUI ni acceso a simuladores.
#![deny(unsafe_code)]

pub mod config;
pub mod error;
pub mod host;
pub mod http;
pub mod protocol;
pub mod storage;

pub use error::{Error, Result};

/// Entropía SO; no fingerprint ni identificador sintético ante fallo.
pub fn random_id() -> Result<String> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| Error::Storage)?;
    let mut text = String::with_capacity(64);
    for byte in bytes {
        text.push(char::from(HEX[usize::from(byte >> 4)]));
        text.push(char::from(HEX[usize::from(byte & 15)]));
    }
    Ok(text)
}

#[cfg(test)]
mod test_http;
