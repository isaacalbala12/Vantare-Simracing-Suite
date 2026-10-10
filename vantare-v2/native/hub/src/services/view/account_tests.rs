use super::*;
#[test]
fn second_action_during_automatic_refresh_reports_instead_of_dropping() {
    assert_eq!(
        Remote::background_discard_message(None, &Command::LicenseRenew),
        None
    );
    assert_eq!(
        Remote::background_discard_message(Some(&Command::AccountPoll), &Command::Logout),
        None
    );
    assert_eq!(
        Remote::background_discard_message(Some(&Command::AccountPoll), &Command::LicenseRenew),
        Some("Operación en curso")
    );
}
#[test]
fn calendar_waits_for_heartbeat_without_losing_queued_user_actions() {
    let mut queued = Some(Command::Logout);
    assert!(matches!(
        next_request(Some(Command::AccountPoll), &mut queued, true),
        Some(Command::AccountPoll)
    ));
    assert!(matches!(queued, Some(Command::Logout)));
    assert!(matches!(
        next_request(None, &mut queued, true),
        Some(Command::Logout)
    ));
    assert!(queued.is_none());
    assert!(matches!(
        next_request(None, &mut queued, true),
        Some(Command::CalendarRefresh)
    ));
    // Entregar la respuesta retira el destino pendiente: no repite la red.
    assert!(next_request(None, &mut queued, false).is_none());
}

#[test]
fn heartbeat_cadence_keeps_cached_core_policy_current_until_delivery() {
    // Núcleo cachea 1 s, shell sondea cada 100 ms y entrega IPC cada 250 ms.
    // Simula todas las fases del cache; no modifica el TTL de Policy.
    let interval = u64::try_from(LICENSE_POLL.as_millis()).expect("interval");
    for cache_age in 0..1000 {
        let policy = vantare_ipc::control::Policy {
            version: vantare_ipc::control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            overlays_advanced: true,
            ..Default::default()
        };
        assert!(
            policy.current_at(1000 + cache_age + interval + 100 + 250),
            "el heartbeat caduca antes de la entrega: cache={cache_age}"
        );
    }
}

#[test]
fn beta_modules_remain_upcoming_even_with_verified_module_rights() {
    for section in [Section::Strategy, Section::Engineer] {
        for included in [false, true] {
            assert_eq!(account_module_status(section, included), "Próximamente");
        }
    }
    assert_eq!(account_module_status(Section::Studio, true), "Incluido");
    assert_eq!(
        account_module_status(Section::Launcher, false),
        "Sin verificar"
    );
}

#[test]
fn account_modules_follow_navigation_permissions() {
    for (access, expected) in [
        (Access::default(), [false; 6]),
        (
            Access {
                verified: true,
                ..Access::default()
            },
            [true, true, false, false, false, false],
        ),
        (
            Access {
                verified: true,
                engineer: true,
                strategy: true,
                calendar: true,
                analysis: true,
                ..Access::default()
            },
            [true; 6],
        ),
    ] {
        assert_eq!(account_module_access(access, false), expected);
        assert_eq!(
            account_module_access(
                Access {
                    blocked: true,
                    ..access
                },
                false
            ),
            [false; 6]
        );
    }
    assert_eq!(account_plan_label(true), "Acceso verificado");
    assert_eq!(account_plan_label(false), "Acceso sin verificar");
}
