//! Finite Rune motion shared by every widget, stepped on the Runtime clock.
#[derive(Clone, Copy)]
pub struct Tween {
    pub from: f32,
    pub to: f32,
    start: f64,
    duration: f64,
    linear: bool,
}
impl Tween {
    pub fn fixed(value: f32) -> Self {
        Self {
            from: value,
            to: value,
            start: 0.0,
            duration: 0.0,
            linear: false,
        }
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
        // Vantare's cubic ease-out for position, linear opacity; evaluated by Rune.
        let eased = if self.linear {
            t
        } else {
            rune::Easing::cubic(1.0 / 3.0, 1.0, 2.0 / 3.0, 1.0).eval(t)
        };
        self.from + (self.to - self.from) * eased
    }
    pub fn active(self, now: f64) -> bool {
        self.from != self.to && now < self.start + self.duration
    }
    pub fn settle(&mut self) {
        self.from = self.to;
        self.duration = 0.0;
    }
}
