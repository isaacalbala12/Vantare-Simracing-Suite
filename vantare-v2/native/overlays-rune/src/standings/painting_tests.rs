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
        let mut photo = super::tests::photos().remove(0);
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
    let mut photo = super::tests::photos().remove(0);
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
    let mut photo = super::tests::photos().remove(0);
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
    let mut photo = super::tests::photos().remove(0);
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
        let expected = if es {
            [
                "Vuelta rápida ",
                "Gaps congelados",
                "AMARILLA · SECTOR 2",
                "ÚLTIMA VUELTA",
                "En boxes",
                "ESPERANDO AL SIMULADOR",
                "Siguiendo al líder",
            ]
        } else {
            [
                "Fastest lap ",
                "Gaps frozen",
                "YELLOW · SECTOR 2",
                "FINAL LAP",
                "In the pits",
                "WAITING FOR THE SIMULATOR",
                "Following the leader",
            ]
        };
        for (index, photo) in super::tests::photos().iter().enumerate() {
            let mut rt = host(Standings::new(&config("expanded"), prefs), photo);
            let actual = texts(&rt);
            assert!(
                actual.iter().any(|t| t == expected[index]),
                "{index}: {actual:?}"
            );
            if index == 1 {
                assert!(actual.iter().any(|t| t == "FCY"));
                assert!(
                    rt.elements()
                        .iter()
                        .any(|e| e.fill == Style::compiled().colors.fcy_fill
                            && e.rect == [0.0, 0.0, 900.0, 22.0])
                );
            }
            if index == 3 {
                assert!(actual.iter().any(|t| t == "38/38"));
            }
            if index == 5 {
                assert!(actual.iter().all(|t| !t.ends_with('…')));
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
        &super::tests::photos()[0],
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
    crate::testdata::assert_inside_window(&mut rt, (900.0, 397.0));
}
#[test]
fn waiting_keeps_four_or_five_skeleton_rows_and_no_clock_when_lost() {
    for (name, count) in [("compact", 4), ("standard", 5), ("expanded", 5)] {
        let mut photo = super::tests::photos().remove(0);
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
