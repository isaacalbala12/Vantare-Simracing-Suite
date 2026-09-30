//! Servicios de usuario bajo demanda. Sin GPUI ni acceso a simuladores.
#![deny(unsafe_code)]

pub mod account;
pub mod app;
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

#[cfg(all(test, windows))]
fn test_store(context: &str) -> (std::path::PathBuf, storage::Store) {
    let root = std::env::temp_dir().join(format!(
        "vantare-services-test-{}",
        random_id().expect("test entropy")
    ));
    let store = storage::Store::open(&root, context).expect("test store");
    (root, store)
}

#[cfg(all(test, windows))]
fn cleanup_store(root: &std::path::Path, context: &str, names: &[&str]) {
    use sha2::{Digest, Sha256};
    let namespace = root.join(format!("{:x}", Sha256::digest(context.as_bytes())));
    for name in names {
        std::fs::remove_file(namespace.join(format!("{name}.dpapi"))).expect("test file cleanup");
    }
    std::fs::remove_file(namespace.join("owner.lock")).expect("test lock cleanup");
    std::fs::remove_dir(namespace).expect("test namespace cleanup");
    std::fs::remove_dir(root).expect("test root cleanup");
}
