//! Installation engine independent of GPUI (ADR 0103, steps 3/4).
//!
//! Rust owns Setup/Uninstall mutations. Three legacy shell-finalization calls
//! retire in step 5; candidate Get-NativeLaunchTarget in step 5; Read-NativeState and beta
//! Uninstall-Beta retire as their consumers migrate in steps 4–6, with product
//! PowerShell removed in step 7. No global five-to-one claim before that cut.
#[cfg(feature = "transport")]
pub mod context;
#[cfg(feature = "transport")]
mod host;
mod installation;
#[cfg(feature = "write-engine")]
pub mod operations;
#[cfg(feature = "write-engine")]
pub mod package;
#[cfg(all(windows, feature = "write-engine"))]
mod platform;
pub mod validation;
#[cfg(feature = "write-engine")]
pub mod write_fs;

#[cfg(feature = "transport")]
pub use host::{Request, Session, headless, log_path};
pub use installation::{
    Generation, Installation, Manifest, ReadError, ReadProfile, Rejection, State, current_members,
    known_members, validate_catalogue,
};
#[cfg(feature = "write-engine")]
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

/// Legacy p3 contrast adapter. Production Setup uses `Context::probe` from p4;
/// the matrix keeps this adapter until product PowerShell retires in p7.
pub fn complete_probe(
    mut info: crate::model::Info,
    uninstall: bool,
) -> Result<crate::model::Info, ReadError> {
    let profile = if uninstall {
        ReadProfile::Uninstall
    } else {
        ReadProfile::Probe
    };
    let installation = Installation::read(&info.root, profile)?;
    // The shared reader accepts every closed channel. Setup's legacy driver
    // additionally calls Read-NativeManifest with ExpectedChannel='beta'.
    validate_setup_channel(installation.manifest.as_ref(), uninstall)?;
    if !uninstall || installation.state.is_none() {
        info.installed_version = installation.installed_version().map(str::to_owned);
    }
    info.data_path = installation.data_path;
    // Session::probe historically discarded successful driver stderr. Keep
    // warnings available on Installation without adding console output here.
    Ok(info)
}

pub(super) fn validate_setup_channel(
    manifest: Option<&Manifest>,
    uninstall: bool,
) -> Result<(), ReadError> {
    if !uninstall && manifest.is_some_and(|manifest| manifest.channel != "beta") {
        Err(Rejection::Manifest.into())
    } else {
        Ok(())
    }
}
