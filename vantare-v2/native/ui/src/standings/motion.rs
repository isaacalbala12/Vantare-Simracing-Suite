//! Animaciones de Standings Eficiencia (`useStandingsMotion`, `standings-motion`,
//! `standings-presence`, `widget-motion.flipRows`), con `motion = full`.
//!
//! Maquina de estados pura: recibe ViewModels sucesivos y muestrea el estado
//! visual en un instante dado. No toca GPUI; `view.rs` solo pinta el `Frame`.

use super::model::{ContentPlan, Row, Status};
use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};
use vantare_domain::CarId;

const MAX_NOTICES: usize = 3;
const NOTICE_MS: u64 = 1200;
const FADE_MS: u64 = 200;
/// Duración del barrido de mejora de vuelta (`frame`).
const SWEEP_MS: u64 = 800;

// ---------------------------------------------------------------------------
// Curvas de tiempo
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug)]
pub struct Bezier(f32, f32, f32, f32);

pub const EASE: Bezier = Bezier(0.25, 0.1, 0.25, 1.0);
pub const EASE_OUT: Bezier = Bezier(0.0, 0.0, 0.58, 1.0);
pub const FLIP: Bezier = Bezier(0.22, 0.9, 0.3, 1.0);

impl Bezier {
    fn axis(a: f32, b: f32, t: f32) -> f32 {
        let u = 1.0 - t;
        3.0 * u * u * t * a + 3.0 * u * t * t * b + t * t * t
    }

    /// `cubic-bezier(x1,y1,x2,y2)` evaluada en el progreso lineal `x`.
    pub fn at(self, x: f32) -> f32 {
        if x <= 0.0 {
            return 0.0;
        }
        if x >= 1.0 {
            return 1.0;
        }
        let (mut lo, mut hi) = (0.0f32, 1.0f32);
        for _ in 0..30 {
            let mid = f32::midpoint(lo, hi);
            if Self::axis(self.0, self.2, mid) < x {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        Self::axis(self.1, self.3, f32::midpoint(lo, hi))
    }
}

#[derive(Clone, Copy, Debug)]
enum Curve {
    Bezier(Bezier),
    Linear,
    CubicOut,
}
impl Curve {
    fn at(self, t: f32) -> f32 {
        match self {
            Self::Bezier(b) => b.at(t),
            Self::Linear => t,
            Self::CubicOut => 1.0 - (1.0 - t).powi(3),
        }
    }
}
/// Transicion de un escalar; al cambiar de objetivo parte del valor actual.
#[derive(Clone, Copy, Debug)]
pub struct Tween {
    from: f32,
    to: f32,
    start: Instant,
    duration: Duration,
    ease: Curve,
}

impl Tween {
    fn policy(from: f32, to: f32, start: Instant, duration: Duration, ease: Curve) -> Self {
        Self {
            from,
            to,
            start,
            duration,
            ease,
        }
    }
    pub fn fixed(value: f32, now: Instant) -> Self {
        Self {
            from: value,
            to: value,
            start: now,
            duration: Duration::ZERO,
            ease: Curve::Bezier(EASE),
        }
    }

    pub fn value(&self, now: Instant) -> f32 {
        let elapsed = now.saturating_duration_since(self.start);
        if self.duration.is_zero() || elapsed >= self.duration {
            return self.to;
        }
        let x = elapsed.as_secs_f32() / self.duration.as_secs_f32();
        self.from + (self.to - self.from) * self.ease.at(x)
    }

    pub fn running(&self, now: Instant) -> bool {
        now.saturating_duration_since(self.start) < self.duration
    }

    pub fn retarget(&mut self, to: f32, now: Instant, duration_ms: u64, ease: Bezier) {
        if (self.to - to).abs() < f32::EPSILON {
            return;
        }
        self.from = self.value(now);
        self.to = to;
        self.start = now;
        self.duration = Duration::from_millis(duration_ms);
        self.ease = Curve::Bezier(ease);
    }

    pub fn animate(from: f32, to: f32, now: Instant, duration_ms: u64, ease: Bezier) -> Self {
        Self {
            from,
            to,
            start: now,
            duration: Duration::from_millis(duration_ms),
            ease: Curve::Bezier(ease),
        }
    }
}

// ---------------------------------------------------------------------------
// Salida para la vista
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct RowVis {
    /// `translateY` del FLIP (px).
    pub dy: f32,
    /// Opacidad de la fila (entrada/salida).
    pub alpha: f32,
    /// Intensidad del fondo de subida/bajada (0..1 de rgb/12 %).
    pub flash: f32,
    pub flash_up: bool,
    /// Texto `+n`/`−n` y su opacidad.
    pub chip: Option<(String, f32)>,
    /// (sesion?, opacidad, desplazamiento x en fracciones de ancho de celda).
    pub sweep: Option<(bool, f32, f32)>,
    pub battle: f32,
    pub best_marker: f32,
    pub pit_alpha: f32,
    pub pit_dx: f32,
}

impl Default for RowVis {
    fn default() -> Self {
        Self {
            dy: 0.0,
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

#[derive(Clone, Debug)]
pub struct Ghost {
    pub row: Row,
    /// Borde superior relativo al inicio del cuerpo de la tabla.
    pub top: f32,
    pub vis: RowVis,
}

#[derive(Clone, Debug, Default)]
pub struct Frame {
    vis: HashMap<CarId, RowVis>,
    pub ghosts: Vec<Ghost>,
}

impl Frame {
    pub fn row(&self, id: CarId) -> RowVis {
        self.vis.get(&id).cloned().unwrap_or_default()
    }
}

fn is_session_best(content_plan: &ContentPlan, id: CarId) -> bool {
    content_plan
        .session_best
        .as_ref()
        .is_some_and(|(best, _)| *best == id)
}

// ---------------------------------------------------------------------------
// Eventos (standings-motion.ts)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventKind {
    PersonalBest,
    Position,
    SessionBest,
    Lead,
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
pub struct Event {
    pub row_id: CarId,
    pub kind: EventKind,
    pub places: i64,
}

pub fn motion_continues(prev: &ContentPlan, next: &ContentPlan) -> bool {
    prev.status == Status::Ready
        && next.status == Status::Ready
        && prev.identity == next.identity
        && prev.session_label() == next.session_label()
        && next.sequence >= prev.sequence
}

fn valid_lap(seconds: Option<f64>) -> Option<f64> {
    seconds.filter(|s| s.is_finite() && *s > 0.0)
}

pub fn derive_events(prev: &ContentPlan, next: &ContentPlan, lap_visible: bool) -> Vec<Event> {
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
pub struct Battle {
    pub ahead: CarId,
    pub behind: CarId,
    pub gap: f64,
    pub player: bool,
}

/// `selectStandingsBattle`: un duelo de la misma clase, con histeresis.
#[allow(clippy::implicit_hasher)]
pub fn select_battle(
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

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

#[derive(Clone)]
struct Notice {
    priority: u8,
    kind: EventKind,
    start: Instant,
    places: i64,
}

#[derive(Clone)]
struct ExitRow {
    row: Row,
    top: f32,
    fade: Tween,
}

#[derive(Clone, Default)]
pub struct Motion {
    seeded: bool,
    prev: Option<ContentPlan>,
    /// Resultado derivado reutilizable solo mientras no hay animacion ni nueva ingestion.
    idle_frame: Option<std::sync::Arc<Frame>>,
    /// Tops de layout (relativos al cuerpo) de la ultima pasada, por id.
    tops: HashMap<CarId, f32>,
    flips: HashMap<CarId, Tween>,
    fades: HashMap<CarId, Tween>,
    exits: HashMap<CarId, ExitRow>,
    presence: HashMap<CarId, Row>,
    notices: HashMap<CarId, Notice>,
    battle: Option<Battle>,
    battle_tw: HashMap<CarId, Tween>,
    best_tw: HashMap<CarId, Tween>,
    pit_tw: HashMap<CarId, (Tween, Tween)>,
    chip_tw: HashMap<CarId, Tween>,
    flash_tw: HashMap<CarId, Tween>,
}

impl Motion {
    pub fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    pub(super) fn notices(
        &self,
    ) -> Vec<(
        vantare_domain::CarId,
        crate::vantare::motion::Flash,
        Instant,
        i64,
    )> {
        use crate::vantare::motion::Flash;
        self.notices
            .iter()
            .map(|(id, n)| {
                (
                    *id,
                    match n.kind {
                        EventKind::Position if n.places > 0 => Flash::Gain,
                        EventKind::Position => Flash::Loss,
                        EventKind::PersonalBest => Flash::PersonalBest,
                        EventKind::SessionBest => Flash::Best,
                        EventKind::Lead => Flash::Lead,
                        EventKind::Pit => Flash::Pit,
                    },
                    n.start,
                    n.places,
                )
            })
            .collect()
    }
    pub(super) fn restore_notices(
        &mut self,
        notices: &[(
            vantare_domain::CarId,
            crate::vantare::motion::Flash,
            Instant,
            i64,
        )],
    ) {
        use crate::vantare::motion::Flash;
        self.idle_frame = None;
        for &(id, flash, start, places) in notices {
            let kind = match flash {
                Flash::Gain | Flash::Loss => EventKind::Position,
                Flash::Lead => EventKind::Lead,
                Flash::PersonalBest => EventKind::PersonalBest,
                Flash::Best => EventKind::SessionBest,
                Flash::Pit => EventKind::Pit,
            };
            self.notices.insert(
                id,
                Notice {
                    priority: kind.priority(),
                    kind,
                    start,
                    places,
                },
            );
        }
    }

    fn reset(&mut self) {
        *self = Self::default();
    }

    /// Registra un nuevo ViewModel. `visible` = filas pintadas (prefijo de `content_plan.rows`);
    /// `lap_visible` = columna de mejor vuelta activa.
    pub fn update(
        &mut self,
        content_plan: &ContentPlan,
        visible: usize,
        lap_visible: bool,
        now: Instant,
    ) {
        #[cfg(feature = "parity-capture")]
        crate::benchmark::mark(crate::benchmark::Work::Motion);
        self.idle_frame = None;
        if content_plan.status != Status::Ready {
            self.reset();
            self.prev = None;
            return;
        }
        let visible_rows: Vec<&Row> = content_plan.rows.iter().take(visible).collect();
        let seeded = self.prev.is_some();
        let Some(prev) = self
            .prev
            .clone()
            .filter(|p| motion_continues(p, content_plan))
        else {
            // Se rompe la continuidad: se descarta todo y se re-siembra sin animar.
            let pit_state: HashMap<CarId, bool> =
                visible_rows.iter().map(|r| (r.id, r.in_pits)).collect();
            self.reset();
            self.seed(&visible_rows, now);
            for (id, active) in pit_state {
                self.pit_tw.insert(id, pit_tweens(active, now));
            }
            self.sync_best_marker(content_plan, &visible_rows, now, seeded);
            self.prev = Some(content_plan.clone());
            return;
        };

        // 1) Presencia: filas que salen o entran de la ventana visible.
        let current_ids: HashSet<CarId> = visible_rows.iter().map(|r| r.id).collect();
        let dropped: Vec<(CarId, Row)> = self
            .presence
            .iter()
            .filter(|(id, _)| !current_ids.contains(id))
            .map(|(id, row)| (*id, row.clone()))
            .collect();
        for (id, row) in dropped {
            let flight = self.flips.get(&id).map_or(0.0, |t| t.value(now));
            let top = self.tops.get(&id).copied().unwrap_or(0.0) + flight;
            let from = self.fades.get(&id).map_or(1.0, |t| t.value(now));
            self.exits.insert(
                id,
                ExitRow {
                    row,
                    top,
                    fade: Tween::animate(from, 0.0, now, FADE_MS, EASE_OUT),
                },
            );
            self.flips.remove(&id);
            self.fades.remove(&id);
            self.tops.remove(&id);
        }
        for row in &visible_rows {
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
                .insert(row.id, Tween::animate(from, 1.0, now, FADE_MS, EASE_OUT));
            self.pit_tw
                .entry(row.id)
                .or_insert_with(|| pit_tweens(row.in_pits, now));
        }

        // 2) FLIP por identidad.
        for (index, row) in visible_rows.iter().enumerate() {
            let top = index as f32 * super::model::ROW_HEIGHT;
            let in_flight = self.flips.get(&row.id).map_or(0.0, |t| t.value(now));
            self.flips.remove(&row.id);
            let previous = self.tops.insert(row.id, top);
            if let Some(previous) = previous {
                let from = previous - top + in_flight;
                if from.abs() >= 0.5 {
                    let duration = (280.0 + from.abs() * 1.1).min(460.0) as u64;
                    self.flips
                        .insert(row.id, Tween::animate(from, 0.0, now, duration, FLIP));
                }
            }
        }
        self.tops.retain(|id, _| current_ids.contains(id));
        self.presence = visible_rows.iter().map(|r| (r.id, (*r).clone())).collect();

        // 3) Duelo y avisos.
        let visible_set: HashSet<CarId> = visible_rows.iter().map(|r| r.id).collect();
        let battle = select_battle(content_plan, &visible_set, self.battle.as_ref());
        self.battle = battle;
        self.notices.retain(|_, n| {
            now.saturating_duration_since(n.start) < Duration::from_millis(NOTICE_MS)
        });
        for event in derive_events(&prev, content_plan, lap_visible) {
            if !visible_set.contains(&event.row_id) {
                continue;
            }
            let priority = event.kind.priority();
            if !self.notices.contains_key(&event.row_id) && self.notices.len() >= MAX_NOTICES {
                let lowest = self
                    .notices
                    .iter()
                    .min_by_key(|(_, n)| n.priority)
                    .map(|(id, n)| (*id, n.priority));
                if let Some((id, lowest_priority)) = lowest {
                    if lowest_priority >= priority {
                        continue;
                    }
                    self.clear_notice(id);
                }
            }
            if self
                .notices
                .get(&event.row_id)
                .is_some_and(|n| n.priority > priority)
            {
                continue;
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
                    .insert(event.row_id, Tween::animate(0.0, 1.0, now, 500, EASE_OUT));
                self.chip_tw
                    .insert(event.row_id, Tween::animate(0.0, 1.0, now, 180, EASE));
            }
        }
        // Objetivos de duelo (oculto si la fila tiene aviso).
        for row in &visible_rows {
            let target = match &self.battle {
                Some(b)
                    if (b.ahead == row.id || b.behind == row.id)
                        && !self.notices.contains_key(&row.id) =>
                {
                    1.0
                }
                _ => 0.0,
            };
            self.battle_tw
                .entry(row.id)
                .or_insert_with(|| Tween::fixed(0.0, now))
                .retarget(target, now, 200, EASE);
            let (alpha, dx) = self
                .pit_tw
                .entry(row.id)
                .or_insert_with(|| pit_tweens(row.in_pits, now));
            alpha.retarget(if row.in_pits { 1.0 } else { 0.0 }, now, 200, EASE);
            dx.retarget(if row.in_pits { 0.0 } else { -5.0 }, now, 200, EASE);
        }
        self.sync_best_marker(content_plan, &visible_rows, now, true);
        self.prev = Some(content_plan.clone());
    }

    fn sync_best_marker(
        &mut self,
        content_plan: &ContentPlan,
        rows: &[&Row],
        now: Instant,
        animate: bool,
    ) {
        for row in rows {
            let target = if is_session_best(content_plan, row.id) {
                1.0
            } else {
                0.0
            };
            let entry = self
                .best_tw
                .entry(row.id)
                .or_insert_with(|| Tween::fixed(target, now));
            if animate {
                entry.retarget(target, now, 220, EASE);
            } else {
                *entry = Tween::fixed(target, now);
            }
        }
    }

    fn seed(&mut self, rows: &[&Row], now: Instant) {
        self.seeded = true;
        for (index, row) in rows.iter().enumerate() {
            self.tops
                .insert(row.id, index as f32 * super::model::ROW_HEIGHT);
            self.presence.insert(row.id, (*row).clone());
            self.fades.insert(row.id, Tween::fixed(1.0, now));
        }
    }

    fn clear_notice(&mut self, id: CarId) {
        self.notices.remove(&id);
        self.flash_tw.remove(&id);
        self.chip_tw.remove(&id);
    }

    /// Un frame quieto no vuelve a asignar mapas de filas; update/restaurar avisos lo invalida.
    pub(super) fn frame_shared(
        &mut self,
        content_plan: &ContentPlan,
        visible: usize,
        now: Instant,
    ) -> std::sync::Arc<Frame> {
        if self.wake(now) == Wake::Idle
            && let Some(frame) = &self.idle_frame
        {
            return frame.clone();
        }
        let frame = std::sync::Arc::new(self.frame(content_plan, visible, now));
        self.idle_frame = (self.wake(now) == Wake::Idle).then(|| frame.clone());
        frame
    }

    /// Estado visual en `now`.
    pub fn frame(&mut self, content_plan: &ContentPlan, visible: usize, now: Instant) -> Frame {
        self.notices.retain(|_, n| {
            now.saturating_duration_since(n.start) < Duration::from_millis(NOTICE_MS)
        });
        let ids: HashSet<CarId> = self.notices.keys().copied().collect();
        self.flash_tw.retain(|id, _| ids.contains(id));
        self.chip_tw.retain(|id, _| ids.contains(id));
        self.exits.retain(|_, e| e.fade.running(now));
        let mut vis = HashMap::new();
        for row in content_plan.rows.iter().take(visible) {
            let mut v = RowVis {
                dy: self.flips.get(&row.id).map_or(0.0, |t| t.value(now)),
                alpha: self.fades.get(&row.id).map_or(1.0, |t| t.value(now)),
                battle: self.battle_tw.get(&row.id).map_or(0.0, |t| t.value(now)),
                best_marker: self.best_tw.get(&row.id).map_or(0.0, |t| t.value(now)),
                ..RowVis::default()
            };
            if let Some((alpha, dx)) = self.pit_tw.get(&row.id) {
                v.pit_alpha = alpha.value(now);
                v.pit_dx = dx.value(now);
            } else {
                v.pit_alpha = if row.in_pits { 1.0 } else { 0.0 };
                v.pit_dx = if row.in_pits { 0.0 } else { -5.0 };
            }
            if let Some(notice) = self.notices.get(&row.id) {
                match notice.kind {
                    EventKind::Position | EventKind::Lead => {
                        v.flash = self.flash_tw.get(&row.id).map_or(1.0, |t| t.value(now));
                        v.flash_up = notice.places > 0;
                        let alpha = self.chip_tw.get(&row.id).map_or(1.0, |t| t.value(now));
                        let sign = if notice.places > 0 { "+" } else { "−" };
                        v.chip = Some((format!("{sign}{}", notice.places.abs()), alpha));
                    }
                    EventKind::Pit => {
                        v.pit_alpha = 1.0;
                        v.pit_dx = 0.0;
                    }
                    EventKind::PersonalBest | EventKind::SessionBest => {
                        let elapsed =
                            now.saturating_duration_since(notice.start).as_secs_f32() * 1000.0;
                        if elapsed < SWEEP_MS as f32 {
                            let p = EASE_OUT.at(elapsed / SWEEP_MS as f32);
                            // keyframes: 0 -> (0, -100 %), 0.4 -> (0.7, 0), 1 -> (0, +100 %)
                            let (opacity, x) = if p < 0.4 {
                                let k = p / 0.4;
                                (0.7 * k, -1.0 + k)
                            } else {
                                let k = (p - 0.4) / 0.6;
                                (0.7 * (1.0 - k), k)
                            };
                            v.sweep = Some((notice.kind == EventKind::SessionBest, opacity, x));
                        }
                    }
                }
            }
            vis.insert(row.id, v);
        }
        let ghosts = self
            .exits
            .values()
            .map(|e| Ghost {
                row: e.row.clone(),
                top: e.top,
                vis: RowVis {
                    alpha: e.fade.value(now),
                    pit_alpha: if e.row.in_pits { 1.0 } else { 0.0 },
                    pit_dx: 0.0,
                    ..RowVis::default()
                },
            })
            .collect();
        Frame { vis, ghosts }
    }

    /// Qué necesita la vista para seguir al día: un fotograma por vsync mientras
    /// algo se mueve, un despertar puntual cuando lo único pendiente es que
    /// caduque un aviso ya quieto, o nada.
    pub fn wake(&self, now: Instant) -> Wake {
        let age = |n: &Notice| now.saturating_duration_since(n.start);
        let moving = self.flips.values().any(|t| t.running(now))
            || self.fades.values().any(|t| t.running(now))
            || !self.exits.is_empty()
            || self.battle_tw.values().any(|t| t.running(now))
            || self.best_tw.values().any(|t| t.running(now))
            || self.flash_tw.values().any(|t| t.running(now))
            || self.chip_tw.values().any(|t| t.running(now))
            || self
                .pit_tw
                .values()
                .any(|(a, d)| a.running(now) || d.running(now))
            // El barrido de mejora se anima por tiempo, sin `Tween`.
            || self
                .notices
                .values()
                .any(|n| n.kind != EventKind::Position && age(n) < Duration::from_millis(SWEEP_MS));
        if moving {
            return Wake::Frame;
        }
        self.notices
            .values()
            .filter_map(|n| Duration::from_millis(NOTICE_MS).checked_sub(age(n)))
            .min()
            .map_or(Wake::Idle, Wake::At)
    }

    /// `true` mientras quede algo por animar o caducar.
    #[cfg(any(test, feature = "parity-capture"))]
    pub fn animating(&self, now: Instant) -> bool {
        self.wake(now) != Wake::Idle
    }
}

impl Motion {
    /// El mismo historial y los mismos canales sirven a ambos pintores.
    pub(super) fn update_rows(
        &mut self,
        board: &std::sync::Arc<vantare_domain::standings::Board>,
        samples: &[crate::vantare::motion::Sample],
        timing: crate::vantare::motion::Timing,
        now: Instant,
    ) {
        use crate::vantare::motion::Flash;
        self.idle_frame = None;
        let first = !self.seeded;
        self.seeded = true;
        for sample in samples {
            let id = sample.id;
            let old = self.presence.get(&id);
            let known = self.tops.get(&id).copied();
            let current =
                known.unwrap_or(sample.y) + self.flips.get(&id).map_or(0.0, |t| t.value(now));
            if known.is_some() && (current - sample.y).abs() > 0.01 {
                self.flips.insert(
                    id,
                    Tween::policy(
                        current - sample.y,
                        0.0,
                        now,
                        timing.reorder,
                        Curve::CubicOut,
                    ),
                );
            } else if known.is_none() {
                self.flips.remove(&id);
            }
            self.tops.insert(id, sample.y);
            if known.is_none() && !first {
                self.fades
                    .insert(id, Tween::policy(0.0, 1.0, now, timing.fade, Curve::Linear));
            }
            let flash = old.and_then(|old| {
                let old_leader = matches!(old.gap.as_str(), "Líder" | "Leader");
                if sample.in_pits && !old.in_pits {
                    Some(Flash::Pit)
                } else if sample.leader && !old_leader {
                    Some(Flash::Lead)
                } else if i64::from(sample.position) < old.position {
                    Some(Flash::Gain)
                } else if i64::from(sample.position) > old.position {
                    Some(Flash::Loss)
                } else if sample.fastest
                    && old.best_mark != vantare_domain::standings::Mark::Fastest
                {
                    Some(Flash::Best)
                } else {
                    None
                }
            });
            if !first && let Some(flash) = flash {
                let places = old.map_or(0, |old| old.position - i64::from(sample.position));
                self.restore_notices(&[(sample.id, flash, now, places)]);
            }
            if let Some(row) = board.row(sample.id) {
                self.presence.insert(
                    id,
                    Row {
                        row: row.clone(),
                        id,
                        position: i64::from(sample.position),
                        class_position: row.class_position.map_or(0, i64::from),
                    },
                );
            }
        }
        let visible: HashSet<_> = samples.iter().map(|s| s.id).collect();
        self.tops.retain(|id, _| visible.contains(id));
        self.presence.retain(|id, _| visible.contains(id));
        // El Plan anterior es una caché derivada; el historial por coche sigue en presence.
        self.prev = None;
    }
    pub(super) fn resume_content(&mut self, content: &ContentPlan) {
        self.idle_frame = None;
        self.prev = Some(content.clone());
        for (i, row) in content.rows.iter().enumerate() {
            self.tops
                .insert(row.id, i as f32 * super::model::ROW_HEIGHT);
            self.presence.insert(row.id, row.clone());
        }
    }
    pub(super) fn relayout(
        &mut self,
        board: &std::sync::Arc<vantare_domain::standings::Board>,
        samples: &[crate::vantare::motion::Sample],
    ) {
        for sample in samples {
            let id = sample.id;
            self.tops.insert(id, sample.y);
            if let Some(row) = board.row(sample.id) {
                self.presence.insert(
                    id,
                    Row {
                        row: row.clone(),
                        id,
                        position: i64::from(sample.position),
                        class_position: row.class_position.map_or(0, i64::from),
                    },
                );
            }
        }
    }
    pub(super) fn snap(&mut self, samples: &[crate::vantare::motion::Sample]) {
        let now = Instant::now();
        for s in samples {
            let id = s.id;
            self.tops.insert(id, s.y);
            self.flips.insert(id, Tween::fixed(0.0, now));
        }
    }
    pub(super) fn settle(&mut self) {
        let now = Instant::now();
        for tween in self.flips.values_mut() {
            *tween = Tween::fixed(0.0, now);
        }
        for tween in self.fades.values_mut() {
            *tween = Tween::fixed(1.0, now);
        }
        self.notices.clear();
        self.flash_tw.clear();
        self.chip_tw.clear();
        self.exits.clear();
        self.idle_frame = None;
    }
    pub(super) fn pose(
        &self,
        id: vantare_domain::CarId,
        timing: crate::vantare::motion::Timing,
        now: Instant,
    ) -> crate::vantare::motion::Pose {
        use crate::vantare::motion::{Flash, Pose};
        let flash = self.notices.get(&id).and_then(|n| {
            if timing.flash.is_zero() {
                return None;
            }
            let p = (now.saturating_duration_since(n.start).as_secs_f32()
                / timing.flash.as_secs_f32())
            .clamp(0.0, 1.0);
            (p < 1.0).then_some((
                match n.kind {
                    EventKind::Position if n.places > 0 => Flash::Gain,
                    EventKind::Position => Flash::Loss,
                    EventKind::Lead => Flash::Lead,
                    EventKind::SessionBest => Flash::Best,
                    EventKind::PersonalBest => Flash::PersonalBest,
                    EventKind::Pit => Flash::Pit,
                },
                1.0 - p,
            ))
        });
        Pose {
            offset: self.flips.get(&id).map_or(0.0, |t| t.value(now)),
            alpha: self.fades.get(&id).map_or(1.0, |t| t.value(now)),
            flash,
        }
    }
    pub(super) fn wake_rows(&self, timing: crate::vantare::motion::Timing, now: Instant) -> Wake {
        if self.tops.keys().any(|id| {
            self.flips.get(id).is_some_and(|t| t.running(now))
                || self.fades.get(id).is_some_and(|t| t.running(now))
                || self
                    .notices
                    .get(id)
                    .is_some_and(|n| now.saturating_duration_since(n.start) < timing.flash)
        }) {
            Wake::Frame
        } else {
            Wake::Idle
        }
    }
}

#[cfg(test)]
impl Motion {
    pub(super) fn clock_signature(&self) -> Vec<(String, Instant, Duration)> {
        let mut clocks = Vec::new();
        clocks.extend(
            self.flips
                .iter()
                .map(|(id, t)| (format!("flips:{id:?}"), t.start, t.duration)),
        );
        clocks.extend(
            self.fades
                .iter()
                .map(|(id, t)| (format!("fades:{id:?}"), t.start, t.duration)),
        );
        clocks.extend(
            self.battle_tw
                .iter()
                .map(|(id, t)| (format!("battle_tw:{id:?}"), t.start, t.duration)),
        );
        clocks.extend(
            self.best_tw
                .iter()
                .map(|(id, t)| (format!("best_tw:{id:?}"), t.start, t.duration)),
        );
        clocks.extend(
            self.chip_tw
                .iter()
                .map(|(id, t)| (format!("chip_tw:{id:?}"), t.start, t.duration)),
        );
        clocks.extend(
            self.flash_tw
                .iter()
                .map(|(id, t)| (format!("flash_tw:{id:?}"), t.start, t.duration)),
        );
        for (id, (a, b)) in &self.pit_tw {
            clocks.push((format!("pit-alpha:{id:?}"), a.start, a.duration));
            clocks.push((format!("pit-dx:{id:?}"), b.start, b.duration));
        }
        clocks.extend(
            self.exits
                .iter()
                .map(|(id, t)| (format!("exit:{id:?}"), t.fade.start, t.fade.duration)),
        );
        clocks.extend(
            self.notices
                .iter()
                .map(|(id, t)| (format!("notice:{id:?}"), t.start, Duration::ZERO)),
        );
        clocks.sort_by(|a, b| a.0.cmp(&b.0));
        clocks
    }
}

// Compatibilidad para consumidores de Motion; el ritmo lo gobierna el host.
pub use crate::app::Wake;

fn pit_tweens(active: bool, now: Instant) -> (Tween, Tween) {
    (
        Tween::fixed(if active { 1.0 } else { 0.0 }, now),
        Tween::fixed(if active { 0.0 } else { -5.0 }, now),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(name: &str) -> CarId {
        CarId(
            name.bytes()
                .fold(0u32, |n, b| n.wrapping_mul(31).wrapping_add(u32::from(b))),
        )
    }

    fn row(name: &str, position: i64) -> Row {
        let mut row = Row::unavailable(id(name), position);
        let cells = std::sync::Arc::make_mut(&mut row.row);
        cells.driver = name.into();
        cells.class = "GT3".into();
        row
    }

    fn content_plan(rows: Vec<Row>, sequence: u64) -> ContentPlan {
        ContentPlan {
            rows,
            sequence,
            identity: "s:1".into(),
            race: true,
            ..ContentPlan::unavailable(Status::Ready)
        }
    }

    #[test]
    fn idle_frames_are_shared_and_a_new_photo_invalidates_them() {
        let now = Instant::now();
        let initial = content_plan(vec![row("a", 1)], 1);
        let mut motion = Motion::new();
        motion.update(&initial, 1, true, now);
        let first = motion.frame_shared(&initial, 1, now);
        let same = motion.frame_shared(&initial, 1, now + Duration::from_millis(100));
        assert!(std::sync::Arc::ptr_eq(&first, &same));
        let next = content_plan(vec![row("a", 2)], 2);
        motion.update(&next, 1, true, now + Duration::from_millis(100));
        let changed = motion.frame_shared(&next, 1, now + Duration::from_millis(100));
        assert!(!std::sync::Arc::ptr_eq(&first, &changed));
        assert!(changed.row(id("a")).chip.is_some());
    }

    #[test]
    fn bezier_hits_endpoints_and_is_monotonic() {
        for curve in [EASE, EASE_OUT, FLIP] {
            assert!(curve.at(0.0).abs() < 1e-3 && (curve.at(1.0) - 1.0).abs() < 1e-3);
            let mut last = 0.0;
            for i in 0..=20 {
                let v = curve.at(i as f32 / 20.0);
                assert!(v >= last - 1e-4);
                last = v;
            }
        }
    }

    #[test]
    fn reorder_starts_flip_from_previous_position_and_ends_at_rest() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        motion.update(
            &content_plan(vec![row("a", 1), row("b", 2)], 1),
            2,
            true,
            t0,
        );
        let next = content_plan(vec![row("b", 1), row("a", 2)], 2);
        motion.update(&next, 2, true, t0);
        let frame = motion.frame(&next, 2, t0);
        assert_eq!(frame.row(id("b")).dy, 30.0);
        assert_eq!(frame.row(id("a")).dy, -30.0);
        let done = t0 + Duration::from_millis(1300);
        let frame = motion.frame(&next, 2, done);
        assert_eq!(frame.row(id("b")).dy, 0.0);
        assert!(!motion.animating(done));
    }

    #[test]
    fn first_update_does_not_animate_and_new_row_fades_in() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        let first = content_plan(vec![row("a", 1)], 1);
        motion.update(&first, 1, true, t0);
        assert!(!motion.animating(t0));
        let second = content_plan(vec![row("a", 1), row("b", 2)], 2);
        motion.update(&second, 2, true, t0);
        assert_eq!(motion.frame(&second, 2, t0).row(id("b")).alpha, 0.0);
        assert!(
            (motion
                .frame(&second, 2, t0 + Duration::from_millis(300))
                .row(id("b"))
                .alpha
                - 1.0)
                .abs()
                < 1e-6
        );
    }

    #[test]
    fn row_leaving_the_window_becomes_a_fading_ghost() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        motion.update(
            &content_plan(vec![row("a", 1), row("b", 2)], 1),
            2,
            true,
            t0,
        );
        let next = content_plan(vec![row("a", 1)], 2);
        motion.update(&next, 1, true, t0);
        let frame = motion.frame(&next, 1, t0 + Duration::from_millis(100));
        assert_eq!(frame.ghosts.len(), 1);
        assert!(frame.ghosts[0].vis.alpha < 1.0 && frame.ghosts[0].vis.alpha > 0.0);
        assert!(
            motion
                .frame(&next, 1, t0 + Duration::from_millis(400))
                .ghosts
                .is_empty()
        );
    }

    #[test]
    fn position_gain_sets_flash_chip_and_clears_after_1200ms() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        motion.update(
            &content_plan(vec![row("a", 1), row("b", 2)], 1),
            2,
            true,
            t0,
        );
        let next = content_plan(vec![row("b", 1), row("a", 2)], 2);
        motion.update(&next, 2, true, t0);
        let frame = motion.frame(&next, 2, t0 + Duration::from_millis(600));
        let b = frame.row(id("b"));
        assert!(b.flash > 0.99 && b.flash_up);
        assert_eq!(b.chip.as_ref().map(|c| c.0.as_str()), Some("+1"));
        assert_eq!(
            frame.row(id("a")).chip.as_ref().map(|c| c.0.as_str()),
            Some("−1")
        );
        let frame = motion.frame(&next, 2, t0 + Duration::from_millis(1300));
        assert!(frame.row(id("b")).chip.is_none() && frame.row(id("b")).flash == 0.0);
    }

    #[test]
    fn notices_are_limited_to_three_by_priority() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        let before: Vec<Row> = (1..=8).map(|i| row(&format!("c{i}"), i)).collect();
        motion.update(&content_plan(before.clone(), 1), 8, true, t0);
        // Se intercambian 4 parejas: 8 cambios de posicion, solo 3 avisos.
        let mut after = before;
        for pair in after.chunks_mut(2) {
            pair.swap(0, 1);
            pair[0].position = pair[1].position;
            pair[1].position = pair[0].position + 1;
            pair[0].class_position = pair[0].position;
            pair[1].class_position = pair[1].position;
        }
        let next = content_plan(after, 2);
        motion.update(&next, 8, true, t0);
        let frame = motion.frame(&next, 8, t0);
        let chips = (1..=8)
            .filter(|i| frame.row(id(&format!("c{i}"))).chip.is_some())
            .count();
        assert_eq!(chips, 3);
    }

    #[test]
    fn pit_label_slides_in_when_pit_starts() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        motion.update(&content_plan(vec![row("a", 1)], 1), 1, true, t0);
        let mut pit = row("a", 1);
        std::sync::Arc::make_mut(&mut pit.row).in_pits = true;
        let next = content_plan(vec![pit], 2);
        motion.update(&next, 1, true, t0);
        let start = motion.frame(&next, 1, t0).row(id("a"));
        assert_eq!((start.pit_alpha, start.pit_dx), (0.0, -5.0));
        let end = motion
            .frame(&next, 1, t0 + Duration::from_millis(250))
            .row(id("a"));
        assert_eq!((end.pit_alpha, end.pit_dx), (1.0, 0.0));
    }

    #[test]
    fn a_settled_notice_only_asks_to_wake_when_it_expires() {
        let t0 = Instant::now();
        let ms = Duration::from_millis;
        let mut motion = Motion::new();
        motion.update(
            &content_plan(vec![row("a", 1), row("b", 2)], 1),
            2,
            true,
            t0,
        );
        assert_eq!(motion.wake(t0), Wake::Idle, "sin cambios no hay fotogramas");
        let next = content_plan(vec![row("b", 1), row("a", 2)], 2);
        motion.update(&next, 2, true, t0);
        assert_eq!(motion.wake(t0), Wake::Frame);
        // Pasados el FLIP (<= 460 ms) y el destello (500 ms) el chip queda quieto.
        let settled = t0 + ms(700);
        motion.frame(&next, 2, settled);
        assert_eq!(motion.wake(settled), Wake::At(ms(500)));
        let expired = t0 + ms(1300);
        motion.frame(&next, 2, expired);
        assert_eq!(motion.wake(expired), Wake::Idle);
    }

    #[test]
    fn broken_continuity_resets_without_animation() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        motion.update(
            &content_plan(vec![row("a", 1), row("b", 2)], 5),
            2,
            true,
            t0,
        );
        let mut next = content_plan(vec![row("b", 1), row("a", 2)], 6);
        next.identity = "other:2".into();
        motion.update(&next, 2, true, t0);
        assert_eq!(motion.frame(&next, 2, t0).row(id("b")).dy, 0.0);
    }

    #[test]
    fn battle_needs_close_same_class_race_rivals_and_keeps_hysteresis() {
        let mut a = row("a", 1);
        let mut b = row("b", 2);
        std::sync::Arc::make_mut(&mut a.row).battle_gap_seconds = Some(10.0);
        std::sync::Arc::make_mut(&mut b.row).battle_gap_seconds = Some(10.5);
        let visible: HashSet<CarId> = [id("a"), id("b")].into();
        let close = content_plan(vec![a.clone(), b.clone()], 1);
        let battle = select_battle(&close, &visible, None).expect("duelo a 0,5 s");
        std::sync::Arc::make_mut(&mut b.row).battle_gap_seconds = Some(11.1);
        let wider = content_plan(vec![a, b], 2);
        assert!(select_battle(&wider, &visible, None).is_none());
        assert!(select_battle(&wider, &visible, Some(&battle)).is_some());
    }
}
