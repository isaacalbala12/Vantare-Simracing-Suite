use std::time::{Duration, Instant};
use vantare_installer::motion::{
    INSTALL_MILESTONES, Meter, REMOVE_MILESTONES, approach, back_out, creep, delayed, ease_out,
};

fn run(meter: &mut Meter, start: Instant, from_ms: u64, to_ms: u64) {
    for ms in (from_ms..=to_ms).step_by(16) {
        meter.tick(
            start + Duration::from_millis(ms),
            &INSTALL_MILESTONES,
            false,
        );
    }
}

#[test]
fn creep_never_reaches_the_next_engine_milestone() {
    assert!((creep(40, &INSTALL_MILESTONES, Duration::ZERO) - 40.).abs() < f32::EPSILON);
    let long = creep(40, &INSTALL_MILESTONES, Duration::from_hours(1));
    assert!(long < 54. && long > 50., "{long}");
    assert!(creep(88, &REMOVE_MILESTONES, Duration::from_hours(1)) < 100.);
    // Past the last milestone the bar stays on the real value.
    assert!((creep(100, &INSTALL_MILESTONES, Duration::from_mins(1)) - 100.).abs() < 1e-3);
}

#[test]
fn a_jump_is_followed_smoothly_and_never_backwards() {
    let start = Instant::now();
    let mut meter = Meter::new(start);
    meter.report(54, start);
    meter.tick(
        start + Duration::from_millis(16),
        &INSTALL_MILESTONES,
        false,
    );
    let first = meter.shown();
    assert!(
        first > 0. && first < 20.,
        "a 54 % jump must not land in one frame: {first}"
    );
    let mut previous = first;
    for ms in (32..=1200).step_by(16) {
        meter.tick(
            start + Duration::from_millis(ms),
            &INSTALL_MILESTONES,
            false,
        );
        assert!(meter.shown() >= previous);
        assert!(meter.shown() - previous < 8., "per-frame step too large");
        previous = meter.shown();
    }
    assert!(meter.shown() >= 53.5 && meter.shown() < 84.);
    // A lower report (extraction reports are not strictly ordered with the creep) never rewinds.
    meter.report(41, start + Duration::from_millis(1200));
    meter.tick(
        start + Duration::from_millis(1216),
        &INSTALL_MILESTONES,
        false,
    );
    assert!(meter.shown() >= previous);
}

#[test]
fn completion_waits_for_the_bar_and_the_label_shows_100_only_when_real() {
    let start = Instant::now();
    let mut meter = Meter::new(start);
    meter.report(93, start);
    run(&mut meter, start, 0, 3000);
    assert!(!meter.complete());
    assert!(meter.label() < 100);
    meter.report(100, start + Duration::from_secs(3));
    run(&mut meter, start, 3016, 4500);
    assert!(meter.complete());
    assert_eq!(meter.label(), 100);
}

#[test]
fn reduced_motion_shows_the_real_value_at_once() {
    let start = Instant::now();
    let mut meter = Meter::new(start);
    meter.report(54, start);
    meter.tick(start, &INSTALL_MILESTONES, true);
    assert!((meter.shown() - 54.).abs() < f32::EPSILON);
    meter.tick(start + Duration::from_secs(30), &INSTALL_MILESTONES, true);
    assert!((meter.shown() - 54.).abs() < f32::EPSILON, "no creep");
}

#[test]
fn curves_start_at_zero_and_settle_at_one() {
    for curve in [ease_out as fn(f32) -> f32, back_out] {
        assert!(curve(0.).abs() < 1e-6);
        assert!((curve(1.) - 1.).abs() < 1e-6);
    }
    assert!((0.0..0.3).contains(&back_out(0.05)));
    assert!((1.0..1.2).contains(&back_out(0.8)), "small overshoot");
    assert!(delayed(0.2, 0.3).abs() < f32::EPSILON);
    assert!((delayed(1., 0.3) - 1.).abs() < f32::EPSILON);
    assert!((approach(10., 5., Duration::from_millis(16)) - 10.).abs() < f32::EPSILON);
}
