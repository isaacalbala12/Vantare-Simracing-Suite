//! Canales literales de GPUI standings::motion::Motion::update_rows (Vantare).
use crate::{motion::Tween, vantare::Style};
use std::collections::{HashMap, HashSet};
use vantare_domain::CarId;

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
    seeded: bool,
}
impl Motion {
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
    pub fn sample(&self, clock: f64) -> Frame {
        self.rows
            .iter()
            .map(|(&id, row)| {
                (
                    id,
                    Pose {
                        offset: row.flip.value(clock),
                        alpha: row.fade.value(clock),
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
    }
    pub fn settle(&mut self) {
        for row in self.rows.values_mut() {
            row.flip = Tween::fixed(0.0);
            row.fade = Tween::fixed(1.0);
        }
    }
}
