use super::control::Eficiencia;
use crate::widget::Widget;
use std::sync::Arc;
use vantare_domain::{
    SourceState,
    format::Preferences,
    widget_settings::{Settings, look::Look, standings::Settings as Config},
};

#[test]
fn registered_efficiency_paints_literal_rows_and_ignores_only_metadata() {
    let config = Config {
        design_system: Look::Eficiencia,
        row_count: 10,
        ..Config::default()
    };
    let settings = Settings::Standings(config.clone());
    let mut widget = Eficiencia::new(&config, Preferences::default());
    let mut photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    assert!(crate::renderer::constructor(&settings).is_some());
    assert!(widget.update(&photo, 0.0).build);
    assert!(!widget.update(&photo, 0.1).build);
    photo.sequence += 1;
    assert!(!widget.update(&photo, 0.2).build);
    photo.state.source_state = SourceState::Stale;
    assert!(
        widget.update(&photo, 0.3).build,
        "mismo sequence, otra escena"
    );
    assert!(
        !widget.animate(1.0).build,
        "E5 añadirá el reloj de transición"
    );
    let size = widget.size();
    let mut runtime = rune::Runtime::with_text(
        widget,
        |s, _| s.view(),
        (size.width, size.height),
        rune::Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::eficiencia::FONTS, ("Inter W400", "Inter W400")),
    );
    runtime.frame(0.0);
    let texts: Vec<_> = runtime
        .elements()
        .into_iter()
        .filter_map(|e| e.text)
        .collect();
    for value in ["VANTARE", "ANDRÉ LOTTERER", "1", "4", "1:49.667"] {
        assert!(texts.iter().any(|v| v == value), "{value}: {texts:?}");
    }
    crate::testdata::assert_inside_window(&mut runtime, (size.width, size.height));
}

#[test]
fn pause_retains_live_projection_and_adds_only_the_twenty_two_pixel_host_band() {
    let mut widget = Eficiencia::new(&Config::default(), Preferences::default());
    let mut photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    widget.update(&photo, 0.0);
    let live = widget.size();
    let plan = widget.visual.content_plan.clone();
    photo.state.source_state = SourceState::Paused;
    assert!(widget.update(&photo, 0.1).build);
    assert!(Arc::ptr_eq(&plan, &widget.visual.content_plan));
    assert_eq!(widget.size().height, live.height + 22.0);
    assert!(!widget.update(&photo, 0.2).build);
    assert!(!widget.policy(true, 20, 0.3).build);
}

#[test]
fn size_for_predicts_the_gpui_multiclass_bands_before_the_first_paint() {
    let settings = Config {
        row_count: 10,
        classification_mode: "multiclass".into(),
        class_scope: "all-classes".into(),
        ..Config::eficiencia()
    };
    let mut widget = Eficiencia::new(&settings, Preferences::default());
    let photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    let predicted = widget.size_for(Some(&photo));
    assert_eq!((predicted.width, predicted.height), (440.0, 448.0)); // 364 + 3*28.
    widget.update(&photo, 0.0);
    assert_eq!(widget.size(), predicted);
}

#[test]
fn session_column_changes_predict_the_pit_rail_and_keep_the_gpui_projection_flags() {
    use vantare_domain::{Quality, SessionKind, widget_settings::columns::ColumnSetting};
    let settings = Config {
        row_count: 10,
        practice_columns: Some(
            [("driverName", "sm"), ("lastLap", "md"), ("pit", "auto")]
                .into_iter()
                .map(|(metric, preset)| ColumnSetting {
                    metric_id: metric.into(),
                    width_preset: preset.into(),
                    ..ColumnSetting::default()
                })
                .collect(),
        ),
        ..Config::eficiencia()
    };
    let mut widget = Eficiencia::new(&settings, Preferences::default());
    let mut photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    widget.update(&photo, 0.0);
    photo.state.session.kind = Quality::Reliable(SessionKind::Practice);
    let predicted = widget.size_for(Some(&photo));
    assert!(widget.update(&photo, 0.1).build);
    assert_eq!(widget.size(), predicted);
    assert_eq!(predicted.width, 304.0); // Driver 188 + LastLap 82 + rail 34.
    assert!(widget.visual.plan.pit_enabled);
    assert!(!widget.visual.content_plan.board.content.lap_visible);
    assert!(!widget.visual.content_plan.board.content.interval_visible);
}

#[test]
fn reduced_and_normal_static_rows_leave_no_animation_clock_before_e5() {
    for reduced in [false, true] {
        let settings = Config::eficiencia();
        let mut widget = Eficiencia::new(&settings, Preferences::default());
        let photo = vantare_ipc::snapshot_from_json(include_str!(
            "../../../../ui/fixtures/standings.snapshot.json"
        ))
        .unwrap();
        widget.policy(reduced, 20, 0.0);
        widget.update(&photo, 0.0);
        let size = widget.size();
        let mut rt = rune::Runtime::with_text(
            widget,
            |s, _| s.view(),
            (size.width, size.height),
            rune::Env::new(reduced, 1.0),
            rune::text::TextSystem::new(crate::eficiencia::FONTS, ("Inter W400", "Inter W400")),
        );
        rt.poll = Some(|s, clock, tx| {
            s.schedule(clock, tx);
            false
        });
        rt.frame(0.0);
        assert!(rt.wake_deadline().is_none());
        assert!(!rt.state.update(&photo, 1.0).build);
        assert!(!rt.state.animate(1.0).build);
        rt.frame(1.0);
        assert!(rt.wake_deadline().is_none());
    }
}

#[test]
fn source_identity_resets_the_scene_without_using_sequence_as_a_projection_key() {
    let mut widget = Eficiencia::new(&Config::eficiencia(), Preferences::default());
    let mut photo = vantare_ipc::snapshot_from_json(include_str!(
        "../../../../ui/fixtures/standings.snapshot.json"
    ))
    .unwrap();
    widget.update(&photo, 0.0);
    let previous = widget.visual.content_plan.identity.clone();
    photo.epoch += 1;
    assert!(widget.update(&photo, 0.1).build);
    assert_ne!(widget.visual.content_plan.identity, previous);
    photo.sequence += 1;
    assert!(!widget.update(&photo, 0.2).build);
    photo.state.source_state = SourceState::Lost;
    assert!(
        widget.update(&photo, 0.3).build,
        "Lost llega con la misma secuencia"
    );
}
