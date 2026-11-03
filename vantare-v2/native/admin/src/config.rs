//! Public, compiled admin identity. Disabled configuration keeps the Hub path.
use vantare_services::{
    Error, Result,
    config::{BuildConfig, OAuthBuild},
};

pub struct Config {
    pub build: BuildConfig,
    pub context: String,
    pub legacy: Option<(String, OAuthBuild)>,
}

pub fn load() -> Result<Config> {
    configure(
        BuildConfig::load(),
        option_env!("VANTARE_ADMIN_AUTH_ENABLED") == Some("true"),
        option_env!("VANTARE_ADMIN_CLERK_CLIENT_ID"),
        option_env!("VANTARE_ADMIN_CLERK_REDIRECT"),
    )
}

fn context(build: &BuildConfig, prefix: &str) -> Result<String> {
    let oauth = build.native_oauth.as_ref().ok_or(Error::Unconfigured)?;
    Ok(format!(
        "{prefix}|{}|{}|{}|{}",
        oauth.issuer,
        oauth.client_id,
        build.channel.unwrap_or("unknown"),
        build.supabase.as_ref().map_or("", url::Url::as_str)
    ))
}

fn configure(
    mut build: BuildConfig,
    enabled: bool,
    client: Option<&str>,
    redirect: Option<&str>,
) -> Result<Config> {
    let old_context = context(&build, "v1")?;
    if !enabled {
        return Ok(Config {
            build,
            context: old_context,
            legacy: None,
        });
    }
    let hub = build.native_oauth.take().ok_or(Error::Unconfigured)?;
    let admin = OAuthBuild::from_build_values(Some(hub.issuer.as_str()), client, redirect)
        .ok_or(Error::Unconfigured)?;
    if admin.client_id == hub.client_id
        || admin.client_id.chars().any(char::is_whitespace)
        || admin.redirect_uri == hub.redirect_uri
        || (admin.redirect_uri.port() != Some(0)
            && admin.redirect_uri.port_or_known_default()
                == hub.redirect_uri.port_or_known_default())
    {
        return Err(Error::Unconfigured);
    }
    build.native_oauth = Some(admin);
    let current_context = context(&build, "admin-v2")?;
    Ok(Config {
        build,
        context: current_context,
        legacy: Some((old_context, hub)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn hub() -> BuildConfig {
        BuildConfig {
            supabase: Some(url::Url::parse("https://data.fixture.invalid/").expect("URL")),
            anon_key: None,
            license_keys: None,
            channel: Some("nightly"),
            native_oauth: Some(OAuthBuild {
                issuer: url::Url::parse("https://clerk.fixture.invalid/").expect("issuer"),
                client_id: "hub-fixture".into(),
                redirect_uri: url::Url::parse("http://127.0.0.1:47813/callback").expect("redirect"),
            }),
        }
    }
    #[test]
    fn disabled_admin_keeps_exact_hub_client_redirect_and_store() {
        let expected = context(&hub(), "v1").expect("context");
        for values in [(None, None), (Some("admin-fixture"), Some("invalid"))] {
            let config = configure(hub(), false, values.0, values.1).expect("inactive");
            let oauth = config.build.native_oauth.expect("Hub");
            assert_eq!(oauth.client_id, "hub-fixture");
            assert_eq!(
                oauth.redirect_uri.as_str(),
                "http://127.0.0.1:47813/callback"
            );
            assert_eq!(config.context, expected);
            assert!(config.legacy.is_none());
        }
    }
    #[test]
    fn enabled_admin_requires_distinct_client_and_callback_socket() {
        for (client, redirect) in [
            (None, Some("http://127.0.0.1:47814/admin")),
            (Some("admin-fixture"), None),
            (Some("hub-fixture"), Some("http://127.0.0.1:47814/admin")),
            (Some("admin-fixture"), Some("http://127.0.0.1:47813/other")),
            (
                Some("admin-fixture"),
                Some("https://foreign.invalid/callback"),
            ),
        ] {
            assert!(matches!(
                configure(hub(), true, client, redirect),
                Err(Error::Unconfigured)
            ));
        }
        let config = configure(
            hub(),
            true,
            Some("admin-fixture"),
            Some("http://127.0.0.1:47814/admin"),
        )
        .expect("admin");
        assert_eq!(
            config.build.native_oauth.expect("OAuth").client_id,
            "admin-fixture"
        );
        let (previous, hub) = config.legacy.expect("legacy binding");
        assert_ne!(previous, config.context);
        assert!(previous.starts_with("v1|"));
        assert!(config.context.starts_with("admin-v2|"));
        assert_eq!(hub.client_id, "hub-fixture");
    }
}
