//! Canales literales de GPUI standings::motion::Motion::update_rows (Vantare).
use crate::{motion::Tween, vantare::Style};
use std::collections::{HashMap, HashSet};
use vantare_domain::{CarId, standings::Board};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Flash {
    Gain,
    Loss,
    Lead,
    Best,
    PersonalBest,
    Pit,
}

#[derive(Clone, Copy)]
struct Snap {
    id: CarId,
    position: i64,
    leader: bool,
    pit: bool,
    best: Option<f64>,
    fastest: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct Pose {
    pub offset: f32,
    pub alpha: f32,
    pub flash: Option<(Flash, f32)>,
}
impl Default for Pose {
    fn default() -> Self {
        Self {
            offset: 0.0,
            alpha: 1.0,
            flash: None,
        }
    }
}
pub(super) type Frame = HashMap<CarId, Pose>;
struct Channels {
    top: f32,
    flip: Tween,
    fade: Tween,
    flip_end: f64,
    fade_end: f64,
}
#[derive(Default)]
pub(super) struct Motion {
    rows: HashMap<CarId, Channels>,
    flash: HashMap<CarId, (Flash, Tween)>,
    prev: Option<Vec<Snap>>,
    flash_ms: f64,
    seeded: bool,
}
impl Motion {
    /// Destellos por transición de fila, en el orden de GPUI: boxes, liderato,
    /// posición y vuelta rápida. La fuerza baja linealmente durante flash_ms.
    pub fn observe(&mut self, board: &Board, style: &Style, clock: f64, reduced: bool) {
        self.flash_ms = f64::from(style.motion.flash_ms) / 1000.0;
        let rows: Vec<_> = board.rows();
        let fastest = rows
            .iter()
            .filter_map(|row| Some((row.id, row.best_lap_s?)))
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(id, _)| id);
        let next: Vec<Snap> = rows
            .iter()
            .map(|row| Snap {
                id: row.id,
                position: row.position.parse().unwrap_or(0),
                leader: row.is_leader,
                pit: row.in_pits,
                best: row.best_lap_s,
                fastest: fastest == Some(row.id),
            })
            .collect();
        // Una fila que sale deja de pintar su destello.
        self.flash
            .retain(|id, _| next.iter().any(|row| row.id == *id));
        if reduced {
            self.prev = Some(next);
            self.flash.clear();
            return;
        }
        let Some(previous) = self.prev.take() else {
            self.prev = Some(next);
            return;
        };
        for now in &next {
            let Some(old) = previous.iter().find(|old| old.id == now.id) else {
                continue;
            };
            let kind = if now.pit && !old.pit {
                Some(Flash::Pit)
            } else if now.leader && !old.leader {
                Some(Flash::Lead)
            } else if now.position > 0 && now.position < old.position {
                Some(Flash::Gain)
            } else if now.position > old.position {
                Some(Flash::Loss)
            } else if now.fastest && !old.fastest {
                Some(Flash::Best)
            } else if match (old.best, now.best) {
                (Some(old), Some(new)) => new < old - 0.0005,
                _ => false,
            } {
                Some(Flash::PersonalBest)
            } else {
                None
            };
            if let Some(kind) = kind {
                let mut tween = Tween::linear(1.0);
                tween.retarget(0.0, clock, self.flash_ms);
                self.flash.insert(now.id, (kind, tween));
            } else if self
                .flash
                .get(&now.id)
                .is_some_and(|(_, t)| !t.active(clock))
            {
                self.flash.remove(&now.id);
            }
        }
        self.prev = Some(next);
    }
    pub fn update(&mut self, targets: &[(CarId, f32)], style: &Style, clock: f64, reduced: bool) {
        let first = !self.seeded;
        self.seeded = true;
        let visible: HashSet<_> = targets.iter().map(|(id, _)| *id).collect();
        // Vantare elimina las presencias salientes: no usa los ghosts de Eficiencia.
        self.rows.retain(|id, _| visible.contains(id));
        for &(id, top) in targets {
            if let Some(row) = self.rows.get_mut(&id) {
                let from = row.top + row.flip.value(clock) - top;
                if from.abs() > 0.01 {
                    // Tween común: CubicOut, como Curve::CubicOut de GPUI.
                    row.flip = Tween::fixed(from);
                    row.flip
                        .retarget(0.0, clock, f64::from(style.motion.reorder_ms) / 1000.0);
                    row.flip_end = clock + f64::from(style.motion.reorder_ms) / 1000.0;
                }
                row.top = top;
            } else {
                let mut fade = Tween::linear(if first || reduced { 1.0 } else { 0.0 });
                fade.retarget(1.0, clock, f64::from(style.motion.fade_ms) / 1000.0);
                self.rows.insert(
                    id,
                    Channels {
                        top,
                        flip: Tween::fixed(0.0),
                        fade,
                        flip_end: clock,
                        fade_end: clock + f64::from(style.motion.fade_ms) / 1000.0,
                    },
                );
            }
        }
        if reduced {
            self.settle();
        }
    }
    /// Coloca las filas en su sitio sin FLIP, como `Motion::snap` de GPUI cuando
    /// solo cambian las opciones sobre el mismo tablero.
    pub fn snap(&mut self, targets: &[(CarId, f32)], clock: f64) {
        self.seeded = true;
        let visible: HashSet<_> = targets.iter().map(|(id, _)| *id).collect();
        self.rows.retain(|id, _| visible.contains(id));
        for &(id, top) in targets {
            let row = self.rows.entry(id).or_insert_with(|| Channels {
                top,
                flip: Tween::fixed(0.0),
                fade: Tween::fixed(1.0),
                flip_end: clock,
                fade_end: clock,
            });
            row.top = top;
            row.flip = Tween::fixed(0.0);
            row.flip_end = clock;
        }
    }
    pub fn sample(&self, clock: f64) -> Frame {
        self.rows
            .iter()
            .map(|(&id, row)| {
                (
                    id,
                    Pose {
                        offset: row.flip.value(clock),
                        alpha: row.fade.value(clock),
                        flash: self.flash.get(&id).and_then(|(kind, tween)| {
                            tween.active(clock).then_some((*kind, tween.value(clock)))
                        }),
                    },
                )
            })
            .collect()
    }
    pub fn next_wake(&self, clock: f64, hz: u16) -> Option<f64> {
        // El último frame cae en el final del canal, sin un wake después del fade/FLIP.
        self.rows
            .values()
            .flat_map(|row| {
                [
                    row.flip.active(clock).then_some(row.flip_end),
                    row.fade.active(clock).then_some(row.fade_end),
                ]
            })
            .flatten()
            .map(|end| end.min(clock + 1.0 / f64::from(hz)))
            .min_by(f64::total_cmp)
            .or_else(|| {
                self.flash
                    .values()
                    .filter(|(_, tween)| tween.active(clock))
                    .map(|(_, tween)| tween.end().min(clock + 1.0 / f64::from(hz)))
                    .min_by(f64::total_cmp)
            })
    }
    pub fn settle(&mut self) {
        for row in self.rows.values_mut() {
            row.flip = Tween::fixed(0.0);
            row.fade = Tween::fixed(1.0);
            row.flip_end = 0.0;
            row.fade_end = 0.0;
        }
        self.flash.clear();
    }
}
