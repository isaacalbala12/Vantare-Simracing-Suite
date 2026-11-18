use crate::protocol::bindings::{declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
use crate::strategy::{
    ID_LIMIT, STRATEGY_PIT_LIMIT, StrategyCalculationView, StrategyCertificate,
    StrategyComputeForm, StrategyEventSummary, StrategyField, StrategyFields, StrategyMetrics,
    StrategyPit, StrategyPitService, StrategyPlanError, StrategyPlanState, StrategyPlanView,
    StrategyServiceSteps, StrategySolverFields, StrategyState, StrategyStint, StrategyTimeline,
    StrategyVariant, StrategyView, TEXT_LIMIT, StrategyEditError, StrategyEditStop,
    StrategyEditView,
};
use serde_json::json;

pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<StrategyState>(&mut text);
    declare::<StrategyVariant>(&mut text);
    declare::<StrategyEventSummary>(&mut text);
    declare::<StrategyView>(&mut text);
    declare::<StrategyFields>(&mut text);
    declare::<StrategyComputeForm>(&mut text);
    declare::<StrategySolverFields>(&mut text);
    declare::<StrategyPlanView>(&mut text);
    declare::<StrategyPlanState>(&mut text);
    declare::<StrategyPlanError>(&mut text);
    declare::<StrategyField>(&mut text);
    declare::<StrategyCalculationView>(&mut text);
    declare::<StrategyCertificate>(&mut text);
    declare::<StrategyServiceSteps>(&mut text);
    declare::<StrategyMetrics>(&mut text);
    declare::<StrategyTimeline>(&mut text);
    declare::<StrategyStint>(&mut text);
    declare::<StrategyPit>(&mut text);
    declare::<StrategyPitService>(&mut text);
    declare::<StrategyEditView>(&mut text);
    declare::<StrategyEditStop>(&mut text);
    declare::<StrategyEditError>(&mut text);
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyLimits",
        json!({"id":ID_LIMIT,"text":TEXT_LIMIT,"pits":STRATEGY_PIT_LIMIT})
    );
    crate::protocol::bindings::constants!(&mut text, "strategyFields", StrategyField::ALL);
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyEditErrors",
        [
            StrategyEditError::InvalidSchedule,
            StrategyEditError::EventRulesConflict,
            StrategyEditError::ScheduleNotPreserved,
            StrategyEditError::Failed
        ]
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyStates",
        [
            StrategyState::Ready,
            StrategyState::Empty,
            StrategyState::Recovered,
            StrategyState::Protected,
            StrategyState::ImportedLegacy
        ]
    );
    text
}
fn ready_sample() -> StrategyView {
    StrategyView {
        revision: "a".repeat(64),
        state: StrategyState::Ready,
        events: vec![StrategyEventSummary {
            id: "event-1".into(),
            name: "Practice".into(),
            class: "GT3".into(),
            track: "Fuji".into(),
            drivers: 1,
            strategies: vec![
                StrategyVariant {
                    id: "variant-1".into(),
                    name: "Base".into(),
                },
                StrategyVariant {
                    id: "variant-2".into(),
                    name: "Alternative".into(),
                },
            ],
        }],
        active_event_id: Some("event-1".into()),
        active_strategy_id: Some("variant-1".into()),
        dirty: false,
        plan: StrategyPlanView::default(),
    }
}

#[allow(clippy::too_many_lines)] // One flat list of wire samples.
pub(crate) fn corpus() -> serde_json::Value {
    let ready = ready_sample();
    let mut empty = StrategyView {
        revision: vantare_services::content_hash(b""),
        state: StrategyState::Empty,
        events: vec![],
        active_event_id: None,
        active_strategy_id: None,
        dirty: false,
        plan: StrategyPlanView::default(),
    };
    let mut host = vec![sample_response(Reply::StrategyOpen {
        value: ready.clone(),
    })];
    for state in [
        StrategyState::Empty,
        StrategyState::Recovered,
        StrategyState::Protected,
        StrategyState::ImportedLegacy,
    ] {
        empty.state = state;
        host.push(sample_response(Reply::StrategyOpen {
            value: empty.clone(),
        }));
    }
    let dirty = StrategyView {
        revision: "b".repeat(64),
        dirty: true,
        ..ready.clone()
    };
    host.extend([
        sample_response(Reply::StrategyView {
            value: ready.clone(),
        }),
        sample_response(Reply::StrategySelect {
            value: ready.clone(),
        }),
        sample_response(Reply::StrategyCreate {
            value: dirty.clone(),
        }),
        sample_response(Reply::StrategyConfirm {
            value: dirty.clone(),
        }),
        sample_response(Reply::StrategySave {
            value: ready.clone(),
        }),
        sample_response(Reply::StrategyDiscard {
            value: ready.clone(),
        }),
    ]);
    host.extend(
        [
            HostError::StrategyConflict {
                current: Box::new(ready),
            },
            HostError::StrategyDirty,
            HostError::StrategyEditPending,
            HostError::StrategyImportFailed,
            HostError::StrategyInvalidText,
        ]
        .map(|error| HostToUi::Failure { id: 1, error }),
    );
    let fields = sample_fields();
    host.extend(calculation_samples(&dirty));
    host.extend(edit_samples(&dirty));
    let ui = [
        Request::StrategyOpen {},
        Request::StrategyView {},
        Request::StrategySelect {
            event_id: "event-1".into(),
            strategy_id: "variant-2".into(),
            revision: "a".repeat(64),
        },
        Request::StrategyCreate {
            revision: "a".repeat(64),
            fields: Box::new(fields.clone()),
            base_pace_seconds: Some("90.472".into()),
            fuel_per_lap_liters: Some("1.83".into()),
        },
        Request::StrategyConfirm {
            event_id: "event-1".into(),
            strategy_id: "variant-1".into(),
            revision: "b".repeat(64),
            fields: Box::new(fields.clone()),
        },
        Request::StrategyCompute {
            event_id: "event-1".into(),
            strategy_id: "variant-1".into(),
            revision: "a".repeat(64),
            form: Box::new(StrategyComputeForm {
                fields,
                inputs: solver_sample(),
            }),
        },
        Request::StrategyCancel { compute_id: 7 },
        Request::StrategyMoveBoundary {
            revision: "b".repeat(64),
            compute_id: 7,
            index: 1,
            lap: 3,
        },
        Request::StrategyMoveStop {
            revision: "b".repeat(64),
            compute_id: 7,
            index: 0,
            delta: -1,
        },
        Request::StrategyRecalculate {
            revision: "b".repeat(64),
            compute_id: 7,
        },
        Request::StrategyResetEdit {
            revision: "b".repeat(64),
            compute_id: 7,
        },
        Request::StrategySave {
            revision: "b".repeat(64),
        },
        Request::StrategyDiscard {
            revision: "b".repeat(64),
        },
    ]
    .map(|request| UiToHost::Request { id: 1, request });
    json!({"host":host,"ui":ui})
}

fn sample_fields() -> StrategyFields {
    StrategyFields {
        name: "Practice".into(),
        duration_minutes: "90".into(),
        fuel_capacity_liters: "82".into(),
        pit_transit_seconds: "25".into(),
        track: "Fuji".into(),
        class: "GT3".into(),
        variant_name: "Base".into(),
        variant_mode: "dry".into(),
        driver_name: "Pilot".into(),
        driver_initials: "PI".into(),
        ..StrategyFields::default()
    }
}

fn solver_sample() -> StrategySolverFields {
    StrategySolverFields {
        base_pace_seconds: "90.472".into(),
        fuel_per_lap_liters: "1.83".into(),
        race_laps: "3".into(),
        ve_capacity_percent: "100".into(),
        ve_per_lap_percent: "5".into(),
        tyre_life_laps: "30".into(),
        degradation_seconds: "0".into(),
        refuel_rate: "1".into(),
        ve_rate: "1".into(),
        tyre_service_seconds: "10".into(),
        formation_seconds: "0".into(),
        fuel_step: "1".into(),
        ve_step: "1".into(),
        reserve_laps: "1".into(),
        service_mode: "parallel".into(),
    }
}

#[allow(clippy::too_many_lines)] // One flat list of wire samples.
fn calculation_samples(dirty: &StrategyView) -> [HostToUi; 7] {
    let completed = StrategyCalculationView {
        certificate: Some(StrategyCertificate::Proven),
        steps: StrategyServiceSteps {
            fuel_liters: Some(1.into()),
            ve_percent: Some(1.into()),
        },
        degraded: false,
        metrics: Some(StrategyMetrics {
            total_seconds: 301.into(),
            laps: 3,
            pit_count: 1,
            fuel_reserve_real_laps: Some(10.into()),
            fuel_reserve_required_laps: 1.into(),
        }),
        timeline: Some(StrategyTimeline {
            pilot: "Pilot".into(),
            base_pace_seconds: 90.into(),
            fuel_start_liters: 30.into(),
            fuel_finish_liters: 24.into(),
            ve_start_percent: 100.into(),
            ve_finish_percent: 85.into(),
            stints: vec![
                StrategyStint {
                    from_lap: 1,
                    to_lap: 2,
                },
                StrategyStint {
                    from_lap: 3,
                    to_lap: 3,
                },
            ],
            pits: vec![StrategyPit {
                lap: 2,
                fuel_liters: 3.into(),
                ve_percent: 5.into(),
                change_tyres: true,
                service: StrategyPitService::Parallel,
            }],
        }),
    };
    let with_plan = |plan| StrategyView {
        plan,
        ..dirty.clone()
    };
    [
        sample_response(Reply::StrategyCompute {
            value: with_plan(StrategyPlanView {
                state: StrategyPlanState::Calculating,
                compute_id: Some(7),
                ..StrategyPlanView::default()
            }),
        }),
        sample_response(Reply::StrategyView {
            value: with_plan(StrategyPlanView {
                state: StrategyPlanState::Calculated,
                compute_id: Some(7),
                result: Some(Box::new(completed.clone())),
                error: None,
                error_field: None,
                edit: Some(StrategyEditView {
                    stints: vec![
                        StrategyStint {
                            from_lap: 1,
                            to_lap: 2,
                        },
                        StrategyStint {
                            from_lap: 3,
                            to_lap: 3,
                        },
                    ],
                    stops: vec![StrategyEditStop {
                        lap: 2,
                        min_lap: 1,
                        max_lap: 2,
                        fuel_liters: 3.into(),
                        ve_percent: 5.into(),
                    }],
                    can_reset: false,
                    error: None,
                }),
            }),
        }),
        sample_response(Reply::StrategyView {
            value: with_plan(StrategyPlanView {
                state: StrategyPlanState::Partial,
                compute_id: Some(7),
                result: Some(Box::new(StrategyCalculationView {
                    certificate: None,
                    degraded: true,
                    metrics: None,
                    timeline: None,
                    ..completed
                })),
                error: None,
                error_field: None,
                edit: None,
            }),
        }),
        sample_response(Reply::StrategyView {
            value: with_plan(StrategyPlanView {
                state: StrategyPlanState::Error,
                compute_id: Some(7),
                result: None,
                error: Some(StrategyPlanError::InvalidInput),
                error_field: Some(StrategyField::RaceLaps),
                edit: None,
            }),
        }),
        sample_response(Reply::StrategyView {
            value: with_plan(StrategyPlanView {
                state: StrategyPlanState::Error,
                compute_id: Some(8),
                result: None,
                error: Some(StrategyPlanError::InvalidInput),
                error_field: None,
                edit: None,
            }),
        }),
        sample_response(Reply::StrategyConfirm {
            value: with_plan(StrategyPlanView {
                state: StrategyPlanState::PendingChanges,
                ..StrategyPlanView::default()
            }),
        }),
        sample_response(Reply::StrategyCancel {
            value: dirty.clone(),
        }),
    ]
}

/// A three-stint plan whose boundaries moved (`edited`), the same plan while it
/// recalculates (`calculating`), a recalculation that failed, and the infeasible answer.
#[allow(clippy::too_many_lines)] // One flat list of wire samples.
fn edit_samples(dirty: &StrategyView) -> Vec<HostToUi> {
    let pit = |lap, fuel: i64| StrategyPit {
        lap,
        fuel_liters: fuel.into(),
        ve_percent: 5.into(),
        change_tyres: true,
        service: StrategyPitService::Parallel,
    };
    let result = |feasible: bool| StrategyCalculationView {
        certificate: Some(if feasible {
            StrategyCertificate::Proven
        } else {
            StrategyCertificate::NoSolution
        }),
        steps: StrategyServiceSteps {
            fuel_liters: Some(1.into()),
            ve_percent: Some(1.into()),
        },
        degraded: false,
        metrics: feasible.then(|| StrategyMetrics {
            total_seconds: 301.into(),
            laps: 9,
            pit_count: 2,
            fuel_reserve_real_laps: Some(10.into()),
            fuel_reserve_required_laps: 1.into(),
        }),
        timeline: feasible.then(|| StrategyTimeline {
            pilot: "Pilot".into(),
            base_pace_seconds: 90.into(),
            fuel_start_liters: 30.into(),
            fuel_finish_liters: 24.into(),
            ve_start_percent: 100.into(),
            ve_finish_percent: 85.into(),
            stints: [(1, 3), (4, 6), (7, 9)]
                .map(|(from_lap, to_lap)| StrategyStint { from_lap, to_lap })
                .to_vec(),
            pits: vec![pit(3, 12), pit(6, 13)],
        }),
    };
    let edit = |error| StrategyEditView {
        stints: [(1, 2), (3, 6), (7, 9)]
            .map(|(from_lap, to_lap)| StrategyStint { from_lap, to_lap })
            .to_vec(),
        stops: vec![
            StrategyEditStop {
                lap: 2,
                min_lap: 1,
                max_lap: 5,
                fuel_liters: 12.into(),
                ve_percent: 5.into(),
            },
            StrategyEditStop {
                lap: 6,
                min_lap: 3,
                max_lap: 8,
                fuel_liters: 13.into(),
                ve_percent: 5.into(),
            },
        ],
        can_reset: true,
        error,
    };
    let plan = |state, compute_id, feasible, error| StrategyPlanView {
        state,
        compute_id: Some(compute_id),
        result: Some(Box::new(result(feasible))),
        error: None,
        error_field: None,
        edit: Some(edit(error)),
    };
    let with_plan = |plan| StrategyView {
        plan,
        ..dirty.clone()
    };
    vec![
        sample_response(Reply::StrategyMoveBoundary {
            value: with_plan(plan(StrategyPlanState::Edited, 7, true, None)),
        }),
        sample_response(Reply::StrategyMoveStop {
            value: with_plan(plan(StrategyPlanState::Edited, 7, true, None)),
        }),
        sample_response(Reply::StrategyRecalculate {
            value: with_plan(plan(StrategyPlanState::Calculating, 8, true, None)),
        }),
        sample_response(Reply::StrategyView {
            value: with_plan(plan(
                StrategyPlanState::Edited,
                8,
                true,
                Some(StrategyEditError::ScheduleNotPreserved),
            )),
        }),
        sample_response(Reply::StrategyView {
            value: with_plan(plan(StrategyPlanState::Calculated, 8, false, None)),
        }),
        sample_response(Reply::StrategyResetEdit {
            value: with_plan(plan(StrategyPlanState::Calculated, 7, true, None)),
        }),
    ]
}
