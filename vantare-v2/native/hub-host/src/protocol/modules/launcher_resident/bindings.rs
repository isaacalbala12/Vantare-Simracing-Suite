use crate::launcher_resident::{
    ResidentAction, ResidentChoice, ResidentQuestion, ResidentQuestionKind, ResidentView,
};
use crate::protocol::bindings::{constants, declare};
use crate::protocol::{Event, HostToUi, Reply, Request, Topic, UiToHost};
pub(crate) fn typescript() -> String {
    let mut text = String::new();
    declare::<ResidentAction>(&mut text);
    declare::<ResidentQuestionKind>(&mut text);
    declare::<ResidentChoice>(&mut text);
    declare::<ResidentQuestion>(&mut text);
    declare::<crate::launcher_resident::ResidentFailure>(&mut text);
    declare::<crate::launcher_resident::ResidentCancellation>(&mut text);
    declare::<crate::launcher_resident::ResidentRejection>(&mut text);
    declare::<crate::launcher_resident::ResidentOutcome>(&mut text);
    declare::<crate::launcher_resident::ResidentReceipt>(&mut text);
    declare::<crate::launcher_resident::ResidentEventKind>(&mut text);
    declare::<crate::launcher_resident::ResidentExecutionEvent>(&mut text);
    declare::<crate::launcher_resident::ResidentExecution>(&mut text);
    declare::<crate::launcher_resident::ResidentAnswerRejection>(&mut text);
    declare::<crate::launcher_resident::ResidentOrderReceipt>(&mut text);
    declare::<crate::launcher_resident::ResidentScopedQuestion>(&mut text);
    declare::<crate::launcher_resident::ResidentAnswerTarget>(&mut text);
    declare::<crate::launcher_resident::ResidentQueued>(&mut text);
    declare::<crate::launcher_resident::ResidentOrderRejection>(&mut text);
    declare::<crate::launcher_resident::ResidentActiveRun>(&mut text);
    declare::<crate::launcher_resident::ResidentCancelTarget>(&mut text);
    declare::<crate::launcher_resident::ResidentRehearseTarget>(&mut text);
    constants!(
        &mut text,
        "residentOrderRejections",
        crate::launcher_resident::ResidentOrderRejection::ALL
    );
    constants!(
        &mut text,
        "residentProfileIdLimit",
        vantare_ipc::launcher::checked::ID_LIMIT
    );

    declare::<ResidentView>(&mut text);
    constants!(
        &mut text,
        "residentAnswerRejections",
        crate::launcher_resident::ResidentAnswerRejection::ALL
    );
    constants!(
        &mut text,
        "residentOrderReceiptTimeoutMs",
        crate::calendar::launch_types::RECEIPT_MS
    );
    constants!(&mut text, "residentActions", ResidentAction::ALL);
    constants!(
        &mut text,
        "residentQuestionKinds",
        ResidentQuestionKind::ALL
    );
    constants!(
        &mut text,
        "residentIdLimit",
        crate::launcher_resident::DECISION_ID_MAX
    );
    constants!(&mut text, "residentIdMaximum", u64::MAX.to_string());
    constants!(
        &mut text,
        "residentIdPattern",
        crate::launcher_resident::DECISION_ID_PATTERN
    );
    let labels: std::collections::BTreeMap<_, _> = ResidentAction::ALL
        .into_iter()
        .map(|action| {
            (
                serde_json::to_value(action)
                    .expect("action id")
                    .as_str()
                    .expect("string id")
                    .to_owned(),
                action.label(),
            )
        })
        .collect();
    constants!(&mut text, "residentActionLabels", labels);
    text
}
pub(crate) fn corpus() -> serde_json::Value {
    use vantare_ipc::launcher::{RequestId, execution as native};
    let mut execution =
        native::ExecutionStatus::new("b".repeat(64).try_into().expect("instance fixture"));
    execution
        .capabilities
        .push(native::Capability::RevisionCheckedLaunch);
    let run = execution
        .accept(RequestId::try_from("a".repeat(32)).expect("request fixture"))
        .expect("run fixture");
    execution
        .record(native::EventKind::Finished {
            run,
            outcome: native::ChainOutcome::Completed,
        })
        .expect("terminal fixture");
    let value = ResidentView {
        execution: Some((&execution).into()),
        online: true,
        running: true,
        decision: Some(ResidentQuestion {
            id: u64::MAX.to_string(),
            kind: ResidentQuestionKind::Authorization,
            actions: vec![
                ResidentChoice {
                    id: ResidentAction::Trust,
                    label: ResidentAction::Trust.label().into(),
                },
                ResidentChoice {
                    id: ResidentAction::Cancel,
                    label: ResidentAction::Cancel.label().into(),
                },
            ],
        }),
        ..Default::default()
    };
    let target = crate::launcher_resident::ResidentAnswerTarget {
        instance: "b".repeat(64),
        account_generation: "c".repeat(64),
        run: "1".into(),
        revision: "d".repeat(64),
        decision: u64::MAX.to_string(),
        action: ResidentAction::Stop,
    };
    let mut host = vec![
        HostToUi::Response {
            id: 2,
            result: Reply::LauncherResidentAnswer {
                value: crate::launcher_resident::ResidentQueued::Queued {
                    request: "e".repeat(32),
                },
            },
        },
        HostToUi::Response {
            id: 1,
            result: Reply::LauncherResidentGet {
                value: value.clone(),
            },
        },
        HostToUi::Event {
            event: Event::LauncherResident { value },
        },
    ];
    host.extend(
        crate::launcher_resident::ResidentAnswerRejection::ALL
            .into_iter()
            .map(|reason| HostToUi::Failure {
                id: 3,
                error: crate::protocol::HostError::ResidentAnswerRejected { reason },
            }),
    );
    let mut ui = vec![
        UiToHost::Request {
            id: 2,
            request: Request::LauncherResidentAnswer { target },
        },
        UiToHost::Request {
            id: 1,
            request: Request::LauncherResidentGet {},
        },
        UiToHost::Subscribe {
            topic: Topic::LauncherResident,
        },
        UiToHost::Unsubscribe {
            topic: Topic::LauncherResident,
        },
    ];
    control_samples(&mut host, &mut ui);
    serde_json::json!({"host":host,"ui":ui})
}

fn control_samples(host: &mut Vec<HostToUi>, ui: &mut Vec<UiToHost>) {
    use crate::launcher_resident::{
        ResidentCancelTarget, ResidentOrderRejection, ResidentQueued, ResidentRehearseTarget,
    };
    use vantare_ipc::launcher::{
        answer::OrderReceipt,
        control::{OrderRejection, RunScope},
        execution::{Capability, EventKind, ExecutionStatus},
    };
    ui.push(UiToHost::Request {
        id: 4,
        request: Request::LauncherResidentCancel {
            target: ResidentCancelTarget {
                instance: "b".repeat(64),
                account_generation: "c".repeat(64),
                run: "1".into(),
                revision: "d".repeat(64),
            },
        },
    });
    ui.push(UiToHost::Request {
        id: 5,
        request: Request::LauncherResidentRehearse {
            target: ResidentRehearseTarget {
                instance: "b".repeat(64),
                account_generation: "c".repeat(64),
                profile: "qa".into(),
                revision: "d".repeat(64),
            },
        },
    });
    host.push(HostToUi::Response {
        id: 4,
        result: Reply::LauncherResidentCancel {
            value: ResidentQueued::Queued {
                request: "f".repeat(32),
            },
        },
    });
    host.push(HostToUi::Response {
        id: 5,
        result: Reply::LauncherResidentRehearse {
            value: ResidentQueued::Queued {
                request: "e".repeat(32),
            },
        },
    });
    host.extend(
        ResidentOrderRejection::ALL
            .into_iter()
            .map(|reason| HostToUi::Failure {
                id: 6,
                error: crate::protocol::HostError::ResidentControlRejected { reason },
            }),
    );
    let mut execution = ExecutionStatus::new("b".repeat(64).try_into().expect("instance"));
    execution.capabilities.push(Capability::CheckedControl);
    let run = execution.begin().expect("run");
    execution.active = Some(RunScope {
        run,
        revision: "d".repeat(64),
        account: "c".repeat(64).try_into().expect("account"),
    });
    execution
        .record(EventKind::OrderReceived {
            request: "f".repeat(32).try_into().expect("request"),
            receipt: OrderReceipt::Rejected {
                reason: OrderRejection::NoSteps,
            },
        })
        .expect("receipt");
    host.push(HostToUi::Event {
        event: Event::LauncherResident {
            value: ResidentView {
                online: true,
                running: true,
                execution: Some((&execution).into()),
                ..Default::default()
            },
        },
    });
}
