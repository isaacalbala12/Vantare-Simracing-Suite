use super::*;
use crate::board_contracts::{STATES, cases};
use vantare_domain::{Quality, SourceState};

#[test]
fn extreme_dto_counters_and_sector_project_safely_for_every_look() {
    let mut dto: serde_json::Value = serde_json::from_str(include_str!(
        "../../fixtures/telemetry-real/lmu47.snapshot.json"
    ))
    .unwrap();
    let player_id = dto["state"]["player"]["car"].clone();
    let car = dto["state"]["cars"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|c| c["id"] == player_id)
        .unwrap();
    car["laps"] = serde_json::json!({"reliable": u32::MAX});
    car["pit_stops"] = serde_json::json!({"reliable": u32::MAX});
    // El coche real está en boxes: aislar la bandera de sector de ese aviso prioritario.
    car["in_pits"] = serde_json::json!({"reliable": false});
    dto["state"]["flags"] =
        serde_json::json!({"reliable": [{"kind": "yellow", "scope": {"sector": 255}}]});
    let photo = vantare_ipc::snapshot_from_json(&dto.to_string()).unwrap();
    let prefs = Preferences::default();
    let mut common = None;
    for &look in crate::look::Look::ALL {
        let mut widget = Widget::new(
            &Settings {
                design_system: look,
                ..Settings::default()
            },
            prefs,
        );
        widget.ingest(&photo, prefs);
        assert!(widget.board.lap.is_none());
        assert!(widget.board.stint.number.is_none());
        assert!(widget.board.banner.is_none());
        if let Some(previous) = &common {
            assert_eq!(previous, &widget.board);
        }
        common = Some(widget.board.clone());
    }
}

#[test]
fn real_board_contract_for_every_source_state_and_look() {
    let prefs = Preferences::default();
    for (name, original) in cases() {
        for state in STATES {
            let mut photo = original.clone();
            photo.state.source_state = state;
            for source in ["fuel", "virtual-energy"] {
                let mut common = None;
                for &look in crate::look::Look::ALL {
                    let mut widget = Widget::new(
                        &Settings {
                            design_system: look,
                            source: source.into(),
                            ..Settings::default()
                        },
                        prefs,
                    );
                    widget.ingest(&photo, prefs);
                    let board = &widget.board;
                    if let Some(previous) = &common {
                        assert_eq!(previous, board, "{name}/{state:?}/{look:?}: Board único");
                    }
                    common = Some(board.clone());
                    check_board(&photo, board);
                    let saved = board.clone();
                    let history = board.history.as_ptr();
                    for &next in crate::look::Look::ALL {
                        widget.set_look(next, prefs);
                        assert!(Arc::ptr_eq(&saved, &widget.board));
                        assert_eq!(history, widget.board.history.as_ptr());
                    }
                }
            }
        }
    }
}

fn check_board(photo: &Snapshot, board: &fuel_strategy::Board) {
    let live = photo.state.source_state == SourceState::Live;
    let car = photo.state.player_car().filter(|_| live);
    let player = photo.state.player.as_ref().filter(|_| car.is_some());
    let raw = photo.state.player.as_ref().map(|p| &p.fuel);
    assert_eq!(
        board.raw_level,
        raw.map_or(Quality::Unavailable, |f| f.level_l)
    );
    assert_eq!(
        board.raw_capacity,
        raw.map_or(Quality::Unavailable, |f| f.capacity_l)
    );
    assert_eq!(
        board.raw_per_lap,
        raw.map_or(Quality::Unavailable, |f| f.per_lap_l)
    );
    assert_eq!(
        board.raw_laps,
        raw.map_or(Quality::Unavailable, |f| f.laps_left)
    );
    assert_eq!(board.source_state, photo.state.source_state);
    assert_eq!(
        board.identity,
        (
            photo.epoch,
            photo.state.session.id,
            photo.state.player.as_ref().map(|p| p.car)
        )
    );
    assert_eq!(board.player_present, car.is_some());
    let class = car
        .and_then(|c| c.class.as_ref())
        .map_or("", |c| c.name.as_str());
    assert_eq!(board.class, class);
    assert_eq!(
        board.fuel.level,
        player
            .and_then(|p| p.fuel.level_l.current().copied())
            .filter(|v| v.is_finite() && *v >= 0.0)
    );
    assert_eq!(
        board.stint.laps,
        player.and_then(|p| p.stint.laps.current().copied())
    );
    if !live {
        assert_eq!(board.fuel, fuel_strategy::Tank::default());
        assert_eq!(board.stint, fuel_strategy::Stint::default());
        assert!(board.energy.is_none() && board.banner.is_none() && board.lap.is_none());
    }
    if matches!(board.raw_level, Quality::Stale(_)) {
        assert!(board.fuel.level.is_none());
        assert_eq!(
            fuel_strategy::labels(board, Preferences::default()).fuel,
            "—"
        );
    }
    if matches!(board.raw_per_lap, Quality::Stale(_)) {
        assert!(board.fuel.per_lap.is_none());
        assert_eq!(
            fuel_strategy::labels(board, Preferences::default()).average,
            "—"
        );
    }
}
