use url::Url;

use crate::{Error, Result};

/// Solo nombres públicos existentes en build/producto. No aliases de entorno
/// runtime; OAuth nativo no se inventa a partir de una publishable key.
pub struct BuildConfig {
    pub supabase: Option<Url>,
    pub anon_key: Option<&'static str>,
    pub license_keys: Option<&'static str>,
    pub channel: Option<&'static str>,
    pub clerk_publishable_key: Option<&'static str>,
    pub native_oauth: Option<OAuthBuild>,
}

/// Configuración pública pendiente de wiring por el owner del build. No es
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
            clerk_publishable_key: option_env!("VITE_CLERK_PUBLISHABLE_KEY")
                .filter(|s| !s.is_empty()),
            native_oauth: None,
        }
    }

    pub fn public_data_configured(&self) -> bool {
        self.supabase.is_some() && self.anon_key.is_some()
    }

    /// El build actual no publica client ID/redirect/issuer OAuth nativo.
    /// El owner del build debe integrar ese contrato; no reinterpretar otra key.
    pub fn native_account_configured(&self) -> bool {
        self.native_oauth.is_some()
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
        assert!(!BuildConfig::load().native_account_configured());
    }
}
