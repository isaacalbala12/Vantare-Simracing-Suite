//! Relative scene shared by both Looks: domain rows and semantic, sampled motion.
//! The canonical layout supplies coordinates; no Rune values, colors or window.
use crate::motion::Tween;
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

/// Cómo anima cada Look: GPUI usa curvas y duraciones distintas.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kinetics {
    /// Deslizamiento fijo del diseño y fundido lineal.
    Vantare,
    /// Deslizamiento de 220 ms + 20 ms por fila (techo 300), fundido y destello
    /// con `ease(0,0,.58,1)`; el destello dura 480 ms.
    Eficiencia,
}

/// Curva del deslizamiento de Eficiencia (`ease(.2,.65,.3,1)`).
const SLIDE: [f32; 4] = [0.2, 0.65, 0.3, 1.0];
/// Curva del fundido y del destello de Eficiencia (`ease(0,0,.58,1)`).
const EASE_OUT: [f32; 4] = [0.0, 0.0, 0.58, 1.0];
const FADE: f64 = 0.12;
const FLASH: f64 = 0.48;

#[derive(Clone, Copy)]
pub struct Timing {
    pub reorder: f64,
    pub fade: f64,
    pub flash: f64,
    pub pulse: f64,
    pub kinetics: Kinetics,
}

impl Timing {
    /// Duración y curva del deslizamiento; `row` es la altura de fila en px.
    fn slide(&self, delta: f32, row: f32) -> (f64, Option<[f32; 4]>) {
        match self.kinetics {
            Kinetics::Vantare => (self.reorder, None),
            Kinetics::Eficiencia => {
                let rows = f64::from((delta.abs() / row.max(1.0)).abs());
                (((220.0 + rows * 20.0).min(300.0)) / 1000.0, Some(SLIDE))
            }
        }
    }
    fn fade(&self) -> (f64, Option<[f32; 4]>) {
        match self.kinetics {
            Kinetics::Vantare => (self.fade, None),
            Kinetics::Eficiencia => (FADE, Some(EASE_OUT)),
        }
    }
    fn flash(&self) -> f64 {
        match self.kinetics {
            Kinetics::Vantare => self.flash,
            Kinetics::Eficiencia => FLASH,
        }
    }
}

/// Altura de fila que usan los Look sin bandas de clase; 1 px si no hay dos filas.
fn row_step(positions: &[f32]) -> f32 {
    let step = positions
        .windows(2)
        .map(|pair| (pair[1] - pair[0]).abs())
        .fold(f32::INFINITY, f32::min);
    if step.is_finite() && step > 0.5 {
        step
    } else {
        1.0
    }
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
    reduced: bool,
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
        let hz_changed = self.hz != hz;
        if hz_changed {
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
        changed || hz_changed
    }
    pub fn reduced(&self) -> bool {
        self.reduced
    }
    /// `positions` contains the canonical layout target for each Board::slots entry.
    pub fn update(&mut self, board: &Board, positions: &[f32], snap: bool, clock: f64) {
        let Some(positions) = positions.get(..board.slots.len()) else {
            return; // Preserve the last valid motion when the layout is incomplete.
        };
        let snap = snap || self.reduced || waiting(board);
        let timing = self.timing;
        let (fade_time, fade_curve) = timing.fade();
        let row_height = row_step(positions);
        let active: BTreeSet<_> = board.slots.iter().flatten().map(|row| row.id.0).collect();
        for (&id, row) in &mut self.rows {
            if !active.contains(&id) && row.active {
                row.active = false;
                row.fade.retarget(0.0, clock, fade_time);
            }
        }
        self.order.clear();
        if !waiting(board) {
            for (position, row) in positions.iter().zip(&board.slots) {
                let Some(row) = row else { continue };
                if let Some(moving) = self.rows.get_mut(&row.id.0) {
                    if snap {
                        moving.slot = Tween::fixed(*position);
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
                        let (duration, curve) =
                            timing.slide(*position - moving.slot.value(clock), row_height);
                        if let Some(curve) = curve {
                            moving.slot = moving.slot.with_curve(curve);
                        }
                        moving.slot.retarget(*position, clock, duration);
                        moving.fade.retarget(1.0, clock, fade_time);
                    }
                    moving.row = row.clone();
                    moving.active = true;
                } else {
                    let mut fade = match fade_curve {
                        Some(curve) => Tween::fixed(if snap { 1.0 } else { 0.0 }).with_curve(curve),
                        None => Tween::linear(if snap { 1.0 } else { 0.0 }),
                    };
                    if !snap {
                        fade.retarget(1.0, clock, fade_time);
                    }
                    self.rows.insert(
                        row.id.0,
                        MovingRow {
                            row: row.clone(),
                            slot: Tween::fixed(*position),
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
                        offset.retarget(dot.offset_s as f32, clock, timing.reorder);
                    }
                    MovingDot {
                        dot: dot.clone(),
                        offset,
                    }
                })
                .collect()
        };
    }
    /// Call after update/policy and before sampling visual_rows or sample at this clock.
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
        let flash = self.timing.flash();
        for row in self.rows.values_mut() {
            if row.flash.is_some_and(|(_, start)| clock >= start + flash) {
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

/// Fuerza del aviso (0..1, el pintor aplica su alfa). GPUI Eficiencia lo apaga con
/// `ease(0,0,.58,1)` en 480 ms; Vantare, lineal.
fn alert_strength(kinetics: Kinetics, flash: f64, elapsed: f64) -> f32 {
    match kinetics {
        Kinetics::Vantare => (1.0 - (elapsed / flash.max(0.001)) as f32).clamp(0.0, 1.0),
        Kinetics::Eficiencia => {
            let t = (elapsed / FLASH).clamp(0.0, 1.0) as f32;
            (1.0 - rune::Easing::cubic(EASE_OUT[0], EASE_OUT[1], EASE_OUT[2], EASE_OUT[3]).eval(t))
                .clamp(0.0, 1.0)
        }
    }
}

/// Pure sampling: a Look chooses colors and pixel geometry, never movement or alert strength.
/// Call Motion::advance with the same clock before sampling; sampling never advances state.
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
                    opacity: alert_strength(
                        motion.timing.kinetics,
                        motion.timing.flash,
                        clock - start,
                    ),
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
/// Call Motion::advance with these data and clock before sampling the scene.
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
    use vantare_domain::{CarId, format::Preferences};

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
                kinetics: Kinetics::Vantare,
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
        motion.advance(&board, 1.5);
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
        motion.advance(&board, 3.5);
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
    fn incomplete_positions_preserve_the_last_valid_motion_and_recover() {
        let board = board();
        let targets = positions(&board);
        let mut motion = motion();
        motion.update(&board, &[], true, 0.0);
        motion.advance(&board, 0.0);
        assert!(visual_rows(&motion, 0.0).is_empty());
        motion.update(&board, &targets, true, 0.0);
        motion.advance(&board, 0.0);
        let before = visual_rows(&motion, 0.0);
        let mut changed = board.clone();
        let first = changed.slots.iter().position(Option::is_some).expect("row");
        let last = changed
            .slots
            .iter()
            .rposition(Option::is_some)
            .expect("row");
        changed.slots.swap(first, last);
        for incomplete in [&[][..], &targets[..targets.len() - 1]] {
            motion.update(&changed, incomplete, false, 1.0);
            motion.advance(&changed, 1.0);
            assert_eq!(visual_rows(&motion, 1.0), before);
        }
        motion.update(&changed, &targets, false, 2.0);
        motion.advance(&changed, 2.5);
        assert_ne!(visual_rows(&motion, 2.5), before);
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
    /// Curvas y duraciones de GPUI Eficiencia: `ease(.2,.65,.3,1)` con
    /// `min(300, 220 + 20·filas)` ms, fundido de 120 ms con `ease(0,0,.58,1)`.
    fn eficiencia() -> Motion {
        Motion::new(
            Timing {
                reorder: 1.0,
                fade: 1.0,
                flash: 1.0,
                pulse: 1.0,
                kinetics: Kinetics::Eficiencia,
            },
            false,
            5,
            0.0,
        )
    }
    fn row_of(motion: &Motion, id: CarId, clock: f64) -> VisualRow {
        visual_rows(motion, clock)
            .into_iter()
            .find(|r| r.row.id == id)
            .expect("fila muestreada")
    }
    #[test]
    fn eficiencia_kinetics_match_the_gpui_curves_and_durations() {
        let mut board = board();
        let mut motion = eficiencia();
        motion.update(&board, &positions(&board), true, 0.0);
        let occupied: Vec<_> = board
            .slots
            .iter()
            .enumerate()
            .filter_map(|(i, r)| r.as_ref().map(|r| (i, r.id)))
            .collect();
        let (first, id) = occupied[0];
        let target = occupied[2].0;
        let before = positions(&board)[first];
        board.slots.swap(first, target);
        motion.update(&board, &positions(&board), false, 1.0);
        let after = positions(&board)[target];
        let eased = rune::Easing::cubic(0.2, 0.65, 0.3, 1.0);
        // Dos filas de recorrido: 220 + 2·20 = 260 ms.
        let middle = row_of(&motion, id, 1.13).slot;
        assert!(
            (middle - (before + (after - before) * eased.eval(0.5))).abs() < 0.01,
            "mitad del deslizamiento: {middle}"
        );
        assert!(
            (row_of(&motion, id, 1.26).slot - after).abs() < 0.01,
            "termina a 260 ms"
        );
        assert!(row_of(&motion, id, 1.48).slot == after);

        // Salida: fundido de 120 ms con `ease(0,0,.58,1)`.
        board.slots[target] = None;
        motion.update(&board, &positions(&board), false, 2.0);
        let ghost = 1.0 - rune::Easing::cubic(0.0, 0.0, 0.58, 1.0).eval(0.5);
        assert!((row_of(&motion, id, 2.06).opacity - ghost).abs() < 0.01);
        motion.advance(&board, 2.13);
        assert!(
            visual_rows(&motion, 2.13).iter().all(|r| r.row.id != id),
            "el fantasma se retira a los 120 ms"
        );
        assert_eq!(
            motion.next_wake(2.13, false),
            None,
            "cero despertares al acabar"
        );
    }
    #[test]
    fn eficiencia_flash_fades_with_the_gpui_ease_for_480_ms() {
        let mut board = board();
        let mut motion = eficiencia();
        motion.update(&board, &positions(&board), true, 0.0);
        let index = board
            .slots
            .iter()
            .position(|r| r.as_ref().is_some_and(|r| r.side == Side::Ahead))
            .expect("fila por delante");
        let id = board.slots[index].as_ref().expect("fila").id;
        Arc::make_mut(board.slots[index].as_mut().expect("fila")).side = Side::Behind;
        motion.update(&board, &positions(&board), false, 1.0);
        let eased = rune::Easing::cubic(0.0, 0.0, 0.58, 1.0);
        let strength = |clock: f64| row_of(&motion, id, clock).alert.expect("aviso").opacity;
        assert!(
            (strength(1.24) - (1.0 - eased.eval(0.5))).abs() < 0.01,
            "mitad del destello: {}",
            strength(1.24)
        );
        assert!(
            strength(1.46) < strength(1.24),
            "el destello baja mientras dura"
        );
        assert!(
            row_of(&motion, id, 1.48).alert.is_none(),
            "a 480 ms ya no hay aviso"
        );
        motion.advance(&board, 1.49);
        assert!(
            visual_rows(&motion, 1.49)
                .iter()
                .find(|r| r.row.id == id)
                .expect("fila")
                .alert
                .is_none(),
            "el destello se apaga a los 480 ms"
        );
        assert_eq!(motion.next_wake(1.49, false), None);
    }
}
