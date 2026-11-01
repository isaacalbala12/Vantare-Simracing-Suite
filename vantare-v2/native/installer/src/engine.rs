//! Shared installation reads, independent of GPUI (ADR 0103, step 3).
//!
//! Legacy adapters still own mutations: driver state/uninstall reads retire in
//! step 4; candidate Get-NativeLaunchTarget in step 5; Read-NativeState and beta
//! Uninstall-Beta retire as their consumers migrate in steps 4–6, with product
//! PowerShell removed in step 7. No global five-to-one claim before that cut.
#[cfg(feature = "transport")]
mod host;
mod installation;
pub mod validation;

#[cfg(feature = "transport")]
pub use host::{Request, Session, headless, log_path};
pub use installation::{Generation, Installation, Manifest, ReadError, ReadProfile, State};

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

/// Complete the OS context using the one Rust state reader. The driver keeps
/// discovery/options until step 4; it does not read installation state here.
pub fn complete_probe(
    mut info: crate::model::Info,
    uninstall: bool,
) -> Result<crate::model::Info, String> {
    let profile = if uninstall {
        ReadProfile::Uninstall
    } else {
        ReadProfile::Probe
    };
    let installation = Installation::read(&info.root, profile).map_err(|e| e.to_string())?;
    if !uninstall || installation.state.is_none() {
        info.installed_version = installation.installed_version().map(str::to_owned);
    }
    info.data_path = installation.data_path;
    if let Some(warning) = installation.previous_warning {
        eprintln!("{warning}");
    }
    Ok(info)
}
