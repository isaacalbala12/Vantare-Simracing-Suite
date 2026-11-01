use super::super::protocol::{EmailAction, EmailMode, Session};
use super::purchase_tests::fixture;
use super::*;

fn account(session: Session) -> Reply {
    Reply::Account {
        session,
        copy_link: false,
        signed_in: session == Session::SignedIn,
        profile: Some(super::super::protocol::AccountProfile::default()),
        expires_at: None,
        pending: false,
        message: String::new(),
        error: None,
    }
}

fn policy() -> vantare_ipc::control::Policy {
    let now = vantare_ipc::control::wall_ms().expect("fixture clock");
    vantare_ipc::control::Policy {
        version: vantare_ipc::control::VERSION,
        revision: 1,
        checked_at_ms: now,
        signed_until_ms: Some(now + 60_000),
        state: vantare_ipc::control::AccessState::Active,
        catalog: vantare_ipc::control::CatalogAccess::Pro,
        ..Default::default()
    }
}

fn configured(remote: &mut Remote, session: Session, cx: &mut Context<Remote>) {
    remote.access.observe(
        &Reply::Status {
            account_configured: true,
            message: String::new(),
        },
        false,
    );
    remote.complete(account(session), cx);
}

fn failed_logout(remote: &mut Remote, session: Session, cx: &mut Context<Remote>) {
    let mut reply = account(session);
    if let Reply::Account { error, .. } = &mut reply {
        *error = Some("core unavailable fixture".into());
    }
    remote.complete(reply, cx);
}

#[test]
fn failed_logout_retry_repeats_logout_instead_of_opening_login() {
    gpui_platform::headless().run(|cx| {
        for session in [Session::SignedIn, Session::NeedsSignIn] {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                configured(remote, session, cx);
                remote.request(Command::Logout, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                failed_logout(remote, session, cx);
                remote.retry_access(cx);
                assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                assert!(remote.access.logout_requested());
                assert!(remote.requires_access());
                failed_logout(remote, session, cx);
                assert!(requests.try_recv().is_err(), "never AccountBegin");
            });
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn failed_logout_back_requires_new_fresh_core_rights_and_no_revocation_ack() {
    gpui_platform::headless().run(|cx| {
        for session in [Session::SignedIn, Session::NeedsSignIn] {
            for condition in 0..4 {
                let file = crate::document::tests::File::new();
                let (send, requests) = mpsc::sync_channel(8);
                let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
                remote.update(cx, |remote, cx| {
                    configured(remote, session, cx);
                    let mut rights = policy();
                    remote.observe_core_policy(rights.clone(), rights.checked_at_ms, cx);
                    remote.request(Command::Logout, cx);
                    assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                    remote.return_after_logout(cx);
                    assert!(
                        remote.requires_access(),
                        "cannot abandon before ACK failure"
                    );
                    failed_logout(remote, session, cx);
                    match condition {
                        1 => rights.state = vantare_ipc::control::AccessState::Revoked,
                        2 => rights.checked_at_ms = 1,
                        _ => {}
                    }
                    if condition != 0 {
                        remote.observe_core_policy(rights.clone(), rights.checked_at_ms, cx);
                    }
                    remote.return_after_logout(cx);
                    assert_eq!(remote.requires_access(), condition != 3);
                    assert_eq!(remote.navigation_access().verified, condition == 3);
                    assert_eq!(
                        remote.session_notice().is_some(),
                        session == Session::NeedsSignIn
                    );
                    assert!(
                        requests.try_recv().is_err(),
                        "Back sends no login or cancellation"
                    );
                });
            }
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn needs_sign_in_choice_closes_with_escape_without_starting_an_attempt() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            configured(remote, Session::NeedsSignIn, cx);
            let rights = policy();
            remote.observe_core_policy(rights.clone(), rights.checked_at_ms, cx);
            remote.open_account_login(cx);
            assert!(remote.requires_access());
            assert!(!remote.access_escape("enter", cx));
            assert!(remote.access_escape("escape", cx));
            assert!(!remote.requires_access());
            assert!(remote.navigation_access().verified);
            assert!(remote.session_notice().is_some());
            assert!(requests.try_recv().is_err(), "no AccountBegin or Logout");
        });
        crate::quit_headless_test(cx);
    });
}

#[test]
fn cancel_pending_or_in_flight_blocks_providers_and_duplicate_cancel_until_ack() {
    gpui_platform::headless().run(|cx| {
        for mode in 0..3 {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                configured(remote, Session::NeedsSignIn, cx);
                if mode == 1 {
                    remote.request(Command::AccountBegin, cx);
                    assert!(matches!(requests.try_recv(), Ok(Command::AccountBegin)));
                } else if mode == 2 {
                    remote.inflight = Inflight::Profile;
                }
                remote.request(Command::AccountCancel, cx);
                for _ in 0..2 {
                    assert!(remote.canceling_access());
                    remote.request(Command::AccountCancel, cx);
                    remote.begin_access(cx);
                    remote.select_email(EmailMode::SignInCode, cx);
                    remote.request(
                        Command::AccountEmail {
                            action: EmailAction::Finish {},
                        },
                        cx,
                    );
                    assert!(remote.email.is_none());
                    assert!(remote.account.cancel_command.is_none() || mode == 1);
                }
                if mode != 0 {
                    assert!(
                        requests.try_recv().is_err(),
                        "Cancel waits for the old reply"
                    );
                    remote.complete(account(Session::NeedsSignIn), cx);
                }
                assert!(matches!(requests.try_recv(), Ok(Command::AccountCancel)));
                assert!(remote.requires_access(), "wait for cancellation ACK");
                remote.request(Command::AccountCancel, cx);
                assert!(requests.try_recv().is_err());
                assert!(remote.account.cancel_command.is_none());
                remote.complete(account(Session::NeedsSignIn), cx);
                assert!(!remote.canceling_access());
                assert!(requests.try_recv().is_err());
                remote.begin_access(cx);
                assert!(matches!(requests.try_recv(), Ok(Command::AccountBegin)));
            });
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn cancel_transport_error_releases_controls_after_the_attempt() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            configured(remote, Session::NeedsSignIn, cx);
            remote.request(Command::AccountCancel, cx);
            assert!(matches!(requests.try_recv(), Ok(Command::AccountCancel)));
            remote.complete(
                Reply::Error {
                    message: "transport fixture".into(),
                },
                cx,
            );
            assert!(!remote.canceling_access());
            assert!(!remote.working());
            assert!(!remote.requires_access());
            assert!(remote.session_notice().is_some());
            remote.open_account_login(cx);
            assert!(remote.requires_access(), "provider choices work again");
            assert!(remote.access_escape("escape", cx));
            assert!(requests.try_recv().is_err());
        });
        crate::quit_headless_test(cx);
    });
}

#[test]
fn logout_transport_error_can_retry_and_return_to_the_hub() {
    gpui_platform::headless().run(|cx| {
        let file = crate::document::tests::File::new();
        let (send, requests) = mpsc::sync_channel(8);
        let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
        remote.update(cx, |remote, cx| {
            configured(remote, Session::NeedsSignIn, cx);
            remote.request(Command::Logout, cx);
            assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
            remote.complete(
                Reply::Error {
                    message: "transport fixture".into(),
                },
                cx,
            );
            assert!(
                remote
                    .home_access()
                    .1
                    .is_some_and(|error| error.contains("No se pudo cerrar la sesión"))
            );
            remote.retry_access(cx);
            assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
            failed_logout(remote, Session::NeedsSignIn, cx);
            let rights = policy();
            remote.observe_core_policy(rights.clone(), rights.checked_at_ms, cx);
            remote.return_after_logout(cx);
            assert!(!remote.requires_access());
            assert!(remote.navigation_access().verified);
            assert!(requests.try_recv().is_err());
        });
        crate::quit_headless_test(cx);
    });
}

#[test]
fn late_account_during_logout_preserves_confirmed_identity_and_profile() {
    gpui_platform::headless().run(|cx| {
        for previous in [Session::SignedOut, Session::SignedIn, Session::NeedsSignIn] {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                configured(remote, previous, cx);
                let original = super::super::protocol::AccountProfile {
                    name: "confirmed fixture".into(),
                    ..Default::default()
                };
                remote.account.profile = Some(original.clone());
                remote.request(Command::Logout, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::Logout)));
                let mut late = account(Session::SignedIn);
                if let Reply::Account { profile, .. } = &mut late {
                    *profile = Some(super::super::protocol::AccountProfile {
                        name: "discarded callback".into(),
                        ..Default::default()
                    });
                }
                remote.complete(late, cx);
                assert_eq!(remote.access.signed_in(), previous == Session::SignedIn);
                assert_eq!(remote.account.profile.as_ref(), Some(&original));
                assert!(remote.access.logout_requested());
                assert!(remote.requires_access());
                assert!(!remote.navigation_access().verified);
                assert!(
                    requests.try_recv().is_err(),
                    "no follow-up for the callback"
                );
            });
        }
        crate::quit_headless_test(cx);
    });
}

#[test]
fn pending_preserves_confirmed_identity_but_requires_the_attempt_to_settle() {
    gpui_platform::headless().run(|cx| {
        for previous in [Session::SignedOut, Session::SignedIn, Session::NeedsSignIn] {
            let file = crate::document::tests::File::new();
            let (send, requests) = mpsc::sync_channel(8);
            let remote = cx.new(|cx| fixture(cx, send, file.path.parent().expect("root")));
            remote.update(cx, |remote, cx| {
                configured(remote, previous, cx);
                let original = remote.account.profile.clone();
                remote.request(Command::AccountBegin, cx);
                assert!(matches!(requests.try_recv(), Ok(Command::AccountBegin)));
                remote.complete(account(Session::Pending), cx);
                assert_eq!(remote.access.signed_in(), previous == Session::SignedIn);
                assert_eq!(remote.account.profile, original);
                assert!(remote.access.pending());
                assert!(remote.requires_access());
                assert!(!remote.navigation_access().verified);
                assert!(matches!(requests.try_recv(), Ok(Command::AccountPoll)));
            });
        }
        crate::quit_headless_test(cx);
    });
}
