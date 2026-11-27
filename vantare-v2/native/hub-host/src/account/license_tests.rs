use super::*;
use vantare_ipc::control::{CatalogAccess, VERSION};

const WALL: u64 = 1_796_000_000_000;
const HOUR: u64 = 60 * 60 * 1000;

fn policy(state: AccessState, signed: Option<u64>, grace: Option<u64>) -> Policy {
    Policy {
        version: VERSION,
        epoch: 1,
        revision: 1,
        checked_at_ms: WALL,
        state,
        signed_until_ms: signed,
        grace_until_ms: grace,
        catalog: CatalogAccess::Pro,
        tester: true,
        ..Policy::default()
    }
}
fn verified() -> AccessView {
    AccessView {
        verified: true,
        ..AccessView::default()
    }
}
fn license(policy: &Policy) -> Option<LicenseView> {
    view(&verified(), Session::SignedIn, Some(policy), WALL)
}
fn seen(tester: bool, status: LicenseStatus, until_ms: Option<u64>) -> LicenseView {
    LicenseView {
        tester,
        status,
        until_ms,
    }
}

#[test]
fn signed_date_warns_from_exactly_24_hours_and_not_one_millisecond_before() {
    let at = |signed: u64| license(&policy(AccessState::Active, Some(signed), None));
    let cases = [
        (WALL + WARN_MS + 1, LicenseStatus::Active),
        (WALL + WARN_MS, LicenseStatus::Expiring),
        (WALL + WARN_MS - 1, LicenseStatus::Expiring),
        (WALL + 1, LicenseStatus::Expiring),
        (WALL + 14 * 24 * HOUR, LicenseStatus::Active),
        (WALL + 72 * HOUR, LicenseStatus::Active),
    ];
    for (signed, status) in cases {
        assert_eq!(at(signed), Some(seen(true, status, Some(signed))), "{signed}");
    }
    assert_eq!(WARN_MS, 24 * HOUR);
}

#[test]
fn without_signed_date_every_catalog_is_active_without_date() {
    for catalog in [
        CatalogAccess::Free,
        CatalogAccess::LaunchV1,
        CatalogAccess::Pro,
        CatalogAccess::Founders,
    ] {
        for tester in [false, true] {
            let mut policy = policy(AccessState::Active, None, None);
            policy.catalog = catalog;
            policy.tester = tester;
            assert_eq!(
                license(&policy),
                Some(seen(tester, LicenseStatus::Active, None)),
                "{catalog:?} {tester}"
            );
        }
    }
}

#[test]
fn grace_shows_the_race_deadline_and_falls_back_to_the_signed_date() {
    let grace = policy(AccessState::Grace, Some(WALL - HOUR), Some(WALL + HOUR));
    assert_eq!(
        license(&grace),
        Some(seen(true, LicenseStatus::Grace, Some(WALL + HOUR)))
    );
    // Más de 24 h por delante: sigue siendo gracia, no «activo».
    let far = policy(AccessState::Grace, Some(WALL + 30 * HOUR), None);
    assert_eq!(
        license(&far),
        Some(seen(true, LicenseStatus::Grace, Some(WALL + 30 * HOUR)))
    );
    // Sin ninguna fecha la pantalla no podría escribir la hora: sin fila.
    assert_eq!(license(&policy(AccessState::Grace, None, None)), None);
}

#[test]
fn tester_comes_only_from_the_signed_policy_never_from_the_access_view() {
    let mut signed = policy(AccessState::Active, Some(WALL + 48 * HOUR), None);
    let tester_access = AccessView {
        tester: true,
        ..verified()
    };
    signed.tester = false;
    assert_eq!(
        view(&tester_access, Session::SignedIn, Some(&signed), WALL)
            .map(|license| license.tester),
        Some(false)
    );
    signed.tester = true;
    assert_eq!(
        view(&verified(), Session::SignedIn, Some(&signed), WALL).map(|license| license.tester),
        Some(true)
    );
}

#[test]
fn no_license_without_verified_unblocked_access() {
    let active = policy(AccessState::Active, Some(WALL + 48 * HOUR), None);
    let blocked = AccessView {
        blocked: true,
        ..verified()
    };
    for access in [AccessView::default(), blocked] {
        assert_eq!(
            view(&access, Session::SignedIn, Some(&active), WALL),
            None,
            "{access:?}"
        );
    }
    assert_eq!(view(&verified(), Session::SignedIn, None, WALL), None);
}

#[test]
fn no_license_when_the_session_policy_does_not_verify_by_itself() {
    let denied = [
        AccessState::NoCredential,
        AccessState::Expired,
        AccessState::Revoked,
        AccessState::RecoveryRequired,
        AccessState::Unavailable,
        AccessState::UpdateRequired,
        AccessState::ClockBehind { until_ms: WALL },
    ];
    for state in denied {
        assert_eq!(
            license(&policy(state, Some(WALL + 48 * HOUR), None)),
            None,
            "{state:?}"
        );
    }
    // Fecha firmada ya pasada (reloj adelantado): la política deja de estar vigente.
    assert_eq!(
        license(&policy(AccessState::Active, Some(WALL), None)),
        None
    );
    // Observación del núcleo antigua: no vigente aunque diga «activo».
    let mut stale = policy(AccessState::Active, Some(WALL + 48 * HOUR), None);
    stale.checked_at_ms = WALL - 5_000;
    assert_eq!(license(&stale), None);
    stale.checked_at_ms = WALL;
    stale.version = VERSION - 1;
    assert_eq!(license(&stale), None);
}

#[test]
fn closed_or_pending_session_with_cached_policy_has_no_license() {
    let active = policy(AccessState::Active, Some(WALL + 48 * HOUR), None);
    for session in [Session::SignedOut, Session::Pending] {
        assert_eq!(
            view(&verified(), session, Some(&active), WALL),
            None,
            "{session:?}"
        );
    }
    assert_eq!(
        view(&verified(), Session::NeedsSignIn, Some(&active), WALL),
        Some(seen(true, LicenseStatus::Active, Some(WALL + 48 * HOUR)))
    );
}

#[test]
fn account_view_derives_license_from_the_session_policy() {
    let now = std::time::Instant::now();
    let mut state = super::super::State::new();
    state.reducer.configured = true;
    state.reducer.session_checked = true;
    state.reducer.fixture_session(Session::SignedIn);
    state.status_done = true;
    assert_eq!(state.view(&verified(), now, WALL).license, None);
    state.observe_policy(
        policy(AccessState::Active, Some(WALL + WARN_MS), None),
        now,
    );
    assert_eq!(
        state.view(&verified(), now, WALL).license,
        Some(seen(true, LicenseStatus::Expiring, Some(WALL + WARN_MS)))
    );
    assert_eq!(
        state.view(&AccessView::default(), now, WALL).license,
        None
    );
    state.reducer.fixture_session(Session::SignedOut);
    assert_eq!(state.view(&verified(), now, WALL).license, None);
}

#[test]
fn license_wire_is_camel_case_closed_and_until_is_a_number() {
    let value = LicenseView {
        tester: true,
        status: LicenseStatus::Expiring,
        until_ms: Some(1_796_896_800_000),
    };
    let json = serde_json::to_value(&value).unwrap();
    assert_eq!(
        json,
        serde_json::json!({"tester": true, "status": "expiring", "untilMs": 1_796_896_800_000_u64})
    );
    assert!(json["untilMs"].is_u64());
    assert_eq!(serde_json::from_value::<LicenseView>(json).unwrap(), value);
    let none = serde_json::to_value(LicenseView {
        tester: false,
        status: LicenseStatus::Active,
        until_ms: None,
    })
    .unwrap();
    assert_eq!(none["untilMs"], serde_json::Value::Null);
    for status in ["active", "grace"] {
        assert!(
            serde_json::from_value::<LicenseView>(
                serde_json::json!({"tester": false, "status": status, "untilMs": null})
            )
            .is_ok()
        );
    }
    for wrong in [
        serde_json::json!({"tester": true, "status": "active", "untilMs": 1, "role": "owner"}),
        serde_json::json!({"tester": true, "status": "expired", "untilMs": 1}),
        serde_json::json!({"tester": true, "status": "Active", "untilMs": 1}),
        serde_json::json!({"tester": true, "status": "active", "until_ms": 1}),
        serde_json::json!({"tester": true, "status": "active", "untilMs": -1}),
    ] {
        assert!(
            serde_json::from_value::<LicenseView>(wrong.clone()).is_err(),
            "{wrong}"
        );
    }
}
