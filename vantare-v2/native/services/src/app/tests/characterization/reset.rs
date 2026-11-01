//! Paso 5 R1: `DeviceReset` exige autorización antes de revocar; conserva el ACK previo al reset.
use super::*;
// Falla authorize, HTTP, Error; candidate no aplica desde paso 8.

#[rustfmt::skip]
const CASES: &[(bool, u16, Option<Error>)] = &[
        (true, 401, Some(Error::Authentication)),
        (true, 403, Some(Error::Denied)),
        (true, 409, Some(Error::Conflict)),
        (true, 429, Some(Error::Offline)),
        (true, 503, Some(Error::Offline)),
        (false, 401, Some(Error::Authentication)),
        (false, 403, Some(Error::Denied)),
        (false, 409, Some(Error::Conflict)),
        (false, 429, Some(Error::Offline)),
        (false, 503, Some(Error::Offline)),
        (false, 200, None),
];

#[test]
fn nightly_device_reset_remote_effects_matrix() {
    for (authorize, status, error) in CASES.iter().copied() {
        assert_remote_reset(authorize, status, error);
    }
}

fn assert_remote_reset(authorize: bool, status: u16, error: Option<Error>) {
    let device = crate::license::installation::legacy_fingerprint().expect("device");
    let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
    let mut responses = Vec::new();
    if !authorize {
        responses.push((
            200,
            serde_json::json!({"version":1,
                "account_id":credential.claims.subject,"data_access_token":"fixture-data-token",
                "expires_at":200})
            .to_string(),
        ));
    }
    responses.push((status, "{}".into()));
    let server = crate::test_http::Server::start_observed(responses);
    let (root, store) = crate::test_store("reset-characterization");
    let account = crate::account::fixture(&server.base, &store);
    let config = BuildConfig {
        supabase: Some(server.base.clone()),
        anon_key: Some("fixture-public"),
        license_keys: Some(keys),
        channel: Some("test"),
        native_oauth: None,
    };
    let mut app = App::with_clock(config, root.clone(), || Ok(100));
    app.account = Some(account);
    app.store = Some(store);
    app.bridge = Some(crate::bridge::Config {
        authorize: server
            .base
            .join("functions/v1/native-account-authorize")
            .expect("authorize"),
        supabase: server.base.clone(),
        anon_key: "fixture-public".into(),
    });
    let mut steps = if authorize {
        vec![]
    } else {
        vec![CoreStep::Invalidate]
    };
    if error.is_none() {
        steps.push(CoreStep::Read);
    }
    let (link, core) = core_fixture(device, keys, steps);
    app.attach_core(link);
    let result = app.execute(Command::DeviceReset);
    assert_eq!(
        result.as_ref().err().copied(),
        error,
        "authorize={authorize}, HTTP={status}"
    );
    if error.is_none() {
        assert!(matches!(result, Ok(Reply::License { .. })));
    }
    // Candidate no aplica en paso 8: no hay copia en servicios.
    assert!(app.account.as_ref().expect("account").identity().is_some());
    core.join()
        .expect("authorization before Invalidate; Read only on success");
    assert!(
        server
            .requests
            .recv()
            .expect("authorize")
            .starts_with("POST /functions/v1/native-account-authorize ")
    );
    if !authorize {
        assert!(
            server
                .requests
                .recv()
                .expect("reset")
                .starts_with("POST /rest/v1/rpc/reset_active_device ")
        );
    }
    assert!(server.finish_observed().is_empty(), "no automatic replay");
    drop(app);
    crate::cleanup_store(&root, "reset-characterization", &[]);
}
