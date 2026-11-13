//! Volatile intentions and receipt correlation. IO and clocks are supplied by the host.
use super::launch_types::{
    CLOCK_SKEW_MS, CalendarLaunchAttempt, CalendarLaunchChange, CalendarLaunchMode,
    CalendarLaunchPlan, CalendarLaunchProgress, CalendarLaunchStop, CalendarLaunchUnknown,
    CalendarLaunchView, LEAD_MS, MAX_FUTURE_MS, RECEIPT_MS,
};
use crate::{
    launcher::checked::LaunchQueued,
    launcher_resident::{ResidentEventKind, ResidentReceipt, ResidentView},
    protocol::{CoreStatus, HostError, LinkState},
};
use std::time::{Duration, Instant};
#[derive(Clone, Copy)]
pub struct Clock {
    pub wall: i64,
    pub monotonic: Instant,
}
#[derive(Clone)]
pub struct Binding {
    pub plan: CalendarLaunchPlan,
    pub revision: String,
    pub generation: String,
    pub instance: String,
    deadline: Option<Instant>,
    since: i64,
}
impl Binding {
    pub fn new(
        plan: CalendarLaunchPlan,
        revision: String,
        generation: String,
        instance: String,
        now: Clock,
    ) -> Result<Self, HostError> {
        let deadline = match &plan.mode {
            CalendarLaunchMode::Once { start_at, .. } => {
                let delay = start_at
                    .checked_sub(LEAD_MS)
                    .and_then(|fire| fire.checked_sub(now.wall))
                    .filter(|delay| (0..=MAX_FUTURE_MS).contains(delay))
                    .ok_or(HostError::Rejected)?;
                Some(
                    now.monotonic
                        .checked_add(Duration::from_millis(delay.cast_unsigned()))
                        .ok_or(HostError::Rejected)?,
                )
            }
            CalendarLaunchMode::Alerts { .. } => None,
        };
        Ok(Self {
            plan,
            revision,
            generation,
            instance,
            deadline,
            since: now.wall,
        })
    }
}
#[derive(Clone)]
pub struct Candidate {
    pub series_id: String,
    pub start_at: i64,
}
pub struct Due {
    pub binding: Binding,
    pub candidate: Candidate,
}
struct Pending {
    generation: String,
    instance: String,
    request: String,
    run: Option<String>,
    cursor: u64,
    sent: Instant,
}
#[derive(Clone, Copy)]
pub struct Inputs<'a> {
    pub core: &'a CoreStatus,
    pub closing: bool,
    pub resident: &'a ResidentView,
    pub alerts_ready: bool,
    pub auto_enabled: bool,
    pub candidates: &'a [Candidate],
}
#[derive(Default)]
pub struct Scheduler {
    armed: Option<Binding>,
    automatic: Option<Binding>,
    latest: Option<CalendarLaunchAttempt>,
    change: Option<CalendarLaunchChange>,
    pending: Option<Pending>,
    clock: Option<Clock>,
    resident: Option<(Instant, ResidentView)>,
}
impl Scheduler {
    pub fn view(&self) -> CalendarLaunchView {
        CalendarLaunchView {
            armed: self.armed.as_ref().map(|v| v.plan.clone()),
            automatic: self.automatic.as_ref().map(|v| v.plan.clone()),
            latest: self.latest.clone(),
            change: self.change.clone(),
        }
    }
    pub fn active(&self) -> bool {
        self.armed.is_some() || self.automatic.is_some() || self.pending.is_some()
    }
    pub fn automatic_since(&self) -> Option<i64> {
        self.automatic.as_ref().map(|b| b.since)
    }
    pub fn resident(&mut self, now: Instant, read: impl FnOnce() -> ResidentView) -> ResidentView {
        if self.resident.as_ref().is_none_or(|(old, _)| {
            now.saturating_duration_since(*old) >= Duration::from_millis(500)
        }) {
            self.resident = Some((now, read()));
        }
        self.resident
            .as_ref()
            .map(|(_, v)| v.clone())
            .unwrap_or_default()
    }
    pub fn install(&mut self, binding: Binding, now: Clock) {
        let first = !self.active();
        let slot = if matches!(binding.plan.mode, CalendarLaunchMode::Once { .. }) {
            &mut self.armed
        } else {
            &mut self.automatic
        };
        self.change = slot.replace(binding).map(|old| CalendarLaunchChange {
            plan: old.plan,
            reason: CalendarLaunchStop::Replaced,
        });
        if first {
            self.clock = Some(now);
        }
    }
    pub fn cancel(&mut self, id: &str) {
        if self.armed.as_ref().is_some_and(|b| b.plan.arm_id == id) {
            self.stop_once(CalendarLaunchStop::User);
        }
        if self.automatic.as_ref().is_some_and(|b| b.plan.arm_id == id) {
            self.stop_auto(CalendarLaunchStop::User);
        }
    }
    fn stop_once(&mut self, reason: CalendarLaunchStop) {
        if let Some(old) = self.armed.take() {
            self.change = Some(CalendarLaunchChange {
                plan: old.plan,
                reason,
            });
        }
    }
    fn stop_auto(&mut self, reason: CalendarLaunchStop) {
        if let Some(old) = self.automatic.take() {
            self.change = Some(CalendarLaunchChange {
                plan: old.plan,
                reason,
            });
        }
    }
    pub fn close(&mut self) {
        self.stop_once(CalendarLaunchStop::HubClosed);
        self.stop_auto(CalendarLaunchStop::HubClosed);
        self.unknown(CalendarLaunchUnknown::ScopeLost);
    }
    fn unknown(&mut self, reason: CalendarLaunchUnknown) {
        if let Some(pending) = self.pending.take()
            && let Some(latest) = self.latest.as_mut()
        {
            latest.progress = CalendarLaunchProgress::Unknown {
                request: Some(pending.request),
                reason,
            };
        }
    }
    pub fn step(&mut self, inputs: Inputs<'_>, now: Clock) -> Option<Due> {
        if !self.revalidate(&inputs, now) {
            return None;
        }
        self.take_due(inputs.candidates, now)
    }
    fn revalidate(&mut self, inputs: &Inputs<'_>, now: Clock) -> bool {
        let Inputs {
            core,
            closing,
            resident,
            alerts_ready,
            auto_enabled,
            ..
        } = *inputs;

        let scope = |binding: &Binding| {
            scope_stop(core, closing, &binding.generation).or_else(|| {
                (!resident.online
                    || resident.protected
                    || resident.execution.as_ref().is_none_or(|e| {
                        !e.revision_checked_launch || e.instance != binding.instance
                    }))
                .then_some(CalendarLaunchStop::ResidentUnavailable)
            })
        };
        if let Some(reason) = self.armed.as_ref().and_then(scope) {
            self.stop_once(reason);
        }
        if let Some(reason) = self.automatic.as_ref().and_then(scope) {
            self.stop_auto(reason);
        }
        if self
            .pending
            .as_ref()
            .is_some_and(|p| scope_stop(core, closing, &p.generation).is_some())
        {
            self.unknown(CalendarLaunchUnknown::ScopeLost);
        }
        self.observe_receipts(resident, now.monotonic);
        if self.automatic.is_some() && !alerts_ready {
            self.stop_auto(CalendarLaunchStop::AlertsUnavailable);
        }
        if self.automatic.is_some() && !auto_enabled {
            self.stop_auto(CalendarLaunchStop::Disabled);
        }
        let jumped = self.clock.is_some_and(|old| {
            let elapsed = i64::try_from(
                now.monotonic
                    .saturating_duration_since(old.monotonic)
                    .as_millis(),
            )
            .unwrap_or(i64::MAX);
            now.wall
                .checked_sub(old.wall)
                .and_then(|wall| wall.checked_sub(elapsed))
                .is_none_or(|difference| difference.unsigned_abs() > CLOCK_SKEW_MS.cast_unsigned())
        });
        self.clock = Some(now);
        if jumped {
            self.stop_once(CalendarLaunchStop::ClockChanged);
            self.stop_auto(CalendarLaunchStop::ClockChanged);
            return false;
        }
        true
    }
    fn take_due(&mut self, candidates: &[Candidate], now: Clock) -> Option<Due> {
        let automatic = self.automatic.as_mut().and_then(|binding| {
            let since = binding.since;
            binding.since = since.max(now.wall);
            candidates
                .iter()
                .filter(|c| {
                    c.start_at > now.wall
                        && c.start_at - LEAD_MS > since
                        && c.start_at - LEAD_MS <= now.wall
                })
                .min_by(|a, b| {
                    a.start_at
                        .cmp(&b.start_at)
                        .then_with(|| a.series_id.cmp(&b.series_id))
                })
                .map(|candidate| Due {
                    binding: binding.clone(),
                    candidate: candidate.clone(),
                })
        });
        let manual = self
            .armed
            .as_ref()
            .and_then(|binding| match &binding.plan.mode {
                CalendarLaunchMode::Once {
                    series_id,
                    start_at,
                } if now.wall >= *start_at - LEAD_MS
                    && binding
                        .deadline
                        .is_some_and(|deadline| now.monotonic >= deadline) =>
                {
                    Some(Candidate {
                        series_id: series_id.clone(),
                        start_at: *start_at,
                    })
                }
                _ => None,
            });
        let due = if let Some(candidate) = manual {
            let binding = self.armed.take()?;
            if candidate.start_at <= now.wall {
                self.change = Some(CalendarLaunchChange {
                    plan: binding.plan,
                    reason: CalendarLaunchStop::Expired,
                });
                return None;
            }
            Some(Due { binding, candidate })
        } else {
            automatic
        };
        if self.pending.is_some() {
            if let Some(due) = due {
                self.change = Some(CalendarLaunchChange {
                    plan: due.binding.plan,
                    reason: CalendarLaunchStop::Busy,
                });
            }
            return None;
        }
        due
    }
    pub fn sent(
        &mut self,
        due: Due,
        result: Result<LaunchQueued, HostError>,
        resident: &ResidentView,
        now: Instant,
    ) {
        let progress = match result {
            Ok(LaunchQueued::Queued { request }) => {
                let cursor = resident
                    .execution
                    .as_ref()
                    .and_then(|e| {
                        e.events.last().map_or_else(
                            || {
                                e.first_retained_seq
                                    .parse::<u64>()
                                    .ok()
                                    .map(|n| n.saturating_sub(1))
                            },
                            |event| event.seq.parse().ok(),
                        )
                    })
                    .unwrap_or(0);
                self.pending = Some(Pending {
                    generation: due.binding.generation,
                    instance: due.binding.instance,
                    request: request.clone(),
                    run: None,
                    cursor,
                    sent: now,
                });
                CalendarLaunchProgress::Queued { request }
            }
            Err(HostError::Io) => CalendarLaunchProgress::Unknown {
                request: None,
                reason: CalendarLaunchUnknown::UnconfirmedWrite,
            },
            Err(error) => {
                let reason = match error {
                    HostError::LauncherConflict { .. } => CalendarLaunchStop::RevisionChanged,
                    HostError::Busy => CalendarLaunchStop::Busy,
                    HostError::CalendarScheduleUnavailable => {
                        CalendarLaunchStop::ScheduleUnavailable
                    }
                    HostError::Denied => CalendarLaunchStop::RightsLost,
                    HostError::CoreUnavailable | HostError::Unsupported => {
                        CalendarLaunchStop::ResidentUnavailable
                    }
                    _ => CalendarLaunchStop::Io,
                };
                if reason != CalendarLaunchStop::Busy {
                    self.stop_auto(reason);
                }
                CalendarLaunchProgress::NotSent { reason }
            }
        };
        self.latest = Some(CalendarLaunchAttempt {
            arm_id: due.binding.plan.arm_id,
            profile_name: due.binding.plan.profile_name,
            series_id: due.candidate.series_id,
            start_at: due.candidate.start_at,
            progress,
        });
    }
    fn observe_receipts(&mut self, resident: &ResidentView, now: Instant) {
        let Some(pending) = self.pending.as_mut() else {
            return;
        };
        let Some(execution) = resident
            .execution
            .as_ref()
            .filter(|e| resident.online && e.revision_checked_launch)
        else {
            self.unknown(CalendarLaunchUnknown::ResidentUnavailable);
            return;
        };
        if execution.instance != pending.instance {
            self.unknown(CalendarLaunchUnknown::ResidentRestarted);
            return;
        }
        let Some(first) = execution.first_retained_seq.parse::<u64>().ok() else {
            self.unknown(CalendarLaunchUnknown::RingGap);
            return;
        };
        if first > pending.cursor.saturating_add(1) {
            self.unknown(CalendarLaunchUnknown::RingGap);
            return;
        }
        let mut terminal = false;
        for event in &execution.events {
            let Some(seq) = event.seq.parse::<u64>().ok() else {
                self.unknown(CalendarLaunchUnknown::RingGap);
                return;
            };
            if seq <= pending.cursor {
                continue;
            }
            if seq != pending.cursor.saturating_add(1) {
                self.unknown(CalendarLaunchUnknown::RingGap);
                return;
            }
            pending.cursor = seq;
            let progress = match &event.kind {
                ResidentEventKind::Received { request, receipt } if *request == pending.request => {
                    match receipt {
                        ResidentReceipt::Accepted { run } => {
                            pending.run = Some(run.clone());
                            Some(CalendarLaunchProgress::Running {
                                request: request.clone(),
                                run: run.clone(),
                            })
                        }
                        ResidentReceipt::Rejected { reason } => {
                            terminal = true;
                            Some(CalendarLaunchProgress::Rejected {
                                request: request.clone(),
                                reason: reason.clone(),
                            })
                        }
                    }
                }
                ResidentEventKind::Finished { run, outcome }
                    if pending.run.as_ref() == Some(run) =>
                {
                    terminal = true;
                    Some(CalendarLaunchProgress::Finished {
                        request: pending.request.clone(),
                        run: run.clone(),
                        outcome: outcome.clone(),
                    })
                }
                _ => None,
            };
            if let Some(progress) = progress
                && let Some(latest) = self.latest.as_mut()
            {
                latest.progress = progress;
            }
            if terminal {
                break;
            }
        }
        if terminal {
            self.pending = None;
        } else if self.pending.as_ref().is_some_and(|p| {
            p.run.is_none()
                && now.saturating_duration_since(p.sent) >= Duration::from_millis(RECEIPT_MS)
        }) {
            self.unknown(CalendarLaunchUnknown::NoReceipt);
        }
    }
}
pub fn scope_stop(
    core: &CoreStatus,
    closing: bool,
    generation: &str,
) -> Option<CalendarLaunchStop> {
    if closing {
        Some(CalendarLaunchStop::HubClosed)
    } else if core.rights != LinkState::Connected {
        Some(CalendarLaunchStop::CoreDisconnected)
    } else if core.account_generation.as_deref() != Some(generation) {
        Some(CalendarLaunchStop::AccountChanged)
    } else if core.live {
        Some(CalendarLaunchStop::Live)
    } else if !super::allowed(&core.access) {
        Some(CalendarLaunchStop::RightsLost)
    } else {
        None
    }
}
#[cfg(test)]
#[path = "launch_tests.rs"]
mod tests;
