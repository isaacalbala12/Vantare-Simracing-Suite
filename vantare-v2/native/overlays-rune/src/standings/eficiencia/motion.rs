//! Port de Motion::update de GPUI; los efectos independientes entran en E6.
use super::model::{ContentPlan, Row, Status};
use crate::motion::Tween;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};
use vantare_domain::CarId;

#[cfg(test)]
#[path = "motion_tests.rs"]
mod tests;
const FADE: f64 = 0.200;
const EASE_OUT: [f32; 4] = [0.0, 0.0, 0.58, 1.0];
const FLIP: [f32; 4] = [0.22, 0.9, 0.3, 1.0];
#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Pose {
    pub offset: f32,
    pub alpha: f32,
}
impl Default for Pose {
    fn default() -> Self {
        Self {
            offset: 0.0,
            alpha: 1.0,
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
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Wake {
    Idle,
    Frame,
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
impl Motion {
    pub fn update(&mut self, content: &ContentPlan, visible: usize, now: f64) {
        self.idle_frame = None;
        if content.status != Status::Ready {
            *self = Self::default();
            return;
        }
        let rows: Vec<_> = content.rows.iter().take(visible).collect();
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
            }
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
        self.prev = Some(content.clone());
    }
    pub fn frame_shared(&mut self, now: f64) -> Arc<Frame> {
        self.exits.retain(|_, e| e.fade.active(now));
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
        frame.ghosts = self
            .exits
            .values()
            .map(|e| Ghost {
                row: e.row.clone(),
                top: e.top,
                pose: Pose {
                    alpha: e.fade.value(now),
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
    pub fn wake(&self, now: f64) -> Wake {
        // E6 añadirá aquí los canales independientes de efectos y sus avisos.
        if self
            .flips
            .values()
            .chain(self.fades.values())
            .any(|t| t.active(now))
            || self.exits.values().any(|e| e.fade.active(now))
        {
            Wake::Frame
        } else {
            Wake::Idle
        }
    }
    pub fn next_wake(&self, now: f64, hz: u16) -> Option<f64> {
        self.flips
            .values()
            .chain(self.fades.values())
            .chain(self.exits.values().map(|e| &e.fade))
            .filter(|t| t.active(now))
            .map(|t| t.end().min(now + 1.0 / f64::from(hz.max(1))))
            .min_by(f64::total_cmp)
    }
}
