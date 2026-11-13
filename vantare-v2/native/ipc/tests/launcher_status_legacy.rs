//! Frozen mailbox v2 and first-extension wire decoders. No aliases to current DTOs.
use serde::{Deserialize, Serialize};
use vantare_ipc::launcher::{self, execution::*};
mod frozen {
    use super::*;
    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "kebab-case")]
    pub enum Action {
        Trust,
        Reuse,
        Restart,
        Cancel,
        Stop,
        Continue,
        Leave,
        CloseStarted,
    }
    #[derive(Serialize, Deserialize)]
    pub struct Registration {
        pub profile: String,
        pub hotkey: String,
        pub registered: bool,
        pub error: Option<String>,
    }
    #[derive(Serialize, Deserialize)]
    pub struct Decision {
        pub id: u64,
        pub message: String,
        pub actions: Vec<Action>,
    }
    #[derive(Serialize, Deserialize)]
    pub struct Status {
        pub version: u32,
        pub updated_ms: u64,
        pub profiles: Vec<Registration>,
        pub startup_profile: Option<String>,
        pub error: Option<String>,
        pub progress: String,
        pub running: bool,
        pub decision: Option<Decision>,
    }
    #[derive(Clone, Serialize, Deserialize)]
    #[serde(try_from = "String", into = "String")]
    pub struct Sequence(u64);
    impl TryFrom<String> for Sequence {
        type Error = &'static str;
        fn try_from(s: String) -> Result<Self, Self::Error> {
            s.parse::<u64>()
                .ok()
                .filter(|n| *n > 0 && n.to_string() == s)
                .map(Self)
                .ok_or("sequence")
        }
    }
    impl From<Sequence> for String {
        fn from(s: Sequence) -> Self {
            s.0.to_string()
        }
    }
    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "kebab-case")]
    pub enum Capability {
        TypedTerminal,
        #[serde(other)]
        Unknown,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "kebab-case")]
    pub enum Failure {
        StepFailed,
        DecisionExpired,
        CleanupFailed,
        WorkerPanicked,
        Internal,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(rename_all = "kebab-case")]
    pub enum Cancel {
        User,
        Shutdown,
        TrustDeclined,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
    pub enum Outcome {
        Completed,
        Failed { reason: Failure },
        Cancelled { reason: Cancel },
    }
    #[derive(Serialize, Deserialize)]
    #[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
    pub enum Kind {
        Started { run: Sequence },
        Finished { run: Sequence, outcome: Outcome },
    }
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct Event {
        seq: Sequence,
        kind: Kind,
    }
    #[derive(Serialize, Deserialize)]
    #[serde(deny_unknown_fields)]
    pub struct Extension {
        instance: String,
        pub capabilities: Vec<Capability>,
        first_retained_seq: Sequence,
        events: Vec<Event>,
    }
    impl Extension {
        fn valid(&self) -> bool {
            self.instance.len() == 64
                && self
                    .instance
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                && self.capabilities.len() <= 32
                && self.events.len() <= 32
                && self.first_retained_seq.0 == self.events.first().map_or(1, |e| e.seq.0)
                && self
                    .events
                    .windows(2)
                    .all(|w| w[0].seq.0.checked_add(1) == Some(w[1].seq.0))
                && self.events.iter().all(|e| match &e.kind {
                    Kind::Started { run } | Kind::Finished { run, .. } => run.0 <= e.seq.0,
                })
        }
    }
    fn extension<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Extension>, D::Error> {
        let value = serde_json::Value::deserialize(d)?;
        Ok(serde_json::from_value::<Extension>(value)
            .ok()
            .filter(Extension::valid))
    }
    #[derive(Serialize, Deserialize)]
    pub struct Extended {
        #[serde(flatten)]
        pub legacy: Status,
        #[serde(
            default,
            deserialize_with = "extension",
            skip_serializing_if = "Option::is_none"
        )]
        pub extension: Option<Extension>,
    }
}
fn status() -> launcher::Status {
    launcher::Status {
        version: 2,
        updated_ms: 10_000,
        running: true,
        error: Some("legacy error".into()),
        progress: "legacy progress".into(),
        profiles: vec![launcher::Registration {
            profile: "qa".into(),
            registered: true,
            ..Default::default()
        }],
        decision: Some(launcher::Decision {
            id: 42,
            message: "legacy decision".into(),
            actions: vec![launcher::Action::Cancel],
        }),
        ..Default::default()
    }
}
fn extension() -> ExecutionStatus {
    let mut value = ExecutionStatus::new("a".repeat(64).try_into().expect("fixture instance"));
    let run = value.begin().expect("fixture run");
    value
        .record(EventKind::Finished {
            run,
            outcome: ChainOutcome::Completed,
        })
        .expect("fixture terminal");
    value
}
#[test]
fn old_v2_decoder_preserves_all_legacy_fields_and_bytes_with_new_extension() {
    let mut current = status();
    current.extension = Some(extension());
    let bytes = serde_json::to_vec(&current).unwrap();
    let old: frozen::Status = serde_json::from_slice(&bytes).unwrap();
    current.extension = None;
    assert_eq!(
        serde_json::to_vec(&old).unwrap(),
        serde_json::to_vec(&current).unwrap()
    );
}
#[test]
fn unknown_capability_is_tolerated_by_current_and_frozen_extension_readers() {
    let mut value = serde_json::to_value(status()).unwrap();
    value["extension"] = serde_json::to_value(extension()).unwrap();
    value["extension"]["capabilities"]
        .as_array_mut()
        .unwrap()
        .push("future-support".into());
    let current: launcher::Status = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(
        current.extension.unwrap().capabilities,
        [Capability::TypedTerminal, Capability::Unknown]
    );
    let previous: frozen::Extended = serde_json::from_value(value).unwrap();
    assert!(previous.legacy.running);
    assert!(matches!(
        previous.extension.unwrap().capabilities[1],
        frozen::Capability::Unknown
    ));
}
#[test]
fn future_or_malformed_extension_never_hides_the_whole_status() {
    let mut malformed = Vec::new();
    malformed.push(serde_json::Value::Bool(false));
    let mut future = serde_json::to_value(extension()).unwrap();
    future["events"][0]["kind"]["kind"] = "received".into();
    malformed.push(future);
    let mut future = serde_json::to_value(extension()).unwrap();
    future["future-field"] = true.into();
    malformed.push(future);
    let base = std::env::temp_dir();
    let root = base.join(format!("status-extension-{}", std::process::id()));
    std::fs::create_dir_all(&root).unwrap();
    let settings = root.join("launcher.json");
    for ext in malformed {
        let mut value = serde_json::to_value(status()).unwrap();
        value["extension"] = ext;
        let bytes = serde_json::to_vec(&value).unwrap();
        std::fs::write(launcher::status_path(&settings), &bytes).unwrap();
        let current =
            launcher::read_status_at(&settings, 10_000).expect("online even with future extension");
        assert!(current.extension.is_none());
        assert!(current.running);
        assert_eq!(current.decision.unwrap().id, 42);
        assert_eq!(current.profiles[0].profile, "qa");
        let old: frozen::Extended = serde_json::from_slice(&bytes).unwrap();
        assert!(old.extension.is_none());
        assert!(old.legacy.running);
        assert_eq!(old.legacy.decision.unwrap().id, 42);
    }
    std::fs::remove_dir_all(root).unwrap();
}
#[test]
fn invalid_sequences_or_an_oversized_ring_only_disable_the_extension() {
    for invalid in [
        serde_json::json!(17),
        serde_json::json!("01"),
        serde_json::json!("18446744073709551616"),
    ] {
        let mut value = serde_json::to_value(status()).unwrap();
        value["extension"] = serde_json::to_value(extension()).unwrap();
        value["extension"]["events"][0]["seq"] = invalid;
        let current: launcher::Status = serde_json::from_value(value).unwrap();
        assert!(current.running);
        assert!(current.extension.is_none());
    }
    let mut value = serde_json::to_value(status()).unwrap();
    value["extension"] = serde_json::to_value(extension()).unwrap();
    value["extension"]["events"] = serde_json::Value::Array((1..=33).map(|seq| serde_json::json!({"seq":seq.to_string(),"kind":{"kind":"started","run":seq.to_string()}})).collect());
    let current: launcher::Status = serde_json::from_value(value).unwrap();
    assert!(current.running);
    assert!(current.extension.is_none());
}

#[test]
fn optional_extension_cannot_push_a_legal_legacy_frame_over_the_old_size_limit() {
    let mut current = status();
    let base = serde_json::to_vec(&current).unwrap().len();
    current
        .progress
        .push_str(&"x".repeat(launcher::MAX_STATUS_BYTES - base));
    let legacy = serde_json::to_vec(&current).unwrap();
    assert_eq!(legacy.len(), launcher::MAX_STATUS_BYTES);
    current.extension = Some(extension());
    assert!(serde_json::to_vec(&current).unwrap().len() > launcher::MAX_STATUS_BYTES);
    let published = launcher::status_bytes(&current).unwrap();
    assert_eq!(published, legacy);
    let old: frozen::Status = serde_json::from_slice(&published).unwrap();
    assert!(old.running);
}

#[test]
fn checked_receipt_is_tolerated_by_the_frozen_terminal_reader_without_hiding_status() {
    let mut value = status();
    let mut ring = extension();
    ring.capabilities.push(Capability::RevisionCheckedLaunch);
    ring.accept("a".repeat(32).try_into().unwrap()).unwrap();
    value.extension = Some(ring);
    let bytes = launcher::status_bytes(&value).unwrap();
    let previous: frozen::Extended = serde_json::from_slice(&bytes).unwrap();
    assert!(previous.extension.is_none());
    let legacy: frozen::Status = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(
        serde_json::to_vec(&previous.legacy).unwrap(),
        serde_json::to_vec(&legacy).unwrap()
    );
    assert_eq!(previous.legacy.running, value.running);
    assert_eq!(previous.legacy.progress, value.progress);
}

#[test]
fn frozen_readers_keep_legacy_status_when_checked_answers_add_future_extension_data() {
    use launcher::answer::{AnswerRejection, OrderReceipt, QuestionScope};
    let mut current = status();
    let mut extension = extension();
    let run = extension.events[0].seq;
    extension.question = Some(QuestionScope {
        decision: "42".into(),
        run,
        revision: "b".repeat(64),
        account: "c".repeat(64).try_into().unwrap(),
    });
    extension.capabilities.push(Capability::CheckedAnswer);
    extension
        .record(EventKind::OrderReceived {
            request: "d".repeat(32).try_into().unwrap(),
            receipt: OrderReceipt::Rejected {
                reason: AnswerRejection::TrustRequiresEditor.into(),
            },
        })
        .unwrap();
    current.extension = Some(extension);
    let bytes = launcher::status_bytes(&current).unwrap();
    let old: frozen::Extended = serde_json::from_slice(&bytes).unwrap();
    assert!(old.extension.is_none());
    assert_eq!(old.legacy.version, current.version);
    assert_eq!(old.legacy.running, current.running);
    assert_eq!(old.legacy.progress, current.progress);
    assert_eq!(old.legacy.decision.unwrap().id, 42);
}

#[test]
fn active_control_scope_and_new_order_reason_do_not_hide_legacy_status() {
    use vantare_ipc::launcher::{
        answer::OrderReceipt,
        control::{OrderRejection, RunScope},
    };
    let mut current = status();
    let mut extension = extension();
    extension.capabilities.push(Capability::CheckedControl);
    let run = extension.begin().unwrap();
    extension.active = Some(RunScope {
        run,
        revision: "b".repeat(64),
        account: "c".repeat(64).try_into().unwrap(),
    });
    extension
        .record(EventKind::OrderReceived {
            request: "d".repeat(32).try_into().unwrap(),
            receipt: OrderReceipt::Rejected {
                reason: OrderRejection::NoSteps,
            },
        })
        .unwrap();
    current.extension = Some(extension);
    let bytes = launcher::status_bytes(&current).unwrap();
    let old: frozen::Extended = serde_json::from_slice(&bytes).unwrap();
    assert!(old.extension.is_none());
    assert_eq!(old.legacy.version, current.version);
    assert_eq!(old.legacy.running, current.running);
    assert_eq!(old.legacy.progress, current.progress);
    assert!(
        serde_json::from_slice::<launcher::Status>(&bytes)
            .unwrap()
            .extension
            .is_some()
    );
}

#[test]
fn a_results_summary_is_discarded_by_the_frozen_decoder_without_losing_legacy_status() {
    use vantare_ipc::launcher::results::{RunMode, RunResults, StepResult, StepState};
    let mut current = status();
    let mut extension = extension();
    extension.capabilities.push(Capability::StepResultsRetry);
    let run = extension.begin().unwrap();
    let outcome = ChainOutcome::Failed {
        reason: ChainFailure::StepFailed,
    };
    extension
        .record(EventKind::Finished { run, outcome })
        .unwrap();
    extension.results = Some(RunResults {
        run,
        profile: "qa".into(),
        revision: "b".repeat(64),
        account: "c".repeat(64).try_into().unwrap(),
        mode: RunMode::Rehearsal,
        outcome: Some(outcome),
        steps: vec![StepResult {
            index: 0,
            state: StepState::Failed,
        }],
    });
    current.extension = Some(extension);
    let bytes = launcher::status_bytes(&current).unwrap();
    let old: frozen::Extended = serde_json::from_slice(&bytes).unwrap();
    assert!(old.extension.is_none());
    assert_eq!(old.legacy.version, current.version);
    assert_eq!(old.legacy.running, current.running);
    assert_eq!(old.legacy.decision.unwrap().id, 42);
    assert!(
        serde_json::from_slice::<launcher::Status>(&bytes)
            .unwrap()
            .extension
            .unwrap()
            .results
            .is_some()
    );
}
