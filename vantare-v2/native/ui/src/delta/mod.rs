//! Instrumento Delta Eficiencia: geometría congelada 280 × 96.

mod motion;
mod view;

use crate::app::{Paint, Wake};
use motion::Motion;
use std::time::Instant;
use vantare_domain::{Snapshot, delta, format::Preferences};

pub(crate) struct Widget {
    vm: delta::ViewModel,
    motion: Motion,
}

impl Widget {
    pub(crate) fn new(prefs: Preferences) -> Self {
        Self {
            vm: delta::project(&Snapshot::default(), prefs),
            motion: Motion::default(),
        }
    }

    #[allow(clippy::unused_self)] // Contrato común del registro.
    pub(crate) fn size(&self) -> (f32, f32) {
        (280.0, 96.0)
    }

    pub(crate) fn ingest(&mut self, snapshot: &Snapshot, prefs: Preferences) -> bool {
        let next = delta::project(snapshot, prefs);
        if next == self.vm {
            return false;
        }
        let now = Instant::now();
        let was_active = !matches!(self.motion.wake(now), Wake::Idle);
        self.motion.update(&self.vm, &next, now);
        let changed = self.vm.delta_text != next.delta_text
            || self.vm.tone != next.tone
            || self.vm.progress != next.progress
            || self.vm.status_text != next.status_text
            || self.vm.reference_notice != next.reference_notice
            || was_active
            || !matches!(self.motion.wake(now), Wake::Idle);
        self.vm = next;
        changed
    }

    pub(crate) fn frame(&mut self, _prefs: Preferences) -> (Paint, Wake) {
        let now = Instant::now();
        let vm = self.vm.clone();
        let frame = self.motion.frame(&vm, now);
        (
            Box::new(move |window, cx| view::paint(&vm, frame, window, cx)),
            self.motion.wake(now),
        )
    }

    #[cfg(feature = "parity-capture")]
    pub(crate) fn animating(&self) -> bool {
        !matches!(self.motion.wake(Instant::now()), Wake::Idle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repaint_only_for_display_changes() {
        use vantare_domain::{Player, Quality};
        let prefs = Preferences::default();
        let mut widget = Widget::new(prefs);
        let mut s = Snapshot::default();
        s.state.player = Some(Player {
            delta_best_s: Quality::Reliable(0.214),
            ..Player::default()
        });
        assert!(widget.ingest(&s, prefs));
        s.sequence += 1;
        assert!(!widget.ingest(&s, prefs));
        s.state
            .player
            .as_mut()
            .expect("player fixture")
            .delta_best_s = Quality::Reliable(-0.214);
        assert!(widget.ingest(&s, prefs));
    }

    #[test]
    fn hidden_lap_text_updates_without_repainting_until_an_event() {
        use vantare_domain::{Car, CarId, Player, Quality};
        let prefs = Preferences::default();
        let mut s = Snapshot::default();
        s.state.player = Some(Player {
            car: CarId(1),
            delta_best_s: Quality::Reliable(0.214),
            ..Player::default()
        });
        s.state.cars.push(Car {
            id: CarId(1),
            laps: Quality::Reliable(127),
            ..Car::default()
        });
        let mut widget = Widget::new(prefs);
        assert!(widget.ingest(&s, prefs));
        s.state.cars[0].last_lap_s = Quality::Reliable(91.234);
        s.state.cars[0].best_lap_s = Quality::Reliable(90.964);
        assert!(!widget.ingest(&s, prefs));
        s.state.cars[0].laps = Quality::Reliable(128);
        assert!(widget.ingest(&s, prefs));
    }
}
