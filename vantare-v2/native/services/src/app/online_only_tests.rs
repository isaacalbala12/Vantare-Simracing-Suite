//! Paso 8: la emisión vive solo en la pila HTTP, nunca en disco.
use super::tests::{CoreStep, core_fixture};
use super::*;

#[test]
fn lost_ack_is_transient_and_next_attempt_issues_once_even_after_restart() {
    for restart in [false, true] {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let response =
            serde_json::json!({"credential":credential,"online_capabilities":[]}).to_string();
        let server = crate::test_http::Server::start_observed(vec![
            (200, response.clone()),
            (200, response),
        ]);
        let (root, store) = crate::test_store("online-only-ack");
        let config = || BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: None,
        };
        let account = crate::account::fixture(&server.base, &store);
        let mut app = App::with_clock(config(), root.clone(), || Ok(100));
        app.account = Some(account);
        app.store = Some(store);
        let (link, core) = core_fixture(
            device,
            keys,
            vec![CoreStep::DisconnectInstallOnline, CoreStep::InstallOnline],
        );
        app.attach_core(link.clone());
        assert!(matches!(
            app.handle(Command::LicenseRenewAutomatic),
            Reply::LicenseFailure {
                outcome: crate::protocol::RenewalOutcome::Transient,
                ..
            }
        ));
        let first = server.requests.recv().expect("first issuance");
        assert!(first.starts_with("POST /functions/v1/native-license "));
        assert!(
            server.requests.try_recv().is_err(),
            "no retry on the failing stack"
        );
        assert_no_saved_license(&app);
        if restart {
            let account = app.account.take();
            let store = app.store.take();
            drop(app);
            app = App::with_clock(config(), root.clone(), || Ok(160));
            app.account = account;
            app.store = store;
            app.attach_core(link);
        }
        assert!(matches!(
            app.handle(Command::LicenseRenewAutomatic),
            Reply::License { .. }
        ));
        core.join()
            .expect("two fresh online installs, never disk Install or Invalidate");
        assert_eq!(
            server.finish_observed().len(),
            1,
            "exactly one further HTTP emission"
        );
        assert_no_saved_license(&app);
        drop(app);
        crate::cleanup_store(&root, "online-only-ack", &[]);
    }
}

fn assert_no_saved_license(app: &App) {
    for name in ["license-candidate", "license-transfer-pending"] {
        assert!(
            matches!(
                app.legacy_store()
                    .expect("fixture store")
                    .fixture::<serde_json::Value>(name),
                Err(Error::NotFound)
            ),
            "services never writes {name}"
        );
    }
}

#[test]
fn old_other_account_candidate_and_marker_are_retired_even_when_unreadable() {
    for corrupt in [false, true] {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture_identity(
            &device,
            "test",
            "550e8400-e29b-41d4-a716-446655440001",
        );
        let (root, store) = crate::test_store("retired-other-account");
        let server = crate::test_http::Server::start_observed(vec![(503, "{}".into())]);
        let config = || BuildConfig {
            supabase: Some(server.base.clone()),
            anon_key: Some("public-test"),
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: None,
        };
        let context =
            crate::license_remote::tests::legacy_context(Some(server.base.as_str()), Some("test"));
        let namespace = legacy_namespace(&root, &context);
        let legacy = Store::open(&root, &context).expect("old fixture store");
        legacy
            .save(
                "license-candidate",
                &crate::license_remote::tests::LegacyCandidate {
                    account_id: credential.claims.subject.clone(),
                    device: device.clone(),
                    credential,
                },
            )
            .expect("old B");
        legacy
            .save("license-transfer-pending", &true)
            .expect("old marker");
        if corrupt {
            for name in ["license-candidate", "license-transfer-pending"] {
                std::fs::write(namespace.join(format!("{name}.dpapi")), b"broken fixture")
                    .expect("old damaged bytes");
            }
        }
        let before = ["license-candidate", "license-transfer-pending"].map(|name| {
            std::fs::read(namespace.join(format!("{name}.dpapi"))).expect("fixture bytes")
        });
        drop(legacy);
        let mut app = App::with_clock(config(), root.clone(), || Ok(100));
        app.account = Some(crate::account::fixture(&server.base, &store));
        app.store = Some(store);
        assert_no_saved_license(&app);
        let archived = archives(&namespace);
        assert_eq!(
            archived.len(),
            2,
            "each old document retired once without parsing"
        );
        assert_retired_bytes(&archived, &before);
        let (link, core) = core_fixture(device, keys, vec![CoreStep::Read, CoreStep::Read]);
        app.attach_core(link);
        assert!(
            matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if !policy.state.permits_access())
        );
        assert!(
            matches!(
                app.handle(Command::LicenseRenewAutomatic),
                Reply::LicenseFailure {
                    outcome: crate::protocol::RenewalOutcome::Transient,
                    ..
                }
            ),
            "old B cannot substitute a failed HTTP response"
        );
        assert!(
            matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if !policy.state.permits_access())
        );
        core.join()
            .expect("only reads, never Install or Invalidate");
        drop(app);
        drop(App::with_clock(config(), root.clone(), || Ok(160)));
        assert_eq!(
            server.finish_observed().len(),
            1,
            "one failed issuance, never a disk handoff"
        );
        assert_eq!(
            archives(&namespace),
            archived,
            "later startups do not create more archives"
        );
        crate::cleanup_store(&root, "retired-other-account", &[]);
    }
}

fn legacy_namespace(root: &std::path::Path, context: &str) -> PathBuf {
    use sha2::{Digest, Sha256};
    root.join(format!("{:x}", Sha256::digest(context.as_bytes())))
}
fn archives(namespace: &std::path::Path) -> Vec<PathBuf> {
    let mut paths: Vec<_> = std::fs::read_dir(namespace)
        .expect("fixture namespace")
        .map(|e| e.expect("entry").path())
        .filter(|p| p.extension().is_some_and(|e| e == "corrupto"))
        .collect();
    paths.sort();
    paths
}

#[test]
fn startup_retirement_is_best_effort_and_retries_after_a_locked_rename() {
    use std::os::windows::fs::OpenOptionsExt;
    let (root, _) = crate::test_store("retirement-locked");
    let context = crate::license_remote::tests::legacy_context(None, None);
    let namespace = legacy_namespace(&root, &context);
    let legacy = Store::open(&root, &context).expect("fixture store");
    legacy.save("license-candidate", &true).expect("old bytes");
    legacy
        .save("license-transfer-pending", &true)
        .expect("old marker");
    drop(legacy);
    let path = namespace.join("license-candidate.dpapi");
    let before = std::fs::read(&path).expect("own bytes");
    let locked = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .expect("deny delete");
    let config = || BuildConfig {
        supabase: None,
        anon_key: None,
        license_keys: None,
        channel: None,
        native_oauth: None,
    };
    let mut app = App::with_clock(config(), root.clone(), || Err(Error::Clock));
    assert_eq!(std::fs::read(&path).expect("locked bytes remain"), before);
    assert_eq!(
        archives(&namespace).len(),
        1,
        "marker still retires independently"
    );
    let (device, keys) = crate::license_remote::tests::signed_fixture("unused-device");
    let (link, core) = core_fixture(device.claims.device_fingerprint, keys, vec![CoreStep::Read]);
    app.attach_core(link);
    assert!(
        matches!(app.execute(Command::LicenseStatus), Ok(Reply::License { policy, .. }) if !policy.state.permits_access())
    );
    core.join()
        .expect("retirement failure cannot block recovery or install rights");
    drop(app);
    drop(locked);
    drop(App::with_clock(config(), root.clone(), || Ok(100)));
    assert!(!path.exists());
    assert_eq!(archives(&namespace).len(), 2);
    let candidate = archives(&namespace)
        .into_iter()
        .find(|p| {
            p.file_name()
                .expect("name")
                .to_string_lossy()
                .starts_with("license-candidate-")
        })
        .expect("preserved candidate");
    assert_eq!(std::fs::read(candidate).expect("archive bytes"), before);
    crate::cleanup_store(&root, "retirement-locked", &[]);
}

fn assert_retired_bytes(archived: &[PathBuf], before: &[Vec<u8>; 2]) {
    for (index, name) in ["license-candidate", "license-transfer-pending"]
        .iter()
        .enumerate()
    {
        let file = archived
            .iter()
            .find(|p| {
                p.file_name()
                    .expect("name")
                    .to_string_lossy()
                    .starts_with(name)
            })
            .expect("archive");
        assert_eq!(std::fs::read(file).expect("preserved bytes"), before[index]);
    }
}
