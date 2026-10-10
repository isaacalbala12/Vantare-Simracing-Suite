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
    fn authorize_target(&self) -> Result<()> {
        if self.authorize.origin() == self.supabase.origin()
            && (self.authorize.path() != "/functions/v1/native-account-authorize"
                || self.authorize.query().is_some()
                || self.authorize.fragment().is_some())
        {
            return Err(Error::BridgeUnconfigured);
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<()> {
        crate::config::remote_url(self.authorize.as_str())?;
        crate::config::remote_url(self.supabase.as_str())?;
        self.authorize_target()?;
        if self.anon_key.trim().is_empty() {
            return Err(Error::BridgeUnconfigured);
        }
        Ok(())
    }

    pub fn authorize(&self, http: &Http, account: &Account, now: u64) -> Result<DataSession> {
        // OAuth solo llega a la función validante; jamás a Storage o PostgREST.
        self.authorize_target()?;
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
                | "rest/v1/rpc/testing_center_prepare_screenshot_batch"
                | "rest/v1/rpc/testing_center_finalize_screenshot"
                | "rest/v1/rpc/testing_center_submit_report_with_evidence"
                | "rest/v1/rpc/testing_participation_current"
                | "rest/v1/rpc/testing_answer_save"
                | "rest/v1/rpc/testing_contribution_submit"
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
    pub(crate) fn upload(&self, object: &str, bytes: &[u8]) -> Result<crate::http::Response> {
        self.check()?;
        // Solo nombres canónicos ya validados por screenshots::upload.
        if !object.starts_with("v1/")
            || object
                .bytes()
                .any(|b| !b.is_ascii_hexdigit() && !matches!(b, b'v' | b'/' | b'-'))
        {
            return Err(Error::Protocol);
        }
        let url = self
            .config
            .supabase
            .join(&format!(
                "storage/v1/object/testing-center-evidence/{object}"
            ))
            .map_err(|_| Error::Protocol)?;
        self.http.upload_jpeg(
            &url,
            bytes,
            self.session.token.expose(),
            &self.config.anon_key,
        )
    }
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use crate::test_http::Server;
    #[test]
    fn oauth_same_origin_only_reaches_exact_authorize_without_apikey() {
        let server = Server::start(vec![
            (200, serde_json::json!({"version":1,"account_id":"550e8400-e29b-41d4-a716-446655440000","data_access_token":"data-fixture","expires_at":160}).to_string()),
            (401, "{}".into()),
        ]);
        let (root, store) = crate::test_store("bridge-target");
        let account = crate::account::fixture(&server.base, &store);
        let http = Http::default();
        let mut config = Config {
            authorize: server.base.clone(),
            supabase: server.base.clone(),
            anon_key: "public-fixture".into(),
        };
        for path in [
            "rest/v1/rpc/testing_center_submit_report",
            "storage/v1/object/x",
            "functions/v1/license-credential",
            "functions/v1/native-account-authorize/",
            "functions/v1/native-account-authorize?x=1",
        ] {
            config.authorize = server.base.join(path).expect("URL");
            assert!(matches!(
                config.authorize(&http, &account, 100),
                Err(Error::BridgeUnconfigured)
            ));
        }
        config.authorize = server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("URL");
        assert!(config.authorize(&http, &account, 100).is_ok());
        assert!(matches!(
            config.authorize(&http, &account, 100),
            Err(Error::Authentication)
        ));
        for _ in 0..2 {
            let sent = server
                .requests
                .recv_timeout(std::time::Duration::from_secs(3))
                .expect("HTTP");
            assert!(sent.starts_with("POST /functions/v1/native-account-authorize HTTP/1.1"));
            assert!(sent.to_lowercase().contains("authorization: bearer "));
            assert!(!sent.to_lowercase().contains("apikey:"));
            assert!(sent.ends_with("{\"version\":1}"));
        }
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "bridge-target", &[]);
    }
}
