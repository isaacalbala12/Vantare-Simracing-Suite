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
    assert!(!safe_name("https://issuer.invalid").contains("://"));
}
