//! Closed projection only; no diagnostics, arguments, commands or profile document.
use serde::{Deserialize, Serialize};
#[cfg(any(test, feature = "bindings"))]
use ts_rs::TS;
use vantare_ipc::launcher::{execution as native, checked as checked_native};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentFailure { StepFailed, DecisionExpired, CleanupFailed, WorkerPanicked, Internal }
impl From<native::ChainFailure> for ResidentFailure { fn from(value: native::ChainFailure) -> Self { match value { native::ChainFailure::StepFailed => Self::StepFailed,native::ChainFailure::DecisionExpired => Self::DecisionExpired,native::ChainFailure::CleanupFailed => Self::CleanupFailed,native::ChainFailure::WorkerPanicked => Self::WorkerPanicked,native::ChainFailure::Internal => Self::Internal, } } }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentCancellation { User, Shutdown, TrustDeclined }
impl From<native::CancelReason> for ResidentCancellation { fn from(value: native::CancelReason) -> Self { match value { native::CancelReason::User => Self::User,native::CancelReason::Shutdown => Self::Shutdown,native::CancelReason::TrustDeclined => Self::TrustDeclined, } } }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "kebab-case")]
pub enum ResidentRejection { Busy, WrongInstance, RevisionMismatch, DocumentUnavailable, AccountChanged, AuthorityUnavailable, Denied, StartFailed }
impl From<checked_native::LaunchRejection> for ResidentRejection { fn from(value: checked_native::LaunchRejection) -> Self { match value { checked_native::LaunchRejection::Busy => Self::Busy,checked_native::LaunchRejection::WrongInstance => Self::WrongInstance,checked_native::LaunchRejection::RevisionMismatch => Self::RevisionMismatch,checked_native::LaunchRejection::DocumentUnavailable => Self::DocumentUnavailable,checked_native::LaunchRejection::AccountChanged => Self::AccountChanged,checked_native::LaunchRejection::AuthorityUnavailable => Self::AuthorityUnavailable,checked_native::LaunchRejection::Denied => Self::Denied,checked_native::LaunchRejection::StartFailed => Self::StartFailed, } } }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentOutcome { Completed, Failed { reason: ResidentFailure }, Cancelled { reason: ResidentCancellation } }
impl From<native::ChainOutcome> for ResidentOutcome {
 fn from(value: native::ChainOutcome) -> Self { match value {
 native::ChainOutcome::Completed=>Self::Completed,
 native::ChainOutcome::Failed{reason}=>Self::Failed{reason:reason.into()},
 native::ChainOutcome::Cancelled{reason}=>Self::Cancelled{reason:reason.into()},
 } }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentReceipt { Accepted { run: String }, Rejected { reason: ResidentRejection } }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ResidentEventKind { Started { run: String }, Received { request: String, receipt: ResidentReceipt }, Finished { run: String, outcome: ResidentOutcome } }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentExecutionEvent { pub seq: String, pub kind: ResidentEventKind }
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(any(test, feature = "bindings"), derive(TS))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResidentExecution {
 pub instance: String,
 pub revision_checked_launch: bool,
 pub first_retained_seq: String,
 pub events: Vec<ResidentExecutionEvent>,
}
impl From<&native::ExecutionStatus> for ResidentExecution {
 fn from(value: &native::ExecutionStatus) -> Self {
  Self {
   instance: value.instance.clone().into(),
   revision_checked_launch: value.capabilities.contains(&native::Capability::RevisionCheckedLaunch),
   first_retained_seq: value.first_retained_seq.into(),
   events: value.events.iter().map(|event| ResidentExecutionEvent { seq: event.seq.into(), kind: match &event.kind {
    native::EventKind::Started{run}=>ResidentEventKind::Started{run:(*run).into()},
    native::EventKind::Received{request,receipt}=>ResidentEventKind::Received{request:request.clone().into(),receipt: match receipt {
     checked_native::LaunchReceipt::Accepted{run}=>ResidentReceipt::Accepted{run:(*run).into()},
     checked_native::LaunchReceipt::Rejected{reason}=>ResidentReceipt::Rejected{reason:(*reason).into()},
    }},
    native::EventKind::Finished{run,outcome}=>ResidentEventKind::Finished{run:(*run).into(),outcome:(*outcome).into()},
   }}).collect(),
  }
 }
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test]
 fn projection_preserves_cursor_receipts_and_all_typed_outcomes_without_private_data() {
  let mut status=native::ExecutionStatus::new("b".repeat(64).try_into().unwrap());
  let request=vantare_ipc::launcher::RequestId::try_from("a".repeat(32)).unwrap();
  let run=status.accept(request.clone()).unwrap();
  for outcome in [native::ChainOutcome::Completed,native::ChainOutcome::Failed{reason:native::ChainFailure::StepFailed},native::ChainOutcome::Cancelled{reason:native::CancelReason::TrustDeclined}] {
   status.record(native::EventKind::Finished{run,outcome}).unwrap();
  }
  let view=ResidentExecution::from(&status);
  assert_eq!(view.events.len(),4);
  assert!(matches!(&view.events[0].kind,ResidentEventKind::Received{request:r,receipt:ResidentReceipt::Accepted{run:r2}} if r==&String::from(request) && r2==&String::from(run)));
  assert!(matches!(view.events[1].kind,ResidentEventKind::Finished{outcome:ResidentOutcome::Completed,..}));
  assert!(matches!(view.events[2].kind,ResidentEventKind::Finished{outcome:ResidentOutcome::Failed{..},..}));
  assert!(matches!(view.events[3].kind,ResidentEventKind::Finished{outcome:ResidentOutcome::Cancelled{..},..}));
  let saved=serde_json::to_vec(&view).unwrap();assert_eq!(saved,serde_json::to_vec(&ResidentExecution::from(&status)).unwrap());
  for _ in 0..32 {status.record(native::EventKind::Received{request:"c".repeat(32).try_into().unwrap(),receipt:checked_native::LaunchReceipt::Rejected{reason:checked_native::LaunchRejection::Busy}}).unwrap();}
  let view=ResidentExecution::from(&status);
  assert_eq!(view.events.len(),32);assert_eq!(view.first_retained_seq,"5");
  assert!(serde_json::to_vec(&view).unwrap().len()<16*1024);
  assert!(!status.contains_request(&"a".repeat(32).try_into().unwrap()),"evicted receipt is Unknown, never Completed");
 }
}
