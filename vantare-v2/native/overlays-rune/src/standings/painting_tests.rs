use super::*;
use rune::{Env, Runtime, text::TextSystem};
use vantare_domain::{
    Quality, SourceState, TyreCompound,
    format::Language,
    widget_settings::look::{Look, Tone},
};
pub(super) fn config(name: &str) -> Config {
    Config {
        design_system: Look::Vantare,
        columns: Some(vantare_domain::widget_settings::standings::vantare_template(name)),
        row_count: 8,
        brand_visible: Some(true),
        ..Config::default()
    }
}
fn photo(name: &str) -> Snapshot {
    super::tests::named_photos()
        .into_iter()
        .find(|(caption, _)| caption == name)
        .expect(name)
        .1
}
pub(super) fn host(mut widget: Standings, photo: &Snapshot) -> Runtime<Standings> {
    widget.update(photo, 0.0);
    paint(widget)
}
pub(super) fn paint(widget: Standings) -> Runtime<Standings> {
    let size = widget.size();
    let mut runtime = Runtime::with_text(
        widget,
        |s, _| s.view(),
        (size.width, size.height),
        Env::new(true, 1.0),
        TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
    );
    runtime.poll = Some(|s, clock, tx| {
        s.schedule(clock, tx);
        false
    });
    runtime.frame(0.0);
    runtime
}
pub(super) fn texts(runtime: &Runtime<Standings>) -> Vec<String> {
    runtime
        .elements()
        .iter()
        .filter_map(|e| e.text.clone())
        .collect()
}
#[test]
fn painted_catalogue_cells_match_gpui_in_es_and_en() {
    for language in [Language::Es, Language::En] {
        let prefs = Preferences {
            language,
            ..Preferences::default()
        };
        let mut photo = photo("Carrera · vuelta 14/38");
        for (car, compound) in photo.state.cars.iter_mut().zip([
            TyreCompound::Soft,
            TyreCompound::Hard,
            TyreCompound::Wet,
        ]) {
            car.tyre_compound = Quality::Reliable(compound);
        }
        let mut rt = host(Standings::new(&config("expanded"), prefs), &photo);
        let actual = texts(&rt);
        for expected in [
            "▲2",
            "#6",
            "BOX",
            "1 P",
            "3:27.046",
            "+3.802",
            "A. Lotterer",
        ] {
            assert!(
                actual.iter().any(|s| s == expected),
                "{expected}: {actual:?}"
            );
        }
        for expected in if language == Language::Es {
            ["B", "D", "LL"]
        } else {
            ["S", "H", "W"]
        } {
            assert!(
                actual.iter().any(|s| s == expected),
                "{expected}: {actual:?}"
            );
        }
        crate::testdata::assert_inside_window(&mut rt, (900.0, 307.0));
    }
}
#[test]
fn every_painted_layer_is_pinned_inside_each_catalogue_box() {
    for name in ["compact", "standard", "expanded"] {
        for tone in [Tone::Neo, Tone::Neutro] {
            for mode in ["player", "all", "multiclass"] {
                for photo in super::tests::photos() {
                    let mut settings = config(name);
                    settings.style = tone;
                    settings.classification_mode = if mode == "multiclass" {
                        "multiclass"
                    } else {
                        "normal"
                    }
                    .into();
                    settings.class_scope = if mode == "all" {
                        "all-classes"
                    } else {
                        "player-class"
                    }
                    .into();
                    let mut rt = host(Standings::new(&settings, Preferences::default()), &photo);
                    let size = rt.state.size();
                    crate::testdata::assert_inside_window(&mut rt, (size.width, size.height));
                }
            }
        }
    }
}
#[test]
fn scene_changes_and_repose_never_depend_on_sequence_or_animation_clock() {
    assert!(crate::renderer::constructor(&Settings::Standings(config("standard"))).is_some());
    assert!(crate::renderer::constructor(&Settings::Standings(Config::eficiencia())).is_none());
    let mut w = Standings::new(&config("standard"), Preferences::default());
    let mut photo = photo("Carrera · vuelta 14/38");
    assert!(w.update(&photo, 0.0).build);
    assert!(!w.update(&photo, 0.1).build);
    photo.sequence += 1;
    assert!(!w.update(&photo, 0.2).build);
    photo.state.source_state = SourceState::Lost;
    assert!(w.update(&photo, 0.3).build);
    assert!(!w.update(&photo, 0.4).build);
    assert!(!w.policy(true, 60, 0.4).build);
    assert!(!w.animate(100.0).build);
    let rt = host(w, &photo);
    assert!(rt.wake_deadline().is_none());
}
#[test]
fn long_driver_name_has_ellipsis_only_where_gpui_fits_it() {
    let mut photo = photo("Carrera · vuelta 14/38");
    photo.state.cars[0].driver.name = "Nombre larguísimo del piloto que no cabe en compacto".into();
    let mut rt = host(
        Standings::new(&config("compact"), Preferences::default()),
        &photo,
    );
    let actual = texts(&rt);
    assert!(actual.iter().any(|s| s.ends_with('…')), "{actual:?}");
    assert!(actual.iter().any(|s| s == "CARRERA · V 14/38"));
    crate::testdata::assert_inside_window(&mut rt, (340.0, 289.0));
}

#[test]
fn numeric_sectors_and_qualifying_opacity_match_gpui() {
    let mut settings = config("expanded");
    for column in settings.columns.as_mut().unwrap() {
        if matches!(column.metric_id.as_str(), "lastLap" | "positionsGained") {
            column.enabled = false;
        }
    }
    let mut photo = photo("Carrera · vuelta 14/38");
    photo.state.session.kind = Quality::Reliable(vantare_domain::SessionKind::Qualifying);
    photo.state.cars[1].best_lap_s = Quality::Unavailable;
    let mut rt = host(Standings::new(&settings, Preferences::default()), &photo);
    let actual = texts(&rt);
    for expected in ["S1", "S2", "S3", "1:10.200", "1:08.000", "1:09.000", "Pole"] {
        assert!(actual.iter().any(|t| t == expected), "{actual:?}");
    }
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.text.as_deref() == Some("2") && (e.opacity - 0.45).abs() < 0.001)
    );
    crate::testdata::assert_inside_window(&mut rt, (900.0, 307.0));
}

#[test]
fn contextual_banners_footers_and_waiting_copy_gpui_in_both_languages() {
    for language in [Language::Es, Language::En] {
        let es = language == Language::Es;
        let prefs = Preferences {
            language,
            ..Preferences::default()
        };
        let photos = super::tests::named_photos();
        for (name, expected) in [
            (
                "Carrera · vuelta 14/38",
                if es {
                    "Vuelta rápida "
                } else {
                    "Fastest lap "
                },
            ),
            (
                "FCY · amarilla en todo el circuito",
                if es { "Gaps congelados" } else { "Gaps frozen" },
            ),
            (
                "Amarilla local · sector 2",
                if es {
                    "AMARILLA · SECTOR 2"
                } else {
                    "YELLOW · SECTOR 2"
                },
            ),
            (
                "Última vuelta · 38/38",
                if es { "ÚLTIMA VUELTA" } else { "FINAL LAP" },
            ),
            (
                "Jugador en boxes",
                if es { "En boxes" } else { "In the pits" },
            ),
            (
                "Sin datos · esperando al simulador",
                if es {
                    "ESPERANDO AL SIMULADOR"
                } else {
                    "WAITING FOR THE SIMULATOR"
                },
            ),
            (
                "Espectador · sin coche propio",
                if es {
                    "Siguiendo al líder"
                } else {
                    "Following the leader"
                },
            ),
        ] {
            let (_, photo) = photos
                .iter()
                .find(|(caption, _)| caption == name)
                .expect(name);
            let mut rt = host(Standings::new(&config("expanded"), prefs), photo);
            let actual = texts(&rt);
            assert!(actual.iter().any(|t| t == expected), "{name}: {actual:?}");
            match name {
                "FCY · amarilla en todo el circuito" => {
                    assert!(actual.iter().any(|t| t == "FCY"));
                    assert!(
                        rt.elements()
                            .iter()
                            .any(|e| e.fill == Style::compiled().colors.fcy_fill
                                && e.rect == [0.0, 0.0, 900.0, 22.0])
                    );
                }
                "Última vuelta · 38/38" => assert!(actual.iter().any(|t| t == "38/38")),
                "Sin datos · esperando al simulador" => {
                    assert!(actual.iter().all(|t| !t.ends_with('…')))
                }
                _ => {}
            }
            crate::testdata::assert_inside_window(&mut rt, (900.0, 307.0));
        }
    }
}
#[test]
fn class_separator_has_the_catalogue_band_and_right_aligned_detail() {
    let mut settings = config("expanded");
    settings.classification_mode = "multiclass".into();
    let mut rt = host(
        Standings::new(&settings, Preferences::default()),
        &photo("Carrera · vuelta 14/38"),
    );
    let actual = texts(&rt);
    assert!(actual.iter().any(|t| t == "HYPERCAR"));
    assert!(
        actual.iter().any(|t| t == "7 coches · mejor 3:27.046"),
        "{actual:?}"
    );
    let style = Style::compiled();
    assert!(
        rt.elements()
            .iter()
            .any(|e| e.fill == style.colors.separator_band
                && e.rect[2] == 900.0
                && e.rect[3] == 22.0)
    );
    let separator_y = rt
        .state
        .scene
        .plan
        .items
        .iter()
        .find_map(|(y, item)| matches!(item, layout::Item::Separator(0)).then_some(*y))
        .unwrap();
    assert_eq!(separator_y, 11.0 + 18.0 + 4.0 + 18.0 + 6.0);
    let elements = rt.elements();
    let title = elements
        .iter()
        .find(|e| e.text.as_deref() == Some("HYPERCAR"))
        .unwrap();
    let detail = elements
        .iter()
        .find(|e| e.text.as_deref() == Some("7 coches · mejor 3:27.046"))
        .unwrap();
    assert_eq!(title.rect[1], separator_y + 1.0);
    assert_eq!(detail.rect[1], separator_y + 0.0);
    assert!((detail.rect[0] + detail.rect[2] - (900.0 - 12.0)).abs() < 0.02);
    crate::testdata::assert_inside_window(&mut rt, (900.0, 397.0));
}
#[test]
fn waiting_keeps_four_or_five_skeleton_rows_and_no_clock_when_lost() {
    for (name, count) in [("compact", 4), ("standard", 5), ("expanded", 5)] {
        let mut photo = photo("Carrera · vuelta 14/38");
        photo.state.source_state = SourceState::Lost;
        let rt = host(
            Standings::new(&config(name), Preferences::default()),
            &photo,
        );
        let style = Style::compiled();
        let bars = rt
            .elements()
            .iter()
            .filter(|e| e.fill == style.colors.skeleton)
            .count();
        assert_eq!(bars, count * 4);
        assert!(rt.wake_deadline().is_none());
    }
}

#[test]
fn pause_band_adds_twenty_two_pixels_only_while_paused_and_retains_the_live_scene() {
    for (preset, width, height) in [
        ("compact", 340.0, 289.0),
        ("standard", 520.0, 289.0),
        ("expanded", 900.0, 307.0),
    ] {
        for (language, title) in [(Language::Es, "EN PAUSA"), (Language::En, "PAUSED")] {
            let live = photo("Carrera · vuelta 14/38");
            let mut paused = live.clone();
            paused.state.source_state = SourceState::Paused;
            paused.state.cars[0].driver.name = "No debe proyectarse durante la pausa".into();
            let mut w = Standings::new(
                &config(preset),
                Preferences {
                    language,
                    ..Preferences::default()
                },
            );
            assert_eq!(w.size_for(Some(&paused)).height, height + 22.0);
            assert_eq!(w.size_for(Some(&live)).height, height);
            assert!(w.update(&live, 0.0).build);
            let board = w.scene.board.clone().unwrap();
            assert!(w.update(&paused, 1.0).build);
            assert!(Arc::ptr_eq(&board, w.scene.board.as_ref().unwrap()));
            assert!(!w.update(&paused, 2.0).build);
            assert_eq!(w.size_for(None).height, height + 22.0);
            let mut rt = paint(w);
            assert!(texts(&rt).iter().any(|t| t == title));
            assert!(
                rt.elements()
                    .iter()
                    .any(|e| e.key.as_deref() == Some("pause-band")
                        && e.rect == [0.0, height, width, 22.0]
                        && e.fill == rune::color::hex("#101113f2").unwrap())
            );
            assert!(rt.wake_deadline().is_none());
            crate::testdata::assert_inside_window(&mut rt, (width, height + 22.0));
            assert!(rt.state.update(&live, 3.0).build);
            assert_eq!(rt.state.size().height, height);
            assert_eq!(rt.state.size_for(None).height, height);
            let mut resumed = paint(rt.state);
            assert!(!texts(&resumed).iter().any(|t| t == title));
            crate::testdata::assert_inside_window(&mut resumed, (width, height));
            let mut opened = host(
                Standings::new(
                    &config(preset),
                    Preferences {
                        language,
                        ..Preferences::default()
                    },
                ),
                &paused,
            );
            assert!(texts(&opened).iter().any(|t| t == title));
            assert_eq!(
                opened.state.scene.board.as_ref().unwrap().source_state,
                SourceState::Live
            );
            crate::testdata::assert_inside_window(&mut opened, (width, height + 22.0));
        }
    }
}
#[test]
fn compact_and_standard_bound_banner_footer_and_waiting_to_literal_gpui_widths() {
    for (preset, width, height) in [("compact", 340.0, 289.0), ("standard", 520.0, 289.0)] {
        for (name, expected) in [
            ("FCY · amarilla en todo el circuito", "Gaps congelados"),
            ("Jugador en boxes", "En boxes"),
            (
                "Sin datos · esperando al simulador",
                "ESPERANDO AL SIMULADOR",
            ),
        ] {
            let (_, photo) = super::tests::named_photos()
                .into_iter()
                .find(|(caption, _)| caption == name)
                .expect(name);
            let mut rt = host(
                Standings::new(&config(preset), Preferences::default()),
                &photo,
            );
            assert_eq!(
                (rt.state.size().width, rt.state.size().height),
                (width, height)
            );
            assert!(texts(&rt).iter().any(|t| t == expected), "{preset}: {name}");
            crate::testdata::assert_inside_window(&mut rt, (width, height));
        }
    }
}
#[test]
fn compact_session_footer_keeps_gpui_abbreviations_track_pole_own_gap_and_stop() {
    for (language, fastest, compact_track, track, own, stop) in [
        (
            Language::Es,
            "VR ",
            "31 °C · seca",
            "Pista 31 °C · seca",
            "Tuya +1.234",
            "Parada 3",
        ),
        (
            Language::En,
            "FL ",
            "31 °C · dry",
            "Track 31 °C · dry",
            "Yours +1.234",
            "Stop 3",
        ),
    ] {
        let prefs = Preferences {
            language,
            ..Preferences::default()
        };
        let photo = photo("Carrera · vuelta 14/38");
        // GPUI: XS con última vuelta mide 391 (<400), por tanto pie compacto.
        let mut narrow = config("compact");
        for column in narrow.columns.as_mut().unwrap() {
            if column.metric_id == "driverName" {
                column.width_preset = "xs".into();
            }
            if column.metric_id == "lastLap" {
                column.enabled = true;
            }
        }
        let rt = host(Standings::new(&narrow, prefs), &photo);
        assert_eq!(rt.state.size().width, 391.0);
        let actual = texts(&rt);
        assert!(actual.iter().any(|t| t == fastest), "{actual:?}");
        assert!(actual.iter().any(|t| t == compact_track), "{actual:?}");
        assert!(!actual.iter().any(|t| t == track)); // GPUI compacto omite Pista/Track.
        let mut standard = config("standard");
        standard
            .columns
            .as_mut()
            .unwrap()
            .iter_mut()
            .find(|c| c.metric_id == "bestLap")
            .unwrap()
            .enabled = true;
        let rt = host(Standings::new(&standard, prefs), &photo);
        assert_eq!(rt.state.size().width, 520.0);
        assert!(texts(&rt).iter().any(|t| t == track));
        let mut w = Standings::new(&narrow, prefs);
        w.update(&photo, 0.0);
        let b = Arc::make_mut(w.scene.board.as_mut().unwrap());
        b.qualifying = true;
        b.gap_to_best_lap = true;
        let me = b
            .groups
            .iter_mut()
            .flat_map(|g| &mut g.rows)
            .find(|r| r.is_player)
            .unwrap();
        Arc::make_mut(me).classification_gap_s = Some(1.234);
        let rt = paint(w);
        assert!(texts(&rt).iter().any(|t| t == "Pole "));
        assert!(texts(&rt).iter().any(|t| t == own));
        let mut w = Standings::new(&config("compact"), prefs);
        w.update(&photo, 0.0);
        let b = Arc::make_mut(w.scene.board.as_mut().unwrap());
        b.player_in_pits = true;
        let me = b
            .groups
            .iter_mut()
            .flat_map(|g| &mut g.rows)
            .find(|r| r.is_player)
            .unwrap();
        Arc::make_mut(me).pit = standings::Pit::Stops(2);
        w.scene.plan = layout::plan(w.scene.board.as_deref(), &w.scene.options, &w.style);
        assert!(texts(&paint(w)).iter().any(|t| t == stop));
    }
}
#[test]
fn missing_stale_and_paused_keep_gpui_waiting_rules_without_a_clock() {
    for preset in ["compact", "standard", "expanded"] {
        for (name, source, skeletons) in [
            ("Missing", SourceState::Waiting, true),
            ("Lost", SourceState::Lost, true),
            ("Stale", SourceState::Stale, false),
            ("Paused", SourceState::Paused, false),
        ] {
            let mut photo = photo("Carrera · vuelta 14/38");
            photo.state.source_state = source;
            let mut rt = host(
                Standings::new(&config(preset), Preferences::default()),
                &photo,
            );
            assert_eq!(
                texts(&rt).iter().any(|t| t == "ESPERANDO AL SIMULADOR"),
                skeletons,
                "{preset}: {name}"
            );
            let bars = rt
                .elements()
                .iter()
                .filter(|e| e.fill == Style::compiled().colors.skeleton && e.rect[3] == 8.0)
                .count();
            assert_eq!(
                bars,
                if skeletons {
                    if preset == "compact" { 12 } else { 15 }
                } else {
                    0
                },
                "{preset}: {name}"
            );
            let size = rt.state.size();
            crate::testdata::assert_inside_window(&mut rt, (size.width, size.height));
            assert!(rt.wake_deadline().is_none(), "{preset}: {name}");
        }
    }
}
