//! #1827: matriz base con diferencias autorizadas de pasos 5/6/8 explícitas.
use super::*;
use crate::protocol::RenewalOutcome;
mod reset;

#[test]
fn session_publication_distinguishes_restore_refresh_rejection_pending_and_logout() {
    use crate::protocol::Session;
    let (root, store) = crate::test_store("session-publication");
    let base = url::Url::parse("http://127.0.0.1:1/").expect("fixture");
    let mut account = crate::account::fixture(&base, &store);
    let check = |account: &Account, expected| {
        assert!(matches!(App::account_reply(account, Some(Error::Offline)),
            Reply::Account { session, .. } if session == expected));
    };
    check(&account, Session::SignedIn);
    account.require_sign_in(&store).expect("rejected refresh");
    check(&account, Session::NeedsSignIn);
    let oauth = serde_json::from_value(serde_json::json!({
        "authorization": base.join("authorize").expect("authorize"),
        "token": base.join("token").expect("token"),
        "userinfo": base.join("userinfo").expect("userinfo"),
        "issuer": base, "client_id": "public-fixture",
        "redirect": "http://127.0.0.1:0/callback"
    }))
    .expect("fixture OAuth");
    let mut restored = Account::restore(oauth, &store).expect("restored");
    check(&restored, Session::NeedsSignIn);
    restored.begin_login().expect("pending callback");
    check(&restored, Session::Pending);
    restored.cancel_login().expect("cancel attempt");
    check(&restored, Session::NeedsSignIn);
    restored.logout(&store).expect("logout");
    check(&restored, Session::SignedOut);
    drop(restored);
    drop(account);
    drop(store);
    crate::cleanup_store(&root, "session-publication", &[]);
}

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
type ServiceCase = (
    Route,
    Origin,
    u16,
    &'static str,
    Error,
    bool,
    Option<bool>,
    bool,
    bool,
);

#[test]
fn nightly_error_origin_effects_matrix() {
    use Origin::*;
    use Route::*;
    // ruta, origen, HTTP, body, Error, revoca, candidate no aplica (paso 8: sin almacén), conserva sesión, NeedsSignIn.
    // Purchase usa LicenseRenewAutomatic en el Hub actual, sin un tercer IPC.
    #[rustfmt::skip]
    const CASES: &[ServiceCase] = &[
        // Paso 5 conserva sesión y no revoca; paso 8 elimina el almacén candidate.
        (License, User, 401, "{}", Error::Authentication, false, None, true, false),
        (License, User, 403, "{}", Error::Denied, false, None, true, false),
        (License, User, 409, "{}", Error::Conflict, false, None, true, false),
        (License, User, 409, r#"{"error":"device_limit"}"#, Error::DeviceLimit, false, None, true, false),
        (License, User, 409, r#"{"error":"account_conflict"}"#, Error::AccountConflict, false, None, true, false),
        (License, User, 429, "{}", Error::Offline, false, None, true, false),
        (License, User, 503, "{}", Error::Offline, false, None, true, false),
        (License, User, 200, "{}", Error::Protocol, false, None, true, false),
        (License, Automatic, 401, "{}", Error::Authentication, false, None, true, false),
        (License, Automatic, 403, "{}", Error::Denied, false, None, true, false),
        (License, Automatic, 409, "{}", Error::Conflict, false, None, true, false),
        (License, Automatic, 409, r#"{"error":"device_limit"}"#, Error::DeviceLimit, false, None, true, false),
        (License, Automatic, 409, r#"{"error":"account_conflict"}"#, Error::AccountConflict, false, None, true, false),
        (License, Automatic, 429, "{}", Error::Offline, false, None, true, false),
        (License, Automatic, 503, "{}", Error::Offline, false, None, true, false),
        (License, Purchase, 401, "{}", Error::Authentication, false, None, true, false),
        (License, Purchase, 403, "{}", Error::Denied, false, None, true, false),
        (License, Purchase, 409, "{}", Error::Conflict, false, None, true, false),
        (License, Purchase, 409, r#"{"error":"device_limit"}"#, Error::DeviceLimit, false, None, true, false),
        (License, Purchase, 503, "{}", Error::Offline, false, None, true, false),
        // Paso 5: refresh manual pasa a NeedsSignIn conservando identidad.
        (OAuth, User, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, false, None, true, true),
        (OAuth, Automatic, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, false, None, true, true),
        (OAuth, Purchase, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, false, None, true, true),
        (OAuth, User, 401, "{}", Error::Authentication, false, None, true, true),
        (OAuth, Automatic, 401, "{}", Error::Authentication, false, None, true, true),
        (OAuth, Purchase, 401, "{}", Error::Authentication, false, None, true, true),
        (OAuth, User, 403, "{}", Error::Offline, false, None, true, false),
        (OAuth, Automatic, 403, "{}", Error::Offline, false, None, true, false),
        (OAuth, Purchase, 403, "{}", Error::Offline, false, None, true, false),
        (OAuth, User, 400, r#"{"error":"invalid_request"}"#, Error::Protocol, false, None, true, false),
        (OAuth, User, 429, "{}", Error::Offline, false, None, true, false),
        (OAuth, Automatic, 503, "{}", Error::Offline, false, None, true, false),
        (Profile, User, 401, "{}", Error::Authentication, false, None, true, false),
        (Profile, Automatic, 403, "{}", Error::Denied, false, None, true, false),
        (Profile, User, 503, "{}", Error::Offline, false, None, true, false),
        (Account, User, 400, r#"{"error":"invalid_grant"}"#, Error::Authentication, false, None, true, true),
        (Account, User, 403, "{}", Error::Offline, false, None, true, false),
        (Account, User, 503, "{}", Error::Offline, false, None, true, false),
    ];
    for case in CASES.iter().copied() {
        assert_error_origin_effects(case);
    }
}

fn assert_error_origin_effects(
    (route, origin, status, body, error, revokes, candidate_not_applicable, session, needs_sign_in): ServiceCase,
) {
    use crate::outcome::{Observation, Origin as AccessOrigin, outcome};
    use Origin::*;
    use Route::*;
    let automatic = !matches!(origin, User);
    let access_origin = if matches!(route, OAuth | Account) {
        AccessOrigin::OAuth { automatic }
    } else {
        AccessOrigin::Renewal { automatic }
    };
    let effects = outcome(Observation::Error(error, access_origin));
    assert_eq!(
        effects.revoke, revokes,
        "{route:?}/{origin:?}/{status}: revoke column"
    );
    let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
    let (_, keys) = crate::license_remote::tests::signed_fixture(&device);
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
    assert!(
        candidate_not_applicable.is_none(),
        "paso 8: servicios no guarda licencias"
    );
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
    assert_eq!(
        app.account.as_ref().expect("account").identity().is_some(),
        session,
        "{route:?}/{origin:?}/{status}: session"
    );
    assert_eq!(
        app.account.as_ref().expect("account").needs_sign_in(),
        needs_sign_in,
        "{route:?}/{origin:?}/{status}: NeedsSignIn"
    );
    assert_public_session(
        app.account.as_ref().expect("account"),
        needs_sign_in,
        session,
    );
    assert_manual_failure_reply(&app, route, origin, status, error);
    assert!(matches!(
        app.execute(Command::LicenseStatus),
        Ok(Reply::License { .. })
    ));
    core.join()
        .expect("exact core commands, including absence of Invalidate");
    assert_single_request(server, route);
    drop(app);
    crate::cleanup_store(&root, "license-characterization", &[]);
}

fn assert_public_session(account: &Account, needs_sign_in: bool, session: bool) {
    // Paso 6 publica Session; paso 8 marca candidate como no aplicable.
    let expected_session = if needs_sign_in {
        crate::protocol::Session::NeedsSignIn
    } else if session {
        crate::protocol::Session::SignedIn
    } else {
        crate::protocol::Session::SignedOut
    };
    assert!(matches!(App::account_reply(account, None),
        Reply::Account { session, .. } if session == expected_session));
}

fn assert_manual_failure_reply(app: &App, route: Route, origin: Origin, status: u16, error: Error) {
    if matches!(route, Route::License)
        && matches!(origin, Origin::User)
        && matches!(status, 401 | 403 | 409)
        && !matches!(error, Error::DeviceLimit | Error::AccountConflict)
    {
        assert!(matches!(
            app.renewal_failure(error, false),
            Reply::LicenseFailure {
                outcome: RenewalOutcome::Definitive,
                ..
            }
        ));
    }
}

fn assert_single_request(server: crate::test_http::Server, route: Route) {
    let request = server.requests.recv().expect("HTTP observed");
    assert!(
        request.starts_with(match route {
            Route::License => "POST /functions/v1/native-license ",
            Route::Profile => "GET /userinfo ",
            _ => "POST /token ",
        }),
        "{request}"
    );
    assert!(
        server.finish_observed().is_empty(),
        "no replay or extra request"
    );
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
                sign_out,
                needs_sign_in: false
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
fn nightly_explicit_revocation_matrix() {
    // comando, rechazo del núcleo, candidate restante, sesión restante, Error.
    // El guion CoreStep prueba revocación confirmada solo en Logout/DeviceReset
    // con ACK correcto. TransferRights no aplica: eliminado en paso 8.
    type ExplicitCase = (&'static str, bool, Option<bool>, bool, Option<Error>);
    #[rustfmt::skip]
    const CASES: &[ExplicitCase] = &[
        ("Logout", false, None, false, None),
        (
            "Logout",
            true,
            None,
            true,
            Some(Error::Core(vantare_ipc::control::Failure::UnknownLegacy)),
        ),
        (
            "DeviceReset",
            false,
            None,
            true,
            Some(Error::BridgeUnconfigured),
        ),
        (
            "DeviceReset",
            true,
            None,
            true,
            Some(Error::BridgeUnconfigured),
        ),
        // Paso 8: las dos filas TransferRights ya no aplican; no existe el comando.

        // Paso 6 autorizado: AccountCancel cancela el intento, no revoca.
        ("AccountCancel", false, None, true, None),
    ];
    for (name, reject, candidate_not_applicable, session, expected) in CASES.iter().copied() {
        let device = crate::license::installation::legacy_fingerprint().expect("fixture device");
        let (_, keys) = crate::license_remote::tests::signed_fixture(&device);
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
        assert!(candidate_not_applicable.is_none());
        let mut steps = if matches!(name, "DeviceReset" | "AccountCancel") {
            vec![]
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
            "AccountCancel" => Command::AccountCancel,
            _ => unreachable!("explicit fixture command"),
        };
        assert_eq!(
            app.execute(command).err(),
            expected,
            "{name}, reject={reject}"
        );
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
