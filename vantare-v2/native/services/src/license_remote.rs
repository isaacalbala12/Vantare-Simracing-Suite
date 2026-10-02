use crate::{
    Error, Result,
    account::Account,
    bridge::DataRequest,
    config::BuildConfig,
    http::Http,
    license::{CredentialV1, Verifier},
    storage::Store,
};
use serde::{Deserialize, Serialize};

#[cfg(all(test, any(windows, unix)))]
pub(crate) mod tests;

#[derive(Serialize)]
struct Request<'a> {
    version: u8,
    #[serde(rename = "deviceFingerprint")]
    device_fingerprint: &'a str,
}

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
    http: &Http,
    config: &BuildConfig,
    account: &Account,
    now: u64,
    device: &str,
    store: &Store,
) -> Result<Candidate> {
    let endpoint = config
        .supabase
        .as_ref()
        .ok_or(Error::Unconfigured)?
        .join("functions/v1/native-license")
        .map_err(|_| Error::Unconfigured)?;
    let anon = config
        .anon_key
        .filter(|key| !key.is_empty())
        .ok_or(Error::Unconfigured)?;
    let verifier = Verifier::public_keys(config.license_keys.ok_or(Error::Unconfigured)?)?;
    if device.len() != 64
        || !device
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(Error::InvalidCredential);
    }
    let response = account.authorized(now, |bearer| {
        http.post_json(
            &endpoint,
            &Request {
                version: 1,
                device_fingerprint: device,
            },
            Some(bearer),
            Some(anon),
        )
    })?;
    if response.status == 409 {
        #[derive(Deserialize)]
        struct Rejected {
            error: String,
        }
        if response
            .json::<Rejected>()
            .is_ok_and(|rejected| rejected.error == "device_limit")
        {
            return Err(Error::DeviceLimit);
        }
    }
    let response = response.success()?;
    if response.status != 200 {
        return Err(Error::Protocol);
    }
    let response: Response = response.json()?;
    if response
        .online_capabilities
        .iter()
        .any(|key| !crate::license::CAPABILITIES.contains(&key.as_str()))
    {
        return Err(Error::Protocol);
    }
    // El servidor resuelve (issuer, sub OAuth) al UUID interno. Ese UUID solo
    // adquiere autoridad tras verificar la firma y todos los claims v1.
    let subject = &response.credential.claims.subject;
    verifier.v1(&response.credential, subject, device)?;
    let candidate = Candidate {
        account_id: subject.clone(),
        credential: response.credential,
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
