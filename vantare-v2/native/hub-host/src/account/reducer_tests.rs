use super::*;
#[cfg(test)]
mod tests {
    use super::*;

    fn account_reply(signed_in: bool, pending: bool, error: Option<String>) -> Reply {
        Reply::Account {
            session: if pending {
                vantare_ipc::services_protocol::Session::Pending
            } else if signed_in {
                vantare_ipc::services_protocol::Session::SignedIn
            } else {
                vantare_ipc::services_protocol::Session::SignedOut
            },
            copy_link: false,
            profile: None,
            signed_in,
            pending,
            expires_at: signed_in.then_some(10),
            message: String::new(),
            error,
        }
    }

    #[test]
    fn isa1548_unrelated_ipc_error_during_login_does_not_consume_renewal() {
        // app::tests verifies that an unconfigured non-account request returns
        // Error while the OAuth listener survives and its next callback signs in.
        let mut state = State::from_build();
        state.requested(&Command::AccountBegin);
        for (sequence, reply) in [
            Reply::Error {
                message: "servicio no configurado".into(),
            },
            account_reply(false, true, None),
            account_reply(true, false, None),
        ]
        .into_iter()
        .enumerate()
        {
            let response = vantare_ipc::services_protocol::Response {
                version: vantare_ipc::services_protocol::VERSION,
                sequence: u64::try_from(sequence + 1).expect("sequence"),
                reply,
            };
            let mut wire = Vec::new();
            vantare_ipc::services_protocol::write(&mut wire, &response).expect("IPC write");
            let decoded: vantare_ipc::services_protocol::Response =
                vantare_ipc::services_protocol::read(&mut wire.as_slice()).expect("IPC read");
            state.observe(&decoded.reply, sequence != 0);
            let next = state.next_command(&decoded.reply, &mut None);
            match sequence {
                0 => assert!(next.is_none()),
                1 => assert!(matches!(next, Some(Command::AccountPoll))),
                _ => assert!(next.is_none(), "supervisor owns license renewal"),
            }
            assert!(!state.navigation(1000).verified);
        }
        assert!(
            state
                .next_command(&account_reply(true, false, None), &mut None)
                .is_none()
        );
    }

    #[test]
    fn login_and_restore_consume_core_policy_without_duplicate_license_requests() {
        let mut state = State::from_build();
        let restored = account_reply(true, false, None);
        state.observe(&restored, true);
        for _ in 0..3 {
            assert!(state.next_command(&restored, &mut None).is_none());
        }
        state.requested(&Command::AccountBegin);
        let pending = account_reply(false, true, None);
        for _ in 0..3 {
            state.observe(&pending, true);
            assert!(matches!(
                state.next_command(&pending, &mut None),
                Some(Command::AccountPoll)
            ));
        }
        state.observe(&restored, true);
        assert!(state.next_command(&restored, &mut None).is_none());
        assert!(state.next_command(&restored, &mut None).is_none());
        assert!(
            !state.navigation(1000).verified,
            "OAuth success alone cannot unlock modules"
        );
        let rights = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: vantare_ipc::control::AccessState::Active,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        let failed = Reply::Error {
            message: "fixture offline".into(),
        };
        state.observe(&failed, false);
        assert!(state.next_command(&failed, &mut None).is_none());
        let Reply::License { policy, .. } = rights else {
            unreachable!()
        };
        state.observe_core_policy(policy);
        assert!(state.navigation(1000).verified);
        assert!(
            !state.navigation(3000).verified,
            "the core feed TTL still expires"
        );
    }

    #[test]
    fn failed_renewal_accepts_the_next_fresh_core_policy_and_exposes_the_error() {
        for reply in [
            Reply::Error {
                message: vantare_services::Error::Clock.to_string(),
            },
            Reply::DeviceLimit {
                message: "device limit".into(),
            },
        ] {
            let mut state = State::from_build();
            state.requested(&Command::AccountBegin);
            let account = account_reply(true, false, None);
            state.observe(&account, true);
            assert!(state.next_command(&account, &mut None).is_none());
            assert!(state.renewal_acknowledged(&reply).is_none());
            assert!(state.error.is_some());
            assert!(
                !state.navigation(1000).verified,
                "an error cannot grant access"
            );
            state.observe_core_policy(vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: vantare_ipc::control::AccessState::Active,
                ..vantare_ipc::control::Policy::default()
            });
            assert!(
                state.navigation(1000).verified,
                "fresh core policy is no longer ignored after failure"
            );
            assert!(
                !state.navigation(4000).verified,
                "expired policy remains denied"
            );
            assert!(
                state.next_command(&account, &mut None).is_none(),
                "failure does not loop license HTTP"
            );
        }
    }

    #[test]
    fn failed_login_or_logout_during_callback_never_renews_or_accepts_late_rights() {
        let mut state = State::from_build();
        state.configured = true; // Esta prueba representa un build con OAuth.
        state.requested(&Command::AccountBegin);
        let failed = account_reply(false, false, Some("denied fixture".into()));
        state.observe(&failed, true);
        assert!(state.next_command(&failed, &mut None).is_none());
        state.requested(&Command::AccountBegin);
        state.requested(&Command::Logout);
        let completed = account_reply(true, false, None);
        state.observe(&completed, true);
        assert!(state.required());
        let mut cancel = Some(Command::Logout);
        assert!(matches!(
            state.next_command(&completed, &mut cancel),
            Some(Command::Logout)
        ));
        assert!(cancel.is_none());
        let late = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: vantare_ipc::control::AccessState::Active,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        for acknowledgement in [
            Reply::Error {
                message: "late renewal error".into(),
            },
            Reply::DeviceLimit {
                message: "late limit".into(),
            },
            late.clone(),
        ] {
            assert!(state.renewal_acknowledged(&acknowledgement).is_none());
            assert!(
                state.logout_requested(),
                "a late renewal cannot cancel Logout"
            );
        }
        state.observe(&late, false);
        assert!(state.policy.is_none());
        let closed = account_reply(false, false, None);
        state.observe(&closed, true);
        assert!(state.next_command(&closed, &mut None).is_none());
        state.observe(&late, false);
        assert!(
            state.policy.is_none(),
            "no license response can undo logout"
        );
        assert!(!state.navigation(1000).verified);
    }

    #[test]
    fn renewal_reloads_oauth_expiry_without_another_license_request() {
        let mut state = State::from_build();
        let expired = Reply::Account {
            session: vantare_ipc::services_protocol::Session::SignedIn,
            copy_link: false,
            profile: None,
            signed_in: true,
            pending: false,
            expires_at: Some(1),
            message: String::new(),
            error: None,
        };
        state.observe(&expired, true);
        let rights = Reply::License {
            policy: vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 2000,
                state: vantare_ipc::control::AccessState::Active,
                engineer: true,
                ..vantare_ipc::control::Policy::default()
            },
            message: String::new(),
        };
        assert!(matches!(
            state.renewal_acknowledged(&rights),
            Some(Command::AccountPoll)
        ));
        state.observe(&rights, false);
        // Un access token OAuth caducado no bloquea: decide la política del núcleo.
        assert!(state.navigation(2000).verified);
        let refreshed = account_reply(true, false, None);
        state.observe(&refreshed, true);
        assert!(state.next_command(&refreshed, &mut None).is_none());
        state.observe(&rights, false); // Heartbeat de la política ya confirmada.
        assert!(state.navigation(2000).verified);
    }

    #[test]
    fn cancel_before_first_reply_or_completed_callback_always_cancels_only_the_attempt() {
        for pending in [false, true] {
            let mut cancel = Some(Command::AccountCancel);
            assert!(matches!(
                follow_up(pending, &mut cancel, false),
                Some(Command::AccountCancel)
            ));
            assert!(cancel.is_none());
        }
        assert!(follow_up(false, &mut None, false).is_none());
        assert!(matches!(
            follow_up(false, &mut None, true),
            Some(Command::AccountPoll)
        ));
        assert!(matches!(
            follow_up(true, &mut None, false),
            Some(Command::AccountPoll)
        ));
    }

    #[test]
    fn startup_requires_configured_services_and_no_confirmed_session() {
        for configured in [false, true] {
            for signed_in in [false, true] {
                let state = State {
                    configured,
                    session_checked: true,
                    login_requested: false,
                    error: None,
                    manual: ManualLink::default(),
                    policy: None,
                    session: (if signed_in {
                        Session::SignedIn
                    } else {
                        Session::SignedOut
                    })
                    .into(),
                    transition: Transition::Idle,
                };
                assert_eq!(state.required(), configured && !signed_in);
            }
        }
    }

    #[test]
    fn restore_login_logout_and_errors_preserve_the_access_gate() {
        let mut state = State {
            configured: true,
            session_checked: false,
            login_requested: false,
            error: None,
            manual: ManualLink::default(),
            policy: None,
            session: (Session::SignedOut).into(),
            transition: Transition::Idle,
        };
        assert!(state.required());
        for signed_in in [true, false] {
            let reply = Reply::Account {
                session: if signed_in {
                    vantare_ipc::services_protocol::Session::SignedIn
                } else {
                    vantare_ipc::services_protocol::Session::SignedOut
                },
                copy_link: false,
                profile: None,
                signed_in,
                pending: false,
                expires_at: None,
                message: String::new(),
                error: None,
            };
            state.observe(&reply, true);
            assert_eq!(state.required(), !signed_in);
        }
        // No se entra al Hub entre un callback tardío y el ACK de Cancelar.
        state.login_requested = true;
        assert!(state.required());
        state.observe(
            &Reply::Error {
                message: "sin red".into(),
            },
            true,
        );
        assert!(state.required());
        assert!(state.error.is_some());
        state.observe(
            &Reply::Status {
                account_configured: false,
                message: String::new(),
            },
            true,
        );
        assert!(!state.required());
    }

    #[test]
    fn account_error_keeps_polling_only_while_the_attempt_exists() {
        let mut state = State {
            configured: true,
            session_checked: false,
            login_requested: true,
            error: None,
            manual: ManualLink::default(),
            policy: None,
            session: (Session::SignedOut).into(),
            transition: Transition::Idle,
        };
        let mut cancel = None;
        for pending in [true, false] {
            let reply = Reply::Account {
                session: if pending {
                    vantare_ipc::services_protocol::Session::Pending
                } else {
                    vantare_ipc::services_protocol::Session::SignedOut
                },
                copy_link: false,
                profile: None,
                signed_in: false,
                expires_at: None,
                pending,
                message: "error de prueba".into(),
                error: Some("error de prueba".into()),
            };
            state.observe(&reply, true);
            assert_eq!(state.login_requested, pending);
            assert!(state.error.is_some());
            assert!(state.required());
            assert_eq!(
                matches!(
                    follow_up(pending, &mut cancel, false),
                    Some(Command::AccountPoll)
                ),
                pending
            );
        }
    }
}
