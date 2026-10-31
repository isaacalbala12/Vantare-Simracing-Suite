//! #1827 paso 0: resultados y efectos actuales; no anticipar el paso 5/8.
use super::*;
use crate::protocol::RenewalOutcome;

mod reset;

#[derive(Clone, Copy, Debug)]
enum Origin {
    User,
    Automatic,
    Purchase,
}
#[derive(Clone, Copy, Debug)]
enum Route {
    License,
    OAuth,
    Profile,
    Account,
}

type ServiceCase = (Route, Origin, u16, &'static str, Error, bool, bool, bool);

#[test]
fn nightly_error_origin_effects_matrix() {
    use Origin::*;
    use Route::*;
    // ruta, origen, HTTP, body, Error, revoca, conserva candidate, conserva sesión.
    // Purchase usa LicenseRenewAutomatic en el Hub actual, sin un tercer IPC.
    #[rustfmt::skip]
    const CASES: &[ServiceCase] = &[
        // Cambia en paso 5: el botón manual dejará de revocar.
        (License, User, 401, "{}", Error::Authentication, true, false, true),
        (License, User, 403, "{}", Error::Denied, true, false, true),
        (License, User, 409, "{}", Error::Conflict, true, false, true),
        (License, User, 409, r#"{"error":"device_limit"}"#, Error::DeviceLimit, true, false, true),
        (License, User, 409, r#"{"error":"account_conflict"}"#, Error::AccountConflict, false, true, true),
        (License, User, 429, "{}", Error::Offline, false, true, true),
        (License, User, 503, "{}", Error::Offline, false, true, true),
        (License, User, 200, "{}", Error::Protocol, false, true, true),
        (License, Automatic, 401, "{}", Error::Authentication, false, true, true),
        (License, Automatic, 403, "{}", Error::Denied, false, true, true),
        (License, Automatic, 409, "{}", Error::Conflict, false, true, true),
        (License, Automatic, 409, r#"{"error":"device_limit"}"#, Error::DeviceLimit, false, true, true),
        (License, Automatic, 409, r#"{"error":"account_conflict"}"#, Error::AccountConflict, false, true, true),
        (License, Automatic, 429, "{}", Error::Offline, false, true, true),
        (License, Automatic, 503, "{}", Error::Offline, false, true, true),
        (License, Purchase, 401, "{}", Error::Authentication, false, true, true),
        (License, Purchase, 403, "{}", Error::Denied, false, true, true),
        (License, Purchase, 409, "{}", Error::Conflict, false, true, true),
        (License, Purchase, 409, r#"{"error":"device_limit"}"#, Error::DeviceLimit, false, true, true),
        (License, Purchase, 503, "{}", Error::Offline, false, true, true),
        // Cambia en paso 5: refresh manual no cerrará sesión ni revocará.
        (OAuth, User, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, true, false, false),
        (OAuth, Automatic, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, false, true, true),
        (OAuth, Purchase, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, false, true, true),
        (OAuth, User, 403, "{}", Error::Denied, true, false, false),
        (OAuth, Automatic, 403, "{}", Error::Denied, false, true, true),
        (OAuth, User, 400, r#"{"error":"invalid_request"}"#, Error::Protocol, false, true, true),
        (OAuth, User, 429, "{}", Error::Offline, false, true, true),
        (OAuth, Automatic, 503, "{}", Error::Offline, false, true, true),
        (Profile, User, 401, "{}", Error::Authentication, false, true, true),
        (Profile, Automatic, 403, "{}", Error::Denied, false, true, true),
        (Profile, User, 503, "{}", Error::Offline, false, true, true),
        (Account, User, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, true, false, false),
        (Account, User, 403, "{}", Error::Denied, true, false, false),
        (Account, User, 503, "{}", Error::Offline, false, true, true),
    ];
    for case in CASES.iter().copied() {
        assert_error_origin_effects(case);
    }
}

fn assert_error_origin_effects(
    (route, origin, status, body, error, revokes, candidate, session): ServiceCase,
) {
    use Origin::*;
    use Route::*;
    let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
    let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
    let server = crate::test_http::Server::start_observed(vec![(status, body.into())]);
    let (root, store) = crate::test_store("license-characterization");
    let account = crate::account::fixture(&server.base, &store);
    let config = BuildConfig {
        supabase: Some(server.base.clone()),
        anon_key: Some("public-test-key"),
        license_keys: Some(keys),
        channel: Some("test"),
        native_oauth: None,
    };
    // 100 deja el token vigente; 1000 fuerza refresh antes de native-license.
    let clock = if matches!(route, License | Profile) {
        || Ok(100)
    } else {
        || Ok(1000)
    };
    let mut app = App::with_clock(config, root.clone(), clock);
    app.account = Some(account);
    app.store = Some(store);
    let saved = crate::license_remote::Candidate {
        account_id: credential.claims.subject.clone(),
        device: device.clone(),
        credential,
    };
    app.candidate_store()
        .expect("store")
        .save("license-candidate", &saved)
        .expect("candidate");
    let mut steps = if revokes {
        vec![CoreStep::Invalidate]
    } else {
        vec![]
    };
    steps.push(CoreStep::Read);
    let (link, core) = core_fixture(device, keys, steps);
    app.attach_core(link);
    let command = match route {
        License | OAuth => {
            if matches!(origin, User) {
                Command::LicenseRenew
            } else {
                Command::LicenseRenewAutomatic
            }
        }
        Profile => Command::AccountProfileRefresh,
        Account => Command::AccountRenew,
    };
    assert_eq!(
        app.execute(command).err(),
        Some(error),
        "{route:?}/{origin:?}/{status}"
    );
    if let Some(cached) = assert_candidate_presence(&mut app, candidate) {
        assert_eq!(cached.credential.signature, saved.credential.signature);
        assert_eq!(cached.account_id, saved.account_id);
        assert_eq!(cached.device, saved.device);
    }
    assert_eq!(
        app.account.as_ref().expect("account").identity().is_some(),
        session,
        "{route:?}/{origin:?}/{status}: session"
    );
    assert!(matches!(
        app.execute(Command::LicenseStatus),
        Ok(Reply::License { .. })
    ));
    core.join()
        .expect("exact core commands, including absence of Invalidate");
    let request = server.requests.recv().expect("HTTP observed");
    assert!(
        request.starts_with(match route {
            License => "POST /functions/v1/native-license ",
            Profile => "GET /userinfo ",
            _ => "POST /token ",
        }),
        "{request}"
    );
    assert!(
        server.finish_observed().is_empty(),
        "no replay or extra request"
    );
    drop(app);
    crate::cleanup_store(&root, "license-characterization", &[]);
}

#[test]
fn nightly_manual_credential_failure_outcome_matrix() {
    use crate::outcome::{Observation, Origin as OutcomeOrigin, Outcome, outcome};
    // Error × ruta/origen antes de adaptar InvalidCredential a Version en App.
    // Expired no lo emite hoy license_remote::renew: se fija su clasificación
    // directamente, sin añadir inyección productiva para forzar una ruta imposible.
    const CASES: &[(Route, Origin, Error, bool, bool)] = &[
        (
            Route::License,
            Origin::User,
            Error::InvalidCredential,
            false,
            false,
        ),
        (Route::License, Origin::User, Error::Expired, false, false),
    ];
    for (route, origin, error, revoke, sign_out) in CASES.iter().copied() {
        assert_eq!(
            outcome(Observation::Error(
                error,
                OutcomeOrigin::Renewal { automatic: false }
            )),
            Outcome {
                renewal: RenewalOutcome::Transient,
                revoke,
                sign_out
            },
            "{route:?}/{origin:?}/{error:?}"
        );
    }
}

#[test]
fn nightly_automatic_failure_result_matrix() {
    use vantare_ipc::control::Failure;
    // Error → Reply actual (también para Purchase). Cambia en paso 4 solo su dueño.
    #[rustfmt::skip]
    const CASES: &[(Error, bool)] = &[
        (Error::Authentication, true),
        (Error::Denied, true),
        (Error::Conflict, true),
        (Error::Core(Failure::Rejected), true),
        (Error::AccountConflict, false),
        (Error::Offline, false),
        (Error::Version, false),
        (Error::InvalidCredential, false),
        (Error::Clock, false),
        (Error::Expired, false),
        (Error::Storage, false),
        (Error::Corrupt, false),
        (Error::Protocol, false),
        (Error::Unconfigured, false),
        (Error::Core(Failure::Version), false),
        (Error::Core(Failure::Transport), false),
        (Error::Core(Failure::Timeout), false),
        (Error::Core(Failure::Disconnected), false),
        (Error::Core(Failure::Eof), false),
        (Error::Core(Failure::PeerGone), false),
        (Error::Core(Failure::Unavailable), false),
        (Error::Core(Failure::UnknownLegacy), false),
        (Error::Core(Failure::CommandNotAllowed), false),
        (Error::Core(Failure::Identity), false),
        (Error::Core(Failure::Protocol), false),
    ];
    for (error, definitive) in CASES.iter().copied() {
        assert!(
            matches!(App::automatic_failure(error), Reply::LicenseFailure { outcome, .. }
            if outcome == if definitive { RenewalOutcome::Definitive } else { RenewalOutcome::Transient }),
            "{error:?}"
        );
    }
    assert!(matches!(
        App::automatic_failure(Error::DeviceLimit),
        Reply::DeviceLimit { .. }
    ));
}

#[test]
fn nightly_explicit_revocation_and_transfer_matrix() {
    // comando, rechazo del núcleo, candidate restante, sesión restante, Error.
    // El guion CoreStep prueba revocación confirmada solo en Logout/DeviceReset
    // con ACK correcto; TransferRights nunca envía Invalidate.
    #[rustfmt::skip]
    const CASES: &[(&str, bool, bool, bool, Option<Error>)] = &[
        ("Logout", false, false, false, None),
        ("Logout", true, true, true, Some(Error::Core(vantare_ipc::control::Failure::UnknownLegacy))),
        ("DeviceReset", false, false, true, Some(Error::BridgeUnconfigured)),
        ("DeviceReset", true, true, true, Some(Error::Core(vantare_ipc::control::Failure::UnknownLegacy))),
        ("TransferRights", false, true, true, None),
        // Cambia en paso 8: candidate rechazado se aparta, sin revocar ni cerrar sesión.
        ("TransferRights", true, false, true, None),
    ];
    for (name, reject, candidate, session, expected) in CASES.iter().copied() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (credential, keys) = crate::license_remote::tests::signed_fixture(&device);
        let (root, store) = crate::test_store("explicit-characterization");
        let account = crate::account::fixture(
            &url::Url::parse("http://127.0.0.1:1/").expect("fixture URL"),
            &store,
        );
        let config = BuildConfig {
            supabase: None,
            anon_key: None,
            license_keys: Some(keys),
            channel: Some("test"),
            native_oauth: Some(crate::config::OAuthBuild {
                issuer: url::Url::parse("http://127.0.0.1:1/").expect("issuer"),
                client_id: "public-fixture".into(),
                redirect_uri: url::Url::parse("http://127.0.0.1:0/callback").expect("redirect"),
            }),
        };
        let mut app = App::with_clock(config, root.clone(), || Ok(100));
        app.account = Some(account);
        app.store = Some(store);
        app.candidate_store()
            .expect("store")
            .save(
                "license-candidate",
                &crate::license_remote::Candidate {
                    account_id: credential.claims.subject.clone(),
                    device: device.clone(),
                    credential,
                },
            )
            .expect("candidate");
        let transfer = name == "TransferRights";
        let mut steps = if transfer {
            if reject {
                vec![CoreStep::RejectInstall, CoreStep::Read]
            } else {
                vec![CoreStep::Install]
            }
        } else if reject {
            vec![CoreStep::RejectInvalidate]
        } else {
            vec![CoreStep::Invalidate]
        };
        steps.push(CoreStep::Read);
        let (link, core) = core_fixture(device, keys, steps);
        app.attach_core(link);
        let command = match name {
            "Logout" => Command::Logout,
            "DeviceReset" => Command::DeviceReset,
            _ => Command::TransferRights,
        };
        assert_eq!(
            app.execute(command).err(),
            expected,
            "{name}, reject={reject}"
        );
        let _ = assert_candidate_presence(&mut app, candidate);
        assert_eq!(
            app.account.as_ref().expect("account").identity().is_some(),
            session,
            "{name}, reject={reject}: session"
        );
        app.execute(Command::LicenseStatus).expect("Read");
        core.join().expect("ordered ACK before effects");
        drop(app);
        crate::cleanup_store(&root, "explicit-characterization", &[]);
    }
}

fn assert_candidate_presence(
    app: &mut App,
    present: bool,
) -> Option<crate::license_remote::Candidate> {
    let cached = app
        .candidate_store()
        .expect("store")
        .load::<crate::license_remote::Candidate>("license-candidate");
    if present {
        Some(cached.expect("candidate remains readable"))
    } else {
        assert!(
            matches!(cached, Err(Error::NotFound)),
            "candidate removed, not corrupt"
        );
        None
    }
}
