use super::*;
#[cfg(test)]
mod native_email_tests {
    use super::*;
    use vantare_ipc::services_protocol::{EmailAction, EmailMode, EmailStage};

    #[test]
    fn pending_device_grant_polls_and_cancel_has_priority_over_a_retry() {
        let mut state = State::from_build();
        state.requested(&Command::AccountEmail {
            action: EmailAction::Finish {},
        });
        let pending = Reply::Email {
            stage: EmailStage::Authorizing,
            retry_after_seconds: 0,
            message: "esperando".into(),
            error: None,
        };
        assert!(matches!(
            state.next_command(&pending, &mut None),
            Some(Command::AccountPoll)
        ));
        let mut cancel = Some(Command::AccountCancel);
        assert!(matches!(
            state.next_command(&pending, &mut cancel),
            Some(Command::AccountCancel)
        ));
        assert!(cancel.is_none());
        let exhausted = Reply::Email {
            stage: EmailStage::Consent,
            retry_after_seconds: 0,
            message: "reintentar".into(),
            error: Some("pendiente".into()),
        };
        assert!(state.next_command(&exhausted, &mut None).is_none());
    }
    #[test]
    fn email_waits_for_consent_and_oauth_before_license_renewal() {
        let mut state = State::from_build();
        state.requested(&Command::AccountEmail {
            action: EmailAction::Begin {
                mode: EmailMode::SignInCode,
                email: "fixture@example.invalid".into(),
                password: String::new(),
            },
        });
        let reply = Reply::Email {
            stage: EmailStage::Code,
            retry_after_seconds: 30,
            message: "fixture".into(),
            error: None,
        };
        state.observe(&reply, true);
        assert!(!state.login_requested);
        assert!(
            state.next_command(&reply, &mut None).is_none(),
            "native input never starts automatic polling/renewal"
        );
        let reply = Reply::Email {
            stage: EmailStage::Consent,
            retry_after_seconds: 0,
            message: "fixture".into(),
            error: None,
        };
        assert!(state.next_command(&reply, &mut None).is_none());
        state.requested(&Command::AccountEmail {
            action: EmailAction::Finish {},
        });
        let reply = Reply::Account {
            session: vantare_ipc::services_protocol::Session::SignedIn,
            copy_link: false,
            signed_in: true,
            profile: None,
            expires_at: Some(500),
            pending: false,
            message: "fixture".into(),
            error: None,
        };
        assert!(
            state.next_command(&reply, &mut None).is_none(),
            "the supervisor renews after native login too"
        );
        state.requested(&Command::AccountEmail {
            action: EmailAction::Cancel {},
        });
        assert_eq!(state.transition as u8, Transition::Idle as u8);
    }
}
