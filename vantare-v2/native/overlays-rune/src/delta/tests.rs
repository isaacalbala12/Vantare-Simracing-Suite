use super::*;
use crate::{
    host::{self, Access, Shared},
    scene::Scene,
};
use rune::{Cx, Env, Runtime};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use vantare_domain::{Quality::Reliable, motion_policy::MotionPolicy};
use vantare_ipc::{Photo, layout::Layout};

fn snapshot() -> Snapshot {
    let mut s = vantare_ipc::source::fixed();
    s.state.capabilities.delta = vantare_domain::Capability::Fresh;
    // source::fixed is a standings scene: it has no class leader or lap times.
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

#[test]
fn values_and_reference_come_from_the_canonical_projection() {
    let input = snapshot();
    for reference_name in ["best", "optimal", "leader"] {
        let settings = Settings {
            reference: reference_name.into(),
            ..settings("bar")
        };
        let mut painter = Delta::new(&settings, Preferences::default(), false);
        assert!(changed(painter.update(&input, 0.0)), "{reference_name}");
        let board = delta::project_reference(&input, Preferences::default(), reference(&settings));
        assert_eq!(
            board.phase,
            Phase::Live,
            "simulated {reference_name} is available"
        );
        assert_eq!(painter.board, board);
        assert_eq!(
            painter.labels[1].get().as_ref(),
            board.delta_text().replace('-', "−")
        );
        assert!(!changed(painter.update(&input, 0.1)));
    }
    let mut missing = input.clone();
    missing.state.cars[0].best_lap_s = vantare_domain::Quality::Unavailable;
    let mut painter = Delta::new(
        &Settings {
            reference: "leader".into(),
            ..settings("bar")
        },
        Preferences::default(),
        false,
    );
    painter.update(&missing, 0.0);
    assert_eq!(painter.board.phase, Phase::NoReference);
    assert_eq!(painter.labels[1].get().as_ref(), "-.---");
    assert!(!changed(painter.update(&missing, 0.1)));
}

#[test]
fn the_bar_finishes_and_reduced_motion_and_hidden_bars_do_not_request_animation() {
    for size in ["pill", "bar", "expanded"] {
        let mut painter = Delta::new(&settings(size), Preferences::default(), false);
        let mut input = snapshot();
        painter.update(&input, 0.0);
        input.state.player.as_mut().expect("player").delta_best_s = Reliable(0.6);
        painter.update(&input, 1.0);
        assert_eq!(painter.motion.active(1.01), size != "pill");
        painter.animate(2.0);
        assert!(!painter.motion.active(2.0));
        assert!(!changed(painter.animate(30.0)));
        input.state.player.as_mut().expect("player").delta_best_s = Reliable(-0.5);
        painter.update(&input, 31.0);
        painter.policy(true, 31.01);
        assert!(!painter.motion.active(31.01));
        assert!(!changed(painter.animate(32.0)));
    }
}

#[test]
fn source_pause_retains_the_last_picture_and_a_new_epoch_cannot_animate_from_old_data() {
    let mut input = snapshot();
    let mut painter = Delta::new(&settings("bar"), Preferences::default(), false);
    painter.update(&input, 0.0);
    let before = painter.labels[1].get();
    input.state.source_state = SourceState::Paused;
    input.state.player.as_mut().expect("player").delta_best_s = Reliable(2.0);
    assert!(painter.update(&input, 1.0).build);
    assert_eq!(painter.labels[1].get(), before);
    assert!(!changed(painter.update(&input, 2.0)));
    input.state.source_state = SourceState::Live;
    input.epoch += 1;
    assert!(changed(painter.update(&input, 3.0)));
    assert!(!painter.motion.active(3.0));
    input.state.source_state = SourceState::Lost;
    painter.update(&input, 4.0);
    assert_eq!(painter.labels[1].get().as_ref(), "-.---");
}

fn draw(p: &Delta, _: &mut Cx<Delta>) -> El {
    p.view()
}
#[test]
fn the_live_bar_has_real_cpu_geometry_and_reaches_its_target() {
    let mut painter = Delta::new(&settings("bar"), Preferences::default(), false);
    painter.update(&snapshot(), 0.0);
    let size = painter.size();
    let expected = painter.bar.get();
    let mut runtime = Runtime::with_text(
        painter,
        draw,
        (size.width, size.height),
        Env::new(true, 1.0),
        rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
    );
    runtime.frame(0.0);
    runtime.settle_all();
    runtime.frame(0.0);
    assert_eq!(
        runtime.presented("bar-fill").expect("painted bar").0,
        snapped_rect(expected)
    );
    let mut input = snapshot();
    input.state.player.as_mut().expect("player").delta_best_s = Reliable(0.7);
    runtime.state.update(&input, 1.0);
    runtime.state.animate(2.0);
    runtime.frame(0.0);
    assert_eq!(
        runtime.presented("bar-fill").expect("updated bar").0,
        snapped_rect(runtime.state.bar.get())
    );
    assert!(runtime.state.bar.get()[2] > 0.0);
}
fn snapped_rect([x, y, w, h]: [f32; 4]) -> [f32; 4] {
    // Pinned Rune rounds both edges to 1/64 device pixel (rune-motion/src/snap.rs).
    let [left, top, right, bottom] = [x, y, x + w, y + h].map(|v| (v * 64.0).round() / 64.0);
    [left, top, right - left, bottom - top]
}
#[test]
fn thirty_seconds_of_sequences_and_hidden_lap_times_leave_actual_cpu_pixels_unchanged() {
    for size in ["pill", "bar", "expanded"] {
        let mut input = snapshot();
        let mut painter = Delta::new(&settings(size), Preferences::default(), false);
        painter.update(&input, 0.0);
        let size = painter.size();
        let mut runtime = Runtime::with_text(
            painter,
            draw,
            (size.width, size.height),
            Env::new(true, 1.25),
            rune::text::TextSystem::new(crate::vantare::FONTS, ("Inter", "Inter")),
        );
        runtime.frame(0.0);
        runtime.settle_all();
        runtime.frame(0.0);
        assert!(runtime.presented("delta-number").is_some());
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
            assert_eq!(pixels(&runtime), before);
        }
    }
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
fn the_host_applies_five_fifteen_and_twenty_hz_before_paint_and_revocation_removes_delta() {
    for hz in [5, 15, 20] {
        let start = Instant::now();
        let mut layout=Layout::from_json(br#"{"version":1,"instances":[{"id":"d","x":0,"y":0,"settings":{"kind":"delta","size":"bar"}}]}"#).expect("layout");
        layout.reduced_motion = Some(true);
        layout.performance.widgets.insert("d".into(), hz);
        let mut scene = Scene::new(layout, Access::LocalPreview, true, MotionPolicy(false));
        let bus = Shared::new(true);
        let mut input = snapshot();
        scene.ingest(Photo::full(Arc::new(input.clone())), start);
        bus.publish_frames(Arc::new(scene.frames.clone()));
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
        assert!(runtime.presented("delta-number").is_some());
        let mut before = pixels(&runtime);
        let mut count = 0;
        for ms in 1..=1000 {
            input.sequence += 1;
            input.state.player.as_mut().expect("player").delta_best_s =
                Reliable(ms as f64 / 1000.0);
            if scene.ingest(
                Photo::full(Arc::new(input.clone())),
                start + Duration::from_millis(ms),
            ) {
                bus.publish_frames(Arc::new(scene.frames.clone()));
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
        assert!(runtime.presented("delta-number").is_none());
    }
}
