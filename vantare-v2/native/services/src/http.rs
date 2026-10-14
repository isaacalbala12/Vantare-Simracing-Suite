use std::time::Duration;

use serde::{Serialize, de::DeserializeOwned};
use url::Url;

use crate::{Error, Result};

pub const RESPONSE_LIMIT: u64 = 64 * 1024;

pub struct Http {
    agent: ureq::Agent,
}

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
    pub(crate) client_token: Option<crate::account::Secret>,
    pub(crate) retry_after: Option<u64>,
}

impl Response {
    pub fn json<T: DeserializeOwned>(&self) -> Result<T> {
        serde_json::from_slice(&self.body).map_err(|_| Error::Protocol)
    }

    pub fn success(self) -> Result<Self> {
        match self.status {
            200..=299 => Ok(self),
            401 => Err(Error::Authentication),
            403 => Err(Error::Denied),
            409 => Err(Error::Conflict),
            429 | 500..=599 => Err(Error::Offline),
            _ => Err(Error::Protocol),
        }
    }
}

impl Default for Http {
    fn default() -> Self {
        Self {
            agent: ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(8)))
                .max_redirects(0)
                .http_status_as_error(false)
                .build()
                .into(),
        }
    }
}

impl Http {
    fn validate_url(url: &Url) -> Result<()> {
        if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
            return Err(Error::Unconfigured);
        }
        if url.scheme() == "https" {
            return Ok(());
        }
        #[cfg(test)]
        if url.scheme() == "http" && url.host_str() == Some("127.0.0.1") {
            return Ok(());
        }
        Err(Error::Unconfigured)
    }

    fn read(
        response: std::result::Result<http_response::Response, ureq::Error>,
    ) -> Result<Response> {
        let mut response = response.map_err(|_| Error::Offline)?;
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get("Retry-After")
            .and_then(|header| header.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let client_token = response
            .headers()
            .get("Authorization")
            .and_then(|header| header.to_str().ok())
            .map(|value| crate::account::Secret::new(value.to_owned()));
        let body = response
            .body_mut()
            .with_config()
            .limit(RESPONSE_LIMIT)
            .read_to_vec()
            .map_err(|error| match error {
                ureq::Error::BodyExceedsLimit(_) => Error::TooLarge,
                _ => Error::Offline,
            })?;
        Ok(Response {
            status,
            body,
            client_token,
            retry_after,
        })
    }

    pub fn get(&self, url: &Url, bearer: Option<&str>, anon: Option<&str>) -> Result<Response> {
        Self::validate_url(url)?;
        let mut request = self.agent.get(url.as_str());
        if let Some(token) = bearer {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        if let Some(key) = anon {
            request = request.header("apikey", key);
        }
        Self::read(request.call())
    }

    /// Foto pública sin credenciales: presupuesto menor que el login y sin redirects.
    pub(crate) fn profile_image(&self, url: &Url) -> Result<Response> {
        Self::validate_url(url)?;
        Self::read(
            self.agent
                .get(url.as_str())
                .config()
                .timeout_global(Some(Duration::from_secs(2)))
                .build()
                .call(),
        )
    }

    pub fn post_json(
        &self,
        url: &Url,
        body: &impl Serialize,
        bearer: Option<&str>,
        anon: Option<&str>,
    ) -> Result<Response> {
        Self::validate_url(url)?;
        let bytes = serde_json::to_vec(body).map_err(|_| Error::Protocol)?;
        if bytes.len() as u64 > RESPONSE_LIMIT {
            return Err(Error::TooLarge);
        }
        let mut request = self
            .agent
            .post(url.as_str())
            .header("Content-Type", "application/json");
        if let Some(token) = bearer {
            request = request.header("Authorization", format!("Bearer {token}"));
        }
        if let Some(key) = anon {
            request = request.header("apikey", key);
        }
        Self::read(request.send(bytes.as_slice()))
    }

    pub fn post_form(&self, url: &Url, fields: &[(&str, &str)]) -> Result<Response> {
        Self::validate_url(url)?;
        Self::read(
            self.agent
                .post(url.as_str())
                .send_form(fields.iter().copied()),
        )
    }

    /// FAPI nativa: cookies/Origin ausentes; token de cliente en Authorization.
    pub(crate) fn native_form(
        &self,
        url: &Url,
        fields: &[(&str, &str)],
        client: Option<&str>,
    ) -> Result<Response> {
        Self::validate_url(url)?;
        let mut url = url.clone();
        url.query_pairs_mut().append_pair("_is_native", "true");
        let mut request = self.agent.post(url.as_str());
        if let Some(client) = client {
            request = request.header("Authorization", format!("Bearer {client}"));
        }
        Self::read(request.send_form(fields.iter().copied()))
    }

    pub fn upload_jpeg(
        &self,
        url: &Url,
        bytes: &[u8],
        bearer: &str,
        anon: &str,
    ) -> Result<Response> {
        Self::validate_url(url)?;
        if bytes.is_empty() || bytes.len() > crate::report::screenshots::MAX_BYTES {
            return Err(Error::TooLarge);
        }
        Self::read(
            self.agent
                .post(url.as_str())
                .header("Content-Type", "image/jpeg")
                .header("Authorization", format!("Bearer {bearer}"))
                .header("apikey", anon)
                .header("x-upsert", "false")
                .send(bytes),
        )
    }
}

// ureq reexporta http; evita añadir otra dependencia directa por el tipo respuesta.
mod http_response {
    pub type Response = ureq::http::Response<ureq::Body>;
}
