#![allow(clippy::unwrap_used)]
use super::*;

fn request(session: &mut Session, request: &Request) -> HostToUi {
    let mut pipe = Pipe::new(Vec::new());
    session.request(&mut pipe, 9, request).unwrap();
    let mut reader = frame::Reader::default();
    let mut pipe = Pipe::new(pipe.into_inner());
    loop {
        if let Some(message) = reader.next(&mut pipe).unwrap() {
            return message;
        }
    }
}
#[test]
fn strategy_requires_verified_access_but_neither_live_nor_strategy_entitlement() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    let source = data.join("strategy-v2.json");
    std::fs::write(&source, b"{invalid").unwrap();
    let denied = HostToUi::Failure {
        id: 9,
        error: HostError::Denied,
    };
    assert_eq!(request(&mut session, &Request::StrategyOpen {}), denied);
    assert!(!data.join("strategy-v2.json.invalid").exists());
    session.current.access.verified = true;
    session.current.access.blocked = true;
    assert_eq!(request(&mut session, &Request::StrategyOpen {}), denied);
    session.current.access.blocked = false;
    session.current.live = true;
    session.current.account_generation = Some("a".repeat(64));
    assert!(matches!(request(&mut session, &Request::StrategyOpen {}),
        HostToUi::Response { result: Reply::StrategyOpen { value }, .. } if value.state == crate::strategy::StrategyState::Recovered));
    assert_eq!(session.core.requests, 0);
}

#[test]
fn a_late_selection_for_a_previous_account_cannot_write_or_reply_with_cached_data() {
    use vantare_strategy::document::{Document, new_event};
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    let path = data.join("strategy-v2.json");
    let mut doc = Document::empty("2026-11-18T00:00:00Z").unwrap();
    doc.append_event(&new_event("event-1", "Practice", 90, 90.0, 18.0))
        .unwrap();
    std::fs::write(&path, doc.bytes()).unwrap();
    session.current.access.verified = true;
    session.current.account_generation = Some("a".repeat(64));
    let HostToUi::Response {
        result: Reply::StrategyOpen { value },
        ..
    } = request(&mut session, &Request::StrategyOpen {})
    else {
        panic!("opened");
    };
    let late = Request::StrategySelect {
        event_id: "event-1".into(),
        strategy_id: "variant-1".into(),
        revision: value.revision,
    };
    session.current.account_generation = Some("b".repeat(64));
    assert_eq!(
        request(&mut session, &late),
        HostToUi::Failure {
            id: 9,
            error: HostError::Denied
        }
    );
    assert_eq!(std::fs::read(&path).unwrap(), doc.bytes());
    assert_eq!(
        request(&mut session, &Request::StrategyView {}),
        HostToUi::Failure {
            id: 9,
            error: HostError::Denied
        }
    );
    assert_eq!(session.core.requests, 0);
}

fn large_strategy_document(event_count: usize, variant_count: usize) -> Vec<u8> {
    use crate::strategy::{ID_LIMIT, TEXT_LIMIT};
    use vantare_strategy::document::new_event;

    let id = |index: usize| {
        let suffix = index.to_string();
        format!("{}{suffix}", "\"".repeat(ID_LIMIT - suffix.len()))
    };
    let name = "\"".repeat(TEXT_LIMIT);
    let events: Vec<_> = (0..event_count)
        .map(|index| {
            let mut event = new_event(&id(index), &name, 90, 90.0, 18.0);
            event["cls"]["value"] = name.clone().into();
            event["track"]["value"] = name.clone().into();
            let variants: Vec<_> = (0..variant_count)
                .map(|index| {
                    let mut variant = event["strategies"][0].clone();
                    variant["id"] = id(index).into();
                    variant["name"]["value"] = name.clone().into();
                    variant
                })
                .collect();
            event["strategies"] = variants.into();
            event["activeStrategyId"] = id(0).into();
            event
        })
        .collect();
    serde_json::to_vec(&serde_json::json!({
        "contractVersion": "strategy.v2",
        "schemaVersion": "2.1.0",
        "generatedAt": "2026-11-18T00:00:00Z",
        "events": events,
        "activeEventId": id(0),
    }))
    .unwrap()
}

#[test]
fn strategy_bounds_event_and_variant_projections_before_opening() {
    use crate::strategy::StrategyState;
    use vantare_strategy::document::Document;

    let fixture = Fixture::new();
    let mut session = fixture.session();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    let path = data.join("strategy-v2.json");
    session.current.access.verified = true;
    let maximum = large_strategy_document(32, 16);
    std::fs::write(&path, &maximum).unwrap();
    let response = request(&mut session, &Request::StrategyOpen {});
    assert!(serde_json::to_vec(&response).unwrap().len() < frame::LIMIT - 64 * 1024);
    assert!(matches!(
        response,
        HostToUi::Response { result: Reply::StrategyOpen { value }, .. }
            if value.state == StrategyState::Ready
                && value.events.len() == 32
                && value.events.iter().all(|event| {
                    use crate::strategy::{ID_LIMIT, TEXT_LIMIT};
                    event.id.len() == ID_LIMIT
                        && event.name.len() == TEXT_LIMIT
                        && event.class.len() == TEXT_LIMIT
                        && event.track.len() == TEXT_LIMIT
                        && event.strategies.len() == 16
                        && event.strategies.iter().all(|variant| {
                            variant.id.len() == ID_LIMIT && variant.name.len() == TEXT_LIMIT
                        })
                })
    ));

    for (events, variants) in [(33, 1), (1, 17)] {
        let oversized = large_strategy_document(events, variants);
        Document::parse(&oversized).unwrap();
        std::fs::write(&path, &oversized).unwrap();
        assert_eq!(
            request(&mut session, &Request::StrategyOpen {}),
            HostToUi::Failure {
                id: 9,
                error: HostError::Protected
            },
        );
        assert!(matches!(
            request(&mut session, &Request::StrategyView {}),
            HostToUi::Response { result: Reply::StrategyView { value }, .. }
                if value.state == StrategyState::Protected && value.events.is_empty()
        ));
        assert_eq!(std::fs::read(&path).unwrap(), oversized);
        assert!(!data.join("strategy-v2.json.invalid").exists());
    }
}

fn open_strategy(session: &mut Session) -> crate::strategy::StrategyView {
    session.current.access.verified = true;
    let HostToUi::Response {
        result: Reply::StrategyOpen { value },
        ..
    } = request(session, &Request::StrategyOpen {})
    else {
        panic!("open Strategy");
    };
    value
}

fn create_strategy(
    session: &mut Session,
    revision: &str,
    name: &str,
) -> crate::strategy::StrategyView {
    let HostToUi::Response {
        result: Reply::StrategyCreate { value },
        ..
    } = request(
        session,
        &Request::StrategyCreate {
            revision: revision.into(),
            fields: Box::new(crate::strategy::StrategyFields {
                name: name.into(),
                duration_minutes: "90".into(),
                fuel_capacity_liters: "82".into(),
                pit_transit_seconds: "25".into(),
                ..Default::default()
            }),
            base_pace_seconds: None,
            fuel_per_lap_liters: None,
        },
    )
    else {
        panic!("create Strategy draft");
    };
    assert!(value.dirty);
    value
}

#[test]
fn strategy_host_restart_loads_only_the_saved_document_as_clean() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let empty = open_strategy(&mut session);
    let first = create_strategy(&mut session, &empty.revision, "Saved");
    let HostToUi::Response {
        result: Reply::StrategySave { value: saved },
        ..
    } = request(
        &mut session,
        &Request::StrategySave {
            revision: first.revision,
        },
    )
    else {
        panic!("save first Strategy draft");
    };
    assert!(!saved.dirty);
    assert_eq!(saved.events.len(), 1);
    assert_eq!(saved.events[0].name, "Saved");

    let temporary = create_strategy(&mut session, &saved.revision, "Unsaved");
    assert_eq!(temporary.events.len(), 2);
    assert_eq!(temporary.events[1].name, "Unsaved");
    drop(session);

    let reopened = open_strategy(&mut fixture.session());
    assert_eq!(reopened, saved);
    assert!(!reopened.dirty);
}

#[test]
fn strategy_save_creates_the_primary_only_under_the_host_data_dir() {
    use serde_json::json;

    let fixture = Fixture::new();
    let mut session = fixture.session();
    let empty = open_strategy(&mut session);
    let draft = create_strategy(&mut session, &empty.revision, "Saved");
    let data_dir = fixture.0.join("hub");
    let primary = data_dir.join("strategy-v2.json");
    let outside = fixture.0.join("strategy-v2.json");
    assert!(!primary.exists());

    let save = json!({
        "kind": "request",
        "id": 9,
        "request": { "method": "strategy.save", "revision": draft.revision },
    });
    for field in ["path", "dataDir", "destination"] {
        let mut invalid = save.clone();
        invalid["request"][field] = json!(outside.to_string_lossy());
        assert!(
            serde_json::from_value::<UiToHost>(invalid).is_err(),
            "{field}"
        );
    }
    assert!(!primary.exists());
    assert!(!outside.exists());

    let UiToHost::Request { request: save, .. } = serde_json::from_value(save).unwrap() else {
        panic!("save request decoded");
    };
    assert!(matches!(
        request(&mut session, &save),
        HostToUi::Response { result: Reply::StrategySave { value }, .. } if !value.dirty
    ));
    let written = std::fs::read(&primary).unwrap();
    let doc = vantare_strategy::document::Document::parse(&written).unwrap();
    assert_eq!(doc.value()["events"][0]["name"]["value"], "Saved");
    assert!(!outside.exists());
}

#[test]
fn switching_account_generation_clears_a_dirty_strategy_at_dispatch() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.account_generation = Some("a".repeat(64));
    let empty = open_strategy(&mut session);
    let draft = create_strategy(&mut session, &empty.revision, "Account A only");

    session.current.account_generation = Some("b".repeat(64));
    let denied = HostToUi::Failure {
        id: 9,
        error: HostError::Denied,
    };
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
    assert_eq!(
        request(
            &mut session,
            &Request::StrategySave {
                revision: draft.revision
            }
        ),
        denied
    );
    assert_eq!(open_strategy(&mut session), empty);
    assert!(!fixture.0.join("hub/strategy-v2.json").exists());
}

#[test]
fn calculation_is_nonblocking_and_close_retires_its_result() {
    use crate::strategy::StrategyPlanState;
    use std::sync::{atomic::Ordering, mpsc};
    use vantare_strategy::document::Document;

    let fixture = Fixture::new();
    let mut session = fixture.session();
    let empty = open_strategy(&mut session);
    let draft = create_strategy(&mut session, &empty.revision, "Original");
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    let (cancelled, observed) = mpsc::sync_channel(1);
    session.strategy.test_start_calculation(move |cancel| {
        ready.send(()).unwrap();
        wait.recv().unwrap();
        cancelled.send(cancel.load(Ordering::Relaxed)).unwrap();
        Document::empty("2026-11-18T00:00:00Z").unwrap()
    });
    started.recv().unwrap();
    assert!(matches!(
        request(&mut session, &Request::StrategyView {}),
        HostToUi::Response { result: Reply::StrategyView { value }, .. }
            if value.plan.state == StrategyPlanState::Calculating && value.events == draft.events
    ));

    let mut pipe = Pipe::new(Vec::new());
    session
        .request_close_at(&mut pipe, CloseReason::ControlEof, Instant::now())
        .unwrap();
    release.send(()).unwrap();
    assert!(observed.recv().unwrap());
    session.strategy.test_join_calculation();
    assert!(matches!(
        request(&mut session, &Request::StrategyView {}),
        HostToUi::Failure {
            error: HostError::Denied,
            ..
        }
    ));
    assert!(!fixture.0.join("hub/strategy-v2.json").exists());
}

#[test]
fn invalid_compute_input_does_not_modify_the_draft_or_disk() {
    use crate::strategy::StrategyPlanError;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let empty = open_strategy(&mut session);
    let draft = create_strategy(&mut session, &empty.revision, "Original");
    let request_json = serde_json::json!({
        "kind": "request",
        "id": 9,
        "request": {
            "method": "strategy.compute",
            "revision": draft.revision,
            "eventId": draft.active_event_id,
            "strategyId": draft.active_strategy_id,
            "form": {
                "fields": {
                    "name": "Changed", "durationMinutes": "90", "fuelCapacityLiters": "82",
                    "pitTransitSeconds": "25", "track": "", "class": "", "variantName": "Base",
                    "variantNote": "", "variantMode": "dry", "startAt": "", "team": "",
                    "driverName": "Pilot", "driverInitials": "PI"
                },
                "inputs": {
                    "basePaceSeconds": "0", "fuelPerLapLiters": "1.83", "raceLaps": "3",
                    "veCapacityPercent": "", "vePerLapPercent": "", "tyreLifeLaps": "",
                    "degradationSeconds": "", "refuelRate": "", "veRate": "",
                    "tyreServiceSeconds": "", "formationSeconds": "", "fuelStep": "",
                    "veStep": "", "reserveLaps": "", "serviceMode": "parallel"
                }
            }
        }
    });
    let UiToHost::Request {
        request: compute, ..
    } = serde_json::from_value(request_json).unwrap()
    else {
        panic!("compute request decoded");
    };
    assert!(matches!(
        request(&mut session, &compute),
        HostToUi::Response {
            result: Reply::StrategyCompute { .. },
            ..
        }
    ));
    session.strategy.test_join_calculation();
    assert!(matches!(
        request(&mut session, &Request::StrategyView {}),
        HostToUi::Response { result: Reply::StrategyView { value }, .. }
            if value.plan.error == Some(StrategyPlanError::InvalidInput)
                && value.revision == draft.revision && value.events == draft.events
    ));
    assert!(!fixture.0.join("hub/strategy-v2.json").exists());
}

#[test]
fn bounded_strategy_timeline_and_edit_fit_even_with_a_full_document_view() {
    use crate::strategy::{
        STRATEGY_PIT_LIMIT, StrategyCalculationView, StrategyCertificate, StrategyMetrics,
        StrategyPit, StrategyPitService, StrategyPlanState, StrategyPlanView, StrategyServiceSteps,
        StrategyStint, StrategyTimeline, TEXT_LIMIT,
    };
    use serde_json::Number;

    let fixture = Fixture::new();
    let data = fixture.0.join("hub");
    std::fs::create_dir_all(&data).unwrap();
    std::fs::write(
        data.join("strategy-v2.json"),
        large_strategy_document(32, 16),
    )
    .unwrap();
    let mut value = open_strategy(&mut fixture.session());
    let amount = Number::from_f64(f64::MAX).unwrap();
    value.plan = StrategyPlanView {
        state: StrategyPlanState::Calculated,
        compute_id: Some(u32::MAX),
        result: Some(Box::new(StrategyCalculationView {
            certificate: Some(StrategyCertificate::Proven),
            steps: StrategyServiceSteps {
                fuel_liters: Some(amount.clone()),
                ve_percent: Some(amount.clone()),
            },
            degraded: true,
            metrics: Some(StrategyMetrics {
                total_seconds: amount.clone(),
                laps: u32::MAX,
                pit_count: u32::try_from(STRATEGY_PIT_LIMIT).unwrap(),
                fuel_reserve_real_laps: Some(amount.clone()),
                fuel_reserve_required_laps: amount.clone(),
            }),
            timeline: Some(StrategyTimeline {
                pilot: "\"".repeat(TEXT_LIMIT),
                base_pace_seconds: amount.clone(),
                fuel_start_liters: amount.clone(),
                fuel_finish_liters: amount.clone(),
                ve_start_percent: amount.clone(),
                ve_finish_percent: amount.clone(),
                stints: vec![
                    StrategyStint {
                        from_lap: u32::MAX,
                        to_lap: u32::MAX
                    };
                    STRATEGY_PIT_LIMIT + 1
                ],
                pits: vec![
                    StrategyPit {
                        lap: u32::MAX,
                        fuel_liters: amount.clone(),
                        ve_percent: amount,
                        change_tyres: true,
                        service: StrategyPitService::Sequential,
                    };
                    STRATEGY_PIT_LIMIT
                ],
            }),
        })),
        error: None,
        error_field: None,
        edit: Some(crate::strategy::StrategyEditView {
            stints: vec![
                StrategyStint {
                    from_lap: u32::MAX,
                    to_lap: u32::MAX
                };
                STRATEGY_PIT_LIMIT + 1
            ],
            stops: vec![
                crate::strategy::StrategyEditStop {
                    lap: u32::MAX,
                    min_lap: u32::MAX,
                    max_lap: u32::MAX,
                    fuel_liters: Number::from_f64(f64::MAX).unwrap(),
                    ve_percent: Number::from_f64(f64::MAX).unwrap(),
                };
                STRATEGY_PIT_LIMIT
            ],
            can_reset: true,
            error: Some(StrategyEditError::ScheduleNotPreserved),
        }),
    };
    let mut pipe = Pipe::new(Vec::new());
    let message = HostToUi::Response {
        id: 9,
        result: Reply::StrategyView { value },
    };
    frame::write(&mut pipe, &message).unwrap();
    assert!(pipe.into_inner().len() <= frame::LIMIT);
}

fn confirm_fields(name: &str) -> crate::strategy::StrategyFields {
    crate::strategy::StrategyFields {
        name: name.into(),
        duration_minutes: "90".into(),
        fuel_capacity_liters: "82".into(),
        pit_transit_seconds: "25".into(),
        track: "Fuji".into(),
        class: "GT3".into(),
        variant_name: "Base".into(),
        variant_mode: "dry".into(),
        ..Default::default()
    }
}

/// A short, fuel-only race: the solver proves it within milliseconds.
fn solver_fields() -> crate::strategy::StrategySolverFields {
    crate::strategy::StrategySolverFields {
        base_pace_seconds: "90.5".into(),
        fuel_per_lap_liters: "1.83".into(),
        race_laps: "10".into(),
        ve_capacity_percent: "0".into(),
        ve_per_lap_percent: "0".into(),
        tyre_life_laps: "30".into(),
        degradation_seconds: "0".into(),
        refuel_rate: "4".into(),
        ve_rate: "2.5".into(),
        tyre_service_seconds: "30".into(),
        formation_seconds: "0".into(),
        fuel_step: "1".into(),
        ve_step: "1".into(),
        reserve_laps: "0".into(),
        service_mode: "parallel".into(),
    }
}

fn compute_with(
    draft: &crate::strategy::StrategyView,
    inputs: crate::strategy::StrategySolverFields,
) -> Request {
    Request::StrategyCompute {
        event_id: draft.active_event_id.clone().unwrap(),
        strategy_id: draft.active_strategy_id.clone().unwrap(),
        revision: draft.revision.clone(),
        form: Box::new(crate::strategy::StrategyComputeForm {
            fields: confirm_fields("Original"),
            inputs,
        }),
    }
}

fn saved_strategy(session: &mut Session) -> crate::strategy::StrategyView {
    let empty = open_strategy(session);
    let draft = create_strategy(session, &empty.revision, "Original");
    let HostToUi::Response {
        result: Reply::StrategySave { value },
        ..
    } = request(
        session,
        &Request::StrategySave {
            revision: draft.revision,
        },
    )
    else {
        panic!("save Strategy draft");
    };
    assert!(!value.dirty);
    value
}

fn view_strategy(session: &mut Session) -> crate::strategy::StrategyView {
    let HostToUi::Response {
        result: Reply::StrategyView { value },
        ..
    } = request(session, &Request::StrategyView {})
    else {
        panic!("view Strategy");
    };
    value
}

fn compute_strategy(
    session: &mut Session,
    saved: &crate::strategy::StrategyView,
) -> crate::strategy::StrategyView {
    let HostToUi::Response {
        result: Reply::StrategyCompute { value },
        ..
    } = request(session, &compute_with(saved, solver_fields()))
    else {
        panic!("compute Strategy");
    };
    value
}

fn cancel(session: &mut Session, compute_id: u32) -> crate::strategy::StrategyView {
    let HostToUi::Response {
        result: Reply::StrategyCancel { value },
        ..
    } = request(session, &Request::StrategyCancel { compute_id })
    else {
        panic!("cancel Strategy calculation");
    };
    value
}

/// A worker that blocks until released; the receiver reports its cancel flag.
struct Held {
    release: std::sync::mpsc::SyncSender<()>,
    observed: std::sync::mpsc::Receiver<bool>,
}

fn hold(session: &mut Session) -> Held {
    use std::sync::{atomic::Ordering, mpsc};
    use vantare_strategy::document::Document;
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    let (cancelled, observed) = mpsc::sync_channel(1);
    session.strategy.test_start_calculation(move |cancel| {
        ready.send(()).unwrap();
        wait.recv().unwrap();
        cancelled.send(cancel.load(Ordering::Relaxed)).unwrap();
        Document::empty("2026-11-18T00:00:00Z").unwrap()
    });
    started.recv().unwrap();
    Held { release, observed }
}

#[test]
fn a_real_calculation_returns_its_id_applies_its_draft_and_only_save_writes_the_file() {
    use crate::strategy::StrategyPlanState;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let saved = saved_strategy(&mut session);
    let path = fixture.0.join("hub/strategy-v2.json");
    let before = std::fs::read(&path).unwrap();

    let started = compute_strategy(&mut session, &saved);
    assert_eq!(started.plan.state, StrategyPlanState::Calculating);
    let id = started
        .plan
        .compute_id
        .expect("the compute reply carries the id");
    assert!(!started.dirty);
    session.strategy.test_join_calculation();
    assert_eq!(
        std::fs::read(&path).unwrap(),
        before,
        "compute never writes"
    );

    let calculated = view_strategy(&mut session);
    assert_eq!(calculated.plan.state, StrategyPlanState::Calculated);
    assert_eq!(calculated.plan.compute_id, Some(id));
    assert!(calculated.dirty);
    assert_ne!(calculated.revision, saved.revision);
    let result = calculated.plan.result.as_ref().unwrap();
    assert!(!result.degraded);
    assert_eq!(result.metrics.as_ref().unwrap().laps, 10);
    assert!(result.timeline.is_some());

    let HostToUi::Response {
        result: Reply::StrategySave { value },
        ..
    } = request(
        &mut session,
        &Request::StrategySave {
            revision: calculated.revision.clone(),
        },
    )
    else {
        panic!("save calculated draft");
    };
    assert!(!value.dirty);
    let written = std::fs::read(&path).unwrap();
    assert_ne!(written, before);
    assert!(
        String::from_utf8(written)
            .unwrap()
            .contains("nativeScalarInput")
    );
}

#[test]
fn compute_is_busy_while_a_calculation_runs_and_cancel_retires_it() {
    use crate::strategy::StrategyPlanState;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let saved = saved_strategy(&mut session);
    let held = hold(&mut session);
    let running = view_strategy(&mut session);
    let id = running.plan.compute_id.unwrap();
    assert_eq!(
        request(&mut session, &compute_with(&saved, solver_fields())),
        HostToUi::Failure {
            id: 9,
            error: HostError::Busy
        }
    );
    let cancelled = cancel(&mut session, id);
    assert_eq!(cancelled.plan.state, StrategyPlanState::Uncalculated);
    assert_eq!(cancelled.plan.compute_id, None);
    held.release.send(()).unwrap();
    assert!(held.observed.recv().unwrap());
    session.strategy.test_join_calculation();
    let after = view_strategy(&mut session);
    assert_eq!(after.revision, saved.revision, "late result is discarded");
    assert_eq!(after.plan.state, StrategyPlanState::Uncalculated);
}

#[test]
fn a_late_cancel_of_calculation_a_does_not_stop_the_newer_calculation_b() {
    use crate::strategy::StrategyPlanState;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let saved = saved_strategy(&mut session);
    let held = hold(&mut session);
    let a = view_strategy(&mut session).plan.compute_id.unwrap();
    assert_eq!(
        cancel(&mut session, a).plan.state,
        StrategyPlanState::Uncalculated
    );
    held.release.send(()).unwrap();
    assert!(held.observed.recv().unwrap());
    session.strategy.test_join_calculation();

    let b = compute_strategy(&mut session, &saved)
        .plan
        .compute_id
        .unwrap();
    assert_ne!(a, b, "every calculation has its own id");
    let late = cancel(&mut session, a);
    assert_eq!(late.plan.compute_id, Some(b));
    assert_ne!(late.plan.state, StrategyPlanState::Uncalculated);
    session.strategy.test_join_calculation();
    let done = view_strategy(&mut session);
    assert_eq!(done.plan.state, StrategyPlanState::Calculated);
    assert_eq!(done.plan.compute_id, Some(b));
    assert!(done.dirty, "B finished and its draft was applied");
    // Cancelling a finished calculation, or the reserved id 0, never changes it.
    assert_eq!(cancel(&mut session, b), done);
    assert_eq!(
        request(&mut session, &Request::StrategyCancel { compute_id: 0 }),
        HostToUi::Failure {
            id: 9,
            error: HostError::Rejected
        }
    );
}

#[test]
fn confirming_during_a_calculation_discards_its_late_document() {
    use crate::strategy::StrategyPlanState;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let saved = saved_strategy(&mut session);
    let held = hold(&mut session);
    let HostToUi::Response {
        result: Reply::StrategyConfirm { value: confirmed },
        ..
    } = request(
        &mut session,
        &Request::StrategyConfirm {
            event_id: saved.active_event_id.clone().unwrap(),
            strategy_id: saved.active_strategy_id.clone().unwrap(),
            revision: saved.revision.clone(),
            fields: Box::new(confirm_fields("Changed")),
        },
    )
    else {
        panic!("confirm during calculation");
    };
    assert!(confirmed.dirty);
    assert_ne!(confirmed.revision, saved.revision);
    held.release.send(()).unwrap();
    session.strategy.test_join_calculation();
    let after = view_strategy(&mut session);
    assert_eq!(after.revision, confirmed.revision);
    assert_eq!(after.events, confirmed.events);
    assert_ne!(after.plan.state, StrategyPlanState::Calculated);
}

#[test]
fn a_licence_refresh_on_the_same_account_keeps_the_dirty_draft_and_the_calculation() {
    use crate::strategy::StrategyPlanState;
    let fixture = Fixture::new();
    let mut session = fixture.session();
    session.current.account_generation = Some("a".repeat(64));
    let saved = saved_strategy(&mut session);
    let draft = {
        let HostToUi::Response {
            result: Reply::StrategyConfirm { value },
            ..
        } = request(
            &mut session,
            &Request::StrategyConfirm {
                event_id: saved.active_event_id.clone().unwrap(),
                strategy_id: saved.active_strategy_id.clone().unwrap(),
                revision: saved.revision.clone(),
                fields: Box::new(confirm_fields("Dirty")),
            },
        )
        else {
            panic!("dirty draft");
        };
        assert!(value.dirty);
        value
    };
    let held = hold(&mut session);
    let running = view_strategy(&mut session);
    let id = running.plan.compute_id.unwrap();

    // The refresh re-reads access and identity: each intermediate value denies
    // requests but must not throw the work away.
    let denied = HostToUi::Failure {
        id: 9,
        error: HostError::Denied,
    };
    session.current.access.blocked = true;
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
    session.current.access.blocked = false;
    session.current.account_generation = None;
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
    session.current.access.verified = false;
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
    session.current.access.verified = true;
    session.current.account_generation = Some("a".repeat(64));

    let back = view_strategy(&mut session);
    assert_eq!(back.revision, draft.revision);
    assert!(back.dirty);
    assert_eq!(back.plan.state, StrategyPlanState::Calculating);
    assert_eq!(back.plan.compute_id, Some(id));
    held.release.send(()).unwrap();
    assert!(
        !held.observed.recv().unwrap(),
        "the calculation was never cancelled"
    );

    // A different account does discard both.
    session.current.account_generation = Some("b".repeat(64));
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
    session.current.account_generation = Some("a".repeat(64));
    assert_eq!(request(&mut session, &Request::StrategyView {}), denied);
}

#[test]
fn invalid_input_names_its_field_only_when_one_field_is_to_blame() {
    use crate::strategy::{StrategyField, StrategyPlanError, StrategyPlanState};
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let saved = saved_strategy(&mut session);
    let mut bad_number = solver_fields();
    bad_number.race_laps = "diez".into();
    let mut semantic = solver_fields();
    semantic.base_pace_seconds = "0".into();
    for (inputs, field) in [
        (bad_number, Some(StrategyField::RaceLaps)),
        (semantic, None),
    ] {
        assert!(matches!(
            request(&mut session, &compute_with(&saved, inputs)),
            HostToUi::Response {
                result: Reply::StrategyCompute { .. },
                ..
            }
        ));
        session.strategy.test_join_calculation();
        let view = view_strategy(&mut session);
        assert_eq!(view.plan.state, StrategyPlanState::Error);
        assert_eq!(view.plan.error, Some(StrategyPlanError::InvalidInput));
        assert_eq!(view.plan.error_field, field);
        assert!(view.plan.compute_id.is_some());
        assert_eq!(view.revision, saved.revision);
    }
}

// ---- Plan editing (E3) ----

use crate::strategy::{StrategyEditError, StrategyPlanState, StrategyView};

/// A race with a six-lap tank, so that its plan has several stops within milliseconds.
fn edit_compute(draft: &StrategyView) -> Request {
    let mut request = compute_with(
        draft,
        crate::strategy::StrategySolverFields {
            race_laps: "22".into(),
            ..solver_fields()
        },
    );
    if let Request::StrategyCompute { form, .. } = &mut request {
        form.fields.fuel_capacity_liters = "12".into();
    }
    request
}

fn compute_ok(session: &mut Session, view: &StrategyView) -> StrategyView {
    let HostToUi::Response {
        result: Reply::StrategyCompute { value },
        ..
    } = request(session, &edit_compute(view))
    else {
        panic!("compute Strategy");
    };
    value
}

/// A clean, saved strategy whose calculation (22 laps) is the current plan.
fn planned_strategy(session: &mut Session) -> StrategyView {
    let saved = saved_strategy(session);
    compute_ok(session, &saved);
    session.strategy.test_join_calculation();
    let calculated = view_strategy(session);
    assert_eq!(calculated.plan.state, StrategyPlanState::Calculated);
    let HostToUi::Response {
        result: Reply::StrategySave { value },
        ..
    } = request(
        session,
        &Request::StrategySave {
            revision: calculated.revision,
        },
    )
    else {
        panic!("save the calculated draft");
    };
    assert!(!value.dirty);
    assert!(value.plan.edit.is_some(), "the plan is editable");
    value
}

fn boundary(view: &StrategyView, index: u32, lap: u32) -> Request {
    Request::StrategyMoveBoundary {
        revision: view.revision.clone(),
        compute_id: view.plan.compute_id.unwrap(),
        index,
        lap,
    }
}

fn stop(view: &StrategyView, index: u32, delta: i8) -> Request {
    Request::StrategyMoveStop {
        revision: view.revision.clone(),
        compute_id: view.plan.compute_id.unwrap(),
        index,
        delta,
    }
}

fn recalculate(view: &StrategyView) -> Request {
    Request::StrategyRecalculate {
        revision: view.revision.clone(),
        compute_id: view.plan.compute_id.unwrap(),
    }
}

fn reset_edit(view: &StrategyView) -> Request {
    Request::StrategyResetEdit {
        revision: view.revision.clone(),
        compute_id: view.plan.compute_id.unwrap(),
    }
}

fn edited(session: &mut Session, sent: &Request) -> StrategyView {
    match request(session, sent) {
        HostToUi::Response {
            result:
                Reply::StrategyMoveBoundary { value }
                | Reply::StrategyMoveStop { value }
                | Reply::StrategyRecalculate { value }
                | Reply::StrategyResetEdit { value },
            ..
        } => value,
        other => panic!("edit reply: {other:?}"),
    }
}

fn failure(session: &mut Session, sent: &Request) -> HostError {
    match request(session, sent) {
        HostToUi::Failure { error, .. } => error,
        other => panic!("expected a failure: {other:?}"),
    }
}

fn stop_laps(view: &StrategyView) -> Vec<u32> {
    view.plan
        .edit
        .as_ref()
        .unwrap()
        .stops
        .iter()
        .map(|stop| stop.lap)
        .collect()
}

/// The plan with stop 1 moved one lap (later if it can, else earlier).
fn moved_plan(session: &mut Session) -> (StrategyView, StrategyView) {
    let view = planned_strategy(session);
    let mut moved = edited(session, &stop(&view, 1, 1));
    if moved.plan.state != StrategyPlanState::Edited {
        moved = edited(session, &stop(&moved, 1, -1));
    }
    assert_eq!(moved.plan.state, StrategyPlanState::Edited);
    (view, moved)
}

/// A boundary move after which every stint still fits the six laps of a tank.
fn a_move_the_tank_allows(view: &StrategyView) -> (u32, u32) {
    let stops = stop_laps(view);
    for (index, &lap) in stops.iter().enumerate() {
        for target in [lap.wrapping_sub(1), lap + 1] {
            let mut bounds = vec![0];
            bounds.extend(&stops);
            bounds.push(22);
            bounds[index + 1] = target;
            if bounds
                .windows(2)
                .all(|pair| (1..=6).contains(&pair[1].wrapping_sub(pair[0])))
            {
                return (u32::try_from(index).unwrap(), target);
            }
        }
    }
    panic!("no move keeps the plan feasible: {stops:?}");
}

/// A recalculation that blocks until released, then fails with a recognisable error.
fn hold_recalculation(session: &mut Session) -> Held {
    use std::sync::{atomic::Ordering, mpsc};
    let (ready, started) = mpsc::sync_channel(1);
    let (release, wait) = mpsc::sync_channel(1);
    let (cancelled, observed) = mpsc::sync_channel(1);
    session.strategy.test_start_recalculation(move |cancel| {
        ready.send(()).unwrap();
        wait.recv().unwrap();
        cancelled.send(cancel.load(Ordering::Relaxed)).unwrap();
        Err(StrategyEditError::EventRulesConflict)
    });
    started.recv().unwrap();
    Held { release, observed }
}

#[test]
fn a_feasible_plan_exposes_its_editable_schedule_with_the_solvers_amounts() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let view = planned_strategy(&mut session);
    let timeline = view
        .plan
        .result
        .as_ref()
        .unwrap()
        .timeline
        .as_ref()
        .unwrap();
    let edit = view.plan.edit.as_ref().unwrap();
    assert_eq!(edit.stints, timeline.stints);
    assert_eq!(edit.stops.len(), timeline.pits.len());
    assert!(edit.stops.len() >= 2);
    for (stop, pit) in edit.stops.iter().zip(&timeline.pits) {
        assert_eq!(stop.lap, pit.lap);
        assert_eq!(stop.fuel_liters, pit.fuel_liters);
        assert_eq!(stop.ve_percent, pit.ve_percent);
        assert!((stop.min_lap..=stop.max_lap).contains(&stop.lap));
    }
    assert!(!edit.can_reset);
    assert_eq!(edit.error, None);
    assert_eq!(view.plan.state, StrategyPlanState::Calculated);
}

#[test]
fn a_plan_that_is_not_feasible_or_not_calculated_has_no_edit() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let saved = saved_strategy(&mut session);
    assert_eq!(saved.plan.edit, None);
    let started = compute_ok(&mut session, &saved);
    assert_eq!(started.plan.edit, None, "while it calculates");
    session.strategy.test_join_calculation();
    let mut impossible = edit_compute(&view_strategy(&mut session));
    if let Request::StrategyCompute { form, .. } = &mut impossible {
        form.fields.fuel_capacity_liters = "1".into(); // less than one lap of fuel
    }
    let HostToUi::Response { .. } = request(&mut session, &impossible) else {
        panic!("compute impossible race");
    };
    session.strategy.test_join_calculation();
    assert_eq!(
        view_strategy(&mut session).plan.edit,
        None,
        "no plan, no edit"
    );
}

#[test]
fn moving_a_boundary_or_a_stop_edits_only_the_plan_in_memory() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let view = planned_strategy(&mut session);
    let path = fixture.0.join("hub/strategy-v2.json");
    let bytes = std::fs::read(&path).unwrap();
    let stop_1 = view.plan.edit.as_ref().unwrap().stops[1].clone();
    let lap = if stop_1.lap < stop_1.max_lap {
        stop_1.lap + 1
    } else {
        stop_1.lap - 1
    };

    let moved = edited(&mut session, &boundary(&view, 1, lap));
    assert_eq!(moved.plan.state, StrategyPlanState::Edited);
    assert_eq!(
        moved.plan.compute_id, view.plan.compute_id,
        "same plan, same id"
    );
    assert_eq!(
        moved.plan.result, view.plan.result,
        "the result is still the base plan"
    );
    assert_eq!(stop_laps(&moved)[1], lap);
    assert!(moved.plan.edit.as_ref().unwrap().can_reset);
    // Decision 6 of the design: the file is not "unsaved" because of a move.
    assert!(!moved.dirty);
    assert_eq!(moved.revision, view.revision);
    assert_eq!(std::fs::read(&path).unwrap(), bytes);

    let stopped = edited(&mut session, &stop(&moved, 0, -1));
    assert!(!stopped.dirty);
    assert_eq!(stopped.revision, view.revision);
    let HostToUi::Response {
        result: Reply::StrategySave { value: saved },
        ..
    } = request(
        &mut session,
        &Request::StrategySave {
            revision: stopped.revision.clone(),
        },
    )
    else {
        panic!("save with a pending edit");
    };
    assert_eq!(
        std::fs::read(&path).unwrap(),
        bytes,
        "the edit is not saved"
    );
    assert_eq!(
        saved.plan.state,
        StrategyPlanState::Edited,
        "it stays pending"
    );
}

#[test]
fn an_obsolete_compute_id_or_revision_is_a_conflict_with_the_current_view() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let view = planned_strategy(&mut session);
    let id = view.plan.compute_id.unwrap();
    let lap = view.plan.edit.as_ref().unwrap().stops[0].lap;
    for sent in [
        Request::StrategyMoveBoundary {
            revision: view.revision.clone(),
            compute_id: id + 1,
            index: 0,
            lap,
        },
        Request::StrategyMoveStop {
            revision: view.revision.clone(),
            compute_id: id + 1,
            index: 0,
            delta: 1,
        },
        Request::StrategyRecalculate {
            revision: view.revision.clone(),
            compute_id: id + 1,
        },
        Request::StrategyResetEdit {
            revision: view.revision.clone(),
            compute_id: id + 1,
        },
        Request::StrategyMoveStop {
            revision: "f".repeat(64),
            compute_id: id,
            index: 0,
            delta: 1,
        },
    ] {
        assert_eq!(
            failure(&mut session, &sent),
            HostError::StrategyConflict {
                current: Box::new(view.clone())
            },
            "{sent:?}"
        );
    }
    assert_eq!(view_strategy(&mut session), view, "nothing changed");
}

#[test]
fn moves_outside_the_range_or_with_a_bad_delta_are_rejected_and_change_nothing() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let view = planned_strategy(&mut session);
    let edit = view.plan.edit.as_ref().unwrap();
    let count = u32::try_from(edit.stops.len()).unwrap();
    let first = &edit.stops[0];
    for sent in [
        boundary(&view, 0, first.min_lap - 1),
        boundary(&view, 0, first.max_lap + 1),
        boundary(&view, 0, 0),
        boundary(&view, 0, 22),
        boundary(&view, count, 1),
        stop(&view, count, 1),
        stop(&view, 0, 0),
        stop(&view, 0, 2),
        stop(&view, 0, i8::MIN),
    ] {
        assert_eq!(
            failure(&mut session, &sent),
            HostError::Rejected,
            "{sent:?}"
        );
    }
    assert_eq!(view_strategy(&mut session), view);
}

#[test]
fn a_new_calculation_is_refused_while_the_edit_is_pending_and_accepted_after_reset() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (view, moved) = moved_plan(&mut session);
    assert_eq!(
        failure(&mut session, &edit_compute(&moved)),
        HostError::StrategyEditPending
    );
    assert_eq!(
        view_strategy(&mut session),
        moved,
        "the edit survives the refusal"
    );
    let reset = edited(&mut session, &reset_edit(&moved));
    assert_eq!(reset.plan, view.plan, "back to the calculated plan");
    let started = compute_ok(&mut session, &reset);
    assert_eq!(started.plan.state, StrategyPlanState::Calculating);
    assert_eq!(
        started.plan.edit, None,
        "an accepted calculation drops the edit"
    );
    session.strategy.test_join_calculation();
}

#[test]
fn recalculating_runs_in_the_worker_with_a_new_id_and_keeps_the_edited_schedule() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let view = planned_strategy(&mut session);
    let path = fixture.0.join("hub/strategy-v2.json");
    let bytes = std::fs::read(&path).unwrap();
    let (index, target) = a_move_the_tank_allows(&view);
    let moved = edited(&mut session, &boundary(&view, index, target));
    let wanted = moved.plan.edit.as_ref().unwrap().clone();

    let started = edited(&mut session, &recalculate(&moved));
    assert_eq!(started.plan.state, StrategyPlanState::Calculating);
    let id = started.plan.compute_id.unwrap();
    assert_ne!(
        Some(id),
        view.plan.compute_id,
        "a recalculation has its own id"
    );
    assert_eq!(
        started.plan.result, view.plan.result,
        "the base plan stays in view"
    );
    assert_eq!(started.plan.edit.as_ref().unwrap().stints, wanted.stints);
    assert_eq!(
        failure(&mut session, &recalculate(&started)),
        HostError::Busy
    );
    assert_eq!(
        failure(&mut session, &stop(&started, 0, 1)),
        HostError::Busy,
        "the schedule is frozen while it recalculates"
    );
    assert_eq!(
        failure(&mut session, &edit_compute(&started)),
        HostError::Busy
    );

    session.strategy.test_join_calculation();
    let done = view_strategy(&mut session);
    assert!(matches!(
        done.plan.state,
        StrategyPlanState::Calculated | StrategyPlanState::Partial
    ));
    assert_eq!(done.plan.compute_id, Some(id));
    let timeline = done
        .plan
        .result
        .as_ref()
        .unwrap()
        .timeline
        .as_ref()
        .unwrap();
    assert_eq!(
        timeline.stints, wanted.stints,
        "the schedule is kept exactly"
    );
    assert_eq!(
        timeline.pits.iter().map(|pit| pit.lap).collect::<Vec<_>>(),
        wanted.stops.iter().map(|stop| stop.lap).collect::<Vec<_>>()
    );
    let edit = done.plan.edit.as_ref().unwrap();
    assert_eq!(edit.stints, wanted.stints);
    assert_eq!(edit.error, None);
    assert!(!edit.can_reset, "the recalculated plan is the new base");
    // The recalculation never touches the document: the file is not "unsaved".
    assert!(!done.dirty);
    assert_eq!(done.revision, view.revision);
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    // The old id is stale now.
    assert!(matches!(
        failure(&mut session, &stop(&moved, 0, 1)),
        HostError::StrategyConflict { .. }
    ));
}

#[test]
fn cancelling_a_recalculation_keeps_the_edit_pending_and_discards_its_late_result() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (_, moved) = moved_plan(&mut session);
    let held = hold_recalculation(&mut session);
    let running = view_strategy(&mut session);
    assert_eq!(running.plan.state, StrategyPlanState::Calculating);
    let cancelled = cancel(&mut session, running.plan.compute_id.unwrap());
    assert_eq!(cancelled.plan.state, StrategyPlanState::Edited);
    assert_eq!(
        cancelled.plan.edit.as_ref().unwrap().stints,
        moved.plan.edit.as_ref().unwrap().stints
    );
    assert_eq!(cancelled.plan.result, moved.plan.result);
    held.release.send(()).unwrap();
    assert!(held.observed.recv().unwrap(), "the worker saw its own flag");
    session.strategy.test_join_calculation();
    let after = view_strategy(&mut session);
    assert_eq!(after, cancelled, "the late failure is discarded");
    // The schedule can be recalculated again.
    let again = edited(&mut session, &recalculate(&after));
    assert_eq!(again.plan.state, StrategyPlanState::Calculating);
    session.strategy.test_join_calculation();
}

#[test]
fn a_failed_recalculation_names_its_error_and_leaves_the_edit_pending() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (_, moved) = moved_plan(&mut session);
    let held = hold_recalculation(&mut session);
    held.release.send(()).unwrap();
    session.strategy.test_join_calculation();
    let failed = view_strategy(&mut session);
    assert_eq!(failed.plan.state, StrategyPlanState::Edited);
    let edit = failed.plan.edit.as_ref().unwrap();
    assert_eq!(edit.error, Some(StrategyEditError::EventRulesConflict));
    assert_eq!(edit.stints, moved.plan.edit.as_ref().unwrap().stints);
    assert_eq!(failed.plan.result, moved.plan.result);
    let again = edited(&mut session, &stop(&failed, 1, -1));
    assert_eq!(
        again.plan.edit.as_ref().unwrap().error,
        None,
        "a move clears it"
    );
}

#[test]
fn reset_returns_exactly_to_the_calculated_plan_and_does_not_touch_dirty() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (view, moved) = moved_plan(&mut session);
    assert!(!moved.dirty);
    assert_eq!(edited(&mut session, &reset_edit(&moved)), view);
}

#[test]
fn resetting_during_a_recalculation_cancels_it_and_discards_its_late_result() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (view, moved) = moved_plan(&mut session);
    let held = hold_recalculation(&mut session);
    let running = view_strategy(&mut session);
    let reset = edited(&mut session, &reset_edit(&running));
    assert_eq!(reset.plan.state, StrategyPlanState::Calculated);
    assert_eq!(reset.plan.result, view.plan.result);
    assert_eq!(stop_laps(&reset), stop_laps(&view));
    assert_ne!(stop_laps(&reset), stop_laps(&moved));
    held.release.send(()).unwrap();
    assert!(held.observed.recv().unwrap());
    session.strategy.test_join_calculation();
    assert_eq!(
        view_strategy(&mut session),
        reset,
        "the late result is discarded"
    );
}

#[test]
fn the_edit_is_dropped_when_the_data_the_account_or_the_document_change() {
    // Confirming different data invalidates the plan and with it the edit.
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (view, _) = moved_plan(&mut session);
    let HostToUi::Response {
        result: Reply::StrategyConfirm { value },
        ..
    } = request(
        &mut session,
        &Request::StrategyConfirm {
            event_id: view.active_event_id.clone().unwrap(),
            strategy_id: view.active_strategy_id.clone().unwrap(),
            revision: view.revision.clone(),
            fields: Box::new(confirm_fields("Changed")),
        },
    )
    else {
        panic!("confirm");
    };
    assert_eq!(value.plan.state, StrategyPlanState::PendingChanges);
    assert_eq!(value.plan.edit, None);

    // A different account.
    let fixture = Fixture::new();
    let mut session = fixture.session();
    moved_plan(&mut session);
    session.current.account_generation = Some("b".repeat(64));
    assert_eq!(
        failure(&mut session, &Request::StrategyView {}),
        HostError::Denied
    );
    let reopened = open_strategy(&mut session);
    assert_eq!(reopened.plan.edit, None);
    assert_eq!(reopened.plan.state, StrategyPlanState::Uncalculated);

    // Discard, then a calculation that is cancelled.
    let fixture = Fixture::new();
    let mut session = fixture.session();
    let (_, moved) = moved_plan(&mut session);
    let HostToUi::Response {
        result: Reply::StrategyDiscard { value },
        ..
    } = request(
        &mut session,
        &Request::StrategyDiscard {
            revision: moved.revision,
        },
    )
    else {
        panic!("discard");
    };
    assert_eq!(value.plan.edit, None);
    assert_eq!(value.plan.state, StrategyPlanState::Uncalculated);
    let started = compute_ok(&mut session, &value);
    let cancelled = cancel(&mut session, started.plan.compute_id.unwrap());
    assert_eq!(cancelled.plan.edit, None);
    session.strategy.test_join_calculation();
}

#[test]
fn retiring_the_session_with_a_recalculation_running_cancels_it_and_leaves_no_edit() {
    let fixture = Fixture::new();
    let mut session = fixture.session();
    moved_plan(&mut session);
    let held = hold_recalculation(&mut session);
    session.strategy.retire();
    held.release.send(()).unwrap();
    assert!(held.observed.recv().unwrap(), "closing cancels the worker");
    session.strategy.test_join_calculation();
    let after = session.strategy.view();
    assert_eq!(after.plan.edit, None);
    assert_eq!(after.plan.state, StrategyPlanState::Uncalculated);
}
