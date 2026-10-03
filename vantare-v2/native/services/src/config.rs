use url::Url;

use crate::{Error, Result};

/// Solo nombres públicos existentes en build/producto. No aliases de entorno
/// runtime; OAuth nativo no se inventa a partir de una publishable key.
pub struct BuildConfig {
    pub supabase: Option<Url>,
    pub anon_key: Option<&'static str>,
    pub license_keys: Option<&'static str>,
    pub channel: Option<&'static str>,
    pub native_oauth: Option<OAuthBuild>,
}

/// Configuración pública fijada al compilar. No es
/// un secreto ni una reinterpretación de la publishable key del SDK Wails.
pub struct OAuthBuild {
    pub issuer: Url,
    pub client_id: String,
    pub redirect_uri: Url,
}

impl BuildConfig {
    pub fn load() -> Self {
        Self {
            supabase: option_env!("VANTARE_SUPABASE_URL").and_then(|value| remote_url(value).ok()),
            anon_key: option_env!("VANTARE_SUPABASE_ANON_KEY").filter(|s| !s.is_empty()),
            license_keys: option_env!("VANTARE_LICENSE_PUBLIC_KEYS").filter(|s| !s.is_empty()),
            channel: option_env!("VANTARE_BUILD_CHANNEL"),
            native_oauth: OAuthBuild::from_build_values(
                option_env!("VANTARE_CLERK_ISSUER"),
                option_env!("VANTARE_CLERK_CLIENT_ID"),
                option_env!("VANTARE_CLERK_REDIRECT"),
            ),
        }
    }

    /// Solo activa cuenta con issuer, client ID y redirect públicos válidos.
    pub fn native_account_configured(&self) -> bool {
        self.native_oauth.is_some()
    }

    /// El puente de datos es independiente de native-license. Ausencia o
    /// configuración inválida deja disponibles los borradores locales.
    pub fn data_bridge(&self) -> Option<crate::bridge::Config> {
        self.data_bridge_url(option_env!("VANTARE_ACCOUNT_BRIDGE_URL"))
    }

    fn data_bridge_url(&self, authorize: Option<&str>) -> Option<crate::bridge::Config> {
        let config = crate::bridge::Config {
            authorize: remote_url(authorize?).ok()?,
            supabase: self.supabase.clone()?,
            anon_key: self.anon_key?.into(),
        };
        config.validate().ok()?;
        Some(config)
    }
}

impl OAuthBuild {
    fn from_build_values(
        issuer: Option<&str>,
        client_id: Option<&str>,
        redirect: Option<&str>,
    ) -> Option<Self> {
        let issuer = remote_url(issuer?).ok()?;
        let client_id = client_id.filter(|value| !value.trim().is_empty() && value.len() <= 256)?;
        let redirect_uri = Url::parse(redirect?).ok()?;
        if redirect_uri.scheme() != "http"
            || redirect_uri.host_str() != Some("127.0.0.1")
            || !redirect_uri.username().is_empty()
            || redirect_uri.password().is_some()
            || redirect_uri.query().is_some()
            || redirect_uri.fragment().is_some()
        {
            return None;
        }
        Some(Self {
            issuer,
            client_id: client_id.into(),
            redirect_uri,
        })
    }
}

pub fn remote_url(text: &str) -> Result<Url> {
    let url = Url::parse(text).map_err(|_| Error::Unconfigured)?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(Error::Unconfigured);
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_bridge_requires_complete_public_configuration_and_distinct_origin() {
        let mut config = BuildConfig::load();
        config.supabase = Some(remote_url("https://data.example.invalid/").expect("URL"));
        config.anon_key = Some("public-fixture");
        let endpoint = Some("https://api.example.invalid/v1/native-account/authorize");
        let bridge = config.data_bridge_url(endpoint).expect("puente completo");
        assert_eq!(bridge.authorize.path(), "/v1/native-account/authorize");
        assert_eq!(bridge.anon_key, "public-fixture");
        for url in [
            None,
            Some("http://api.example.invalid"),
            Some("https://data.example.invalid/authorize"),
        ] {
            assert!(config.data_bridge_url(url).is_none());
        }
        config.anon_key = Some(" ");
        assert!(config.data_bridge_url(endpoint).is_none());
        config.anon_key = None;
        assert!(config.data_bridge_url(endpoint).is_none());
        config.anon_key = Some("public-fixture");
        config.supabase = None;
        assert!(config.data_bridge_url(endpoint).is_none());
    }

    #[test]
    fn configuration_rejects_secret_bearing_or_insecure_urls() {
        for text in [
            "http://example.invalid",
            "https://u:p@example.invalid",
            "https://example.invalid/?key=x",
            "https://example.invalid/#x",
        ] {
            assert_eq!(remote_url(text), Err(Error::Unconfigured));
        }
        assert!(remote_url("https://example.invalid").is_ok());
    }

    #[test]
    fn native_oauth_requires_all_three_public_build_values() {
        let issuer = "https://example.invalid";
        let client_id = "public-native-client";
        let redirect = "http://127.0.0.1:47813/callback";
        for present in 0..7 {
            assert!(
                OAuthBuild::from_build_values(
                    (present & 1 != 0).then_some(issuer),
                    (present & 2 != 0).then_some(client_id),
                    (present & 4 != 0).then_some(redirect),
                )
                .is_none()
            );
        }
        let config = OAuthBuild::from_build_values(Some(issuer), Some(client_id), Some(redirect))
            .expect("configuración pública completa");
        assert_eq!(config.issuer.as_str(), "https://example.invalid/");
        assert_eq!(config.client_id, client_id);
        assert_eq!(config.redirect_uri.as_str(), redirect);
    }

    #[test]
    fn native_oauth_rejects_invalid_public_build_values() {
        let issuer = Some("https://example.invalid");
        let client_id = Some("public-native-client");
        let redirect = Some("http://127.0.0.1:47813/callback");
        for invalid in ["", "http://example.invalid", "https://u:p@example.invalid"] {
            assert!(OAuthBuild::from_build_values(Some(invalid), client_id, redirect).is_none());
        }
        for invalid in ["", " ", &"x".repeat(257)] {
            assert!(OAuthBuild::from_build_values(issuer, Some(invalid), redirect).is_none());
        }
        for invalid in [
            "",
            "https://127.0.0.1:47813/callback",
            "http://localhost:47813/callback",
            "http://example.invalid/callback",
            "http://u:p@127.0.0.1:47813/callback",
            "http://127.0.0.1:47813/callback?key=x",
            "http://127.0.0.1:47813/callback#x",
        ] {
            assert!(OAuthBuild::from_build_values(issuer, client_id, Some(invalid)).is_none());
        }
    }
}
