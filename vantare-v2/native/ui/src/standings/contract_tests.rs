use super::*;
use crate::board_contracts::{STATES, cases, known, photos};
use vantare_domain::{Quality, SourceState};

#[test]
fn real_stale_classification_keeps_last_known_order_without_current_positions() {
    let (_, photo) = photos()
        .into_iter()
        .find(|(name, _)| *name == "stale")
        .unwrap();
    let board = standings::project(&photo, Preferences::default());
    let ids: Vec<_> = board.rows().iter().map(|row| row.id.0).collect();
    // Orden de las posiciones conservadas en la foto, no el de los slots 1,2,3…
    assert_eq!(
        ids,
        [
            12, 7, 19, 13, 23, 35, 16, 25, 44, 30, 31, 37, 39, 3, 43, 33, 38, 9, 5, 18, 36, 29, 1,
            34, 15, 17, 40, 28, 2, 32, 27, 20, 42, 14, 41, 26, 4, 11, 24, 22, 6, 21, 8, 10
        ]
    );
    assert!(
        board
            .rows()
            .iter()
            .all(|r| r.position == "—" && r.class_position.is_none())
    );
    // La clasificación agrupada de Vantare también conserva ese orden.
    for group in &board.groups {
        let positions: Vec<_> = group
            .rows
            .iter()
            .map(|row| {
                known(
                    &photo
                        .state
                        .cars
                        .iter()
                        .find(|c| c.id == row.id)
                        .unwrap()
                        .position,
                )
                .copied()
                .unwrap()
            })
            .collect();
        assert!(positions.windows(2).all(|p| p[0] < p[1]));
    }
}

#[test]
fn real_board_contract_for_every_source_state_and_look() {
    let prefs = Preferences::default();
    for (name, original) in cases() {
        for state in STATES {
            let mut photo = original.clone();
            photo.state.source_state = state;
            for player_class in [false, true] {
                let mut common = None;
                for &look in crate::look::Look::ALL {
                    let settings = Settings {
                        design_system: look,
                        class_scope: if player_class {
                            "player-class"
                        } else {
                            "all-classes"
                        }
                        .into(),
                        ..Settings::default()
                    };
                    let mut widget = Widget::new(&settings, prefs);
                    widget.ingest(&photo, prefs);
                    let board = widget.board.as_ref().expect("Board después de ingest");
                    if let Some(previous) = &common {
                        assert_eq!(previous, board, "{name}/{state:?}/{look:?}: Board único");
                    }
                    common = Some(board.clone());
                    check_board(&photo, board);
                    let saved = board.clone();
                    for &next in crate::look::Look::ALL {
                        widget.set_look(next, prefs);
                        assert!(std::sync::Arc::ptr_eq(
                            &saved,
                            widget.board.as_ref().unwrap()
                        ));
                    }
                }
            }
        }
    }
}

#[test]
fn real_live_to_stale_cache_keeps_order_and_invalidates_quality() {
    let (_, mut photo) = photos()
        .into_iter()
        .find(|(name, _)| *name == "lmu47")
        .unwrap();
    let prefs = Preferences::default();
    let content = standings::Content::default();
    let live = standings::project_cached(&photo, prefs, &content, None);
    vantare_domain::degrade(&mut photo.state);
    photo.state.source_state = SourceState::Stale;
    // Una copia Lost/Stale puede conservar epoch/sequence: no son clave de frescura.
    let stale = standings::project_cached(&photo, prefs, &content, Some(&live));
    assert!(!std::sync::Arc::ptr_eq(&live, &stale));
    assert_eq!(
        live.rows().iter().map(|r| r.id).collect::<Vec<_>>(),
        stale.rows().iter().map(|r| r.id).collect::<Vec<_>>()
    );
    assert!(stale.rows().iter().all(|r| r.position == "—"));
    let repeated = standings::project_cached(&photo, prefs, &content, Some(&stale));
    assert!(std::sync::Arc::ptr_eq(&stale, &repeated));
}

fn check_board(photo: &vantare_domain::Snapshot, board: &standings::Board) {
    let available = !matches!(
        photo.state.source_state,
        SourceState::Waiting | SourceState::Lost
    );
    let player = photo.state.player_car();
    assert_eq!(board.source_state, photo.state.source_state);
    assert_eq!(board.player_present, available && player.is_some());
    if matches!(photo.state.session.remaining_s, Quality::Stale(_)) {
        assert_eq!(board.clock, "—");
        assert_eq!(board.remaining, "—");
    }
    assert_eq!(
        board.player_class,
        player
            .or_else(|| photo.state.cars.first())
            .and_then(|c| c.class.as_ref())
            .map(|c| c.id)
    );
    let mut expected: Vec<_> = photo
        .state
        .cars
        .iter()
        .filter(|car| {
            available
                && (!board.content.player_class
                    || car
                        .class
                        .as_ref()
                        .is_none_or(|c| Some(c.id) == board.player_class))
        })
        .collect();
    expected.sort_by_key(|car| known(&car.position).copied().unwrap_or(u32::MAX));
    let rows = board.rows();
    assert_eq!(
        rows.iter().map(|r| r.id).collect::<Vec<_>>(),
        expected.iter().map(|c| c.id).collect::<Vec<_>>()
    );
    for (row, car) in rows.iter().zip(expected) {
        assert_eq!(row.is_player, player.is_some_and(|p| p.id == car.id));
        assert_eq!(row.class_id, car.class.as_ref().map(|c| c.id));
        assert_eq!(
            row.class.as_ref(),
            car.class.as_ref().map_or("", |c| c.name.as_str())
        );
        assert_eq!(
            row.position,
            car.position
                .current()
                .map_or_else(|| "—".into(), u32::to_string)
        );
        assert_eq!(row.class_position, car.class_position.current().copied());
        assert_eq!(row.last_lap_s, car.last_lap_s.current().copied());
        assert_eq!(row.best_lap_s, car.best_lap_s.current().copied());
        if matches!(car.laps, Quality::Stale(_)) {
            assert_eq!(row.laps, "—");
        }
        if matches!(car.in_pits, Quality::Stale(_)) {
            assert!(!row.in_pits);
        }
        if matches!(car.best_lap_s, Quality::Stale(_)) {
            assert_eq!(row.best_lap, "—");
        }
        if matches!(car.last_lap_s, Quality::Stale(_)) {
            assert_eq!(row.last_lap, "—");
        }
    }
}
