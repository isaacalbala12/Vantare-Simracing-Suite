use serde::Deserialize;
use vantare_ipc::{
    account_session::AccountGeneration,
    control::{AccessState, Policy},
    launcher::{
        self, Action, AnswerChecked,
        answer::{OrderReceipt, permits_answer},
        execution::{EventKind, ExecutionStatus},
    },
};
fn answer() -> AnswerChecked {
    AnswerChecked {
        request: "a".repeat(32).try_into().expect("request fixture"),
        instance: "b".repeat(64).try_into().expect("instance fixture"),
        account: AccountGeneration::try_from("c".repeat(64)).expect("account fixture"),
        run: "9007199254740993"
            .to_owned()
            .try_into()
            .expect("run fixture"),
        revision: "d".repeat(64),
        decision: u64::MAX.to_string(),
        action: Action::Stop,
    }
}
#[derive(Deserialize)]
enum FrozenRequest {
    #[serde(rename = "launch-v1")]
    Launch { profile: String },
    #[serde(rename = "launch-v2")]
    Checked(serde_json::Value),
    #[serde(rename = "answer-v2")]
    Answer { decision: u64, action: String },
}
#[test]
fn checked_answer_is_closed_and_decimal_ids_are_lossless_while_legacy_bytes_stay_identical() {
    let bytes = serde_json::to_vec(&launcher::Request::AnswerChecked(answer())).unwrap();
    assert!(serde_json::from_slice::<FrozenRequest>(&bytes).is_err());
    let decoded: launcher::Request = serde_json::from_slice(&bytes).unwrap();
    let launcher::Request::AnswerChecked(decoded) = decoded else {
        panic!("checked answer");
    };
    assert_eq!(decoded.decision, u64::MAX.to_string());
    assert_eq!(String::from(decoded.run), "9007199254740993");
    let old = launcher::Request::Answer {
        decision: 42,
        action: Action::Cancel,
    };
    let bytes = serde_json::to_vec(&old).unwrap();
    assert_eq!(bytes, br#"{"answer-v2":{"decision":42,"action":"cancel"}}"#);
    match serde_json::from_slice::<FrozenRequest>(&bytes).unwrap() {
        FrozenRequest::Answer { decision, action } => {
            assert_eq!(decision, 42);
            assert_eq!(action, "cancel");
        }
        _ => panic!("legacy answer"),
    }
    let bytes = serde_json::to_vec(&launcher::Request::Launch {
        profile: "qa".into(),
    })
    .unwrap();
    assert_eq!(bytes, br#"{"launch-v1":{"profile":"qa"}}"#);
    match serde_json::from_slice::<FrozenRequest>(&bytes).unwrap() {
        FrozenRequest::Launch { profile } => assert_eq!(profile, "qa"),
        _ => panic!("legacy launch"),
    }
    let legacy = br#"{"launch-v2":{"request":"opaque"}}"#;
    match serde_json::from_slice::<FrozenRequest>(legacy).unwrap() {
        FrozenRequest::Checked(value) => assert_eq!(value["request"], "opaque"),
        _ => panic!("known older checked variant"),
    }
}
#[test]
fn invalid_scopes_actions_and_extra_payload_fields_are_rejected() {
    let base = serde_json::to_value(launcher::Request::AnswerChecked(answer())).unwrap();
    for (field, bad) in [
        ("decision", serde_json::json!("01")),
        ("decision", serde_json::json!("0")),
        ("decision", serde_json::json!("18446744073709551616")),
        ("run", serde_json::json!(123)),
        ("revision", serde_json::json!("A".repeat(64))),
        ("instance", serde_json::json!("short")),
        ("account", serde_json::json!("personal")),
        ("action", serde_json::json!("kill")),
        ("command", serde_json::json!("must-not-execute")),
    ] {
        let mut value = base.clone();
        value["answer-v3"][field] = bad;
        assert!(
            serde_json::from_value::<launcher::Request>(value).is_err(),
            "{field}"
        );
    }
}
#[test]
fn reductions_need_fresh_observation_but_never_invent_launch_permission() {
    let mut policy = Policy {
        epoch: 1,
        revision: 1,
        checked_at_ms: 10_000,
        ..Policy::denied(AccessState::Revoked)
    };
    for action in [
        Action::Cancel,
        Action::Stop,
        Action::Leave,
        Action::CloseStarted,
    ] {
        assert!(permits_answer(&policy, action, 10_750));
        assert!(!permits_answer(&policy, action, 12_000));
    }
    for action in [
        Action::Trust,
        Action::Reuse,
        Action::Restart,
        Action::Continue,
    ] {
        assert!(!permits_answer(&policy, action, 10_750));
    }
    policy.epoch = 0;
    assert!(!permits_answer(&policy, Action::Stop, 10_750));
}
#[test]
fn answer_receipts_share_the_ring_cursor_and_do_not_imply_finished() {
    let mut ring = ExecutionStatus::new("b".repeat(64).try_into().expect("instance fixture"));
    let run = ring.begin().unwrap();
    let request = answer().request;
    ring.record(EventKind::OrderReceived {
        request: request.clone(),
        receipt: OrderReceipt::Accepted { run },
    })
    .unwrap();
    assert!(ring.contains_request(&request));
    assert!(
        !ring
            .events
            .iter()
            .any(|e| matches!(e.kind, EventKind::Finished { .. }))
    );
    let bytes = serde_json::to_vec(&ring).unwrap();
    assert_eq!(
        serde_json::from_slice::<ExecutionStatus>(&bytes).unwrap(),
        ring
    );
}
