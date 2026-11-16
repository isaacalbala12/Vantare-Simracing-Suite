//! Finite Rune motion shared by every widget, stepped on the Runtime clock.
#[derive(Clone, Copy)]
pub struct Tween {
    pub from: f32,
    pub to: f32,
    start: f64,
    duration: f64,
    linear: bool,
    curve: [f32; 4],
}
/// Vantare's cubic ease-out; a widget that GPUI eases differently passes its own.
const CURVE: [f32; 4] = [1.0 / 3.0, 1.0, 2.0 / 3.0, 1.0];
impl Tween {
    pub fn fixed(value: f32) -> Self {
        Self {
            from: value,
            to: value,
            start: 0.0,
            duration: 0.0,
            linear: false,
            curve: CURVE,
        }
    }
    /// Same tween with another cubic-bezier `[x1, y1, x2, y2]`; kept by `retarget`.
    pub fn with_curve(self, curve: [f32; 4]) -> Self {
        Self { curve, ..self }
    }
    pub fn linear(value: f32) -> Self {
        Self {
            linear: true,
            ..Self::fixed(value)
        }
    }
    pub fn retarget(&mut self, value: f32, now: f64, duration: f64) {
        if value == self.to {
            return;
        }
        let from = self.value(now);
        *self = Self {
            from,
            to: value,
            start: now,
            duration: duration.max(0.0),
            linear: self.linear,
            curve: self.curve,
        };
    }
    pub fn value(self, now: f64) -> f32 {
        let t = if self.duration > 0.0 {
            ((now - self.start) / self.duration).clamp(0.0, 1.0) as f32
        } else {
            1.0
        };
        if t >= 1.0 {
            return self.to;
        }
        // Cubic ease-out for position, linear opacity; evaluated by Rune.
        let eased = if self.linear {
            t
        } else {
            let [x1, y1, x2, y2] = self.curve;
            rune::Easing::cubic(x1, y1, x2, y2).eval(t)
        };
        self.from + (self.to - self.from) * eased
    }
    pub fn active(self, now: f64) -> bool {
        self.from != self.to && now < self.start + self.duration
    }
    /// Momento en que el tween alcanza su destino.
    pub fn end(self) -> f64 {
        self.start + self.duration
    }
    pub fn settle(&mut self) {
        self.from = self.to;
        self.duration = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn halfway(tween: Tween) -> f32 {
        let mut tween = tween;
        tween.retarget(1.0, 0.0, 1.0);
        tween.value(0.5)
    }
    #[test]
    fn the_default_curve_is_the_cubic_ease_out_relative_uses() {
        for t in [0.25_f64, 0.5, 0.75] {
            let mut tween = Tween::fixed(0.0);
            tween.retarget(1.0, 0.0, 1.0);
            let expected = 1.0 - (1.0 - t as f32).powi(3);
            assert!((tween.value(t) - expected).abs() < 1e-3, "t = {t}");
        }
    }
    #[test]
    fn another_curve_changes_the_path_and_survives_a_new_target() {
        let default = halfway(Tween::fixed(0.0));
        let custom = Tween::fixed(0.0).with_curve([0.0, 0.0, 0.58, 1.0]);
        assert!((halfway(custom) - default).abs() > 0.1);
        let mut moving = custom;
        moving.retarget(1.0, 0.0, 1.0);
        moving.retarget(0.0, 0.5, 1.0);
        assert_eq!(moving.curve, [0.0, 0.0, 0.58, 1.0]);
    }
    #[test]
    fn linear_ignores_the_curve() {
        assert!((halfway(Tween::linear(0.0)) - 0.5).abs() < 1e-6);
    }
}
