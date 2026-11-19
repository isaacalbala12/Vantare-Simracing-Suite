use crate::protocol::bindings::{declare, sample_response};
use crate::protocol::{HostError, HostToUi, Reply, Request, UiToHost};
use crate::strategy::{
    ID_LIMIT, STRATEGY_FILE_NAME_MAX, STRATEGY_PICK_COOLDOWN_MS, STRATEGY_PICK_LIFETIME_SECONDS,
    STRATEGY_PICK_PATH_MAX, STRATEGY_PIT_LIMIT, StrategyCalculationView, StrategyCertificate,
    StrategyComputeForm, StrategyEditError, StrategyEditStop, StrategyEditView,
    StrategyEventSummary, StrategyField, StrategyFields, StrategyFile, StrategyFileMode,
    StrategyFileSelection, StrategyMetrics, StrategyPit, StrategyPitPinned, StrategyPitService,
    StrategyPlanError, StrategyPlanState, StrategyPlanView, StrategyReason, StrategyServiceSteps,
    StrategySolverFields, StrategyState, StrategyStint, StrategyTimeline, StrategyVariant,
    StrategyView, TEXT_LIMIT,
};
use crate::strategy::{
    STRATEGY_CHANGE_TEXT_LIMIT, StrategyAcceptedMark, StrategyAcceptedState, StrategyAcceptedView,
    StrategyChange, StrategyCompare, StrategyUnreachable, StrategyUnreachableCause,
};
use crate::strategy::{
    STRATEGY_EXPORT_LIMIT, StrategyExportFileValue, StrategyExportTarget, StrategyExportText,
};
use serde_json::json;

#[allow(clippy::too_many_lines)] // One flat list of declarations.
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
    declare::<StrategyReason>(&mut text);
    declare::<StrategyFile>(&mut text);
    declare::<StrategyFileMode>(&mut text);
    declare::<StrategyFileSelection>(&mut text);
    declare::<StrategyPitPinned>(&mut text);
    declare::<StrategyAcceptedMark>(&mut text);
    declare::<StrategyAcceptedState>(&mut text);
    declare::<StrategyAcceptedView>(&mut text);
    declare::<StrategyChange>(&mut text);
    declare::<StrategyCompare>(&mut text);
    declare::<StrategyUnreachable>(&mut text);
    declare::<StrategyUnreachableCause>(&mut text);
    declare::<StrategyExportTarget>(&mut text);
    declare::<StrategyExportText>(&mut text);
    declare::<StrategyExportFileValue>(&mut text);
    crate::protocol::bindings::constants!(&mut text, "strategyExportLimit", STRATEGY_EXPORT_LIMIT);
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyChangeTextLimit",
        STRATEGY_CHANGE_TEXT_LIMIT
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyAcceptedStates",
        [
            StrategyAcceptedState::Accepted,
            StrategyAcceptedState::Stale,
            StrategyAcceptedState::StaleUnreachable
        ]
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyAcceptedMarks",
        [
            StrategyAcceptedMark::None,
            StrategyAcceptedMark::Accepted,
            StrategyAcceptedMark::Stale
        ]
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyUnreachableCauses",
        [
            StrategyUnreachableCause::ResourceExhausted,
            StrategyUnreachableCause::ReserveNotMet,
            StrategyUnreachableCause::ScheduleMismatch,
            StrategyUnreachableCause::Other
        ]
    );
    crate::protocol::bindings::constants!(&mut text, "strategyReasons", StrategyReason::ALL);
    crate::protocol::bindings::constants!(&mut text, "strategyFileModes", StrategyFileMode::ALL);
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyPickLifetimeSeconds",
        STRATEGY_PICK_LIFETIME_SECONDS
    );
    crate::protocol::bindings::constants!(
        &mut text,
        "strategyPickCooldownMs",
        STRATEGY_PICK_COOLDOWN_MS
    );
    crate::protocol::bindings::constants!(&mut text, "strategyPickPathMax", STRATEGY_PICK_PATH_MAX);
    crate::protocol::bindings::constants!(&mut text, "strategyFileNameMax", STRATEGY_FILE_NAME_MAX);
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
            has_inputs: true,
            accepted_plan: StrategyAcceptedMark::None,
        }],
        active_event_id: Some("event-1".into()),
        active_strategy_id: Some("variant-1".into()),
        dirty: false,
        plan: StrategyPlanView::default(),
        file: Some(StrategyFile {
            name: "strategy-v2.json".into(),
        }),
        form: Some(Box::new(StrategyComputeForm {
            fields: sample_fields(),
            inputs: solver_sample(),
        })),
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
        file: Some(StrategyFile {
            name: "strategy-v2.json".into(),
        }),
        form: None,
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
            HostError::StrategyInvalidInput {
                field: Some(crate::strategy::StrategyField::BasePaceSeconds),
            },
            HostError::StrategyInvalidInput { field: None },
            HostError::StrategyFileUnavailable,
            HostError::StrategyFileTooLarge,
            HostError::StrategyTargetExists,
            HostError::StrategyPickExpired,
            HostError::StrategyNotAcceptable,
            HostError::StrategyNoAcceptedPlan,
            HostError::StrategyNothingToExport,
            HostError::StrategyExportNotCsv,
            HostError::StrategyFileInUse,
        ]
        .map(|error| HostToUi::Failure { id: 1, error }),
    );
    let fields = sample_fields();
    host.extend(calculation_samples(&dirty));
    host.extend(edit_samples(&dirty));
    host.extend(reason_samples(&dirty));
    host.extend(accepted_samples(&dirty));
    host.push(sample_response(Reply::StrategyView {
        value: no_inputs_sample(),
    }));
    // the acknowledgement and the final answer are both the view
    host.push(sample_response(Reply::StrategyPickFile {
        value: StrategyView {
            file: Some(StrategyFile {
                name: "carreras-2026.json".into(),
            }),
            ..ready_sample()
        },
    }));
    // the plan as text, and the three answers of the export dialog
    host.push(sample_response(Reply::StrategyExport {
        value: StrategyExportText {
            text: "PROPUESTA SIN ACEPTAR
Carrera: Fuji · Estrategia: Base"
                .into(),
        },
    }));
    for value in [
        StrategyExportFileValue::Ticket {
            suggested_name: "Fuji - Base.csv".into(),
        },
        StrategyExportFileValue::Saved {
            file: StrategyFile {
                name: "Fuji - Base.csv".into(),
            },
        },
        StrategyExportFileValue::Cancelled,
    ] {
        host.push(sample_response(Reply::StrategyExportFile { value }));
    }
    let mut ui = Vec::from(
        [
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
                inputs: None,
            },
            Request::StrategyCreate {
                revision: "a".repeat(64),
                fields: Box::new(fields.clone()),
                base_pace_seconds: None,
                fuel_per_lap_liters: None,
                inputs: Some(Box::new(solver_sample())),
            },
            Request::StrategyConfirm {
                event_id: "event-1".into(),
                strategy_id: "variant-1".into(),
                revision: "b".repeat(64),
                fields: Box::new(fields.clone()),
                inputs: None,
            },
            Request::StrategyConfirm {
                event_id: "event-1".into(),
                strategy_id: "variant-1".into(),
                revision: "b".repeat(64),
                fields: Box::new(fields.clone()),
                inputs: Some(Box::new(solver_sample())),
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
            Request::StrategyPickFile {
                mode: StrategyFileMode::Open,
                revision: "a".repeat(64),
            },
            Request::StrategyPickFile {
                mode: StrategyFileMode::SaveAs,
                revision: "b".repeat(64),
            },
            Request::StrategyAccept {
                revision: "b".repeat(64),
                compute_id: 7,
            },
            Request::StrategyUnaccept {
                revision: "b".repeat(64),
            },
            Request::StrategyShowAccepted {
                revision: "b".repeat(64),
            },
            Request::StrategyExport {
                revision: "b".repeat(64),
                target: StrategyExportTarget::Proposal { compute_id: 7 },
            },
            Request::StrategyExport {
                revision: "b".repeat(64),
                target: StrategyExportTarget::Accepted {},
            },
            Request::StrategyExportFile {
                revision: "b".repeat(64),
                target: StrategyExportTarget::Proposal { compute_id: 7 },
            },
            Request::StrategyExportFile {
                revision: "b".repeat(64),
                target: StrategyExportTarget::Accepted {},
            },
            Request::StrategySave {
                revision: "b".repeat(64),
            },
            Request::StrategyDiscard {
                revision: "b".repeat(64),
            },
        ]
        .map(|request| UiToHost::Request { id: 1, request }),
    );
    // the trusted answer of the main process (never sent by the renderer)
    ui.push(UiToHost::PickedStrategyFile(StrategyFileSelection {
        id: 0x8000_0000,
        path: None,
    }));
    json!({"host":host,"ui":ui})
}

/// An event that holds no confirmed calculation inputs (created without them, or
/// imported): its form keeps the fields and the pace and consumption of the
/// event; every other input is the empty string.
fn no_inputs_sample() -> StrategyView {
    let mut view = ready_sample();
    view.events[0].has_inputs = false;
    let inputs = solver_sample();
    view.form = Some(Box::new(StrategyComputeForm {
        fields: sample_fields(),
        inputs: StrategySolverFields {
            base_pace_seconds: inputs.base_pace_seconds,
            fuel_per_lap_liters: inputs.fuel_per_lap_liters,
            race_laps: String::new(),
            ve_capacity_percent: String::new(),
            ve_per_lap_percent: String::new(),
            tyre_life_laps: String::new(),
            degradation_seconds: String::new(),
            refuel_rate: String::new(),
            ve_rate: String::new(),
            tyre_service_seconds: String::new(),
            formation_seconds: String::new(),
            fuel_step: String::new(),
            ve_step: String::new(),
            reserve_laps: String::new(),
            service_mode: String::new(),
        },
    }));
    view
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
        reason: None,
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
                pit_seconds: 52.into(),
                pinned: StrategyPitPinned::default(),
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
                accepted: None,
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
                    reason: Some(StrategyReason::SearchBudgetExhausted),
                    metrics: None,
                    timeline: None,
                    ..completed
                })),
                error: None,
                error_field: None,
                accepted: None,
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
                accepted: None,
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
                accepted: None,
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

fn view_with(dirty: &StrategyView, plan: StrategyPlanView) -> HostToUi {
    sample_response(Reply::StrategyView {
        value: StrategyView {
            plan,
            ..dirty.clone()
        },
    })
}

/// One result for each of the other closed reasons of a partial or infeasible plan.
#[allow(clippy::too_many_lines)] // One flat list of wire samples.
fn reason_samples(dirty: &StrategyView) -> Vec<HostToUi> {
    let result = |certificate, degraded, reason, plan: bool| StrategyCalculationView {
        certificate,
        steps: StrategyServiceSteps {
            fuel_liters: Some(1.into()),
            ve_percent: None,
        },
        degraded,
        reason: Some(reason),
        metrics: plan.then(|| StrategyMetrics {
            total_seconds: 301.into(),
            laps: 3,
            pit_count: 0,
            fuel_reserve_real_laps: Some(10.into()),
            fuel_reserve_required_laps: 1.into(),
        }),
        timeline: None,
    };
    let view = |state, result| {
        sample_response(Reply::StrategyView {
            value: StrategyView {
                plan: StrategyPlanView {
                    state,
                    compute_id: Some(7),
                    result: Some(Box::new(result)),
                    ..StrategyPlanView::default()
                },
                ..dirty.clone()
            },
        })
    };
    // the plan being edited and the plan being recalculated keep the reason of the
    // result they show
    let schedule = StrategyEditView {
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
        can_reset: true,
        error: None,
    };
    let shown = |state| {
        view_with(
            dirty,
            StrategyPlanView {
                state,
                compute_id: Some(7),
                result: Some(Box::new(result(
                    Some(StrategyCertificate::NotProven),
                    false,
                    StrategyReason::SearchBudgetExhausted,
                    true,
                ))),
                edit: Some(schedule.clone()),
                ..StrategyPlanView::default()
            },
        )
    };
    vec![
        shown(StrategyPlanState::Edited),
        shown(StrategyPlanState::Calculating),
        view(
            StrategyPlanState::Partial,
            result(
                Some(StrategyCertificate::NotProven),
                false,
                StrategyReason::SearchBudgetExhausted,
                true,
            ),
        ),
        view(
            StrategyPlanState::Partial,
            result(None, true, StrategyReason::FineGridNoFallback, false),
        ),
        view(
            StrategyPlanState::Calculated,
            result(
                Some(StrategyCertificate::NoSolution),
                false,
                StrategyReason::NoFeasiblePlan,
                false,
            ),
        ),
        view(
            StrategyPlanState::Calculated,
            result(
                Some(StrategyCertificate::NoSolution),
                false,
                StrategyReason::ConstraintsUnsatisfiable,
                false,
            ),
        ),
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
        pit_seconds: 52.into(),
        pinned: StrategyPitPinned::default(),
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
        reason: (!feasible).then_some(StrategyReason::ConstraintsUnsatisfiable),
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
        accepted: None,
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

/// The accepted plan next to the proposal: each state, a comparison in each
/// direction, changes with and without their texts, each cause, and the marks of
/// the collection.
#[allow(clippy::too_many_lines)] // One flat list of wire samples.
fn accepted_samples(dirty: &StrategyView) -> Vec<HostToUi> {
    // the calculated plan the earlier samples show, as the base of the accepted one
    let base = StrategyView {
        plan: match calculation_samples(dirty).get(1) {
            Some(HostToUi::Response {
                result: Reply::StrategyView { value },
                ..
            }) => value.plan.clone(),
            _ => unreachable!("the second calculation sample is the calculated plan"),
        },
        ..dirty.clone()
    };
    let accepted_result = base
        .plan
        .result
        .as_deref()
        .cloned()
        .unwrap_or_else(|| unreachable!("the sample plan has a result"));
    let view =
        |state, changes: Vec<StrategyChange>, unreachable, compare, saved| StrategyAcceptedView {
            state,
            accepted_at: "2026-11-19T18:42:00Z".into(),
            saved,
            result: accepted_result.clone(),
            changes,
            unreachable,
            compare,
        };
    let change = |field, before: Option<&str>, after: Option<&str>| StrategyChange {
        field,
        before: before.map(str::to_owned),
        after: after.map(str::to_owned),
    };
    // the view with that accepted plan, the mark of the event following it
    let with = |accepted: Option<StrategyAcceptedView>, plan: &StrategyPlanView| {
        let mark = match accepted.as_ref().map(|view| view.state) {
            None => StrategyAcceptedMark::None,
            Some(StrategyAcceptedState::Accepted) => StrategyAcceptedMark::Accepted,
            Some(_) => StrategyAcceptedMark::Stale,
        };
        StrategyView {
            plan: StrategyPlanView {
                accepted: accepted.map(Box::new),
                ..plan.clone()
            },
            events: base
                .events
                .iter()
                .map(|event| crate::strategy::StrategyEventSummary {
                    accepted_plan: mark,
                    ..event.clone()
                })
                .collect(),
            ..base.clone()
        }
    };
    let uncalculated = StrategyPlanView::default();
    let seconds = |value: f64| serde_json::Number::from_f64(value).unwrap_or_else(|| 0.into());
    let unreachable = |cause, fail_lap| Some(StrategyUnreachable { cause, fail_lap });
    vec![
        // open: only the accepted plan, saved
        sample_response(Reply::StrategyOpen {
            value: with(
                Some(view(
                    StrategyAcceptedState::Accepted,
                    vec![],
                    None,
                    None,
                    true,
                )),
                &uncalculated,
            ),
        }),
        // accepted in this session, the proposal on screen is the same plan
        sample_response(Reply::StrategyAccept {
            value: with(
                Some(view(
                    StrategyAcceptedState::Accepted,
                    vec![],
                    None,
                    Some(StrategyCompare {
                        same: true,
                        delta_seconds: 0.into(),
                    }),
                    false,
                )),
                &base.plan,
            ),
        }),
        // a new proposal, slower and then faster than the accepted plan
        sample_response(Reply::StrategyView {
            value: with(
                Some(view(
                    StrategyAcceptedState::Accepted,
                    vec![],
                    None,
                    Some(StrategyCompare {
                        same: false,
                        delta_seconds: seconds(2.5),
                    }),
                    true,
                )),
                &base.plan,
            ),
        }),
        sample_response(Reply::StrategyView {
            value: with(
                Some(view(
                    StrategyAcceptedState::Accepted,
                    vec![],
                    None,
                    Some(StrategyCompare {
                        same: false,
                        delta_seconds: seconds(-1.0),
                    }),
                    false,
                )),
                &base.plan,
            ),
        }),
        // stale and still reaching: the changes, two of them without their texts
        sample_response(Reply::StrategyView {
            value: with(
                Some(view(
                    StrategyAcceptedState::Stale,
                    vec![
                        change(StrategyField::BasePaceSeconds, Some("90.472"), Some("90.9")),
                        change(StrategyField::Track, Some("Fuji"), None),
                        change(StrategyField::Class, None, None),
                    ],
                    None,
                    None,
                    true,
                )),
                &uncalculated,
            ),
        }),
        // stale and not reaching, one sample per cause
        sample_response(Reply::StrategyShowAccepted {
            value: with(
                Some(view(
                    StrategyAcceptedState::StaleUnreachable,
                    vec![change(
                        StrategyField::FuelPerLapLiters,
                        Some("1.83"),
                        Some("1.85"),
                    )],
                    unreachable(StrategyUnreachableCause::ResourceExhausted, None),
                    None,
                    true,
                )),
                &uncalculated,
            ),
        }),
        sample_response(Reply::StrategyView {
            value: with(
                Some(view(
                    StrategyAcceptedState::StaleUnreachable,
                    vec![change(StrategyField::ReserveLaps, Some("1"), Some("3"))],
                    unreachable(StrategyUnreachableCause::ReserveNotMet, Some(2)),
                    None,
                    false,
                )),
                &uncalculated,
            ),
        }),
        sample_response(Reply::StrategyView {
            value: with(
                Some(view(
                    StrategyAcceptedState::StaleUnreachable,
                    vec![change(StrategyField::RaceLaps, Some("3"), Some("4"))],
                    unreachable(StrategyUnreachableCause::ScheduleMismatch, None),
                    None,
                    true,
                )),
                &uncalculated,
            ),
        }),
        sample_response(Reply::StrategyView {
            value: with(
                Some(view(
                    StrategyAcceptedState::StaleUnreachable,
                    vec![change(
                        StrategyField::ServiceMode,
                        Some("parallel"),
                        Some("sequential"),
                    )],
                    unreachable(StrategyUnreachableCause::Other, None),
                    None,
                    true,
                )),
                &uncalculated,
            ),
        }),
        // the plan removed: the view has none again
        sample_response(Reply::StrategyUnaccept {
            value: with(None, &base.plan),
        }),
    ]
}
