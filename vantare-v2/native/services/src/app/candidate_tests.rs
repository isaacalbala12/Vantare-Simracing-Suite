//! Real signatures and RPC framing; all stores/accounts/HTTP responses are fixtures.
use super::tests::{CoreStep, core_fixture};
use super::{App, BuildConfig, Command, Error, Reply, Store};
use crate::license::CredentialV1;
use crate::license_remote::Candidate;
use crate::test_http::Server;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

const CONTEXT: &str = "candidate-admission-fixture";
const SUBJECT_A: &str = "550e8400-e29b-41d4-a716-446655440000";
const SUBJECT_B: &str = "550e8400-e29b-41d4-a716-446655440001";

fn configured_app(root: PathBuf, store: Store, server: &Server, keys: &'static str) -> App {
    let account = crate::account::fixture(&server.base, &store);
    let mut app = App::new(
        BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test-key"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: None,
        },
        root,
    );
    app.account = Some(account);
    app.store = Some(store);
    app
}

fn fixture(server: &Server, keys: &'static str) -> (PathBuf, App) {
    let (root, store) = crate::test_store(CONTEXT);
    let app = configured_app(root.clone(), store, server, keys);
    (root, app)
}

fn renewal_server(credential: &CredentialV1) -> Server {
    Server::start(vec![
        (200, serde_json::json!({"access_token":"fixture-access","refresh_token":"fixture-refresh","token_type":"Bearer","expires_in":3600}).to_string()),
        (200, serde_json::json!({"sub":"user_fixture"}).to_string()),
        (200, serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string()),
    ])
}

fn namespace(root: &Path, app: &App) -> PathBuf {
    let context = crate::license_remote::candidate_context(
        app.config.supabase.as_ref().map(url::Url::as_str),
        app.config.channel,
    );
    root.join(format!("{:x}", Sha256::digest(context.as_bytes())))
}

fn save_candidate(app: &mut App, credential: CredentialV1, pending: bool) {
    let candidate = Candidate {
        account_id: credential.claims.subject.clone(),
        device: credential.claims.device_fingerprint.clone(),
        credential,
    };
    app.candidate_store()
        .expect("store")
        .save("license-candidate", &candidate)
        .expect("candidate");
    if pending {
        app.candidate_store()
            .expect("store")
            .save("license-transfer-pending", &true)
            .expect("hint");
    }
}

fn archives(namespace: &Path) -> Vec<Vec<u8>> {
    std::fs::read_dir(namespace)
        .expect("namespace")
        .map(|e| e.expect("entry"))
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("license-candidate-")
                && e.path().extension().is_some_and(|e| e == "corrupto")
        })
        .map(|e| std::fs::read(e.path()).expect("archive bytes"))
        .collect()
}

fn assert_quarantined(app: &mut App, namespace: &Path, before: &[u8]) {
    assert!(matches!(
        app.candidate_store()
            .expect("store")
            .load_cache::<Candidate>("license-candidate"),
        Err(Error::NotFound)
    ));
    assert!(!app.pending_renewal_transfer().expect("hint retired"));
    assert!(
        !app.recovered_renewal_transfer,
        "Read is not an installation ACK"
    );
    assert_eq!(archives(namespace), vec![before.to_vec()]);
}

#[test]
fn previous_device_candidate_is_preserved_before_install_and_renewal_survives_restart() {
    let device = crate::license::installation::legacy_fingerprint().expect("current device");
    let (old, old_keys) =
        crate::license_remote::tests::signed_fixture_named("previous-device", "old");
    let (fresh, fresh_keys) = crate::license_remote::tests::signed_fixture_named(&device, "fresh");
    let keys: &'static str = Box::leak(format!("{old_keys},{fresh_keys}").into_boxed_str());
    for pending in [false, true] {
        let server = renewal_server(&fresh);
        let (root, mut app) = fixture(&server, keys);
        save_candidate(&mut app, old.clone(), pending);
        let directory = namespace(&root, &app);
        let before = std::fs::read(directory.join("license-candidate.dpapi")).expect("own fixture");
        let expected = serde_json::to_string(&fresh).expect("HTTP credential");
        let (link, core) = core_fixture(
            device.clone(),
            keys,
            vec![
                CoreStep::Read,
                CoreStep::Read,
                CoreStep::InstallOnlineCredential(expected),
                CoreStep::ReadLicensed,
            ],
        );
        app.attach_core(link.clone());
        assert!(
            matches!(app.execute(Command::TransferRights), Ok(Reply::License { policy, .. }) if !policy.overlays_advanced)
        );
        assert_quarantined(&mut app, &directory, &before);
        assert!(
            server.requests.try_recv().is_err(),
            "disk never starts HTTP"
        );
        drop(app);
        let store = Store::open(&root, CONTEXT).expect("reopen fixture only");
        let mut app = configured_app(root.clone(), store, &server, keys);
        app.attach_core(link);
        assert!(
            matches!(app.execute(Command::TransferRights), Ok(Reply::License { policy, .. }) if !policy.overlays_advanced)
        );
        assert_quarantined(&mut app, &directory, &before);
        assert!(server.requests.try_recv().is_err());
        assert!(matches!(
            app.execute(Command::LicenseRenewAutomatic),
            Ok(Reply::License { .. })
        ));
        assert!(
            matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if policy.overlays_advanced)
        );
        assert_eq!(
            app.candidate_store()
                .expect("store")
                .load::<Candidate>("license-candidate")
                .expect("fresh persisted")
                .credential
                .key_id,
            "fresh"
        );
        core.join()
            .expect("disk never reaches Install/InstallOnline before HTTP");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, CONTEXT, &[]);
    }
}

#[test]
fn rejected_cache_admits_the_core_policy_without_granting_it_or_revoking_account_a() {
    let device = crate::license::installation::legacy_fingerprint().expect("current device");
    for already_verified in [false, true] {
        let subject = if already_verified {
            SUBJECT_B
        } else {
            SUBJECT_A
        };
        let (cached, cached_keys) =
            crate::license_remote::tests::signed_fixture_identity(&device, "cached", subject);
        let (fresh, fresh_keys) =
            crate::license_remote::tests::signed_fixture_named(&device, "fresh");
        let keys: &'static str = Box::leak(format!("{cached_keys},{fresh_keys}").into_boxed_str());
        let server = renewal_server(&fresh);
        let (root, mut app) = fixture(&server, keys);
        save_candidate(&mut app, cached, true);
        let directory = namespace(&root, &app);
        let before = std::fs::read(directory.join("license-candidate.dpapi")).expect("own fixture");
        let read = if already_verified {
            CoreStep::ReadLicensed
        } else {
            CoreStep::Read
        };
        let (link, core) = core_fixture(
            device.clone(),
            keys,
            vec![
                CoreStep::RejectInstall,
                read,
                CoreStep::InstallOnlineCredential(serde_json::to_string(&fresh).expect("fresh")),
                CoreStep::ReadLicensed,
            ],
        );
        app.attach_core(link);
        assert!(
            matches!(app.execute(Command::TransferRights), Ok(Reply::License { policy, .. }) if policy.overlays_advanced == already_verified && !policy.online_recovery_required)
        );
        assert_quarantined(&mut app, &directory, &before);
        assert!(server.requests.try_recv().is_err());
        assert!(matches!(
            app.execute(Command::LicenseRenewAutomatic),
            Ok(Reply::License { .. })
        ));
        assert!(
            matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if policy.overlays_advanced)
        );
        let persisted = app
            .candidate_store()
            .expect("store")
            .load::<Candidate>("license-candidate")
            .expect("fresh A");
        assert_eq!(persisted.account_id, SUBJECT_A);
        assert_eq!(persisted.credential.key_id, "fresh");
        core.join()
            .expect("no Invalidate, no cached InstallOnline, fresh HTTP proof only");
        server.finish();
        drop(app);
        crate::cleanup_store(&root, CONTEXT, &[]);
    }
}

#[test]
fn transient_cached_install_preserves_bytes_and_hint_without_replaying_http() {
    let device = crate::license::installation::legacy_fingerprint().expect("current device");
    let (cached, keys) = crate::license_remote::tests::signed_fixture_named(&device, "cached");
    let server = Server::start_observed(vec![]);
    let (root, mut app) = fixture(&server, keys);
    save_candidate(&mut app, cached, true);
    let directory = namespace(&root, &app);
    let before = std::fs::read(directory.join("license-candidate.dpapi")).expect("own fixture");
    let (link, core) = core_fixture(
        device,
        keys,
        vec![
            CoreStep::UnavailableInstall,
            CoreStep::Read,
            CoreStep::UnavailableInstall,
            CoreStep::Read,
        ],
    );
    app.attach_core(link);
    match app.execute(Command::TransferRights) {
        Err(Error::Core(vantare_ipc::control::Failure::Unavailable)) => {}
        Ok(Reply::License { policy, .. }) => assert!(!policy.overlays_advanced),
        other => panic!("uncertain cache must not grant rights: {other:?}"),
    }
    assert!(matches!(
        app.handle(Command::LicenseRenewAutomatic),
        Reply::LicenseFailure {
            outcome: crate::protocol::RenewalOutcome::Transient,
            ..
        }
    ));
    assert_eq!(
        std::fs::read(directory.join("license-candidate.dpapi")).expect("preserved"),
        before
    );
    assert!(app.pending_renewal_transfer().expect("hint retained"));
    assert!(!app.recovered_renewal_transfer);
    assert!(archives(&directory).is_empty());
    assert!(server.requests.try_recv().is_err());
    core.join()
        .expect("no HTTP/new install/invalidation after uncertain transfer");
    assert!(
        server.finish_observed().is_empty(),
        "no HTTP, including late attempts"
    );
    drop(app);
    crate::cleanup_store(&root, CONTEXT, &[]);
}

#[test]
fn definitively_rejected_online_candidate_does_not_poison_the_next_admission() {
    let device = crate::license::installation::legacy_fingerprint().expect("current device");
    let (fresh, keys) = crate::license_remote::tests::signed_fixture_named(&device, "fresh");
    let server = renewal_server(&fresh);
    let (root, mut app) = fixture(&server, keys);
    let (link, core) = core_fixture(
        device,
        keys,
        vec![
            CoreStep::RejectInstallOnline,
            CoreStep::ReadLicensed,
            CoreStep::ReadLicensed,
        ],
    );
    app.attach_core(link.clone());
    assert!(matches!(
        app.execute(Command::LicenseRenewAutomatic),
        Err(Error::Core(vantare_ipc::control::Failure::Rejected))
    ));
    assert!(
        !app.pending_renewal_transfer()
            .expect("definitive rejection retires hint")
    );
    assert!(!app.recovered_renewal_transfer);
    assert!(matches!(
        app.candidate_store()
            .expect("store")
            .load_cache::<Candidate>("license-candidate"),
        Err(Error::NotFound)
    ));
    assert_eq!(archives(&namespace(&root, &app)).len(), 1);
    drop(app);
    let mut app = configured_app(
        root.clone(),
        Store::open(&root, CONTEXT).expect("restart"),
        &server,
        keys,
    );
    app.attach_core(link);
    assert!(
        matches!(app.execute(Command::TransferRights), Ok(Reply::License { policy, .. }) if policy.overlays_advanced)
    );
    assert!(
        !app.recovered_renewal_transfer,
        "Read is not a renewed grant"
    );
    core.join().expect("existing verified A is not invalidated");
    server.finish();
    drop(app);
    crate::cleanup_store(&root, CONTEXT, &[]);
}

#[test]
fn rejected_other_account_candidate_keeps_logout_reachable() {
    let device = crate::license::installation::legacy_fingerprint().expect("current device");
    let (cached, keys) =
        crate::license_remote::tests::signed_fixture_identity(&device, "cached", SUBJECT_B);
    let server = Server::start(vec![]);
    let (root, mut app) = fixture(&server, keys);
    save_candidate(&mut app, cached, false);
    let (link, core) = core_fixture(
        device,
        keys,
        vec![
            CoreStep::RejectInstall,
            CoreStep::ReadLicensed,
            CoreStep::Invalidate,
        ],
    );
    app.attach_core(link);
    assert!(
        matches!(app.execute(Command::TransferRights), Ok(Reply::License { policy, .. }) if policy.overlays_advanced)
    );
    assert!(matches!(
        app.execute(Command::Logout),
        Ok(Reply::Account {
            signed_in: false,
            ..
        })
    ));
    assert!(
        server.requests.try_recv().is_err(),
        "logout requires no remote discovery"
    );
    core.join()
        .expect("only the explicit user logout invalidates A");
    server.finish();
    drop(app);
    crate::cleanup_store(&root, CONTEXT, &[]);
}
