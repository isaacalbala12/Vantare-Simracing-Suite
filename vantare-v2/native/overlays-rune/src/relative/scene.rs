//! Relative scene shared by both Looks: domain rows and semantic, sampled motion.
//! The canonical layout supplies coordinates; no Rune values, colors or window.
use super::motion::Tween;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use vantare_domain::{
    SourceState,
    relative::{Banner, Board, Dot, Row, Side},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AlertKind {
    Pits,
    Gain,
    Loss,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Alert {
    pub kind: AlertKind,
    pub opacity: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VisualRow {
    pub row: Arc<Row>,
    /// Posición interpolada en las coordenadas del layout canónico; no es un índice.
    pub slot: f32,
    pub opacity: f32,
    pub alert: Option<Alert>,
    pub traffic_opacity: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VisualDot {
    pub dot: Dot,
    pub offset_s: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    /// Header/footer facts and the canonical occupied slots; no Look-specific labels.
    pub board: Arc<Board>,
    pub rows: Vec<VisualRow>,
    pub strip: Vec<VisualDot>,
    pub paused: bool,
}

#[derive(Clone, Copy)]
pub struct Timing {
    pub reorder: f64,
    pub fade: f64,
    pub flash: f64,
    pub pulse: f64,
}

pub(super) struct MovingRow {
    row: Arc<Row>,
    pub(super) slot: Tween,
    pub(super) fade: Tween,
    pub(super) flash: Option<(AlertKind, f64)>,
    active: bool,
}
struct MovingDot {
    dot: Dot,
    offset: Tween,
}

/// Concrete Relative motion state, reusable unchanged by Vantare and Eficiencia.
pub struct Motion {
    pub(super) rows: BTreeMap<u32, MovingRow>,
    order: Vec<u32>,
    dots: Vec<MovingDot>,
    timing: Timing,
    pub(super) reduced: bool,
    hz: u16,
    started: f64,
    pub(super) next_pulse: Option<f64>,
    pulse: f32,
}
pub fn waiting(board: &Board) -> bool {
    !board.player_present || matches!(board.source_state, SourceState::Waiting | SourceState::Lost)
}
fn rank(side: Side) -> u8 {
    match side {
        Side::Ahead => 2,
        Side::Player => 1,
        Side::Behind => 0,
    }
}
impl Motion {
    pub fn new(timing: Timing, reduced: bool, hz: u16, clock: f64) -> Self {
        Self {
            rows: BTreeMap::new(),
            order: Vec::new(),
            dots: Vec::new(),
            timing,
            reduced,
            hz,
            started: clock,
            next_pulse: None,
            pulse: 0.0,
        }
    }
    pub fn policy(&mut self, reduced: bool, hz: u16) -> bool {
        let changed = self.reduced != reduced;
        if self.hz != hz {
            self.next_pulse = None;
        }
        if changed && reduced {
            self.next_pulse = None;
            self.pulse = 0.0;
            self.rows.retain(|_, row| row.active);
            self.order.retain(|id| self.rows.contains_key(id));
            for row in self.rows.values_mut() {
                row.slot.settle();
                row.fade = Tween::linear(1.0);
                row.flash = None;
            }
            for dot in &mut self.dots {
                dot.offset.settle();
            }
        }
        self.reduced = reduced;
        self.hz = hz;
        changed
    }
    /// `positions` contains the canonical layout target for each Board::slots entry.
    pub fn update(&mut self, board: &Board, positions: &[f32], snap: bool, clock: f64) {
        let snap = snap || self.reduced || waiting(board);
        let active: BTreeSet<_> = board.slots.iter().flatten().map(|row| row.id.0).collect();
        for (&id, row) in &mut self.rows {
            if !active.contains(&id) && row.active {
                row.active = false;
                row.fade.retarget(0.0, clock, self.timing.fade);
            }
        }
        self.order.clear();
        if !waiting(board) {
            for (slot, row) in board
                .slots
                .iter()
                .enumerate()
                .filter_map(|(i, r)| r.as_ref().map(|r| (i, r)))
            {
                if let Some(moving) = self.rows.get_mut(&row.id.0) {
                    if snap {
                        moving.slot = Tween::fixed(positions[slot]);
                        moving.fade = Tween::linear(1.0);
                        moving.flash = None;
                    } else {
                        let kind = if row.in_pits && !moving.row.in_pits {
                            Some(AlertKind::Pits)
                        } else if rank(row.side) < rank(moving.row.side) {
                            Some(AlertKind::Gain)
                        } else if rank(row.side) > rank(moving.row.side) {
                            Some(AlertKind::Loss)
                        } else {
                            None
                        };
                        if let Some(kind) = kind {
                            moving.flash = Some((kind, clock));
                        }
                        moving
                            .slot
                            .retarget(positions[slot], clock, self.timing.reorder);
                        moving.fade.retarget(1.0, clock, self.timing.fade);
                    }
                    moving.row = row.clone();
                    moving.active = true;
                } else {
                    let mut fade = Tween::linear(if snap { 1.0 } else { 0.0 });
                    if !snap {
                        fade.retarget(1.0, clock, self.timing.fade);
                    }
                    self.rows.insert(
                        row.id.0,
                        MovingRow {
                            row: row.clone(),
                            slot: Tween::fixed(positions[slot]),
                            fade,
                            flash: None,
                            active: true,
                        },
                    );
                }
                self.order.push(row.id.0);
            }
        }
        if snap {
            self.rows
                .retain(|id, row| row.active && active.contains(id) && !waiting(board));
        }
        self.order.extend(
            self.rows
                .iter()
                .filter(|(_, r)| !r.active)
                .map(|(&id, _)| id),
        );
        self.dots = if waiting(board) {
            Vec::new()
        } else {
            board
                .strip
                .iter()
                .map(|dot| {
                    let mut offset = self
                        .dots
                        .iter()
                        .find(|d| d.dot.id == dot.id)
                        .map_or_else(|| Tween::fixed(dot.offset_s as f32), |d| d.offset);
                    if snap {
                        offset = Tween::fixed(dot.offset_s as f32);
                    } else {
                        offset.retarget(dot.offset_s as f32, clock, self.timing.reorder);
                    }
                    MovingDot {
                        dot: dot.clone(),
                        offset,
                    }
                })
                .collect()
        };
    }
    pub fn advance(&mut self, board: &Board, clock: f64) {
        let pulsing = !self.reduced
            && board.banner != Some(Banner::FullCourseYellow)
            && self.rows.values().any(|r| r.active && r.row.fast_traffic);
        if pulsing && self.next_pulse.is_none_or(|due| clock >= due) {
            self.next_pulse =
                Some(clock + 1.0 / f64::from(if self.hz == 0 { 30 } else { self.hz }));
            self.pulse = (0.5
                - 0.5
                    * ((clock - self.started) / self.timing.pulse.max(0.001)
                        * std::f64::consts::TAU)
                        .cos()) as f32;
        }
        if !pulsing {
            self.next_pulse = None;
            self.pulse = 0.0;
        }
        self.rows.retain(|_, r| r.active || r.fade.active(clock));
        self.order.retain(|id| self.rows.contains_key(id));
        for row in self.rows.values_mut() {
            if row
                .flash
                .is_some_and(|(_, start)| clock >= start + self.timing.flash)
            {
                row.flash = None;
            }
        }
    }
    pub fn next_wake(&self, clock: f64, strip: bool) -> Option<f64> {
        if self.reduced {
            return None;
        }
        if self
            .rows
            .values()
            .any(|r| r.slot.active(clock) || r.fade.active(clock) || r.flash.is_some())
            || (strip && self.dots.iter().any(|d| d.offset.active(clock)))
        {
            Some(clock)
        } else {
            self.next_pulse
        }
    }
}

/// Pure sampling: a Look chooses colors and pixel geometry, never movement or alert strength.
pub fn visual_rows(motion: &Motion, clock: f64) -> Vec<VisualRow> {
    motion
        .order
        .iter()
        .map(|id| {
            let moving = &motion.rows[id];
            let alert = moving
                .flash
                .map(|(kind, start)| Alert {
                    kind,
                    opacity: (1.0 - ((clock - start) / motion.timing.flash.max(0.001)) as f32)
                        .clamp(0.0, 1.0),
                })
                .filter(|a| a.opacity > 0.0);
            VisualRow {
                row: moving.row.clone(),
                slot: moving.slot.value(clock),
                opacity: moving.fade.value(clock),
                alert,
                traffic_opacity: if moving.active
                    && moving.row.fast_traffic
                    && motion.next_pulse.is_some()
                {
                    motion.pulse
                } else {
                    0.0
                },
            }
        })
        .collect()
}
pub fn sample(board: Arc<Board>, motion: &Motion, paused: bool, clock: f64) -> Scene {
    Scene {
        board,
        rows: visual_rows(motion, clock),
        paused,
        strip: motion
            .dots
            .iter()
            .map(|dot| VisualDot {
                dot: dot.dot.clone(),
                offset_s: dot.offset.value(clock),
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::format::Preferences;

    fn board() -> Board {
        vantare_domain::relative::project(&crate::testdata::snapshot(), Preferences::default())
    }
    fn positions(board: &Board) -> Vec<f32> {
        (0..board.slots.len())
            .map(|i| 100.0 + i as f32 * 29.0)
            .collect()
    }
    fn motion() -> Motion {
        Motion::new(
            Timing {
                reorder: 1.0,
                fade: 1.0,
                flash: 1.0,
                pulse: 1.0,
            },
            false,
            5,
            0.0,
        )
    }
    #[test]
    fn rows_sample_interpolated_slots_and_fading_ghosts_without_a_look() {
        let mut board = board();
        let mut motion = motion();
        motion.update(&board, &positions(&board), true, 0.0);
        let occupied: Vec<_> = board
            .slots
            .iter()
            .enumerate()
            .filter_map(|(i, r)| r.as_ref().map(|r| (i, r.id)))
            .collect();
        let (first, id) = occupied[0];
        let second = occupied[1].0;
        board.slots.swap(first, second);
        motion.update(&board, &positions(&board), false, 1.0);
        let rows = visual_rows(&motion, 1.5);
        let row = rows.iter().find(|r| r.row.id == id).expect("retained row");
        assert!(row.slot > positions(&board)[first] && row.slot < positions(&board)[second]);
        assert_eq!(row.opacity, 1.0);
        assert_eq!(
            rows,
            visual_rows(&motion, 1.5),
            "sampling does not advance state"
        );
        board.slots[second] = None;
        motion.update(&board, &positions(&board), false, 3.0);
        assert_eq!(
            visual_rows(&motion, 3.5)
                .iter()
                .find(|r| r.row.id == id)
                .expect("ghost")
                .opacity,
            0.5
        );
        motion.advance(&board, 4.0);
        assert!(!visual_rows(&motion, 4.0).iter().any(|r| r.row.id == id));
    }
    #[test]
    fn pulse_and_flash_coexist_with_strengths_independent_of_row_opacity() {
        for (previous, next, expected) in [
            (Side::Ahead, Side::Behind, AlertKind::Gain),
            (Side::Behind, Side::Ahead, AlertKind::Loss),
            (Side::Player, Side::Player, AlertKind::Pits),
        ] {
            let mut board = board();
            let row = board.slots.iter_mut().flatten().next().expect("row");
            let id = row.id;
            Arc::make_mut(row).side = previous;
            Arc::make_mut(row).in_pits = false;
            let mut motion = motion();
            motion.update(&board, &positions(&board), true, 0.0);
            let row = board.slots.iter_mut().flatten().next().expect("row");
            let row = Arc::make_mut(row);
            row.side = next;
            row.in_pits = expected == AlertKind::Pits;
            row.fast_traffic = true;
            motion.update(&board, &positions(&board), false, 1.0);
            motion.advance(&board, 1.25);
            let rows = visual_rows(&motion, 1.25);
            let row = rows.iter().find(|r| r.row.id == id).expect("visual row");
            assert_eq!(row.opacity, 1.0);
            assert!((row.traffic_opacity - 0.5).abs() < f32::EPSILON);
            assert_eq!(
                row.alert,
                Some(Alert {
                    kind: expected,
                    opacity: 0.75
                })
            );
            assert_eq!(rows, visual_rows(&motion, 1.25), "sampling is pure");
            motion.advance(&board, 2.25);
            let rows = visual_rows(&motion, 2.25);
            let row = rows.iter().find(|r| r.row.id == id).expect("row");
            assert!(row.alert.is_none());
            assert!(row.traffic_opacity > 0.0);
            motion.policy(true, 5);
            motion.advance(&board, 3.0);
            assert!(
                visual_rows(&motion, 3.0)
                    .iter()
                    .all(|r| r.alert.is_none() && r.traffic_opacity == 0.0 && r.opacity == 1.0)
            );
        }
    }
    #[test]
    fn traffic_arms_a_clock_and_no_traffic_or_reduced_motion_disarms_it() {
        let mut board = board();
        for row in board.slots.iter_mut().flatten() {
            Arc::make_mut(row).fast_traffic = false;
        }
        let mut motion = motion();
        motion.update(&board, &positions(&board), true, 0.0);
        motion.advance(&board, 0.0);
        assert_eq!(motion.next_wake(0.0, true), None);
        Arc::make_mut(board.slots.iter_mut().flatten().next().expect("row")).fast_traffic = true;
        motion.update(&board, &positions(&board), false, 1.0);
        motion.advance(&board, 1.0);
        assert_eq!(motion.next_wake(1.0, true), Some(1.2));
        for row in board.slots.iter_mut().flatten() {
            Arc::make_mut(row).fast_traffic = false;
        }
        motion.update(&board, &positions(&board), false, 2.0);
        motion.advance(&board, 2.0);
        assert_eq!(motion.next_wake(2.0, true), None);
        Arc::make_mut(board.slots.iter_mut().flatten().next().expect("row")).fast_traffic = true;
        motion.update(&board, &positions(&board), false, 3.0);
        motion.advance(&board, 3.0);
        assert!(motion.next_wake(3.0, true).is_some());
        motion.policy(true, 5);
        motion.advance(&board, 3.0);
        assert_eq!(motion.next_wake(3.0, true), None);
    }
}
