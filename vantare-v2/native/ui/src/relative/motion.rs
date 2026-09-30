//! FLIP 220–300 ms, presencia 120 ms y aviso de cruce 480 ms del productivo.
//! Reloj inyectado: no hay tareas, timers ni animaciones sin final.

use std::time::Instant;
use vantare_domain::relative::{Row, Side, ViewModel};

#[derive(Clone)]
pub(super) struct Visual {
    pub row: Row,
    pub y: f32,
    pub opacity: f32,
    pub cue: Option<(u32, f32)>,
}

struct Transition {
    row: Row,
    from_y: f32,
    to_y: f32,
    from_opacity: f32,
    to_opacity: f32,
    slide_ms: f32,
    cue: Option<u32>,
}

#[derive(Default)]
pub(super) struct Motion {
    start: Option<Instant>,
    transitions: Vec<Transition>,
}

impl Motion {
    pub fn update(&mut self, old: &ViewModel, next: &ViewModel, now: Instant) {
        let structure = |vm: &ViewModel| {
            vm.slots
                .iter()
                .map(|r| r.as_ref().map(|r| (r.id, r.side)))
                .collect::<Vec<_>>()
        };
        if structure(old) == structure(next) {
            return;
        }
        let previous = self.sample(old, now);
        self.transitions.clear();
        // La primera foto fija la base; no anima reconexiones ni al jugador.
        if old.slots.iter().all(Option::is_none) && self.start.is_none() {
            self.start = None;
            return;
        }
        for (index, row) in next
            .slots
            .iter()
            .enumerate()
            .filter_map(|(i, r)| r.as_ref().map(|r| (i, r)))
        {
            if row.side == Side::Player {
                continue;
            }
            let before = previous.iter().find(|v| v.row.id == row.id);
            let target = index as f32;
            let from_y = before.map_or(target, |v| v.y);
            // Un fantasma que vuelve conserva su posición/opacidad, pero no
            // demuestra un cruce: la comparación semántica usa el modelo previo.
            let cue = old
                .slots
                .iter()
                .flatten()
                .find(|r| r.id == row.id)
                .and_then(|r| match (r.side, row.side) {
                    (Side::Ahead, Side::Behind) => Some(0x7fb686),
                    (Side::Behind, Side::Ahead) => Some(0xd95360),
                    _ => None,
                });
            if from_y == target && before.is_some_and(|v| v.opacity == 1.0) && cue.is_none() {
                continue;
            }
            self.transitions.push(Transition {
                row: row.clone(),
                from_y,
                to_y: target,
                from_opacity: before.map_or(0.0, |v| v.opacity),
                to_opacity: 1.0,
                slide_ms: (220.0 + (from_y - target).abs() * 20.0).min(300.0),
                cue,
            });
        }
        for before in previous {
            if before.row.side != Side::Player
                && !next.slots.iter().flatten().any(|r| r.id == before.row.id)
            {
                self.transitions.push(Transition {
                    row: before.row,
                    from_y: before.y,
                    to_y: before.y,
                    from_opacity: before.opacity,
                    to_opacity: 0.0,
                    slide_ms: 0.0,
                    cue: None,
                });
            }
        }
        self.start = Some(now);
    }

    pub fn animating(&self, now: Instant) -> bool {
        self.start.is_some_and(|start| {
            self.transitions.iter().any(|t| {
                let duration = if t.cue.is_some() {
                    480.0
                } else {
                    t.slide_ms.max(120.0)
                };
                now.saturating_duration_since(start).as_secs_f32() * 1000.0 < duration
            })
        })
    }

    pub fn sample(&self, vm: &ViewModel, now: Instant) -> Vec<Visual> {
        let mut rows = vm
            .slots
            .iter()
            .enumerate()
            .filter_map(|(index, row)| {
                row.as_ref().map(|row| Visual {
                    row: row.clone(),
                    y: index as f32,
                    opacity: 1.0,
                    cue: None,
                })
            })
            .collect::<Vec<_>>();
        let Some(start) = self.start else {
            return rows;
        };
        let elapsed = now.saturating_duration_since(start).as_secs_f32() * 1000.0;
        for transition in &self.transitions {
            let fade = ease((elapsed / 120.0).clamp(0.0, 1.0), 0.0, 0.0, 0.58, 1.0);
            let slide = if transition.slide_ms > 0.0 {
                ease(
                    (elapsed / transition.slide_ms).clamp(0.0, 1.0),
                    0.2,
                    0.65,
                    0.3,
                    1.0,
                )
            } else {
                1.0
            };
            let visual = Visual {
                row: rows
                    .iter()
                    .find(|v| v.row.id == transition.row.id)
                    .map_or_else(|| transition.row.clone(), |v| v.row.clone()),
                y: transition.from_y + (transition.to_y - transition.from_y) * slide,
                opacity: transition.from_opacity
                    + (transition.to_opacity - transition.from_opacity) * fade,
                cue: transition.cue.filter(|_| elapsed < 480.0).map(|color| {
                    (
                        color,
                        0.04 * (1.0 - ease((elapsed / 480.0).clamp(0.0, 1.0), 0.0, 0.0, 0.58, 1.0)),
                    )
                }),
            };
            if let Some(row) = rows.iter_mut().find(|v| v.row.id == visual.row.id) {
                *row = visual;
            } else if elapsed < 120.0 {
                rows.push(visual);
            }
        }
        rows
    }
}

fn ease(x: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let axis =
        |a, b, t: f32| 3.0 * (1.0 - t).powi(2) * t * a + 3.0 * (1.0 - t) * t * t * b + t * t * t;
    let (mut low, mut high) = (0.0, 1.0);
    for _ in 0..20 {
        let mid = f32::midpoint(low, high);
        if axis(x1, x2, mid) < x {
            low = mid;
        } else {
            high = mid;
        }
    }
    axis(y1, y2, f32::midpoint(low, high))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use vantare_domain::{CarId, Snapshot, format::Preferences, relative};

    fn model(side: Side, slot: usize) -> ViewModel {
        let mut vm = relative::project(&Snapshot::default(), Preferences::default());
        vm.slots[slot] = Some(Row {
            id: CarId(2),
            side,
            position: "2".into(),
            number: String::new(),
            driver: "Rival".into(),
            class: "LMP2".into(),
            gap: "—".into(),
            best_lap: "—".into(),
            lap_delta: None,
            last_lap: "—".into(),
            last_lap_stale: false,
            position_stale: false,
            best_lap_stale: false,
            gap_stale: false,
        });
        vm
    }

    #[test]
    fn motion_and_cross_notice_finish_without_sleep() {
        let now = Instant::now();
        let old = model(Side::Ahead, 2);
        let next = model(Side::Behind, 4);
        let mut motion = Motion::default();
        motion.update(&old, &next, now);
        assert!(motion.animating(now));
        assert_eq!(motion.sample(&next, now)[0].y, 2.0);
        assert_eq!(
            motion.sample(&next, now)[0].cue.map(|c| c.0),
            Some(0x7fb686)
        );
        assert!(motion.animating(now + Duration::from_millis(479)));
        assert!(!motion.animating(now + Duration::from_millis(480)));
        let finished = motion.sample(&next, now + Duration::from_millis(500));
        assert!((finished[0].y - 4.0).abs() < 0.001);
        assert!(finished[0].cue.is_none());
    }

    #[test]
    fn exits_expire_and_telemetry_does_not_restart_motion() {
        let now = Instant::now();
        let old = model(Side::Ahead, 2);
        let next = relative::project(&Snapshot::default(), Preferences::default());
        let mut motion = Motion::default();
        motion.update(&old, &next, now);
        assert_eq!(motion.sample(&next, now).len(), 1);
        assert!(
            motion
                .sample(&next, now + Duration::from_millis(120))
                .is_empty()
        );
        assert!(!motion.animating(now + Duration::from_millis(120)));
        let mut text = old.clone();
        text.slots[2].as_mut().expect("rival").gap = "+0.3".into();
        motion.update(&old, &text, now + Duration::from_secs(1));
        assert!(!motion.animating(now + Duration::from_secs(1)));
    }

    #[test]
    fn a_fast_reentry_keeps_opacity_without_inventing_a_side_cross() {
        let now = Instant::now();
        let old = model(Side::Ahead, 2);
        let empty = relative::project(&Snapshot::default(), Preferences::default());
        let mut motion = Motion::default();
        motion.update(&old, &empty, now);
        let returning = model(Side::Behind, 4);
        let instant = now + Duration::from_millis(60);
        let fading = motion.sample(&empty, instant)[0].opacity;
        motion.update(&empty, &returning, instant);
        let visual = motion.sample(&returning, instant);
        assert!((visual[0].opacity - fading).abs() < 0.001);
        assert!(visual[0].cue.is_none());
        assert!(!motion.animating(instant + Duration::from_millis(500)));
    }
}
