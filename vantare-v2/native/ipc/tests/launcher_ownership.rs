use vantare_ipc::launcher::{
    self, Request,
    execution::{Capability, EventKind, ExecutionStatus},
    ownership::*,
};

fn request() -> serde_json::Value {
    serde_json::json!({"remove-profile-v1":{
        "request":"a".repeat(32),"instance":"b".repeat(64),"account":"c".repeat(64),"profile":"qa","revision":"d".repeat(64)
    }})
}
#[test]
fn checked_removal_is_closed_and_carries_no_execution_or_executable_data() {
    assert!(serde_json::from_value::<Request>(request()).is_ok());
    for (field, patch) in [
        ("profile", serde_json::json!("")),
        ("revision", serde_json::json!("f".repeat(63))),
        ("account", serde_json::json!("account@example.invalid")),
        ("run", serde_json::json!("1")),
        ("pid", serde_json::json!(1)),
        ("path", serde_json::json!("forbidden")),
        ("arguments", serde_json::json!([])),
        ("document", serde_json::json!({})),
    ] {
        let mut value = request();
        value["remove-profile-v1"][field] = patch;
        assert!(serde_json::from_value::<Request>(value).is_err(), "{field}");
    }
}
#[test]
fn removal_events_deduplicate_without_inventing_runs_and_future_ownership_drops_only_extension() {
    let mut extension = ExecutionStatus::new("b".repeat(64).try_into().unwrap());
    extension
        .capabilities
        .push(Capability::LiveProfileOwnership);
    extension.ownership = Some(Ownership::Known {
        revision: "d".repeat(64),
        profiles: vec![ProfileOwnership {
            profile: "qa".into(),
            owned_live: true,
        }],
    });
    let request: launcher::RequestId = "a".repeat(32).try_into().unwrap();
    extension
        .record(EventKind::RemovalReceived {
            request: request.clone(),
            receipt: RemovalReceipt::Accepted,
        })
        .unwrap();
    extension
        .record(EventKind::RemovalFinished {
            request: request.clone(),
            outcome: RemovalOutcome::Removed {
                revision: "e".repeat(64),
            },
        })
        .unwrap();
    assert!(extension.contains_request(&request));
    assert_eq!(extension.events.len(), 2);
    let status = launcher::Status {
        version: launcher::VERSION,
        running: false,
        extension: Some(extension),
        ..Default::default()
    };
    let mut json = serde_json::to_value(status).unwrap();
    assert!(
        serde_json::from_value::<launcher::Status>(json.clone())
            .unwrap()
            .extension
            .is_some()
    );
    json["extension"]["ownership"]["profiles"][0]["pid"] = serde_json::json!(999);
    let legacy: launcher::Status = serde_json::from_value(json).unwrap();
    assert!(legacy.extension.is_none());
    assert_eq!(legacy.version, launcher::VERSION);
    assert!(!legacy.running);
}

// Frozen tag-only v35 decoder: all seven existing operations remain recognized,
// while a future remove-profile-v1 cannot be interpreted as any launch/answer.
#[derive(serde::Deserialize)]
enum FrozenV35 {
    #[serde(rename = "launch-v1")]
    Launch(serde_json::Value),
    #[serde(rename = "launch-v2")]
    LaunchChecked(serde_json::Value),
    #[serde(rename = "answer-v2")]
    Answer(serde_json::Value),
    #[serde(rename = "answer-v3")]
    AnswerChecked(serde_json::Value),
    #[serde(rename = "cancel-v1")]
    Cancel(serde_json::Value),
    #[serde(rename = "rehearse-v1")]
    Rehearse(serde_json::Value),
    #[serde(rename = "retry-v1")]
    Retry(serde_json::Value),
}
impl FrozenV35 {
    fn payload(self) -> serde_json::Value {
        match self {
            Self::Launch(value)
            | Self::LaunchChecked(value)
            | Self::Answer(value)
            | Self::AnswerChecked(value)
            | Self::Cancel(value)
            | Self::Rehearse(value)
            | Self::Retry(value) => value,
        }
    }
}
#[test]
fn old_request_decoder_rejects_removal_without_dispatching_an_effect() {
    assert!(serde_json::from_value::<FrozenV35>(request()).is_err());
    for tag in [
        "launch-v1",
        "launch-v2",
        "answer-v2",
        "answer-v3",
        "cancel-v1",
        "rehearse-v1",
        "retry-v1",
    ] {
        let old: FrozenV35 =
            serde_json::from_value(serde_json::json!({(tag):{"frozen":true}})).unwrap();
        assert_eq!(old.payload(), serde_json::json!({"frozen":true}));
    }
}
