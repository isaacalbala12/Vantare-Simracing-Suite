//! Animaciones de Standings Eficiencia (`useStandingsMotion`, `standings-motion`,
//! `standings-presence`, `widget-motion.flipRows`), con `motion = full`.
//!
//! Maquina de estados pura: recibe ViewModels sucesivos y muestrea el estado
//! visual en un instante dado. No toca GPUI; `view.rs` solo pinta el `Frame`.

use super::model::{Row, Status, Vm};
use std::{
    collections::{HashMap, HashSet},
    time::{Duration, Instant},
};

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

/// Transicion de un escalar; al cambiar de objetivo parte del valor actual.
#[derive(Clone, Copy, Debug)]
pub struct Tween {
    from: f32,
    to: f32,
    start: Instant,
    duration: Duration,
    ease: Bezier,
}

impl Tween {
    pub fn fixed(value: f32, now: Instant) -> Self {
        Self {
            from: value,
            to: value,
            start: now,
            duration: Duration::ZERO,
            ease: EASE,
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
        self.ease = ease;
    }

    pub fn animate(from: f32, to: f32, now: Instant, duration_ms: u64, ease: Bezier) -> Self {
        Self {
            from,
            to,
            start: now,
            duration: Duration::from_millis(duration_ms),
            ease,
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
    vis: HashMap<String, RowVis>,
    pub ghosts: Vec<Ghost>,
}

impl Frame {
    pub fn row(&self, id: &str) -> RowVis {
        self.vis.get(id).cloned().unwrap_or_default()
    }
}

fn is_session_best(vm: &Vm, id: &str) -> bool {
    vm.session_best.as_ref().is_some_and(|(best, _)| best == id)
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
    pub row_id: String,
    pub kind: EventKind,
    pub places: i64,
}

pub fn motion_continues(prev: &Vm, next: &Vm) -> bool {
    prev.status == Status::Ready
        && next.status == Status::Ready
        && prev.identity == next.identity
        && prev.session_label == next.session_label
        && next.sequence >= prev.sequence
}

fn valid_lap(seconds: Option<f64>) -> Option<f64> {
    seconds.filter(|s| s.is_finite() && *s > 0.0)
}

pub fn derive_events(prev: &Vm, next: &Vm, lap_visible: bool) -> Vec<Event> {
    if !motion_continues(prev, next) {
        return Vec::new();
    }
    let before: HashMap<&str, &Row> = prev.rows.iter().map(|r| (r.id.as_str(), r)).collect();
    let mut events = Vec::new();
    for row in &next.rows {
        let Some(old) = before.get(row.id.as_str()) else {
            continue;
        };
        if old.vehicle_class != row.vehicle_class {
            continue;
        }
        let (previous, current) = (old.position, row.position);
        let places = if previous > 0 && current > 0 {
            previous - current
        } else {
            0
        };
        let improved = match (
            valid_lap(old.best_lap_seconds),
            valid_lap(row.best_lap_seconds),
        ) {
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
                row_id: row.id.clone(),
                kind: EventKind::SessionBest,
                places: 0,
            });
        } else if places != 0 {
            events.push(Event {
                row_id: row.id.clone(),
                kind: EventKind::Position,
                places,
            });
        } else if lap_visible && improved {
            events.push(Event {
                row_id: row.id.clone(),
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
    pub ahead: String,
    pub behind: String,
    pub gap: f64,
    pub player: bool,
}

/// `selectStandingsBattle`: un duelo de la misma clase, con histeresis.
#[allow(clippy::implicit_hasher)]
pub fn select_battle(
    vm: &Vm,
    visible: &HashSet<String>,
    previous: Option<&Battle>,
) -> Option<Battle> {
    if vm.status != Status::Ready || !vm.race {
        return None;
    }
    let rows: Vec<&Row> = vm.rows.iter().filter(|r| visible.contains(&r.id)).collect();
    let mut candidates: Vec<Battle> = Vec::new();
    for behind in &rows {
        let class = behind.vehicle_class.trim().to_uppercase();
        if class.is_empty() || behind.class_position < 2 {
            continue;
        }
        let Some(ahead) = rows.iter().find(|r| {
            r.vehicle_class.trim().to_uppercase() == class
                && r.class_position == behind.class_position - 1
        }) else {
            continue;
        };
        if ahead.pit_active || behind.pit_active {
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
                ahead: ahead.id.clone(),
                behind: behind.id.clone(),
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

struct Notice {
    priority: u8,
    kind: EventKind,
    start: Instant,
    places: i64,
}

struct ExitRow {
    row: Row,
    top: f32,
    fade: Tween,
}

#[derive(Default)]
pub struct Motion {
    prev: Option<Vm>,
    /// Resultado derivado reutilizable solo mientras no hay animacion ni nueva ingestion.
    idle_frame: Option<std::sync::Arc<Frame>>,
    /// Tops de layout (relativos al cuerpo) de la ultima pasada, por id.
    tops: HashMap<String, f32>,
    flips: HashMap<String, Tween>,
    fades: HashMap<String, Tween>,
    exits: HashMap<String, ExitRow>,
    presence: HashMap<String, Row>,
    notices: HashMap<String, Notice>,
    battle: Option<Battle>,
    battle_tw: HashMap<String, Tween>,
    best_tw: HashMap<String, Tween>,
    pit_tw: HashMap<String, (Tween, Tween)>,
    chip_tw: HashMap<String, Tween>,
    flash_tw: HashMap<String, Tween>,
}

impl Motion {
    pub fn new() -> Self {
        Self::default()
    }

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
            .filter_map(|(id, n)| {
                Some((
                    vantare_domain::CarId(id.parse().ok()?),
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
                ))
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
                id.0.to_string(),
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

    /// Registra un nuevo ViewModel. `visible` = filas pintadas (prefijo de `vm.rows`);
    /// `lap_visible` = columna de mejor vuelta activa.
    pub fn update(&mut self, vm: &Vm, visible: usize, lap_visible: bool, now: Instant) {
        self.idle_frame = None;
        if vm.status != Status::Ready {
            self.reset();
            self.prev = None;
            return;
        }
        let visible_rows: Vec<&Row> = vm.rows.iter().take(visible).collect();
        let seeded = self.prev.is_some();
        let Some(prev) = self.prev.clone().filter(|p| motion_continues(p, vm)) else {
            // Se rompe la continuidad: se descarta todo y se re-siembra sin animar.
            let pit_state: HashMap<String, bool> = visible_rows
                .iter()
                .map(|r| (r.id.clone(), r.pit_active))
                .collect();
            self.reset();
            self.seed(&visible_rows, now);
            for (id, active) in pit_state {
                self.pit_tw.insert(id, pit_tweens(active, now));
            }
            self.sync_best_marker(vm, &visible_rows, now, seeded);
            self.prev = Some(vm.clone());
            return;
        };

        // 1) Presencia: filas que salen o entran de la ventana visible.
        let current_ids: HashSet<&str> = visible_rows.iter().map(|r| r.id.as_str()).collect();
        let dropped: Vec<(String, Row)> = self
            .presence
            .iter()
            .filter(|(id, _)| !current_ids.contains(id.as_str()))
            .map(|(id, row)| (id.clone(), row.clone()))
            .collect();
        for (id, row) in dropped {
            let flight = self.flips.get(&id).map_or(0.0, |t| t.value(now));
            let top = self.tops.get(&id).copied().unwrap_or(0.0) + flight;
            let from = self.fades.get(&id).map_or(1.0, |t| t.value(now));
            self.exits.insert(
                id.clone(),
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
                self.tops.insert(row.id.clone(), exit.top);
                exit.fade.value(now)
            } else {
                0.0
            };
            self.fades.insert(
                row.id.clone(),
                Tween::animate(from, 1.0, now, FADE_MS, EASE_OUT),
            );
            self.pit_tw
                .entry(row.id.clone())
                .or_insert_with(|| pit_tweens(row.pit_active, now));
        }

        // 2) FLIP por identidad.
        for (index, row) in visible_rows.iter().enumerate() {
            let top = index as f32 * super::model::ROW_HEIGHT;
            let in_flight = self.flips.get(&row.id).map_or(0.0, |t| t.value(now));
            self.flips.remove(&row.id);
            let previous = self.tops.insert(row.id.clone(), top);
            if let Some(previous) = previous {
                let from = previous - top + in_flight;
                if from.abs() >= 0.5 {
                    let duration = (280.0 + from.abs() * 1.1).min(460.0) as u64;
                    self.flips.insert(
                        row.id.clone(),
                        Tween::animate(from, 0.0, now, duration, FLIP),
                    );
                }
            }
        }
        self.tops.retain(|id, _| current_ids.contains(id.as_str()));
        self.presence = visible_rows
            .iter()
            .map(|r| (r.id.clone(), (*r).clone()))
            .collect();

        // 3) Duelo y avisos.
        let visible_set: HashSet<String> = visible_rows.iter().map(|r| r.id.clone()).collect();
        let battle = select_battle(vm, &visible_set, self.battle.as_ref());
        self.battle = battle;
        self.notices.retain(|_, n| {
            now.saturating_duration_since(n.start) < Duration::from_millis(NOTICE_MS)
        });
        for event in derive_events(&prev, vm, lap_visible) {
            if !visible_set.contains(&event.row_id) {
                continue;
            }
            let priority = event.kind.priority();
            if !self.notices.contains_key(&event.row_id) && self.notices.len() >= MAX_NOTICES {
                let lowest = self
                    .notices
                    .iter()
                    .min_by_key(|(_, n)| n.priority)
                    .map(|(id, n)| (id.clone(), n.priority));
                if let Some((id, lowest_priority)) = lowest {
                    if lowest_priority >= priority {
                        continue;
                    }
                    self.clear_notice(&id);
                }
            }
            if self
                .notices
                .get(&event.row_id)
                .is_some_and(|n| n.priority > priority)
            {
                continue;
            }
            self.clear_notice(&event.row_id);
            self.notices.insert(
                event.row_id.clone(),
                Notice {
                    priority,
                    kind: event.kind,
                    start: now,
                    places: event.places,
                },
            );
            if event.kind == EventKind::Position {
                self.flash_tw.insert(
                    event.row_id.clone(),
                    Tween::animate(0.0, 1.0, now, 500, EASE_OUT),
                );
                self.chip_tw.insert(
                    event.row_id.clone(),
                    Tween::animate(0.0, 1.0, now, 180, EASE),
                );
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
                .entry(row.id.clone())
                .or_insert_with(|| Tween::fixed(0.0, now))
                .retarget(target, now, 200, EASE);
            let (alpha, dx) = self
                .pit_tw
                .entry(row.id.clone())
                .or_insert_with(|| pit_tweens(row.pit_active, now));
            alpha.retarget(if row.pit_active { 1.0 } else { 0.0 }, now, 200, EASE);
            dx.retarget(if row.pit_active { 0.0 } else { -5.0 }, now, 200, EASE);
        }
        self.sync_best_marker(vm, &visible_rows, now, true);
        self.prev = Some(vm.clone());
    }

    fn sync_best_marker(&mut self, vm: &Vm, rows: &[&Row], now: Instant, animate: bool) {
        for row in rows {
            let target = if is_session_best(vm, &row.id) {
                1.0
            } else {
                0.0
            };
            let entry = self
                .best_tw
                .entry(row.id.clone())
                .or_insert_with(|| Tween::fixed(target, now));
            if animate {
                entry.retarget(target, now, 220, EASE);
            } else {
                *entry = Tween::fixed(target, now);
            }
        }
    }

    fn seed(&mut self, rows: &[&Row], now: Instant) {
        for (index, row) in rows.iter().enumerate() {
            self.tops
                .insert(row.id.clone(), index as f32 * super::model::ROW_HEIGHT);
            self.presence.insert(row.id.clone(), (*row).clone());
            self.fades.insert(row.id.clone(), Tween::fixed(1.0, now));
        }
    }

    fn clear_notice(&mut self, id: &str) {
        self.notices.remove(id);
        self.flash_tw.remove(id);
        self.chip_tw.remove(id);
    }

    /// Un frame quieto no vuelve a asignar mapas de filas; update/restaurar avisos lo invalida.
    pub(super) fn frame_shared(&mut self, vm: &Vm, visible: usize, now: Instant) -> std::sync::Arc<Frame> {
        if self.wake(now) == Wake::Idle
            && let Some(frame) = &self.idle_frame {
            return frame.clone();
        }
        let frame = std::sync::Arc::new(self.frame(vm, visible, now));
        self.idle_frame = (self.wake(now) == Wake::Idle).then(|| frame.clone());
        frame
    }

    /// Estado visual en `now`.
    pub fn frame(&mut self, vm: &Vm, visible: usize, now: Instant) -> Frame {
        self.notices.retain(|_, n| {
            now.saturating_duration_since(n.start) < Duration::from_millis(NOTICE_MS)
        });
        let ids: HashSet<String> = self.notices.keys().cloned().collect();
        self.flash_tw.retain(|id, _| ids.contains(id));
        self.chip_tw.retain(|id, _| ids.contains(id));
        self.exits.retain(|_, e| e.fade.running(now));
        let mut vis = HashMap::new();
        for row in vm.rows.iter().take(visible) {
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
                v.pit_alpha = if row.pit_active { 1.0 } else { 0.0 };
                v.pit_dx = if row.pit_active { 0.0 } else { -5.0 };
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
            vis.insert(row.id.clone(), v);
        }
        let ghosts = self
            .exits
            .values()
            .map(|e| Ghost {
                row: e.row.clone(),
                top: e.top,
                vis: RowVis {
                    alpha: e.fade.value(now),
                    pit_alpha: if e.row.pit_active { 1.0 } else { 0.0 },
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
    use vantare_domain::format::PLACEHOLDER;

    fn row(id: &str, position: i64) -> Row {
        Row {
            id: id.into(),
            position,
            class_position: position,
            driver_number: String::new(),
            driver_name: id.into(),
            vehicle_class: "GT3".into(),
            gap_text: PLACEHOLDER.into(),
            interval_text: PLACEHOLDER.into(),
            current_lap_text: PLACEHOLDER.into(),
            last_lap_text: PLACEHOLDER.into(),
            best_lap_text: PLACEHOLDER.into(),
            best_lap_seconds: None,
            battle_gap_seconds: None,
            pit_active: false,
            is_player: false,
        }
    }

    fn vm(rows: Vec<Row>, sequence: u64) -> Vm {
        Vm {
            rows,
            sequence,
            identity: "s:1".into(),
            session_label: "RACE".into(),
            race: true,
            ..Vm::unavailable(Status::Ready)
        }
    }

    #[test]
    fn idle_frames_are_shared_and_a_new_photo_invalidates_them() {
        let now = Instant::now();
        let initial = vm(vec![row("a", 1)], 1);
        let mut motion = Motion::new();
        motion.update(&initial, 1, true, now);
        let first = motion.frame_shared(&initial, 1, now);
        let same = motion.frame_shared(&initial, 1, now + Duration::from_millis(100));
        assert!(std::sync::Arc::ptr_eq(&first, &same));
        let next = vm(vec![row("a", 2)], 2);
        motion.update(&next, 1, true, now + Duration::from_millis(100));
        let changed = motion.frame_shared(&next, 1, now + Duration::from_millis(100));
        assert!(!std::sync::Arc::ptr_eq(&first, &changed));
        assert!(changed.row("a").chip.is_some());
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
        motion.update(&vm(vec![row("a", 1), row("b", 2)], 1), 2, true, t0);
        let next = vm(vec![row("b", 1), row("a", 2)], 2);
        motion.update(&next, 2, true, t0);
        let frame = motion.frame(&next, 2, t0);
        assert_eq!(frame.row("b").dy, 30.0);
        assert_eq!(frame.row("a").dy, -30.0);
        let done = t0 + Duration::from_millis(1300);
        let frame = motion.frame(&next, 2, done);
        assert_eq!(frame.row("b").dy, 0.0);
        assert!(!motion.animating(done));
    }

    #[test]
    fn first_update_does_not_animate_and_new_row_fades_in() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        let first = vm(vec![row("a", 1)], 1);
        motion.update(&first, 1, true, t0);
        assert!(!motion.animating(t0));
        let second = vm(vec![row("a", 1), row("b", 2)], 2);
        motion.update(&second, 2, true, t0);
        assert_eq!(motion.frame(&second, 2, t0).row("b").alpha, 0.0);
        assert!(
            (motion
                .frame(&second, 2, t0 + Duration::from_millis(300))
                .row("b")
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
        motion.update(&vm(vec![row("a", 1), row("b", 2)], 1), 2, true, t0);
        let next = vm(vec![row("a", 1)], 2);
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
        motion.update(&vm(vec![row("a", 1), row("b", 2)], 1), 2, true, t0);
        let next = vm(vec![row("b", 1), row("a", 2)], 2);
        motion.update(&next, 2, true, t0);
        let frame = motion.frame(&next, 2, t0 + Duration::from_millis(600));
        let b = frame.row("b");
        assert!(b.flash > 0.99 && b.flash_up);
        assert_eq!(b.chip.as_ref().map(|c| c.0.as_str()), Some("+1"));
        assert_eq!(
            frame.row("a").chip.as_ref().map(|c| c.0.as_str()),
            Some("−1")
        );
        let frame = motion.frame(&next, 2, t0 + Duration::from_millis(1300));
        assert!(frame.row("b").chip.is_none() && frame.row("b").flash == 0.0);
    }

    #[test]
    fn notices_are_limited_to_three_by_priority() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        let before: Vec<Row> = (1..=8).map(|i| row(&format!("c{i}"), i)).collect();
        motion.update(&vm(before.clone(), 1), 8, true, t0);
        // Se intercambian 4 parejas: 8 cambios de posicion, solo 3 avisos.
        let mut after = before;
        for pair in after.chunks_mut(2) {
            pair.swap(0, 1);
            pair[0].position = pair[1].position;
            pair[1].position = pair[0].position + 1;
            pair[0].class_position = pair[0].position;
            pair[1].class_position = pair[1].position;
        }
        let next = vm(after, 2);
        motion.update(&next, 8, true, t0);
        let frame = motion.frame(&next, 8, t0);
        let chips = (1..=8)
            .filter(|i| frame.row(&format!("c{i}")).chip.is_some())
            .count();
        assert_eq!(chips, 3);
    }

    #[test]
    fn pit_label_slides_in_when_pit_starts() {
        let t0 = Instant::now();
        let mut motion = Motion::new();
        motion.update(&vm(vec![row("a", 1)], 1), 1, true, t0);
        let mut pit = row("a", 1);
        pit.pit_active = true;
        let next = vm(vec![pit], 2);
        motion.update(&next, 1, true, t0);
        let start = motion.frame(&next, 1, t0).row("a");
        assert_eq!((start.pit_alpha, start.pit_dx), (0.0, -5.0));
        let end = motion
            .frame(&next, 1, t0 + Duration::from_millis(250))
            .row("a");
        assert_eq!((end.pit_alpha, end.pit_dx), (1.0, 0.0));
    }

    #[test]
    fn a_settled_notice_only_asks_to_wake_when_it_expires() {
        let t0 = Instant::now();
        let ms = Duration::from_millis;
        let mut motion = Motion::new();
        motion.update(&vm(vec![row("a", 1), row("b", 2)], 1), 2, true, t0);
        assert_eq!(motion.wake(t0), Wake::Idle, "sin cambios no hay fotogramas");
        let next = vm(vec![row("b", 1), row("a", 2)], 2);
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
        motion.update(&vm(vec![row("a", 1), row("b", 2)], 5), 2, true, t0);
        let mut next = vm(vec![row("b", 1), row("a", 2)], 6);
        next.identity = "other:2".into();
        motion.update(&next, 2, true, t0);
        assert_eq!(motion.frame(&next, 2, t0).row("b").dy, 0.0);
    }

    #[test]
    fn battle_needs_close_same_class_race_rivals_and_keeps_hysteresis() {
        let mut a = row("a", 1);
        let mut b = row("b", 2);
        a.battle_gap_seconds = Some(10.0);
        b.battle_gap_seconds = Some(10.5);
        let visible: HashSet<String> = ["a".to_string(), "b".to_string()].into();
        let close = vm(vec![a.clone(), b.clone()], 1);
        let battle = select_battle(&close, &visible, None).expect("duelo a 0,5 s");
        b.battle_gap_seconds = Some(11.1);
        let wider = vm(vec![a, b], 2);
        assert!(select_battle(&wider, &visible, None).is_none());
        assert!(select_battle(&wider, &visible, Some(&battle)).is_some());
    }
}
