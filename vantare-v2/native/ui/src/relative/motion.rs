//! Un historial de filas y sus transiciones; cada pintor aplica su política visual.
use crate::vantare::motion::{Flash, Pose, Sample, Timing};
use std::{
    collections::HashMap,
    ops::{Deref, DerefMut},
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{
    CarId,
    relative::{Row, Side, ViewModel},
};

#[derive(Clone)]
pub(crate) struct Visual {
    pub row: Arc<Row>,
    pub y: f32,
    pub opacity: f32,
    pub cue: Option<(u32, f32)>,
}
#[derive(Clone, Copy)]
enum Policy {
    Eficiencia,
    Vantare(Timing),
}
#[derive(Clone)]
struct Transition {
    row: Arc<Row>,
    from_y: f32,
    to_y: f32,
    from_opacity: f32,
    to_opacity: f32,
    slide_ms: f32,
    start: Instant,
    fade_start: Instant,
    flash: Option<(Flash, Instant)>,
    policy: Policy,
    visible: bool,
}
impl Transition {
    fn fixed(row: Arc<Row>, y: f32, now: Instant) -> Self {
        Self {
            row,
            from_y: y,
            to_y: y,
            from_opacity: 1.0,
            to_opacity: 1.0,
            slide_ms: 0.0,
            start: now,
            fade_start: now,
            flash: None,
            policy: Policy::Eficiencia,
            visible: true,
        }
    }
    fn sample(&self, now: Instant) -> (f32, f32) {
        let elapsed = now.saturating_duration_since(self.start);
        let (slide, fade) = match self.policy {
            Policy::Eficiencia => {
                let ms = elapsed.as_secs_f32() * 1000.0;
                (
                    if self.slide_ms > 0.0 {
                        ease((ms / self.slide_ms).clamp(0.0, 1.0), 0.2, 0.65, 0.3, 1.0)
                    } else {
                        1.0
                    },
                    ease((ms / 120.0).clamp(0.0, 1.0), 0.0, 0.0, 0.58, 1.0),
                )
            }
            Policy::Vantare(timing) => {
                let fraction = |d: Duration| {
                    if d.is_zero() {
                        1.0
                    } else {
                        (elapsed.as_secs_f32() / d.as_secs_f32()).clamp(0.0, 1.0)
                    }
                };
                let fade_elapsed = now.saturating_duration_since(self.fade_start);
                let fade = if timing.fade.is_zero() {
                    1.0
                } else {
                    (fade_elapsed.as_secs_f32() / timing.fade.as_secs_f32()).clamp(0.0, 1.0)
                };
                (1.0 - (1.0 - fraction(timing.reorder)).powi(3), fade)
            }
        };
        (
            self.from_y + (self.to_y - self.from_y) * slide,
            self.from_opacity + (self.to_opacity - self.from_opacity) * fade,
        )
    }
}
#[derive(Clone, Default)]
pub(crate) struct Rows {
    transitions: Vec<Transition>,
    index: HashMap<CarId, usize>,
    seeded: bool,
    transferred: Vec<(CarId, Flash, Instant, i64)>,
    origin: f32,
    scale: f32,
}
#[derive(Clone)]
pub(crate) struct Motion {
    pub(crate) rows: Rows,
    pub(crate) dots: crate::vantare::motion::Motion,
    pub(crate) started: Instant,
}
impl Default for Motion {
    fn default() -> Self {
        Self {
            rows: Rows {
                scale: 1.0,
                ..Rows::default()
            },
            dots: Default::default(),
            started: Instant::now(),
        }
    }
}
impl Deref for Motion {
    type Target = Rows;
    fn deref(&self) -> &Rows {
        &self.rows
    }
}
impl DerefMut for Motion {
    fn deref_mut(&mut self) -> &mut Rows {
        &mut self.rows
    }
}
impl Motion {
    pub(super) fn update(&mut self, old: &ViewModel, next: &ViewModel, now: Instant) {
        self.rows.update_content(old, next, now);
    }
    pub(crate) fn settle(&mut self) {
        self.rows.settle();
        self.dots.settle();
    }
}
impl Rows {
    fn reindex(&mut self) {
        self.index = self
            .transitions
            .iter()
            .enumerate()
            .map(|(i, t)| (t.row.id, i))
            .collect();
    }
    #[cfg(test)]
    pub(super) fn notices(&self) -> Vec<(CarId, Flash, Instant, i64)> {
        let mut result = self.transferred.clone();
        result.extend(
            self.transitions
                .iter()
                .filter_map(|t| t.flash.map(|(kind, at)| (t.row.id, kind, at, 0))),
        );
        result
    }
    #[cfg(test)]
    pub(super) fn restore_notices(&mut self, notices: &[(CarId, Flash, Instant, i64)]) {
        self.transferred = notices.to_vec();
    }
    pub(super) fn update_content(&mut self, old: &ViewModel, next: &ViewModel, now: Instant) {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Motion);
        self.transferred
            .retain(|n| now.saturating_duration_since(n.2).as_millis() < 480);
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
        let first = old.slots.iter().all(Option::is_none) && !self.seeded;
        for (i, row) in next
            .slots
            .iter()
            .enumerate()
            .filter_map(|(i, r)| r.as_ref().map(|r| (i, r)))
        {
            let target = i as f32;
            if first || row.side == Side::Player {
                self.transitions
                    .push(Transition::fixed(row.clone(), target, now));
                continue;
            }
            let before = previous.iter().find(|v| v.row.id == row.id);
            let from_y = before.map_or(target, |v| v.y);
            let flash = old
                .slots
                .iter()
                .flatten()
                .find(|r| r.id == row.id)
                .and_then(|r| match (r.side, row.side) {
                    (Side::Ahead, Side::Behind) => Some((Flash::Gain, now)),
                    (Side::Behind, Side::Ahead) => Some((Flash::Loss, now)),
                    _ => None,
                });
            self.transitions.push(Transition {
                row: row.clone(),
                from_y,
                to_y: target,
                from_opacity: before.map_or(0.0, |v| v.opacity),
                to_opacity: 1.0,
                slide_ms: if from_y == target
                    && before.is_some_and(|v| v.opacity == 1.0)
                    && flash.is_none()
                {
                    0.0
                } else {
                    (220.0 + (from_y - target).abs() * 20.0).min(300.0)
                },
                start: now,
                fade_start: now,
                flash,
                policy: Policy::Eficiencia,
                visible: true,
            });
        }
        if !first {
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
                        start: now,
                        fade_start: now,
                        flash: None,
                        policy: Policy::Eficiencia,
                        visible: false,
                    });
                }
            }
        }
        self.transferred.retain(|n| {
            !self
                .transitions
                .iter()
                .any(|t| t.row.id == n.0 && t.flash.is_some())
        });
        self.seeded = true;
        self.origin = 0.0;
        self.scale = 1.0;
        self.reindex();
    }
    pub(super) fn animating(&self, now: Instant) -> bool {
        self.transferred
            .iter()
            .any(|n| now.saturating_duration_since(n.2).as_millis() < 480)
            || self.transitions.iter().any(|t| {
                let duration = match t.policy {
                    Policy::Eficiencia => {
                        if t.flash.is_some() {
                            480.0
                        } else {
                            t.slide_ms.max(120.0)
                        }
                    }
                    Policy::Vantare(timing) => {
                        timing
                            .reorder
                            .max(timing.fade)
                            .max(timing.flash)
                            .as_secs_f32()
                            * 1000.0
                    }
                };
                (t.from_y != t.to_y
                    || t.from_opacity != t.to_opacity
                    || t.flash.is_some()
                    || !t.visible)
                    && now.saturating_duration_since(t.start).as_secs_f32() * 1000.0 < duration
            })
    }
    pub(super) fn sample(&self, vm: &ViewModel, now: Instant) -> Vec<Visual> {
        let mut rows = vm
            .slots
            .iter()
            .enumerate()
            .filter_map(|(i, r)| {
                r.as_ref().map(|r| Visual {
                    row: r.clone(),
                    y: i as f32,
                    opacity: 1.0,
                    cue: None,
                })
            })
            .collect::<Vec<_>>();
        for t in &self.transitions {
            let (y, opacity) = t.sample(now);
            let cue = t.flash.and_then(|(kind, at)| {
                let elapsed = now.saturating_duration_since(at).as_secs_f32() * 1000.0;
                (elapsed < 480.0).then_some((
                    if kind == Flash::Loss {
                        0xd95360
                    } else {
                        0x7fb686
                    },
                    0.04 * (1.0 - ease((elapsed / 480.0).clamp(0.0, 1.0), 0.0, 0.0, 0.58, 1.0)),
                ))
            });
            let visual = Visual {
                row: rows
                    .iter()
                    .find(|v| v.row.id == t.row.id)
                    .map_or_else(|| t.row.clone(), |v| v.row.clone()),
                y,
                opacity,
                cue,
            };
            if let Some(row) = rows.iter_mut().find(|v| v.row.id == visual.row.id) {
                *row = visual;
            } else if opacity > 0.0 {
                rows.push(visual);
            }
        }
        for &(id, kind, at, _) in &self.transferred {
            let elapsed = now.saturating_duration_since(at).as_secs_f32() * 1000.0;
            if elapsed < 480.0
                && let Some(row) = rows.iter_mut().find(|r| r.row.id == id)
            {
                row.cue = Some((
                    if kind == Flash::Loss {
                        0xd95360
                    } else {
                        0x7fb686
                    },
                    0.04 * (1.0 - ease((elapsed / 480.0).clamp(0.0, 1.0), 0.0, 0.0, 0.58, 1.0)),
                ));
            }
        }
        rows
    }
    pub(crate) fn relayout(
        &mut self,
        board: &ViewModel,
        samples: &[Sample],
        scale: f32,
        origin: f32,
    ) {
        let ratio = scale / self.scale.max(f32::EPSILON);
        for t in &mut self.transitions {
            let target = samples
                .iter()
                .find(|s| s.id == t.row.id)
                .map_or_else(|| origin + (t.to_y - self.origin) * ratio, |s| s.y);
            t.from_y = target + (t.from_y - t.to_y) * ratio;
            t.to_y = target;
            if let Some(row) = board.slots.iter().flatten().find(|r| r.id == t.row.id) {
                t.row = row.clone();
            }
        }
        let now = Instant::now();
        for sample in samples {
            if !self.index.contains_key(&sample.id)
                && let Some(row) = board.slots.iter().flatten().find(|r| r.id == sample.id)
            {
                self.transitions
                    .push(Transition::fixed(row.clone(), sample.y, now));
            }
        }
        self.origin = origin;
        self.scale = scale;
        self.seeded = true;
        self.reindex();
    }
    pub(crate) fn update_rows(
        &mut self,
        board: &ViewModel,
        samples: &[Sample],
        timing: Timing,
        now: Instant,
    ) {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Motion);
        let mut next = Vec::with_capacity(samples.len());
        for sample in samples {
            let Some(row) = board.slots.iter().flatten().find(|r| r.id == sample.id) else {
                continue;
            };
            let previous = self.index.get(&sample.id).map(|&i| &self.transitions[i]);
            let old = previous.filter(|t| t.visible);
            let (from_y, from_opacity) = old
                .map_or((sample.y, if self.seeded { 0.0 } else { 1.0 }), |t| {
                    t.sample(now)
                });
            let old_position = old.map(|t| match t.row.side {
                Side::Ahead => 2,
                Side::Player => 1,
                Side::Behind => 0,
            });
            let flash = old
                .and_then(|t| {
                    if sample.in_pits && !t.row.in_pits {
                        Some((Flash::Pit, now))
                    } else if Some(sample.position) < old_position {
                        Some((Flash::Gain, now))
                    } else if Some(sample.position) > old_position {
                        Some((Flash::Loss, now))
                    } else {
                        t.flash
                    }
                })
                .or_else(|| previous.and_then(|t| t.flash));
            let mut transition = Transition {
                row: row.clone(),
                from_y,
                to_y: sample.y,
                from_opacity,
                to_opacity: 1.0,
                slide_ms: 0.0,
                start: now,
                fade_start: now,
                flash,
                policy: Policy::Vantare(timing),
                visible: true,
            };
            if let Some(old) = old {
                if (from_y - sample.y).abs() <= 0.01 {
                    transition.from_y = sample.y;
                    transition.start = old.start;
                }
                // El fundido conserva su reloj aunque se actualice otro campo.
                if old.from_opacity != old.to_opacity {
                    transition.from_opacity = old.from_opacity;
                    transition.fade_start = old.fade_start;
                }
            }
            next.push(transition);
        }
        for old in &self.transitions {
            if !samples.iter().any(|s| s.id == old.row.id)
                && old
                    .flash
                    .is_some_and(|(_, at)| now.saturating_duration_since(at) < timing.flash)
            {
                let mut hidden = old.clone();
                hidden.visible = false;
                next.push(hidden);
            }
        }
        self.transitions = next;
        self.seeded = true;
        self.reindex();
    }
    pub(crate) fn pose(&self, id: CarId, timing: Timing, now: Instant) -> Pose {
        let Some(&i) = self.index.get(&id) else {
            return Pose::default();
        };
        let t = &self.transitions[i];
        let (y, alpha) = t.sample(now);
        let flash = t
            .flash
            .or_else(|| {
                self.transferred
                    .iter()
                    .find(|n| n.0 == id)
                    .map(|n| (n.1, n.2))
            })
            .and_then(|(kind, at)| {
                let p = if timing.flash.is_zero() {
                    1.0
                } else {
                    (now.saturating_duration_since(at).as_secs_f32() / timing.flash.as_secs_f32())
                        .clamp(0.0, 1.0)
                };
                (p < 1.0).then_some((kind, 1.0 - p))
            });
        Pose {
            offset: y - t.to_y,
            alpha,
            flash,
        }
    }
    pub(crate) fn wake(&self, timing: Timing, now: Instant) -> crate::app::Wake {
        if self.transitions.iter().filter(|t| t.visible).any(|t| {
            let pose = self.pose(t.row.id, timing, now);
            pose.offset != 0.0 || pose.alpha < 1.0 || pose.flash.is_some()
        }) {
            crate::app::Wake::Frame
        } else {
            crate::app::Wake::Idle
        }
    }
    pub(crate) fn snap(&mut self, samples: &[Sample]) {
        for t in &mut self.transitions {
            if let Some(s) = samples.iter().find(|s| s.id == t.row.id) {
                t.from_y = s.y;
                t.to_y = s.y;
            }
        }
    }
    pub(crate) fn settle(&mut self) {
        for t in &mut self.transitions {
            t.from_y = t.to_y;
            t.from_opacity = t.to_opacity;
            t.flash = None;
        }
        self.transferred.clear();
    }
}

#[cfg(test)]
impl Motion {
    pub(super) fn clock_signature(
        &self,
    ) -> (
        Instant,
        Vec<(CarId, Instant, Instant, Option<(Flash, Instant)>)>,
        Vec<(CarId, Instant, Option<Instant>, Option<(Flash, Instant)>)>,
    ) {
        let mut rows = self
            .rows
            .transitions
            .iter()
            .map(|t| (t.row.id, t.start, t.fade_start, t.flash))
            .collect::<Vec<_>>();
        rows.sort_by_key(|r| r.0.0);
        (self.started, rows, self.dots.clock_signature())
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
        let mut row = std::sync::Arc::new(Row::default());
        let r = std::sync::Arc::make_mut(&mut row);
        r.id = CarId(2);
        r.side = side;
        r.position = "2".into();
        r.driver = "Rival".into();
        r.class = "LMP2".into();
        r.gap = "—".into();
        r.best_lap = "—".into();
        r.last_lap = "—".into();
        vm.slots[slot] = Some(row);
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
        std::sync::Arc::make_mut(text.slots[2].as_mut().expect("rival")).gap = "+0.3".into();
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
