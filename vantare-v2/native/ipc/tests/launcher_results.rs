use serde::Deserialize;
use vantare_ipc::launcher::{self, Request, execution::*, results::*};
fn retry() -> RetryChecked {
    RetryChecked {
        request: "a".repeat(32).try_into().expect("request"),
        instance: "b".repeat(64).try_into().expect("instance"),
        account: "c".repeat(64).try_into().expect("account"),
        run: "9007199254740993".to_owned().try_into().expect("run"),
        profile: "qa".into(),
        revision: "d".repeat(64),
        scope: RetryScope::All,
    }
}
#[derive(Deserialize)]
enum FrozenV34Request {
    #[serde(rename = "launch-v1")]
    Launch(serde::de::IgnoredAny),
    #[serde(rename = "launch-v2")]
    Checked(serde::de::IgnoredAny),
    #[serde(rename = "answer-v2")]
    Answer(serde::de::IgnoredAny),
    #[serde(rename = "answer-v3")]
    AnswerChecked(serde::de::IgnoredAny),
    #[serde(rename = "cancel-v1")]
    Cancel(serde::de::IgnoredAny),
    #[serde(rename = "rehearse-v1")]
    Rehearse(serde::de::IgnoredAny),
}
#[test]
fn retry_is_closed_and_an_old_resident_rejects_it_without_a_legacy_launch() {
    let value = serde_json::to_value(Request::RetryChecked(retry())).unwrap();
    assert!(serde_json::from_value::<FrozenV34Request>(value.clone()).is_err());
    for (field, bad) in [
        ("run", serde_json::json!(9_007_199_254_740_993_u64)),
        ("run", serde_json::json!("01")),
        ("profile", serde_json::json!("bad\0id")),
        ("revision", serde_json::json!("D".repeat(64))),
        ("scope", serde_json::json!("indices")),
        ("selected", serde_json::json!([1])),
        ("command", serde_json::json!("never")),
    ] {
        let mut changed = value.clone();
        changed["retry-v1"][field] = bad;
        assert!(
            serde_json::from_value::<Request>(changed).is_err(),
            "{field}"
        );
    }
    let Request::RetryChecked(decoded) = serde_json::from_value(value).unwrap() else {
        panic!("retry-v1")
    };
    assert_eq!(String::from(decoded.run), "9007199254740993");
    for tag in [
        "launch-v1",
        "launch-v2",
        "answer-v2",
        "answer-v3",
        "cancel-v1",
        "rehearse-v1",
    ] {
        let old = serde_json::from_value::<FrozenV34Request>(serde_json::json!({tag:{}})).unwrap();
        match old {
            FrozenV34Request::Launch(v)
            | FrozenV34Request::Checked(v)
            | FrozenV34Request::Answer(v)
            | FrozenV34Request::AnswerChecked(v)
            | FrozenV34Request::Cancel(v)
            | FrozenV34Request::Rehearse(v) => {
                let _ = v;
            }
        }
    }
}
fn status() -> launcher::Status {
    let mut extension = ExecutionStatus::new("b".repeat(64).try_into().expect("instance"));
    extension.capabilities.push(Capability::StepResultsRetry);
    let run = extension.begin().expect("run");
    let outcome = ChainOutcome::Failed {
        reason: ChainFailure::StepFailed,
    };
    extension
        .record(EventKind::Finished { run, outcome })
        .expect("terminal");
    extension.results = Some(RunResults {
        run,
        profile: "qa".into(),
        revision: "d".repeat(64),
        account: "c".repeat(64).try_into().expect("account"),
        mode: RunMode::Rehearsal,
        outcome: Some(outcome),
        retry_failed: true,
        steps: vec![StepResult {
            index: 0,
            state: StepState::Failed,
        }],
    });
    launcher::Status {
        version: launcher::VERSION,
        running: false,
        extension: Some(extension),
        ..Default::default()
    }
}
#[test]
fn bounded_summaries_do_not_consume_events_and_invalid_future_data_only_drops_the_extension() {
    let mut status = status();
    let extension = status.extension.as_mut().unwrap();
    let count = extension.events.len();
    extension.results.as_mut().unwrap().steps = (0u16..128)
        .map(|index| StepResult {
            index,
            state: StepState::NotSelected,
        })
        .collect();
    let bytes = launcher::status_bytes(&status).unwrap();
    let decoded: launcher::Status = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(decoded.extension.unwrap().events.len(), count);
    let value = serde_json::to_value(&status).unwrap();
    for case in 0..4 {
        let mut changed = value.clone();
        match case {
            0 => changed["extension"]["results"]["steps"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::json!({"index":128,"state":"pending"})),
            1 => changed["extension"]["results"]["steps"][0]["index"] = serde_json::json!(1),
            2 => changed["extension"]["results"]["steps"][0]["state"] = serde_json::json!("future"),
            _ => changed["extension"]["results"]["command"] = serde_json::json!("never"),
        }
        let current: launcher::Status = serde_json::from_value(changed).unwrap();
        assert!(current.extension.is_none());
        assert_eq!(current.version, status.version);
        assert!(!current.running);
    }
}
#[test]
fn a_terminal_must_still_be_retained_and_belong_to_the_latest_execution() {
    let mut extension = status().extension.unwrap();
    let summary = extension.results.clone().unwrap();
    let outcome = summary.outcome.unwrap();
    assert!(extension.has_retained_terminal(summary.run, outcome));
    extension.begin().unwrap();
    assert!(!extension.has_retained_terminal(summary.run, outcome));
    let mut extension = status().extension.unwrap();
    extension
        .record(EventKind::OrderReceived {
            request: "a".repeat(32).try_into().unwrap(),
            receipt: launcher::answer::OrderReceipt::Rejected {
                reason: launcher::control::OrderRejection::Busy,
            },
        })
        .unwrap();
    assert!(
        extension.has_retained_terminal(summary.run, outcome),
        "unrelated rejected orders do not invalidate a run"
    );
    for _ in 0..33 {
        extension
            .record(EventKind::OrderReceived {
                request: "e".repeat(32).try_into().unwrap(),
                receipt: launcher::answer::OrderReceipt::Rejected {
                    reason: launcher::control::OrderRejection::UnknownRun,
                },
            })
            .unwrap();
    }
    assert!(!extension.has_retained_terminal(summary.run, outcome));
}
