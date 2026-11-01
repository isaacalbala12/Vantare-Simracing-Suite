use super::purchase_tests::fixture;
use super::*;
use vantare_ipc::{
    control::{AccessState, CatalogAccess, Policy},
    services_protocol::{BillingProduct, LicenseNotice, RenewalOutcome, Session},
};

#[test]
fn transient_with_active_or_grace_policy_never_paints_an_access_error_even_in_live() {
    gpui_platform::headless().run(|cx| {
        for state in [AccessState::Active, AccessState::Grace] {
            for live in [false, true] {
                let file = crate::document::tests::File::new();
                let (send, requests) = mpsc::sync_channel(8);
                let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
                remote.update(cx, |remote, cx| {
                    remote.message = "Resultado manual".into();
                    let policy = Policy {
                        version: vantare_ipc::control::VERSION,
                        revision: 1,
                        checked_at_ms: 1000,
                        state,
                        live,
                        ..Policy::default()
                    };
                    remote
                        .access
                        .observe_cached_session(Some(Session::SignedIn));
                    remote
                        .access
                        .fixture_session(super::super::protocol::Session::SignedIn);
                    remote.observe_core_policy(policy.clone(), 1000, cx);
                    for reply in [
                        Reply::LicenseFailure {
                            outcome: RenewalOutcome::Transient,
                            message: "offline".into(),
                        },
                        Reply::LicenseStatus {
                            policy: policy.clone(),
                            session: Some(Session::SignedIn),
                            notice: None,
                        },
                        Reply::LicenseStatus {
                            policy,
                            session: Some(Session::SignedIn),
                            notice: Some(LicenseNotice::Failure {
                                outcome: RenewalOutcome::Transient,
                                message: "offline".into(),
                            }),
                        },
                    ] {
                        remote.inflight = Inflight::Background;
                        remote.complete(reply, cx);
                        assert!(remote.license_notice.is_none());
                        assert!(
                            remote.home_access().1.is_none(),
                            "no AccessError banner for transport"
                        );
                        assert!(!remote.device_limit);
                        assert_eq!(remote.message, "Resultado manual");
                        assert!(requests.try_recv().is_err());
                    }
                });
            }
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn a_manual_transport_failure_preserves_the_prior_notice_and_shows_its_own_feedback() {
    gpui_platform::headless().run(|cx| {
        for prior in [
            LicenseNotice::DeviceLimit {
                message: "limit".into(),
            },
            LicenseNotice::Failure {
                outcome: RenewalOutcome::Definitive,
                message: "account_conflict".into(),
            },
        ] {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                remote.inflight = Inflight::Background;
                remote.complete(
                    Reply::LicenseStatus {
                        policy: Policy::denied(AccessState::NoCredential),
                        session: Some(Session::SignedIn),
                        notice: Some(prior.clone()),
                    },
                    cx,
                );
                assert!(remote.dispatch_with_kind(Command::LicenseRenew, None));
                assert!(matches!(requests.try_recv(), Ok(Command::LicenseRenew)));
                remote.complete(
                    Reply::LicenseFailure {
                        outcome: RenewalOutcome::Transient,
                        message: "Sin red".into(),
                    },
                    cx,
                );
                assert_eq!(remote.license_notice.as_ref(), Some(&prior));
                assert_eq!(
                    remote.device_limit,
                    matches!(prior, LicenseNotice::DeviceLimit { .. })
                );
                assert_eq!(remote.message, "Sin red");
                assert_eq!(remote.home_access().1.as_deref(), Some(prior.message()));
                assert!(
                    matches!(requests.try_recv(), Ok(Command::AccountPoll)),
                    "manual session follow-up remains available"
                );
                assert!(requests.try_recv().is_err());
            });
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn persistent_notice_is_visible_without_overwriting_user_feedback_or_requesting_http() {
    gpui_platform::headless().run(|cx| {
        for user_message in ["", "Resultado del usuario"] {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                remote.message = user_message.into();
                for reply in [
                    Reply::LicenseFailure {
                        outcome: RenewalOutcome::Definitive,
                        message: "account_conflict".into(),
                    },
                    Reply::DeviceLimit {
                        message: "Límite de dispositivos".into(),
                    },
                    Reply::LicenseFailure {
                        outcome: RenewalOutcome::Definitive,
                        message: String::new(),
                    },
                    Reply::LicenseFailure {
                        outcome: RenewalOutcome::Definitive,
                        message: "Recupera el acceso".into(),
                    },
                ] {
                    for _ in 0..2 {
                        remote.inflight = Inflight::Background;
                        let notice = match &reply {
                            Reply::DeviceLimit { message } => LicenseNotice::DeviceLimit {
                                message: message.clone(),
                            },
                            Reply::LicenseFailure { outcome, message } => LicenseNotice::Failure {
                                outcome: *outcome,
                                message: message.clone(),
                            },
                            _ => unreachable!(),
                        };
                        remote.complete(
                            Reply::LicenseStatus {
                                policy: Policy::denied(AccessState::NoCredential),
                                session: Some(Session::SignedIn),
                                notice: Some(notice),
                            },
                            cx,
                        );
                        assert!(
                            remote
                                .license_notice_message()
                                .is_some_and(|message| !message.trim().is_empty())
                        );
                        assert!(remote.home_access().1.is_some());
                        assert_eq!(remote.message, user_message);
                        assert!(
                            requests.try_recv().is_err(),
                            "a notice read cannot start AccountPoll/HTTP"
                        );
                    }
                }
                remote.inflight = Inflight::Background;
                remote.complete(
                    Reply::Error {
                        message: "IPC perdido".into(),
                    },
                    cx,
                );
                assert_eq!(
                    remote.license_notice_message().as_deref(),
                    Some("Recupera el acceso")
                );
                remote.inflight = Inflight::Background;
                remote.complete(
                    Reply::LicenseStatus {
                        policy: Policy::denied(AccessState::NoCredential),
                        session: Some(Session::SignedIn),
                        notice: None,
                    },
                    cx,
                );
                assert!(remote.license_notice.is_none());
                assert!(!remote.device_limit);
            });
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn needs_sign_in_reads_local_notices_and_confirmed_reset_clears_the_limit() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            remote.inflight = Inflight::Background;
            remote.complete(
                Reply::LicenseStatus {
                    policy: Policy::denied(AccessState::NoCredential),
                    session: Some(Session::NeedsSignIn),
                    notice: Some(LicenseNotice::Failure {
                        outcome: RenewalOutcome::Definitive,
                        message: "Vuelve a entrar".into(),
                    }),
                },
                cx,
            );
            assert!(!remote.access.signed_in());
            assert!(remote.session_notice().is_some());
            assert!(remote.license_notice.is_some());
            assert!(requests.try_recv().is_err());
            remote.refresh_license_at(std::time::Instant::now(), 1000, cx);
            assert!(
                matches!(requests.try_recv(), Ok(Command::LicenseStatus)),
                "NeedsSignIn still reads local notices"
            );
            remote.complete(
                Reply::LicenseStatus {
                    policy: Policy::denied(AccessState::NoCredential),
                    session: Some(Session::NeedsSignIn),
                    notice: Some(LicenseNotice::DeviceLimit {
                        message: "limit".into(),
                    }),
                },
                cx,
            );
            remote.inflight = Inflight::Background;
            remote.complete(
                Reply::LicenseStatus {
                    policy: Policy::denied(AccessState::NoCredential),
                    session: Some(Session::SignedIn),
                    notice: Some(LicenseNotice::DeviceLimit {
                        message: "limit".into(),
                    }),
                },
                cx,
            );
            assert!(remote.dispatch_with_kind(Command::DeviceReset, None));
            assert!(matches!(requests.try_recv(), Ok(Command::DeviceReset)));
            remote.complete(
                Reply::License {
                    policy: Policy::denied(AccessState::NoCredential),
                    message: "Reset confirmado".into(),
                },
                cx,
            );
            assert!(!remote.device_limit);
            assert!(remote.license_notice.is_none());
            assert!(requests.try_recv().is_err());
        });
        crate::quit_headless_test(cx);
    });
}

#[test]
fn cached_session_after_a_failed_logout_preserves_error_and_retries_logout() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            remote.access.observe(
                &Reply::Status {
                    account_configured: true,
                    message: String::new(),
                },
                false,
            );
            let wall = vantare_ipc::control::wall_ms().expect("wall");
            let policy = Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: wall,
                state: AccessState::Active,
                catalog: CatalogAccess::Pro,
                ..Policy::default()
            };
            remote.observe_core_policy(policy.clone(), wall, cx);
            remote.request(Command::Logout, cx);
            assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
            remote.complete(
                Reply::Error {
                    message: "ACK no confirmado".into(),
                },
                cx,
            );
            remote.observe_core_policy(policy.clone(), wall, cx);
            assert!(remote.access.can_return_after_logout(wall));
            let error = remote.home_access().1;
            for session in [None, Some(Session::SignedIn), Some(Session::SignedOut)] {
                remote.inflight = Inflight::Background;
                remote.complete(
                    Reply::LicenseStatus {
                        policy: policy.clone(),
                        session,
                        notice: None,
                    },
                    cx,
                );
                assert_eq!(remote.home_access().1, error);
                assert!(remote.access.can_return_after_logout(wall));
                assert!(remote.access.logout_requested());
                assert!(requests.try_recv().is_err());
            }
            remote.retry_access(cx);
            assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
        });
        crate::quit_headless_test(cx);
    });
}

#[test]
fn purchase_wait_uses_only_policy_feed_and_never_dispatches_renewal() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            let now = std::time::Instant::now();
            remote
                .access
                .fixture_session(super::super::protocol::Session::SignedIn);
            remote
                .access
                .observe_cached_session(Some(Session::SignedIn));
            remote.purchase_wait = Some(PurchaseWait {
                product: BillingProduct::ProMonthly,
                started: now,
            });
            let policy = Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: AccessState::Active,
                catalog: CatalogAccess::Pro,
                ..Policy::default()
            };
            remote.inflight = Inflight::Background;
            remote.complete(
                Reply::License {
                    policy: policy.clone(),
                    message: "Compra HTTP".into(),
                },
                cx,
            );
            assert!(
                remote.purchase_wait.is_some(),
                "a services reply cannot confirm purchase"
            );
            let mut reads = 0;
            for seconds in [0, 1, 5, 30, 59, 60, 120, 599] {
                remote.refresh_license_at(
                    now + std::time::Duration::from_secs(seconds),
                    1000 + seconds * 1000,
                    cx,
                );
                if let Ok(command) = requests.try_recv() {
                    reads += 1;
                    assert!(
                        matches!(command, Command::LicenseStatus),
                        "only local notice reads"
                    );
                    remote.complete(
                        Reply::LicenseStatus {
                            policy: policy.clone(),
                            session: Some(Session::SignedIn),
                            notice: None,
                        },
                        cx,
                    );
                }
                assert!(requests.try_recv().is_err());
                assert!(remote.purchase_wait.is_some());
            }
            assert_eq!(reads, 6, "all due local notice reads actually execute");
            remote.observe_core_policy(policy.clone(), 3000, cx);
            assert!(remote.purchase_wait.is_some(), "stale feed cannot confirm");
            remote.observe_core_policy(policy, 1000, cx);
            assert!(
                remote.purchase_wait.is_none(),
                "fresh authenticated feed confirms"
            );
            assert!(
                requests.try_recv().is_err(),
                "confirmation has no remote effects"
            );
        });
        crate::quit_headless_test(cx);
    });
}
