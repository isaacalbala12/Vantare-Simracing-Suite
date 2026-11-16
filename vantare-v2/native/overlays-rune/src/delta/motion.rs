//! Bar slide and record flash of the Vantare delta. Finite motion only: the
//! widget asks for frames while the bar moves or the flash fades, and then rests.
use crate::motion::Tween;
use vantare_domain::delta::{self, Board, Event, Status};

pub(super) struct Motion {
    bar: Tween,
    /// Instante del último récord personal; `None` sin destello.
    record: Option<f64>,
    flash_ms: f64,
    ease_ms: f64,
}

/// GPUI reinicia el movimiento al cambiar de coche, referencia o estado.
fn reset(prev: &Board, next: &Board) -> bool {
    prev.identity != next.identity
        || prev.reference != next.reference
        || prev.status != Status::Ready
        || next.status != Status::Ready
}

impl Motion {
    pub fn new(ease_ms: f32, flash_ms: f32) -> Self {
        Self {
            bar: Tween::fixed(0.0),
            record: None,
            flash_ms: f64::from(flash_ms.max(0.0)) / 1000.0,
            ease_ms: f64::from(ease_ms.max(0.0)) / 1000.0,
        }
    }
    /// Una foto nueva: recoloca la barra y enciende el destello de récord.
    pub fn ingest(
        &mut self,
        prev: Option<&Board>,
        next: &Board,
        target: f32,
        now: f64,
        reduced: bool,
    ) {
        let Some(prev) = prev else {
            self.bar = Tween::fixed(target);
            return;
        };
        if reduced {
            self.bar = Tween::fixed(target);
            self.record = None;
            return;
        }
        if reset(prev, next) {
            // GPUI solo limpia los avisos; la barra se desliza con retarget.
            self.record = None;
            self.bar.retarget(target, now, self.ease_ms);
            return;
        }
        if delta::event(prev, next) == Some(Event::PersonalBest) {
            self.record = Some(now);
        }
        self.bar.retarget(target, now, self.ease_ms);
    }
    pub fn bar(&self, now: f64) -> f32 {
        self.bar.value(now)
    }
    /// 1 al marcar el récord y baja lineal hasta 0 en `flash_ms` (GPUI).
    pub fn flash(&self, now: f64) -> Option<f32> {
        let start = self.record?;
        if self.flash_ms <= 0.0 {
            return None;
        }
        let t = ((now - start) / self.flash_ms) as f32;
        (t < 1.0).then_some((1.0 - t).max(0.0))
    }
    /// Siguiente instante que necesita imagen: ahora mientras algo se mueve.
    pub fn next_wake(&self, now: f64) -> Option<f64> {
        if self.bar.active(now) {
            return Some(now);
        }
        let start = self.record?;
        (now < start + self.flash_ms).then_some(now)
    }
    /// Movimiento reducido: estado final directo y sin destello.
    pub fn settle(&mut self) {
        self.bar.settle();
        self.record = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vantare::Style;

    fn board(best: f64) -> Board {
        let mut board = delta::project_reference(
            &crate::testdata::snapshot(),
            vantare_domain::format::Preferences::default(),
            vantare_domain::delta::Reference::PersonalBest,
        );
        board.status = Status::Ready;
        board.best_lap = vantare_domain::Quality::Reliable(best);
        board
    }

    fn motion() -> Motion {
        let style = Style::compiled();
        Motion::new(style.delta.ease_ms, style.motion.flash_ms)
    }

    #[test]
    fn the_bar_slides_with_the_gpui_ease_and_duration() {
        let mut motion = motion();
        motion.ingest(Some(&board(90.0)), &board(89.9), 0.5, 0.0, false);
        assert!(motion.bar.active(0.0));
        for t in [0.25_f32, 0.5] {
            let expected = 0.5 * (1.0 - (1.0 - t).powi(3));
            assert!(
                (motion.bar(f64::from(t) * 0.150) - expected).abs() < 1e-3,
                "t = {t}"
            );
        }
        assert!(!motion.bar.active(0.150));
        assert_eq!(motion.bar(1.0), 0.5);
    }

    #[test]
    fn a_record_lights_the_flash_for_its_whole_life() {
        let mut motion = motion();
        motion.ingest(Some(&board(90.0)), &board(89.0), 0.0, 0.0, false);
        assert_eq!(motion.flash(0.0), Some(1.0));
        assert!((motion.flash(0.700).expect("mitad") - 0.5).abs() < 1e-6);
        assert_eq!(motion.flash(1.400), None);
        assert_eq!(motion.next_wake(1.400), None);
    }

    #[test]
    fn a_new_session_reference_or_car_clears_the_flash_but_slides_the_bar() {
        let mut motion = motion();
        motion.ingest(Some(&board(90.0)), &board(89.0), 0.5, 0.0, false);
        assert!(motion.flash(0.01).is_some());
        let mut next = board(89.0);
        next.reference = vantare_domain::delta::Reference::Optimal;
        motion.ingest(Some(&board(89.0)), &next, 0.8, 0.02, false);
        assert_eq!(motion.flash(0.02), None, "los avisos se limpian");
        assert!(motion.bar.active(0.02), "la barra se desliza, no salta");
        assert_eq!(
            motion.bar(f64::from(150.0_f32) / 1000.0 + 0.02),
            0.8,
            "llega al objetivo con el ease"
        );
    }

    #[test]
    fn reduced_motion_settles_without_a_flash_or_a_clock() {
        let mut motion = motion();
        motion.ingest(Some(&board(90.0)), &board(89.0), 0.5, 0.0, true);
        assert_eq!(motion.flash(0.0), None);
        assert_eq!(motion.bar(0.0), 0.5);
        assert_eq!(motion.next_wake(0.0), None);
        motion.settle();
        assert_eq!(motion.bar(0.0), 0.5);
    }
}
