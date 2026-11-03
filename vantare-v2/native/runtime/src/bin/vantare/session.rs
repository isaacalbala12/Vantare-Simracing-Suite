//! Decisiones de ciclo de vida sin E/S. El llamador proporciona todos los instantes.
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Restart {
    Always,
    WhilePermitted,
    Never,
}

#[derive(Clone, Copy, Debug)]
pub(super) struct Policy {
    pub restart: Restart,
    pub stop_on_success: bool,
    pub producer: bool,
    pub close_order: u8,
    pub budget: u32,
}

impl Policy {
    pub fn core(budget: u32) -> Self {
        Self {
            producer: true,
            ..Self::consumer(budget)
        }
    }
    pub fn consumer(budget: u32) -> Self {
        Self {
            restart: Restart::Always,
            stop_on_success: true,
            producer: false,
            close_order: 1,
            budget,
        }
    }
    pub fn permitted(budget: u32) -> Self {
        Self {
            restart: Restart::WhilePermitted,
            close_order: 0,
            ..Self::consumer(budget)
        }
    }
    pub fn observer() -> Self {
        Self {
            restart: Restart::Never,
            stop_on_success: false,
            close_order: 2,
            ..Self::consumer(0)
        }
    }
    fn enabled(self, permitted: bool) -> bool {
        self.restart != Restart::WhilePermitted || permitted
    }
}

/// Presupuesto de reinicios; no consulta el reloj ni el proceso.
pub(super) struct Restarts {
    pub budget: u32,
    pub attempts: u32,
}

impl Restarts {
    pub fn crashed(&mut self, ran: Duration) -> Option<Duration> {
        if ran >= super::STABLE {
            self.attempts = 0;
        }
        self.attempts = self.attempts.saturating_add(1);
        let factor = 2_u32.saturating_pow(self.attempts - 1);
        (self.attempts <= self.budget).then(|| {
            super::BACKOFF
                .saturating_mul(factor)
                .min(super::BACKOFF_CAP)
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Reason {
    Stopped,
    Finished(usize),
    Exhausted(usize),
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Phase {
    Starting,
    Running,
    Stopping {
        reason: Reason,
        deadline: Instant,
        core_at: Instant,
    },
    Finished(Reason),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ChildState {
    Waiting(Instant),
    Spawning,
    Alive(Instant),
    Closing { deadline: Instant, revoked: bool },
    Killing { revoked: bool },
    Reaped,
}

struct Child {
    policy: Policy,
    state: ChildState,
    restarts: Restarts,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Event {
    Tick { permitted: bool, workers_done: bool },
    Started(usize),
    SpawnFailed(usize),
    Exited { child: usize, success: bool },
    Detached(usize),
    OpenHub(usize),
    Killed { child: usize, reaped: bool },
    Stop(Reason),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Action {
    Spawn(usize),
    Close(usize),
    Kill(usize),
    Backoff { child: usize, delay: Duration },
    StopWorkers,
    ForceWorkers,
}

pub(super) struct Session {
    pub phase: Phase,
    children: Vec<Child>,
    grace: Duration,
    permitted: bool,
    workers_done: bool,
    workers_forced: bool,
}

impl Session {
    pub fn new(policies: impl IntoIterator<Item = Policy>, grace: Duration, now: Instant) -> Self {
        Self {
            phase: Phase::Starting,
            children: policies
                .into_iter()
                .map(|policy| Child {
                    policy,
                    state: ChildState::Waiting(now),
                    restarts: Restarts {
                        budget: policy.budget,
                        attempts: 0,
                    },
                })
                .collect(),
            grace,
            permitted: false,
            workers_done: false,
            workers_forced: false,
        }
    }

    pub fn stopping(&self) -> bool {
        matches!(self.phase, Phase::Stopping { .. } | Phase::Finished(_))
    }

    pub fn can_spawn(&self, index: usize) -> bool {
        !self.stopping() && self.children[index].state == ChildState::Spawning
    }

    pub fn closing(&self, index: usize) -> bool {
        matches!(
            self.children[index].state,
            ChildState::Closing { .. } | ChildState::Killing { .. }
        )
    }

    pub fn killing(&self, index: usize) -> bool {
        matches!(self.children[index].state, ChildState::Killing { .. })
    }

    /// Una transición completa. `now` es el único reloj de la máquina.
    pub fn paso(&mut self, event: Event, now: Instant) -> Vec<Action> {
        let mut actions = Vec::new();
        match event {
            Event::Tick {
                permitted,
                workers_done,
            } => {
                self.permitted = permitted;
                self.workers_done = workers_done;
            }
            Event::Started(index) => self.children[index].state = ChildState::Alive(now),
            Event::SpawnFailed(index) => self.failed(index, Duration::ZERO, now, &mut actions),
            Event::Detached(index) => {
                if !self.stopping() {
                    self.children[index].state = ChildState::Reaped;
                }
            }
            Event::OpenHub(index) => {
                if !self.stopping() && self.children[index].state == ChildState::Reaped {
                    self.children[index].state = ChildState::Waiting(now);
                    self.children[index].restarts.attempts = 0;
                }
            }
            Event::Exited {
                child: index,
                success,
            } => {
                let previous = self.children[index].state;
                if !matches!(
                    previous,
                    ChildState::Alive(_) | ChildState::Closing { .. } | ChildState::Killing { .. }
                ) {
                    return actions;
                }
                let policy = self.children[index].policy;
                self.children[index].state = ChildState::Reaped;
                if !self.stopping()
                    && matches!(
                        previous,
                        ChildState::Closing { revoked: true, .. }
                            | ChildState::Killing { revoked: true }
                    )
                {
                    self.revoked(index, now);
                } else if !self.stopping() {
                    if success && policy.stop_on_success {
                        self.stop(Reason::Finished(index), now, &mut actions);
                    } else if !success {
                        let ran = match previous {
                            ChildState::Alive(since) => now - since,
                            _ => Duration::ZERO,
                        };
                        self.failed(index, ran, now, &mut actions);
                    }
                }
            }
            Event::Killed { child, reaped } => {
                let ChildState::Killing { revoked } = self.children[child].state else {
                    return actions;
                };
                self.children[child].state = ChildState::Reaped;
                if revoked && !self.stopping() {
                    if reaped {
                        self.revoked(child, now);
                    } else {
                        self.children[child].state = ChildState::Closing {
                            deadline: now + self.grace,
                            revoked: true,
                        };
                    }
                }
            }
            Event::Stop(reason) => self.stop(reason, now, &mut actions),
        }
        self.advance(now, &mut actions);
        actions
    }

    fn revoked(&mut self, index: usize, now: Instant) {
        self.children[index].state = ChildState::Waiting(now);
        self.children[index].restarts.attempts = 0;
    }

    fn failed(&mut self, index: usize, ran: Duration, now: Instant, actions: &mut Vec<Action>) {
        let child = &mut self.children[index];
        if child.policy.restart == Restart::Never {
            child.state = ChildState::Reaped;
        } else if let Some(delay) = child.restarts.crashed(ran) {
            child.state = ChildState::Waiting(now + delay);
            actions.push(Action::Backoff {
                child: index,
                delay,
            });
        } else {
            child.state = ChildState::Reaped;
            self.stop(Reason::Exhausted(index), now, actions);
        }
    }

    fn stop(&mut self, reason: Reason, now: Instant, actions: &mut Vec<Action>) {
        if self.stopping() {
            return;
        }
        let deadline = now + self.grace;
        let reserve = Duration::from_secs(1).min(self.grace / 2);
        self.phase = Phase::Stopping {
            reason,
            deadline,
            core_at: now + self.grace.saturating_sub(reserve),
        };
        actions.push(Action::StopWorkers);
        let mut order: Vec<_> = (0..self.children.len()).collect();
        order.sort_by_key(|&i| self.children[i].policy.close_order);
        for index in order {
            let child = &mut self.children[index];
            match child.state {
                ChildState::Waiting(_) | ChildState::Spawning => child.state = ChildState::Reaped,
                ChildState::Alive(_) if !child.policy.producer => {
                    child.state = ChildState::Closing {
                        deadline,
                        revoked: false,
                    };
                    actions.push(Action::Close(index));
                }
                ChildState::Closing { .. } => {
                    child.state = ChildState::Closing {
                        deadline,
                        revoked: false,
                    }
                }
                _ => {}
            }
        }
    }

    fn advance(&mut self, now: Instant, actions: &mut Vec<Action>) {
        if let Phase::Stopping {
            reason,
            deadline,
            core_at,
        } = self.phase
        {
            let consumers_done = self.workers_done
                && self
                    .children
                    .iter()
                    .all(|child| child.policy.producer || child.state == ChildState::Reaped);
            for (index, child) in self.children.iter_mut().enumerate() {
                if child.policy.producer
                    && matches!(child.state, ChildState::Alive(_))
                    && (consumers_done || now >= core_at)
                {
                    child.state = ChildState::Closing {
                        deadline,
                        revoked: false,
                    };
                    actions.push(Action::Close(index));
                }
            }
            if now >= deadline && !self.workers_done && !self.workers_forced {
                self.workers_forced = true;
                actions.push(Action::ForceWorkers);
            }
            if self
                .children
                .iter()
                .all(|child| child.state == ChildState::Reaped)
                && (self.workers_done || self.workers_forced)
            {
                self.phase = Phase::Finished(reason);
            }
        } else if !self.stopping() {
            for (index, child) in self.children.iter_mut().enumerate() {
                let enabled = child.policy.enabled(self.permitted);
                match child.state {
                    ChildState::Waiting(until) if enabled && now >= until => {
                        child.state = ChildState::Spawning;
                        actions.push(Action::Spawn(index));
                    }
                    ChildState::Alive(_) if !enabled => {
                        child.state = ChildState::Closing {
                            deadline: now + self.grace,
                            revoked: true,
                        };
                        actions.push(Action::Close(index));
                    }
                    _ => {}
                }
            }
            if self.phase == Phase::Starting
                && self.children.iter().all(|child| {
                    !child.policy.enabled(self.permitted)
                        || child.policy.restart == Restart::Never
                        || matches!(child.state, ChildState::Alive(_))
                })
            {
                self.phase = Phase::Running;
            }
        }
        for (index, child) in self.children.iter_mut().enumerate() {
            if let ChildState::Closing { deadline, revoked } = child.state
                && now >= deadline
            {
                child.state = ChildState::Killing { revoked };
                actions.push(Action::Kill(index));
            }
        }
    }

    pub fn wait_for(&self, now: Instant) -> Duration {
        let mut next = now + Duration::from_millis(if self.stopping() { 25 } else { 250 });
        if let Phase::Stopping {
            deadline, core_at, ..
        } = self.phase
        {
            next = next.min(deadline);
            if self
                .children
                .iter()
                .any(|child| child.policy.producer && matches!(child.state, ChildState::Alive(_)))
            {
                next = next.min(core_at);
            }
        }
        for child in &self.children {
            let at = match child.state {
                ChildState::Waiting(at)
                    if child.policy.enabled(self.permitted) && !self.stopping() =>
                {
                    Some(at)
                }
                ChildState::Closing { deadline, .. } => Some(deadline),
                _ => None,
            };
            if let Some(at) = at {
                next = next.min(at);
            }
        }
        next.saturating_duration_since(now)
    }
}

#[cfg(test)]
mod tests;
