//! Standings motion: FLIP, fade, and the GPUI effects (row flash, position chip,
//! best-lap sweep, battle underline, session-best marker and pit badge). Times
//! and curves are literal from `ui/src/standings/motion.rs`; the Runtime lends
//! the clock and wakes only while something moves or a notice expires.
use super::scene::Row;
use crate::motion::{self, Tween};
use std::collections::{BTreeMap, BTreeSet};
use vantare_domain::standings::{Plan, Status};

const MIN_FLIP_PX: f32 = 0.5;
/// GPUI `NOTICE_MS`, `SWEEP_MS` y `FADE_MS` de `standings/motion.rs`.
pub(super) const NOTICE_MS: f64 = 1.200;
pub(super) const SWEEP_MS: f64 = 0.800;
const EASE: [f32; 4] = [0.25, 0.1, 0.25, 1.0];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Flash {
    Gain,
    Loss,
    Lead,
    Best,
    PersonalBest,
    Pit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum EventKind {
    PersonalBest,
    Position,
    SessionBest,
    Lead,
    Pit,
}

impl EventKind {
    fn priority(self) -> u8 {
        match self {
            Self::SessionBest => 3,
            Self::Position | Self::Lead | Self::Pit => 2,
            Self::PersonalBest => 1,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Event {
    row_id: u32,
    kind: EventKind,
    places: i64,
}

/// GPUI `motion_continues`: la foto repetida o atrasada no reinicia el
/// movimiento; la identidad/sesión distinta sí. `sequence` es continuidad, no
/// clave de proyección ni de caché.
pub(super) fn motion_continues(prev: &Plan, next: &Plan) -> bool {
    prev.status == Status::Ready
        && next.status == Status::Ready
        && prev.identity == next.identity
        && prev.session_label() == next.session_label()
        && next.sequence >= prev.sequence
}

fn valid_lap(seconds: Option<f64>) -> Option<f64> {
    seconds.filter(|s| s.is_finite() && *s > 0.0)
}

fn derive_events(prev: &Plan, next: &Plan, lap_visible: bool) -> Vec<Event> {
    if !motion_continues(prev, next) {
        return Vec::new();
    }
    let before: BTreeMap<u32, (i64, Option<f64>, &str)> = prev
        .rows
        .iter()
        .map(|row| (row.id.0, (row.position, row.best_lap_s, row.class.as_ref())))
        .collect();
    let mut events = Vec::new();
    for row in &next.rows {
        let Some((old_position, old_best, old_class)) = before.get(&row.id.0) else {
            continue;
        };
        if *old_class != row.class.as_ref() {
            continue;
        }
        let (previous, current) = (*old_position, row.position);
        let places = if previous > 0 && current > 0 {
            previous - current
        } else {
            0
        };
        let improved = match (valid_lap(*old_best), valid_lap(row.best_lap_s)) {
            (Some(old), Some(new)) => new < old - 0.0005,
            _ => false,
        };
        let session_best = lap_visible
            && improved
            && next.session_best.is_some_and(|(id, _)| id == row.id)
            && match (prev.session_best.map(|(_, s)| s), next.session_best.map(|(_, s)| s)) {
                (Some(old), Some(new)) => new < old - 0.0005,
                _ => false,
            };
        if session_best {
            events.push(Event {
                row_id: row.id.0,
                kind: EventKind::SessionBest,
                places: 0,
            });
        } else if places != 0 {
            events.push(Event {
                row_id: row.id.0,
                kind: EventKind::Position,
                places,
            });
        } else if lap_visible && improved {
            events.push(Event {
                row_id: row.id.0,
                kind: EventKind::PersonalBest,
                places: 0,
            });
        }
    }
    events.sort_by_key(|event| std::cmp::Reverse(event.kind.priority()));
    events
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Battle {
    ahead: u32,
    behind: u32,
}

fn select_battle(plan: &Plan, previous: Option<Battle>) -> Option<Battle> {
    let visible: Vec<_> = plan.rows.iter().filter(|row| !row.in_pits).collect();
    let mut best: Option<(Battle, f64)> = None;
    for pair in visible.windows(2) {
        let (ahead, behind) = (pair[0], pair[1]);
        if ahead.class != behind.class {
            continue;
        }
        let Some(gap) = behind.battle_gap_seconds.or(ahead.battle_gap_seconds) else {
            continue;
        };
        let limit = if ahead.is_player || behind.is_player {
            2.5
        } else {
            1.0
        };
        let held = previous.is_some_and(|old| {
            (old.ahead == ahead.id.0 && old.behind == behind.id.0)
                || (old.ahead == behind.id.0 && old.behind == ahead.id.0)
        });
        if gap > if held { limit + 0.5 } else { limit } {
            continue;
        }
        let fight = Battle {
            ahead: ahead.id.0,
            behind: behind.id.0,
        };
        let player = ahead.is_player || behind.is_player;
        let score = if player { gap - 10.0 } else { gap };
        if best.as_ref().is_none_or(|(_, old)| score < *old) {
            best = Some((fight, score));
        }
    }
    best.map(|(battle, _)| battle)
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(super) struct RowVis {
    pub dy: f32,
    pub alpha: f32,
    pub flash: Option<(Flash, f32)>,
    pub chip: Option<(i64, f32)>,
    pub battle: f32,
    pub best_marker: f32,
    pub pit_alpha: f32,
    pub pit_dx: f32,
    pub sweep: Option<(bool, f32, f32)>,
}

#[derive(Clone, Debug, PartialEq)]
pub(super) struct Ghost {
    pub row: Row,
    pub top: f32,
    pub alpha: f32,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub(super) struct Visual {
    pub rows: BTreeMap<u32, RowVis>,
    pub ghosts: Vec<Ghost>,
}

#[derive(Clone)]
struct Channels {
    dy: Tween,
    alpha: Tween,
}

#[derive(Clone)]
struct Exit {
    row: Row,
    top: f32,
    fade: Tween,
}

#[derive(Clone, Copy)]
struct Notice {
    kind: EventKind,
    start: f64,
    places: i64,
    priority: u8,
}

#[derive(Clone, Copy)]
struct Pit {
    alpha: Tween,
    dx: Tween,
}

#[derive(Clone, Default)]
pub(super) struct Motion {
    tops: BTreeMap<u32, f32>,
    last: BTreeMap<u32, Row>,
    rows: BTreeMap<u32, Channels>,
    exits: Vec<Exit>,
    seeded: bool,
    reduced: bool,
    notices: BTreeMap<u32, Notice>,
    flash: BTreeMap<u32, Tween>,
    chip: BTreeMap<u32, Tween>,
    battle: BTreeMap<u32, Tween>,
    battle_pick: Option<Battle>,
    best: BTreeMap<u32, Tween>,
    pits: BTreeMap<u32, Pit>,
}

impl Motion {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn policy(&mut self, reduced: bool) -> bool {
        if self.reduced == reduced {
            return false;
        }
        self.reduced = reduced;
        if reduced {
            self.snap();
        }
        true
    }
    /// Eventos de la foto nueva: destello/chip/barrido y objetivos por fila.
    pub fn events(&mut self, prev: &Plan, next: &Plan, clock: f64) {
        if self.reduced {
            return;
        }
        let visible: BTreeSet<u32> = next.rows.iter().map(|row| row.id.0).collect();
        for event in derive_events(prev, next, next.board.content.lap_visible) {
            let priority = event.kind.priority();
            if self
                .notices
                .get(&event.row_id)
                .is_some_and(|old| old.priority > priority)
            {
                continue;
            }
            self.notices.insert(
                event.row_id,
                Notice {
                    kind: event.kind,
                    start: clock,
                    places: event.places,
                    priority,
                },
            );
            self.flash.remove(&event.row_id);
            self.chip.remove(&event.row_id);
            if matches!(event.kind, EventKind::Position) {
                self.flash.insert(
                    event.row_id,
                    tween(0.0, 1.0, clock, 0.500, motion::EASE_OUT),
                );
                self.chip.insert(event.row_id, tween(0.0, 1.0, clock, 0.180, EASE));
            }
        }
        self.battle_pick = select_battle(next, self.battle_pick);
        for row in &next.rows {
            let id = row.id.0;
            let target = if self.battle_pick.is_some_and(|battle| {
                (battle.ahead == id || battle.behind == id) && !self.notices.contains_key(&id)
            }) {
                1.0
            } else {
                0.0
            };
            retarget(&mut self.battle, id, target, clock, 0.200, EASE);
            let best = if next.session_best.is_some_and(|(car, _)| car == row.id) {
                1.0
            } else {
                0.0
            };
            retarget(&mut self.best, id, best, clock, 0.220, EASE);
            let pit = self.pits.entry(id).or_insert_with(|| Pit {
                alpha: Tween::fixed(if row.in_pits { 1.0 } else { 0.0 }),
                dx: Tween::fixed(if row.in_pits { 0.0 } else { -5.0 }),
            });
            pit.alpha.retarget(if row.in_pits { 1.0 } else { 0.0 }, clock, 0.200);
            pit.dx.retarget(if row.in_pits { 0.0 } else { -5.0 }, clock, 0.200);
        }
        self.notices.retain(|id, _| visible.contains(id));
    }
    /// Filas visibles en orden y su `y` de layout.
    pub fn update(&mut self, rows: &[(&Row, f32)], clock: f64) {
        if self.reduced {
            self.tops = rows.iter().map(|(row, y)| (row.id, *y)).collect();
            self.rows = rows
                .iter()
                .map(|(row, _)| {
                    (
                        row.id,
                        Channels {
                            dy: Tween::fixed(0.0),
                            alpha: Tween::fixed(1.0),
                        },
                    )
                })
                .collect();
            self.last = rows.iter().map(|(row, _)| (row.id, (*row).clone())).collect();
            self.exits.clear();
            self.seeded = true;
            return;
        }
        let first = !self.seeded;
        self.seeded = true;
        let current: BTreeSet<u32> = rows.iter().map(|(row, _)| row.id).collect();
        let gone: Vec<u32> = self
            .tops
            .keys()
            .copied()
            .filter(|id| !current.contains(id))
            .collect();
        for id in gone {
            let Some(top) = self.tops.remove(&id) else {
                continue;
            };
            let Some(channels) = self.rows.remove(&id) else {
                continue;
            };
            if let Some(row) = self.last.get(&id).cloned() {
                let top = top + channels.dy.value(clock);
                let from = channels.alpha.value(clock);
                self.exits.push(Exit {
                    row,
                    top,
                    fade: fade(from, 0.0, clock),
                });
            }
        }
        self.exits.retain(|exit| exit.fade.value(clock) > 0.0);
        for (row, y) in rows {
            let previous = self.tops.insert(row.id, *y);
            let mut resumed = None;
            if let Some(index) = self.exits.iter().position(|exit| exit.row.id == row.id) {
                resumed = Some(self.exits.remove(index).fade.value(clock));
            }
            let channels = self.rows.entry(row.id).or_insert(Channels {
                dy: Tween::fixed(0.0),
                alpha: Tween::fixed(1.0),
            });
            if first {
                channels.dy = Tween::fixed(0.0);
                channels.alpha = Tween::fixed(1.0);
            } else if previous.is_none() {
                channels.alpha = fade(resumed.unwrap_or(0.0), 1.0, clock);
            } else {
                let from = previous.unwrap_or(*y) - *y + channels.dy.value(clock);
                channels.dy = if from.abs() >= MIN_FLIP_PX {
                    let duration = motion::flip_ms(from) / 1000.0;
                    tween(from, 0.0, clock, duration, motion::FLIP)
                } else {
                    Tween::fixed(0.0)
                };
            }
            self.last.insert(row.id, (*row).clone());
        }
    }
    pub fn sample(&mut self, clock: f64) -> Visual {
        self.exits.retain(|exit| exit.fade.value(clock) > 0.0);
        self.notices
            .retain(|_, notice| clock - notice.start < NOTICE_MS);
        Visual {
            rows: self
                .rows
                .iter()
                .filter(|(id, _)| self.tops.contains_key(id))
                .map(|(id, channels)| {
                    let notice = self.notices.get(id).copied();
                    let mut vis = RowVis {
                        dy: channels.dy.value(clock),
                        alpha: channels.alpha.value(clock),
                        battle: self.battle.get(id).map_or(0.0, |t| t.value(clock)),
                        best_marker: self.best.get(id).map_or(0.0, |t| t.value(clock)),
                        ..RowVis::default()
                    };
                    if let Some(pit) = self.pits.get(id) {
                        vis.pit_alpha = pit.alpha.value(clock);
                        vis.pit_dx = pit.dx.value(clock);
                    }
                    if let Some(notice) = notice {
                        match notice.kind {
                            EventKind::Position | EventKind::Lead => {
                                vis.flash = Some((
                                    if notice.places > 0 {
                                        Flash::Gain
                                    } else {
                                        Flash::Loss
                                    },
                                    self.flash.get(id).map_or(1.0, |t| t.value(clock)),
                                ));
                                vis.chip = Some((
                                    notice.places,
                                    self.chip.get(id).map_or(1.0, |t| t.value(clock)),
                                ));
                            }
                            EventKind::Pit => {
                                vis.pit_alpha = 1.0;
                                vis.pit_dx = 0.0;
                            }
                            EventKind::PersonalBest | EventKind::SessionBest => {
                                let elapsed = clock - notice.start;
                                if elapsed < SWEEP_MS {
                                    let p = ease_out_at((elapsed / SWEEP_MS) as f32);
                                    let (opacity, x) = if p < 0.4 {
                                        let k = p / 0.4;
                                        (0.7 * k, -1.0 + k)
                                    } else {
                                        let k = (p - 0.4) / 0.6;
                                        (0.7 * (1.0 - k), k)
                                    };
                                    vis.sweep = Some((
                                        notice.kind == EventKind::SessionBest,
                                        opacity,
                                        x,
                                    ));
                                }
                            }
                        }
                    }
                    (*id, vis)
                })
                .collect(),
            ghosts: self
                .exits
                .iter()
                .map(|exit| Ghost {
                    row: exit.row.clone(),
                    top: exit.top,
                    alpha: exit.fade.value(clock),
                })
                .collect(),
        }
    }
    pub fn next_wake(&self, clock: f64) -> Option<f64> {
        if self.reduced {
            return self
                .notices
                .values()
                .filter_map(|notice| {
                    let due = notice.start + NOTICE_MS;
                    (clock < due).then_some(due)
                })
                .min_by(f64::total_cmp);
        }
        let moving = self
            .rows
            .values()
            .any(|channels| channels.dy.active(clock) || channels.alpha.active(clock))
            || self.exits.iter().any(|exit| exit.fade.active(clock))
            || self.battle.values().any(|t| t.active(clock))
            || self.best.values().any(|t| t.active(clock))
            || self.flash.values().any(|t| t.active(clock))
            || self.chip.values().any(|t| t.active(clock))
            || self.pits.values().any(|pit| pit.alpha.active(clock) || pit.dx.active(clock))
            || self
                .notices
                .values()
                .any(|notice| clock - notice.start < SWEEP_MS);
        if moving {
            return Some(clock);
        }
        self.notices
            .values()
            .filter_map(|notice| {
                let due = notice.start + NOTICE_MS;
                (clock < due).then_some(due)
            })
            .min_by(f64::total_cmp)
    }
    fn snap(&mut self) {
        for channels in self.rows.values_mut() {
            channels.dy = Tween::fixed(0.0);
            channels.alpha = Tween::fixed(1.0);
        }
        self.exits.clear();
        self.notices.clear();
        self.flash.clear();
        self.chip.clear();
        self.battle.clear();
        self.best.clear();
        for pit in self.pits.values_mut() {
            pit.alpha.settle();
            pit.dx.settle();
        }
    }
}

fn retarget(
    map: &mut BTreeMap<u32, Tween>,
    id: u32,
    value: f32,
    clock: f64,
    duration: f64,
    curve: [f32; 4],
) {
    map.entry(id)
        .or_insert_with(|| Tween::fixed(value).with_curve(curve))
        .retarget(value, clock, duration);
}

fn tween(from: f32, to: f32, clock: f64, duration: f64, curve: [f32; 4]) -> Tween {
    let mut tween = Tween::fixed(from).with_curve(curve);
    tween.retarget(to, clock, duration);
    tween
}

fn fade(from: f32, to: f32, clock: f64) -> Tween {
    tween(
        from,
        to,
        clock,
        motion::FADE_MS as f64 / 1000.0,
        motion::EASE_OUT,
    )
}

fn ease_out_at(t: f32) -> f32 {
    let [x1, y1, x2, y2] = motion::EASE_OUT;
    rune::Easing::cubic(x1, y1, x2, y2).eval(t.clamp(0.0, 1.0))
}
