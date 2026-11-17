//! Port de Motion::update de GPUI; canales de Eficiencia, separados de Vantare.
use super::model::{ContentPlan, Row, Status};
use crate::motion::Tween;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use vantare_domain::CarId;

#[cfg(test)]
#[path = "effects_tests.rs"]
mod effects_tests;
#[cfg(test)]
#[path = "motion_tests.rs"]
mod tests;
const FADE: f64 = 0.200;
const NOTICE: f64 = 1.200;
const SWEEP: f64 = 0.800;
const EASE: [f32; 4] = [0.25, 0.1, 0.25, 1.0];
const EASE_OUT: [f32; 4] = [0.0, 0.0, 0.58, 1.0];
const FLIP: [f32; 4] = [0.22, 0.9, 0.3, 1.0];
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Pose {
    pub offset: f32,
    pub alpha: f32,
    pub flash: f32,
    pub flash_up: bool,
    pub chip: Option<(i64, f32)>,
    pub sweep: Option<(bool, f32, f32)>,
    pub battle: f32,
    pub best_marker: f32,
    pub pit_alpha: f32,
    pub pit_dx: f32,
}
impl Default for Pose {
    fn default() -> Self {
        Self {
            offset: 0.0,
            alpha: 1.0,
            flash: 0.0,
            flash_up: true,
            chip: None,
            sweep: None,
            battle: 0.0,
            best_marker: 0.0,
            pit_alpha: 0.0,
            pit_dx: -5.0,
        }
    }
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Ghost {
    pub row: Row,
    pub top: f32,
    pub pose: Pose,
}
#[derive(Default, Debug, PartialEq)]
pub(super) struct Frame {
    vis: HashMap<CarId, Pose>,
    pub ghosts: Vec<Ghost>,
}
impl Frame {
    pub fn row(&self, id: CarId) -> Pose {
        self.vis.get(&id).copied().unwrap_or_default()
    }
    pub fn row_for(&self, row: &Row) -> Pose {
        self.vis.get(&row.id).copied().unwrap_or_else(|| Pose {
            pit_alpha: if row.in_pits { 1.0 } else { 0.0 },
            pit_dx: if row.in_pits { 0.0 } else { -5.0 },
            ..Pose::default()
        })
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) enum Wake {
    Idle,
    Frame,
    At(f64),
}
struct Exit {
    row: Row,
    top: f32,
    fade: Tween,
}
#[derive(Default)]
pub(super) struct Motion {
    prev: Option<ContentPlan>,
    seeded: bool,
    presence: HashMap<CarId, Row>,
    tops: HashMap<CarId, f32>,
    flips: HashMap<CarId, Tween>,
    fades: HashMap<CarId, Tween>,
    exits: HashMap<CarId, Exit>,
    idle_frame: Option<Arc<Frame>>,
    notices: HashMap<CarId, Notice>,
    battle: Option<Battle>,
    battle_tw: HashMap<CarId, Tween>,
    best_tw: HashMap<CarId, Tween>,
    pit_tw: HashMap<CarId, (Tween, Tween)>,
    flash_tw: HashMap<CarId, Tween>,
    chip_tw: HashMap<CarId, Tween>,
}
fn animate(from: f32, to: f32, now: f64, duration: f64, curve: [f32; 4]) -> Tween {
    let mut t = Tween::fixed(from).with_curve(curve);
    t.retarget(to, now, duration);
    t
}
fn motion_continues(prev: &ContentPlan, next: &ContentPlan) -> bool {
    prev.status == Status::Ready
        && next.status == Status::Ready
        && prev.identity == next.identity
        && prev.session_label() == next.session_label()
        // lógica de continuidad de GPUI, no clave de proyección ni de caché
        && next.sequence >= prev.sequence
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EventKind {
    PersonalBest,
    Position,
    SessionBest,
    #[allow(dead_code)] // GPUI solo lo construye al restaurar avisos entre Looks.
    Lead,
    #[allow(dead_code)] // GPUI solo lo construye al restaurar avisos entre Looks.
    Pit,
}

impl EventKind {
    fn priority(self) -> u8 {
        match self {
            EventKind::SessionBest => 3,
            EventKind::Position | EventKind::Lead | EventKind::Pit => 2,
            EventKind::PersonalBest => 1,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
struct Event {
    pub row_id: CarId,
    pub kind: EventKind,
    pub places: i64,
}

fn valid_lap(seconds: Option<f64>) -> Option<f64> {
    seconds.filter(|s| s.is_finite() && *s > 0.0)
}

fn derive_events(prev: &ContentPlan, next: &ContentPlan, lap_visible: bool) -> Vec<Event> {
    if !motion_continues(prev, next) {
        return Vec::new();
    }
    let before: HashMap<CarId, &Row> = prev.rows.iter().map(|r| (r.id, r)).collect();
    let mut events = Vec::new();
    for row in &next.rows {
        let Some(old) = before.get(&row.id) else {
            continue;
        };
        if old.class != row.class {
            continue;
        }
        let (previous, current) = (old.position, row.position);
        let places = if previous > 0 && current > 0 {
            previous - current
        } else {
            0
        };
        let improved = match (valid_lap(old.best_lap_s), valid_lap(row.best_lap_s)) {
            (Some(o), Some(n)) => n < o - 0.0005,
            _ => false,
        };
        let session_best = lap_visible
            && improved
            && next
                .session_best
                .as_ref()
                .is_some_and(|(id, _)| *id == row.id)
            && match (
                prev.session_best
                    .as_ref()
                    .and_then(|(_, s)| valid_lap(Some(*s))),
                next.session_best
                    .as_ref()
                    .and_then(|(_, s)| valid_lap(Some(*s))),
            ) {
                (Some(p), Some(n)) => n < p - 0.0005,
                _ => false,
            };
        if session_best {
            events.push(Event {
                row_id: row.id,
                kind: EventKind::SessionBest,
                places: 0,
            });
        } else if places != 0 {
            events.push(Event {
                row_id: row.id,
                kind: EventKind::Position,
                places,
            });
        } else if lap_visible && improved {
            events.push(Event {
                row_id: row.id,
                kind: EventKind::PersonalBest,
                places: 0,
            });
        }
    }
    events.sort_by_key(|e| std::cmp::Reverse(e.kind.priority()));
    events
}

#[derive(Clone, Debug, PartialEq)]
struct Battle {
    pub ahead: CarId,
    pub behind: CarId,
    pub gap: f64,
    pub player: bool,
}

/// `selectStandingsBattle`: un duelo de la misma clase, con histeresis.
fn select_battle(
    content_plan: &ContentPlan,
    visible: &HashSet<CarId>,
    previous: Option<&Battle>,
) -> Option<Battle> {
    if content_plan.status != Status::Ready || !content_plan.race {
        return None;
    }
    let rows: Vec<&Row> = content_plan
        .rows
        .iter()
        .filter(|r| visible.contains(&r.id))
        .collect();
    let mut candidates: Vec<Battle> = Vec::new();
    for behind in &rows {
        let class = behind.class.trim().to_uppercase();
        if class.is_empty() || behind.class_position < 2 {
            continue;
        }
        let Some(ahead) = rows.iter().find(|r| {
            r.class.trim().to_uppercase() == class && r.class_position == behind.class_position - 1
        }) else {
            continue;
        };
        if ahead.in_pits || behind.in_pits {
            continue;
        }
        if ahead.position < 1 || behind.position < 1 || behind.position <= ahead.position {
            continue;
        }
        let (Some(a), Some(b)) = (ahead.battle_gap_seconds, behind.battle_gap_seconds) else {
            continue;
        };
        let gap = b - a;
        if !gap.is_finite() || a < 0.0 || gap < 0.0 {
            continue;
        }
        let retained = previous.is_some_and(|p| {
            [&p.ahead, &p.behind].contains(&&ahead.id)
                && [&p.ahead, &p.behind].contains(&&behind.id)
        });
        if gap <= if retained { 1.2 } else { 0.8 } {
            candidates.push(Battle {
                ahead: ahead.id,
                behind: behind.id,
                gap,
                player: ahead.is_player || behind.is_player,
            });
        }
    }
    let eligible: Vec<Battle> = if candidates.iter().any(|c| c.player) {
        candidates.into_iter().filter(|c| c.player).collect()
    } else {
        candidates
    };
    let kept = eligible.iter().find(|c| {
        previous.is_some_and(|p| {
            [&p.ahead, &p.behind].contains(&&c.ahead) && [&p.ahead, &p.behind].contains(&&c.behind)
        })
    });
    kept.cloned().or_else(|| {
        let mut sorted = eligible;
        sorted.sort_by(|a, b| a.gap.total_cmp(&b.gap));
        sorted.into_iter().next()
    })
}

struct Notice {
    priority: u8,
    kind: EventKind,
    start: f64,
    places: i64,
}
fn pit_tweens(active: bool) -> (Tween, Tween) {
    (
        Tween::fixed(if active { 1.0 } else { 0.0 }),
        Tween::fixed(if active { 0.0 } else { -5.0 }),
    )
}
impl Motion {
    pub fn update(&mut self, content: &ContentPlan, visible: usize, lap_visible: bool, now: f64) {
        self.idle_frame = None;
        if content.status != Status::Ready {
            *self = Self::default();
            return;
        }
        let rows: Vec<_> = content.rows.iter().take(visible).collect();
        let seeded = self.seeded;
        let previous = self.prev.clone();
        if !self.seeded
            || !self
                .prev
                .as_ref()
                .is_some_and(|prev| motion_continues(prev, content))
        {
            *self = Self::default();
            self.seeded = true;
            for (index, row) in rows.iter().enumerate() {
                self.tops
                    .insert(row.id, index as f32 * super::model::ROW_HEIGHT);
                // La presencia conserva también el estado final in_pits al resembrar.
                self.presence.insert(row.id, (*row).clone());
                self.fades.insert(row.id, Tween::fixed(1.0));
                self.pit_tw.insert(row.id, pit_tweens(row.in_pits));
            }
            self.sync_best_marker(content, &rows, now, seeded);
            self.prev = Some(content.clone());
            return;
        }
        let ids: HashSet<_> = rows.iter().map(|r| r.id).collect();
        let dropped: Vec<_> = self
            .presence
            .iter()
            .filter(|(id, _)| !ids.contains(id))
            .map(|(id, row)| (*id, row.clone()))
            .collect();
        for (id, row) in dropped {
            let flight = self.flips.get(&id).map_or(0.0, |t| t.value(now));
            let top = self.tops.get(&id).copied().unwrap_or(0.0) + flight;
            let alpha = self.fades.get(&id).map_or(1.0, |t| t.value(now));
            self.exits.insert(
                id,
                Exit {
                    row,
                    top,
                    fade: animate(alpha, 0.0, now, FADE, EASE_OUT),
                },
            );
            self.flips.remove(&id);
            self.fades.remove(&id);
            self.tops.remove(&id);
        }
        for row in &rows {
            if self.presence.contains_key(&row.id) {
                continue;
            }
            let from = if let Some(exit) = self.exits.remove(&row.id) {
                self.tops.insert(row.id, exit.top);
                exit.fade.value(now)
            } else {
                0.0
            };
            self.fades
                .insert(row.id, animate(from, 1.0, now, FADE, EASE_OUT));
            self.pit_tw
                .entry(row.id)
                .or_insert_with(|| pit_tweens(row.in_pits));
        }
        for (index, row) in rows.iter().enumerate() {
            let top = index as f32 * super::model::ROW_HEIGHT;
            let flight = self.flips.remove(&row.id).map_or(0.0, |t| t.value(now));
            if let Some(previous) = self.tops.insert(row.id, top) {
                let from = previous - top + flight;
                if from.abs() >= 0.5 {
                    let ms = (280.0 + from.abs() * 1.1).min(460.0) as u64;
                    self.flips
                        .insert(row.id, animate(from, 0.0, now, ms as f64 / 1000.0, FLIP));
                }
            }
        }
        self.tops.retain(|id, _| ids.contains(id));
        self.presence = rows.iter().map(|r| (r.id, (*r).clone())).collect();
        if let Some(prev) = previous {
            self.update_effects(&prev, content, &rows, &ids, lap_visible, now);
        }
        self.prev = Some(content.clone());
    }
    pub fn frame_shared(&mut self, now: f64) -> Arc<Frame> {
        self.exits.retain(|_, e| e.fade.active(now));
        self.prune(now);
        if self.wake(now) == Wake::Idle
            && let Some(frame) = &self.idle_frame
        {
            return frame.clone();
        }
        self.flips.retain(|_, t| t.active(now));
        self.fades.retain(|_, t| t.active(now));
        let mut frame = Frame::default();
        // Sin canales no se recorren las filas ni se asigna un mapa de presencias.
        for (&id, t) in &self.flips {
            frame.vis.entry(id).or_default().offset = t.value(now);
        }
        for (&id, t) in &self.fades {
            frame.vis.entry(id).or_default().alpha = t.value(now);
        }
        for row in self.presence.values() {
            let mut pose = frame.row(row.id);
            pose.battle = self.battle_tw.get(&row.id).map_or(0.0, |t| t.value(now));
            pose.best_marker = self.best_tw.get(&row.id).map_or(0.0, |t| t.value(now));
            let (alpha, dx) = self
                .pit_tw
                .get(&row.id)
                .copied()
                .unwrap_or_else(|| pit_tweens(row.in_pits));
            pose.pit_alpha = alpha.value(now);
            pose.pit_dx = dx.value(now);
            if let Some(n) = self.notices.get(&row.id) {
                match n.kind {
                    EventKind::Position | EventKind::Lead => {
                        pose.flash = self.flash_tw.get(&row.id).map_or(1.0, |t| t.value(now));
                        pose.flash_up = n.places > 0;
                        pose.chip = Some((
                            n.places,
                            self.chip_tw.get(&row.id).map_or(1.0, |t| t.value(now)),
                        ));
                    }
                    EventKind::Pit => {
                        pose.pit_alpha = 1.0;
                        pose.pit_dx = 0.0;
                    }
                    EventKind::PersonalBest | EventKind::SessionBest => {
                        let elapsed = (now - n.start).max(0.0);
                        if elapsed < SWEEP {
                            let p = rune::Easing::cubic(0.0, 0.0, 0.58, 1.0)
                                .eval((elapsed / SWEEP) as f32);
                            let (opacity, x) = if p < 0.4 {
                                let k = p / 0.4;
                                (0.7 * k, -1.0 + k)
                            } else {
                                let k = (p - 0.4) / 0.6;
                                (0.7 * (1.0 - k), k)
                            };
                            pose.sweep = Some((n.kind == EventKind::SessionBest, opacity, x));
                        }
                    }
                }
            }
            if pose != Pose::default() {
                frame.vis.insert(row.id, pose);
            }
        }
        frame.ghosts = self
            .exits
            .values()
            .map(|e| Ghost {
                row: e.row.clone(),
                top: e.top,
                pose: Pose {
                    alpha: e.fade.value(now),
                    pit_alpha: if e.row.in_pits { 1.0 } else { 0.0 },
                    pit_dx: 0.0,
                    ..Pose::default()
                },
            })
            .collect();
        // HashMap no impone el orden del pintor: estabiliza la estructura de Scene.
        frame.ghosts.sort_by_key(|g| g.row.id.0);
        let frame = Arc::new(frame);
        self.idle_frame = (self.wake(now) == Wake::Idle).then(|| frame.clone());
        frame
    }
    fn clear_notice(&mut self, id: CarId) {
        self.idle_frame = None;
        self.notices.remove(&id);
        self.flash_tw.remove(&id);
        self.chip_tw.remove(&id);
    }
    fn prune(&mut self, now: f64) {
        self.notices.retain(|_, n| now - n.start < NOTICE);
        self.flash_tw.retain(|id, _| self.notices.contains_key(id));
        self.chip_tw.retain(|id, _| self.notices.contains_key(id));
    }
    fn admit(&mut self, event: Event, now: f64) {
        let priority = event.kind.priority();
        if !self.notices.contains_key(&event.row_id)
            && self.notices.len() >= 3
            && let Some((id, lowest)) = self
                .notices
                .iter()
                .min_by_key(|(_, n)| n.priority)
                .map(|(id, n)| (*id, n.priority))
        {
            if lowest >= priority {
                return;
            }
            self.clear_notice(id);
        }
        if self
            .notices
            .get(&event.row_id)
            .is_some_and(|n| n.priority > priority)
        {
            return;
        }
        self.clear_notice(event.row_id);
        self.notices.insert(
            event.row_id,
            Notice {
                priority,
                kind: event.kind,
                start: now,
                places: event.places,
            },
        );
        if event.kind == EventKind::Position {
            self.flash_tw
                .insert(event.row_id, animate(0.0, 1.0, now, 0.500, EASE_OUT));
            self.chip_tw
                .insert(event.row_id, animate(0.0, 1.0, now, 0.180, EASE));
        }
    }
    fn update_effects(
        &mut self,
        prev: &ContentPlan,
        next: &ContentPlan,
        rows: &[&Row],
        ids: &HashSet<CarId>,
        lap_visible: bool,
        now: f64,
    ) {
        self.battle = select_battle(next, ids, self.battle.as_ref());
        self.prune(now);
        for event in derive_events(prev, next, lap_visible) {
            if ids.contains(&event.row_id) {
                self.admit(event, now);
            }
        }
        for row in rows {
            let target = if self.battle.as_ref().is_some_and(|b| {
                (b.ahead == row.id || b.behind == row.id) && !self.notices.contains_key(&row.id)
            }) {
                1.0
            } else {
                0.0
            };
            self.battle_tw
                .entry(row.id)
                .or_insert_with(|| Tween::fixed(0.0).with_curve(EASE))
                .retarget(target, now, 0.200);
            let (alpha, dx) = self
                .pit_tw
                .entry(row.id)
                .or_insert_with(|| pit_tweens(row.in_pits));
            *alpha = alpha.with_curve(EASE);
            *dx = dx.with_curve(EASE);
            alpha.retarget(if row.in_pits { 1.0 } else { 0.0 }, now, 0.200);
            dx.retarget(if row.in_pits { 0.0 } else { -5.0 }, now, 0.200);
        }
        self.sync_best_marker(next, rows, now, true);
    }
    fn sync_best_marker(&mut self, content: &ContentPlan, rows: &[&Row], now: f64, animated: bool) {
        for row in rows {
            let target = if content.session_best.is_some_and(|(id, _)| id == row.id) {
                1.0
            } else {
                0.0
            };
            let t = self
                .best_tw
                .entry(row.id)
                .or_insert_with(|| Tween::fixed(target).with_curve(EASE));
            if animated {
                t.retarget(target, now, 0.220);
            } else {
                *t = Tween::fixed(target).with_curve(EASE);
            }
        }
    }
    fn tweens(&self) -> impl Iterator<Item = &Tween> {
        self.flips
            .values()
            .chain(self.fades.values())
            .chain(self.exits.values().map(|e| &e.fade))
            .chain(self.battle_tw.values())
            .chain(self.best_tw.values())
            .chain(self.flash_tw.values())
            .chain(self.chip_tw.values())
            .chain(self.pit_tw.values().flat_map(|(a, d)| [a, d]))
    }
    pub fn wake(&self, now: f64) -> Wake {
        if self.tweens().any(|t| t.active(now))
            || self
                .notices
                .values()
                .any(|n| n.kind != EventKind::Position && now - n.start < SWEEP)
        {
            return Wake::Frame;
        }
        self.notices
            .values()
            .map(|n| NOTICE - (now - n.start))
            .filter(|d| *d > 0.0)
            .min_by(f64::total_cmp)
            .map_or(Wake::Idle, Wake::At)
    }
    pub fn next_wake(&self, now: f64, hz: u16) -> Option<f64> {
        match self.wake(now) {
            Wake::Idle => None,
            Wake::At(delay) => Some(now + delay),
            Wake::Frame => self
                .tweens()
                .filter(|t| t.active(now))
                .map(|t| t.end())
                .chain(
                    self.notices
                        .values()
                        .filter(|n| n.kind != EventKind::Position && now - n.start < SWEEP)
                        .map(|n| n.start + SWEEP),
                )
                .min_by(f64::total_cmp)
                .map(|end| end.min(now + 1.0 / f64::from(hz.max(1)))),
        }
    }
}
