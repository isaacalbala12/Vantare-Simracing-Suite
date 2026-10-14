//! Sincronización explícita con CAS. Un fallo remoto conserva el guardado local.
use super::{Local, PilotPhoto, PilotProfile, validate};
use crate::{Error, Result, bridge::DataRequest};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
#[cfg(test)]
#[path = "sync_tests.rs"]
mod tests;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Remote {
    pub profile: PilotProfile,
    pub revision: u64,
    pub photo_hash: Option<String>,
}

pub fn synchronize(local: &mut Local, request: &DataRequest<'_>) -> Result<()> {
    let remote: Option<Remote> = request
        .post("rest/v1/rpc/pilot_profile_load", &serde_json::json!({}))?
        .success()?
        .json()?;
    let remote_revision = remote.as_ref().map_or(0, |value| value.revision);
    if local.state().pending {
        // No sobreescribe ediciones hechas desde otro dispositivo.
        if local.state().remote_revision != remote_revision {
            return Err(Error::Conflict);
        }
        let mut profile = local.state().profile.clone();
        let photo_hash = if let Some(photo) = profile.photo.take() {
            let bytes = STANDARD.decode(photo.jpeg).map_err(|_| Error::Protocol)?;
            let hash = crate::content_hash(&bytes);
            let response = request.pilot_photo(&hash, Some(&bytes))?;
            // Un reintento idempotente usa el mismo nombre inmutable.
            if response.status != 409 {
                response.success()?;
            }
            Some(hash)
        } else {
            None
        };
        let saved: Remote = request.post("rest/v1/rpc/pilot_profile_save", &serde_json::json!({
            "p_profile": profile, "p_photo_hash": photo_hash, "p_expected_revision": remote_revision,
        }))?.success()?.json()?;
        if saved.revision != remote_revision.checked_add(1).ok_or(Error::Conflict)?
            || saved.profile != profile
            || saved.photo_hash != photo_hash
        {
            return Err(Error::Protocol);
        }
        local.accept_remote(local.state().profile.clone(), saved.revision)?;
    } else if let Some(mut remote) = remote {
        if remote.revision < local.state().remote_revision || remote.profile.photo.is_some() {
            return Err(Error::Protocol);
        }
        if let Some(hash) = remote.photo_hash {
            let bytes = request.pilot_photo(&hash, None)?.success()?.body;
            if crate::content_hash(&bytes) != hash {
                return Err(Error::Protocol);
            }
            remote.profile.photo = Some(PilotPhoto {
                jpeg: STANDARD.encode(bytes),
            });
        }
        validate(&remote.profile)?;
        local.accept_remote(remote.profile, remote.revision)?;
    }
    Ok(())
}
