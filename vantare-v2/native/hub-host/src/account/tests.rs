use super::*;
fn configured(session: Session) -> State {
    let mut state = State::new();
    state.reducer.configured = true;
    state.reducer.session_checked = true;
    state.reducer.fixture_session(session);
    state.status_done = true;
    state
}
fn account(session: Session) -> CoreReply {
    CoreReply::Account {
        session,
        copy_link: session == Session::Pending,
        signed_in: session == Session::SignedIn,
        profile: None,
        expires_at: None,
        pending: session == Session::Pending,
        message: String::new(),
        error: None,
    }
}
#[test]
fn logout_failure_is_uncertain_and_polls_real_session_without_replaying_logout() {
    let now = Instant::now();
    let mut state = configured(Session::SignedIn);
    state.accepted(Operation::Logout, &Command::Logout);
    state.failed(Operation::Logout, &HostError::CoreUnavailable, false, now);
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::LogoutFailed
    );
    assert_eq!(state.next_background(now), Some(Operation::Poll));
    state.background_accepted(Operation::Poll, now);
    state
        .complete(Operation::Poll, &account(Session::SignedIn), true, now)
        .unwrap();
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::LogoutFailed
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).session,
        SessionView::SignedIn
    );
    state.accepted(Operation::Logout, &Command::Logout);
    state
        .complete(Operation::Logout, &account(Session::SignedOut), false, now)
        .unwrap();
    assert_eq!(
        state.view(&AccessView::default(), now, 0).session,
        SessionView::SignedOut
    );
    assert!(state.pending.is_empty());
}
#[test]
fn busy_requires_manual_retry_and_cancel_logout_reserve_their_own_intent() {
    let now = Instant::now();
    let mut state = configured(Session::SignedOut);
    state.accepted(Operation::Begin, &Command::AccountBegin);
    assert!(matches!(
        state.can_start(Operation::Begin),
        Err(HostError::Busy)
    ));
    state.failed(Operation::Begin, &HostError::Busy, false, now);
    assert!(state.view(&AccessView::default(), now, 0).error.unwrap().contains("Inténtalo de nuevo"));
    state.accepted(Operation::Begin, &Command::AccountBegin);
    assert!(state.can_start(Operation::Cancel).is_ok());
    state.accepted(Operation::Cancel, &Command::AccountCancel);
    assert!(matches!(
        state.can_start(Operation::Cancel),
        Err(HostError::Busy)
    ));
    assert!(state.can_start(Operation::Logout).is_ok());
    state.failed(Operation::Begin, &HostError::Busy, false, now);
    assert_eq!(state.view(&AccessView::default(), now, 0).gate, Gate::Canceling);
    assert!(state.view(&AccessView::default(), now, 0).error.is_none());
    assert_ne!(state.next_background(now), Some(Operation::Begin));
}
#[test]
fn email_form_and_copied_link_never_leak_credentials_or_raw_urls_into_views() {
    let now = Instant::now();
    let mut state = configured(Session::SignedOut);
    state.open_email(EmailMode::SignInPassword, now).unwrap();
    let intent = EmailIntent::Begin {
        mode: EmailMode::SignInPassword,
        email: "qa@example.invalid".into(),
        password: "private-password".into(),
    };
    let command = state.email_command(&intent, now).unwrap();
    state.accepted(Operation::Email, &command);
    state
        .complete(
            Operation::Email,
            &CoreReply::Email {
                stage: vantare_ipc::services_protocol::EmailStage::Code,
                retry_after_seconds: 0,
                message: "https://private.invalid/code".into(),
                error: None,
            },
            false,
            now,
        )
        .unwrap();
    let view = serde_json::to_string(&state.view(&AccessView::default(), now, 0)).unwrap();
    for private in [
        "private-password",
        "qa@example.invalid",
        "https://",
        "code_challenge",
    ] {
        assert!(!view.contains(private));
    }
    assert!(matches!(
        state.email_command(&EmailIntent::Finish {}, now),
        Err(HostError::AccountInvalid)
    ));
}
#[test]
fn rights_come_only_from_the_feed_not_from_a_service_account_or_license_reply() {
    let now = Instant::now();
    let mut state = configured(Session::SignedIn);
    state
        .complete(Operation::Poll, &account(Session::SignedIn), true, now)
        .unwrap();
    let view = state.view(&AccessView::default(), now, 0);
    assert!(!view.verified);
    assert_eq!(view.modules[2].status, ModuleStatus::Unverified);
    let access = AccessView {
        verified: true,
        calendar: true,
        ..Default::default()
    };
    let view = state.view(&access, now, 0);
    assert!(view.verified);
    assert_eq!(view.modules[2].status, ModuleStatus::Included);
    let blocked = AccessView {
        blocked: true,
        ..access
    };
    assert!(!state.view(&blocked, now, 0).verified);
}
#[test]
fn an_unexpected_core_reply_is_denied_and_releases_the_pending_operation() {
    let now = Instant::now();
    let mut state = configured(Session::SignedIn);
    state.accepted(Operation::Profile, &Command::AccountProfileRefresh);
    assert!(matches!(
        state.complete(Operation::Profile, &CoreReply::Closed, false, now),
        Err(HostError::Denied)
    ));
    assert!(state.pending.is_empty());
}
#[test]
fn late_browser_callback_cannot_confirm_a_requested_logout() {
    let now = Instant::now();
    let mut state = configured(Session::SignedIn);
    state.accepted(Operation::Logout, &Command::Logout);
    assert_eq!(
        state.complete(Operation::Poll, &account(Session::SignedIn), true, now),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::LoggingOut
    );
    assert!(state.pending.contains(&Operation::Logout));
}

#[test]
fn cancel_is_not_consumed_by_a_late_browser_login_reply_or_error() {
    let now = Instant::now();
    let mut state = configured(Session::SignedOut);
    state.accepted(Operation::Begin, &Command::AccountBegin);
    state.accepted(Operation::Cancel, &Command::AccountCancel);
    assert_eq!(
        state.complete(Operation::Begin, &account(Session::Pending), false, now),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::Canceling
    );
    state.failed(Operation::Poll, &HostError::CoreUnavailable, true, now);
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::Canceling
    );
    assert!(state.view(&AccessView::default(), now, 0).error.is_none());
    state
        .complete(Operation::Cancel, &account(Session::SignedOut), false, now)
        .unwrap();
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::Choose
    );
}
#[test]
fn an_active_checkout_is_discarded_after_logout_is_accepted() {
    let now = Instant::now();
    let mut state = configured(Session::SignedIn);
    let command = Command::Purchase {
        product: vantare_ipc::services_protocol::BillingProduct::Founders,
    };
    state.accepted(Operation::Purchase, &command);
    state.accepted(Operation::Logout, &Command::Logout);
    assert_eq!(
        state.complete(
            Operation::Purchase,
            &CoreReply::Checkout {
                url: "https://polar.sh/checkout/qa".into()
            },
            false,
            now
        ),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::LoggingOut
    );
    assert!(!state.view(&AccessView::default(), now, 0).purchase.waiting);
}

#[test]
fn only_a_matching_signed_out_ack_can_finish_logout() {
    let now = Instant::now();
    let mut state = configured(Session::SignedIn);
    state.accepted(Operation::Logout, &Command::Logout);
    assert_eq!(
        state.complete(Operation::Logout, &account(Session::SignedIn), false, now),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).gate,
        Gate::LogoutFailed
    );
    assert!(state.pending.is_empty());
    assert_eq!(state.next_background(now), Some(Operation::Poll));
}
