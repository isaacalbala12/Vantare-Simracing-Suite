use crate::{
    Error, Result, account::Account, bridge::DataRequest, config::BuildConfig, http::Http,
    license::CredentialV1,
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
pub fn renew(
    http: &Http,
    config: &BuildConfig,
    account: &Account,
    now: u64,
    device: &str,
) -> Result<CredentialV1> {
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
    config
        .license_keys
        .filter(|keys| !keys.is_empty())
        .ok_or(Error::Unconfigured)?;
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
    crate::access_diagnostic::record(crate::access_diagnostic::Route::License, &response);
    if response.status == 409 {
        #[derive(Deserialize)]
        struct Rejected {
            error: String,
        }
        if let Ok(rejected) = response.json::<Rejected>() {
            match rejected.error.as_str() {
                "device_limit" => return Err(Error::DeviceLimit),
                "account_conflict" => return Err(Error::AccountConflict),
                _ => {}
            }
        }
    }
    let response = response.success()?;
    response.server_now(now)?;
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
    // Sin inspección de claims: el núcleo verifica antes del ACK durable.
    Ok(response.credential) // Fresh bytes only; never saved or trusted by services.
}

pub fn reset_device(request: &DataRequest<'_>, device: &str) -> Result<()> {
    // La misma validacion que `renew` aplica a la huella: es la llamada que
    // LIBERA el dispositivo activo, asi que no debe aceptar menos que el resto
    // del modulo.
    if device.len() != 64
        || !device
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
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
