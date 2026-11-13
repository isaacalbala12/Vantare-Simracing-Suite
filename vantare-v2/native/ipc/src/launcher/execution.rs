//! Optional execution observations. A bad/future extension must not hide legacy Status.
use serde::{Deserialize, Serialize};

pub const EVENT_LIMIT: usize = 32;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct ResidentInstance(String);
impl TryFrom<String> for ResidentInstance {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        if value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            Ok(Self(value))
        } else {
            Err("invalid resident instance")
        }
    }
}
impl From<ResidentInstance> for String {
    fn from(value: ResidentInstance) -> Self {
        value.0
    }
}
/// Positive decimal on the wire, including values beyond JavaScript's exact integer range.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct RunId(u64);
impl TryFrom<String> for RunId {
    type Error = &'static str;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        value
            .parse::<u64>()
            .ok()
            .filter(|n| *n > 0 && n.to_string() == value)
            .map(Self)
            .ok_or("invalid execution sequence")
    }
}
impl From<RunId> for String {
    fn from(value: RunId) -> Self {
        value.0.to_string()
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Capability {
    TypedTerminal,
    RevisionCheckedLaunch,
    CheckedAnswer,
    #[serde(other)]
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChainFailure {
    StepFailed,
    DecisionExpired,
    CleanupFailed,
    WorkerPanicked,
    Internal,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CancelReason {
    User,
    Shutdown,
    TrustDeclined,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ChainOutcome {
    Completed,
    Failed { reason: ChainFailure },
    Cancelled { reason: CancelReason },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum EventKind {
    Started {
        run: RunId,
    },
    Received {
        request: super::RequestId,
        receipt: super::checked::LaunchReceipt,
    },
    Finished {
        run: RunId,
        outcome: ChainOutcome,
    },
    OrderReceived {
        request: super::RequestId,
        receipt: super::answer::OrderReceipt,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionEvent {
    pub seq: RunId,
    pub kind: EventKind,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExecutionStatus {
    pub instance: ResidentInstance,
    pub capabilities: Vec<Capability>,
    pub first_retained_seq: RunId,
    pub events: Vec<ExecutionEvent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub question: Option<super::answer::QuestionScope>,
}
impl ExecutionStatus {
    pub fn new(instance: ResidentInstance) -> Self {
        Self {
            instance,
            capabilities: vec![Capability::TypedTerminal],
            first_retained_seq: RunId(1),
            events: Vec::new(),
            question: None,
        }
    }
    fn next(&self) -> Option<RunId> {
        self.events
            .last()
            .map_or(Some(RunId(1)), |e| e.seq.0.checked_add(1).map(RunId))
    }
    pub fn record(&mut self, kind: EventKind) -> Option<RunId> {
        let seq = self.next()?;
        if self.events.len() == EVENT_LIMIT {
            self.events.remove(0);
        }
        self.events.push(ExecutionEvent { seq, kind });
        self.first_retained_seq = self.events[0].seq;
        Some(seq)
    }
    pub fn begin(&mut self) -> Option<RunId> {
        let run = self.next()?;
        run.0.checked_add(1)?; // A started chain must still have room for its terminal sequence.
        self.record(EventKind::Started { run })?;
        Some(run)
    }
    pub fn contains_request(&self, request: &super::RequestId) -> bool {
        self.events.iter().any(|event| {
            matches!(&event.kind,
            EventKind::Received { request: observed, .. }
            | EventKind::OrderReceived { request: observed, .. } if observed == request)
        })
    }
    pub fn accept(&mut self, request: super::RequestId) -> Option<RunId> {
        let run = self.next()?;
        run.0.checked_add(1)?;
        self.record(EventKind::Received {
            request,
            receipt: super::checked::LaunchReceipt::Accepted { run },
        })?;
        Some(run)
    }
    pub fn can_start(&self) -> bool {
        self.next().and_then(|seq| seq.0.checked_add(1)).is_some()
    }
    fn valid(&self) -> bool {
        self.question.as_ref().is_none_or(|q| {
            self.capabilities.contains(&Capability::CheckedAnswer)
                && self.events.last().is_some_and(|e| q.run <= e.seq)
        }) && self.events.len() <= EVENT_LIMIT
            && self.capabilities.len() <= EVENT_LIMIT
            && self.first_retained_seq == self.events.first().map_or(RunId(1), |e| e.seq)
            && self
                .events
                .windows(2)
                .all(|w| w[0].seq.0.checked_add(1) == Some(w[1].seq.0))
            && self.events.iter().all(|e| match e.kind {
                EventKind::Started { run } | EventKind::Finished { run, .. } => run <= e.seq,
                EventKind::OrderReceived { ref receipt, .. } => match receipt {
                    super::answer::OrderReceipt::Accepted { run } => *run <= e.seq,
                    super::answer::OrderReceipt::Rejected { .. } => true,
                },
                EventKind::Received { ref receipt, .. } => match receipt {
                    super::checked::LaunchReceipt::Accepted { run } => *run <= e.seq,
                    super::checked::LaunchReceipt::Rejected { .. } => true,
                },
            })
    }
}
pub(super) fn deserialize_extension<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<ExecutionStatus>, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(serde_json::from_value::<ExecutionStatus>(value)
        .ok()
        .filter(ExecutionStatus::valid))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ring_is_bounded_non_consuming_and_sequences_never_reuse_evicted_ids() {
        let mut status = ExecutionStatus::new("a".repeat(64).try_into().unwrap());
        let first = RunId(1);
        for _ in 0..41 {
            let run = status.begin().unwrap();
            status
                .record(EventKind::Finished {
                    run,
                    outcome: ChainOutcome::Completed,
                })
                .unwrap();
        }
        assert_eq!(status.events.len(), EVENT_LIMIT);
        assert_eq!(String::from(status.first_retained_seq), "51");
        let saved = status.clone();
        assert_eq!(
            serde_json::to_vec(&status).unwrap(),
            serde_json::to_vec(&saved).unwrap()
        );
        assert_eq!(status.events, saved.events);
        assert!(status.valid());
        let next = status.begin().unwrap();
        assert!(next > first);
    }
    #[test]
    fn execution_ids_round_trip_as_exact_canonical_decimal_strings() {
        for value in [1, 9_007_199_254_740_993, u64::MAX] {
            let id: RunId = value.to_string().try_into().unwrap();
            let json = serde_json::to_value(id).unwrap();
            assert_eq!(json, serde_json::Value::String(value.to_string()));
            assert_eq!(serde_json::from_value::<RunId>(json).unwrap(), id);
        }
        for invalid in ["0", "01", "-1", "1.0", "1e3", "18446744073709551616"] {
            assert!(RunId::try_from(invalid.to_owned()).is_err());
        }
        let mut status = ExecutionStatus::new("a".repeat(64).try_into().unwrap());
        let max: RunId = u64::MAX.to_string().try_into().unwrap();
        status.events.push(ExecutionEvent {
            seq: max,
            kind: EventKind::Started { run: max },
        });
        status.first_retained_seq = max;
        assert!(status.begin().is_none());
    }
}
