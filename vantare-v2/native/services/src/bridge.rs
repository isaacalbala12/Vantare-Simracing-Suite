//! Puente explícito: OAuth Clerk -> API validante -> sesión de datos limitada.
//! No se envía OAuth a `PostgREST` ni a `license-credential` directamente.
use crate::{
    Error, Result,
    account::{Account, Identity, Secret},
    http::Http,
    license::uuid,
};
use serde::Deserialize;
use url::Url;

pub struct Config {
    pub authorize: Url,
    pub supabase: Url,
    pub anon_key: String,
}
pub struct DataSession {
    identity: Identity,
    generation: u128,
    account_id: String,
    token: Secret,
    expires_at: u64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    version: u8,
    account_id: String,
    data_access_token: Secret,
    expires_at: u64,
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        crate::config::remote_url(self.authorize.as_str())?;
        crate::config::remote_url(self.supabase.as_str())?;
        if self.authorize.origin() == self.supabase.origin() || self.anon_key.trim().is_empty() {
            return Err(Error::BridgeUnconfigured);
        }
        Ok(())
    }

    pub fn authorize(&self, http: &Http, account: &Account, now: u64) -> Result<DataSession> {
        // In production the native OAuth bearer is never sent to the TPA origin.
        #[cfg(not(test))]
        if self.authorize.origin() == self.supabase.origin() {
            return Err(Error::BridgeUnconfigured);
        }
        let response: Response = account.authorized(now, |bearer| {
            http.post_json(
                &self.authorize,
                &serde_json::json!({"version":1}),
                Some(bearer),
                None,
            )?
            .success()?
            .json()
        })?;
        if response.version != 1
            || !uuid(&response.account_id)
            || response.expires_at <= now
            || response.expires_at > now.saturating_add(300)
            || response.data_access_token.expose().is_empty()
            || response.data_access_token.expose().len() > 16 * 1024
        {
            return Err(Error::Authentication);
        }
        Ok(DataSession {
            identity: account.identity().ok_or(Error::Authentication)?.clone(),
            generation: account.generation(),
            account_id: response.account_id,
            token: response.data_access_token,
            expires_at: response.expires_at,
        })
    }
}

impl DataSession {
    pub fn valid(&self, account: &Account, now: u64) -> bool {
        account.identity() == Some(&self.identity)
            && account.generation() == self.generation
            && now < self.expires_at
    }
    pub fn account_id(&self) -> &str {
        &self.account_id
    }
    pub fn post(
        &self,
        http: &Http,
        config: &Config,
        account: &Account,
        now: u64,
        path: &str,
        payload: &impl serde::Serialize,
    ) -> Result<crate::http::Response> {
        if !self.valid(account, now) {
            return Err(Error::Authentication);
        }
        // Callers supply fixed paths, never a remote URL from a response/Hub DTO.
        if !matches!(
            path,
            "functions/v1/license-credential"
                | "rest/v1/rpc/reset_active_device"
                | "rest/v1/rpc/testing_center_submit_report"
        ) {
            return Err(Error::Protocol);
        }
        let url = config
            .supabase
            .join(path)
            .map_err(|_| Error::Unconfigured)?;
        http.post_json(
            &url,
            payload,
            Some(self.token.expose()),
            Some(&config.anon_key),
        )
    }

    pub fn request<'a>(
        &'a self,
        http: &'a Http,
        config: &'a Config,
        account: &'a Account,
        now: u64,
    ) -> DataRequest<'a> {
        DataRequest {
            session: self,
            http,
            config,
            account,
            now,
        }
    }
}

pub struct DataRequest<'a> {
    session: &'a DataSession,
    http: &'a Http,
    config: &'a Config,
    account: &'a Account,
    now: u64,
}
impl DataRequest<'_> {
    pub(crate) fn check(&self) -> Result<()> {
        if self.session.valid(self.account, self.now) {
            Ok(())
        } else {
            Err(Error::Authentication)
        }
    }
    pub(crate) fn binding(&self) -> (&Identity, u128) {
        (&self.session.identity, self.session.generation)
    }
    pub fn account_id(&self) -> &str {
        self.session.account_id()
    }
    pub fn post(
        &self,
        path: &str,
        payload: &impl serde::Serialize,
    ) -> Result<crate::http::Response> {
        self.session.post(
            self.http,
            self.config,
            self.account,
            self.now,
            path,
            payload,
        )
    }
}
