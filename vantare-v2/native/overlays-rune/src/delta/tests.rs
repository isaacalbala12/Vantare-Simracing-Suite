use super::*;
use crate::{
    host::{self, Access, Shared},
    scene::Scene as FrameScene,
};
use rune::{Env, Runtime};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{
    Quality::{Reliable, Unavailable},
    SourceState,
    delta::Phase,
    format::Language,
    motion_policy::MotionPolicy,
};
use vantare_ipc::{Photo, layout::Layout};

fn snapshot() -> Snapshot {
    let mut s = vantare_ipc::source::fixed();
    s.state.capabilities.delta = vantare_domain::Capability::Fresh;
    s.state.cars[0].class_position = Reliable(1);
    s.state.cars[0].best_lap_s = Reliable(99.0);
    let p = s.state.player.as_mut().expect("simulated player");
    p.delta_best_s = Reliable(-0.214);
    p.delta_optimal_s = Reliable(-0.300);
    p.delta_leader_s = Reliable(0.400);
    p.stint.laps = Reliable(3);
    p.lap_invalid = Reliable(false);
    let car = s
        .state
        .cars
        .iter_mut()
        .find(|c| c.id == p.car)
        .expect("player car");
    car.in_pits = Reliable(false);
    car.best_lap_s = Reliable(100.0);
    car.estimated_lap_s = Reliable(99.786);
    car.best_sectors_s = vec![Reliable(33.0), Reliable(33.0), Reliable(34.0)];
    s
}

fn settings(size: &str) -> Settings {
    Settings {
        size: size.into(),
        ..Default::default()
    }
}

fn delta(settings: &Settings, prefs: Preferences) -> Delta {
    <Delta>::new(settings, prefs, false, 0.0)
}

fn changed(update: Update) -> bool {
    update.build || update.pixels
}

fn harness(painter: Delta) -> Runtime<Delta> {
    let size = painter.size();
    let mut runtime = Runtime::with_text(
        painter,
        |painter: &Delta, _| painter.view(),
        (size.width, size.height),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
    );
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    runtime
}

fn pixels<S: 'static>(runtime: &Runtime<S>) -> Vec<[[u32; 4]; 8]> {
    runtime
        .instances
        .iter()
        .map(|i| {
            [
                i.rect.map(f32::to_bits),
                i.radii.map(f32::to_bits),
                i.fill.map(f32::to_bits),
                i.border.map(f32::to_bits),
                i.params.map(f32::to_bits),
                i.uv.map(f32::to_bits),
                i.clip.map(f32::to_bits),
                i.fade,
            ]
        })
        .collect()
}

#[test]
fn values_and_reference_come_from_the_canonical_projection() {
    let input = snapshot();
    for name in ["best", "optimal", "leader"] {
        let settings = Settings {
            reference: name.into(),
            ..settings("bar")
        };
        let mut painter = delta(&settings, Preferences::default());
        assert!(changed(painter.update(&input, 0.0)), "{name}");
        let board = project(&settings, &input, Preferences::default());
        assert_eq!(board.phase, Phase::Live, "simulated {name} is available");
        let expected_number = match name {
            "best" => "−0.214",
            "optimal" => "−0.300",
            _ => "+0.400",
        };
        assert_eq!(painter.scene.labels.number, expected_number, "{name}");
        let expected = match name {
            "best" => "MEJOR",
            "optimal" => "ÓPTIMA",
            _ => "LÍDER",
        };
        assert!(painter.scene.labels.title.ends_with(expected), "{name}");
        assert!(!changed(painter.update(&input, 0.1)));
    }
    let mut missing = input.clone();
    missing.state.cars[0].best_lap_s = Unavailable;
    let mut painter = delta(
        &Settings {
            reference: "leader".into(),
            ..settings("bar")
        },
        Preferences::default(),
    );
    painter.update(&missing, 0.0);
    assert!(painter.scene.message);
    assert_eq!(painter.scene.labels.number, "-.---");
    assert!(!changed(painter.update(&missing, 0.1)));
}

#[test]
fn each_size_keeps_the_catalogue_box_and_pause_never_resizes_it() {
    let input = snapshot();
    for (size, width) in [("pill", 150.0), ("bar", 380.0), ("expanded", 768.0)] {
        let mut painter = delta(&settings(size), Preferences::default());
        painter.update(&input, 0.0);
        assert_eq!(painter.size().width, width, "{size}");
        let mut paused = input.clone();
        paused.state.source_state = SourceState::Paused;
        assert_eq!(painter.size_for(Some(&paused)), painter.size(), "{size}");
    }
    let pill = delta(&settings("pill"), Preferences::default());
    assert_eq!(pill.size().height, 36.0);
}

#[test]
fn hidden_bar_and_sectors_remove_their_items_and_height() {
    let board = project(&settings("expanded"), &snapshot(), Preferences::default());
    let full = scene::sample(
        &board,
        &settings("expanded"),
        Preferences::default(),
        &crate::vantare::Style::compiled(),
    );
    let no_bar = scene::sample(
        &board,
        &Settings {
            show_bar: false,
            ..settings("expanded")
        },
        Preferences::default(),
        &crate::vantare::Style::compiled(),
    );
    let no_sectors = scene::sample(
        &board,
        &Settings {
            show_sectors: false,
            ..settings("expanded")
        },
        Preferences::default(),
        &crate::vantare::Style::compiled(),
    );
    assert!(full.items.iter().any(|(_, item)| *item == scene::Item::Bar));
    assert!(
        !no_bar
            .items
            .iter()
            .any(|(_, item)| *item == scene::Item::Bar)
    );
    assert!(full.height > no_bar.height);
    assert!(
        full.items
            .iter()
            .any(|(_, item)| *item == scene::Item::Sectors)
    );
    assert!(
        !no_sectors
            .items
            .iter()
            .any(|(_, item)| *item == scene::Item::Sectors)
    );
    assert!(full.height > no_sectors.height);
}

#[test]
fn waiting_no_reference_and_spectator_name_their_states() {
    let style = crate::vantare::Style::compiled();
    let waiting = delta::project_reference(
        &Snapshot::default(),
        Preferences::default(),
        Reference::PersonalBest,
    );
    let scene = scene::sample(&waiting, &settings("bar"), Preferences::default(), &style);
    assert!(scene.message);
    assert_eq!(
        scene.labels.message.expect("aviso").0,
        "ESPERANDO AL SIMULADOR"
    );
    let english = Preferences {
        language: Language::En,
        ..Preferences::default()
    };
    let scene = scene::sample(&waiting, &settings("bar"), english, &style);
    assert_eq!(
        scene.labels.message.expect("notice").1,
        "Open the simulator and join a session"
    );
    let mut spectator = project(&settings("bar"), &snapshot(), Preferences::default());
    spectator.player_present = false;
    spectator.phase = Phase::NoReference;
    let scene = scene::sample(&spectator, &settings("bar"), Preferences::default(), &style);
    assert_eq!(scene.labels.message.expect("aviso").0, "SIN COCHE PROPIO");
}

#[test]
fn invalid_and_paused_keep_the_grey_number_and_the_note() {
    let style = crate::vantare::Style::compiled();
    let mut board = project(&settings("bar"), &snapshot(), Preferences::default());
    board.phase = Phase::Invalid;
    let scene = scene::sample(&board, &settings("bar"), Preferences::default(), &style);
    assert_eq!(
        scene.labels.phase_note,
        Some("Vuelta invalidada · límites de pista")
    );
    assert!(scene.grey);
    let mut paused = project(&settings("bar"), &snapshot(), Preferences::default());
    paused.phase = Phase::Paused(vantare_domain::delta::Pause::OutLap);
    let scene = scene::sample(&paused, &settings("bar"), Preferences::default(), &style);
    assert_eq!(scene.labels.phase_note, Some("Vuelta de salida"));
    assert_eq!(scene.labels.number, "—.———");
}

#[test]
fn the_bar_fill_paints_the_target_and_its_sign() {
    let mut painter = delta(&settings("bar"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    let runtime = harness(painter);
    let fill = runtime.presented("bar-fill").expect("painted bar");
    let [x, _, w, _] = fill.0;
    assert!(w > 0.0);
    assert!(x < 380.0 / 2.0, "negativo a la izquierda");
    let mut positive = snapshot();
    positive.state.player.as_mut().expect("player").delta_best_s = Reliable(0.4);
    let mut painter = delta(&settings("bar"), Preferences::default());
    painter.update(&positive, 0.0);
    let positive_runtime = harness(painter);
    let fill = positive_runtime
        .presented("bar-fill")
        .expect("positive bar");
    assert!(fill.0[0] >= 380.0 / 2.0 - 0.5, "positivo a la derecha");
    let mut painter = delta(&settings("bar"), Preferences::default());
    painter.update(&snapshot(), 0.2);
    let center_runtime = harness(painter);
    assert!(center_runtime.presented("bar-center").is_some());
    assert!(center_runtime.wake_deadline().is_none(), "sin reloj");
}

#[test]
fn thirty_seconds_of_sequences_and_hidden_lap_times_leave_actual_cpu_pixels_unchanged() {
    for size in ["pill", "bar", "expanded"] {
        let mut input = snapshot();
        let mut painter = delta(&settings(size), Preferences::default());
        painter.update(&input, 0.0);
        let mut runtime = harness(painter);
        if size == "pill" {
            assert!(
                runtime.presented("header-title").is_none(),
                "la píldora no lleva cabecera"
            );
        }
        let before = pixels(&runtime);
        for step in 1..=300 {
            input.sequence += 1;
            for car in &mut input.state.cars {
                car.last_lap_s = Reliable(90.0 + f64::from(step));
            }
            assert!(!changed(
                runtime.state.update(&input, f64::from(step) / 10.0)
            ));
            assert!(!runtime.frame(0.1));
            assert_eq!(pixels(&runtime), before, "{size}");
        }
    }
}

#[test]
fn every_state_keeps_every_layer_inside_the_window() {
    for size in ["pill", "bar", "expanded"] {
        for state in [
            SourceState::Live,
            SourceState::Paused,
            SourceState::Waiting,
            SourceState::Lost,
        ] {
            let mut input = snapshot();
            input.state.source_state = state;
            let mut painter = delta(&settings(size), Preferences::default());
            painter.update(&input, 0.0);
            let (width, height) = (painter.size().width, painter.size().height);
            let mut runtime = harness(painter);
            crate::testdata::assert_inside_window(&mut runtime, (width, height));
        }
    }
}

#[test]
fn configured_rebuilds_for_every_visible_setting_and_language() {
    let prefs = Preferences::default();
    let painter = delta(&settings("bar"), prefs);
    let same = WidgetSettings::Delta(settings("bar"));
    assert!(<Delta as Widget>::configured(&painter, &same, prefs));
    for changed_settings in [
        settings("expanded"),
        Settings {
            reference: "optimal".into(),
            ..settings("bar")
        },
        Settings {
            show_bar: false,
            ..settings("bar")
        },
        Settings {
            show_sectors: false,
            ..settings("expanded")
        },
        Settings {
            transparent_background: true,
            ..settings("bar")
        },
        Settings {
            brand_visible: Some(true),
            ..settings("bar")
        },
    ] {
        assert!(!<Delta as Widget>::configured(
            &painter,
            &WidgetSettings::Delta(changed_settings),
            prefs
        ));
    }
    let english = Preferences {
        language: Language::En,
        ..prefs
    };
    assert!(!<Delta as Widget>::configured(&painter, &same, english));
}

#[test]
fn the_pill_uses_the_thirty_four_pixel_content_box() {
    // Constantes de GPUI: alto de contenido 34, rótulo 11 y baseline Display 1.
    let mut painter = delta(&settings("pill"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    let runtime = harness(painter);
    let panel = runtime.presented("panel").expect("panel de la píldora");
    assert_eq!(panel.0[3], 34.0, "el panel mide el contenido, no la caja");
    let label = runtime.presented("pill-label").expect("rótulo");
    assert_eq!([label.0[1], label.0[3]], [1.0, 32.0]);
    let value = runtime.presented("pill-value").expect("valor");
    assert_eq!([value.0[1], value.0[3]], [2.0, 31.0]);
}

#[test]
fn sector_values_share_the_title_line() {
    let mut painter = delta(&settings("expanded"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    let runtime = harness(painter);
    // GPUI: 10 de padding + 18 de cabecera + 4 de hueco + 44 de número
    // + 10 de barra + 16 de rótulos = 102; luego 6 + 3 + 3 hasta el texto.
    let title = runtime.presented("sector-title-0").expect("título");
    let value = runtime.presented("sector-value-0").expect("valor");
    assert_eq!(title.0[1], 114.0);
    assert_eq!(value.0[1], 114.0);
}

#[test]
fn the_brand_ends_at_the_header_edge() {
    let mut painter = delta(
        &Settings {
            brand_visible: Some(true),
            ..settings("bar")
        },
        Preferences::default(),
    );
    painter.update(&snapshot(), 0.0);
    let runtime = harness(painter);
    let name = runtime.presented("brand-name").expect("marca");
    let pad = crate::vantare::Style::compiled().styles.neo.padding_x;
    let right = name.0[0] + name.0[2];
    assert!(
        (right - (380.0 - pad)).abs() < 0.01,
        "borde derecho {right}"
    );
    let symbol = runtime.presented("brand-symbol").expect("símbolo");
    assert!(symbol.0[0] >= 0.0);
    assert!(
        symbol.0[0] + symbol.0[2] <= name.0[0] + 0.5,
        "símbolo a la izquierda del nombre"
    );
}

#[test]
fn transparent_labels_carry_the_game_shadow() {
    let mut painter = delta(
        &Settings {
            brand_visible: Some(true),
            ..settings("bar")
        },
        Preferences::default(),
    );
    painter.update(&snapshot(), 0.0);
    let runtime = harness(painter);
    assert!(
        runtime.presented("big-number-shadow-0").is_none(),
        "sin sombra sobre el panel"
    );
    assert!(runtime.presented("brand-name-shadow-0").is_none());
    let mut painter = delta(
        &Settings {
            transparent_background: true,
            brand_visible: Some(true),
            ..settings("bar")
        },
        Preferences::default(),
    );
    painter.update(&snapshot(), 0.0);
    let runtime = harness(painter);
    assert!(
        runtime.presented("big-number-shadow-0").is_some(),
        "sombra sobre el juego"
    );
    assert!(
        runtime.presented("brand-name-shadow-0").is_none(),
        "la marca nunca lleva sombra"
    );
}

#[test]
fn transparent_brand_banner_and_every_state_stay_inside_the_window() {
    for size in ["pill", "bar", "expanded"] {
        for brand in [false, true] {
            for case in 0..7 {
                let mut input = snapshot();
                match case {
                    0 => {}
                    1 => {
                        if let Some(player) = input.state.player.as_mut() {
                            let car_id = player.car;
                            if let Some(car) =
                                input.state.cars.iter_mut().find(|car| car.id == car_id)
                            {
                                car.in_pits = Reliable(true);
                            }
                        }
                    }
                    2 => {
                        input.state.player.as_mut().expect("player").lap_invalid = Reliable(true);
                    }
                    3 => input.state.cars[0].best_lap_s = Unavailable,
                    4 => input.state.player = None,
                    5 => input.state.source_state = SourceState::Waiting,
                    _ => input.state.source_state = SourceState::Lost,
                }
                let settings = Settings {
                    size: size.into(),
                    transparent_background: true,
                    brand_visible: brand.then_some(true),
                    reference: "leader".into(),
                    ..Default::default()
                };
                let mut painter = delta(&settings, Preferences::default());
                painter.update(&input, 0.0);
                let (width, height) = (painter.size().width, painter.size().height);
                let mut runtime = harness(painter);
                crate::testdata::assert_inside_window(&mut runtime, (width, height));
            }
        }
    }
}

#[test]
fn the_five_game_shadows_keep_gpui_offsets_and_alpha() {
    let expected = [
        (-1.0f32, 0.0f32, 0.35f32),
        (1.0, 0.0, 0.35),
        (0.0, -1.0, 0.35),
        (0.0, 2.0, 0.35),
        (0.0, 1.0, 0.9),
    ];
    let mut live = delta(
        &Settings {
            transparent_background: true,
            ..settings("bar")
        },
        Preferences::default(),
    );
    live.update(&snapshot(), 0.0);
    check_shadows(&harness(live), "big-number", &expected);
    let mut waiting = delta(
        &Settings {
            transparent_background: true,
            ..settings("bar")
        },
        Preferences::default(),
    );
    waiting.update(&Snapshot::default(), 0.0);
    check_shadows(&harness(waiting), "message-title", &expected);
}

fn check_shadows(runtime: &Runtime<Delta>, key: &str, expected: &[(f32, f32, f32); 5]) {
    let elements = runtime.elements();
    let main = by_key(&elements, key).rect;
    for (index, (dx, dy, strength)) in expected.iter().enumerate() {
        let shadow = by_key(&elements, &format!("{key}-shadow-{index}"));
        assert_eq!(
            shadow.rect,
            [main[0] + dx, main[1] + dy, main[2], main[3]],
            "{key} {index}"
        );
        assert_eq!(
            shadow.text_color,
            Some(crate::vantare::alpha(
                crate::eficiencia::color(0x000000, 1.0),
                *strength
            )),
            "{key} {index} alpha"
        );
    }
}

fn by_key<'a>(elements: &'a [rune::ElementInfo], key: &str) -> &'a rune::ElementInfo {
    elements
        .iter()
        .find(|element| element.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("falta {key}"))
}

#[test]
fn a_record_paints_the_purple_flash_with_gpui_geometry_then_expires() {
    // Neo: bleed 6, fila 24, radio 6; número grande de 34 en y 32.
    let mut painter = delta(&settings("bar"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    let mut record = snapshot();
    let car_id = record.state.player.expect("player").car;
    record
        .state
        .cars
        .iter_mut()
        .find(|car| car.id == car_id)
        .expect("player car")
        .best_lap_s = Reliable(99.0);
    painter.update(&record, 0.1);
    assert_eq!(painter.scene.flash, Some(1.0));
    let mut runtime = harness(painter);
    let (width, height) = (runtime.state.size().width, runtime.state.size().height);
    crate::testdata::assert_inside_window(&mut runtime, (width, height));
    let flash = runtime.presented("big-flash").expect("destello");
    assert_eq!(flash.0, [6.0, 37.0, 368.0, 24.0]);

    let mut painter = delta(&settings("bar"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    painter.update(&record, 0.1);
    let style = crate::vantare::Style::compiled();
    let end = 0.1 + f64::from(style.motion.flash_ms) / 1000.0;
    assert!(painter.motion.next_wake(0.1).is_some());
    painter.animate(end);
    assert_eq!(painter.scene.flash, None);
    assert_eq!(painter.motion.next_wake(end), None, "cero despertares");
    let runtime = harness(painter);
    assert!(runtime.presented("big-flash").is_none());
}

#[test]
fn reduced_motion_never_lights_the_flash_or_asks_for_a_clock() {
    let mut painter = Delta::new(&settings("bar"), Preferences::default(), true, 0.0);
    painter.update(&snapshot(), 0.0);
    let mut record = snapshot();
    let car_id = record.state.player.expect("player").car;
    record
        .state
        .cars
        .iter_mut()
        .find(|car| car.id == car_id)
        .expect("player car")
        .best_lap_s = Reliable(99.0);
    painter.update(&record, 0.1);
    assert_eq!(painter.scene.flash, None);
    assert_eq!(painter.motion.next_wake(0.1), None);
}

#[test]
fn the_bar_slides_while_the_delta_changes_and_rests_after_its_ease() {
    let mut painter = delta(&settings("bar"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    let mut moved = snapshot();
    moved.state.player.as_mut().expect("player").delta_best_s = Reliable(0.4);
    painter.update(&moved, 1.0);
    let eased = crate::vantare::Style::compiled().delta.ease_ms / 1000.0;
    assert!(painter.motion.next_wake(1.0).is_some(), "la barra se mueve");
    painter.animate(1.0 + f64::from(eased));
    assert!((painter.scene.bar - 0.4).abs() < 1e-6, "{}", painter.scene.bar);
    assert_eq!(painter.motion.next_wake(1.0 + f64::from(eased)), None);
}

#[test]
fn the_host_applies_five_fifteen_and_twenty_hz_before_paint_and_revocation_removes_delta() {
    for hz in [5, 15, 20] {
        let start = Instant::now();
        let mut layout = Layout::from_json(
            br#"{"version":1,"instances":[{"id":"d","x":0,"y":0,"settings":{"kind":"delta","size":"bar"}}]}"#,
        )
        .expect("layout");
        layout.reduced_motion = Some(true);
        layout.performance.widgets.insert("d".into(), hz);
        let mut frame = FrameScene::new(layout, Access::LocalPreview, true, MotionPolicy(false));
        let bus = Shared::new(true);
        let mut input = snapshot();
        frame.ingest(Photo::full(Arc::new(input.clone())), start);
        bus.publish_frames(Arc::new(frame.frames.clone()));
        let mut runtime = Runtime::with_text(
            host::State::new(bus.clone()),
            host::view,
            (1280.0, 720.0),
            Env::new(true, 1.0),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.poll = Some(host::poll);
        runtime.frame(0.0);
        runtime.settle_all();
        runtime.frame(0.0);
        assert!(runtime.presented("big-number").is_some());
        let mut before = pixels(&runtime);
        let mut count = 0;
        for ms in 1..=1000 {
            input.sequence += 1;
            let mut input = input.clone();
            input.state.player.as_mut().expect("player").delta_best_s =
                Reliable(ms as f64 / 1000.0);
            if frame.ingest(
                Photo::full(Arc::new(input.clone())),
                start + Duration::from_millis(ms),
            ) {
                bus.publish_frames(Arc::new(frame.frames.clone()));
            }
            assert!(!runtime.frame(0.001));
            let after = pixels(&runtime);
            if before != after {
                count += 1;
                before = after;
            }
        }
        assert!(
            count > 0 && count <= hz,
            "{count} changed CPU images at {hz} Hz"
        );
        bus.publish_access(Access::at(&Default::default(), 0));
        runtime.frame(0.0);
        assert!(runtime.presented("big-number").is_none());
    }
}
