//! Local test transport only. Trust roots and signature verification are unchanged.
use crate::{
    Error, Result,
    config::{BuildConfig, OAuthBuild},
};
use url::Url;

pub fn endpoint(text: &str) -> Result<Url> {
    if !text.starts_with("http://127.0.0.1:") {
        return Err(Error::Unconfigured);
    }
    let url = Url::parse(text).map_err(|_| Error::Unconfigured)?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::Unconfigured);
    }
    Ok(url)
}
fn configured(name: &str) -> Url {
    endpoint(&std::env::var(name).expect("missing qa-e2e endpoint"))
        .expect("qa-e2e requires explicit HTTP IPv4 loopback endpoint")
}
pub fn configure(mut config: BuildConfig) -> BuildConfig {
    let _ = vantare_ipc::qa::root(); // Startup must have validated isolated ownership.
    config.supabase = Some(configured("VANTARE_QA_LICENSE_URL"));
    config.anon_key = Some("qa-fixture-public");
    config.channel = Some("nightly");
    config.native_oauth = Some(OAuthBuild {
        issuer: configured("VANTARE_QA_IDP_URL"),
        client_id: "qa-native".into(),
        redirect_uri: configured("VANTARE_QA_REDIRECT_URL"),
    });
    config
}
pub fn bridge() -> Option<crate::bridge::Config> {
    let supabase = configured("VANTARE_QA_LICENSE_URL");
    Some(crate::bridge::Config {
        authorize: supabase
            .join("functions/v1/native-account-authorize")
            .expect("local route"),
        supabase,
        anon_key: "qa-fixture-public".into(),
    })
}
// The runner exercises the existing explicit-copy flow without opening a real browser.
pub fn active() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn qa_endpoint_rejects_every_external_or_ambiguous_target() {
        for value in [
            "https://127.0.0.1:1234",
            "http://localhost:1234",
            "http://127.1:1234",
            "http://2130706433:1234",
            "http://0x7f000001:1234",
            "http://127.0.0.2:1234",
            "http://[::1]:1234",
            "http://example.invalid:1234",
            "http://user@127.0.0.1:1234",
            "http://127.0.0.1:1234/?token=x",
            "http://127.0.0.1:1234/#x",
            "http://127.0.0.1",
        ] {
            assert!(endpoint(value).is_err(), "{value}");
        }
        assert!(endpoint("http://127.0.0.1:1234/functions/v1/native-license").is_ok());
    }
}
