use super::*;
use crate::board_contracts::{STATES, cases, known};
use vantare_domain::{Quality, SourceState};

#[test]
fn real_board_contract_for_every_source_state_and_look() {
    let prefs = Preferences::default();
    for (name, original) in cases() {
        for state in STATES {
            let mut photo = original.clone();
            photo.state.source_state = state;
            for same_class in [false, true] {
                let mut common = None;
                for &look in crate::look::Look::ALL {
                    let settings = Settings {
                        design_system: look,
                        class_scope: if same_class { "sameClass" } else { "all" }.into(),
                        ..Settings::default()
                    };
                    let mut widget = Widget::new(&settings, prefs);
                    widget.ingest(&photo, prefs);
                    let board = &widget.board;
                    if let Some(previous) = &common {
                        assert_eq!(previous, board, "{name}/{state:?}/{look:?}: Board único");
                    }
                    common = Some(board.clone());
                    check_board(&photo, board, same_class);
                    let saved = board.clone();
                    for &next in crate::look::Look::ALL {
                        widget.set_look(next, prefs);
                        assert!(std::sync::Arc::ptr_eq(&saved, &widget.board));
                    }
                }
            }
        }
    }
}

fn check_board(photo: &Snapshot, board: &relative::Board, same_class: bool) {
    let live = photo.state.source_state == SourceState::Live;
    let player = photo.state.player_car();
    assert_eq!(board.source_state, photo.state.source_state);
    assert_eq!(board.player_present, live && player.is_some());
    let rows: Vec<_> = board.slots.iter().flatten().collect();
    if !live || player.is_none() {
        assert!(rows.is_empty());
        assert!(board.strip.is_empty());
        assert!(board.banner.is_none());
        return;
    }
    let player = player.unwrap();
    assert_eq!(rows.iter().filter(|r| r.is_player).count(), 1);
    assert!(
        rows.iter()
            .any(|r| r.is_player && r.id == player.id && r.side == Side::Player)
    );
    let mut offsets = Vec::new();
    for row in rows {
        let car = photo.state.cars.iter().find(|c| c.id == row.id).unwrap();
        assert_eq!(row.is_player, car.id == player.id);
        assert_eq!(
            row.class,
            car.class.as_ref().map_or("", |c| c.name.as_str())
        );
        if same_class {
            assert_eq!(car.class.as_ref(), player.class.as_ref());
        }
        // Relative conserva el dato histórico con su marca de calidad, nunca como fresco.
        assert_eq!(
            row.position_stale,
            matches!(car.position, Quality::Stale(_))
        );
        assert_eq!(
            row.best_lap_stale,
            matches!(car.best_lap_s, Quality::Stale(_))
        );
        assert_eq!(
            row.last_lap_stale,
            matches!(car.last_lap_s, Quality::Stale(_))
        );
        assert_eq!(row.gap_stale, matches!(car.relative_s, Quality::Stale(_)));
        let position = known(&car.position)
            .filter(|p| **p > 0)
            .map_or_else(|| "—".into(), u32::to_string);
        assert_eq!(row.position, position);
        assert_eq!(
            row.class_position,
            car.class_position
                .current()
                .map_or_else(|| "—".into(), |p| format!("P{p}"))
        );
        let offset = if row.is_player {
            0.0
        } else {
            -known(&car.relative_s).copied().expect("vecino con gap")
        };
        offsets.push(offset);
        assert!(match row.side {
            Side::Ahead => offset < 0.0,
            Side::Player => offset == 0.0,
            Side::Behind => offset > 0.0,
        });
    }
    // Orden espacial firmado, no posición de carrera: un doblado sigue siendo vecino.
    assert!(offsets.windows(2).all(|p| p[0] <= p[1]));
}
