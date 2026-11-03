use super::*;
use std::collections::BTreeMap;

fn blobs(root: &std::path::Path) -> BTreeMap<String, Vec<u8>> {
    let namespace = std::fs::read_dir(root)
        .expect("fixture root")
        .next()
        .expect("namespace")
        .expect("entry")
        .path();
    std::fs::read_dir(namespace)
        .expect("namespace")
        .map(|entry| entry.expect("entry"))
        .filter(|entry| entry.file_name().to_string_lossy().starts_with("account"))
        .map(|entry| {
            (
                entry.file_name().to_string_lossy().into_owned(),
                std::fs::read(entry.path()).expect("synthetic bytes"),
            )
        })
        .collect()
}

#[test]
fn r10_migration_quarantine_preserves_all_unrevoked_copies_and_durable_guards() {
    let (root, store) = crate::test_store("r10-preserve-quarantines");
    for at in 1..=5 {
        store
            .save("account", &serde_json::json!({"synthetic":at}))
            .expect("fixture");
        assert!(
            store
                .quarantine_if_present("account", at)
                .expect("quarantine")
        );
    }
    assert_eq!(blobs(&root).len(), 5);
    store
        .save("binding", &serde_json::json!({"synthetic":"guard"}))
        .expect("guard");
    assert!(matches!(store.retire_cache("binding"), Err(Error::Storage)));
    assert!(matches!(
        store.read::<serde_json::Value>("binding"),
        Ok(crate::storage::Read::Value(_))
    ));
    assert!(!store.quarantine_if_present("account", 6).expect("missing"));
    drop(store);
    crate::cleanup_store(&root, "r10-preserve-quarantines", &[]);
}

#[test]
fn r10_retirement_revokes_quarantined_refresh_before_removing_account_and_profile() {
    let server = Server::start_observed(vec![(200, String::new())]);
    let (root, store) = crate::test_store("r10-retire-success");
    let old = super::super::fixture(&server.base, &store);
    let client = old.oauth.client_id.clone();
    let refresh = old
        .session
        .as_ref()
        .expect("synthetic session")
        .refresh
        .expose()
        .to_owned();
    store
        .save(
            "account-profile",
            &serde_json::json!({"private":"synthetic profile"}),
        )
        .expect("profile");
    store
        .save("oauth-metadata", &old.oauth)
        .expect("public metadata");
    drop(old);
    store
        .quarantine_dated("account", 100)
        .expect("step 1 quarantine");
    store
        .quarantine_dated("account-profile", 100)
        .expect("profile quarantine");
    Account::retire_saved_session(&Http::default(), &store, &server.base, &client).expect("retire");
    assert!(blobs(&root).is_empty());
    assert!(matches!(
        store.read::<OAuth>("oauth-metadata"),
        Ok(crate::storage::Read::Value(_))
    ));
    let requests = server.finish_observed();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].starts_with("POST /oauth/token/revoke "));
    assert!(!requests[0].to_ascii_lowercase().contains("authorization:"));
    let fields: BTreeMap<_, _> = url::form_urlencoded::parse(
        requests[0]
            .split_once("\r\n\r\n")
            .expect("body")
            .1
            .as_bytes(),
    )
    .into_owned()
    .collect();
    assert_eq!(fields.get("token"), Some(&refresh));
    assert_eq!(
        fields.get("token_type_hint").map(String::as_str),
        Some("refresh_token")
    );
    drop(store);
    crate::cleanup_store(&root, "r10-retire-success", &[]);
}

#[test]
fn r10_failed_retirement_preserves_blob_and_profile_for_next_startup() {
    let server = Server::start_observed(vec![(503, "{}".into()), (200, String::new())]);
    let (root, store) = crate::test_store("r10-retire-retry");
    let old = super::super::fixture(&server.base, &store);
    let client = old.oauth.client_id.clone();
    drop(old);
    store
        .save(
            "account-profile",
            &serde_json::json!({"private":"synthetic profile"}),
        )
        .expect("profile");
    store.quarantine_dated("account", 100).expect("quarantine");
    let before = blobs(&root);
    assert!(matches!(
        Account::retire_saved_session(&Http::default(), &store, &server.base, &client),
        Err(Error::Offline)
    ));
    assert_eq!(blobs(&root), before);
    // A fresh startup may retry the retained document; no Account was restored.
    Account::retire_saved_session(&Http::default(), &store, &server.base, &client)
        .expect("next startup retry");
    assert!(blobs(&root).is_empty());
    assert_eq!(server.finish_observed().len(), 2);
    drop(store);
    crate::cleanup_store(&root, "r10-retire-retry", &[]);
}

#[test]
fn r10_damaged_retirement_never_calls_clerk_or_deletes_the_evidence() {
    let server = Server::start_observed(vec![]);
    let (root, store) = crate::test_store("r10-retire-damaged");
    store
        .save(
            "account",
            &serde_json::json!({"damaged":"not a saved session"}),
        )
        .expect("damaged synthetic document");
    store
        .save(
            "account-profile",
            &serde_json::json!({"private":"synthetic profile"}),
        )
        .expect("profile");
    store.quarantine_dated("account", 100).expect("quarantine");
    let before = blobs(&root);
    assert!(matches!(
        Account::retire_saved_session(&Http::default(), &store, &server.base, "public-fixture"),
        Err(Error::Storage)
    ));
    assert_eq!(blobs(&root), before);
    assert!(server.finish_observed().is_empty());
    drop(store);
    crate::cleanup_store(&root, "r10-retire-damaged", &[]);
}

#[test]
fn r10_memory_login_refresh_and_logout_never_write_account_or_profile() {
    let server = Server::start_observed(vec![
        (200,serde_json::json!({"access_token":"first-fixture","refresh_token":"first-refresh-fixture","expires_in":300,"token_type":"Bearer"}).to_string()),
        (200,"{\"sub\":\"user_fixture\"}".into()),
        (200,serde_json::json!({"access_token":"second-fixture","refresh_token":"second-refresh-fixture","expires_in":300,"token_type":"Bearer"}).to_string()),
        (200,"{\"sub\":\"user_fixture\"}".into()),
        (200,String::new()),
    ]);
    let (root, store) = crate::test_store("r10-memory-only");
    let metadata = oauth(&server);
    store.save("oauth-metadata", &metadata).expect("metadata");
    let mut account = Account::in_memory(metadata.clone()).expect("memory account");
    assert!(account.identity().is_none());
    let login = account.begin_login().expect("login");
    let (_callback, _) = callback(&login, None);
    let completion = account
        .poll_login()
        .expect("callback")
        .expect("exchange")
        .run(&Http::default(), 900)
        .expect("exchange");
    account
        .complete_in_memory(completion)
        .expect("memory login");
    assert!(blobs(&root).is_empty());
    let completion = account
        .refresh()
        .expect("refresh")
        .run(&Http::default(), 950)
        .expect("rotation");
    account
        .complete_in_memory(completion)
        .expect("memory refresh");
    assert!(
        account
            .authorized(950, |access| Ok(access == "second-fixture"))
            .expect("access")
    );
    account.revoke_refresh(&Http::default()).expect("revoke");
    account.forget_in_memory().expect("forget");
    assert!(account.identity().is_none());
    assert!(blobs(&root).is_empty());
    assert!(
        Account::in_memory(metadata)
            .expect("restart")
            .identity()
            .is_none()
    );
    let requests = server.finish_observed();
    assert_eq!(requests.len(), 5);
    assert!(requests[4].starts_with("POST /oauth/token/revoke "));
    assert!(requests[4].contains("token=second-refresh-fixture"));
    drop(store);
    crate::cleanup_store(&root, "r10-memory-only", &[]);
}

#[test]
fn r10_revocation_identifies_issuing_client_in_form() {
    let server = Server::start_observed(vec![(200, String::new())]);
    let (root, store) = crate::test_store("r10-revoke-client");
    let account = super::super::fixture(&server.base, &store);
    account.revoke_refresh(&Http::default()).expect("revoke");
    let requests = server.finish_observed();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].contains("client_id=public-fixture"));
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "r10-revoke-client", &[]);
}

#[test]
fn r10_revocation_treats_dead_tokens_as_success_but_keeps_configuration_errors() {
    for code in [
        "invalid_token",
        "invalid_grant",
        "token_expired",
        "token_revoked",
        "invalid_client",
    ] {
        let server =
            Server::start_observed(vec![(400, serde_json::json!({"error":code}).to_string())]);
        let (root, store) = crate::test_store("r10-revoke-idempotent");
        let account = super::super::fixture(&server.base, &store);
        let result = account.revoke_refresh(&Http::default());
        assert_eq!(result.is_ok(), code != "invalid_client");
        assert_eq!(server.finish_observed().len(), 1);
        drop(account);
        drop(store);
        crate::cleanup_store(&root, "r10-revoke-idempotent", &[]);
    }
}

#[test]
fn r10_retirement_never_revokes_another_clients_grant() {
    let server = Server::start_observed(vec![]);
    let (root, store) = crate::test_store("r10-grant-isolation");
    let account = super::super::fixture(&server.base, &store);
    drop(account);
    let before = blobs(&root);
    assert!(matches!(
        Account::retire_saved_session(
            &Http::default(),
            &store,
            &server.base,
            "gestion-other-fixture"
        ),
        Err(Error::Storage)
    ));
    assert_eq!(blobs(&root), before);
    assert!(server.finish_observed().is_empty());
    drop(store);
    crate::cleanup_store(&root, "r10-grant-isolation", &[]);
}
