//! Servicios de usuario bajo demanda. Sin GPUI ni acceso a simuladores.
#![deny(unsafe_code)]

#[cfg(feature = "network")]
pub mod account;
#[cfg(feature = "network")]
pub mod app;
#[cfg(feature = "network")]
pub mod bridge;
#[cfg(feature = "network")]
pub mod config;
pub mod diagnostics;
pub mod error;
#[cfg(feature = "network")]
pub mod host;
#[cfg(feature = "network")]
pub mod http;
pub mod license;
#[cfg(feature = "network")]
pub mod license_remote;
#[cfg(any(windows, unix))]
pub mod process;
pub mod protocol;
#[cfg(feature = "network")]
pub mod report;
#[cfg(feature = "network")]
pub mod roadmap;
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

#[cfg(all(test, feature = "network"))]
mod test_http;

#[cfg(all(test, any(windows, unix)))]
fn test_store(context: &str) -> (std::path::PathBuf, storage::Store) {
    let root = std::env::temp_dir().join(format!(
        "vantare-services-test-{}",
        random_id().expect("test entropy")
    ));
    let store = storage::Store::open(&root, context).expect("test store");
    (root, store)
}

#[cfg(all(test, any(windows, unix)))]
fn cleanup_store(root: &std::path::Path, _context: &str, _names: &[&str]) {
    std::fs::remove_dir_all(root).expect("test store cleanup");
}
