//! Installation engine independent of GPUI (ADR 0103, steps 3/4).
//!
//! Rust owns Setup/Uninstall mutations and shell synchronization. Cleanup is
//! the permanent minimal PowerShell exception in ADR0103. Read-NativeState and beta
//! Uninstall-Beta retire as their consumers migrate in steps 4–6, with product
//! PowerShell removed in step 7. No global five-to-one claim before that cut.
#[cfg(all(windows, feature = "write-engine"))]
pub mod context;
#[cfg(all(windows, feature = "write-engine"))]
mod host;
mod installation;
#[cfg(all(windows, feature = "write-engine"))]
pub mod operations;
#[cfg(all(windows, feature = "write-engine"))]
pub mod package;
#[cfg(all(windows, feature = "write-engine"))]
pub mod shell;
pub mod validation;
#[cfg(all(windows, feature = "write-engine"))]
mod windows;
#[cfg(all(windows, feature = "write-engine"))]
pub mod write_fs;

#[cfg(all(windows, feature = "write-engine"))]
pub use host::{Operation, Request, Session, headless, log_path};
pub use installation::{Generation, Installation, Manifest, ReadError, Rejection, State};
#[cfg(all(windows, feature = "write-engine"))]
pub use write_fs::WriteError;

pub fn reject_links(path: &std::path::Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        if let Ok(metadata) = std::fs::symlink_metadata(ancestor) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err("No se permiten enlaces ni puntos de reanálisis".into());
                }
            }
            if metadata.file_type().is_symlink() {
                return Err("No se permiten enlaces".into());
            }
        }
    }
    Ok(())
}

#[cfg(all(windows, feature = "write-engine"))]
pub fn powershell() -> Result<std::path::PathBuf, String> {
    Ok(
        std::path::PathBuf::from(std::env::var_os("WINDIR").ok_or("Windows no está disponible")?)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    )
}
