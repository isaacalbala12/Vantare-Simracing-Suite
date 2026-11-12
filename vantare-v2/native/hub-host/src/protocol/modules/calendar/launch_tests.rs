use super::*;
use crate::launcher_resident::{ResidentExecution, ResidentExecutionEvent, ResidentOutcome};
const WALL: i64 = 1_800_000_000_000;
fn clock(base: Instant, ms: u64) -> Clock {
    Clock {
        wall: WALL + i64::try_from(ms).unwrap(),
        monotonic: base + Duration::from_millis(ms),
    }
}
fn core() -> CoreStatus {
    CoreStatus {
        account_generation: Some("a".repeat(64)),
        rights: LinkState::Connected,
        access: crate::protocol::AccessView {
            verified: true,
            calendar: true,
            ..Default::default()
        },
        ..Default::default()
    }
}
fn resident() -> ResidentView {
    ResidentView {
        online: true,
        execution: Some(ResidentExecution {
            instance: "b".repeat(64),
            revision_checked_launch: true,
            first_retained_seq: "1".into(),
            events: vec![],
        }),
        ..Default::default()
    }
}
fn binding(id: char, now: Clock, mode: CalendarLaunchMode) -> Binding {
    Binding::new(
        CalendarLaunchPlan {
            arm_id: id.to_string().repeat(64),
            profile: "qa".into(),
            profile_name: "QA".into(),
            decision_required: true,
            mode,
        },
        "c".repeat(64),
        "a".repeat(64),
        "b".repeat(64),
        now,
    )
    .unwrap()
}
fn once(base: Instant) -> Scheduler {
    let mut scheduler = Scheduler::default();
    scheduler.install(
        binding(
            '1',
            clock(base, 0),
            CalendarLaunchMode::Once {
                series_id: "series".into(),
                start_at: WALL + LEAD_MS + 1000,
            },
        ),
        clock(base, 0),
    );
    scheduler
}
fn step(s: &mut Scheduler, base: Instant, ms: u64) -> Option<Due> {
    s.step(
        &core(),
        false,
        &resident(),
        true,
        true,
        &[],
        clock(base, ms),
    )
}
fn queue(s: &mut Scheduler, base: Instant) {
    let due = step(s, base, 1000).unwrap();
    s.sent(
        due,
        Ok(LaunchQueued::Queued {
            request: "d".repeat(32),
        }),
        &resident(),
        clock(base, 1000).monotonic,
    );
}
#[test]
fn arms_replaces_and_old_cancellation_does_not_cancel_the_new_plan() {
    let base = Instant::now();
    let mut s = once(base);
    s.install(
        binding(
            '2',
            clock(base, 1),
            CalendarLaunchMode::Once {
                series_id: "other".into(),
                start_at: WALL + LEAD_MS + 2000,
            },
        ),
        clock(base, 1),
    );
    assert_eq!(
        s.view().change.unwrap().reason,
        CalendarLaunchStop::Replaced
    );
    s.cancel(&"1".repeat(64));
    assert_eq!(s.view().armed.unwrap().arm_id, "2".repeat(64));
    s.cancel(&"2".repeat(64));
    assert!(!s.active());
    assert_eq!(s.view().change.unwrap().reason, CalendarLaunchStop::User);
}
#[test]
fn fires_at_the_deadline_once_and_keeps_queued_distinct_from_finished() {
    let base = Instant::now();
    let mut s = once(base);
    assert!(step(&mut s, base, 999).is_none());
    queue(&mut s, base);
    assert!(matches!(
        s.view().latest.unwrap().progress,
        CalendarLaunchProgress::Queued { .. }
    ));
    assert!(step(&mut s, base, 1000).is_none());
    assert!(step(&mut s, base, 1001).is_none());
}
#[test]
fn every_scope_loss_disarms_without_an_action_even_with_the_same_rights() {
    for (cause, expected) in [
        (0, CalendarLaunchStop::AccountChanged),
        (1, CalendarLaunchStop::RightsLost),
        (2, CalendarLaunchStop::Live),
        (3, CalendarLaunchStop::CoreDisconnected),
        (4, CalendarLaunchStop::HubClosed),
    ] {
        let base = Instant::now();
        let mut s = once(base);
        let mut scope = core();
        match cause {
            0 => scope.account_generation = Some("e".repeat(64)),
            1 => scope.access.calendar = false,
            2 => scope.live = true,
            3 => scope.rights = LinkState::Unavailable,
            _ => {}
        }
        assert!(
            s.step(
                &scope,
                cause == 4,
                &resident(),
                true,
                true,
                &[],
                clock(base, 1000)
            )
            .is_none()
        );
        assert!(s.view().armed.is_none());
        assert_eq!(s.view().change.unwrap().reason, expected);
    }
}
#[test]
fn a_wall_clock_jump_in_either_direction_disarms_instead_of_launching_early_or_replaying() {
    for jump in [-60_000, 60_000] {
        let base = Instant::now();
        let mut s = once(base);
        let mut time = clock(base, 1000);
        time.wall += jump;
        assert!(
            s.step(&core(), false, &resident(), true, true, &[], time)
                .is_none()
        );
        assert_eq!(
            s.view().change.unwrap().reason,
            CalendarLaunchStop::ClockChanged
        );
        assert!(step(&mut s, base, 1001).is_none());
    }
}
#[test]
fn waking_after_the_departure_does_not_launch_a_missed_race() {
    let base = Instant::now();
    let mut s = once(base);
    assert!(step(&mut s, base, LEAD_MS.cast_unsigned() + 1001).is_none());
    assert_eq!(s.view().change.unwrap().reason, CalendarLaunchStop::Expired);
}
#[test]
fn receipts_require_the_owned_request_run_and_instance_and_do_not_repeat_terminals() {
    let base = Instant::now();
    let mut s = once(base);
    queue(&mut s, base);
    let mut view = resident();
    view.execution.as_mut().unwrap().events = vec![
        ResidentExecutionEvent {
            seq: "1".into(),
            kind: ResidentEventKind::Received {
                request: "d".repeat(32),
                receipt: ResidentReceipt::Accepted { run: "1".into() },
            },
        },
        ResidentExecutionEvent {
            seq: "2".into(),
            kind: ResidentEventKind::Finished {
                run: "1".into(),
                outcome: ResidentOutcome::Completed,
            },
        },
    ];
    assert!(
        s.step(&core(), false, &view, true, true, &[], clock(base, 1100))
            .is_none()
    );
    assert!(matches!(
        s.view().latest.as_ref().unwrap().progress,
        CalendarLaunchProgress::Finished {
            outcome: ResidentOutcome::Completed,
            ..
        }
    ));
    let completed = s.view();
    s.step(&core(), false, &view, true, true, &[], clock(base, 1200));
    assert_eq!(s.view(), completed);
}
#[test]
fn an_unrelated_terminal_never_confirms_our_launch() {
    let base = Instant::now();
    let mut s = once(base);
    queue(&mut s, base);
    let mut view = resident();
    view.execution.as_mut().unwrap().events = vec![ResidentExecutionEvent {
        seq: "1".into(),
        kind: ResidentEventKind::Finished {
            run: "99".into(),
            outcome: ResidentOutcome::Completed,
        },
    }];
    s.step(&core(), false, &view, true, true, &[], clock(base, 6000));
    assert!(matches!(
        s.view().latest.unwrap().progress,
        CalendarLaunchProgress::Unknown {
            reason: CalendarLaunchUnknown::NoReceipt,
            ..
        }
    ));
}
#[test]
fn a_gap_restart_disconnect_or_lost_scope_turns_an_unconfirmed_request_unknown() {
    for cause in 0..4 {
        let base = Instant::now();
        let mut s = once(base);
        queue(&mut s, base);
        let mut view = resident();
        let mut scope = core();
        let expected = match cause {
            0 => {
                view.execution.as_mut().unwrap().first_retained_seq = "2".into();
                CalendarLaunchUnknown::RingGap
            }
            1 => {
                view.execution.as_mut().unwrap().instance = "f".repeat(64);
                CalendarLaunchUnknown::ResidentRestarted
            }
            2 => {
                view.online = false;
                CalendarLaunchUnknown::ResidentUnavailable
            }
            _ => {
                scope.account_generation = None;
                CalendarLaunchUnknown::ScopeLost
            }
        };
        s.step(&scope, false, &view, true, true, &[], clock(base, 1100));
        assert!(
            matches!(s.view().latest.unwrap().progress,CalendarLaunchProgress::Unknown {reason,..} if reason==expected)
        );
    }
}
#[test]
fn a_late_receipt_after_timeout_does_not_reopen_the_attempt() {
    let base = Instant::now();
    let mut s = once(base);
    queue(&mut s, base);
    step(&mut s, base, 5999);
    assert!(matches!(
        s.view().latest.unwrap().progress,
        CalendarLaunchProgress::Queued { .. }
    ));
    step(&mut s, base, 6000);
    let unknown = s.view();
    let mut view = resident();
    view.execution.as_mut().unwrap().events = vec![ResidentExecutionEvent {
        seq: "1".into(),
        kind: ResidentEventKind::Received {
            request: "d".repeat(32),
            receipt: ResidentReceipt::Accepted { run: "1".into() },
        },
    }];
    s.step(&core(), false, &view, true, true, &[], clock(base, 6100));
    assert_eq!(s.view(), unknown);
}
#[test]
fn automatic_mode_is_session_scoped_respects_the_saved_flag_and_sends_each_window_once() {
    let base = Instant::now();
    let mut s = Scheduler::default();
    s.install(
        binding(
            '1',
            clock(base, 0),
            CalendarLaunchMode::Alerts {
                expected_revision: "c".repeat(64),
            },
        ),
        clock(base, 0),
    );
    let candidates = [Candidate {
        series_id: "series".into(),
        start_at: WALL + LEAD_MS + 1000,
    }];
    let due = s
        .step(
            &core(),
            false,
            &resident(),
            true,
            true,
            &candidates,
            clock(base, 1000),
        )
        .unwrap();
    s.sent(
        due,
        Err(HostError::Busy),
        &resident(),
        clock(base, 1000).monotonic,
    );
    assert!(
        s.step(
            &core(),
            false,
            &resident(),
            true,
            true,
            &candidates,
            clock(base, 1000)
        )
        .is_none()
    );
    assert!(
        s.step(
            &core(),
            false,
            &resident(),
            true,
            false,
            &candidates,
            clock(base, 1001)
        )
        .is_none()
    );
    assert!(s.view().automatic.is_none());
    assert_eq!(
        s.view().change.unwrap().reason,
        CalendarLaunchStop::Disabled
    );
    assert_eq!(Scheduler::default().view(), CalendarLaunchView::default());
}
#[test]
fn an_uncertain_write_is_unknown_and_never_retried() {
    let base = Instant::now();
    let mut s = once(base);
    let due = step(&mut s, base, 1000).unwrap();
    s.sent(
        due,
        Err(HostError::Io),
        &resident(),
        clock(base, 1000).monotonic,
    );
    assert!(matches!(
        s.view().latest.unwrap().progress,
        CalendarLaunchProgress::Unknown {
            request: None,
            reason: CalendarLaunchUnknown::UnconfirmedWrite
        }
    ));
    assert!(step(&mut s, base, 1001).is_none());
}
#[test]
fn closing_explicitly_removes_all_intentions_without_claiming_to_cancel_an_accepted_chain() {
    let base = Instant::now();
    let mut s = once(base);
    queue(&mut s, base);
    s.close();
    assert!(!s.active());
    assert!(matches!(
        s.view().latest.unwrap().progress,
        CalendarLaunchProgress::Unknown {
            reason: CalendarLaunchUnknown::ScopeLost,
            ..
        }
    ));
}
