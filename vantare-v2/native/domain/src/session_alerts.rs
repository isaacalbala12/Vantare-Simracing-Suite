//! Avisos LMU y calendario: sin I/O; todo tiempo llega en milisegundos del llamante.
#![allow(
    clippy::struct_excessive_bools,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
use crate::{Quality, SessionKind, SessionState, Snapshot, SourceState, StartPhase};
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
    /// Resto hasta el fin programado; nunca hasta la carrera siguiente.
    pub remaining_s: Option<f64>,
    pub elapsed_s: Option<f64>,
    pub started_at_s: Option<f64>,
    pub finished_at_s: Option<f64>,
    pub next_kind: Option<SessionKind>,
    pub next_starts_at_s: Option<f64>,
    pub position: Option<u32>,
    pub best_lap_ms: Option<u64>,
    // Solo fase explícita v11: Preparing/Grid no distinguen formación/salida.
    pub phase: Option<Phase>,
    pub distance_m: Option<f64>,
    pub distance_estimated: bool,
}
pub fn project(snapshot: &Snapshot) -> Option<SessionInput> {
    let s = &snapshot.state;
    if snapshot.origin.source.simulator != "lmu" || !matches!(s.source_state, SourceState::Live) {
        return None;
    }
    let elapsed = current_time(&s.session.elapsed_s);
    let timing = &s.session.timing;
    let phase = match timing.start_phase.current() {
        Some(StartPhase::Formation) => Some(Phase::Formation),
        Some(StartPhase::Countdown) => Some(Phase::Start),
        Some(StartPhase::Racing) => Some(Phase::Racing),
        Some(StartPhase::Grid) | None => None,
    };
    Some(SessionInput {
        epoch: snapshot.epoch,
        id: s.session.id.0,
        kind: s.session.kind.current()?.clone(),
        state: s.session.state.current().copied(),
        remaining_s: elapsed
            .zip(current_time(&timing.scheduled_end_s))
            .filter(|(elapsed, end)| end >= elapsed)
            .map(|(elapsed, end)| end - elapsed),
        elapsed_s: elapsed,
        started_at_s: current_time(&timing.started_at_s),
        finished_at_s: current_time(&timing.finished_at_s),
        next_kind: timing.next_kind.current().cloned(),
        next_starts_at_s: current_time(&timing.next_starts_at_s),
        // Sin fuente LMU de fin real: no solicitar Positions/LapTimes para esta rama.
        position: None,
        best_lap_ms: None,
        phase,
        distance_m: (phase == Some(Phase::Start))
            .then(|| current_time(&timing.distance_to_start_line_m))
            .flatten(),
        distance_estimated: phase == Some(Phase::Start)
            && matches!(timing.distance_to_start_line_m, Quality::Estimated(_)),
    })
}
fn current_time(value: &Quality<f64>) -> Option<f64> {
    value
        .current()
        .copied()
        .filter(|v| v.is_finite() && *v >= 0.0)
}
fn session_label(kind: &SessionKind) -> &'static str {
    match kind {
        SessionKind::Practice => "PRÁCTICAS",
        SessionKind::Qualifying => "QUALY",
        SessionKind::Race => "CARRERA",
        SessionKind::Other(_) => "SESIÓN",
    }
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
    pub scheduled: bool,
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
    pub scheduled: bool,
    pub distance_estimated: bool,
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
                if self.seconds == 0 && !self.scheduled {
                    "YA".into()
                } else {
                    format!("{:02}:{:02}", self.seconds / 60, self.seconds % 60)
                }
            },
            |m| format!("{}{m} m", if self.distance_estimated { "≈" } else { "" }),
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
    available: bool,
    shown: bool,
    alerted: BTreeSet<u8>,
    distance_m: Option<u32>,
    zero_fired: bool,
    scheduled: bool,
    distance_estimated: bool,
}
impl Countdown {
    fn seconds(&self, now: u64) -> u64 {
        self.deadline.saturating_sub(now).div_ceil(1000)
    }
}
#[derive(Default)]
pub struct Machine {
    previous: Option<(SessionInput, Option<u64>)>,
    confirmed_finish: Option<u64>,
    countdowns: BTreeMap<String, Countdown>,
    queue: Vec<Notice>,
    active: Option<Notice>,
    sound_revision: u64,
    zero_revision: u64,
}
impl Machine {
    /// Fotos nuevas; un hueco suspende los avisos, conservando identidad y deduplicado.
    pub fn session(&mut self, input: Option<SessionInput>, now: u64, options: &Options) {
        let Some(next) = input else {
            if let Some((_, observed)) = &mut self.previous {
                *observed = None;
            }
            for c in self.countdowns.values_mut().filter(|c| !c.calendar) {
                c.available = false;
            }
            self.clear_session_notices();
            return;
        };
        let key = format!("session:{}:{}", next.epoch, next.id);
        let old = self.previous.take();
        let same = old
            .as_ref()
            .is_some_and(|(s, _)| s.epoch == next.epoch && s.id == next.id && s.kind == next.kind);
        if same {
            self.finish(
                &key,
                &next,
                old.as_ref().and_then(|(_, t)| *t),
                now,
                options,
            );
        } else {
            self.clear_sessions();
            // Conectarse a una sesión ya terminada solo establece la base.
            self.confirmed_finish = next.finished_at_s.map(f64::to_bits);
        }
        self.session_countdown(&key, &next, now, options);
        if options.starts && next.kind == SessionKind::Race {
            self.start(&key, &next, old.as_ref().and_then(|(s, _)| s.phase), now);
        }
        // Fase ausente o distinta: retirar el aviso de salida, sin conservar metros.
        let phase_matches = |kind: &Kind| {
            matches!(
                (kind, next.phase),
                (Kind::Formation, Some(Phase::Formation)) | (Kind::Start, Some(Phase::Start))
            )
        };
        self.queue.retain(|n| {
            n.event != key
                || !matches!(n.kind, Kind::Formation | Kind::Start)
                || phase_matches(&n.kind)
        });
        if self.active.as_ref().is_some_and(|n| {
            n.event == key
                && matches!(n.kind, Kind::Formation | Kind::Start)
                && !phase_matches(&n.kind)
        }) {
            self.active = None;
        }
        if next.finished_at_s.is_some() {
            self.countdowns.remove(&key);
        }
        self.previous = Some((next, Some(now)));
        self.thresholds(now, options);
    }
    fn finish(
        &mut self,
        key: &str,
        next: &SessionInput,
        observed: Option<u64>,
        now: u64,
        options: &Options,
    ) {
        let Some(finished) = next.finished_at_s else {
            return;
        };
        let mark = finished.to_bits();
        if self.confirmed_finish == Some(mark) {
            return;
        }
        let recent = observed.is_some_and(|t| now.saturating_sub(t) <= 1500)
            && next
                .elapsed_s
                .is_some_and(|elapsed| elapsed >= finished && elapsed - finished <= 1.5);
        if !recent
            || !options.finished
            || !matches!(next.kind, SessionKind::Practice | SessionKind::Qualifying)
        {
            return;
        }
        self.confirmed_finish = Some(mark);
        self.enqueue(
            Notice {
                event: format!("ended:{key}:{mark}"),
                label: session_label(&next.kind).into(),
                calendar: false,
                scheduled: false,
                kind: Kind::Finished {
                    qualifying: next.kind == SessionKind::Qualifying,
                    position: next.position,
                    best_lap_ms: next.best_lap_ms,
                },
                started_at_ms: 0,
                ends_at_ms: 0,
                expires_at_ms: now.saturating_add(15000),
            },
            now,
        );
    }
    fn session_countdown(&mut self, key: &str, next: &SessionInput, now: u64, options: &Options) {
        let announced = next
            .next_kind
            .as_ref()
            .zip(next.next_starts_at_s)
            .zip(next.elapsed_s)
            .filter(|((_, start), elapsed)| start >= elapsed)
            .map(|((kind, start), elapsed)| (session_label(kind), start - elapsed, false));
        let scheduled = matches!(next.kind, SessionKind::Practice | SessionKind::Qualifying)
            .then_some(next.remaining_s)
            .flatten()
            .map(|s| (session_label(&next.kind), s, true));
        let target = announced.or(scheduled).filter(|(_, s, _)| {
            options.session && s.is_finite() && *s >= 0.0 && next.finished_at_s.is_none()
        });
        let Some((label, seconds, scheduled)) = target else {
            if let Some(c) = self.countdowns.get_mut(key) {
                c.available = false;
            }
            return;
        };
        if self
            .countdowns
            .get(key)
            .is_some_and(|c| c.scheduled != scheduled || c.label != label)
        {
            self.countdowns.remove(key);
            self.queue.retain(|n| n.event != key);
            if self.active.as_ref().is_some_and(|n| n.event == key) {
                self.active = None;
            }
        }
        let deadline = now.saturating_add((seconds * 1000.0).min(u64::MAX as f64) as u64);
        self.countdowns
            .entry(key.to_owned())
            .and_modify(|c| {
                c.deadline = deadline;
                c.available = true;
                c.fresh_until = now.saturating_add(1500);
            })
            .or_insert(Countdown {
                label: label.into(),
                calendar: false,
                scheduled,
                distance_estimated: false,
                deadline,
                fresh_until: now.saturating_add(1500),
                available: true,
                shown: false,
                alerted: BTreeSet::new(),
                distance_m: None,
                zero_fired: false,
            });
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
                        scheduled: false,
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
                        available: true,
                        shown: true,
                        alerted: BTreeSet::new(),
                        distance_m: Some(m.ceil().min(f64::from(u32::MAX)) as u32),
                        zero_fired: false,
                        scheduled: false,
                        distance_estimated: next.distance_estimated,
                    },
                );
            }
        } else {
            self.countdowns.remove(key);
        }
    }
    fn clear_sessions(&mut self) {
        self.countdowns.retain(|_, c| c.calendar);
        self.clear_session_notices();
    }
    fn clear_session_notices(&mut self) {
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
                    scheduled: false,
                    distance_estimated: false,
                    deadline: input.starts_at_ms,
                    fresh_until: u64::MAX,
                    available: true,
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
            if !c.available || c.distance_m.is_some() || now > c.fresh_until || now >= c.deadline {
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
                    scheduled: c.scheduled,
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
            if c.available
                && c.shown
                && !c.scheduled
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
                    c.available && now <= c.fresh_until && now < c.deadline
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
                    && c.available
                    && c.shown
                    && now <= c.fresh_until
                    && now
                        < c.deadline
                            .saturating_add(if c.scheduled { 0 } else { 1500 })
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
                scheduled: c.scheduled,
                distance_estimated: c.distance_estimated,
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
    /// Próximo umbral absoluto: una agenda lejana no necesita ticks cada segundo.
    pub fn next_wake_at(&self, now: u64, options: &Options) -> Option<u64> {
        self.countdowns
            .values()
            .filter(|c| c.available && now <= c.fresh_until && c.distance_m.is_none())
            .flat_map(|c| {
                let thresholds = options
                    .thresholds
                    .iter()
                    .copied()
                    .filter(move |m| (1..=60).contains(m) && !c.alerted.contains(m))
                    .map(move |m| c.deadline.saturating_sub(u64::from(m) * 60_000));
                let zero = (c.shown && !c.scheduled && !c.zero_fired).then_some(c.deadline);
                thresholds
                    .chain(zero)
                    .filter(move |at| *at > now && *at <= c.fresh_until)
            })
            .min()
    }

    pub fn countdown(&self, event: &str, now: u64) -> Option<Mini> {
        let c = self.countdowns.get(event)?;
        (c.available && now <= c.fresh_until).then(|| Mini {
            event: event.into(),
            label: c.label.clone(),
            calendar: c.calendar,
            seconds: c.seconds(now),
            distance_m: c.distance_m,
            scheduled: c.scheduled,
            distance_estimated: c.distance_estimated,
        })
    }
}

#[cfg(test)]
mod tests;
