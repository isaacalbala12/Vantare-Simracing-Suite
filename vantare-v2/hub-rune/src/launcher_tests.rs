use crate::{launcher::Launcher, launcher_orders::Phase};
use vantare_hub_host::{
    launcher::editor::ProfileEditorView,
    launcher_resident::*,
    protocol::{CoreStatus, HostError, LinkState, Reply, Request, UiToHost},
};

fn fixture() -> (Launcher, CoreStatus) {
    let mut doc = crate::launcher::scene("launcher-base");
    for p in &mut doc.profiles {
        p.launchable = true;
    }
    for a in &mut doc.apps {
        a.available = true;
    }
    let mut resident = crate::launcher_orders::scene();
    resident.running = false;
    resident.decision = None;
    let e = resident.execution.as_mut().unwrap();
    e.events.clear();
    e.first_retained_seq = "1".into();
    e.active = None;
    e.question = None;
    e.checked_control = true;
    e.checked_answer = true;
    e.revision_checked_launch = true;
    e.results = ResidentResults::Unknown;
    let mut model = Launcher::default();
    model.value = Some(doc);
    model.orders.view = Some(resident);
    let core = CoreStatus {
        services: LinkState::Connected,
        account_generation: Some("c".repeat(64)),
        access: vantare_hub_host::protocol::AccessView {
            verified: true,
            ..Default::default()
        },
        ..Default::default()
    };
    (model, core)
}
fn request(messages: &[UiToHost]) -> (u32, Request) {
    messages
        .iter()
        .find_map(|m| {
            if let UiToHost::Request { id, request } = m {
                Some((*id, request.clone()))
            } else {
                None
            }
        })
        .unwrap()
}
fn post(m: &mut Launcher, core: &CoreStatus, r: Request) -> u32 {
    m.queue(r, core, false);
    request(&m.next(0.0, true, core, false)).0
}
fn profile() -> ProfileEditorView {
    let c: serde_json::Value = serde_json::from_str(include_str!(
        "../../hub-web/src/contract/generated/corpus/launcher.json"
    ))
    .unwrap();
    serde_json::from_value(
        c["host"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["result"]["method"] == "launcher.profile.get")
            .unwrap()["result"]["value"]
            .clone(),
    )
    .unwrap()
}
fn event(seq: u64, kind: ResidentEventKind) -> ResidentExecutionEvent {
    ResidentExecutionEvent {
        seq: seq.to_string(),
        kind,
    }
}
fn execution(m: &mut Launcher) -> &mut ResidentExecution {
    m.orders.view.as_mut().unwrap().execution.as_mut().unwrap()
}
fn rehearse(m: &Launcher, c: &CoreStatus) -> Request {
    m.orders
        .rehearse("creator", m.value.as_ref().unwrap(), c)
        .unwrap()
}

#[test]
fn queued_and_unrelated_events_are_not_receipts_or_completion() {
    let (mut m, c) = fixture();
    let r = rehearse(&m, &c);
    assert!(m.orders.begin(r, &c));
    m.orders.queued("a".repeat(32), 0.0);
    execution(&mut m).events = vec![
        event(1, ResidentEventKind::Started { run: "7".into() }),
        event(
            2,
            ResidentEventKind::Finished {
                run: "7".into(),
                outcome: ResidentOutcome::Completed,
            },
        ),
    ];
    m.orders.observe(1.0, &c, m.value.as_ref());
    assert!(matches!(
        m.orders.attempt.as_ref().unwrap().phase,
        Phase::Queued { .. }
    ));
    execution(&mut m).events.extend([
        event(
            3,
            ResidentEventKind::OrderReceived {
                request: "a".repeat(32),
                receipt: ResidentOrderReceipt::Accepted { run: "9".into() },
            },
        ),
        event(
            4,
            ResidentEventKind::Finished {
                run: "9".into(),
                outcome: ResidentOutcome::Cancelled {
                    reason: ResidentCancellation::User,
                },
            },
        ),
    ]);
    m.orders.observe(2.0, &c, m.value.as_ref());
    assert!(matches!(
        m.orders.attempt.as_ref().unwrap().phase,
        Phase::Finished(ResidentOutcome::Cancelled { .. })
    ));
}
#[test]
fn receipt_and_terminal_before_mailbox_ack_are_retained_until_correlated() {
    let (mut m, c) = fixture();
    let r = rehearse(&m, &c);
    m.orders.begin(r, &c);
    execution(&mut m).events = vec![
        event(
            1,
            ResidentEventKind::OrderReceived {
                request: "a".repeat(32),
                receipt: ResidentOrderReceipt::Accepted { run: "9".into() },
            },
        ),
        event(
            2,
            ResidentEventKind::Finished {
                run: "9".into(),
                outcome: ResidentOutcome::Completed,
            },
        ),
    ];
    m.orders.observe(1.0, &c, m.value.as_ref());
    assert_eq!(m.orders.attempt.as_ref().unwrap().phase, Phase::Sending);
    m.orders.queued("a".repeat(32), 1.0);
    m.orders.observe(1.1, &c, m.value.as_ref());
    assert_eq!(
        m.orders.attempt.as_ref().unwrap().phase,
        Phase::Finished(ResidentOutcome::Completed)
    );
}
#[test]
fn deadline_restart_ring_gap_and_invalid_cursor_are_unknown_without_resending() {
    for case in ["deadline", "restart", "gap", "cursor"] {
        let (mut m, c) = fixture();
        let r = rehearse(&m, &c);
        m.orders.begin(r, &c);
        m.orders.queued("a".repeat(32), 0.0);
        match case {
            "restart" => execution(&mut m).instance = "d".repeat(64),
            "gap" => execution(&mut m).first_retained_seq = "2".into(),
            "cursor" => execution(&mut m).first_retained_seq = "not-a-number".into(),
            _ => {}
        }
        m.orders.observe(
            if case == "deadline" { 5.0 } else { 1.0 },
            &c,
            m.value.as_ref(),
        );
        assert_eq!(
            m.orders.attempt.as_ref().unwrap().phase,
            Phase::Unknown,
            "{case}"
        );
        assert!(
            m.orders
                .rehearse("creator", m.value.as_ref().unwrap(), &c)
                .is_none()
        );
    }
}
#[test]
fn answer_and_cancel_capture_current_scope_and_never_offer_trust() {
    let (mut m, mut c) = fixture();
    let revision = m.value.as_ref().unwrap().revision.clone();
    let e = execution(&mut m);
    e.active = Some(Box::new(ResidentActiveRun {
        run: "1".into(),
        revision: revision.clone(),
        account_generation: "c".repeat(64),
    }));
    e.question = Some(Box::new(ResidentScopedQuestion {
        run: "1".into(),
        revision,
        account_generation: "c".repeat(64),
        decision: u64::MAX.to_string(),
    }));
    let v = m.orders.view.as_mut().unwrap();
    v.running = true;
    v.decision = Some(ResidentQuestion {
        id: u64::MAX.to_string(),
        kind: ResidentQuestionKind::Authorization,
        actions: vec![
            ResidentChoice {
                id: ResidentAction::Trust,
                label: "Confiar".into(),
            },
            ResidentChoice {
                id: ResidentAction::Cancel,
                label: "Cancelar".into(),
            },
        ],
    });
    assert!(m.orders.answer(ResidentAction::Trust, &c).is_none());
    let answer = m.orders.answer(ResidentAction::Cancel, &c).unwrap();
    let cancel = m.orders.cancel(&c).unwrap();
    execution(&mut m).active.as_mut().unwrap().run = "2".into();
    assert!(!m.orders.allowed(&cancel, m.value.as_ref().unwrap(), &c));
    execution(&mut m).question.as_mut().unwrap().decision = "1".into();
    assert!(!m.orders.allowed(&answer, m.value.as_ref().unwrap(), &c));
    c.account_generation = Some("d".repeat(64));
    assert!(m.orders.cancel(&c).is_none());
}
#[test]
fn retry_requires_matching_account_revision_and_retained_terminal_and_failed_selection() {
    let (mut m, c) = fixture();
    let revision = m.value.as_ref().unwrap().revision.clone();
    let outcome = ResidentOutcome::Failed {
        reason: ResidentFailure::StepFailed,
    };
    execution(&mut m).results = ResidentResults::Known {
        value: Box::new(ResidentRunResults {
            run: "1".into(),
            profile: "creator".into(),
            revision,
            account_generation: "c".repeat(64),
            mode: ResidentRunMode::Rehearsal,
            outcome: Some(outcome.clone()),
            retry_failed: true,
            steps: vec![ResidentStepResult {
                index: 0,
                state: ResidentStepState::Failed,
            }],
        }),
    };
    assert!(
        m.orders
            .retry(ResidentRetryScope::Failed, m.value.as_ref().unwrap(), &c)
            .is_none()
    );
    execution(&mut m).events = vec![event(
        1,
        ResidentEventKind::Finished {
            run: "1".into(),
            outcome,
        },
    )];
    let r = m
        .orders
        .retry(ResidentRetryScope::Failed, m.value.as_ref().unwrap(), &c)
        .unwrap();
    m.orders.begin(r, &c);
    m.orders.queued("a".repeat(32), 0.0);
    execution(&mut m).events.push(event(
        2,
        ResidentEventKind::OrderReceived {
            request: "a".repeat(32),
            receipt: ResidentOrderReceipt::Accepted { run: "1".into() },
        },
    ));
    m.orders.observe(1.0, &c, m.value.as_ref());
    assert_eq!(
        m.orders.attempt.as_ref().unwrap().phase,
        Phase::Unknown,
        "retry must identify a new run"
    );
}
#[test]
fn launcher_rechecks_revision_before_send_and_does_not_use_legacy_delete() {
    let (mut m, c) = fixture();
    let revision = m.value.as_ref().unwrap().revision.clone();
    assert!(!m.allowed(
        &Request::LauncherProfileDelete {
            id: "creator".into(),
            base_revision: revision.clone()
        },
        &c,
        false
    ));
    m.queue(
        Request::LauncherProfileFavorite {
            id: "creator".into(),
            favorite: false,
            base_revision: revision,
        },
        &c,
        false,
    );
    let mut changed = m.value.clone().unwrap();
    changed.revision = "d".repeat(64);
    m.event(changed);
    let messages = m.next(0.0, true, &c, false);
    assert!(
        !messages
            .iter()
            .any(|m| matches!(m, UiToHost::Request { .. }))
    );
    assert_eq!(m.problem, Some("launcher.changed"));
}
#[test]
fn picker_ack_is_not_result_and_account_change_returns_only_cancellation() {
    let (mut m, mut c) = fixture();
    let id = post(&mut m, &c, Request::LauncherAppPick { id: None });
    assert!(m.open_picker().is_none());
    assert!(m.accept(id, Reply::LauncherAppPick { value: None }, 0.0));
    assert!(m.busy());
    assert_eq!(m.open_picker(), Some(id));
    assert!(m.open_picker().is_none());
    c.account_generation = Some("d".repeat(64));
    assert!(matches!(
        m.picked(id, Some("C:/synthetic.exe".into()), &c),
        Some(UiToHost::PickedExecutable(
            vantare_hub_host::launcher::apps::ExecutableSelection { path: None, .. }
        ))
    ));
    assert!(m.accept(id, Reply::LauncherAppPick { value: None }, 1.0));
    assert!(!m.busy());
    assert!(!m.accept(id, Reply::LauncherAppPick { value: None }, 2.0));
}
#[test]
fn profile_steps_keep_native_keys_and_custom_argument_loss_needs_confirmation() {
    let (mut m, c) = fixture();
    let mut value = profile();
    value.draft.steps[0].has_custom_arguments = true;
    let id = post(
        &mut m,
        &c,
        Request::LauncherProfileGet {
            id: Some("creator".into()),
        },
    );
    assert!(m.accept(id, Reply::LauncherProfileGet { value }, 0.0));
    let e = m.profile.as_mut().unwrap();
    let key = e.source.draft.steps[0].key.clone();
    e.source.draft.steps.swap(0, 1);
    assert_eq!(e.source.draft.steps[1].key, key);
    e.source.draft.steps.remove(1);
    assert!(e.loses_arguments());
    let r = Request::LauncherProfileSave {
        draft: m.fields.draft(&m.profile.as_ref().unwrap().source.draft),
        base_revision: m.profile.as_ref().unwrap().source.revision.clone(),
    };
    assert!(!m.allowed(&r, &c, false));
    m.profile.as_mut().unwrap().confirm_arguments = true;
    assert!(m.allowed(&r, &c, false));
}
#[test]
fn ambiguous_document_write_rereads_without_replaying_and_keeps_the_draft() {
    let (mut m, c) = fixture();
    let id = post(
        &mut m,
        &c,
        Request::LauncherProfileGet {
            id: Some("creator".into()),
        },
    );
    m.accept(id, Reply::LauncherProfileGet { value: profile() }, 0.0);
    m.fields.name = rune::TextEdit::new("Cambio con acento");
    let e = m.profile.as_ref().unwrap();
    let r = Request::LauncherProfileSave {
        draft: m.fields.draft(&e.source.draft),
        base_revision: e.source.revision.clone(),
    };
    let id = post(&mut m, &c, r);
    assert!(m.fail(id, &HostError::Io));
    assert!(m.busy());
    assert!(m.profile.is_some());
    let (fresh, r) = request(&m.next(1.0, true, &c, false));
    assert!(matches!(r, Request::LauncherGet {}));
    assert!(!m.accept(
        id,
        Reply::LauncherGet {
            value: m.value.clone().unwrap()
        },
        1.0
    ));
    let mut changed = m.value.clone().unwrap();
    changed.revision = "d".repeat(64);
    m.accept(fresh, Reply::LauncherGet { value: changed }, 1.0);
    assert!(!m.busy());
    assert_eq!(m.fields.name.text, "Cambio con acento");
}
#[test]
fn launcher_tree_has_named_controls_in_both_themes_at_three_scales() {
    for dark in [false, true] {
        for scale in [1.0, 1.25, 1.5] {
            let (m, c) = fixture();
            let mut s = crate::init();
            s.section = "launcher".into();
            s.launcher = m;
            s.core = c;
            if s.dark != dark {
                crate::toggle(&mut s);
            }
            let mut rt =
                rune::Runtime::new(s, crate::view, (1440.0, 900.0), rune::Env::new(dark, scale));
            rt.frame(0.0);
            assert!(rt.find("launcher-launch").is_some());
            for e in rt.elements().into_iter().filter(|e| e.focusable) {
                assert!(e.label.is_some_and(|s| !s.is_empty()), "{}", e.path);
            }
        }
    }
}
#[test]
fn shared_launch_guard_blocks_home_while_launcher_is_queued() {
    let (m, c) = fixture();
    let mut s = crate::init();
    s.launcher = m;
    s.core = c;
    let r = rehearse(&s.launcher, &s.core);
    s.launcher.queue(r, &s.core, false);
    crate::queue_home_launch(&mut s, true);
    assert!(!s.home.launching());
    assert!(s.launcher.execution_busy());
    assert_eq!(
        s.home.launch_problem,
        Some(crate::home::LaunchProblem::ConditionsChanged)
    );
}
