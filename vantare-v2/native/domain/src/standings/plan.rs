//! Selección de contenido compartida. Las filas prestan el Board; no copian textos.
use super::{Board, Row};
use crate::{Capability, SourceState};
use std::sync::Arc;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Ready,
    Stale,
    Disconnected,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SelectedRow {
    pub row: Arc<Row>,
    pub id: String,
    pub position: i64,
    pub class_position: i64,
}
impl std::ops::Deref for SelectedRow {
    type Target = Row;
    fn deref(&self) -> &Row {
        &self.row
    }
}

#[derive(Clone, Debug)]
pub struct Plan {
    pub board: Arc<Board>,
    pub rows: Vec<SelectedRow>,
    pub status: Status,
    pub race: bool,
    pub session_best: Option<(String, f64)>,
    pub identity: String,
    pub sequence: u64,
}
impl Plan {
    pub fn new(board: Arc<Board>, identity: String, sequence: u64) -> Self {
        let status = match (board.source_state, board.capability) {
            (SourceState::Waiting | SourceState::Lost, _) => Status::Disconnected,
            (SourceState::Stale, _) | (_, Capability::WithData) => Status::Stale,
            (_, Capability::Fresh) => Status::Ready,
            _ => Status::Disconnected,
        };
        let mut classes = std::collections::HashMap::new();
        let mut rows = Vec::new();
        if status != Status::Disconnected {
            for row in board.rows() {
                let position = row.position.parse().unwrap_or(0);
                let class_position = if position > 0 {
                    let next = classes.entry(row.class.trim().to_uppercase()).or_insert(0);
                    *next += 1;
                    *next
                } else {
                    0
                };
                // El índice identifica la única fila del Board; no se materializa otra.
                let &(g, r) = &board.row_index[&row.id];
                rows.push(SelectedRow {
                    row: board.groups[g].rows[r].clone(),
                    id: row.id.0.to_string(),
                    position,
                    class_position,
                });
            }
        }
        let session_best = rows
            .iter()
            .filter_map(|r| {
                Some((
                    r.id.clone(),
                    r.best_lap_s.filter(|s| s.is_finite() && *s > 0.0)?,
                ))
            })
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let content = &board.content;
        if content.player_window {
            let count = rows.len();
            let index = rows.iter().position(|r| r.is_player).unwrap_or(0);
            let fixed = count.min(3);
            let mut start = fixed.max(index.saturating_sub(content.window_around / 2));
            let end = (start + content.window_around + 1).min(count);
            start = fixed.max(end.saturating_sub(content.window_around + 1));
            rows = rows
                .into_iter()
                .enumerate()
                .filter_map(|(i, r)| {
                    (if index < fixed {
                        i < fixed + content.window_around
                    } else {
                        i < fixed || (start..end).contains(&i)
                    })
                    .then_some(r)
                })
                .collect();
        } else {
            rows.truncate(content.row_count);
        }
        if content.multiclass {
            let mut classes = Vec::new();
            for r in &rows {
                if !r.class.is_empty() && !classes.contains(&r.class) {
                    classes.push(r.class.clone());
                }
            }
            rows.sort_by_key(|r| {
                classes
                    .iter()
                    .position(|c| c == &r.class)
                    .unwrap_or(usize::MAX)
            });
            for r in &mut rows {
                r.position = r.row.class_position.map_or(r.position, i64::from);
            }
        }
        let race = board.key.kind.current() == Some(&crate::SessionKind::Race);
        Self {
            board,
            rows,
            status,
            race,
            session_best,
            identity,
            sequence,
        }
    }
    pub fn unavailable(status: Status) -> Self {
        let mut plan = Self::new(
            Arc::new(super::project(
                &crate::Snapshot::default(),
                crate::format::Preferences::default(),
            )),
            String::new(),
            0,
        );
        plan.status = status;
        plan
    }
    pub fn session_label(&self) -> &str {
        self.available(&self.board.session_label)
    }
    pub fn remaining_text(&self) -> &str {
        self.available(&self.board.clock)
    }
    pub fn active_class(&self) -> &str {
        self.available(&self.board.class_chip)
    }
    pub fn estimated_laps(&self) -> &str {
        self.available(&self.board.laps_remaining)
    }
    pub fn track(&self) -> &str {
        if self.board.content.legacy_track_visible {
            self.available(&self.board.track)
        } else {
            crate::format::PLACEHOLDER
        }
    }
    fn available<'a>(&self, value: &'a str) -> &'a str {
        if self.status == Status::Disconnected {
            crate::format::PLACEHOLDER
        } else {
            value
        }
    }
    pub fn last_lap<'a>(&self, row: &'a SelectedRow) -> &'a str {
        row.last_lap_column.as_deref().unwrap_or(&row.last_lap)
    }
    pub fn best_lap<'a>(&self, row: &'a SelectedRow) -> &'a str {
        row.best_lap_column.as_deref().unwrap_or(&row.best_lap)
    }
    pub fn current_lap<'a>(&self, row: &'a SelectedRow) -> &'a str {
        if self.board.content.lap_visible {
            &row.laps
        } else {
            crate::format::PLACEHOLDER
        }
    }
    pub fn interval<'a>(&self, row: &'a SelectedRow) -> &'a str {
        if self.board.content.interval_visible {
            &row.classification_interval
        } else {
            crate::format::PLACEHOLDER
        }
    }
    /// Compara solo contenido pintado: otra secuencia o una fila oculta no repinta.
    pub fn same_visible(&self, next: &Self) -> bool {
        self.status == next.status
            && self.identity == next.identity
            && self.race == next.race
            && self.session_best == next.session_best
            && self.session_label() == next.session_label()
            && self.remaining_text() == next.remaining_text()
            && self.active_class() == next.active_class()
            && self.board.flag == next.board.flag
            && self.track() == next.track()
            && self.estimated_laps() == next.estimated_laps()
            && self.board.gap_to_best_lap == next.board.gap_to_best_lap
            && (!self.board.content.footer_visible
                || self.board.footer_cells == next.board.footer_cells)
            && self.rows.len() == next.rows.len()
            && self.rows.iter().zip(&next.rows).all(|(a, b)| {
                a.id == b.id
                    && a.position == b.position
                    && a.class_position == b.class_position
                    && a.number == b.number
                    && a.driver == b.driver
                    && a.class == b.class
                    && a.classification_gap == b.classification_gap
                    && self.interval(a) == next.interval(b)
                    && self.current_lap(a) == next.current_lap(b)
                    && self.last_lap(a) == next.last_lap(b)
                    && self.best_lap(a) == next.best_lap(b)
                    && a.best_lap_s == b.best_lap_s
                    && a.battle_gap_seconds == b.battle_gap_seconds
                    && a.in_pits == b.in_pits
                    && a.is_player == b.is_player
            })
    }
}

impl SelectedRow {
    /// Fila ausente para escenas de movimiento y geometría sin telemetría.
    pub fn unavailable(id: String, position: i64) -> Self {
        let mut snapshot = crate::Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.cars.push(crate::Car::default());
        let board = super::project(&snapshot, crate::format::Preferences::default());
        Self {
            row: board.groups[0].rows[0].clone(),
            id,
            position,
            class_position: position,
        }
    }
}
