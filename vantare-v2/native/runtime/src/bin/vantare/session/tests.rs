use super::*;

fn pulse(session: &mut Session, now: Instant, permitted: bool, done: bool) -> Vec<Action> {
    session.paso(
        Event::Tick {
            permitted,
            workers_done: done,
        },
        now,
    )
}

fn running(grace: Duration) -> (Session, Instant) {
    let now = Instant::now();
    let mut session = Session::new(
        [
            Policy::core(2),
            Policy::consumer(2),
            Policy::permitted(2),
            Policy::observer(),
        ],
        grace,
        now,
    );
    assert_eq!(
        pulse(&mut session, now, true, false),
        vec![
            Action::Spawn(0),
            Action::Spawn(1),
            Action::Spawn(2),
            Action::Spawn(3)
        ]
    );
    for i in 0..4 {
        session.paso(Event::Started(i), now);
    }
    assert_eq!(session.phase, Phase::Running);
    (session, now)
}

#[test]
fn stopping_requests_consumers_in_policy_order_and_keeps_one_deadline() {
    let grace = Duration::from_secs(3);
    let (mut session, now) = running(grace);
    assert_eq!(
        session.paso(Event::Stop(Reason::Stopped), now),
        vec![
            Action::StopWorkers,
            Action::Close(2),
            Action::Close(1),
            Action::Close(3)
        ]
    );
    let phase = session.phase;
    assert!(
        session
            .paso(Event::Stop(Reason::Failed), now + Duration::from_secs(1))
            .is_empty()
    );
    assert_eq!(
        session.phase, phase,
        "no renovar presupuesto ni ocultar motivo"
    );
    assert!(
        pulse(
            &mut session,
            now + Duration::from_millis(1999),
            false,
            false
        )
        .is_empty()
    );
    assert_eq!(
        pulse(&mut session, now + Duration::from_secs(2), false, false),
        vec![Action::Close(0)]
    );
    let actions = pulse(&mut session, now + grace, false, false);
    assert_eq!(
        actions,
        vec![
            Action::ForceWorkers,
            Action::Kill(0),
            Action::Kill(1),
            Action::Kill(2),
            Action::Kill(3)
        ]
    );
    for child in 0..4 {
        session.paso(
            Event::Killed {
                child,
                reaped: true,
            },
            now + grace,
        );
    }
    assert_eq!(session.phase, Phase::Finished(Reason::Stopped));
}

#[test]
fn short_budget_reserves_half_for_the_producer() {
    let grace = Duration::from_millis(350);
    let (mut session, now) = running(grace);
    session.paso(Event::Stop(Reason::Stopped), now);
    assert!(pulse(&mut session, now + Duration::from_millis(174), false, false).is_empty());
    assert_eq!(
        pulse(&mut session, now + Duration::from_millis(175), false, false),
        vec![Action::Close(0)]
    );
    assert!(session.wait_for(now + Duration::from_millis(340)) <= Duration::from_millis(10));
}

#[test]
fn normal_cleanup_finishes_consumers_and_workers_before_the_core() {
    let (mut session, now) = running(Duration::from_secs(3));
    session.paso(Event::Stop(Reason::Stopped), now);
    for child in [1, 3, 2] {
        assert!(
            session
                .paso(
                    Event::Exited {
                        child,
                        success: true
                    },
                    now
                )
                .is_empty()
        );
    }
    assert_eq!(
        pulse(&mut session, now, false, true),
        vec![Action::Close(0)]
    );
    assert!(
        session
            .paso(
                Event::Exited {
                    child: 0,
                    success: true
                },
                now
            )
            .is_empty()
    );
    assert_eq!(session.phase, Phase::Finished(Reason::Stopped));
}

#[test]
fn permission_is_a_policy_and_revocation_does_not_stop_the_session() {
    let (mut session, now) = running(Duration::from_secs(3));
    assert_eq!(
        pulse(&mut session, now, false, false),
        vec![Action::Close(2)]
    );
    assert!(
        session
            .paso(
                Event::Exited {
                    child: 2,
                    success: false
                },
                now
            )
            .is_empty()
    );
    assert_eq!(session.phase, Phase::Running);
    assert_eq!(
        pulse(&mut session, now, true, false),
        vec![Action::Spawn(2)]
    );
    session.paso(Event::Started(2), now);
    pulse(&mut session, now, false, false);
    assert_eq!(
        pulse(&mut session, now + Duration::from_secs(3), false, false),
        vec![Action::Kill(2)]
    );
    session.paso(
        Event::Killed {
            child: 2,
            reaped: true,
        },
        now + Duration::from_secs(3),
    );
    assert_eq!(session.phase, Phase::Running);
}

#[test]
fn denied_children_never_start_and_observers_never_restart_or_stop_the_session() {
    let now = Instant::now();
    let mut session = Session::new(
        [Policy::permitted(2), Policy::observer()],
        Duration::from_secs(1),
        now,
    );
    assert_eq!(
        pulse(&mut session, now, false, false),
        vec![Action::Spawn(1)]
    );
    session.paso(Event::SpawnFailed(1), now);
    assert_eq!(session.phase, Phase::Running);
    assert!(pulse(&mut session, now + Duration::from_secs(30), false, false).is_empty());
    assert_eq!(
        pulse(&mut session, now + Duration::from_secs(30), true, false),
        vec![Action::Spawn(0)]
    );
}

#[test]
fn successful_exit_of_a_required_child_stops_the_session_including_permitted_children() {
    for child in [0, 1, 2] {
        let (mut session, now) = running(Duration::from_secs(3));
        let actions = session.paso(
            Event::Exited {
                child,
                success: true,
            },
            now,
        );
        assert!(actions.contains(&Action::StopWorkers));
        assert!(
            matches!(session.phase, Phase::Stopping { reason: Reason::Finished(i), .. } if i == child)
        );
    }
}

#[test]
fn crashes_preserve_backoff_budget_and_stability_with_an_injected_clock() {
    let now = Instant::now();
    let mut session = Session::new([Policy::consumer(2)], Duration::from_secs(1), now);
    pulse(&mut session, now, true, false);
    session.paso(Event::Started(0), now);
    let crash = Event::Exited {
        child: 0,
        success: false,
    };
    assert_eq!(
        session.paso(crash, now),
        vec![Action::Backoff {
            child: 0,
            delay: super::super::BACKOFF
        }]
    );
    assert!(pulse(&mut session, now + Duration::from_millis(249), true, false).is_empty());
    let at = now + Duration::from_millis(250);
    assert_eq!(pulse(&mut session, at, true, false), vec![Action::Spawn(0)]);
    session.paso(Event::Started(0), at);
    assert_eq!(
        session.paso(crash, at),
        vec![Action::Backoff {
            child: 0,
            delay: Duration::from_millis(500)
        }]
    );
    let at = at + Duration::from_millis(500);
    pulse(&mut session, at, true, false);
    session.paso(Event::Started(0), at);
    assert_eq!(
        session.paso(crash, at + super::super::STABLE),
        vec![Action::Backoff {
            child: 0,
            delay: super::super::BACKOFF
        }]
    );
}

#[test]
fn spawn_failures_exhaust_the_same_budget_and_cancel_other_pending_starts() {
    let now = Instant::now();
    let mut session = Session::new(
        [Policy::core(0), Policy::consumer(2)],
        Duration::from_secs(1),
        now,
    );
    pulse(&mut session, now, true, false);
    let actions = session.paso(Event::SpawnFailed(0), now);
    assert_eq!(actions, vec![Action::StopWorkers]);
    assert!(!session.can_spawn(1));
    assert!(matches!(
        session.phase,
        Phase::Stopping {
            reason: Reason::Exhausted(0),
            ..
        }
    ));
}

#[test]
fn a_nonzero_exit_during_requested_closure_does_not_restart_or_replace_the_reason() {
    let (mut session, now) = running(Duration::from_secs(3));
    session.paso(Event::Stop(Reason::Failed), now);
    for child in [1, 2, 3] {
        assert!(
            session
                .paso(
                    Event::Exited {
                        child,
                        success: false
                    },
                    now
                )
                .is_empty()
        );
    }
    assert_eq!(
        pulse(&mut session, now, false, true),
        vec![Action::Close(0)]
    );
    session.paso(
        Event::Exited {
            child: 0,
            success: false,
        },
        now,
    );
    assert_eq!(session.phase, Phase::Finished(Reason::Failed));
}

#[test]
fn kills_are_emitted_once_and_late_completion_cannot_reap_a_scheduled_child() {
    let (mut session, now) = running(Duration::from_secs(1));
    pulse(&mut session, now, false, false);
    let deadline = now + Duration::from_secs(1);
    assert_eq!(
        pulse(&mut session, deadline, false, false),
        vec![Action::Kill(2)]
    );
    assert!(pulse(&mut session, deadline, false, false).is_empty());
    assert_eq!(
        session.paso(
            Event::Exited {
                child: 2,
                success: false
            },
            deadline
        ),
        vec![]
    );
    assert_eq!(session.children[2].state, ChildState::Waiting(deadline));
    assert!(
        session
            .paso(
                Event::Killed {
                    child: 2,
                    reaped: true
                },
                deadline
            )
            .is_empty()
    );
    assert_eq!(
        pulse(&mut session, deadline, true, false),
        vec![Action::Spawn(2)]
    );
    for event in [
        Event::Exited {
            child: 2,
            success: true,
        },
        Event::Killed {
            child: 2,
            reaped: true,
        },
    ] {
        assert!(session.paso(event, deadline).is_empty());
        assert!(session.can_spawn(2));
    }
    session.paso(Event::Started(2), deadline);
    session.paso(Event::Stop(Reason::Stopped), deadline);
    let at = deadline + Duration::from_secs(1);
    assert_eq!(
        pulse(&mut session, at, false, true),
        vec![
            Action::Close(0),
            Action::Kill(0),
            Action::Kill(1),
            Action::Kill(2),
            Action::Kill(3)
        ]
    );
    assert!(pulse(&mut session, at, false, true).is_empty());
    for child in 0..4 {
        session.paso(
            Event::Exited {
                child,
                success: false,
            },
            at,
        );
        assert!(
            session
                .paso(
                    Event::Killed {
                        child,
                        reaped: true
                    },
                    at
                )
                .is_empty()
        );
        assert!(
            session
                .paso(
                    Event::Exited {
                        child,
                        success: true
                    },
                    at
                )
                .is_empty()
        );
        assert_eq!(session.children[child].state, ChildState::Reaped);
    }
    assert_eq!(session.phase, Phase::Finished(Reason::Stopped));
}

#[test]
fn duplicate_exit_cannot_spend_restart_budget_or_stop_a_reprogrammed_child() {
    let now = Instant::now();
    let mut session = Session::new([Policy::consumer(2)], Duration::from_secs(1), now);
    pulse(&mut session, now, true, false);
    session.paso(Event::Started(0), now);
    session.paso(
        Event::Exited {
            child: 0,
            success: false,
        },
        now,
    );
    let waiting = session.children[0].state;
    for event in [
        Event::Exited {
            child: 0,
            success: true,
        },
        Event::Exited {
            child: 0,
            success: false,
        },
        Event::Killed {
            child: 0,
            reaped: true,
        },
    ] {
        assert!(session.paso(event, now).is_empty());
        assert_eq!(session.children[0].state, waiting);
        assert_eq!(session.children[0].restarts.attempts, 1);
        assert!(!session.stopping());
    }
}

#[test]
fn exit_after_revocation_kill_during_stop_is_reaped_without_rescheduling() {
    for success in [false, true] {
        let now = Instant::now();
        let grace = Duration::from_secs(1);
        let mut session = Session::new([Policy::permitted(2)], grace, now);
        assert_eq!(pulse(&mut session, now, true, true), vec![Action::Spawn(0)]);
        session.paso(Event::Started(0), now);
        assert_eq!(
            pulse(&mut session, now, false, true),
            vec![Action::Close(0)]
        );
        let at = now + grace;
        assert_eq!(pulse(&mut session, at, false, true), vec![Action::Kill(0)]);
        assert_eq!(
            session.children[0].state,
            ChildState::Killing { revoked: true }
        );
        session.paso(Event::Stop(Reason::Stopped), at);
        assert!(
            session
                .paso(Event::Exited { child: 0, success }, at)
                .is_empty()
        );
        assert_eq!(session.children[0].state, ChildState::Reaped);
        assert_eq!(session.phase, Phase::Finished(Reason::Stopped));
        assert!(pulse(&mut session, at + grace, true, true).is_empty());
    }
}

#[test]
fn connected_hub_close_keeps_session_and_second_open_restarts_only_hub() {
    let now = Instant::now();
    let mut session = Session::new(
        [Policy::core(1), Policy::consumer(1)],
        Duration::from_secs(3),
        now,
    );
    assert_eq!(
        pulse(&mut session, now, false, false),
        vec![Action::Spawn(0), Action::Spawn(1)]
    );
    session.paso(Event::Started(0), now);
    session.paso(Event::Started(1), now);
    assert!(session.paso(Event::Detached(1), now).is_empty());
    assert!(!session.stopping());
    assert_eq!(session.children[0].state, ChildState::Alive(now));
    assert_eq!(session.children[1].state, ChildState::Reaped);
    assert_eq!(session.paso(Event::OpenHub(1), now), vec![Action::Spawn(1)]);
    assert_eq!(session.children[0].state, ChildState::Alive(now));
}
