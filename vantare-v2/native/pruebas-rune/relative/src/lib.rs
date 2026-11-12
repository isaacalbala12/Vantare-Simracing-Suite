//! Relative: the product projection owns all formatting and ordering.
use rune::{Color, Cx, El, LiveText, TextStyle, col, row, text};
use std::{cell::Cell, collections::BTreeMap, sync::Arc};
use vantare_domain::{
    CarId, Snapshot,
    format::Preferences,
    relative::{self, Board, Row},
};

pub const WIDTH: f32 = 420.0;
pub const ROW_HEIGHT: f32 = 28.0;

pub struct RowLive {
    pub id: CarId,
    pub cells: [LiveText; 4],
}
impl RowLive {
    fn new(row: &Row) -> Self {
        Self {
            id: row.id,
            cells: values(row).map(LiveText::new),
        }
    }
    fn update(&self, row: &Row) {
        for (cell, value) in self.cells.iter().zip(values(row)) {
            cell.set(value);
        }
    }
}
fn values(row: &Row) -> [String; 4] {
    [
        row.position.to_string(),
        row.number.clone(),
        row.driver.clone(),
        row.gap.to_string(),
    ]
}

pub struct Relative {
    pub board: Arc<Board>,
    pub slots: Vec<Option<Arc<RowLive>>>,
    pub views: Cell<usize>,
    prefs: Preferences,
    content: relative::Content,
}
impl Default for Relative {
    fn default() -> Self {
        Self::new(Preferences::default(), relative::Content::default())
    }
}
impl Relative {
    pub fn new(prefs: Preferences, content: relative::Content) -> Self {
        let board = relative::project_cached(&Snapshot::default(), prefs, content, &[], None);
        let slots = vec![None; board.slots.len()];
        Self {
            board,
            slots,
            views: Cell::new(0),
            prefs,
            content,
        }
    }
    /// True only when the keyed row structure changes; text uses LiveText.
    pub fn ingest(&mut self, snapshot: &Snapshot) -> bool {
        let board =
            relative::project_cached(snapshot, self.prefs, self.content, &[], Some(&self.board));
        if Arc::ptr_eq(&self.board, &board) {
            return false;
        }
        let old: BTreeMap<_, _> = self
            .slots
            .iter()
            .flatten()
            .map(|row| (row.id, row.clone()))
            .collect();
        let before: Vec<_> = self
            .slots
            .iter()
            .map(|row| row.as_ref().map(|r| r.id))
            .collect();
        self.slots = board
            .slots
            .iter()
            .map(|slot| {
                slot.as_ref().map(|row| {
                    let live = old
                        .get(&row.id)
                        .cloned()
                        .unwrap_or_else(|| Arc::new(RowLive::new(row)));
                    live.update(row);
                    live
                })
            })
            .collect();
        let after: Vec<_> = self
            .slots
            .iter()
            .map(|row| row.as_ref().map(|r| r.id))
            .collect();
        self.board = board;
        before != after
    }
}

/// Initial retained row tree; Vantare decoration is added by the presentation layer.
pub fn view(state: &Relative, _: &mut Cx<Relative>) -> El {
    state.views.set(state.views.get() + 1);
    col()
        .w(WIDTH)
        .children(state.slots.iter().enumerate().map(|(index, slot)| {
            let Some(slot) = slot else {
                return row().key(format!("empty-{index}")).w(WIDTH).h(ROW_HEIGHT);
            };
            row()
                .key(format!("car-{}", slot.id.0))
                .w(WIDTH)
                .h(ROW_HEIGHT)
                .children(
                    slot.cells
                        .iter()
                        .zip([30.0, 38.0, 266.0, 86.0])
                        .enumerate()
                        .map(|(index, (cell, width))| {
                            text(cell.get().to_string())
                                .key(format!("cell-{}-{index}", slot.id.0))
                                .live_text(cell)
                                .w(width)
                                .h(ROW_HEIGHT)
                                .color(Color::WHITE)
                                .font(TextStyle {
                                    features: "'tnum' 1",
                                    ..TextStyle::new(12.0, 500.0)
                                })
                        }),
                )
        }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rune::{Env, Runtime};
    use vantare_domain::{Car, Driver, Player, Quality, SourceState};
    fn scene() -> Snapshot {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = SourceState::Live;
        snapshot.state.player = Some(Player {
            car: CarId(1),
            ..Player::default()
        });
        snapshot.state.cars = [(1, 0.0), (2, 1.2), (3, 2.4), (4, -1.0)]
            .into_iter()
            .map(|(id, gap)| Car {
                id: CarId(id),
                number: format!("{id:02}"),
                driver: Driver {
                    name: format!("Piloto {id}"),
                    ..Driver::default()
                },
                position: Quality::Reliable(id),
                relative_s: Quality::Reliable(gap),
                ..Car::default()
            })
            .collect();
        snapshot
    }
    fn runtime(snapshot: &Snapshot) -> Runtime<Relative> {
        let mut state = Relative::default();
        state.ingest(snapshot);
        let mut runtime = Runtime::new(state, view, (WIDTH, 300.0), Env::new(true, 1.0));
        runtime.frame(0.0);
        runtime
    }
    #[test]
    fn runtime_has_exact_projected_rows_and_texts() {
        let snapshot = scene();
        let runtime = runtime(&snapshot);
        let projected = relative::project(&snapshot, Preferences::default());
        assert_eq!(
            runtime.state.slots.iter().flatten().count(),
            projected.slots.iter().flatten().count()
        );
        for row in projected.slots.iter().flatten() {
            assert!(runtime.find(&format!("car-{}", row.id.0)).is_some());
            let live = runtime
                .state
                .slots
                .iter()
                .flatten()
                .find(|r| r.id == row.id)
                .unwrap();
            assert_eq!(
                live.cells.each_ref().map(|v| v.get().to_string()),
                values(row)
            );
        }
    }
    #[test]
    fn gap_update_does_not_execute_view_again() {
        let mut snapshot = scene();
        let mut runtime = runtime(&snapshot);
        let views = runtime.state.views.get();
        snapshot.state.cars[1].relative_s = Quality::Reliable(1.3);
        assert!(!runtime.update_if(|s, _| s.ingest(&snapshot)));
        runtime.frame(1.0 / 60.0);
        assert_eq!(runtime.state.views.get(), views);
        let projected = relative::project(&snapshot, Preferences::default());
        let row = projected
            .slots
            .iter()
            .flatten()
            .find(|r| r.id == CarId(2))
            .unwrap();
        let live = runtime
            .state
            .slots
            .iter()
            .flatten()
            .find(|r| r.id == row.id)
            .unwrap();
        assert_eq!(&*live.cells[3].get(), row.gap.as_ref());
    }
    #[test]
    fn reorder_preserves_bindings_for_each_car() {
        let mut snapshot = scene();
        let mut runtime = runtime(&snapshot);
        let old: BTreeMap<_, _> = runtime
            .state
            .slots
            .iter()
            .flatten()
            .map(|r| (r.id, r.clone()))
            .collect();
        snapshot.state.cars[1].relative_s = Quality::Reliable(3.0);
        assert!(runtime.update_if(|s, _| s.ingest(&snapshot)));
        runtime.frame(1.0 / 60.0);
        for live in runtime.state.slots.iter().flatten() {
            assert!(Arc::ptr_eq(&old[&live.id], live));
            assert!(runtime.find(&format!("car-{}", live.id.0)).is_some());
        }
    }
}
