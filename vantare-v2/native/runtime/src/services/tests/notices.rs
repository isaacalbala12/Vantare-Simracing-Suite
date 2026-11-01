use super::*;

#[test]
fn slow_no_deadline_success_anchors_the_full_day_at_dispatch_completion() {
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let now = Instant::now();
    let completed = now + Duration::from_mins(2);
    let policy = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: 1000,
        state: control::AccessState::Active,
        ..control::Policy::default()
    };
    let reply = || Reply::License {
        policy: policy.clone(),
        message: String::new(),
    };
    assert!(
        run_renewal_with_clock(&mut state, &policy, 1000, now, |_, _| reply(), || completed)
            .is_some()
    );
    for early in [
        now + Duration::from_hours(24),
        completed + Duration::from_mins(1439),
    ] {
        assert!(
            run_renewal(&mut state, &policy, 1000, early, |_, _| panic!(
                "too early after slow success"
            ))
            .is_none()
        );
    }
    assert!(
        run_renewal(
            &mut state,
            &policy,
            1000,
            completed + Duration::from_hours(24),
            |_, _| reply()
        )
        .is_some()
    );
}

#[test]
fn helper_restart_and_hub_reconnect_preserve_no_deadline_backoff_and_daily_check() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::with_grant(true, chrono::TimeDelta::zero(), "vantare.plan.founders");
    let mut hub = Session::open(&photo);
    let now = Instant::now();
    let retained = protocol::LicenseNotice::DeviceLimit {
        message: "fixture limit".into(),
    };
    {
        let mut state = services.state.lock().expect("state");
        state.core_retry_at = Some(now + Duration::from_hours(72));
        state.renewal.observe(&confirmed_session());
        state.notice = Some(retained.clone());
    }
    assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
    let policy = control::request(&link, control::Command::Read).expect("core");
    assert_eq!(policy.catalog, control::CatalogAccess::Founders);
    assert_eq!(policy.signed_until_ms, None, "real signed perpetual v1");
    let mut attempts = 0;
    for (minute, outcome) in [
        (0, protocol::RenewalOutcome::Transient),
        (1, protocol::RenewalOutcome::Transient),
        (3, protocol::RenewalOutcome::Transient),
        (7, protocol::RenewalOutcome::Verified),
    ] {
        {
            let mut state = services.state.lock().expect("state");
            let reply = run_renewal_with_clock(
                &mut state,
                &policy,
                policy.checked_at_ms,
                now + Duration::from_mins(minute),
                |_, command| {
                    assert!(matches!(command, Command::LicenseRenewAutomatic));
                    attempts += 1;
                    cadence_reply(&policy, outcome)
                },
                || now + Duration::from_mins(minute),
            );
            assert!(reply.is_some());
        }
        assert!(matches!(hub.request(Command::Shutdown), Reply::Closed));
        drop(hub);
        hub = Session::open(&photo);
        assert!(matches!(
            hub.request(Command::LicenseStatus),
            Reply::LicenseStatus { notice, .. } if notice == (outcome != protocol::RenewalOutcome::Verified).then(|| retained.clone())
        ));
        assert!(services.state.lock().expect("state").client.is_none());
        assert!(matches!(hub.request(Command::Status), Reply::Status { .. }));
        let mut state = services.state.lock().expect("state");
        assert!(state.client.is_some(), "helper reopened");
        let offset = if minute == 7 {
            Duration::from_mins(1439)
        } else {
            Duration::from_secs(59)
        };
        assert!(
            run_renewal(
                &mut state,
                &policy,
                policy.checked_at_ms,
                now + Duration::from_mins(minute) + offset,
                |_, _| panic!("no burst after reconnect/restart")
            )
            .is_none()
        );
    }
    assert_eq!(attempts, 4);
    {
        let mut state = services.state.lock().expect("state");
        assert!(
            run_renewal(
                &mut state,
                &policy,
                policy.checked_at_ms,
                now + Duration::from_mins(7) + Duration::from_hours(24),
                |_, _| {
                    attempts += 1;
                    cadence_reply(&policy, protocol::RenewalOutcome::Verified)
                }
            )
            .is_some()
        );
    }
    assert_eq!(attempts, 5);
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private fixture cleanup");
}

#[test]
fn transient_in_active_grace_or_live_never_creates_an_access_notice() {
    let now = Instant::now();
    for access in [control::AccessState::Active, control::AccessState::Grace] {
        for live in [false, true] {
            for reply in [
                Reply::LicenseFailure {
                    outcome: protocol::RenewalOutcome::Transient,
                    message: "offline".into(),
                },
                failure("transport"),
            ] {
                let mut state = State::default();
                state.renewal.observe(&confirmed_session());
                let policy = control::Policy {
                    version: control::VERSION,
                    revision: 1,
                    checked_at_ms: 1000,
                    state: access,
                    live,
                    signed_until_ms: Some(61_000),
                    grace_until_ms: Some(61_000),
                    ..Default::default()
                };
                assert!(
                    run_renewal(&mut state, &policy, 1000, now, |_, command| {
                        assert!(matches!(command, Command::LicenseRenewAutomatic));
                        reply
                    })
                    .is_some()
                );
                assert!(
                    state.notice.is_none(),
                    "transport never becomes an access notice"
                );
                assert!(state.renewal.signed_in());
                assert!(
                    run_renewal(
                        &mut state,
                        &policy,
                        1000,
                        now + Duration::from_secs(59),
                        |_, _| { panic!("no retry burst") }
                    )
                    .is_none()
                );
            }
        }
    }
}

#[test]
fn confirmed_login_rechecks_once_and_redetects_a_rejection_with_the_retry_floor() {
    for email in [false, true] {
        for rejected in [false, true] {
            let mut state = State::default();
            let signing: SigningIn = Arc::new(Mutex::new(None));
            state.renewal.observe(&pending_account(
                &mut State::default(),
                Command::AccountBegin,
            ));
            let now = Instant::now();
            state.renewal.attempted(now);
            state
                .renewal
                .completed(protocol::RenewalOutcome::Definitive, now);
            remember_notice(
                &mut state,
                &Reply::DeviceLimit {
                    message: "limit".into(),
                },
            );
            let login = if email {
                Command::AccountEmail {
                    action: protocol::EmailAction::Finish {},
                }
            } else {
                Command::AccountPoll
            };
            handle_with(&mut state, login, &signing, |_, _| confirmed_session());
            assert!(state.notice.is_none());
            let policy = control::Policy {
                version: control::VERSION,
                revision: 1,
                checked_at_ms: 1000,
                state: control::AccessState::Active,
                catalog: control::CatalogAccess::Pro,
                signed_until_ms: Some(30 * 24 * 60 * 60_000),
                ..Default::default()
            };
            assert!(
                run_renewal(
                    &mut state,
                    &policy,
                    1000,
                    now + Duration::from_secs(59),
                    |_, _| { panic!("confirmed login preserves the automatic floor") }
                )
                .is_none()
            );
            let mut calls = 0;
            assert!(
                run_renewal(
                    &mut state,
                    &policy,
                    1000,
                    now + Duration::from_mins(1),
                    |_, _| {
                        calls += 1;
                        if rejected {
                            Reply::LicenseFailure {
                                outcome: protocol::RenewalOutcome::Definitive,
                                message: "account_conflict".into(),
                            }
                        } else {
                            core_status_reply(policy.clone())
                        }
                    }
                )
                .is_some()
            );
            assert_eq!(calls, 1);
            assert_eq!(
                state.notice.is_some(),
                rejected,
                "a still-applicable rejection returns"
            );
            handle_with(&mut state, Command::AccountPoll, &signing, |_, _| {
                confirmed_session()
            });
            assert!(run_renewal(&mut state, &policy, 1000, now + Duration::from_mins(2), |_, _| {
                panic!("a successful check or definitive rejection consumes the login check; polls cannot rearm it")
            }).is_none());
        }
    }
}

#[test]
fn transient_renewal_preserves_the_actionable_rejection_until_verified() {
    for prior in [
        Reply::DeviceLimit {
            message: "limit".into(),
        },
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Definitive,
            message: "account_conflict".into(),
        },
    ] {
        let mut state = State::default();
        let signing: SigningIn = Arc::new(Mutex::new(None));
        state.renewal.observe(&confirmed_session());
        remember_notice(&mut state, &prior);
        let expected = expected_notice(&prior);
        let reply = handle_with(&mut state, Command::LicenseRenew, &signing, |_, _| {
            Reply::LicenseFailure {
                outcome: protocol::RenewalOutcome::Transient,
                message: "offline".into(),
            }
        });
        assert!(matches!(
            reply,
            Reply::LicenseFailure {
                outcome: protocol::RenewalOutcome::Transient,
                ..
            }
        ));
        assert_eq!(
            state.notice.as_ref(),
            Some(&expected),
            "transport does not resolve the prior condition"
        );
        let policy = control::Policy {
            version: control::VERSION,
            revision: 1,
            checked_at_ms: 1000,
            state: control::AccessState::Active,
            ..Default::default()
        };
        handle_with(&mut state, Command::LicenseRenew, &signing, |_, _| {
            core_status_reply(policy)
        });
        assert!(
            state.notice.is_none(),
            "verified renewal supersedes the old rejection"
        );
    }
}

fn expected_notice(reply: &Reply) -> protocol::LicenseNotice {
    match reply {
        Reply::DeviceLimit { message } => protocol::LicenseNotice::DeviceLimit {
            message: message.clone(),
        },
        Reply::LicenseFailure { outcome, message } => protocol::LicenseNotice::Failure {
            outcome: *outcome,
            message: message.clone(),
        },
        _ => unreachable!(),
    }
}

fn lose_status_response(mut hub: Session, photo: &str) -> Session {
    // Closing without reading loses the response. Reconnection waits until
    // the server exits that request, without a timed sleep.
    protocol::write(
        &mut hub.pipe,
        &Request {
            version: protocol::VERSION,
            sequence: hub.sequence + 1,
            nonce: hub.nonce.clone(),
            command: Command::LicenseStatus,
        },
    )
    .expect("request whose response is lost");
    drop(hub);
    Session::open(photo)
}

#[test]
fn lost_notice_response_is_recoverable_without_helper_or_another_remote_effect() {
    let Fixture {
        root,
        photo,
        link,
        core,
        services,
    } = Fixture::with_license(false);
    let mut hub = Session::open(&photo);
    let mut policy = control::request(&link, control::Command::Read).expect("core");
    let now = Instant::now();
    for notice in [
        Reply::DeviceLimit {
            message: "device limit".into(),
        },
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Definitive,
            message: "account_conflict".into(),
        },
        Reply::LicenseFailure {
            outcome: protocol::RenewalOutcome::Definitive,
            message: "recovery".into(),
        },
    ] {
        let mut state = services.state.lock().expect("state");
        // The injected scheduler below owns this fixture's attempts.
        state.core_retry_at = Some(now + Duration::from_hours(1));
        state.renewal = Renewal::default();
        state.renewal.observe(&confirmed_session());
        let mut requests = 0;
        run_renewal(&mut state, &policy, policy.checked_at_ms, now, |_, _| {
            requests += 1;
            notice.clone()
        })
        .expect("first attempt");
        for second in [0, 1, 5, 30, 59] {
            policy.checked_at_ms += 1;
            assert!(
                run_renewal(
                    &mut state,
                    &policy,
                    policy.checked_at_ms,
                    now + Duration::from_secs(second),
                    |_, _| {
                        requests += 1;
                        panic!("no retry burst")
                    }
                )
                .is_none()
            );
        }
        assert_eq!(requests, 1);
        drop(state);
        hub = lose_status_response(hub, &photo);
        let expected = expected_notice(&notice);
        for _ in 0..2 {
            let Reply::LicenseStatus {
                notice, session, ..
            } = hub.request(Command::LicenseStatus)
            else {
                panic!("status")
            };
            assert_eq!(notice.as_ref(), Some(&expected));
            assert_eq!(session, Some(protocol::Session::SignedIn));
            assert!(services.state.lock().expect("state").client.is_none());
        }
        let signing: SigningIn = Arc::new(Mutex::new(None));
        handle_with(
            &mut services.state.lock().expect("state"),
            Command::Logout,
            &signing,
            |_, _| failure("lost helper"),
        );
        assert!(
            matches!(
                hub.request(Command::LicenseStatus),
                Reply::LicenseStatus {
                    session: None,
                    notice: Some(_),
                    ..
                }
            ),
            "a failed Logout cannot publish SignedOut"
        );
        let mut signed_out = confirmed_session();
        if let Reply::Account { session, .. } = &mut signed_out {
            *session = protocol::Session::SignedOut;
        }
        handle_with(
            &mut services.state.lock().expect("state"),
            Command::Logout,
            &signing,
            |_, _| signed_out,
        );
        assert!(services.state.lock().expect("state").notice.is_none());
    }
    drop(hub);
    drop(services);
    drop(core);
    std::fs::remove_dir_all(root).expect("private cleanup");
}

fn pending_account(_: &mut State, _: Command) -> Reply {
    let mut reply = confirmed_session();
    if let Reply::Account {
        session, pending, ..
    } = &mut reply
    {
        *session = protocol::Session::Pending;
        *pending = true;
    }
    reply
}

#[test]
fn notice_is_retained_until_confirmed_login_reset_or_verified_renewal() {
    let mut state = State::default();
    let notice = Reply::DeviceLimit {
        message: "limit".into(),
    };
    let expected = expected_notice(&notice);
    let signing: SigningIn = Arc::new(Mutex::new(None));
    remember_notice(&mut state, &notice);
    remember_notice(&mut state, &failure("transport"));
    assert_eq!(state.notice.as_ref(), Some(&expected));
    handle_with(&mut state, Command::Logout, &signing, |_, _| {
        let mut reply = confirmed_session();
        if let Reply::Account { error, .. } = &mut reply {
            *error = Some("ACK perdido".into());
        }
        reply
    });
    assert_eq!(
        state.notice.as_ref(),
        Some(&expected),
        "failed Logout does not resolve the notice"
    );
    handle_with(&mut state, Command::AccountBegin, &signing, pending_account);
    handle_with(&mut state, Command::AccountCancel, &signing, |_, _| {
        confirmed_session()
    });
    assert_eq!(
        state.notice.as_ref(),
        Some(&expected),
        "cancel is not recovery"
    );
    handle_with(&mut state, Command::AccountBegin, &signing, pending_account);
    handle_with(&mut state, Command::AccountPoll, &signing, |_, _| {
        confirmed_session()
    });
    assert!(
        state.notice.is_none(),
        "confirmed OAuth login resolves the notice"
    );
    remember_notice(&mut state, &notice);
    handle_with(
        &mut state,
        Command::AccountEmail {
            action: protocol::EmailAction::Finish {},
        },
        &signing,
        |_, _| confirmed_session(),
    );
    assert!(state.notice.is_none(), "email login resolves the notice");
    remember_notice(&mut state, &notice);
    let policy = control::Policy {
        revision: 1,
        checked_at_ms: 1000,
        ..control::Policy::denied(control::AccessState::NoCredential)
    };
    handle_with(&mut state, Command::LicenseRenew, &signing, |_, _| {
        core_status_reply(policy.clone())
    });
    assert_eq!(
        state.notice.as_ref(),
        Some(&expected),
        "denied renewal cannot resolve the notice"
    );
    handle_with(&mut state, Command::LicenseRenew, &signing, |_, _| {
        core_status_reply(control::Policy {
            state: control::AccessState::Active,
            ..policy.clone()
        })
    });
    assert!(
        state.notice.is_none(),
        "verified renewal supersedes the notice"
    );
    remember_notice(&mut state, &notice);
    handle_with(&mut state, Command::DeviceReset, &signing, |_, _| {
        core_status_reply(policy)
    });
    assert!(
        state.notice.is_none(),
        "confirmed reset supersedes the notice"
    );
}

fn cadence_reply(policy: &control::Policy, outcome: protocol::RenewalOutcome) -> Reply {
    match outcome {
        protocol::RenewalOutcome::Verified => Reply::License {
            policy: policy.clone(),
            message: String::new(),
        },
        _ => Reply::LicenseFailure {
            outcome,
            message: "fixture offline".into(),
        },
    }
}

#[test]
fn manual_verified_no_deadline_reply_delays_the_next_automatic_check() {
    let mut state = State::default();
    state.renewal.observe(&confirmed_session());
    let policy = control::Policy {
        version: control::VERSION,
        revision: 1,
        checked_at_ms: 1000,
        state: control::AccessState::Active,
        ..control::Policy::default()
    };
    let signing: SigningIn = Arc::new(Mutex::new(None));
    let before = Instant::now();
    handle_with(&mut state, Command::LicenseRenew, &signing, |_, _| {
        cadence_reply(&policy, protocol::RenewalOutcome::Verified)
    });
    let after = Instant::now();
    // Bound completion between two clock observations, without sleeps or races.
    assert!(
        run_renewal(
            &mut state,
            &policy,
            1000,
            before + Duration::from_mins(1439),
            |_, _| panic!("manual success already checked")
        )
        .is_none()
    );
    assert!(
        run_renewal(
            &mut state,
            &policy,
            1000,
            after + Duration::from_hours(24),
            |_, _| cadence_reply(&policy, protocol::RenewalOutcome::Verified)
        )
        .is_some()
    );
}
