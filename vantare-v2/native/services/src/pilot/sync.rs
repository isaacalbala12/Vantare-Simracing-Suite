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
        let mut profile = local.state().profile.clone();
        let bytes = profile
            .photo
            .take()
            .map(|photo| STANDARD.decode(photo.jpeg))
            .transpose()
            .map_err(|_| Error::Protocol)?;
        let photo_hash = bytes.as_deref().map(crate::content_hash);
        let current_fingerprint = fingerprint(&profile, photo_hash.as_deref())?;
        // No sobreescribe ediciones hechas desde otro dispositivo.
        if local.state().remote_revision != remote_revision {
            reconcile_pending(
                local,
                remote.as_ref().ok_or(Error::Conflict)?,
                &current_fingerprint,
            )?;
            if !local.state().pending {
                return Ok(());
            }
        }
        if let (Some(bytes), Some(hash)) = (&bytes, &photo_hash) {
            let response = request.pilot_photo(hash, Some(bytes))?;
            // Storage puede devolver 400/409 por objeto existente. Solo se
            // acepta su código tipado y se verifica el contenido por hash.
            if duplicate(&response) {
                let existing = request.pilot_photo(hash, None)?.success()?.body;
                if crate::content_hash(&existing) != *hash {
                    return Err(Error::Protocol);
                }
            } else {
                response.success()?;
            }
        }
        // Durable antes de la mutación remota; un error deja el intento intacto.
        local.record_attempt(current_fingerprint)?;
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

fn fingerprint(profile: &PilotProfile, photo_hash: Option<&str>) -> Result<String> {
    Ok(crate::content_hash(
        &serde_json::to_vec(&(profile, photo_hash)).map_err(|_| Error::Protocol)?,
    ))
}

fn reconcile_pending(local: &mut Local, observed: &Remote, current: &str) -> Result<()> {
    let observed_fingerprint = fingerprint(&observed.profile, observed.photo_hash.as_deref())?;
    // Reconcilia el CAS realmente enviado, aunque Guardar ya haya sustituido
    // el pendiente. Nunca reconoce contenido remoto distinto.
    let (expected, sent) = local
        .attempt
        .as_ref()
        .map_or((local.state().remote_revision, current), |attempt| {
            (attempt.remote_revision, attempt.fingerprint.as_str())
        });
    if Some(observed.revision) != expected.checked_add(1) || sent != observed_fingerprint {
        return Err(Error::Conflict);
    }
    local.reconcile(observed.revision, current != observed_fingerprint)
}

fn duplicate(response: &crate::http::Response) -> bool {
    matches!(response.status, 400 | 409)
        && response.json::<serde_json::Value>().is_ok_and(|body| {
            matches!(
                body.get("code")
                    .or_else(|| body.get("error"))
                    .and_then(serde_json::Value::as_str),
                Some("Duplicate" | "KeyAlreadyExists" | "ResourceAlreadyExists")
            )
        })
}

#[cfg(test)]
mod duplicate_tests {
    use super::*;
    #[test]
    fn unrelated_errors_are_never_accepted_as_existing_photos() {
        for (status, body, expected) in [
            (400, r#"{"error":"Duplicate"}"#, true),
            (409, r#"{"code":"KeyAlreadyExists"}"#, true),
            (400, r#"{"error":"InvalidMimeType"}"#, false),
            (409, "{}", false),
            (401, r#"{"error":"Duplicate"}"#, false),
        ] {
            assert_eq!(
                duplicate(&crate::http::Response {
                    status,
                    body: body.as_bytes().to_vec()
                }),
                expected
            );
        }
    }
}
