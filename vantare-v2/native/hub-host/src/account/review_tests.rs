use super::*;
fn state(session: Session) -> State {
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
fn a_confirmed_email_login_closes_the_form_and_cannot_reopen_it() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.open_email(EmailMode::SignInCode, now).unwrap();
    state.accepted(
        Operation::Email,
        &Command::AccountEmail {
            action: vantare_ipc::services_protocol::EmailAction::Finish {},
        },
    );
    state
        .complete(Operation::Email, &account(Session::SignedIn), false, now)
        .unwrap();
    assert!(state.form.is_none());
    assert_eq!(state.view(&AccessView::default(), now, 0).gate, Gate::None);
    assert_eq!(
        state.open_email(EmailMode::SignInCode, now),
        Err(HostError::Denied)
    );
    state.accepted(Operation::Logout, &Command::Logout);
    state
        .complete(Operation::Logout, &account(Session::SignedOut), false, now)
        .unwrap();
    assert!(state.form.is_none());
}
#[test]
fn reopening_or_switching_modes_does_not_reset_the_email_cooldown() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.open_email(EmailMode::SignInCode, now).unwrap();
    state
        .complete(
            Operation::Email,
            &CoreReply::Email {
                stage: vantare_ipc::services_protocol::EmailStage::Code,
                retry_after_seconds: 30,
                message: String::new(),
                error: None,
            },
            false,
            now,
        )
        .unwrap();
    state
        .open_email(EmailMode::SignInPassword, now + Duration::from_secs(1))
        .unwrap();
    assert_eq!(
        state
            .form
            .as_ref()
            .unwrap()
            .view(now + Duration::from_secs(1))
            .retry_after_seconds,
        29
    );
    state.hide_email();
    state
        .open_email(EmailMode::SignInCode, now + Duration::from_secs(10))
        .unwrap();
    let request = EmailIntent::Begin {
        mode: EmailMode::SignInCode,
        email: "qa@example.invalid".into(),
        password: String::new(),
    };
    assert!(matches!(
        state.email_command(&request, now + Duration::from_secs(10)),
        Err(HostError::AccountInvalid)
    ));
    assert!(
        state
            .email_command(&request, now + Duration::from_secs(30))
            .is_ok()
    );
}
#[test]
fn browser_opens_share_a_five_second_clock_and_purchase_wait_blocks_duplicates() {
    let now = Instant::now();
    let mut state = state(Session::SignedIn);
    state.reserve_browser(now, false).unwrap();
    assert_eq!(
        state.reserve_browser(now + Duration::from_secs(4), true),
        Err(HostError::Busy)
    );
    state
        .reserve_browser(now + Duration::from_secs(5), true)
        .unwrap();
    state.checkout_opened(now + Duration::from_secs(5));
    assert_eq!(
        state.reserve_browser(now + Duration::from_secs(10), true),
        Err(HostError::Busy)
    );
    state
        .reserve_browser(now + Duration::from_secs(10), false)
        .unwrap();
    state.stop_purchase("stopped");
    assert_eq!(
        state.reserve_browser(now + Duration::from_secs(14), true),
        Err(HostError::Busy)
    );
    state
        .reserve_browser(now + Duration::from_secs(15), true)
        .unwrap();
}
#[test]
fn a_denied_background_poll_does_not_break_an_active_browser_login() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.accepted(Operation::Begin, &Command::AccountBegin);
    state
        .complete(Operation::Begin, &account(Session::Pending), false, now)
        .unwrap();
    state.background_accepted(Operation::Poll, now);
    state.failed(Operation::Poll, &HostError::Denied, true, now);
    let view = state.view(&AccessView::default(), now, 0);
    assert_eq!(view.gate, Gate::WaitingBrowser);
    assert!(view.error.is_none());
}
#[test]
fn logout_keeps_old_responses_abandoned_after_its_acknowledgement() {
    let now = Instant::now();
    let mut state = state(Session::SignedIn);
    state.accepted(Operation::Profile, &Command::AccountProfileRefresh);
    state.accepted(Operation::Logout, &Command::Logout);
    state
        .complete(Operation::Logout, &account(Session::SignedOut), false, now)
        .unwrap();
    assert_eq!(
        state.complete(Operation::Profile, &account(Session::SignedIn), false, now),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).session,
        SessionView::SignedOut
    );
    state.accepted(Operation::Begin, &Command::AccountBegin);
    state
        .complete(Operation::Begin, &account(Session::SignedIn), false, now)
        .unwrap();
    assert_eq!(
        state.view(&AccessView::default(), now, 0).session,
        SessionView::SignedIn
    );
}
#[test]
fn cancel_cannot_be_overridden_by_an_old_background_reply_after_its_ack() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.background_accepted(Operation::Poll, now);
    state.accepted(Operation::Cancel, &Command::AccountCancel);
    state
        .complete(Operation::Cancel, &account(Session::SignedOut), false, now)
        .unwrap();
    assert_eq!(
        state.complete(Operation::Poll, &account(Session::SignedIn), true, now),
        Err(HostError::Denied)
    );
    assert_eq!(
        state.view(&AccessView::default(), now, 0).session,
        SessionView::SignedOut
    );
}
#[test]
fn profile_names_are_valid_for_the_ts_contract_even_with_url_delimiters() {
    assert_eq!(safe_name("Pilot://qa"), "Pilot qa");
    assert_eq!(safe_name("Pilot:\n//qa"), "Pilot qa");
    assert!(!clean("message:\n//qa").contains("://"));
    assert!(!safe_name("https://issuer.invalid").contains("://"));
}

#[test]
fn checkout_cooldown_starts_at_the_open_not_at_the_earlier_service_request() {
    let now = Instant::now();
    let mut state = state(Session::SignedIn);
    state.browser_available(now, true).unwrap();
    state
        .reserve_browser(now + Duration::from_secs(30), true)
        .unwrap();
    assert_eq!(
        state.browser_available(now + Duration::from_secs(31), false),
        Err(HostError::Busy)
    );
    state
        .browser_available(now + Duration::from_secs(35), false)
        .unwrap();
}

#[test]
fn needs_sign_in_can_open_email_as_in_the_frozen_login_guard() {
    let now = Instant::now();
    let mut state = state(Session::NeedsSignIn);
    state.open_email(EmailMode::SignInCode, now).unwrap();
    assert_eq!(state.view(&AccessView::default(), now, 0).gate, Gate::Email);
}

#[test]
fn the_authorizing_poll_closes_email_only_after_confirmed_sign_in() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.open_email(EmailMode::SignInCode, now).unwrap();
    state.accepted(
        Operation::Email,
        &Command::AccountEmail {
            action: vantare_ipc::services_protocol::EmailAction::Finish {},
        },
    );
    state
        .complete(
            Operation::Email,
            &CoreReply::Email {
                stage: vantare_ipc::services_protocol::EmailStage::Authorizing,
                retry_after_seconds: 0,
                message: String::new(),
                error: None,
            },
            false,
            now,
        )
        .unwrap();
    assert!(state.form.is_some());
    state.background_accepted(Operation::Poll, now);
    state
        .complete(Operation::Poll, &account(Session::SignedIn), true, now)
        .unwrap();
    assert!(state.form.is_none());
    assert_eq!(state.view(&AccessView::default(), now, 0).gate, Gate::None);
}

#[test]
fn a_background_license_status_closes_email_and_blocks_further_email_commands() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.open_email(EmailMode::SignInCode, now).unwrap();
    state.background_accepted(Operation::LicenseStatus, now);
    state
        .complete(
            Operation::LicenseStatus,
            &CoreReply::LicenseStatus {
                policy: control::Policy::default(),
                session: Some(Session::SignedIn),
                notice: None,
            },
            true,
            now,
        )
        .unwrap();
    assert!(state.form.is_none());
    let view = state.view(&AccessView::default(), now, 0);
    assert_eq!(view.gate, Gate::None);
    assert!(view.email.is_none());
    assert!(matches!(
        state.email_command(&EmailIntent::Finish {}, now),
        Err(HostError::Denied)
    ));
}
#[test]
fn a_signed_in_view_never_projects_a_stale_email_form() {
    let now = Instant::now();
    let mut state = state(Session::SignedOut);
    state.open_email(EmailMode::SignInCode, now).unwrap();
    state.reducer.fixture_session(Session::SignedIn);
    let view = state.view(&AccessView::default(), now, 0);
    assert_eq!(view.gate, Gate::None);
    assert!(view.email.is_none());
    assert!(matches!(
        state.email_command(&EmailIntent::Finish {}, now),
        Err(HostError::Denied)
    ));
}
#[test]
fn clipboard_availability_follows_the_build_capability() {
    let now = Instant::now();
    let mut state = state(Session::Pending);
    state.reducer.manual.available = true;
    state.reducer.manual.copied = true;
    state.reducer.login_requested = true;
    let view = state.view(&AccessView::default(), now, 0);
    assert_eq!(view.copy_link.available, clipboard::configured());
    assert_eq!(view.copy_link.copied, clipboard::configured());
}
