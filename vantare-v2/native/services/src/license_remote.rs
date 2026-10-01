use crate::{
    Error, Result,
    bridge::DataRequest,
    license::{CredentialV1, Verifier},
    storage::Store,
};
use serde::{Deserialize, Serialize};

#[cfg(all(test, any(windows, unix)))]
mod tests;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    credential: CredentialV1,
    online_capabilities: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Candidate {
    pub credential: CredentialV1,
    pub account_id: String,
    pub device: String,
}

pub fn candidate_context(base: Option<&str>, channel: Option<&str>) -> String {
    format!(
        "license-v1|{}|{}",
        base.unwrap_or("unconfigured"),
        channel.unwrap_or("unknown")
    )
}

pub fn renew(
    request: &DataRequest<'_>,
    device: &str,
    verifier: &Verifier,
    store: &Store,
) -> Result<Candidate> {
    if device.is_empty() || device.len() > 256 {
        return Err(Error::InvalidCredential);
    }
    let response = request.post(
        "functions/v1/license-credential",
        &serde_json::json!({"deviceFingerprint":device}),
    )?;
    if response.status == 409 {
        #[derive(Deserialize)]
        struct Rejected {
            error: String,
        }
        if response
            .json::<Rejected>()
            .is_ok_and(|error| error.error == "device_limit")
        {
            return Err(Error::DeviceLimit);
        }
    }
    let response: Response = response.success()?.json()?;
    if response
        .online_capabilities
        .iter()
        .any(|key| !crate::license::CAPABILITIES.contains(&key.as_str()))
    {
        return Err(Error::Protocol);
    }
    verifier.v1(&response.credential, request.account_id(), device)?;
    let candidate = Candidate {
        credential: response.credential,
        account_id: request.account_id().into(),
        device: device.into(),
    };
    store.save("license-candidate", &candidate)?;
    Ok(candidate) // Signed facts only; online_capabilities never grant local rights.
}

pub fn reset_device(request: &DataRequest<'_>, device: &str) -> Result<()> {
    if device.is_empty() || device.len() > 256 {
        return Err(Error::InvalidCredential);
    }
    // Explicit manual action; no retry. Core must durably revoke before this call.
    request
        .post(
            "rest/v1/rpc/reset_active_device",
            &serde_json::json!({"device_fingerprint":device}),
        )?
        .success()?;
    Ok(())
}
