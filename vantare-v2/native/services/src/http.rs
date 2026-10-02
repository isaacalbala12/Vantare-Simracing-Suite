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
        let body = response
            .body_mut()
            .with_config()
            .limit(RESPONSE_LIMIT)
            .read_to_vec()
            .map_err(|error| match error {
                ureq::Error::BodyExceedsLimit(_) => Error::TooLarge,
                _ => Error::Offline,
            })?;
        Ok(Response { status, body })
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
}

// ureq reexporta http; evita añadir otra dependencia directa por el tipo respuesta.
mod http_response {
    pub type Response = ureq::http::Response<ureq::Body>;
}
