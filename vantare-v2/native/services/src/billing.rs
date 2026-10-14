use crate::{
    Error, Result,
    account::{Account, Identity},
    config::BuildConfig,
    http::Http,
    protocol::BillingProduct,
    storage::Store,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Attempt {
    id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Checkout {
    url: String,
    #[serde(rename = "reused")]
    _reused: bool,
}

fn attempt_name(identity: &Identity, product: BillingProduct, environment: &str) -> Result<String> {
    let scope = serde_json::to_vec(&(
        &identity.issuer,
        &identity.subject,
        product.key(),
        environment,
    ))
    .map_err(|_| Error::Protocol)?;
    let hash = Sha256::digest(scope);
    // Store names accept letters only. 128 bits keep account/product/environment isolated.
    let suffix: String = hash[..16]
        .iter()
        .flat_map(|byte| {
            [
                char::from(b'a' + (byte >> 4)),
                char::from(b'a' + (byte & 15)),
            ]
        })
        .collect();
    Ok(format!("buy-{suffix}"))
}
fn attempt(
    store: &Store,
    identity: &Identity,
    product: BillingProduct,
    environment: &str,
) -> Result<Attempt> {
    let name = attempt_name(identity, product, environment)?;
    match store.load::<Attempt>(&name) {
        Ok(value) if crate::license::uuid(&value.id) => Ok(value),
        Err(Error::NotFound) => {
            let hex = crate::random_id()?;
            let value = Attempt {
                id: format!(
                    "{}-{}-{}-{}-{}",
                    &hex[..8],
                    &hex[8..12],
                    &hex[12..16],
                    &hex[16..20],
                    &hex[20..32]
                ),
            };
            store.save(&name, &value)?;
            Ok(value)
        }
        // Conservar evidencia y la barrera de idempotencia hasta recuperación explícita.
        _ => Err(Error::CheckoutRecovery),
    }
}

pub fn checkout_url(raw: &str, environment: &str) -> Result<String> {
    let expected = match environment {
        "sandbox" => "sandbox.polar.sh",
        "production" => "polar.sh",
        _ => return Err(Error::Unconfigured),
    };
    let url = url::Url::parse(raw).map_err(|_| Error::Protocol)?;
    if url.scheme() != "https"
        || url.host_str() != Some(expected)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(Error::Protocol);
    }
    Ok(url.into())
}

pub fn purchase(
    http: &Http,
    config: &BuildConfig,
    account: &Account,
    now: u64,
    store: &Store,
    product: BillingProduct,
    environment: &str,
) -> Result<String> {
    if !matches!(environment, "sandbox" | "production") {
        return Err(Error::Unconfigured);
    }
    let endpoint = config
        .supabase
        .as_ref()
        .ok_or(Error::Unconfigured)?
        .join("functions/v1/native-billing-checkout")
        .map_err(|_| Error::Unconfigured)?;
    let identity = account.identity().ok_or(Error::Authentication)?;
    let attempt = attempt(store, identity, product, environment)?; // Durable before network; never recreate after an unknown result.
    let response = account.authorized(now, |bearer| {
        http.post_json(
            &endpoint,
            &serde_json::json!({"productKey":product.key(),"attemptId":attempt.id}),
            Some(bearer),
            config.anon_key,
        )
    })?;
    if response.status == 409 {
        #[derive(Deserialize)]
        struct Rejected {
            error: String,
        }
        if response
            .json::<Rejected>()
            .is_ok_and(|value| value.error == "checkout_attempt_expired")
        {
            store.remove(&attempt_name(identity, product, environment)?)?;
        }
    }
    let checkout: Checkout = response.success()?.json()?;
    checkout_url(&checkout.url, environment)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn regression_1542_corrupt_checkout_preserves_attempt_and_offers_recovery() {
        let (root, store) = crate::test_store("billing-corrupt");
        let identity = Identity {
            issuer: "https://clerk.example".into(),
            subject: "user_fixture".into(),
        };
        let name = attempt_name(&identity, BillingProduct::ProMonthly, "sandbox").expect("name");
        for value in [
            serde_json::json!({"id":"invalid-uuid"}),
            serde_json::json!({"bad":"schema"}),
        ] {
            store.save(&name, &value).expect("corrupt fixture");
            for _ in 0..2 {
                let error = attempt(&store, &identity, BillingProduct::ProMonthly, "sandbox")
                    .err()
                    .expect("blocked");
                assert_eq!(
                    store.load::<serde_json::Value>(&name).expect("preserved"),
                    value
                );
                assert!(
                    error.to_string().contains("recuperación"),
                    "explicit recovery required: {error}"
                );
            }
        }
        drop(store);
        crate::cleanup_store(&root, "billing-corrupt", &[]);
    }
    #[test]
    fn regression_1542_unreadable_checkout_keeps_bytes_and_never_sends_http() {
        let server = crate::test_http::Server::start(vec![]);
        let (root, store) = crate::test_store("billing-unreadable");
        let account = crate::account::fixture(&server.base, &store);
        let name = attempt_name(
            account.identity().expect("identity"),
            BillingProduct::ProMonthly,
            "sandbox",
        )
        .expect("name");
        let namespace = std::fs::read_dir(&root)
            .expect("root")
            .next()
            .expect("namespace")
            .expect("entry")
            .path();
        let path = namespace.join(format!(
            "{name}.{}",
            if cfg!(windows) { "dpapi" } else { "json" }
        ));
        std::fs::write(&path, b"not-readable-json-or-dpapi").expect("bad bytes QA");
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-fixture"),
            license_keys: None,
            channel: None,
            native_oauth: None,
        };
        let error = purchase(
            &Http::default(),
            &config,
            &account,
            100,
            &store,
            BillingProduct::ProMonthly,
            "sandbox",
        )
        .expect_err("blocked");
        assert_eq!(
            std::fs::read(&path).expect("preserved"),
            b"not-readable-json-or-dpapi"
        );
        assert!(server.requests.try_recv().is_err());
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "billing-unreadable", &[]);
        assert!(
            error.to_string().contains("recuperación"),
            "explicit recovery required: {error}"
        );
    }

    #[cfg(windows)]
    #[test]
    fn checkout_read_lock_offers_recovery_and_reuses_uuid_after_unlock() {
        use std::os::windows::fs::OpenOptionsExt;
        let server = crate::test_http::Server::start(vec![]);
        let (root, store) = crate::test_store("billing-io-lock");
        let account = crate::account::fixture(&server.base, &store);
        let identity = account.identity().expect("identity");
        let original =
            attempt(&store, identity, BillingProduct::ProMonthly, "sandbox").expect("attempt");
        let name = attempt_name(identity, BillingProduct::ProMonthly, "sandbox").expect("name");
        let namespace = std::fs::read_dir(&root)
            .expect("root")
            .next()
            .expect("namespace")
            .expect("entry")
            .path();
        let path = namespace.join(format!("{name}.dpapi"));
        let bytes = std::fs::read(&path).expect("protected fixture");
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .expect("read lock");
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: None,
            license_keys: None,
            channel: None,
            native_oauth: None,
        };
        assert_eq!(
            purchase(
                &Http::default(),
                &config,
                &account,
                100,
                &store,
                BillingProduct::ProMonthly,
                "sandbox"
            ),
            Err(Error::CheckoutRecovery)
        );
        assert!(server.requests.try_recv().is_err());
        drop(lock);
        assert!(std::fs::read(&path).expect("preserved") == bytes);
        assert_eq!(
            attempt(&store, identity, BillingProduct::ProMonthly, "sandbox")
                .expect("unlocked retry")
                .id,
            original.id
        );
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "billing-io-lock", &[]);
    }
    #[test]
    fn attempt_survives_retry_and_uses_only_the_selected_product() {
        let (root, store) = crate::test_store("billing-attempt");
        let identity = Identity {
            issuer: "https://clerk.example".into(),
            subject: "user_one".into(),
        };
        let first =
            attempt(&store, &identity, BillingProduct::ProMonthly, "sandbox").expect("persist");
        assert!(crate::license::uuid(&first.id));
        assert_eq!(
            first.id,
            attempt(&store, &identity, BillingProduct::ProMonthly, "sandbox")
                .expect("retry")
                .id
        );
        assert_ne!(
            first.id,
            attempt(&store, &identity, BillingProduct::ProAnnual, "sandbox")
                .expect("annual")
                .id
        );
        let other = Identity {
            subject: "user_two".into(),
            ..identity.clone()
        };
        assert_ne!(
            first.id,
            attempt(&store, &other, BillingProduct::ProMonthly, "sandbox")
                .expect("other account")
                .id
        );
        assert_ne!(
            first.id,
            attempt(&store, &identity, BillingProduct::ProMonthly, "production")
                .expect("other environment")
                .id
        );
        drop(store);
        crate::cleanup_store(&root, "billing-attempt", &[]);
    }
    #[test]
    fn uncertain_http_result_reuses_attempt_and_sends_native_oauth() {
        let server = crate::test_http::Server::start(vec![
            (409, r#"{"error":"checkout_state_uncertain"}"#.into()),
            (
                200,
                r#"{"url":"https://sandbox.polar.sh/checkout/one","reused":true}"#.into(),
            ),
        ]);
        let (root, store) = crate::test_store("billing-http");
        let account = crate::account::fixture(&server.base, &store);
        let config = BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-fixture"),
            license_keys: None,
            channel: None,
            native_oauth: None,
        };
        let http = Http::default();
        assert!(matches!(
            purchase(
                &http,
                &config,
                &account,
                100,
                &store,
                BillingProduct::ProMonthly,
                "sandbox"
            ),
            Err(Error::Conflict)
        ));
        // Simula reinicio entre el resultado incierto y el reintento: sin Store
        // ni Account residentes, solo el estado durable del mismo root QA.
        drop(account);
        drop(store);
        let store = Store::open(&root, "billing-http").expect("reabrir intento durable");
        let account = crate::account::fixture(&server.base, &store);
        assert_eq!(
            purchase(
                &http,
                &config,
                &account,
                100,
                &store,
                BillingProduct::ProMonthly,
                "sandbox"
            )
            .expect("retry"),
            "https://sandbox.polar.sh/checkout/one"
        );
        let first = server.requests.recv().expect("first");
        let second = server.requests.recv().expect("second");
        assert!(first.starts_with("POST /functions/v1/native-billing-checkout "));
        assert!(first.to_lowercase().contains("authorization: bearer "));
        assert_eq!(
            first.split("\r\n\r\n").nth(1),
            second.split("\r\n\r\n").nth(1)
        );
        server.finish();
        drop(store);
        crate::cleanup_store(&root, "billing-http", &[]);
    }
    #[test]
    fn checkout_cannot_open_another_environment_or_authority() {
        assert!(checkout_url("https://sandbox.polar.sh/checkout/one", "sandbox").is_ok());
        for url in [
            "https://polar.sh/checkout/one",
            "https://sandbox.polar.sh.evil.invalid/one",
            "https://name:pass@sandbox.polar.sh/one",
            "http://sandbox.polar.sh/one",
        ] {
            assert!(checkout_url(url, "sandbox").is_err());
        }
    }
}
