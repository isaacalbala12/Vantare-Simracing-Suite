//! Installation engine independent of GPUI (ADR 0103, steps 3/4).
//!
//! Rust owns Setup/Uninstall mutations. Three legacy shell-finalization calls
//! retire in step 5; candidate Get-NativeLaunchTarget in step 5; Read-NativeState and beta
//! Uninstall-Beta retire as their consumers migrate in steps 4–6, with product
//! PowerShell removed in step 7. No global five-to-one claim before that cut.
#[cfg(feature = "transport")]
mod host;
mod installation;
pub mod validation;
#[cfg(feature = "write-engine")]
pub mod package;
#[cfg(feature = "write-engine")]
pub mod operations;
#[cfg(feature = "write-engine")]
pub mod write_fs;
#[cfg(all(windows, feature = "write-engine"))]
mod platform;
#[cfg(feature = "transport")]
pub mod context;

#[cfg(feature = "transport")]
pub use host::{Request, Session, headless, log_path};
pub use installation::{
    Generation, Installation, Manifest, ReadError, ReadProfile, Rejection, State, known_members, current_members, validate_catalogue,
};
#[cfg(feature = "write-engine")]
pub use write_fs::WriteError;

#[cfg(all(windows, feature = "transport"))]
pub fn qa_launch_identity() -> Result<(), String> {
    if crate::QA {
        let owner = env!("VANTARE_INSTALLER_QA_OWNER_SID");
        let current = platform::user_sid().map_err(|error| error.to_string())?;
        if owner.is_empty() || current == owner {
            return Err("Abrir el Hub QA requiere una cuenta/VM con SID distinto al de origen del paquete.".into());
        }
    }
    Ok(())
}

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

pub(super) fn validate_setup_channel(manifest: Option<&Manifest>, uninstall: bool) -> Result<(), ReadError> {
    if !uninstall && manifest.is_some_and(|manifest| manifest.channel != "beta") { Err(Rejection::Manifest.into()) }
    else { Ok(()) }
}
