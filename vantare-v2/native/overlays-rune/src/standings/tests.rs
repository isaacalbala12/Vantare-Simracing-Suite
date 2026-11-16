use super::*;
use crate::{
    host::{self, Access, Shared},
    scene::Scene,
};
use rune::{Env, Runtime};
use std::time::{Duration, Instant};
use vantare_domain::{
    Quality, SourceState,
    format::Language,
    motion_policy::MotionPolicy,
    widget_settings::{Settings as WidgetSettings, columns::ColumnSetting, look::Tone},
};
use vantare_ipc::{Photo, layout::Layout};

fn snapshot() -> Snapshot {
    vantare_ipc::snapshot_from_saved_json(include_str!(
        "../../../ui/fixtures/standings.snapshot.json"
    ))
    .expect("canonical GPUI snapshot")
}
fn settings() -> Settings {
    Settings {
        design_system: Look::Vantare,
        class_scope: "all-classes".into(),
        row_count: 10,
        ..Default::default()
    }
}
fn column(metric: &str) -> ColumnSetting {
    ColumnSetting {
        id: metric.into(),
        metric_id: metric.into(),
        ..Default::default()
    }
}

#[test]
fn the_vantare_look_uses_domain_rows_gaps_and_selection() {
    let s = settings();
    let input = snapshot();
    let columns = layout::columns(&s, Some(&input));
    let board = standings::project_cached(
        &input,
        Preferences::default(),
        &layout::content(&s, &columns),
        None,
    );
    let plan = Plan::new(board, String::new(), input.sequence);
    let mut painter = Standings::new(&s, Preferences::default());
    assert!(painter.update(&input));
    assert!(
        !painter.scene.display.rows.is_empty(),
        "the original scene must actually paint cars"
    );
    assert_eq!(
        painter
            .scene
            .display
            .rows
            .iter()
            .map(|r| r.id)
            .collect::<Vec<_>>(),
        plan.rows.iter().map(|r| r.id.0).collect::<Vec<_>>()
    );
    for (row, canonical) in painter.scene.display.rows.iter().zip(&plan.rows) {
        let gap = columns
            .iter()
            .filter(|c| c.metric_id != "vehicle")
            .position(|c| c.metric_id == "gap")
            .expect("gap column");
        assert_eq!(row.cells[gap].text, canonical.classification_gap);
    }
    assert!(!painter.update(&input));
}

#[test]
fn pause_keeps_the_last_picture_and_resume_applies_the_new_picture() {
    let mut input = snapshot();
    let mut painter = Standings::new(&settings(), Preferences::default());
    painter.update(&input);
    let before = painter.scene.display.rows.clone();
    let size = painter.size();
    input.state.source_state = SourceState::Paused;
    input.state.cars[0].driver.name = "not a live update".into();
    assert!(painter.update(&input));
    assert_eq!(painter.scene.display.rows, before);
    assert_eq!(painter.size().height, size.height + 22.0);
    assert!(!painter.update(&input));
    input.state.source_state = SourceState::Live;
    assert!(painter.update(&input));
    assert_ne!(painter.scene.display.rows, before);
    assert_eq!(painter.size().height, size.height);
}

#[test]
fn session_columns_formats_duplicate_keys_disabled_and_unknown_columns() {
    let mut s = settings();
    s.columns = Some(vec![
        column("driverName"),
        column("gap"),
        column("gap"),
        ColumnSetting {
            enabled: false,
            ..column("lastLap")
        },
        column("invented"),
    ]);
    s.practice_columns = Some(vec![column("driverName"), column("bestLap")]);
    s.qualifying_columns = Some(vec![
        column("position"),
        column("driverName"),
        column("lastLap"),
    ]);
    let mut input = snapshot();
    let mut painter = Standings::new(
        &s,
        Preferences {
            language: Language::En,
            ..Default::default()
        },
    );
    for (kind, expected) in [
        (
            vantare_domain::SessionKind::Race,
            vec!["position", "driverName", "gap"],
        ),
        (
            vantare_domain::SessionKind::Practice,
            vec!["position", "driverName", "bestLap"],
        ),
        (
            vantare_domain::SessionKind::Qualifying,
            vec!["position", "driverName", "lastLap"],
        ),
    ] {
        input.state.session.kind = Quality::Reliable(kind);
        assert!(painter.update(&input));
        assert_eq!(
            painter
                .scene
                .layout
                .columns
                .iter()
                .map(|c| c.setting.metric_id.as_str())
                .collect::<Vec<_>>(),
            expected
        );
    }
    input.state.cars[0].last_lap_s = Quality::Stale(50.0);
    painter.update(&input);
    let canonical = standings::project(&input, Preferences::default());
    let id = input.state.cars[0].id;
    let row = painter
        .scene
        .display
        .rows
        .iter()
        .find(|r| r.id == id.0)
        .expect("car");
    assert_eq!(
        row.cells[2].text,
        canonical.row(id).expect("projected car").last_lap
    );
}

#[test]
fn sectors_pits_compounds_and_predicted_size_follow_the_projection() {
    let mut input = snapshot();
    input.state.cars[0].current_sectors_s = vec![
        Quality::Reliable(30.0),
        Quality::Unavailable,
        Quality::Unavailable,
    ];
    input.state.cars[0].in_pits = Quality::Reliable(true);
    input.state.cars[0].tyre_compound = Quality::Reliable(vantare_domain::TyreCompound::Soft);
    let s = Settings {
        classification_mode: "multiclass".into(),
        columns: Some(vec![
            column("driverName"),
            column("pit"),
            column("sectors"),
            column("tireCompound"),
        ]),
        ..settings()
    };
    let mut painter = Standings::new(&s, Preferences::default());
    let predicted = painter.size_for(Some(&input));
    assert!(painter.update(&input));
    assert_eq!(
        painter.size(),
        predicted,
        "placement uses the first useful size, including class bands"
    );
    let row = painter
        .scene
        .display
        .rows
        .iter()
        .find(|r| r.id == input.state.cars[0].id.0)
        .expect("visible car");
    assert!(
        row.cells
            .iter()
            .any(|c| c.text == "BOX" && c.fill.is_some())
    );
    assert!(row.cells.iter().any(|c| c.text == "S" && c.fill.is_some()));
    assert!(row.cells.iter().any(|c| c.segments.len() == 3));
}

fn live_runtime(bus: Arc<Shared>) -> Runtime<host::State> {
    let mut runtime = Runtime::with_text(
        host::State::new(bus),
        host::view,
        (1920.0, 1080.0),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter W400", "Inter W400")),
    );
    runtime.poll = Some(host::poll);
    runtime
}
fn payload(runtime: &Runtime<host::State>) -> Vec<[[u32; 4]; 8]> {
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
fn layout(hz: u16) -> Layout {
    let mut design = Layout::from_json(
        br#"{"version":1,"instances":[{"id":"s","x":0,"y":0,"settings":{"kind":"standings"}}]}"#,
    )
    .expect("layout");
    design.instances[0].settings = WidgetSettings::Standings(settings());
    design.performance.widgets.insert("s".into(), hz);
    design
}

#[test]
fn thirty_seconds_of_sequences_and_hidden_data_produce_zero_new_cpu_images() {
    let start = Instant::now();
    let bus = Shared::new(true);
    let mut scene = Scene::new(layout(20), Access::LocalPreview, true, MotionPolicy(false));
    let mut input = snapshot();
    scene.ingest(Photo::full(Arc::new(input.clone())), start);
    bus.publish_frames(Arc::new(scene.frames.clone()));
    let mut runtime = live_runtime(bus.clone());
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    let before = payload(&runtime);
    assert!(
        runtime
            .elements()
            .iter()
            .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("car-"))),
        "exercise the connected Standings, not an empty host"
    );
    for n in 1..=300 {
        input.sequence += 1;
        input.state.cars[0].relative_s = Quality::Reliable(f64::from(n)); // Not displayed by Standings.
        scene.ingest(
            Photo::full(Arc::new(input.clone())),
            start + Duration::from_millis(n as u64 * 100),
        );
        bus.publish_frames(Arc::new(scene.frames.clone()));
        assert!(!runtime.frame(0.1));
        assert_eq!(
            payload(&runtime),
            before,
            "actual Rune painter stream, not a frame counter mock"
        );
    }
    bus.publish_access(Access::at(&Default::default(), 0));
    runtime.frame(0.0);
    assert!(
        !runtime
            .elements()
            .iter()
            .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("car-")))
    );
}

#[test]
fn visible_data_never_paints_faster_than_the_host_widget_cadence() {
    for hz in [5, 15, 20] {
        let start = Instant::now();
        let mut scene = Scene::new(layout(hz), Access::LocalPreview, true, MotionPolicy(false));
        let bus = Shared::new(true);
        let mut input = snapshot();
        scene.ingest(Photo::full(Arc::new(input.clone())), start);
        bus.publish_frames(Arc::new(scene.frames.clone()));
        let mut runtime = live_runtime(bus.clone());
        runtime.frame(0.0);
        runtime.settle_all();
        runtime.frame(0.0);
        let mut before = payload(&runtime);
        assert!(
            runtime
                .elements()
                .iter()
                .any(|e| e.key.as_deref().is_some_and(|k| k.starts_with("car-")))
        );
        let mut images = 0;
        for ms in 1..=1000 {
            input.sequence += 1;
            input.state.cars[0].driver.name = format!("Driver {ms}");
            if scene.ingest(
                Photo::full(Arc::new(input.clone())),
                start + Duration::from_millis(ms),
            ) {
                bus.publish_frames(Arc::new(scene.frames.clone()));
            }
            assert!(!runtime.frame(0.001));
            let after = payload(&runtime);
            if before != after {
                images += 1;
                before = after;
            }
        }
        assert!(images > 0 && images <= hz, "hz={hz},images={images}");
    }
}

#[test]
fn a_repeated_photo_or_a_new_sequence_alone_does_not_repaint() {
    let mut painter = Standings::new(&settings(), Preferences::default());
    let input = snapshot();
    assert!(painter.update(&input), "la primera foto compone");
    assert!(!painter.update(&input), "la misma foto no repinta");
    let mut newer = input.clone();
    newer.sequence += 1;
    assert!(
        !painter.update(&newer),
        "cambiar solo la secuencia no repinta"
    );
    newer.state.cars[0].relative_s = Quality::Reliable(99.0);
    assert!(
        !painter.update(&newer),
        "un dato que este overlay no pinta no repinta"
    );
    newer.state.cars[0].driver.name = "Visible Change".into();
    assert!(painter.update(&newer), "un texto visible sí repinta");
    assert!(!painter.update(&newer), "y solo una vez");
}

fn widget_runtime(painter: Standings, window: (f32, f32)) -> Runtime<Standings> {
    fn view(painter: &Standings, _: &mut rune::Cx<Standings>) -> El {
        painter.view()
    }
    Runtime::with_text(
        painter,
        view,
        window,
        Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
    )
}

#[test]
fn no_layer_falls_outside_the_window_in_any_template_size_or_state() {
    for template in ["signature", "broadcast"] {
        for tone in [Tone::Neo, Tone::Neutro] {
            for rows in [1, 10, 30] {
                for state in 0..3 {
                    let s = Settings {
                        template_id: template.into(),
                        style: tone,
                        row_count: rows,
                        classification_mode: "multiclass".into(),
                        ..settings()
                    };
                    let mut painter = Standings::new(&s, Preferences::default());
                    let mut input = snapshot();
                    match state {
                        1 => input.state.source_state = SourceState::Waiting,
                        2 => {
                            assert!(painter.update(&input), "la imagen viva entra antes");
                            input.state.source_state = SourceState::Paused;
                        }
                        _ => {}
                    }
                    painter.update(&input);
                    let size = painter.size();
                    let mut runtime = widget_runtime(painter, (size.width, size.height));
                    runtime.frame(0.0);
                    crate::testdata::assert_inside_window(&mut runtime, (size.width, size.height));
                }
            }
        }
    }
}

/// Intercambia la posición de dos coches de la foto: el orden del tablero cambia.
fn swap_positions(input: &mut Snapshot, a: usize, b: usize) {
    let first = input.state.cars[a].position;
    input.state.cars[a].position = input.state.cars[b].position;
    input.state.cars[b].position = first;
}

#[test]
fn reordering_rows_jump_and_leave_no_clock() {
    let start = Instant::now();
    let mut scene = Scene::new(layout(20), Access::LocalPreview, true, MotionPolicy(false));
    let bus = Shared::new(true);
    let mut input = snapshot();
    scene.ingest(Photo::full(Arc::new(input.clone())), start);
    bus.publish_frames(Arc::new(scene.frames.clone()));
    let mut runtime = live_runtime(bus.clone());
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    let before = payload(&runtime);
    let y_before = runtime.presented("car-2").expect("fila pintada").0[1];
    assert!(runtime.wake_deadline().is_none(), "en reposo no hay reloj");
    swap_positions(&mut input, 1, 2);
    input.sequence += 1;
    assert!(scene.ingest(
        Photo::full(Arc::new(input.clone())),
        start + Duration::from_millis(200)
    ));
    bus.publish_frames(Arc::new(scene.frames.clone()));
    runtime.frame(0.2);
    assert_ne!(payload(&runtime), before, "el reordenamiento se pinta");
    let row = crate::vantare::Style::compiled().geometry.row_height;
    let y_after = runtime.presented("car-2").expect("fila pintada").0[1];
    assert!(
        (y_after - y_before - row).abs() < 0.01,
        "la fila salta una fila entera: {y_before} -> {y_after}, alto {row}"
    );
    assert!(
        runtime.wake_deadline().is_none(),
        "sin movimiento no queda reloj"
    );
    let stable = payload(&runtime);
    runtime.frame(0.016);
    assert_eq!(payload(&runtime), stable, "y no hay transición detrás");
    assert!(runtime.wake_deadline().is_none());
}
