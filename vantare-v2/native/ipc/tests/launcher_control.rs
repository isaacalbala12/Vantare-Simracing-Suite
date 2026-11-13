use serde::Deserialize;
use vantare_ipc::launcher::{
    self, CancelChecked, RehearseChecked, Request,
    answer::OrderReceipt,
    control::OrderRejection,
    execution::{CancelReason, ChainOutcome, EventKind, ExecutionStatus},
};
fn cancel() -> CancelChecked {
    CancelChecked {
        request: "a".repeat(32).try_into().expect("request"),
        instance: "b".repeat(64).try_into().expect("instance"),
        account: "c".repeat(64).try_into().expect("account"),
        run: "9007199254740993".to_owned().try_into().expect("run"),
        revision: "d".repeat(64),
    }
}
fn rehearse() -> RehearseChecked {
    RehearseChecked {
        request: "e".repeat(32).try_into().expect("request"),
        instance: "b".repeat(64).try_into().expect("instance"),
        account: "c".repeat(64).try_into().expect("account"),
        profile: "qa".into(),
        revision: "d".repeat(64),
    }
}
#[derive(Deserialize)]
enum FrozenL53Request {
    #[serde(rename = "launch-v1")]
    Launch(serde::de::IgnoredAny),
    #[serde(rename = "launch-v2")]
    Checked(serde::de::IgnoredAny),
    #[serde(rename = "answer-v2")]
    Answer(serde::de::IgnoredAny),
    #[serde(rename = "answer-v3")]
    ScopedAnswer(serde::de::IgnoredAny),
}
#[test]
fn frozen_l53_request_tags_reject_control_and_decimal_run_ids_remain_lossless() {
    for request in [
        Request::CancelChecked(cancel()),
        Request::RehearseChecked(rehearse()),
    ] {
        let bytes = serde_json::to_vec(&request).unwrap();
        assert!(serde_json::from_slice::<FrozenL53Request>(&bytes).is_err());
        let roundtrip: Request = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(serde_json::to_vec(&roundtrip).unwrap(), bytes);
    }
    let Request::CancelChecked(request) =
        serde_json::from_value(serde_json::to_value(Request::CancelChecked(cancel())).unwrap())
            .unwrap()
    else {
        panic!("cancel-v1")
    };
    assert_eq!(String::from(request.run), "9007199254740993");
    for tag in ["launch-v1", "launch-v2", "answer-v2", "answer-v3"] {
        let old = serde_json::from_value::<FrozenL53Request>(serde_json::json!({tag: {}})).unwrap();
        match old {
            FrozenL53Request::Launch(value)
            | FrozenL53Request::Checked(value)
            | FrozenL53Request::Answer(value)
            | FrozenL53Request::ScopedAnswer(value) => {
                let _ = value;
            }
        }
    }
    let bytes = serde_json::to_vec(&Request::Launch {
        profile: "qa".into(),
    })
    .unwrap();
    assert_eq!(bytes, br#"{"launch-v1":{"profile":"qa"}}"#);
}
#[test]
fn control_payloads_are_closed_and_reject_unsafe_or_noncanonical_inputs() {
    for (base, tag) in [
        (Request::CancelChecked(cancel()), "cancel-v1"),
        (Request::RehearseChecked(rehearse()), "rehearse-v1"),
    ] {
        let base = serde_json::to_value(base).unwrap();
        for (field, bad) in [
            ("request", serde_json::json!("short")),
            ("instance", serde_json::json!("old")),
            ("account", serde_json::json!("personal")),
            ("revision", serde_json::json!("D".repeat(64))),
            ("commands", serde_json::json!(["never-execute"])),
            ("selected", serde_json::json!([0])),
        ] {
            let mut value = base.clone();
            value[tag][field] = bad;
            assert!(
                serde_json::from_value::<Request>(value).is_err(),
                "{tag}/{field}"
            );
        }
    }
    for bad in [
        serde_json::json!("0"),
        serde_json::json!("01"),
        serde_json::json!(1),
        serde_json::json!("18446744073709551616"),
    ] {
        let mut value = serde_json::to_value(Request::CancelChecked(cancel())).unwrap();
        value["cancel-v1"]["run"] = bad;
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
    for bad in [
        "".to_owned(),
        "x".repeat(257),
        "é".repeat(129),
        "bad\0id".into(),
    ] {
        let mut value = serde_json::to_value(Request::RehearseChecked(rehearse())).unwrap();
        value["rehearse-v1"]["profile"] = bad.into();
        assert!(serde_json::from_value::<Request>(value).is_err());
    }
}
#[test]
fn rehearse_and_cancel_share_receipts_cursor_and_terminal_without_consuming_reads() {
    let mut status = ExecutionStatus::new("b".repeat(64).try_into().unwrap());
    let rehearse = rehearse().request;
    let run = status.accept_order(rehearse.clone()).unwrap();
    let cancel = cancel().request;
    status
        .record(EventKind::OrderReceived {
            request: cancel.clone(),
            receipt: OrderReceipt::Accepted { run },
        })
        .unwrap();
    assert!(status.contains_request(&rehearse) && status.contains_request(&cancel));
    assert!(
        !status
            .events
            .iter()
            .any(|e| matches!(e.kind, EventKind::Finished { .. }))
    );
    status
        .record(EventKind::Finished {
            run,
            outcome: ChainOutcome::Cancelled {
                reason: CancelReason::User,
            },
        })
        .unwrap();
    status
        .record(EventKind::OrderReceived {
            request: "f".repeat(32).try_into().unwrap(),
            receipt: OrderReceipt::Rejected {
                reason: OrderRejection::NoSteps,
            },
        })
        .unwrap();
    let bytes = serde_json::to_vec(&status).unwrap();
    assert_eq!(
        serde_json::from_slice::<ExecutionStatus>(&bytes).unwrap(),
        status
    );
    assert_eq!(launcher::VERSION, 2);
}
