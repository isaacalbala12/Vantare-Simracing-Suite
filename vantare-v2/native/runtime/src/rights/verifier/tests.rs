use super::*;
use crate::rights::{authority, cleanup_store, test_store};
use ed25519_dalek::{Signer, SigningKey};
#[cfg(any(windows, unix))]
use std::time::Duration;
use vantare_services::license::ClaimsV1;
#[cfg(unix)]
use vantare_services::license::installation;

const SUBJECT: &str = "550e8400-e29b-41d4-a716-446655440000";

#[test]
fn founders_signed_right_is_perpetual_and_does_not_accept_a_scope_or_expiry() {
    let signing = key();
    let verifier = verifier(&signing);
    let mut credential = v1(&signing, "2027-09-30T11:00:00Z");
    for (paid_through, perpetual, scope, valid) in [
        ("", true, "", true),
        ("2027-09-30T11:00:00Z", false, "", false),
        ("", true, "launch_v1", false),
        ("2027-09-30T11:00:00Z", true, "", false),
    ] {
        credential.claims.capabilities = vec![Capability {
            key: "vantare.plan.founders".into(),
            paid_through: paid_through.into(),
            perpetual,
            scope_version: scope.into(),
        }];
        credential.signature = URL_SAFE_NO_PAD.encode(
            signing
                .sign(&credential.signing_bytes().expect("payload"))
                .to_bytes(),
        );
        let result = verifier.v1(&credential, SUBJECT, "test-device");
        assert_eq!(result.is_ok(), valid);
        if let Ok(verified) = result {
            assert_eq!(verified.grants().len(), 1);
            assert!(verified.grants()[0].expires_at.is_none());
        }
    }
}
#[test]
fn unknown_capabilities_are_ignored_even_when_the_server_knows_more_than_the_client() {
    let signing = key();
    let verifier = verifier(&signing);
    let mut credential = v1(&signing, "2027-09-30T11:00:00Z");
    let expected: Vec<_> = verifier
        .v1(&credential, SUBJECT, "test-device")
        .expect("original")
        .grants()
        .iter()
        .map(|grant| grant.key.clone())
        .collect();
    credential
        .claims
        .capabilities
        .extend((0..=CAPABILITIES.len()).map(|index| Capability {
            key: format!("vantare.future.feature-{index:03}"),
            paid_through: "2027-09-30T11:00:00Z".into(),
            perpetual: false,
            scope_version: String::new(),
        }));
    credential
        .claims
        .capabilities
        .sort_by(|a, b| a.key.cmp(&b.key));
    credential.signature = URL_SAFE_NO_PAD.encode(
        signing
            .sign(&credential.signing_bytes().expect("payload"))
            .to_bytes(),
    );
    let accepted = verifier
        .v1(&credential, SUBJECT, "test-device")
        .expect("ignorar desconocidas");
    assert_eq!(
        accepted
            .grants()
            .iter()
            .map(|grant| grant.key.clone())
            .collect::<Vec<_>>(),
        expected
    );
}

fn key() -> SigningKey {
    let mut seed = [0; 32];
    getrandom::fill(&mut seed).expect("test entropy");
    SigningKey::from_bytes(&seed)
}
fn verifier(key: &SigningKey) -> Verifier {
    Verifier::public_keys(&format!(
        "test:{}",
        URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())
    ))
    .expect("public key")
}
fn v1(key: &SigningKey, expiry: &str) -> CredentialV1 {
    let mut value = CredentialV1 {
        version: 1,
        algorithm: "Ed25519".into(),
        key_id: "test".into(),
        claims: ClaimsV1 {
            issuer: ISSUER.into(),
            subject: SUBJECT.into(),
            device_fingerprint: "test-device".into(),
            issued_at: "2026-09-30T10:00:00Z".into(),
            capabilities: vec![Capability {
                key: "vantare.plan.pro".into(),
                paid_through: expiry.into(),
                perpetual: false,
                scope_version: String::new(),
            }],
        },
        signature: String::new(),
    };
    value.signature = URL_SAFE_NO_PAD.encode(
        key.sign(&value.signing_bytes().expect("payload"))
            .to_bytes(),
    );
    value
}
#[test]
fn generated_signatures_cover_v1_binding_mutation_and_scopes() {
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00.123456789Z");
    assert_eq!(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify")
            .grants()[0]
            .expires_at
            .expect("expiry")
            .timestamp_subsec_nanos(),
        123_456_789
    );
    assert!(
        verifier
            .v1(&credential, "user_clerk", "test-device")
            .is_err()
    );
    assert!(verifier.v1(&credential, SUBJECT, "another-device").is_err());
    let mut mutation = credential.clone();
    mutation.claims.capabilities[0].perpetual = true;
    assert!(verifier.v1(&mutation, SUBJECT, "test-device").is_err());
    mutation.signature = URL_SAFE_NO_PAD.encode(
        signing
            .sign(&mutation.signing_bytes().expect("payload"))
            .to_bytes(),
    );
    assert!(verifier.v1(&mutation, SUBJECT, "test-device").is_err()); // Pro cannot be perpetual even if signed.
    mutation = credential.clone();
    mutation.key_id = "unknown".into();
    assert!(verifier.v1(&mutation, SUBJECT, "test-device").is_err());
    let other = key();
    assert!(
        self::verifier(&other)
            .v1(&credential, SUBJECT, "test-device")
            .is_err()
    );
}

#[test]
fn v1_signing_payload_matches_go_html_escaping_without_real_keys() {
    let signing = key();
    let mut credential = v1(&signing, "2026-09-30T11:00:00Z");
    credential.key_id = "<test&>\u{2028}\u{2029}".into();
    let payload = String::from_utf8(credential.signing_bytes().expect("payload")).expect("utf8");
    assert!(payload.contains("\\u003ctest\\u0026\\u003e\\u2028\\u2029"));
    assert!(payload.starts_with("{\"version\":1,\"algorithm\":\"Ed25519\",\"key_id\":"));
    assert!(!payload.contains("signature"));
}

#[cfg(any(windows, unix))]
fn game_identity() -> authority::SessionIdentity {
    authority::SessionIdentity {
        simulator: "test-simulator".into(),
        track: "test-track".into(),
        kind: "race".into(),
        started: "test-session-start".into(),
    }
}

#[cfg(any(windows, unix))]
#[test]
fn core_policy_keeps_exact_hour_only_for_existing_game_survives_restart_and_logout() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let (root, store) = test_store("core-policy");
    let mut core = Authority::restore(&store, 1_700_000_000_123).expect("core");
    core.install(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify"),
        date("2026-09-30T10:00:00Z").expect("date"),
        Duration::ZERO,
    )
    .expect("install");
    core.enter_game_identified(
        7,
        Some(game_identity()),
        date("2026-09-30T10:30:00Z").expect("date"),
        date("2026-09-30T10:30:00Z").expect("date"),
        Duration::from_mins(30),
    )
    .expect("entry");
    assert_eq!(
        core.rights(
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::from_secs(7199)
        )
        .expect("hour")
        .len(),
        1
    );
    core.persist(&store).expect("persist");
    let mut restarted = Authority::restore(&store, 1_700_000_000_123).expect("restart");
    restarted
        .install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("verify"),
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::ZERO,
        )
        .expect("restore credential");
    assert!(
        restarted
            .rights(date("2026-09-30T11:59:59Z").expect("date"), Duration::ZERO)
            .expect("without confirmed game")
            .is_empty()
    );
    restarted
        .enter_game_identified(
            1,
            Some(game_identity()),
            date("2026-09-30T11:59:59Z").expect("date"),
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::ZERO,
        )
        .expect("same core-observed game");
    assert_eq!(
        restarted
            .rights(date("2026-09-30T11:59:59Z").expect("date"), Duration::ZERO)
            .expect("hour")
            .len(),
        1
    );
    assert!(
        restarted
            .rights(
                date("2026-09-30T12:00:00Z").expect("date"),
                Duration::from_secs(1)
            )
            .expect("exact end")
            .is_empty()
    );
    assert!(matches!(
        restarted.rights(
            date("2026-09-30T11:59:59Z").expect("date"),
            Duration::from_secs(2)
        ),
        Err(Error::Clock)
    ));
    restarted
        .invalidate(
            date("2026-09-30T12:00:00Z").expect("date"),
            Duration::from_secs(1),
        )
        .expect("logout");
    restarted.persist(&store).expect("tombstone");
    let mut logged_out = Authority::restore(&store, 1_700_000_000_123).expect("restart");
    assert!(matches!(
        logged_out.install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("verify"),
            date("2026-09-30T12:00:00Z").expect("date"),
            Duration::ZERO
        ),
        Err(Error::Denied)
    ));
    drop(store);
    cleanup_store(&root, "core-policy", &["authority"]);
}

#[cfg(any(windows, unix))]
#[test]
fn no_offline_grace_outside_game_or_for_already_expired_game_entry() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let (root, store) = test_store("no-grace");
    let mut core = Authority::restore(&store, 1_700_000_000_123).expect("core");
    core.install(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify"),
        date("2026-09-30T11:00:00Z").expect("date"),
        Duration::ZERO,
    )
    .expect("install");
    assert!(
        core.rights(date("2026-09-30T11:00:00Z").expect("date"), Duration::ZERO)
            .expect("outside")
            .is_empty()
    );
    core.enter_game(
        2,
        date("2026-09-30T11:00:00Z").expect("date"),
        Duration::ZERO,
    )
    .expect("entry");
    assert!(
        core.rights(date("2026-09-30T11:00:00Z").expect("date"), Duration::ZERO)
            .expect("expired at entry")
            .is_empty()
    );
    core.persist(&store).expect("persist");
    drop(store);
    cleanup_store(&root, "no-grace", &["authority"]);
}

#[cfg(any(windows, unix))]
#[test]
fn recycled_local_session_id_cannot_confirm_grace_after_restart() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let root = std::env::var_os("VANTARE_TEST_EVIDENCE_DIR")
        .map_or_else(std::env::temp_dir, std::path::PathBuf::from)
        .join(format!(
            "vantare-session-test-{}",
            vantare_services::random_id().expect("test entropy")
        ));
    let store = vantare_services::storage::Store::open(&root, "recycled-session").expect("store");
    let mut core = Authority::restore(&store, 1_700_000_000_123).expect("core");
    let proof = || {
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("verify")
    };
    let entered = date("2026-09-30T10:30:00Z").expect("date");
    let resumed = date("2026-09-30T11:30:00Z").expect("date");
    core.install(proof(), entered, Duration::ZERO)
        .expect("install");
    core.enter_game(7, entered, Duration::ZERO).expect("enter");
    core.rights_and_persist(resumed, Duration::from_hours(1), &store)
        .expect("persist");
    let mut restarted = Authority::restore(&store, 1_700_000_000_123).expect("restart");
    restarted
        .install(proof(), resumed, Duration::ZERO)
        .expect("binding");
    restarted
        .enter_game(7, resumed, Duration::ZERO)
        .expect("recycled id");
    assert!(
        restarted
            .rights(resumed, Duration::ZERO)
            .expect("rights")
            .is_empty()
    );
    drop(store);
    cleanup_store(&root, "recycled-session", &["authority"]);
}

#[cfg(unix)]
#[test]
fn unix_legacy_fingerprint_requires_a_future_migration() {
    assert_eq!(installation::legacy_fingerprint(), Err(Error::Unsupported));
}

#[test]
fn module_grants_are_perpetual_closed_and_scope_free() {
    for key in CAPABILITIES
        .iter()
        .filter(|key| key.starts_with("vantare.module."))
    {
        let capability = Capability {
            key: (*key).into(),
            paid_through: String::new(),
            perpetual: true,
            scope_version: String::new(),
        };
        assert!(grants(std::slice::from_ref(&capability)).is_ok());
        for invalid in [
            Capability {
                perpetual: false,
                ..capability.clone()
            },
            Capability {
                paid_through: "2026-10-05T00:00:00Z".into(),
                ..capability.clone()
            },
            Capability {
                scope_version: "launch_v1".into(),
                ..capability.clone()
            },
        ] {
            assert!(grants(&[invalid]).is_err());
        }
    }
    assert!(CAPABILITIES.windows(2).all(|keys| keys[0] < keys[1]));
}

#[cfg(any(windows, unix))]
#[test]
fn cached_paid_period_survives_seventeen_offline_days_until_exact_deadline() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let cancelled = date("2026-09-30T10:00:00Z").expect("día 13");
    let credential = v1(&signing, "2026-10-17T10:00:00Z");
    let (root, store) = test_store("offline-paid-period");
    let mut authority = Authority::restore(&store, 1_700_000_000_123).expect("autoridad");
    authority
        .install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("firma"),
            cancelled,
            Duration::ZERO,
        )
        .expect("instalar");
    authority.persist(&store).expect("guardar");
    drop(authority);
    // Restauración local sin proveedor HTTP: el pago no depende de renovar OAuth.
    let mut authority = Authority::restore(&store, 1_700_000_000_123).expect("restaurar");
    authority
        .install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("caché firmada"),
            cancelled,
            Duration::ZERO,
        )
        .expect("binding");
    for (seconds, active) in [
        (3 * 3600, true),
        (3 * 86400, true),
        (17 * 86400 - 1, true),
        (17 * 86400, false),
        (17 * 86400 + 1, false),
    ] {
        let rights = authority
            .rights(
                cancelled + chrono::TimeDelta::seconds(seconds),
                Duration::from_secs(u64::try_from(seconds).expect("duración")),
            )
            .expect("offline");
        assert_eq!(
            rights.iter().any(|right| right == "vantare.plan.pro"),
            active
        );
        assert!(authority.credential_current());
    }
    drop(authority);
    drop(store);
    cleanup_store(&root, "offline-paid-period", &["authority"]);
}

#[test]
fn forward_wall_clock_drift_does_not_reject_repeated_authority_observation() {
    use authority::Authority;
    let (root, store) = test_store("clock-drift");
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let start = date("2026-09-30T10:30:00Z").expect("date");
    let mut core = Authority::restore(&store, 1_700_000_000_123).expect("core");
    core.install(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("proof"),
        start,
        Duration::ZERO,
    )
    .expect("install");
    // El host observa el mismo par wall/tick al entrar y al consultar derechos.
    let wall = start + chrono::TimeDelta::milliseconds(999);
    let tick = Duration::from_secs(1);
    core.enter_game(7, wall, tick).expect("entry");
    assert_eq!(
        core.rights(wall, tick)
            .expect("same observation is valid")
            .len(),
        1
    );
    assert_eq!(
        core.rights(
            wall + chrono::TimeDelta::microseconds(1),
            tick + Duration::from_micros(1)
        )
        .expect("wall still advances")
        .len(),
        1
    );
    assert!(
        matches!(
            core.rights(
                wall - chrono::TimeDelta::microseconds(1),
                tick + Duration::from_micros(2)
            ),
            Err(Error::Clock)
        ),
        "actual wall rollback is denied"
    );
    // Fuera de juego no hay gracia; la deriva no alarga el vencimiento.
    core.leave_game();
    assert!(
        core.rights(
            start + chrono::TimeDelta::seconds(1799),
            Duration::from_mins(30)
        )
        .expect("exact monotonic expiry")
        .is_empty()
    );
    core.persist(&store).expect("persist");
    let mut restored = Authority::restore(&store, 1_700_000_000_123).expect("restore");
    assert!(
        matches!(
            restored.install(
                verifier
                    .v1(&credential, SUBJECT, "test-device")
                    .expect("proof"),
                start,
                Duration::ZERO
            ),
            Err(Error::Clock)
        ),
        "cold restart preserves rollback protection"
    );
    drop(store);
    cleanup_store(&root, "clock-drift", &["authority"]);
}

#[test]
fn signed_future_issuance_is_bounded_and_never_extends_the_paid_deadline() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let issued = date("2026-09-30T10:00:00Z").expect("issued");
    let credential = v1(&signing, "2026-09-30T10:01:00Z");
    for skew in [32, 300, 301] {
        let (root, store) = test_store("clock-skew");
        let wall = issued - chrono::TimeDelta::seconds(skew);
        let mut core = Authority::restore(&store, 1_700_000_000_123).expect("core");
        let installed = core.install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("signed"),
            wall,
            Duration::ZERO,
        );
        if skew == 301 {
            assert!(matches!(installed, Err(Error::Clock)));
            assert!(!core.credential_current());
        } else {
            installed.expect("bounded skew accepted");
            assert_eq!(
                core.next_deadline(&["vantare.plan.pro".into()]),
                Some(wall + chrono::TimeDelta::seconds(60))
            );
            core.persist(&store).expect("persist adjusted clock");
            let mut core = Authority::restore(&store, 1_700_000_000_123).expect("cold restore");
            core.install(
                verifier
                    .v1(&credential, SUBJECT, "test-device")
                    .expect("signed"),
                wall + chrono::TimeDelta::seconds(1),
                Duration::ZERO,
            )
            .expect("accepted skew survives restart");
            assert_eq!(
                core.rights(
                    wall + chrono::TimeDelta::seconds(59),
                    Duration::from_secs(58)
                )
                .expect("before real expiry")
                .len(),
                1
            );
            assert!(
                core.rights(
                    wall + chrono::TimeDelta::seconds(60),
                    Duration::from_secs(59)
                )
                .expect("exact real expiry")
                .is_empty()
            );
            assert!(
                matches!(
                    core.rights(
                        wall + chrono::TimeDelta::seconds(59),
                        Duration::from_mins(1)
                    ),
                    Err(Error::Clock)
                ),
                "rollback still rejected"
            );
        }
        drop(store);
        cleanup_store(&root, "clock-skew", &[]);
    }
}

#[test]
#[ignore = "Manual: credencial y pública QA emitidas en staging, sin red ni secretos de firma"]
fn staging_signed_credential_accepts_only_bounded_injected_clock_skew() {
    let credential_file =
        std::env::var_os("VANTARE_QA_STAGING_CREDENTIAL_FILE").expect("QA credential path");
    let keys_file =
        std::env::var_os("VANTARE_QA_STAGING_PUBLIC_KEYS_FILE").expect("QA public keys path");
    let response: serde_json::Value =
        serde_json::from_slice(&std::fs::read(credential_file).expect("QA credential"))
            .expect("QA response");
    let credential: CredentialV1 =
        serde_json::from_value(response["credential"].clone()).expect("QA envelope");
    assert!(
        credential.key_id.starts_with("license-qa-"),
        "production credentials are not allowed in this probe"
    );
    let keys = std::fs::read_to_string(keys_file).expect("QA public registry");
    let verifier =
        Verifier::public_keys(keys.trim_start_matches('\u{feff}').trim()).expect("QA trust roots");
    let issued = date(&credential.claims.issued_at).expect("signed issuance");
    for skew in [-32, 0, 32, 300, 301] {
        let (root, store) = test_store("staging-clock-probe");
        let mut authority =
            authority::Authority::restore(&store, 1_700_000_000_123).expect("authority");
        let proof = verifier
            .v1(
                &credential,
                &credential.claims.subject,
                &credential.claims.device_fingerprint,
            )
            .expect("actual staging signature and binding");
        let result = authority.install(
            proof,
            issued - chrono::TimeDelta::seconds(skew),
            Duration::ZERO,
        );
        if skew > 300 {
            assert!(matches!(result, Err(Error::Clock)));
            assert!(!authority.credential_current());
        } else {
            result.expect("bounded signed QA issuance accepted");
            assert!(authority.credential_current());
        }
        drop(store);
        cleanup_store(&root, "staging-clock-probe", &[]);
    }
}

#[test]
fn out_of_range_saved_clock_is_quarantined_and_allows_a_fresh_signed_login() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let now = date(&credential.claims.issued_at).expect("issuance");
    for forward in [-1, 300_001, i64::MIN, i64::MAX] {
        let (root, store) = test_store("invalid-saved-clock");
        store.save("authority", &serde_json::json!({
            "version":1, "clock":{"last_seen":null,"latest_issued":null,"invalidated_after":null,"last_wall":null,"forward_millis":forward},
            "game":null,"invalidated":false
        })).expect("valid JSON with invalid clock");
        let mut core = Authority::restore(&store, 1_700_000_000_123)
            .expect("recover instead of blocking every startup");
        assert!(!core.credential_current());
        assert!(
            core.rights(now, Duration::ZERO)
                .expect("invalidated default")
                .is_empty()
        );
        let saved = store
            .fixture::<serde_json::Value>("authority")
            .expect("denied recovery state is durable before any binding");
        assert_eq!(saved["invalidated"], true);
        assert!(
            store
                .fixture::<bool>("authority-recovery")
                .expect("recovery guard")
        );
        assert!(
            std::fs::read_dir(&root)
                .expect("own test root")
                .any(|entry| std::fs::read_dir(entry.expect("namespace").path())
                    .expect("namespace files")
                    .any(|file| {
                        let name = file.expect("file").file_name();
                        let name = name.to_string_lossy();
                        name.starts_with("authority-1700000000123-") && name.ends_with(".corrupto")
                    })),
            "quarantine retains the invalid document"
        );
        let mut reopened =
            Authority::restore(&store, 1_700_000_000_123).expect("next startup also recovers");
        assert!(!reopened.credential_current());
        assert!(
            matches!(
                reopened.install(
                    verifier
                        .v1(&credential, SUBJECT, "test-device")
                        .expect("cached signature"),
                    now,
                    Duration::ZERO,
                ),
                Err(Error::Denied)
            ),
            "a disk credential cannot repair the authority"
        );
        reopened
            .install_online(
                verifier
                    .v1(&credential, SUBJECT, "test-device")
                    .expect("signature"),
                now,
                Duration::ZERO,
            )
            .expect("fresh login is usable");
        assert!(reopened.credential_current());
        drop(store);
        cleanup_store(&root, "invalid-saved-clock", &[]);
    }
}

#[test]
fn logout_tombstone_survives_forward_adjustment_and_cold_restore() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let issued = date(&credential.claims.issued_at).expect("issuance");
    let wall = issued - chrono::TimeDelta::seconds(32);
    let (root, store) = test_store("forward-tombstone");
    let mut core = Authority::restore(&store, 1_700_000_000_123).expect("authority");
    core.install(
        verifier
            .v1(&credential, SUBJECT, "test-device")
            .expect("signature"),
        wall,
        Duration::ZERO,
    )
    .expect("signed forward adjustment");
    core.invalidate(wall + chrono::TimeDelta::seconds(1), Duration::from_secs(1))
        .expect("logout");
    core.persist(&store).expect("durable tombstone");
    let mut restored = Authority::restore(&store, 1_700_000_000_123).expect("restart");
    assert!(matches!(
        restored.install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("old signature"),
            wall + chrono::TimeDelta::seconds(2),
            Duration::ZERO
        ),
        Err(Error::Denied)
    ));
    assert!(!restored.credential_current());
    assert!(
        restored
            .rights(wall + chrono::TimeDelta::seconds(2), Duration::ZERO)
            .expect("no rights after logout")
            .is_empty()
    );
    let mut fresh = credential;
    fresh.claims.issued_at = (issued + chrono::TimeDelta::seconds(3)).to_rfc3339();
    fresh.signature = URL_SAFE_NO_PAD.encode(
        signing
            .sign(&fresh.signing_bytes().expect("fresh payload"))
            .to_bytes(),
    );
    restored
        .install(
            verifier
                .v1(&fresh, SUBJECT, "test-device")
                .expect("fresh signature"),
            wall + chrono::TimeDelta::seconds(3),
            Duration::from_secs(1),
        )
        .expect("new issuance after logout may sign in");
    assert!(restored.credential_current());
    drop(store);
    cleanup_store(&root, "forward-tombstone", &[]);
}

#[test]
fn successive_signed_issuances_cannot_exceed_the_accumulated_clock_limit() {
    use authority::Authority;
    let signing = key();
    let verifier = verifier(&signing);
    let credential = v1(&signing, "2026-09-30T11:00:00Z");
    let issued = date(&credential.claims.issued_at).expect("issuance");
    let wall = issued - chrono::TimeDelta::seconds(200);
    for additional in [100, 101] {
        let (root, store) = test_store("accumulated-clock-limit");
        let mut core = Authority::restore(&store, 1_700_000_000_123).expect("authority");
        core.install(
            verifier
                .v1(&credential, SUBJECT, "test-device")
                .expect("first signature"),
            wall,
            Duration::ZERO,
        )
        .expect("first 200 seconds");
        let previous_deadline = core
            .next_deadline(&["vantare.plan.pro".into()])
            .expect("paid deadline");
        let mut next = credential.clone();
        next.claims.issued_at = (issued + chrono::TimeDelta::seconds(additional)).to_rfc3339();
        next.signature = URL_SAFE_NO_PAD.encode(
            signing
                .sign(&next.signing_bytes().expect("next payload"))
                .to_bytes(),
        );
        let result = core.install(
            verifier
                .v1(&next, SUBJECT, "test-device")
                .expect("second signature"),
            wall,
            Duration::ZERO,
        );
        if additional == 100 {
            result.expect("accumulated 300 seconds accepted");
        } else {
            assert!(
                matches!(result, Err(Error::Clock)),
                "200 plus 101 must not bypass the limit"
            );
        }
        assert!(
            core.next_deadline(&["vantare.plan.pro".into()])
                .expect("deadline remains valid")
                <= previous_deadline,
            "neither acceptance nor rejection extends the paid deadline"
        );
        drop(store);
        cleanup_store(&root, "accumulated-clock-limit", &[]);
    }
}

#[test]
fn founders_keeps_perpetual_nightly_after_pro_plus_expires() {
    let founder = Capability {
        key: "vantare.plan.founders".into(),
        paid_through: String::new(),
        perpetual: true,
        scope_version: String::new(),
    };
    let nightly = Capability {
        key: "vantare.channel.nightly".into(),
        ..founder.clone()
    };
    assert!(grants(std::slice::from_ref(&nightly)).is_err());
    assert_eq!(
        grants(&[nightly, founder]).expect("Founder Nightly").len(),
        2
    );
}

#[test]
#[cfg(any(windows, unix))]
fn server_recovery_v1_fixture_verifies_and_expires_at_original_deadline() {
    // Deno compares this artifact with issueCredential; no production trust root.
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../testdata/license/recovery-v1.json"))
            .expect("server fixture");
    let credential: CredentialV1 =
        serde_json::from_value(fixture["credential"].clone()).expect("v1 envelope");
    let verifier = Verifier::public_keys(&format!(
        "{}:{}",
        credential.key_id,
        fixture["public_key"].as_str().expect("public fixture key")
    ))
    .expect("fixture registry");
    let issued = date(&credential.claims.issued_at).expect("issued");
    let deadline = date(fixture["recovery_until"].as_str().expect("deadline")).expect("date");
    let (root, store) = test_store("server-recovery-v1");
    let mut authority =
        authority::Authority::restore(&store, 1_700_000_000_123).expect("authority");
    let verify = || {
        verifier
            .v1(&credential, SUBJECT, &"a".repeat(64))
            .expect("server signature and binding")
    };
    let proof = verify();
    assert_eq!(proof.grants().len(), 2);
    assert!(
        proof
            .grants()
            .iter()
            .all(|grant| grant.expires_at == Some(deadline))
    );
    authority
        .install(proof, issued, Duration::ZERO)
        .expect("install");
    // A fresh server issuance one day later still carries the original deadline.
    let renewed: CredentialV1 =
        serde_json::from_value(fixture["renewed_credential"].clone()).expect("renewed v1 envelope");
    let new_proof = verifier
        .v1(&renewed, SUBJECT, &"a".repeat(64))
        .expect("renewed server signature");
    assert!(
        new_proof
            .grants()
            .iter()
            .all(|grant| grant.expires_at == Some(deadline))
    );
    authority
        .install(
            new_proof,
            issued + chrono::TimeDelta::days(1),
            Duration::from_hours(24),
        )
        .expect("new issuance retains original recovery deadline");
    // Replay of that same issuance also cannot restart the window.
    authority
        .install(
            verifier
                .v1(&renewed, SUBJECT, &"a".repeat(64))
                .expect("replay signature"),
            issued + chrono::TimeDelta::days(1),
            Duration::from_hours(24),
        )
        .expect("replay");
    let remaining = deadline.signed_duration_since(issued).num_seconds();
    assert_eq!(
        remaining,
        48 * 3600,
        "issuance did not restart the original 72h cycle"
    );
    for seconds in [remaining - 1, remaining, remaining + 1] {
        let rights = authority
            .rights(
                issued + chrono::TimeDelta::seconds(seconds),
                Duration::from_secs(seconds.cast_unsigned()),
            )
            .expect("rights");
        assert_eq!(rights.len(), if seconds < remaining { 2 } else { 0 });
    }
    drop(store);
    cleanup_store(&root, "server-recovery-v1", &[]);
}
