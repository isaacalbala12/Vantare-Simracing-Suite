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
    let session = &photo.state.session;
    assert_eq!(
        board.header_stale,
        relative::HeaderStale {
            track: matches!(session.track_name, Quality::Stale(_)),
            player_badge: player.is_some_and(|p| matches!(p.position, Quality::Stale(_))),
            session: matches!(session.kind, Quality::Stale(_)),
            remaining: matches!(session.remaining_s, Quality::Stale(_)),
            air: matches!(session.weather.air_temperature_k, Quality::Stale(_)),
            track_temperature: matches!(session.weather.track_temperature_k, Quality::Stale(_)),
            wind: matches!(session.weather.wind_speed_mps, Quality::Stale(_)),
        }
    );
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

#[test]
fn header_quality_changes_without_text_changes_invalidate_and_survive_look_switch() {
    fn stale<T: Clone>(field: &mut Quality<T>) {
        *field = Quality::Stale(field.current().expect("campo fresco del corpus").clone());
    }
    let prefs = Preferences::default();
    let original =
        vantare_ipc::snapshot_from_json(include_str!("../../fixtures/relative.snapshot.json"))
            .unwrap();
    for field in 0..7 {
        let mut photo = original.clone();
        let settings = Settings::eficiencia();
        let mut widget = Widget::new(&settings, prefs);
        widget.ingest(&photo, prefs);
        let before = widget.board.clone();
        match field {
            0 => stale(&mut photo.state.session.track_name),
            1 => {
                let id = photo.state.player.as_ref().unwrap().car;
                stale(
                    &mut photo
                        .state
                        .cars
                        .iter_mut()
                        .find(|c| c.id == id)
                        .unwrap()
                        .position,
                );
            }
            2 => stale(&mut photo.state.session.kind),
            3 => stale(&mut photo.state.session.remaining_s),
            4 => stale(&mut photo.state.session.weather.air_temperature_k),
            5 => stale(&mut photo.state.session.weather.track_temperature_k),
            _ => stale(&mut photo.state.session.weather.wind_speed_mps),
        }
        assert!(
            widget.ingest(&photo, prefs),
            "campo {field}: repintar cambio de calidad"
        );
        let after = widget.board.clone();
        assert!(!std::sync::Arc::ptr_eq(&before, &after));
        assert_eq!(
            (
                &before.track,
                &before.player_badge,
                &before.session,
                &before.remaining,
                &before.air,
                &before.track_temperature,
                &before.wind
            ),
            (
                &after.track,
                &after.player_badge,
                &after.session,
                &after.remaining,
                &after.air,
                &after.track_temperature,
                &after.wind
            )
        );
        let flags = after.header_stale;
        assert_eq!(
            [
                flags.track,
                flags.player_badge,
                flags.session,
                flags.remaining,
                flags.air,
                flags.track_temperature,
                flags.wind
            ],
            std::array::from_fn::<_, 7, _>(|i| i == field)
        );
        for &look in crate::look::Look::ALL {
            widget.set_look(look, prefs);
            assert!(std::sync::Arc::ptr_eq(&after, &widget.board));
        }
        assert!(!widget.ingest(&photo, prefs));
    }
}
