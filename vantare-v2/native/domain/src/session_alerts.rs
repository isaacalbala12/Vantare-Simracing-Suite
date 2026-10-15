//! Avisos LMU y calendario: sin I/O; todo tiempo llega en milisegundos del llamante.
#![allow(
    clippy::struct_excessive_bools,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
use crate::{SessionKind, SessionState, Snapshot, SourceState};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Options {
    pub thresholds: Vec<u8>,
    pub session: bool,
    pub calendar: bool,
    pub finished: bool,
    pub starts: bool,
    pub duration_ms: u64,
    pub mini: bool,
    pub mini_session: bool,
    pub mini_final: bool,
    pub mini_calendar: bool,
    pub mini_start: bool,
    pub mini_limit: usize,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            thresholds: vec![5, 1],
            session: true,
            calendar: true,
            finished: true,
            starts: true,
            duration_ms: 8000,
            mini: true,
            mini_session: true,
            mini_final: true,
            mini_calendar: true,
            mini_start: true,
            mini_limit: 3,
        }
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Formation,
    Start,
    Racing,
}
#[derive(Clone, Debug, PartialEq)]
pub struct SessionInput {
    pub epoch: u64,
    pub id: u64,
    pub kind: SessionKind,
    pub state: Option<SessionState>,
    pub remaining_s: Option<f64>,
    pub position: Option<u32>,
    pub best_lap_ms: Option<u64>,
    // #1638: Preparing no distingue parrilla/formación. No inferir fase ni metros.
    pub phase: Option<Phase>,
    pub distance_m: Option<f64>,
}
pub fn project(snapshot: &Snapshot) -> Option<SessionInput> {
    let s = &snapshot.state;
    if snapshot.origin.source.simulator != "lmu" || !matches!(s.source_state, SourceState::Live) {
        return None;
    }
    Some(SessionInput {
        epoch: snapshot.epoch,
        id: s.session.id.0,
        kind: s.session.kind.current()?.clone(),
        state: s.session.state.current().copied(),
        remaining_s: s
            .session
            .remaining_s
            .current()
            .copied()
            .filter(|s| s.is_finite() && *s >= 0.0),
        position: s
            .player_car()
            .and_then(|car| car.class_position.current().copied()),
        best_lap_ms: s
            .player_car()
            .and_then(|car| car.best_lap_s.current().copied())
            .filter(|s| s.is_finite() && *s > 0.0)
            .map(|s| (s * 1000.0).round().min(u64::MAX as f64) as u64),
        phase: None,
        distance_m: None,
    })
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CalendarInput {
    /// Identidad de una salida concreta, no solo de la serie.
    pub id: String,
    pub label: String,
    pub starts_at_ms: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tone {
    Mild,
    Final,
    Finished,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Kind {
    Threshold(u8),
    Finished {
        qualifying: bool,
        position: Option<u32>,
        best_lap_ms: Option<u64>,
    },
    Formation,
    Start,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notice {
    pub event: String,
    pub label: String,
    pub calendar: bool,
    pub kind: Kind,
    pub started_at_ms: u64,
    pub ends_at_ms: u64,
    expires_at_ms: u64,
}
impl Notice {
    pub fn tone(&self) -> Tone {
        match self.kind {
            Kind::Finished { .. } => Tone::Finished,
            Kind::Threshold(1) | Kind::Formation | Kind::Start => Tone::Final,
            Kind::Threshold(_) => Tone::Mild,
        }
    }
    pub fn priority(&self) -> u8 {
        match self.kind {
            Kind::Formation | Kind::Start => 0,
            Kind::Threshold(1) => 1,
            Kind::Finished { .. } => 2,
            Kind::Threshold(_) if self.calendar => 3,
            Kind::Threshold(_) => 4,
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Mini {
    pub event: String,
    pub label: String,
    pub calendar: bool,
    pub seconds: u64,
    pub distance_m: Option<u32>,
}
impl Mini {
    pub fn tone(&self) -> Tone {
        if self.distance_m.is_some() || self.seconds <= 60 {
            Tone::Final
        } else {
            Tone::Mild
        }
    }
    pub fn value(&self) -> String {
        self.distance_m.map_or_else(
            || {
                if self.seconds == 0 {
                    "YA".into()
                } else {
                    format!("{:02}:{:02}", self.seconds / 60, self.seconds % 60)
                }
            },
            |m| format!("{m} m"),
        )
    }
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct View {
    pub active: Option<Notice>,
    pub minis: Vec<Mini>,
    pub queued: usize,
    /// Aumenta solo al entrar un aviso: permite un sonido, nunca en bucle.
    pub sound_revision: u64,
    pub zero_revision: u64,
}
#[derive(Clone, Debug)]
struct Countdown {
    label: String,
    calendar: bool,
    deadline: u64,
    fresh_until: u64,
    shown: bool,
    alerted: BTreeSet<u8>,
    distance_m: Option<u32>,
    zero_fired: bool,
}
impl Countdown {
    fn seconds(&self, now: u64) -> u64 {
        self.deadline.saturating_sub(now).div_ceil(1000)
    }
}
#[derive(Default)]
pub struct Machine {
    previous: Option<(SessionInput, u64)>,
    countdowns: BTreeMap<String, Countdown>,
    queue: Vec<Notice>,
    active: Option<Notice>,
    sound_revision: u64,
    zero_revision: u64,
}
impl Machine {
    /// Fotos nuevas solamente. Un hueco de datos rompe la detección de cambios.
    pub fn session(&mut self, input: Option<SessionInput>, now: u64, options: &Options) {
        let Some(next) = input else {
            self.previous = None;
            self.clear_sessions();
            return;
        };
        let key = format!("session:{}:{}", next.epoch, next.id);
        let old = self.previous.take();
        if let Some((old, observed)) = &old {
            let changed = old.epoch != next.epoch || old.id != next.id || old.kind != next.kind;
            if changed {
                self.clear_sessions();
            }
            let ended = old.epoch == next.epoch
                && now.saturating_sub(*observed) <= 1500
                && (old.id != next.id
                    || old.kind != next.kind
                    || (old.state != Some(SessionState::Finished)
                        && next.state == Some(SessionState::Finished)));
            if ended && options.finished && old.state != Some(SessionState::Finished) {
                let qualifying = old.kind == SessionKind::Qualifying;
                if qualifying || old.kind == SessionKind::Practice {
                    self.enqueue(
                        Notice {
                            event: format!("ended:{}:{}", old.epoch, old.id),
                            label: if qualifying { "QUALY" } else { "PRÁCTICAS" }.into(),
                            calendar: false,
                            kind: Kind::Finished {
                                qualifying,
                                position: old.position,
                                best_lap_ms: old.best_lap_ms,
                            },
                            started_at_ms: 0,
                            ends_at_ms: 0,
                            expires_at_ms: now.saturating_add(15000),
                        },
                        now,
                    );
                }
            }
        }
        let label = match next.kind {
            SessionKind::Practice => "PRÁCTICAS",
            SessionKind::Qualifying => "QUALY",
            SessionKind::Race => "CARRERA",
            SessionKind::Other(_) => "SESIÓN",
        };
        if options.session
            && matches!(next.kind, SessionKind::Practice | SessionKind::Qualifying)
            && next.state != Some(SessionState::Finished)
        {
            if let Some(seconds) = next.remaining_s.filter(|s| s.is_finite() && *s >= 0.0) {
                let deadline = now.saturating_add((seconds * 1000.0).min(u64::MAX as f64) as u64);
                self.countdowns
                    .entry(key.clone())
                    .and_modify(|c| {
                        c.deadline = deadline;
                        c.fresh_until = now.saturating_add(1500);
                    })
                    .or_insert(Countdown {
                        label: label.into(),
                        calendar: false,
                        deadline,
                        fresh_until: now.saturating_add(1500),
                        shown: false,
                        alerted: BTreeSet::new(),
                        distance_m: None,
                        zero_fired: false,
                    });
            } else {
                self.countdowns.remove(&key);
            }
        }
        if options.starts && next.kind == SessionKind::Race {
            self.start(&key, &next, old.as_ref().and_then(|(s, _)| s.phase), now);
        }
        if next.phase == Some(Phase::Racing) {
            self.queue.retain(|n| n.event != key);
            if self.active.as_ref().is_some_and(|n| n.event == key) {
                self.active = None;
            }
        }
        if next.state == Some(SessionState::Finished) {
            self.countdowns.remove(&key);
        }
        self.previous = Some((next, now));
        self.thresholds(now, options);
    }
    fn start(&mut self, key: &str, next: &SessionInput, previous_phase: Option<Phase>, now: u64) {
        if next.phase.is_some() && next.phase != previous_phase {
            let kind = match next.phase {
                Some(Phase::Formation) => Some(Kind::Formation),
                Some(Phase::Start) => Some(Kind::Start),
                _ => None,
            };
            if let Some(kind) = kind {
                self.enqueue(
                    Notice {
                        event: key.to_owned(),
                        label: "SALIDA".into(),
                        calendar: false,
                        kind,
                        started_at_ms: 0,
                        ends_at_ms: 0,
                        expires_at_ms: now.saturating_add(15000),
                    },
                    now,
                );
            }
        }
        if next.phase == Some(Phase::Start) {
            self.countdowns.remove(key);
            if let Some(m) = next.distance_m.filter(|m| m.is_finite() && *m > 0.0) {
                self.countdowns.insert(
                    key.to_owned(),
                    Countdown {
                        label: "SALIDA".into(),
                        calendar: false,
                        deadline: u64::MAX,
                        fresh_until: now.saturating_add(1500),
                        shown: true,
                        alerted: BTreeSet::new(),
                        distance_m: Some(m.ceil().min(f64::from(u32::MAX)) as u32),
                        zero_fired: false,
                    },
                );
            }
        } else {
            self.countdowns.remove(key);
        }
    }
    fn clear_sessions(&mut self) {
        self.countdowns.retain(|_, c| c.calendar);
        self.queue.retain(|n| n.calendar);
        if self.active.as_ref().is_some_and(|n| !n.calendar) {
            self.active = None;
        }
    }
    /// Reemplazo de agenda completo: retirar una marca cancela sus avisos y mini.
    pub fn calendar(&mut self, inputs: &[CalendarInput], now: u64, options: &Options) {
        let keys: BTreeSet<_> = inputs
            .iter()
            .take(256)
            .filter(|_| options.calendar)
            .map(|c| format!("calendar:{}", c.id))
            .collect();
        self.countdowns
            .retain(|key, c| !c.calendar || keys.contains(key));
        self.queue
            .retain(|n| !n.calendar || keys.contains(&n.event));
        if self
            .active
            .as_ref()
            .is_some_and(|n| n.calendar && !keys.contains(&n.event))
        {
            self.active = None;
        }
        for input in inputs.iter().take(256).filter(|_| options.calendar) {
            let key = format!("calendar:{}", input.id);
            self.countdowns
                .entry(key)
                .and_modify(|c| {
                    c.deadline = input.starts_at_ms;
                    c.label.clone_from(&input.label);
                })
                .or_insert(Countdown {
                    label: input.label.chars().take(64).collect(),
                    calendar: true,
                    deadline: input.starts_at_ms,
                    fresh_until: u64::MAX,
                    shown: false,
                    alerted: BTreeSet::new(),
                    distance_m: None,
                    zero_fired: false,
                });
        }
        self.thresholds(now, options);
    }
    fn thresholds(&mut self, now: u64, options: &Options) {
        let mut notices = Vec::new();
        for (key, c) in &mut self.countdowns {
            if c.distance_m.is_some() || now > c.fresh_until || now >= c.deadline {
                continue;
            }
            // Al entrar tarde, solo el umbral más próximo. Nunca recuperar avisos caducados.
            let threshold = options
                .thresholds
                .iter()
                .copied()
                .filter(|m| *m > 0 && *m <= 60 && c.seconds(now) <= u64::from(*m) * 60)
                .min();
            if let Some(m) = threshold
                && c.alerted.insert(m)
            {
                notices.push(Notice {
                    event: key.clone(),
                    label: c.label.clone(),
                    calendar: c.calendar,
                    kind: Kind::Threshold(m),
                    started_at_ms: 0,
                    ends_at_ms: 0,
                    expires_at_ms: c.deadline,
                });
            }
        }
        for notice in notices {
            self.enqueue(notice, now);
        }
    }
    fn enqueue(&mut self, notice: Notice, now: u64) {
        self.queue
            .retain(|n| n.event != notice.event || !matches!(n.kind, Kind::Threshold(_)));
        if let Some(active) = &mut self.active
            && (notice.priority() < active.priority()
                || (notice.event == active.event && notice.kind == Kind::Start))
        {
            active.ends_at_ms = active
                .ends_at_ms
                .min(now.max(active.started_at_ms.saturating_add(2000)));
        }
        if self.queue.len() < 32 {
            self.queue.push(notice);
        }
        self.queue.sort_by_key(Notice::priority);
    }
    pub fn tick(&mut self, now: u64, options: &Options) -> View {
        self.thresholds(now, options);
        for c in self.countdowns.values_mut() {
            if c.shown
                && c.distance_m.is_none()
                && now <= c.fresh_until
                && now >= c.deadline
                && now < c.deadline.saturating_add(1500)
                && !c.zero_fired
            {
                c.zero_fired = true;
                self.zero_revision = self.zero_revision.wrapping_add(1);
            }
        }
        let valid = |n: &Notice| {
            now < n.expires_at_ms && (!matches!(n.kind, Kind::Threshold(_))
                || self.countdowns.get(&n.event).is_some_and(|c| {
                    now <= c.fresh_until && now < c.deadline
                        && !matches!(n.kind, Kind::Threshold(m) if m > 1 && c.seconds(now) <= 60)
                }))
        };
        self.queue.retain(&valid);
        if self
            .active
            .as_ref()
            .is_some_and(|n| now >= n.ends_at_ms || !valid(n))
        {
            self.active = None;
        }
        if self.active.is_none() && !self.queue.is_empty() {
            let mut next = self.queue.remove(0);
            next.started_at_ms = now;
            next.ends_at_ms = now.saturating_add(options.duration_ms.clamp(4000, 15000));
            if let Some(c) = self.countdowns.get_mut(&next.event) {
                c.shown = true;
            }
            self.active = Some(next);
            self.sound_revision = self.sound_revision.wrapping_add(1);
        }
        let mut minis: Vec<_> = self
            .countdowns
            .iter()
            .filter(|(key, c)| {
                options.mini
                    && c.shown
                    && now <= c.fresh_until
                    && now < c.deadline.saturating_add(1500)
                    && self.active.as_ref().is_none_or(|n| &n.event != *key)
                    && if c.distance_m.is_some() {
                        options.mini_start
                    } else if c.calendar {
                        options.mini_calendar
                    } else if c.seconds(now) <= 60 {
                        options.mini_final
                    } else {
                        options.mini_session
                    }
            })
            .map(|(key, c)| Mini {
                event: key.clone(),
                label: c.label.clone(),
                calendar: c.calendar,
                seconds: c.seconds(now),
                distance_m: c.distance_m,
            })
            .collect();
        minis.sort_by_key(|m| (m.distance_m.is_none(), m.seconds));
        minis.truncate(options.mini_limit.clamp(1, 3));
        View {
            active: self.active.clone(),
            minis,
            queued: self.queue.len(),
            sound_revision: self.sound_revision,
            zero_revision: self.zero_revision,
        }
    }
    pub fn countdown(&self, event: &str, now: u64) -> Option<Mini> {
        let c = self.countdowns.get(event)?;
        (now <= c.fresh_until).then(|| Mini {
            event: event.into(),
            label: c.label.clone(),
            calendar: c.calendar,
            seconds: c.seconds(now),
            distance_m: c.distance_m,
        })
    }
}

#[cfg(test)]
mod tests;
