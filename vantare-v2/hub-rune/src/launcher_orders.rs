//! Observe native receipts; a mailbox acknowledgement is never a terminal result.
use vantare_hub_host::{
    launcher::LauncherView,
    launcher_resident::*,
    protocol::{CoreStatus, HostError, LinkState, Request},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Phase {
    Sending,
    Queued { request: String },
    Accepted { run: String },
    Rejected,
    Unknown,
    Finished(ResidentOutcome),
}
pub struct Attempt {
    pub intent: Request,
    pub phase: Phase,
    instance: String,
    account: String,
    cursor: u64,
    receipt_due: Option<f64>,
}
#[derive(Default)]
pub struct Orders {
    pub view: Option<ResidentView>,
    pub attempt: Option<Attempt>,
}
impl Orders {
    pub fn in_flight(&self) -> bool {
        self.attempt.as_ref().is_some_and(|a| {
            matches!(
                a.phase,
                Phase::Sending | Phase::Queued { .. } | Phase::Accepted { .. }
            )
        })
    }
    pub fn busy(&self) -> bool {
        self.attempt.as_ref().is_some_and(|a| {
            matches!(
                a.phase,
                Phase::Sending | Phase::Queued { .. } | Phase::Accepted { .. } | Phase::Unknown
            )
        })
    }
    pub fn notice(&self) -> Option<&'static str> {
        Some(match &self.attempt.as_ref()?.phase {
            Phase::Sending => "control.sending",
            Phase::Queued { .. } => "control.queued",
            Phase::Accepted { .. } => "control.accepted",
            Phase::Rejected => "control.rejected",
            Phase::Unknown => "control.unknown",
            Phase::Finished(ResidentOutcome::Completed) => "control.completed",
            Phase::Finished(ResidentOutcome::Cancelled { .. }) => "control.cancelled",
            Phase::Finished(ResidentOutcome::Failed { .. }) => "control.failed",
        })
    }
    fn execution(&self, core: &CoreStatus) -> Option<&ResidentExecution> {
        let view = self.view.as_ref()?;
        (view.online
            && !view.protected
            && core.services == LinkState::Connected
            && core.account_generation.is_some())
        .then_some(view.execution.as_ref()?)
    }
    fn idle<'a>(
        &'a self,
        doc: &'a LauncherView,
        core: &CoreStatus,
    ) -> Option<&'a ResidentExecution> {
        let e = self.execution(core)?;
        (!self.busy()
            && !self.view.as_ref()?.running
            && e.active.is_none()
            && doc.exists
            && !doc.protected
            && !doc.scanning
            && !doc.running
            && core.access.verified
            && !core.access.blocked
            && !core.live)
            .then_some(e)
    }
    pub fn launch(&self, id: &str, doc: &LauncherView, core: &CoreStatus) -> Option<Request> {
        let e = self.idle(doc, core)?;
        if !e.revision_checked_launch || !doc.profiles.iter().any(|p| p.id == id && p.launchable) {
            return None;
        }
        Some(Request::LauncherLaunchChecked {
            profile: id.into(),
            base_revision: doc.revision.clone(),
            armed_generation: core.account_generation.clone()?,
        })
    }
    pub fn rehearse(&self, id: &str, doc: &LauncherView, core: &CoreStatus) -> Option<Request> {
        let e = self.idle(doc, core)?;
        if !e.checked_control
            || !doc
                .profiles
                .iter()
                .any(|p| p.id == id && p.apps.iter().any(|a| a != "lmu"))
        {
            return None;
        }
        Some(Request::LauncherResidentRehearse {
            target: ResidentRehearseTarget {
                instance: e.instance.clone(),
                account_generation: core.account_generation.clone()?,
                profile: id.into(),
                revision: doc.revision.clone(),
            },
        })
    }
    pub fn cancel(&self, core: &CoreStatus) -> Option<Request> {
        let e = self.execution(core)?;
        let active = e.active.as_ref()?;
        if !e.checked_control
            || !self.view.as_ref()?.running
            || Some(&active.account_generation) != core.account_generation.as_ref()
        {
            return None;
        }
        if self.attempt.as_ref().is_some_and(|a| matches!(a.phase, Phase::Sending | Phase::Queued { .. }) || (matches!(&a.intent, Request::LauncherResidentCancel { target } if target.run == active.run) && self.busy())) { return None; }
        Some(Request::LauncherResidentCancel {
            target: ResidentCancelTarget {
                instance: e.instance.clone(),
                account_generation: active.account_generation.clone(),
                run: active.run.clone(),
                revision: active.revision.clone(),
            },
        })
    }
    pub fn answer(&self, action: ResidentAction, core: &CoreStatus) -> Option<Request> {
        let e = self.execution(core)?;
        let view = self.view.as_ref()?;
        let question = e.question.as_ref()?;
        if action == ResidentAction::Trust
            || !e.checked_answer
            || Some(&question.account_generation) != core.account_generation.as_ref()
            || !view.decision.as_ref().is_some_and(|d| {
                d.id == question.decision && d.actions.iter().any(|a| a.id == action)
            })
        {
            return None;
        }
        if self.attempt.as_ref().is_some_and(|a| matches!(a.phase, Phase::Sending | Phase::Queued { .. }) || (matches!(&a.intent, Request::LauncherResidentAnswer { target } if target.decision == question.decision && target.run == question.run) && self.busy())) { return None; }
        Some(Request::LauncherResidentAnswer {
            target: ResidentAnswerTarget {
                instance: e.instance.clone(),
                account_generation: question.account_generation.clone(),
                run: question.run.clone(),
                revision: question.revision.clone(),
                decision: question.decision.clone(),
                action,
            },
        })
    }
    pub fn retry(
        &self,
        scope: ResidentRetryScope,
        doc: &LauncherView,
        core: &CoreStatus,
    ) -> Option<Request> {
        if self.retry_reason(scope, doc, core).is_some() {
            return None;
        }
        let e = self.idle(doc, core)?;
        let ResidentResults::Known { value } = &e.results else {
            return None;
        };
        let outcome = value.outcome.as_ref()?;
        if value.revision != doc.revision || Some(&value.account_generation) != core.account_generation.as_ref() || !doc.profiles.iter().any(|p| p.id == value.profile) || (scope == ResidentRetryScope::Failed && !value.retry_failed) || !e.events.iter().any(|e| matches!(&e.kind, ResidentEventKind::Finished { run, outcome: terminal } if *run == value.run && terminal == outcome)) { return None; }
        Some(Request::LauncherResidentRetry {
            target: ResidentRetryTarget {
                instance: e.instance.clone(),
                account_generation: value.account_generation.clone(),
                run: value.run.clone(),
                profile: value.profile.clone(),
                revision: value.revision.clone(),
                scope,
            },
        })
    }
    pub fn retry_reason(
        &self,
        scope: ResidentRetryScope,
        doc: &LauncherView,
        core: &CoreStatus,
    ) -> Option<&'static str> {
        let Some(e) = self.execution(core) else {
            return Some("control.unavailable");
        };
        let value = match &e.results {
            ResidentResults::Unsupported => return Some("control.unsupported"),
            ResidentResults::Unknown => return Some("results.unavailable"),
            ResidentResults::Known { value } => value,
        };
        if self.busy()
            || self.view.as_ref().is_some_and(|v| v.running)
            || e.active.is_some()
            || doc.running
        {
            return Some("control.busy");
        }
        if !core.access.verified || core.access.blocked || core.live {
            return Some("control.denied");
        }
        if doc.scanning {
            return Some("control.scanning");
        }
        if Some(&value.account_generation) != core.account_generation.as_ref() {
            return Some("control.account");
        }
        if !doc.exists
            || doc.protected
            || doc.revision != value.revision
            || !doc.profiles.iter().any(|p| p.id == value.profile)
        {
            return Some("control.changed");
        }
        let Some(outcome) = &value.outcome else {
            return Some("control.busy");
        };
        if !e.events.iter().any(|event| matches!(&event.kind, ResidentEventKind::Finished { run, outcome: terminal } if *run == value.run && terminal == outcome)) { return Some("control.resultUnknown"); }
        if scope == ResidentRetryScope::Failed && !value.retry_failed {
            return Some("control.noFailed");
        }
        None
    }
    pub fn allowed(&self, request: &Request, doc: &LauncherView, core: &CoreStatus) -> bool {
        let expected = match request {
            Request::LauncherLaunchChecked { profile, .. } => self.launch(profile, doc, core),
            Request::LauncherResidentRehearse { target } => {
                self.rehearse(&target.profile, doc, core)
            }
            Request::LauncherResidentCancel { .. } => self.cancel(core),
            Request::LauncherResidentAnswer { target } => self.answer(target.action, core),
            Request::LauncherResidentRetry { target } => self.retry(target.scope, doc, core),
            _ => None,
        };
        expected.as_ref() == Some(request)
    }
    pub fn begin(&mut self, intent: Request, core: &CoreStatus) -> bool {
        let Some(e) = self.execution(core) else {
            return false;
        };
        let Some(cursor) = cursor(e) else {
            return false;
        };
        self.attempt = Some(Attempt {
            intent,
            phase: Phase::Sending,
            instance: e.instance.clone(),
            account: core.account_generation.clone().unwrap_or_default(),
            cursor,
            receipt_due: None,
        });
        true
    }
    pub fn queued(&mut self, request: String, now: f64) {
        if let Some(a) = &mut self.attempt
            && a.phase == Phase::Sending
        {
            a.phase = Phase::Queued { request };
            a.receipt_due =
                Some(now + vantare_hub_host::calendar::launch_types::RECEIPT_MS as f64 / 1000.0);
        }
    }
    pub fn failed(&mut self, error: &HostError) {
        if let Some(a) = &mut self.attempt
            && a.phase == Phase::Sending
        {
            a.phase = match error {
                // Busy/Denied are explicit host rejections before dispatch; ambiguous
                // transport/version failures cannot prove that an order was not applied.
                HostError::ResidentAnswerRejected { .. }
                | HostError::ResidentControlRejected { .. }
                | HostError::Denied
                | HostError::Rejected
                | HostError::Unsupported
                | HostError::Busy
                | HostError::Protected
                | HostError::LauncherConflict { .. } => Phase::Rejected,
                _ => Phase::Unknown,
            };
        }
    }
    pub fn due(&self) -> Option<f64> {
        self.attempt.as_ref()?.receipt_due
    }
    pub fn observe(&mut self, now: f64, core: &CoreStatus, doc: Option<&LauncherView>) -> bool {
        let Some(a) = &mut self.attempt else {
            return false;
        };
        let before = a.phase.clone();
        let revision = match &a.intent {
            Request::LauncherLaunchChecked { base_revision, .. } => Some(base_revision),
            Request::LauncherResidentRehearse { target } => Some(&target.revision),
            Request::LauncherResidentRetry { target } => Some(&target.revision),
            _ => None,
        };
        if a.phase == Phase::Unknown
            && (self
                .view
                .as_ref()
                .and_then(|v| v.execution.as_ref())
                .is_some_and(|e| e.instance != a.instance)
                || revision.is_some_and(|r| doc.is_some_and(|d| d.revision != *r)))
        {
            self.attempt = None;
            return true;
        }
        if core.account_generation.as_ref() != Some(&a.account) {
            self.attempt = None;
            return true;
        }
        if matches!(
            a.phase,
            Phase::Sending | Phase::Queued { .. } | Phase::Accepted { .. }
        ) {
            advance(a, self.view.as_ref(), now, core);
        }
        if !matches!(a.phase, Phase::Queued { .. }) {
            a.receipt_due = None;
        }
        before != a.phase
    }
}
fn cursor(e: &ResidentExecution) -> Option<u64> {
    e.events.last().map_or_else(
        || e.first_retained_seq.parse::<u64>().ok()?.checked_sub(1),
        |v| v.seq.parse().ok(),
    )
}
#[cfg(any(test, debug_assertions))]
pub fn scene() -> ResidentView {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../hub-web/src/contract/generated/corpus/launcher_resident.json"
    ))
    .expect("shared resident corpus");
    serde_json::from_value(
        corpus["host"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["result"]["method"] == "launcher.resident.get")
            .unwrap()["result"]["value"]
            .clone(),
    )
    .unwrap()
}
fn advance(a: &mut Attempt, view: Option<&ResidentView>, now: f64, core: &CoreStatus) {
    let Some(v) =
        view.filter(|v| v.online && !v.protected && core.services == LinkState::Connected)
    else {
        a.phase = Phase::Unknown;
        return;
    };
    let Some(e) = v.execution.as_ref().filter(|e| e.instance == a.instance) else {
        a.phase = Phase::Unknown;
        return;
    };
    let supported = match a.intent {
        Request::LauncherLaunchChecked { .. } => e.revision_checked_launch,
        Request::LauncherResidentAnswer { .. } => e.checked_answer,
        Request::LauncherResidentRetry { .. } => !matches!(e.results, ResidentResults::Unsupported),
        _ => e.checked_control,
    };
    if !supported
        || a.receipt_due.is_some_and(|due| now >= due)
        || e.first_retained_seq
            .parse::<u64>()
            .ok()
            .is_none_or(|first| first > a.cursor.saturating_add(1))
        || cursor(e).is_none_or(|last| last < a.cursor)
    {
        a.phase = Phase::Unknown;
        return;
    }
    if a.phase == Phase::Sending {
        return;
    }
    for event in &e.events {
        let Ok(seq) = event.seq.parse::<u64>() else {
            a.phase = Phase::Unknown;
            return;
        };
        if seq <= a.cursor {
            continue;
        }
        if seq != a.cursor.saturating_add(1) {
            a.phase = Phase::Unknown;
            return;
        }
        a.cursor = seq;
        match (&a.phase, &event.kind) {
            (
                Phase::Queued { request },
                ResidentEventKind::Received {
                    request: received,
                    receipt,
                },
            ) if request == received
                && matches!(a.intent, Request::LauncherLaunchChecked { .. }) =>
            {
                a.phase = match receipt {
                    ResidentReceipt::Accepted { run } => Phase::Accepted { run: run.clone() },
                    ResidentReceipt::Rejected { .. } => Phase::Rejected,
                };
            }
            (
                Phase::Queued { request },
                ResidentEventKind::OrderReceived {
                    request: received,
                    receipt,
                },
            ) if request == received
                && !matches!(a.intent, Request::LauncherLaunchChecked { .. }) =>
            {
                a.phase = match receipt {
                    ResidentOrderReceipt::Rejected { .. } => Phase::Rejected,
                    ResidentOrderReceipt::Accepted { run } => {
                        let valid = match &a.intent {
                            Request::LauncherResidentAnswer { target } => target.run == *run,
                            Request::LauncherResidentCancel { target } => target.run == *run,
                            Request::LauncherResidentRetry { target } => target.run != *run,
                            _ => true,
                        };
                        if valid {
                            Phase::Accepted { run: run.clone() }
                        } else {
                            Phase::Unknown
                        }
                    }
                };
            }
            (
                Phase::Accepted { run },
                ResidentEventKind::Finished {
                    run: finished,
                    outcome,
                },
            ) if run == finished => {
                a.phase = Phase::Finished(outcome.clone());
                return;
            }
            _ => {}
        }
        if matches!(a.phase, Phase::Unknown | Phase::Rejected) {
            return;
        }
    }
    if let Phase::Accepted { run } = &a.phase
        && (!v.running || e.active.as_ref().is_none_or(|active| active.run != *run))
    {
        a.phase = Phase::Unknown;
    }
}
