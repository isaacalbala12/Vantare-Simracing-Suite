use super::*;
use crate::board_contracts::{STATES, cases};
use vantare_domain::{Quality, SourceState};

#[test]
fn real_board_contract_for_every_source_state_and_look() {
    let prefs = Preferences::default();
    for (name, original) in cases() {
        for state in STATES {
            let mut photo = original.clone();
            photo.state.source_state = state;
            for reference in ["best", "optimal", "leader"] {
                let mut common = None;
                for &look in crate::look::Look::ALL {
                    let mut widget = Widget::new(
                        &Settings {
                            design_system: look,
                            reference: reference.into(),
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
                    for &next in crate::look::Look::ALL {
                        widget.set_look(next, prefs);
                        assert!(Arc::ptr_eq(&saved, &widget.board));
                    }
                }
            }
        }
    }
}

fn check_board(photo: &Snapshot, board: &delta::Board) {
    let live = photo.state.source_state == SourceState::Live;
    let player = photo.state.player_car();
    let available = !matches!(
        photo.state.source_state,
        SourceState::Waiting | SourceState::Lost
    );
    let observed = player.filter(|_| available);
    assert_eq!(
        board.last_lap,
        observed.map_or(Quality::Unavailable, |c| c.last_lap_s)
    );
    assert_eq!(
        board.best_lap,
        observed.map_or(Quality::Unavailable, |c| c.best_lap_s)
    );
    let delta =
        photo
            .state
            .player
            .as_ref()
            .filter(|_| available)
            .map_or(Quality::Unavailable, |p| match board.reference {
                delta::Reference::PersonalBest => p.delta_best_s,
                delta::Reference::Optimal => p.delta_optimal_s,
                delta::Reference::Leader => p.delta_leader_s,
                delta::Reference::SessionBest | delta::Reference::PreviousLap => {
                    Quality::Unavailable
                }
            });
    assert_eq!(board.delta, delta, "la calidad del delta no se promociona");
    assert_eq!(board.source_state, photo.state.source_state);
    assert_eq!(
        board.identity,
        (
            photo.epoch,
            photo.state.session.id,
            photo.state.player.as_ref().map(|p| p.car)
        )
    );
    assert_eq!(board.player_present, live && player.is_some());
    let car = player.filter(|_| live);
    assert_eq!(
        board.best_lap_s,
        car.and_then(|c| c.best_lap_s.current().copied())
            .filter(|v| v.is_finite() && *v > 0.0)
    );
    assert_eq!(board.lap, car.and_then(|c| c.laps.current().map(|v| v + 1)));
    if !live {
        assert!(
            board.delta_s.is_none()
                && board.predicted_s.is_none()
                && board.reference_lap_s.is_none()
        );
        assert!(board.sectors.is_empty() && board.banner.is_none());
    }
    if matches!(board.delta, Quality::Stale(_)) {
        assert_ne!(board.status, delta::Status::Ready);
        assert!(board.delta_s.is_none());
    }
    if board.reference == delta::Reference::Leader {
        let leader = car.and_then(|me| {
            photo.state.cars.iter().find(|c| {
                c.class.as_ref().map(|v| v.id) == me.class.as_ref().map(|v| v.id)
                    && c.class_position.current() == Some(&1)
            })
        });
        assert_eq!(
            board.reference_lap_s,
            leader
                .and_then(|c| c.best_lap_s.current().copied())
                .filter(|v| v.is_finite() && *v > 0.0),
            "líder de la clase del jugador"
        );
    }
}
