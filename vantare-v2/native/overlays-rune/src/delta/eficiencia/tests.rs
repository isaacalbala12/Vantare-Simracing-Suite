use super::*;
use rune::{Env, Runtime};
use vantare_domain::{Quality::Reliable, SourceState};

fn settings(template: &str) -> Settings {
    Settings {
        design_system: Look::Eficiencia,
        template_id: template.into(),
        ..Settings::eficiencia()
    }
}

fn delta(settings: &Settings) -> DeltaEficiencia {
    DeltaEficiencia::new(settings, Preferences::default(), false, 0.0)
}

fn harness(widget: DeltaEficiencia) -> Runtime<DeltaEficiencia> {
    let mut runtime = Runtime::with_text(
        widget,
        |widget: &DeltaEficiencia, _| widget.view(),
        (WIDTH, HEIGHT),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::eficiencia::FONTS, ("Inter W400", "Inter W400")),
    );
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    runtime
}

fn by_key<'a>(elements: &'a [rune::ElementInfo], key: &str) -> &'a rune::ElementInfo {
    elements
        .iter()
        .find(|element| element.key.as_deref() == Some(key))
        .unwrap_or_else(|| panic!("falta {key}"))
}

#[test]
fn both_templates_keep_the_frozen_box_and_rebuild_on_change() {
    for template in ["instrument", "capsule"] {
        let widget = delta(&settings(template));
        assert_eq!((widget.size().width, widget.size().height), (280.0, 96.0));
        assert!(!<DeltaEficiencia as Widget>::configured(
            &widget,
            &WidgetSettings::Delta(Settings {
                reference: "optimal".into(),
                ..settings(template)
            }),
            Preferences::default()
        ));
        assert!(<DeltaEficiencia as Widget>::configured(
            &widget,
            &WidgetSettings::Delta(settings(template)),
            Preferences::default()
        ));
    }
}

#[test]
fn value_and_track_sit_at_the_gpui_baselines() {
    let mut widget = delta(&settings("instrument"));
    widget.update(&crate::testdata::snapshot(), 0.0);
    let runtime = harness(widget);
    let elements = runtime.elements();
    let value = by_key(&elements, "delta-value");
    assert_eq!(value.rect[1], 17.5, "base 43,5 menos ascenso 26");
    let track = by_key(&elements, "delta-track");
    assert_eq!(track.rect, [16.0, 68.0, 248.0, 5.0]);
}

#[test]
fn sequence_changes_do_not_repaint() {
    let mut widget = delta(&settings("instrument"));
    let mut snapshot = crate::testdata::snapshot();
    widget.update(&snapshot, 0.0);
    snapshot.sequence += 1;
    assert!(!widget.update(&snapshot, 0.1).build);
}

#[test]
fn a_record_shows_its_notice_and_expires_without_a_clock() {
    let mut widget = delta(&settings("instrument"));
    let mut slow = crate::testdata::snapshot();
    slow.state.capabilities.lap_times = vantare_domain::Capability::Fresh;
    slow.state.capabilities.delta = vantare_domain::Capability::Fresh;
    slow.state.player.as_mut().expect("player").delta_best_s = Reliable(-0.2);
    let car_id = slow.state.player.expect("player").car;
    let car = slow
        .state
        .cars
        .iter_mut()
        .find(|car| car.id == car_id)
        .expect("player car");
    car.best_lap_s = Reliable(100.0);
    widget.update(&slow, 0.0);
    let mut record = slow.clone();
    record
        .state
        .cars
        .iter_mut()
        .find(|car| car.id == car_id)
        .expect("player car")
        .best_lap_s = Reliable(99.0);
    widget.update(&record, 1.0);
    assert_eq!(widget.scene.event, Some(vantare_domain::delta::Event::PersonalBest));
    assert!(widget.motion.next_wake_full(1.0).is_some());
    widget.animate(1.0 + 4.18);
    assert_eq!(widget.scene.event, None);
    assert_eq!(widget.motion.next_wake_full(1.0 + 4.18), None);
}

#[test]
fn reduced_motion_keeps_the_notice_without_frames_and_settles_the_fill() {
    let snapshot = crate::testdata::snapshot();
    let mut widget = DeltaEficiencia::new(
        &settings("instrument"),
        Preferences::default(),
        true,
        0.0,
    );
    widget.update(&snapshot, 0.0);
    assert!(!widget.scene.event.is_some());
    assert_eq!(widget.motion.next_wake_full(0.0), None);
    widget.policy(false, 0.1);
    widget.policy(true, 0.2);
    assert_eq!(widget.scene.event, None, "settle limpia los avisos");
}

#[test]
fn every_state_and_template_stays_inside_the_window() {
    for template in ["instrument", "capsule"] {
        for state in [
            SourceState::Live,
            SourceState::Paused,
            SourceState::Waiting,
            SourceState::Lost,
        ] {
            let mut snapshot = crate::testdata::snapshot();
            snapshot.state.source_state = state;
            let mut widget = delta(&settings(template));
            widget.update(&snapshot, 0.0);
            let mut runtime = harness(widget);
            crate::testdata::assert_inside_window(&mut runtime, (WIDTH, HEIGHT));
        }
    }
}
