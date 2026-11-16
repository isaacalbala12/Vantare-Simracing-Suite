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

fn changed(update: Update) -> bool {
    update.build || update.pixels
}

fn runtime(painter: Delta) -> Runtime<Delta> {
    let size = painter.size();
    let mut runtime = Runtime::with_text(
        painter,
        |painter: &Delta, _| painter.view(),
        (size.width, size.height),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
    );
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
        let mut painter = Delta::new(&settings, Preferences::default());
        assert!(changed(painter.update(&input, 0.0)), "{name}");
        let board = project(&settings, &input, Preferences::default());
        assert_eq!(board.phase, Phase::Live, "simulated {name} is available");
        assert_eq!(
            painter.scene.labels.number,
            board.delta_text().replace('-', "−")
        );
        assert!(painter.scene.labels.title.ends_with(&name.to_uppercase()));
        assert!(!changed(painter.update(&input, 0.1)));
    }
    let mut missing = input.clone();
    missing.state.cars[0].best_lap_s = Unavailable;
    let mut painter = Delta::new(
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
    for (size, width) in [("pill", 152.0), ("bar", 380.0), ("expanded", 768.0)] {
        let mut painter = Delta::new(&settings(size), Preferences::default());
        painter.update(&input, 0.0);
        assert_eq!(painter.size().width, width, "{size}");
        let mut paused = input.clone();
        paused.state.source_state = SourceState::Paused;
        assert_eq!(painter.size_for(Some(&paused)), painter.size(), "{size}");
    }
    let pill = Delta::new(&settings("pill"), Preferences::default());
    assert_eq!(pill.size().height, 40.0);
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
    let mut painter = Delta::new(&settings("bar"), Preferences::default());
    painter.update(&snapshot(), 0.0);
    let mut runtime = runtime(painter);
    let fill = runtime.presented("bar-fill").expect("painted bar");
    let [x, _, w, _] = fill.0;
    assert!(w > 0.0);
    assert!(x < 380.0 / 2.0, "negativo a la izquierda");
    let _ = fill;
    let mut positive = snapshot();
    positive.state.player.as_mut().expect("player").delta_best_s = Reliable(0.4);
    runtime.state.update(&positive, 0.1);
    runtime.frame(0.0);
    let fill = runtime.presented("bar-fill").expect("positive bar");
    assert!(fill.0[0] >= 380.0 / 2.0, "positivo a la derecha");
    runtime.state.update(&snapshot(), 0.2);
    runtime.frame(0.0);
    assert!(runtime.presented("bar-center").is_some());
    assert!(runtime.wake_deadline().is_none(), "sin reloj");
}

#[test]
fn thirty_seconds_of_sequences_and_hidden_lap_times_leave_actual_cpu_pixels_unchanged() {
    for size in ["pill", "bar", "expanded"] {
        let mut input = snapshot();
        let mut painter = Delta::new(&settings(size), Preferences::default());
        painter.update(&input, 0.0);
        let mut runtime = runtime(painter);
        assert!(
            runtime.presented("header-title").is_none(),
            "la píldora no lleva cabecera"
        );
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
            let mut painter = Delta::new(&settings(size), Preferences::default());
            painter.update(&input, 0.0);
            let (width, height) = (painter.size().width, painter.size().height);
            let mut runtime = runtime(painter);
            crate::testdata::assert_inside_window(&mut runtime, (width, height));
        }
    }
}

#[test]
fn configured_rebuilds_for_every_visible_setting_and_language() {
    let prefs = Preferences::default();
    let painter = Delta::new(&settings("bar"), prefs);
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
