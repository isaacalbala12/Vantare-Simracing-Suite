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
    widget_settings::{
        Settings as WidgetSettings,
        columns::ColumnSetting,
        look::{Look, Tone},
    },
};
use vantare_ipc::{Photo, layout::Layout};

fn snapshot() -> Snapshot {
    vantare_ipc::snapshot_from_saved_json(include_str!(
        "../../../ui/fixtures/standings.snapshot.json"
    ))
    .expect("canonical GPUI snapshot")
}
fn settings(look: Look) -> Settings {
    Settings {
        design_system: look,
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
fn both_looks_use_domain_rows_gaps_quality_and_selection() {
    for look in [Look::Vantare, Look::Eficiencia] {
        let s = settings(look);
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
            !painter.display.rows.is_empty(),
            "the original scene must actually paint cars"
        );
        assert_eq!(
            painter
                .display
                .rows
                .iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            plan.rows.iter().map(|r| r.id.0).collect::<Vec<_>>()
        );
        for (row, canonical) in painter.display.rows.iter().zip(&plan.rows) {
            let gap = columns
                .iter()
                .filter(|c| c.metric_id != "vehicle")
                .position(|c| c.metric_id == "gap")
                .expect("gap column");
            assert_eq!(row.cells[gap].text, canonical.classification_gap);
        }
        assert!(!painter.update(&input));
    }
}

#[test]
fn pause_keeps_the_last_picture_and_resume_applies_the_new_picture() {
    for look in [Look::Vantare, Look::Eficiencia] {
        let mut input = snapshot();
        let mut painter = Standings::new(&settings(look), Preferences::default());
        painter.update(&input);
        let before = painter.display.rows.clone();
        let size = painter.size();
        input.state.source_state = SourceState::Paused;
        input.state.cars[0].driver.name = "not a live update".into();
        assert!(painter.update(&input));
        assert_eq!(painter.display.rows, before);
        assert_eq!(painter.size().height, size.height + 22.0);
        assert!(!painter.update(&input));
        input.state.source_state = SourceState::Live;
        assert!(painter.update(&input));
        assert_ne!(painter.display.rows, before);
        assert_eq!(painter.size().height, size.height);
    }
}

#[test]
fn session_columns_formats_duplicate_keys_disabled_and_unknown_columns() {
    let mut s = settings(Look::Eficiencia);
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
        (vantare_domain::SessionKind::Race, vec!["driverName", "gap"]),
        (
            vantare_domain::SessionKind::Practice,
            vec!["driverName", "bestLap"],
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
    for look in [Look::Vantare, Look::Eficiencia] {
        let s = Settings {
            classification_mode: "multiclass".into(),
            columns: Some(vec![
                column("driverName"),
                column("pit"),
                column("sectors"),
                column("tireCompound"),
            ]),
            ..settings(look)
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
        if look == Look::Vantare {
            assert!(row.cells.iter().any(|c| c.text == "S" && c.fill.is_some()));
            assert!(row.cells.iter().any(|c| c.segments.len() == 3));
        } else {
            assert!(
                !painter
                    .layout
                    .columns
                    .iter()
                    .any(|c| matches!(c.setting.metric_id.as_str(), "sectors" | "tireCompound")),
                "Eficiencia follows its existing column catalogue"
            );
        }
    }
}

#[test]
fn cpu_capture_uses_the_track_tree_at_three_scales_and_never_clips_rows() {
    for look in [Look::Vantare, Look::Eficiencia] {
        for tone in [Tone::Neo, Tone::Neutro] {
            for scale in [1.0, 1.25, 1.5] {
                let s = Settings {
                    style: tone,
                    classification_mode: "multiclass".into(),
                    ..settings(look)
                };
                let mut capture = capture::prepare(&s, Preferences::default(), &snapshot(), scale)
                    .expect("capture size");
                let size = capture.size;
                let image = capture::render_with::<crate::offscreen::Error>(
                    &mut capture,
                    |runtime, size| {
                        for row in &runtime.state.display.rows {
                            let rect = runtime
                                .presented(&format!("car-{}", row.id))
                                .expect("actual CPU row")
                                .0;
                            assert!(
                                rect[1] + rect[3]
                                    <= size.logical().1 - runtime.state.layout.footer + 0.01
                            );
                        }
                        Ok(vec![
                            0;
                            size.pixels().0 as usize * size.pixels().1 as usize * 4
                        ])
                    },
                )
                .expect("fake pixels");
                assert_eq!(image.size, size);
                for _ in 0..300 {
                    assert!(!capture.runtime.frame(0.1), "no idle animation");
                }
            }
        }
    }
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
fn layout(look: Look, hz: u16) -> Layout {
    let mut design = Layout::from_json(
        br#"{"version":1,"instances":[{"id":"s","x":0,"y":0,"settings":{"kind":"standings"}}]}"#,
    )
    .expect("layout");
    design.instances[0].settings = WidgetSettings::Standings(settings(look));
    design.performance.widgets.insert("s".into(), hz);
    design
}

#[test]
fn thirty_seconds_of_sequences_and_hidden_data_produce_zero_new_cpu_images() {
    for look in [Look::Vantare, Look::Eficiencia] {
        let start = Instant::now();
        let bus = Shared::new(true);
        let mut scene = Scene::new(
            layout(look, 20),
            Access::LocalPreview,
            true,
            MotionPolicy(false),
        );
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
}

#[test]
fn visible_data_never_paints_faster_than_the_host_widget_cadence() {
    for look in [Look::Vantare, Look::Eficiencia] {
        for hz in [5, 15, 20] {
            let start = Instant::now();
            let mut scene = Scene::new(
                layout(look, hz),
                Access::LocalPreview,
                true,
                MotionPolicy(false),
            );
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
            assert!(
                images > 0 && images <= hz,
                "look={look:?},hz={hz},images={images}"
            );
        }
    }
}
