//! Pure motion curves. Between engine reports the bar creeps over at most 80 %
//! of the gap to the next engine milestone: it never reaches that milestone,
//! never goes back, and the label only reads 100 once the engine reports it.
use std::time::{Duration, Instant};

/// Percentages reported by installer-driver.ps1 for install/update/repair.
pub const INSTALL_MILESTONES: [u8; 6] = [6, 40, 54, 84, 93, 100];
/// Percentages reported by installer-driver.ps1 for uninstall.
pub const REMOVE_MILESTONES: [u8; 4] = [12, 72, 88, 100];

/// Share of the gap to the next milestone that the creep may cover.
const CREEP_SHARE: f32 = 0.8;
/// Time constant of the creep: after 6 s idle it covers ~63 % of its share.
const CREEP_TAU: f32 = 6.;
/// Time constant of the visual follow; ~0.4 s to close 95 % of a jump.
const FOLLOW_TAU: f32 = 0.13;

/// Value the bar may show `idle` after the last real report.
pub fn creep(real: u8, milestones: &[u8], idle: Duration) -> f32 {
    let real = real.min(100);
    let next = milestones
        .iter()
        .copied()
        .find(|m| *m > real)
        .unwrap_or(100);
    let room = f32::from(next - real) * CREEP_SHARE;
    f32::from(real) + room * (1. - (-idle.as_secs_f32() / CREEP_TAU).exp())
}

/// Moves `shown` toward `target` by an exponential follow; never moves back.
pub fn approach(shown: f32, target: f32, dt: Duration) -> f32 {
    if target <= shown {
        return shown;
    }
    let next = shown + (target - shown) * (1. - (-dt.as_secs_f32() / FOLLOW_TAU).exp());
    if target - next < 0.05 { target } else { next }
}

/// Cubic ease-out: fast start, soft landing.
pub fn ease_out(t: f32) -> f32 {
    1. - (1. - t.clamp(0., 1.)).powi(3)
}

/// Ease-out with a small overshoot, for the success badge.
pub fn back_out(t: f32) -> f32 {
    const C1: f32 = 1.3;
    let t = t.clamp(0., 1.) - 1.;
    1. + (C1 + 1.) * t.powi(3) + C1 * t.powi(2)
}

/// Remaps `t` so the curve starts after `delay` (a fraction of the duration).
pub fn delayed(t: f32, delay: f32) -> f32 {
    ((t - delay) / (1. - delay)).clamp(0., 1.)
}

/// Displayed progress of one operation.
#[derive(Clone, Copy, Debug)]
pub struct Meter {
    real: u8,
    shown: f32,
    reported: Instant,
    ticked: Instant,
}

impl Meter {
    pub fn new(now: Instant) -> Self {
        Self {
            real: 0,
            shown: 0.,
            reported: now,
            ticked: now,
        }
    }
    pub fn report(&mut self, real: u8, now: Instant) {
        if real != self.real {
            self.real = real.min(100);
            self.reported = now;
        }
    }
    /// Advances the displayed value; `still` jumps straight to the real value.
    pub fn tick(&mut self, now: Instant, milestones: &[u8], still: bool) {
        let dt = now.saturating_duration_since(self.ticked);
        self.ticked = now;
        if still {
            self.shown = self.shown.max(f32::from(self.real));
            return;
        }
        let target = creep(
            self.real,
            milestones,
            now.saturating_duration_since(self.reported),
        );
        self.shown = approach(self.shown, target, dt);
    }
    pub fn shown(&self) -> f32 {
        self.shown
    }
    /// The whole number shown next to the bar; 100 only once it is real.
    pub fn label(&self) -> u8 {
        if self.real == 100 && self.shown >= 99.5 {
            100
        } else {
            // Bounded to 0..100 by construction.
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let floor = self.shown.floor().clamp(0., 99.) as u8;
            floor
        }
    }
    /// True once the bar has caught up with a finished operation.
    pub fn complete(&self) -> bool {
        self.real == 100 && self.shown >= 99.95
    }
}
