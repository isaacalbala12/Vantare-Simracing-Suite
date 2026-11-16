use super::*;
use crate::relative::PAUSE_HEIGHT;
use crate::relative::scene::{Alert, AlertKind, Motion, Scene as Visual, Timing};
use rune::{Cx, Env, Runtime};
use std::sync::Arc;
use vantare_domain::{
    CarId, Snapshot,
    format::{Language, Preferences},
    relative::{Board, Row, Side},
    widget_settings::columns::{ColumnSetting, Format},
};

/// Foto del Board con la misma forma que el fixture de GPUI, sin otro simulador.
fn board(ahead: usize, behind: usize) -> Board {
    let mut board = vantare_domain::relative::project(&Snapshot::default(), Preferences::default());
    board.track = "SPA-FRANCORCHAMPS".into();
    board.player_badge = "P4".into();
    board.status = None;
    board.player_present = true;
    board.source_state = vantare_domain::SourceState::Live;
    board.session.clear();
    board.remaining.clear();
    board.air.clear();
    board.track_temperature.clear();
    board.wind.clear();
    board.slots = (0..ahead + behind + 1)
        .map(|slot| {
            let side = match slot.cmp(&ahead) {
                std::cmp::Ordering::Less => Side::Ahead,
                std::cmp::Ordering::Equal => Side::Player,
                std::cmp::Ordering::Greater => Side::Behind,
            };
            let mut row = Row::default();
            row.id = CarId(slot as u32);
            row.side = side;
            row.position = "12".into();
            row.number = "99".into();
            row.driver = "André Lotterer".into();
            row.class = "Hypercar".into();
            row.gap = "+1.20".into();
            row.best_lap = "2:01.456".into();
            row.last_lap = "2:02.789".into();
            row.lap_delta = Some(-2);
            Some(Arc::new(row))
        })
        .collect();
    board
}

struct Input {
    board: Board,
    settings: Settings,
    language: Language,
}
fn input(settings: Settings) -> Input {
    let board = board(settings.range_ahead, settings.range_behind);
    Input {
        board,
        settings,
        language: Language::Es,
    }
}
fn draw(input: &Input, _: &mut Cx<Input>) -> El {
    view(&input.board, &input.settings, input.language)
}
fn runtime(input: Input, scale: f32) -> Runtime<Input> {
    let size = natural_size(&input.settings);
    let mut rt = Runtime::with_text(
        input,
        draw,
        size,
        Env::new(true, scale),
        rune::text::TextSystem::new(kit::FONTS, ("Inter W400", "Inter W400")),
    );
    rt.transparent = true;
    rt.frame(0.0);
    rt.settle_all();
    rt.frame(0.0);
    rt
}
fn col(metric: &str) -> ColumnSetting {
    ColumnSetting {
        metric_id: metric.into(),
        ..ColumnSetting::default()
    }
}
fn timing() -> Timing {
    Timing {
        reorder: 0.28,
        fade: 0.12,
        flash: 0.48,
        pulse: 1.2,
        kinetics: crate::relative::scene::Kinetics::Eficiencia,
    }
}
/// Vista asentada: las coordenadas del layout y una fila por slot ocupado.
fn visual(board: Arc<Board>, settings: &Settings, paused: bool) -> Visual {
    let rows = board
        .slots
        .iter()
        .zip(targets(&board, settings))
        .filter_map(|(row, slot)| {
            row.as_ref().map(|row| VisualRow {
                row: row.clone(),
                slot,
                opacity: 1.0,
                alert: None,
                traffic_opacity: 0.0,
            })
        })
        .collect();
    Visual {
        board,
        rows,
        strip: Vec::new(),
        paused,
    }
}

#[test]
fn long_track_and_driver_names_elide_once_with_the_loaded_font_metrics() {
    let long = "INTERNATIONAL MOTORSPORT DRIVER NAME "
        .repeat(12)
        .trim_end()
        .to_owned();
    for scale in [1.0] {
        let mut state = input(Settings::eficiencia());
        state.board.track = long.clone();
        Arc::make_mut(state.board.slots[0].as_mut().expect("driver")).driver = long.clone();
        let mut rt = runtime(state, scale);
        rt.set_font_smoothing(rune::text::FontSmoothing::Off);
        rt.frame(0.0);
        let elements = rt.elements();
        for key in ["track-name", "car-0-cell-2"] {
            let painted = elements
                .iter()
                .find(|e| e.key.as_deref() == Some(key))
                .expect("text")
                .text
                .clone()
                .expect("texto pintado");
            assert!(long.starts_with(painted.trim_end_matches('…')), "{key}");
            assert_eq!(painted.matches('…').count(), 1, "{key}: una sola elipsis");
        }
    }
}

#[test]
fn shared_scene_paints_coordinates_alert_strength_and_the_pause_band() {
    let state = input(Settings::eficiencia());
    let board = Arc::new(state.board.clone());
    let scene = Visual {
        rows: vec![VisualRow {
            row: board.slots[0].as_ref().expect("driver").clone(),
            slot: 71.25,
            opacity: 0.25,
            alert: Some(Alert {
                kind: AlertKind::Gain,
                opacity: 0.5,
            }),
            traffic_opacity: 0.75,
        }],
        board,
        strip: Vec::new(),
        paused: true,
    };
    for scale in [1.0, 1.25, 1.5] {
        let size = natural_size(&state.settings);
        let mut rt = Runtime::with_text(
            (scene.clone(), state.settings.clone()),
            |(scene, settings): &(Visual, Settings), _| view_scene(scene, settings, Language::Es),
            (size.0, size.1 + 22.0),
            Env::new(true, scale),
            rune::text::TextSystem::new(kit::FONTS, ("Inter W400", "Inter W400")),
        );
        rt.frame(0.0);
        rt.settle_all();
        rt.frame(0.0);
        assert_eq!(rt.presented("car-0").expect("driver row").0[1], 71.25);
        assert_eq!(
            rt.presented("pause-band").expect("pause band").0,
            [0.0, size.1, size.0, 22.0]
        );
        assert!(
            rt.elements()
                .iter()
                .any(|e| e.fill == color(0x7fb686, 0.02)),
            "la fuerza del aviso se muestrea aparte de la opacidad de la fila"
        );
        assert_eq!(rt.state.0, scene, "the Look never advances motion");
        for _ in 0..30 {
            assert!(!rt.frame(1.0));
        }
    }
}

#[test]
fn legacy_text_class_quality_and_translated_lap_badge_use_canonical_values() {
    let mut state = input(Settings::eficiencia());
    Arc::make_mut(state.board.slots[0].as_mut().unwrap()).gap_stale = true;
    let rt = runtime(state, 1.0);
    let elements = rt.elements();
    let cell = |key: &str| {
        elements
            .iter()
            .find(|e| e.key.as_deref() == Some(key))
            .unwrap()
    };
    assert_eq!(cell("car-0-cell-2").text.as_deref(), Some("ANDRÉ LOTTERER"));
    assert_eq!(cell("car-0-cell-3").text.as_deref(), Some("+1.20"));
    assert_eq!(cell("car-0-cell-4").text.as_deref(), Some("2:01.456"));
    assert_eq!(cell("car-0-lap-delta").text.as_deref(), Some("−2 V"));
    assert!((cell("car-0-cell-3").text_color.unwrap().a - 0.6).abs() < 0.001);
    assert!(
        rt.presented("car-3-lap-delta").is_none(),
        "el jugador no lleva badge de vuelta"
    );
    assert!(
        elements
            .iter()
            .any(|e| e.fill == color(class_color("Hypercar"), 1.0) && e.rect[2] == 3.0),
        "la clase se compara en mayúsculas"
    );
    let mut english = input(Settings::eficiencia());
    english.language = Language::En;
    assert!(
        runtime(english, 1.0)
            .elements()
            .iter()
            .any(|e| e.text.as_deref() == Some("−2 L"))
    );
}

#[test]
fn configured_columns_filter_disabled_unknown_and_format_names_and_last_lap() {
    let settings = Settings {
        columns: Some(vec![
            ColumnSetting {
                format: Format {
                    mode: "initial".into(),
                    ..Format::default()
                },
                ..col("driverName")
            },
            col("lastLap"),
            ColumnSetting {
                enabled: false,
                ..col("gap")
            },
            col("future"),
        ]),
        ..Settings::eficiencia()
    };
    let cols = columns(settings.columns.as_ref().unwrap());
    assert_eq!(cols.len(), 2);
    assert!((cols.iter().map(|c| c.w).sum::<f32>() - WIDTH).abs() < 0.001);
    let rt = runtime(input(settings), 1.0);
    let cells = rt.elements();
    assert!(
        cells
            .iter()
            .any(|e| e.text.as_deref() == Some("A. LOTTERER"))
    );
    assert!(cells.iter().any(|e| e.text.as_deref() == Some("2:02.789")));
    assert!(!cells.iter().any(|e| e.text.as_deref() == Some("+1.20")));
}

#[test]
fn original_gpui_snapshot_uses_domain_projection_and_the_same_capture_view() {
    let snapshot = vantare_ipc::snapshot_from_saved_json(include_str!(
        "../../../ui/fixtures/relative.snapshot.json"
    ))
    .expect("fixture guardado del Relative GPUI");
    for (ahead, behind, same_class) in [(3, 3, false), (3, 3, true)] {
        let settings = Settings {
            range_ahead: ahead,
            range_behind: behind,
            class_scope: if same_class { "sameClass" } else { "all" }.into(),
            ..Settings::eficiencia()
        };
        let board = vantare_domain::relative::project_cached(
            &snapshot,
            Preferences::default(),
            vantare_domain::relative::Content {
                range_ahead: ahead,
                range_behind: behind,
                same_class,
                include_player: true,
            },
            &[],
            None,
        );
        assert!(board.status.is_none());
        assert_eq!(board.track, "SEBRING", "el rótulo lo normaliza domain");
        assert!(board.slots.iter().flatten().any(|r| r.side == Side::Player));
        {
            let scale = 1.0;
            let rt = runtime(
                Input {
                    board: (*board).clone(),
                    settings: settings.clone(),
                    language: Language::Es,
                },
                scale,
            );
            let elements = rt.elements();
            assert!(
                elements
                    .iter()
                    .any(|e| e.text.as_deref() == Some("SEBRING"))
            );
            assert!(
                elements
                    .iter()
                    .any(|e| e.key.as_deref() == Some("player-badge"))
            );
            assert!(
                elements
                    .iter()
                    .any(|e| e.key.as_deref() == Some("relative-eficiencia"))
            );
        }
    }
}

#[test]
fn constants_and_fonts_are_the_gpui_ones() {
    let _fonts = rune::text::with_families("Inter W400", "Inter W400");
    assert_eq!((WIDTH, BAND, FOOTER, ROW), (470.0, 36.0, 38.0, 29.0));
    assert_eq!(PAUSE_HEIGHT, 22.0, "banda del anfitrión de GPUI");
    assert_eq!(natural_size(&Settings::eficiencia()), (470.0, 277.0));
    let legacy = legacy_columns();
    assert_eq!(
        legacy.iter().map(|c| c.metric.as_str()).collect::<Vec<_>>(),
        ["position", "carNumber", "driverName", "gap", "bestLap"]
    );
    assert_eq!(
        legacy.iter().map(|c| (c.x, c.w)).collect::<Vec<_>>(),
        [
            (0.0, 30.0),
            (38.0, 30.0),
            (68.0, 232.0),
            (300.0, 64.0),
            (364.0, 106.0)
        ]
    );
    assert_eq!(
        legacy.iter().map(|c| c.font.size).collect::<Vec<_>>(),
        [13.0, 11.0, 14.0, 16.0, 13.0]
    );
    assert!((legacy[2].font.tracking - (-0.025 * 14.0)).abs() < 1e-6);
    for (class, rgb) in [
        ("hypercar", 0xc1121f),
        ("LMP2", 0x0055a4),
        ("lmp3", 0xf59e0b),
        ("LMGT3", 0x2ecc71),
        ("desconocida", 0x6b7280),
    ] {
        assert_eq!(class_color(class), rgb, "{class}");
    }
}

#[test]
fn one_visible_change_repaints_and_the_shared_flip_leaves_no_clock() {
    let settings = Settings::eficiencia();
    let board = Arc::new(board(3, 3));
    let still = visual(board.clone(), &settings, false);
    let mut painter = Painter::new(&settings, Preferences::default(), &still);
    assert!(
        !painter.sync(&still).build,
        "la escena retenida no recompone"
    );
    let mut moved = still.clone();
    moved.rows[0].slot += ROW;
    assert!(painter.sync(&moved).build, "una fila distinta recompone");
    assert!(!painter.sync(&moved).build, "y solo una vez");
    let mut same_board = moved.clone();
    same_board.board = board.clone();
    assert_eq!(
        same_board, moved,
        "la foto y su contador no forman parte de la estructura"
    );

    let positions = targets(&board, &settings);
    let mut order = positions.clone();
    order.swap(0, 1);
    let mut motion = Motion::new(timing(), false, 5, 0.0);
    motion.update(&board, &positions, true, 0.0);
    assert_eq!(motion.next_wake(0.0, false), None, "asentado sin reloj");
    motion.update(&board, &order, false, 1.0);
    assert!(
        motion.next_wake(1.0, false).is_some(),
        "mientras dura la reordenación hay reloj"
    );
    motion.advance(&board, 2.0);
    assert_eq!(
        motion.next_wake(2.0, false),
        None,
        "cero despertares al acabar"
    );
    assert!(
        crate::relative::scene::visual_rows(&motion, 2.0)
            .iter()
            .all(|row| row.opacity == 1.0)
    );
    let mut reduced = Motion::new(timing(), true, 5, 0.0);
    reduced.update(&board, &positions, true, 0.0);
    reduced.update(&board, &order, false, 1.0);
    assert_eq!(
        reduced.next_wake(1.0, false),
        None,
        "movimiento reducido sin reloj"
    );
    assert!(
        crate::relative::scene::visual_rows(&reduced, 1.0)
            .iter()
            .all(|row| row.opacity == 1.0)
    );
}

/// Literales de GPUI: tick de clase, badge, línea base y posición centrada.
#[test]
fn gpui_literals_place_ticks_badges_baselines_and_the_centered_position() {
    let state = input(Settings::eficiencia());
    let row_height = 29.0;
    let two_ch = width("00", font(13.0, 600, 0.0));
    let rt = runtime(state, 1.0);
    let elements = rt.elements();
    let row_y = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("car-0"))
        .expect("fila")
        .rect[1];
    let tick = elements
        .iter()
        .find(|e| e.rect[2] == 3.0 && e.rect[3] == 14.0)
        .expect("tick de clase");
    assert!(
        (tick.rect[0] - ((30.0 - two_ch - 7.0) / 2.0 + two_ch + 4.0)).abs() < 0.01,
        "x del tick legado: {}",
        tick.rect[0]
    );
    assert!((tick.rect[1] - row_y - (row_height - 14.0) / 2.0).abs() < 0.01);
    assert_eq!(tick.fill, color(class_color("Hypercar"), 1.0));
    let badge = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("car-0-lap-delta"))
        .expect("badge de vuelta");
    let badge_ascent = (8.0_f32 * 1984.0 / 2048.0).round();
    assert!(
        (badge.rect[1] - row_y - (17.0 - badge_ascent)).abs() < 0.01,
        "legado y+17"
    );
    let position = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("car-0-cell-0"))
        .expect("posición");
    let position_width = width("12", font(13.0, 600, -0.02));
    assert!(
        (position.rect[0] - ((30.0 - two_ch - 7.0) / 2.0 + (two_ch - position_width) / 2.0)).abs()
            < 0.01,
        "posición centrada en su hueco: {}",
        position.rect[0]
    );
    let gap = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("car-0-cell-4"))
        .expect("vuelta");
    let ascent = (13.0_f32 * 1984.0 / 2048.0).round();
    assert!((gap.rect[1] - row_y - (baseline(0.0, row_height, 13.0) - ascent)).abs() < 0.01);

    let configured = Settings {
        columns: Some(vec![col("position"), col("class"), col("driverName")]),
        ..Settings::eficiencia()
    };
    let mut state = input(configured.clone());
    Arc::make_mut(state.board.slots[0].as_mut().unwrap()).position_stale = true;
    let lines = columns(configured.columns.as_ref().unwrap());
    let rt = runtime(state, 1.0);
    let elements = rt.elements();
    let tick = elements
        .iter()
        .find(|e| e.rect[2] == 3.0 && e.rect[3] == 14.0)
        .expect("tick configurado");
    let position = lines.iter().find(|c| c.metric == "position").unwrap();
    assert!(
        (tick.rect[0] - (position.x + position.w - 4.0)).abs() < 0.01,
        "x del tick configurado"
    );
    assert_eq!(
        tick.fill,
        color(class_color("Hypercar"), 1.0),
        "configurado: alfa 1 aunque la posición sea stale"
    );
    let row_y = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("car-0"))
        .expect("fila")
        .rect[1];
    let badge = elements
        .iter()
        .find(|e| e.key.as_deref() == Some("car-0-lap-delta"))
        .expect("badge configurado");
    let by = (row_height - 14.0) / 2.0;
    assert!(
        (badge.rect[1] - row_y - (by + 10.0 - badge_ascent)).abs() < 0.01,
        "configurado by+10"
    );
}

#[test]
fn the_legacy_position_never_gets_an_ellipsis() {
    let mut state = input(Settings::eficiencia());
    for slot in state.board.slots.iter_mut().flatten() {
        Arc::make_mut(slot).position = "100".into();
    }
    let rt = runtime(state, 1.0);
    let position = rt
        .elements()
        .into_iter()
        .find(|e| e.key.as_deref() == Some("car-0-cell-0"))
        .expect("posición");
    assert_eq!(
        position.text.as_deref(),
        Some("100"),
        "GPUI pinta la posición legada tal cual"
    );
}

#[test]
fn a_footer_with_more_than_five_cells_wraps_inside_the_panel() {
    let mut state = input(Settings::eficiencia());
    state.board.footer_cells = (0..9)
        .map(|n| InfoCell {
            id: n.to_string(),
            label: "PISTA".into(),
            value: "26 °C".into(),
            stale: n == 0,
        })
        .collect();
    let rt = runtime(state, 1.0);
    let cells: Vec<_> = rt
        .elements()
        .into_iter()
        .filter(|e| e.key.as_deref().is_some_and(|k| k.starts_with("footer-")))
        .collect();
    assert_eq!(cells.len(), 9, "una clave por valor del pie");
    assert!(
        cells
            .iter()
            .all(|e| e.rect[0] >= 0.0 && e.rect[0] + e.rect[2] <= WIDTH)
    );
    assert!(
        cells
            .iter()
            .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("footer-1-"))),
        "las celdas se reparten en más de una línea"
    );
}

#[test]
fn every_layer_stays_inside_with_source_notices_long_texts_and_english() {
    let long = "CIRCUITO INTERNACIONAL DE MOTORSPORT DEL SUR ".repeat(3);
    for (notice, source) in [
        ("ESPERANDO SIMULADOR", vantare_domain::SourceState::Waiting),
        ("SIN SEÑAL", vantare_domain::SourceState::Stale),
        ("DESCONECTADO", vantare_domain::SourceState::Lost),
    ] {
        for language in [Language::Es, Language::En] {
            let mut state = input(Settings::eficiencia());
            state.language = language;
            state.board.status = Some(notice.into());
            state.board.track = long.clone();
            state.board.source_state = source;
            for slot in state.board.slots.iter_mut().flatten() {
                Arc::make_mut(slot).driver = long.clone();
            }
            let settings = state.settings.clone();
            let size = natural_size(&settings);
            let mut rt = runtime(state, 1.0);
            crate::testdata::assert_inside_window(&mut rt, size);
        }
    }
}
