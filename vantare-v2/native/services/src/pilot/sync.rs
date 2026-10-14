//! Sincronización explícita con CAS. Un fallo remoto conserva el guardado local.
use super::{Local, PilotPhoto, PilotProfile, validate};
use crate::{Error, Result, bridge::DataRequest};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Deserialize;
#[cfg(test)]
#[path = "idempotency_tests.rs"]
mod idempotency_tests;
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
    if local.state().pending {
        // Reintenta siempre la misma operación antes de enviar una edición nueva.
        // No se infiere el resultado de un CAS a partir de un SELECT concurrente.
        while let Some(operation) = local.operation.clone() {
            let mut profile = operation.profile.clone();
            let bytes = profile
                .photo
                .take()
                .map(|photo| STANDARD.decode(photo.jpeg))
                .transpose()
                .map_err(|_| Error::Protocol)?;
            let photo_hash = bytes.as_deref().map(crate::content_hash);
            if let (Some(bytes), Some(hash)) = (&bytes, &photo_hash) {
                let response = request.pilot_photo(hash, Some(bytes))?;
                if duplicate(&response) {
                    let existing = request.pilot_photo(hash, None)?.success()?.body;
                    if crate::content_hash(&existing) != *hash {
                        return Err(Error::Protocol);
                    }
                } else {
                    response.success()?;
                }
            }
            let saved: Remote = request.post("rest/v1/rpc/pilot_profile_save", &serde_json::json!({
                "p_profile": profile, "p_photo_hash": photo_hash,
                "p_expected_revision": operation.remote_revision, "p_op_id": operation.op_id,
            }))?.success()?.json()?;
            if saved.revision
                != operation
                    .remote_revision
                    .checked_add(1)
                    .ok_or(Error::Conflict)?
                || saved.profile != profile
                || saved.photo_hash != photo_hash
            {
                return Err(Error::Protocol);
            }
            local.confirm_operation(saved.revision)?;
        }
    } else {
        let remote: Option<Remote> = request
            .post("rest/v1/rpc/pilot_profile_load", &serde_json::json!({}))?
            .success()?
            .json()?;
        if let Some(mut remote) = remote {
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
    }
    Ok(())
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
