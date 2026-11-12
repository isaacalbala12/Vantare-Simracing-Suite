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
    declare::<ResidentView>(&mut text);
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
    let host = vec![
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
    let ui = vec![
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
    serde_json::json!({"host":host,"ui":ui})
}
