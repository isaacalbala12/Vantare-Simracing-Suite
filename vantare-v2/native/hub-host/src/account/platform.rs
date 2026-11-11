//! Closed destinations resolved in Rust. No URL is an argument on the UI wire.
use crate::protocol::HostError;
fn portal_for_build(issuer: Option<&str>, configured: Option<&str>) -> Option<String> {
    let mut url = vantare_services::config::account_portal_origin(issuer, configured)?;
    url.set_path("/user");
    Some(url.into())
}
pub fn portal() -> Option<String> {
    portal_for_build(
        option_env!("VANTARE_CLERK_ISSUER"),
        option_env!("VANTARE_CLERK_ACCOUNT_PORTAL_URL"),
    )
}
pub(super) fn normalized(raw: &str, hosts: &[&str]) -> Option<String> {
    if raw.len() > 16 * 1024
        || !raw
            .get(..8)
            .is_some_and(|prefix| prefix.eq_ignore_ascii_case("https://"))
        || raw.chars().any(char::is_control)
        || raw.contains(['#', '\\'])
    {
        return None;
    }
    let base = vantare_services::config::remote_url(raw.split('?').next()?).ok()?;
    let url = base.join(raw).ok()?;
    (url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.as_str().len() <= 16 * 1024
        && url.host_str().is_some_and(|host| hosts.contains(&host)))
    .then(|| url.as_str().to_owned())
}
#[cfg(test)]
fn allowed(raw: &str, hosts: &[&str]) -> bool {
    normalized(raw, hosts).is_some()
}
pub fn checkout_allowed(raw: &str) -> bool {
    // Exact authorities from services/billing.rs::checkout_url.
    normalized(raw, &["polar.sh", "sandbox.polar.sh"]).is_some_and(|value| {
        vantare_services::config::remote_url(value.split('?').next().unwrap_or(&value))
            .is_ok_and(|url| url.path().starts_with("/checkout/"))
    })
}
fn open_when_allowed(
    raw: &str,
    hosts: &[&str],
    open: impl FnOnce(&str) -> Result<(), HostError>,
) -> Result<(), HostError> {
    let normalized = normalized(raw, hosts).ok_or(HostError::Denied)?;
    // Hub-host QA is deliberately independent from services/qa-e2e (which enables HTTP).
    #[cfg(feature = "qa-e2e")]
    {
        let _ = (open, normalized);
        Ok(())
    }
    #[cfg(not(feature = "qa-e2e"))]
    open(&normalized)
}
fn browser(raw: &str) -> Result<(), HostError> {
    let base = vantare_services::config::remote_url(raw.split('?').next().unwrap_or(raw))
        .map_err(|_| HostError::Denied)?;
    let url = base.join(raw).map_err(|_| HostError::Denied)?;
    vantare_services::browser::open(&url).map_err(|_| HostError::Io)
}
pub fn open_checkout(raw: &str) -> Result<(), HostError> {
    if !checkout_allowed(raw) {
        return Err(HostError::Denied);
    }
    open_when_allowed(raw, &["polar.sh", "sandbox.polar.sh"], browser)
}
pub fn open_portal() -> Result<(), HostError> {
    let raw = portal().ok_or(HostError::Unsupported)?;
    let origin = vantare_services::config::account_portal_origin(
        option_env!("VANTARE_CLERK_ISSUER"),
        option_env!("VANTARE_CLERK_ACCOUNT_PORTAL_URL"),
    )
    .ok_or(HostError::Unsupported)?;
    let host = origin.host_str().ok_or(HostError::Denied)?;
    open_when_allowed(&raw, &[host], browser)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_the_closed_https_authorities_can_reach_a_browser() {
        for value in [
            "https://polar.sh/checkout/one",
            "https://sandbox.polar.sh/checkout/one",
            "https://polar.sh/checkout/one?checkout_id=qa&redirect=true",
        ] {
            assert!(checkout_allowed(value));
        }
        for value in [
            "file:///C:/Windows/notepad.exe",
            "javascript:alert(1)",
            r"\\server\share",
            "ms-settings:privacy",
            "search-ms:query=test",
            "steam:run/1",
            "http://polar.sh/one",
            "https://polar.sh.evil.invalid/one",
            "https://user:password@polar.sh/one",
            "https://polar.sh:8443/one",
            "https://evil.invalid/one",
            "https://polar.sh/user?checkout_id=qa",
            "https://polar.sh/checkout/../user?checkout_id=qa",
            "https://polar.sh/\n",
        ] {
            assert!(!checkout_allowed(value));
        }
    }
    #[test]
    fn browser_destinations_are_canonical_and_reject_backslashes_fragments_and_host_lookalikes() {
        assert_eq!(
            normalized("HTTPS://POLAR.SH:443/checkout/qa?state=qa", &["polar.sh"]).as_deref(),
            Some("https://polar.sh/checkout/qa?state=qa")
        );
        assert!(checkout_allowed(
            "HTTPS://POLAR.SH:443/checkout/qa?state=qa"
        ));
        for raw in [
            r"https://polar.sh\@evil.invalid/checkout/qa",
            "https://polar.sh/checkout/qa#fragment",
            "https://polar.sh./checkout/qa",
            "https://pоlar.sh/checkout/qa",
        ] {
            assert!(!checkout_allowed(raw));
        }
    }
    #[test]
    fn the_portal_host_is_resolved_from_the_build_not_the_renderer() {
        let portal = portal_for_build(
            Some("https://clerk.vantare.app"),
            Some("https://accounts.vantare.app"),
        )
        .unwrap();
        assert_eq!(portal, "https://accounts.vantare.app/user");
        assert!(allowed(&portal, &["accounts.vantare.app"]));
        for raw in [
            "file:///user",
            "javascript:alert(1)",
            r"\\server\share",
            "ms-settings:privacy",
            "https://other.invalid/user",
            "https://user:pass@accounts.vantare.app/user",
            "https://accounts.vantare.app:8443/user",
        ] {
            assert!(!allowed(raw, &["accounts.vantare.app"]));
        }
    }
    #[cfg(feature = "qa-e2e")]
    #[test]
    fn host_qa_never_invokes_the_real_browser_even_for_a_valid_destination() {
        assert_eq!(
            open_when_allowed("https://polar.sh/checkout/qa", &["polar.sh"], |_| panic!(
                "QA must never invoke an OS browser"
            )),
            Ok(())
        );
        assert_eq!(
            open_when_allowed("ms-settings:privacy", &["polar.sh"], |_| panic!(
                "invalid destination reached browser"
            )),
            Err(HostError::Denied)
        );
    }
}
