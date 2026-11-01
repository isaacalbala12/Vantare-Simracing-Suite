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
        assert_no_saved_license(&mut app);
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
        assert_no_saved_license(&mut app);
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
                    .load::<serde_json::Value>(name),
                Err(Error::NotFound)
            ),
            "services never writes {name}"
        );
    }
}

#[test]
fn old_other_account_candidate_and_marker_are_ignored_even_when_unreadable() {
    for corrupt in [false, true] {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture_identity(
            &device,
            "test",
            "550e8400-e29b-41d4-a716-446655440001",
        );
        let (root, store) = crate::test_store("ignored-other-account");
        let server = crate::test_http::Server::start_observed(vec![(503, "{}".into())]);
        let mut app = App::with_clock(
            BuildConfig {
                supabase: Some(server.base.clone()),
                anon_key: Some("public-test"),
                license_keys: Some(keys),
                channel: Some("test"),
                native_oauth: None,
            },
            root.clone(),
            || Ok(100),
        );
        app.account = Some(crate::account::fixture(&server.base, &store));
        app.store = Some(store);
        let legacy = app.legacy_store().expect("fixture store");
        legacy
            .save(
                "license-candidate",
                &crate::license_remote::tests::LegacyCandidate {
                    account_id: credential.claims.subject.clone(),
                    device: device.clone(),
                    credential,
                },
            )
            .expect("old file");
        legacy
            .save("license-transfer-pending", &true)
            .expect("old hint");
        if corrupt {
            let context = crate::license_remote::tests::legacy_context(
                Some(server.base.as_str()),
                Some("test"),
            );
            for name in ["license-candidate", "license-transfer-pending"] {
                std::fs::write(
                    root.join(format!(
                        "{:x}",
                        <sha2::Sha256 as sha2::Digest>::digest(context.as_bytes())
                    ))
                    .join(format!("{name}.dpapi")),
                    b"broken fixture",
                )
                .expect("corrupt old fixture");
            }
        }
        let (link, core) = core_fixture(device, keys, vec![CoreStep::Read, CoreStep::Read]);
        app.attach_core(link);
        assert!(matches!(
            app.execute(Command::AccountPoll),
            Ok(Reply::Account {
                session: Session::SignedIn,
                ..
            })
        ));
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
            .expect("only core reads: B cannot become first binding of A");
        let requests = server.finish_observed();
        assert_eq!(
            requests.len(),
            1,
            "one failed HTTP attempt, never a disk handoff"
        );
        assert!(requests[0].starts_with("POST /functions/v1/native-license "));
        drop(app);
        crate::cleanup_store(&root, "ignored-other-account", &[]);
    }
}
