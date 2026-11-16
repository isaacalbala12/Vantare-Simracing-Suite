//! Pedals telemetry scene: current values plus the 60 ms bar transition.
use crate::motion::Tween;
use vantare_domain::pedals_telemetry::{Status, ViewModel};

/// Fixed footprint of `PedalsAdvancedEfficiency`.
pub const SIZE: (f32, f32) = (380.0, 64.0);
const TRANSITION: f64 = 0.06;
/// GPUI re-rasterizes the wheel only every half degree; the visible angle is quantized.
const ANGLE_STEP_DEG: f64 = 0.5;

#[derive(Clone, Debug, PartialEq)]
pub struct Scene {
    /// C, B, T as fractions 0–1; `None` keeps the bar empty (absence is not zero).
    pub bars: [Option<f32>; 3],
    pub show_clutch: bool,
    pub gear: String,
    /// Speed with its unit, as GPUI paints it (`180 km/h`, `— km/h`).
    pub speed: String,
    /// Values stay visible when stale; the gear and the wheel dim.
    pub stale: bool,
    pub status_text: &'static str,
    pub wheel: &'static str,
    /// Quantized to `ANGLE_STEP_DEG`, clockwise degrees; 0 when there is no steering.
    pub wheel_rotation_deg: f64,
    /// `+36°`, `-12°` or `—`.
    pub angle_text: String,
}

/// Bar transition state; the only clock is the 60 ms curve while it runs.
pub struct Motion {
    progress: Tween,
    from: [Option<f32>; 3],
    target: [Option<f32>; 3],
    epoch: Option<u64>,
    reduced: bool,
}

impl Motion {
    pub fn new(reduced: bool) -> Self {
        Self {
            progress: Tween::fixed(1.0),
            from: [None; 3],
            target: [None; 3],
            epoch: None,
            reduced,
        }
    }
    pub fn policy(&mut self, reduced: bool) {
        if reduced && !self.reduced {
            self.settle();
        }
        self.reduced = reduced;
    }
    fn settle(&mut self) {
        self.from = self.target;
        self.progress = Tween::fixed(1.0);
    }
    /// Ingests one projection. A new epoch snaps; absence never tweens towards or from it.
    pub fn update(&mut self, vm: &ViewModel, epoch: u64, clock: f64) {
        let target = vm.pedals.map(|value| value.map(|value| value as f32));
        let reset = self.epoch != Some(epoch);
        self.epoch = Some(epoch);
        if reset {
            self.target = target;
            self.settle();
            return;
        }
        if target == self.target {
            return;
        }
        let from = self.bars(clock);
        self.from = from;
        self.target = target;
        let moving = from
            .iter()
            .zip(target)
            .any(|(from, to)| from.is_some() && to.is_some() && *from != to);
        self.progress = if moving && !self.reduced {
            let mut progress = Tween::linear(0.0);
            progress.retarget(1.0, clock, TRANSITION);
            progress
        } else {
            Tween::fixed(1.0)
        };
    }
    pub fn bars(&self, clock: f64) -> [Option<f32>; 3] {
        let progress = self.progress.value(clock);
        std::array::from_fn(|index| match (self.from[index], self.target[index]) {
            (Some(from), Some(to)) => Some(from + (to - from) * progress),
            (_, to) => to,
        })
    }
    /// Arms the clock only while the transition runs.
    pub fn next_wake(&self, clock: f64) -> Option<f64> {
        (self.progress.active(clock) && !self.reduced).then_some(clock)
    }
}

/// Pure sampling: the Look chooses colors and pixels, never these values.
pub fn sample(vm: &ViewModel, motion: &Motion, clock: f64) -> Scene {
    let steering = vm.steering;
    let angle = steering.unwrap_or(0.0) * 450.0;
    let wheel_rotation_deg = (angle / ANGLE_STEP_DEG).round() * ANGLE_STEP_DEG;
    Scene {
        bars: motion.bars(clock),
        show_clutch: vm.show_clutch,
        gear: vm.gear.clone(),
        speed: format!("{} {}", vm.speed, vm.speed_unit),
        stale: vm.status == Status::Stale,
        status_text: vm.status_text,
        wheel: vm.steering_wheel,
        wheel_rotation_deg,
        angle_text: steering.map_or_else(|| "—".into(), |value| format!("{:+.0}°", value * 450.0)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vm(pedals: [Option<f64>; 3], steering: Option<f64>) -> ViewModel {
        ViewModel {
            steering_wheel: "generic",
            show_clutch: true,
            status: Status::Ready,
            status_text: "",
            pedals,
            steering,
            gear: "4".into(),
            speed: "180".into(),
            speed_unit: "km/h".into(),
            rpm: "7.2k".into(),
        }
    }

    #[test]
    fn bars_move_linearly_in_sixty_milliseconds_and_then_rest() {
        let mut motion = Motion::new(false);
        motion.update(&vm([Some(0.0); 3], None), 1, 0.0);
        motion.update(&vm([Some(1.0); 3], None), 1, 1.0);
        assert_eq!(motion.bars(1.0), [Some(0.0); 3]);
        assert!((motion.bars(1.03)[0].expect("mitad") - 0.5).abs() < 1e-6);
        assert_eq!(motion.bars(1.06), [Some(1.0); 3]);
        assert!(motion.next_wake(1.0).is_some());
        assert_eq!(motion.next_wake(1.06), None);
    }

    #[test]
    fn a_new_target_starts_from_the_value_on_screen() {
        let mut motion = Motion::new(false);
        motion.update(&vm([Some(0.0); 3], None), 1, 0.0);
        motion.update(&vm([Some(1.0); 3], None), 1, 1.0);
        assert!((motion.bars(1.03)[2].expect("visible") - 0.5).abs() < 1e-6);
        motion.update(&vm([Some(0.0); 3], None), 1, 1.03);
        assert!((motion.bars(1.03)[2].expect("desde visible") - 0.5).abs() < 1e-6);
        assert!((motion.bars(1.06)[2].expect("a mitad") - 0.25).abs() < 1e-6);
        assert_eq!(motion.bars(1.09)[2], Some(0.0));
        assert_eq!(motion.next_wake(1.09), None);
    }

    #[test]
    fn absence_snaps_without_tweening_from_or_to_it() {
        let mut motion = Motion::new(false);
        motion.update(&vm([Some(0.2); 3], None), 1, 0.0);
        motion.update(&vm([None, Some(0.2), Some(0.2)], None), 1, 1.0);
        assert_eq!(motion.bars(1.0)[0], None);
        assert_eq!(
            motion.next_wake(1.0),
            None,
            "sin par Some/Some no hay reloj"
        );
        motion.update(&vm([None; 3], None), 1, 2.0);
        assert_eq!(motion.bars(2.0), [None; 3]);
    }

    #[test]
    fn a_new_epoch_snaps_and_arms_no_clock() {
        let mut motion = Motion::new(false);
        motion.update(&vm([Some(0.2); 3], None), 1, 0.0);
        motion.update(&vm([Some(0.8); 3], None), 1, 1.0);
        assert!(motion.next_wake(1.0).is_some());
        motion.update(&vm([Some(0.3); 3], None), 2, 1.01);
        assert_eq!(motion.bars(1.01), [Some(0.3); 3]);
        assert_eq!(motion.next_wake(1.01), None);
    }

    #[test]
    fn reduced_motion_lands_on_the_final_value_and_policy_settles() {
        let mut motion = Motion::new(true);
        motion.update(&vm([Some(0.0); 3], None), 1, 0.0);
        motion.update(&vm([Some(1.0); 3], None), 1, 1.0);
        assert_eq!(motion.bars(1.0), [Some(1.0); 3]);
        assert_eq!(motion.next_wake(1.0), None);
        motion.policy(false);
        motion.update(&vm([Some(0.0); 3], None), 1, 2.0);
        assert!(motion.next_wake(2.0).is_some());
        motion.policy(true);
        assert_eq!(motion.bars(2.0), [Some(0.0); 3]);
        assert_eq!(motion.next_wake(2.0), None);
    }

    #[test]
    fn the_scene_copies_texts_wheel_and_stale_state() {
        let mut motion = Motion::new(true);
        let mut view = vm([Some(0.06), Some(0.13), Some(0.75)], Some(0.08));
        motion.update(&view, 1, 0.0);
        let scene = sample(&view, &motion, 0.0);
        assert_eq!(scene.gear, "4");
        assert_eq!(scene.speed, "180 km/h");
        assert_eq!(scene.angle_text, "+36°");
        assert!((scene.wheel_rotation_deg - 36.0).abs() < 1e-9);
        assert_eq!(scene.wheel, "generic");
        assert!(!scene.stale);
        assert!(scene.show_clutch);

        view.status = Status::Stale;
        view.status_text = "DATOS ANTIGUOS";
        let scene = sample(&view, &motion, 0.0);
        assert!(scene.stale);
        assert_eq!(scene.status_text, "DATOS ANTIGUOS");
    }

    #[test]
    fn the_wheel_angle_is_quantized_to_half_a_degree() {
        let motion = Motion::new(true);
        let view = vm([Some(0.5); 3], Some(0.081));
        let scene = sample(&view, &motion, 0.0);
        assert!((scene.wheel_rotation_deg - 36.5).abs() < 1e-9);
        assert_eq!(scene.angle_text, "+36°", "el texto no se cuantiza");
    }

    #[test]
    fn missing_steering_prints_a_dash_and_keeps_the_wheel_neutral() {
        let motion = Motion::new(true);
        let mut view = vm([None; 3], None);
        view.speed = "—".into();
        let scene = sample(&view, &motion, 0.0);
        assert_eq!(scene.angle_text, "—");
        assert_eq!(scene.wheel_rotation_deg, 0.0);
        assert_eq!(scene.speed, "— km/h");
    }

    #[test]
    fn hidden_clutch_is_a_setting_not_a_missing_value() {
        let mut motion = Motion::new(true);
        let mut view = vm([Some(0.5); 3], None);
        view.show_clutch = false;
        motion.update(&view, 1, 0.0);
        let scene = sample(&view, &motion, 0.0);
        assert!(!scene.show_clutch);
        assert_eq!(
            scene.bars[0],
            Some(0.5),
            "el dato sigue ahí; solo no se pinta"
        );
    }
}
