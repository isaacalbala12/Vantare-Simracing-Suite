//! Autoridad y verificación puras; el Owner/host Windows es el único escritor.
pub mod authority;
pub mod catalog;
#[cfg(windows)]
pub mod host;
#[cfg(windows)]
mod owner;
pub mod verifier;
#[cfg(windows)]
pub use owner::{Devices, Owner, production, wall_now};

#[cfg(all(test, any(windows, unix)))]
fn test_store(context: &str) -> (std::path::PathBuf, vantare_services::storage::Store) {
    let root = std::env::temp_dir().join(format!(
        "rights-pure-{}",
        vantare_services::random_id().expect("test root")
    ));
    let store = vantare_services::storage::Store::open(&root, context).expect("test store");
    (root, store)
}
#[cfg(all(test, any(windows, unix)))]
fn cleanup_store(root: &std::path::Path, _context: &str, _names: &[&str]) {
    std::fs::remove_dir_all(root).expect("private test cleanup");
}
