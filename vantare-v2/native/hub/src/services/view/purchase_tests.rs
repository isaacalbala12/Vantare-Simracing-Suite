use super::super::protocol::{BillingProduct, DraftState, report_document::Receipt};
use super::*;

#[test]
fn participation_can_retry_after_background_busy_or_failed_ipc_dispatch() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            remote.account.signed_in = true;
            remote.inflight = Inflight::Background;
            remote.queued = Some(Command::DraftLoad);
            remote.participation_request(Command::TestingRefresh, cx);
            assert!(remote.participation_pending.is_none());
            assert!(matches!(remote.queued, Some(Command::DraftLoad)));
            assert!(requests.try_recv().is_err());
            remote.inflight = Inflight::Idle;
            remote.queued = None;
            remote.account.pending = true;
            remote.participation_request(Command::TestingRefresh, cx);
            assert!(remote.participation_pending.is_none());
            assert!(requests.try_recv().is_err());
            remote.account.pending = false;
            drop(requests);
            remote.participation_request(Command::TestingRefresh, cx);
            assert!(remote.participation_pending.is_none());
            assert_ne!(remote.participation_message, "Consultando el servicio…");
            assert!(
                remote.participation_ready(),
                "failed dispatch remains retryable"
            );
        });
        crate::quit_headless_test(cx);
    });
}

#[test]
fn participation_is_cleared_on_logout_and_delayed_reply_cannot_restore_private_data() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, _requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            let data = super::super::protocol::testing_document::Participation {
                questionnaires: vec![],
                contributions: vec![super::super::protocol::testing_document::Contribution {
                    id: "15350000-0000-0000-0000-000000000001".into(),
                    title: "Privado".into(),
                    body: "Solo esta cuenta".into(),
                    state: "received".into(),
                }],
            };
            remote.participation_pending = Some(remote.participation_generation);
            remote.complete(Reply::Testing { data: data.clone() }, cx);
            assert_eq!(remote.participation.contributions.len(), 1);
            let generation = remote.participation_generation;
            remote.request(Command::Logout, cx);
            assert!(remote.participation.contributions.is_empty());
            assert_ne!(remote.participation_generation, generation);
            remote.complete(Reply::Testing { data }, cx);
            assert!(remote.participation.contributions.is_empty());
        });
        crate::quit_headless_test(cx);
    });
}
fn fixture(cx: &mut Context<Remote>, send: SyncSender<Command>, data: &std::path::Path) -> Remote {
    let recovery = crate::testing::recovery::Recovery::load(data);
    let editor = crate::testing::Editor::new(crate::testing::empty_fields(), cx);
    let mut remote = Remote {
        adapt: orbit::Adapt::default(),
        pipe: "qa-in-memory".into(),
        send: Some(send),
        receive: None,
        stop: Arc::new(AtomicBool::new(false)),
        cancellation: None,
        worker: None,
        connection_incompatible: Arc::new(AtomicBool::new(false)),
        rights: None,
        inflight: Inflight::Idle,
        queued: None,
        account: AccountState::default(),
        access: access::State::from_build(),
        device_limit: false,
        license_polled_at: None,
        purchase_product: None,
        purchase_wait: None,
        purchase_message: None,
        message: "Cuenta no disponible".into(),
        active: Area::Account,
        calendar_target: None,
        report_revision: None,
        editor,
        report_receipts: Vec::new(),
        participation: crate::services::protocol::testing_document::Participation::default(),
        participation_message: "Recarga para consultar cuestionarios y contribuciones".into(),
        participation_pending: None,
        participation_generation: 0,
        recovery,
        publication: None,
        roadmap_message: "No hay una publicación válida guardada".into(),
        roadmap_requested: false,
        manual_roadmap: crate::roadmap::State::load(),
        stale: true,
    };
    remote.account.signed_in = true;
    remote.account.profile = Some(super::super::protocol::AccountProfile::default());
    remote.access.observe(&session_reply("QA", u64::MAX), true);
    remote
}
fn session_reply(message: &str, expires_at: u64) -> Reply {
    Reply::Account {
        profile: None,
        signed_in: true,
        expires_at: Some(expires_at),
        pending: false,
        message: message.into(),
        error: None,
    }
}
fn license(catalog: vantare_ipc::control::CatalogAccess) -> Reply {
    Reply::License {
        message: "QA derechos".into(),
        policy: vantare_ipc::control::Policy {
            version: vantare_ipc::control::VERSION,
            revision: 1,
            checked_at_ms: vantare_ipc::control::wall_ms().expect("reloj"),
            overlays_advanced: true,
            catalog,
            ..Default::default()
        },
    }
}
fn confirmed_core_license(remote: &mut Remote, cx: &mut Context<Remote>) {
    let reply = license(vantare_ipc::control::CatalogAccess::Pro);
    if let Reply::License { policy, .. } = &reply {
        // La misma observación que entrega Feed, independiente del reply HTTP.
        remote.observe_core_policy(policy.clone(), policy.checked_at_ms, cx);
    }
    remote.complete(reply, cx);
}
#[test]
fn old_session_fetches_profile_once_quietly_and_offline_keeps_rights() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            let Reply::License { policy, .. } = license(vantare_ipc::control::CatalogAccess::Pro)
            else {
                unreachable!()
            };
            remote.observe_core_policy(policy.clone(), policy.checked_at_ms, cx);
            let access = remote.navigation_access();
            remote.account.profile = None; // Sesión escrita por 0.0.974.
            remote.complete(session_reply("Sesión restaurada", u64::MAX), cx);
            assert!(matches!(
                requests.try_recv(),
                Ok(Command::AccountProfileRefresh)
            ));
            assert!(requests.try_recv().is_err());
            assert!(!remote.working());
            assert!(!remote.holds_hub_in_game());
            assert_eq!(remote.navigation_access(), access);
            let message = remote.message.clone();
            let mut failed = session_reply("No hay red para el perfil", u64::MAX);
            if let Reply::Account { error, .. } = &mut failed {
                *error = Some("offline".into());
            }
            remote.complete(failed, cx);
            assert_eq!(remote.navigation_access(), access);
            assert_eq!(remote.message, message);
            assert_eq!(remote.home_access(), (false, None));
            assert!(remote.account.avatar.is_none());
            remote.complete(session_reply("Lectura de sesión", u64::MAX), cx);
            assert!(
                requests.try_recv().is_err(),
                "sin renovación ni bucle del perfil"
            );
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn profile_refresh_preserves_rights_and_pending_reply_but_logout_clears_photo() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            let Reply::License { policy, .. } = license(vantare_ipc::control::CatalogAccess::Pro)
            else {
                unreachable!()
            };
            let now = policy.checked_at_ms;
            remote.observe_core_policy(policy.clone(), now, cx);
            let rights = remote.navigation_access();
            let profile = super::super::protocol::AccountProfile {
                name: "Élise Fixture".into(),
                ..Default::default()
            };
            remote.request(Command::AccountProfileRefresh, cx);
            remote.request(Command::AccountProfileRefresh, cx);
            assert!(matches!(
                requests.try_recv(),
                Ok(Command::AccountProfileRefresh)
            ));
            assert!(requests.try_recv().is_err(), "una actualización explícita");
            remote.complete(
                Reply::Account {
                    signed_in: true,
                    profile: Some(profile.clone()),
                    expires_at: Some(u64::MAX),
                    pending: false,
                    message: "Perfil actualizado".into(),
                    error: None,
                },
                cx,
            );
            assert_eq!(remote.profile_name(), "Élise Fixture");
            assert_eq!(orbit::initials(remote.profile_name()), "ÉF");
            assert_eq!(remote.navigation_access(), rights);
            assert!(!remote.working());
            assert!(
                requests.try_recv().is_err(),
                "el perfil no renueva ni sondea licencia"
            );
            remote.complete(
                Reply::Account {
                    signed_in: true,
                    profile: None,
                    expires_at: None,
                    pending: true,
                    message: "Esperando callback".into(),
                    error: None,
                },
                cx,
            );
            assert_eq!(remote.profile_name(), "Élise Fixture");
            assert_eq!(remote.navigation_access(), rights);
            assert!(matches!(requests.try_recv(), Ok(Command::AccountPoll)));
            remote.complete(
                Reply::Account {
                    signed_in: true,
                    profile: Some(profile),
                    expires_at: Some(u64::MAX),
                    pending: false,
                    message: "Sesión".into(),
                    error: None,
                },
                cx,
            );
            // Heartbeats con revisión distinta no cambian la proyección ni ocupan User.
            for revision in 2..8 {
                remote.observe_core_policy(
                    vantare_ipc::control::Policy {
                        revision,
                        ..policy.clone()
                    },
                    now,
                    cx,
                );
                assert_eq!(remote.navigation_access(), rights);
                assert!(!remote.working());
                assert!(requests.try_recv().is_err());
            }
            remote.request(Command::Logout, cx);
            assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
            remote.complete(
                Reply::Account {
                    signed_in: false,
                    profile: None,
                    expires_at: None,
                    pending: false,
                    message: "Sesión cerrada".into(),
                    error: None,
                },
                cx,
            );
            assert!(remote.account.profile.is_none());
            assert!(remote.account.avatar.is_none());
            assert!(!remote.navigation_access().verified);
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn denied_policy_keeps_manual_retry_and_logout_without_granting_tools() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        for denial in ["revoked", "expired", "missing"] {
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                let Reply::License { mut policy, .. } =
                    license(vantare_ipc::control::CatalogAccess::Pro)
                else {
                    unreachable!()
                };
                let now = policy.checked_at_ms;
                match denial {
                    "revoked" => policy.error = Some("revocada".into()),
                    "expired" => policy.valid_until_ms = Some(now),
                    _ => policy = vantare_ipc::control::Policy::default(),
                }
                remote.observe_core_policy(policy, now, cx);
                let access = remote.navigation_access();
                assert_eq!(access.beta_lock(Section::Account), None);
                assert!(remote.account.signed_in && !remote.working());
                assert!(!access.verified);
                assert!(
                    account_module_access(access, false)
                        .iter()
                        .all(|included| !included)
                );
                remote.request(Command::LicenseRenew, cx);
                remote.request(Command::LicenseRenew, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::LicenseRenew)));
                assert!(requests.try_recv().is_err(), "un envío manual");
                remote.complete(
                    Reply::Error {
                        message: "QA reintento fallido".into(),
                    },
                    cx,
                );
                assert_eq!(remote.message, "QA reintento fallido");
                assert!(!remote.working());
                remote.request(Command::LicenseRenew, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::LicenseRenew)));
                remote.complete(license(vantare_ipc::control::CatalogAccess::Pro), cx);
                assert!(remote.message.contains("QA derechos"));
                assert!(matches!(requests.try_recv(), Ok(Command::AccountPoll)));
                assert!(
                    !remote.navigation_access().verified,
                    "reply no restaura derechos"
                );
                remote.complete(session_reply("QA sesión confirmada", u64::MAX), cx);
                remote.request(Command::Logout, cx);
                if !remote.working() {
                    remote.request(Command::Logout, cx);
                }
                assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                assert!(requests.try_recv().is_err(), "un cierre de sesión");
                remote.complete(
                    Reply::Account {
                        profile: None,
                        signed_in: false,
                        expires_at: None,
                        pending: false,
                        message: "QA sesión cerrada".into(),
                        error: None,
                    },
                    cx,
                );
                assert!(!remote.account.signed_in);
                assert!(!remote.navigation_access().verified);
                assert!(requests.try_recv().is_err());
                remote.cancel();
            });
        }
        crate::quit_headless_test(cx);
    });
}
#[test]
fn slow_renewal_keeps_fresh_core_access_but_revocation_logout_and_missing_core_deny() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            for delay in [3500, 8000] {
                remote.inflight = Inflight::PurchaseRenew;
                let mut policy = vantare_ipc::control::Policy {
                    version: vantare_ipc::control::VERSION,
                    epoch: 1,
                    revision: 1,
                    checked_at_ms: 1000,
                    overlays_advanced: true,
                    catalog: vantare_ipc::control::CatalogAccess::Pro,
                    calendar: true,
                    tester: true,
                    ..Default::default()
                };
                let old = policy.clone();
                for now in (1000..=1000 + delay).step_by(500) {
                    policy.checked_at_ms = now;
                    remote.observe_core_policy(policy.clone(), now, cx);
                    let access = remote.access.navigation(true, now);
                    assert!(remote.busy() && !remote.working());
                    assert!(access.verified);
                    assert_eq!(access.catalog, policy.catalog);
                    for section in [
                        Section::Launcher,
                        Section::Roadmap,
                        Section::Testing,
                        Section::Calendar,
                    ] {
                        assert!(access.lock(section).is_none(), "ruta {section:?} a {now}");
                    }
                    assert!(access.beta_visible(Section::Testing));
                    assert!(access.beta_visible(Section::Calendar));
                }
                let now = 1000 + delay;
                assert!(!old.current_at(now), "la foto vieja habría caducado");
                remote.complete(
                    Reply::License {
                        policy: old,
                        message: "reply lento".into(),
                    },
                    cx,
                );
                assert!(
                    remote.access.navigation(true, now).verified,
                    "reply tardío no pisa Feed"
                );
                assert!(matches!(requests.try_recv(), Ok(Command::AccountPoll)));
                policy.error = Some("revocación definitiva QA".into());
                remote.observe_core_policy(policy.clone(), now, cx);
                assert!(!remote.access.navigation(true, now).verified);
                policy.error = None;
                remote.observe_core_policy(policy.clone(), now, cx);
                assert!(remote.access.navigation(true, now).verified);
                remote.observe_core_policy(vantare_ipc::control::Policy::default(), now, cx);
                assert!(
                    !remote.access.navigation(true, now).verified,
                    "núcleo ausente"
                );
                remote.observe_core_policy(policy.clone(), now, cx);
                assert!(
                    !remote.access.navigation(true, now + 2000).verified,
                    "TTL intacto"
                );
                remote.access.requested(&Command::Logout);
                remote.observe_core_policy(policy, now, cx);
                assert!(
                    !remote.access.navigation(true, now).verified,
                    "logout domina Feed"
                );
                // Otra sesión confirmada para el segundo caso del reloj simulado.
                remote.access = access::State::from_build();
                remote.access.observe(
                    &Reply::Account {
                        profile: None,
                        signed_in: true,
                        expires_at: Some(u64::MAX),
                        pending: false,
                        message: String::new(),
                        error: None,
                    },
                    true,
                );
            }
            remote.cancel();
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn purchase_poll_preserves_user_context_queues_actions_and_reloads_session_quietly() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        let calendar = cx.new(|_| {
            crate::calendar::Calendar::load(file.path.parent().expect("root")).expect("calendario")
        });
        remote.update(cx, |remote, cx| {
            remote.message = "Resultado de usuario".into();
            remote.active = Area::Report;
            remote.editor.dirty = true;
            remote.editor.message = "Borrador conservado".into();
            remote.purchase_message = Some("Compra abierta".into());
            remote.purchase_wait = Some(PurchaseWait {
                product: BillingProduct::ProMonthly,
                started: std::time::Instant::now(),
                polled: None,
            });
            assert!(
                remote.dispatch_with_kind(Command::LicenseRenew, Some(Inflight::PurchaseRenew))
            );
            assert!(!remote.working());
            assert!(!remote.holds_hub_in_game());
            assert!(matches!(remote.active, Area::Report));
            assert!(remote.refresh_calendar(calendar.downgrade(), cx));
            remote.request(Command::ReportPrepare, cx);
            assert!(matches!(requests.try_recv(), Ok(Command::LicenseRenew)));
            // El servicio demora su respuesta: no llega aún la acción encolada.
            assert!(requests.try_recv().is_err());
            remote.complete(license(vantare_ipc::control::CatalogAccess::Free), cx);
            assert!(matches!(requests.try_recv(), Ok(Command::AccountPoll)));
            assert!(!remote.working());
            assert_eq!(remote.message, "Resultado de usuario");
            assert_eq!(remote.purchase_message.as_deref(), Some("Compra abierta"));
            remote.complete(session_reply("Sesión releída", u64::MAX - 1), cx);
            assert!(matches!(requests.try_recv(), Ok(Command::ReportPrepare)));
            assert!(remote.working());
            assert_eq!(remote.message, "Resultado de usuario");
            remote.complete(
                Reply::Error {
                    message: "QA error del informe".into(),
                },
                cx,
            );
            assert_eq!(remote.editor.message, "QA error del informe");
            assert!(remote.editor.dirty);
            assert!(matches!(requests.try_recv(), Ok(Command::CalendarRefresh)));
            remote.complete(
                Reply::Error {
                    message: "QA error de calendario".into(),
                },
                cx,
            );
            assert!(remote.calendar_target.is_none());
            assert_eq!(remote.message, "Resultado de usuario");
            assert!(remote.dispatch_with_kind(Command::RoadmapRefresh, None));
            remote.complete(
                Reply::Error {
                    message: "QA error de roadmap".into(),
                },
                cx,
            );
            assert_eq!(remote.roadmap_status(), "QA error de roadmap");
            assert_eq!(remote.message, "Resultado de usuario");
            assert!(
                remote.dispatch_with_kind(Command::LicenseRenew, Some(Inflight::PurchaseRenew))
            );
            confirmed_core_license(remote, cx);
            assert!(remote.purchase_wait.is_none());
            assert!(!remote.working());
            remote.complete(session_reply("QA", u64::MAX - 2), cx);
            assert!(remote.dispatch_with_kind(Command::LicenseRenew, None));
            assert!(remote.working());
            remote.complete(license(vantare_ipc::control::CatalogAccess::Pro), cx);
            assert!(remote.message.starts_with("QA derechos"));
            assert!(
                remote.working(),
                "renovación manual relee OAuth con feedback"
            );
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn roadmap_request_queues_once_during_a_delayed_purchase_poll() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            assert!(
                remote.dispatch_with_kind(Command::LicenseRenew, Some(Inflight::PurchaseRenew))
            );
            assert!(matches!(requests.try_recv(), Ok(Command::LicenseRenew)));
            remote.ensure_roadmap(cx);
            remote.ensure_roadmap(cx);
            assert!(remote.roadmap_requested);
            assert!(!remote.working());
            assert!(requests.try_recv().is_err());
            remote.complete(license(vantare_ipc::control::CatalogAccess::Free), cx);
            assert!(matches!(requests.try_recv(), Ok(Command::AccountPoll)));
            remote.complete(session_reply("QA", u64::MAX), cx);
            assert!(matches!(requests.try_recv(), Ok(Command::RoadmapCached)));
            assert!(requests.try_recv().is_err());
            remote.complete(
                Reply::Error {
                    message: "QA error de publicación encolada".into(),
                },
                cx,
            );
            assert_eq!(remote.roadmap_status(), "QA error de publicación encolada");
        });
        crate::quit_headless_test(cx);
    });
}
#[test]
fn purchase_wait_is_bounded_and_requires_the_requested_verified_catalog() {
    let now = std::time::Instant::now();
    for product in [
        BillingProduct::ProMonthly,
        BillingProduct::ProAnnual,
        BillingProduct::LaunchLifetime,
    ] {
        let wait = PurchaseWait {
            product,
            started: now,
            polled: Some(now),
        };
        assert!(!wait.due(now + std::time::Duration::from_secs(4)));
        assert!(wait.due(now + std::time::Duration::from_secs(5)));
        assert!(!wait.expired(now + std::time::Duration::from_secs(599)));
        assert!(wait.expired(now + std::time::Duration::from_mins(10)));
        assert!(!wait.confirmed(Access::default()));
        let pro = Access {
            verified: true,
            catalog: vantare_ipc::control::CatalogAccess::Pro,
            ..Default::default()
        };
        assert!(wait.confirmed(pro));
        assert!(!wait.confirmed(Access {
            blocked: true,
            ..pro
        }));
    }
}
#[test]
fn background_errors_logout_and_receipts_never_grant_access_or_lose_the_draft() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            remote.editor.dirty = true;
            remote.purchase_wait = Some(PurchaseWait {
                product: BillingProduct::LaunchLifetime,
                started: std::time::Instant::now(),
                polled: None,
            });
            assert!(
                remote.dispatch_with_kind(Command::LicenseRenew, Some(Inflight::PurchaseRenew))
            );
            remote.complete(
                Reply::Error {
                    message: "QA red".into(),
                },
                cx,
            );
            assert!(!remote.navigation_access().verified);
            assert!(remote.purchase_wait.is_some());
            assert!(remote.editor.dirty);
            assert!(
                remote.dispatch_with_kind(Command::LicenseRenew, Some(Inflight::PurchaseRenew))
            );
            remote.request(Command::Logout, cx);
            assert!(remote.purchase_wait.is_none());
            remote.complete(license(vantare_ipc::control::CatalogAccess::Pro), cx);
            assert!(
                !remote.navigation_access().verified,
                "logout invalida respuesta tardía"
            );
            while requests.try_recv().is_ok() {}
            remote.complete(
                Reply::Account {
                    profile: None,
                    signed_in: false,
                    expires_at: None,
                    pending: false,
                    message: "QA logout".into(),
                    error: None,
                },
                cx,
            );
            assert!(remote.purchase_wait.is_none());
            assert!(remote.dispatch_with_kind(Command::ReportPrepare, None));
            remote.complete(
                Reply::ReportReceipt {
                    receipt: Receipt {
                        report_id: "qa-report".into(),
                        report_state: "submitted".into(),
                        idempotent: false,
                        created_at: "2026-10-09T00:00:00Z".into(),
                    },
                    draft_state: DraftState::Preserved,
                },
                cx,
            );
            assert_eq!(remote.report_receipts.len(), 1);
            assert!(remote.editor.dirty);
            assert!(!remote.working());
        });
        crate::quit_headless_test(cx);
    });
}
