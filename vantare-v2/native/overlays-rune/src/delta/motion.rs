//! Finite delta motion shared by both looks. Vantare slides its bar and flashes
//! the record; Eficiencia interpolates the fill and shows notices and the tone
//! cross. The widget asks for frames only while something moves or a notice
//! lives, and then rests.
use crate::motion::Tween;
use vantare_domain::delta::{self, Board, Event, Status, Tone};

/// Duración del relleno de Eficiencia y de los avisos (GPUI `delta/motion.rs`).
const FILL: f64 = 0.140;
const FADE: f64 = 0.180;
const CROSS: f64 = 0.700;
const CROSS_FADE: f64 = 0.350;

pub(super) struct Motion {
    bar: Tween,
    offset: Tween,
    width: Tween,
    /// Instante del último récord personal; `None` sin destello.
    record: Option<f64>,
    event: Option<(f64, Event)>,
    cross: Option<(f64, Tone)>,
    last_tone: Option<Tone>,
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

/// Fracción del relleno Eficiencia (offset, ancho) desde el progreso.
pub(super) fn fill_geometry(progress: Option<f32>) -> [f32; 2] {
    let progress = progress.unwrap_or(0.0);
    [0.5 + progress.min(0.0) * 0.5, progress.abs() * 0.5]
}

fn side(tone: Tone) -> Option<Tone> {
    (tone != Tone::Neutral).then_some(tone)
}

fn event_life(event: Event) -> f64 {
    if event == Event::PersonalBest {
        4.0
    } else {
        2.6
    }
}

fn fraction(elapsed: f64, duration: f64) -> f32 {
    (elapsed / duration).clamp(0.0, 1.0) as f32
}

impl Motion {
    pub fn new(ease_ms: f32, flash_ms: f32) -> Self {
        Self {
            bar: Tween::fixed(0.0),
            offset: Tween::linear(0.5),
            width: Tween::linear(0.0),
            record: None,
            event: None,
            cross: None,
            last_tone: None,
            flash_ms: f64::from(flash_ms.max(0.0)) / 1000.0,
            ease_ms: f64::from(ease_ms.max(0.0)) / 1000.0,
        }
    }
    /// Una foto nueva: recoloca la barra, interpola el relleno y anota avisos.
    pub fn ingest(
        &mut self,
        prev: Option<&Board>,
        next: &Board,
        target: f32,
        fill: [f32; 2],
        now: f64,
        reduced: bool,
    ) {
        let Some(previous) = prev else {
            self.bar = Tween::fixed(target);
            self.offset = Tween::linear(fill[0]);
            self.width = Tween::linear(fill[1]);
            self.last_tone = side(next.tone);
            return;
        };
        if reset(previous, next) {
            // GPUI limpia los avisos y corta la interpolación; la barra se desliza.
            self.record = None;
            self.event = None;
            self.cross = None;
            self.last_tone = side(next.tone);
            self.offset = Tween::linear(fill[0]);
            self.width = Tween::linear(fill[1]);
            self.bar.retarget(target, now, self.ease_ms);
            return;
        }
        self.last_tone = side(previous.tone).or(self.last_tone);
        if let Some(to) = side(next.tone) {
            if self
                .last_tone
                .is_some_and(|from| from != to)
            {
                self.cross = Some((now, to));
            }
            self.last_tone = Some(to);
        }
        if let Some(event) = delta::event(previous, next) {
            self.event = Some((now, event));
            if event == Event::PersonalBest {
                self.record = Some(now);
            }
        }
        if reduced {
            self.bar = Tween::fixed(target);
            self.offset = Tween::linear(fill[0]);
            self.width = Tween::linear(fill[1]);
            return;
        }
        self.bar.retarget(target, now, self.ease_ms);
        self.offset.retarget(fill[0], now, FILL);
        self.width.retarget(fill[1], now, FILL);
    }
    pub fn bar(&self, now: f64) -> f32 {
        self.bar.value(now)
    }
    pub fn fill(&self, now: f64) -> [f32; 2] {
        [self.offset.value(now), self.width.value(now)]
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
    pub fn event(&self, now: f64) -> Option<Event> {
        let (start, event) = self.event?;
        (now - start < event_life(event)).then_some(event)
    }
    /// Opacidad del aviso: entrada cúbica, vida y salida cúbica.
    pub fn notice_alpha(&self, now: f64) -> f32 {
        let Some((start, event)) = self.event else {
            return 0.0;
        };
        let age = now - start;
        let life = event_life(event);
        if age < FADE {
            1.0 - (1.0 - fraction(age, FADE)).powi(3)
        } else if age < life {
            1.0
        } else if age < life + FADE {
            (1.0 - fraction(age - life, FADE)).powi(3)
        } else {
            0.0
        }
    }
    /// Cruce de tono con su opacidad (GPUI: 350 ms de subida, 700 de vida).
    pub fn cross(&self, now: f64) -> (Option<Tone>, f32) {
        let Some((start, tone)) = self.cross else {
            return (None, 0.0);
        };
        let age = now - start;
        if age >= CROSS + CROSS_FADE {
            return (None, 0.0);
        }
        let alpha = if age < CROSS_FADE {
            fraction(age, CROSS_FADE)
        } else if age < CROSS {
            1.0
        } else {
            1.0 - fraction(age - CROSS, CROSS_FADE)
        };
        (Some(tone), alpha)
    }
    /// Siguiente instante que necesita imagen: ahora mientras algo se mueve.
    pub fn next_wake(&self, now: f64) -> Option<f64> {
        if self.bar.active(now) {
            return Some(now);
        }
        let start = self.record?;
        (now < start + self.flash_ms).then_some(now)
    }
    /// Como `next_wake`, pero cuenta también el relleno y los avisos de Eficiencia.
    pub fn next_wake_full(&self, now: f64) -> Option<f64> {
        if self.next_wake(now).is_some() || self.offset.active(now) || self.width.active(now) {
            return Some(now);
        }
        let mut due: Option<f64> = None;
        if let Some((start, event)) = self.event {
            let life = event_life(event);
            if now - start < FADE || (now - start >= life && now - start < life + FADE) {
                return Some(now);
            }
            if now - start < life {
                due = Some(start + life);
            }
        }
        if let Some((start, _)) = self.cross {
            if now - start < CROSS_FADE || (now - start >= CROSS && now - start < CROSS + CROSS_FADE)
            {
                return Some(now);
            }
            if now - start < CROSS {
                due = Some(due.map_or(start + CROSS, |value| value.min(start + CROSS)));
            }
        }
        due.map(|value| value.max(now))
    }
    /// Movimiento reducido: estado final directo y sin destello.
    pub fn settle(&mut self) {
        self.bar.settle();
        self.offset.settle();
        self.width.settle();
        self.record = None;
        self.event = None;
        self.cross = None;
    }
    /// Estado de Eficiencia sin reloj: relleno final y avisos dentro de su vida.
    pub fn reduced_frame(&self, now: f64) -> (Option<Event>, Option<Tone>) {
        (
            self.event
                .filter(|(start, event)| now - start < event_life(*event))
                .map(|(_, event)| event),
            self.cross
                .filter(|(start, _)| now - start < CROSS)
                .map(|(_, tone)| tone),
        )
    }
    pub fn reduced_deadline(&self, now: f64) -> Option<f64> {
        let event = self
            .event
            .filter(|(start, event)| now - start < event_life(*event))
            .map(|(start, event)| start + event_life(event));
        let cross = self
            .cross
            .filter(|(start, _)| now - start < CROSS)
            .map(|(start, _)| start + CROSS);
        event
            .into_iter()
            .chain(cross)
            .min_by(|a, b| a.total_cmp(b))
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
        motion.ingest(Some(&board(90.0)), &board(89.9), 0.5, [0.5, 0.2], 0.0, false);
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
        motion.ingest(Some(&board(90.0)), &board(89.0), 0.0, [0.5, 0.0], 0.0, false);
        assert_eq!(motion.flash(0.0), Some(1.0));
        assert!((motion.flash(0.700).expect("mitad") - 0.5).abs() < 1e-6);
        assert_eq!(motion.flash(1.400), None);
        assert_eq!(motion.next_wake(1.400), None);
    }

    #[test]
    fn a_new_session_reference_or_car_clears_the_flash_but_slides_the_bar() {
        let mut motion = motion();
        motion.ingest(Some(&board(90.0)), &board(89.0), 0.5, [0.5, 0.0], 0.0, false);
        assert!(motion.flash(0.01).is_some());
        let mut next = board(89.0);
        next.reference = vantare_domain::delta::Reference::Optimal;
        motion.ingest(Some(&board(89.0)), &next, 0.8, [0.5, 0.0], 0.02, false);
        assert_eq!(motion.flash(0.02), None, "los avisos se limpian");
        assert!(motion.bar.active(0.02), "la barra se desliza, no salta");
        assert_eq!(
            motion.bar(150.0_f64 / 1000.0 + 0.02),
            0.8,
            "llega al objetivo con el ease"
        );
    }

    #[test]
    fn the_fill_interpolates_linearly_for_140_ms() {
        let mut motion = Motion::new(150.0, 1400.0);
        motion.ingest(None, &board(90.0), 0.0, [0.5, 0.0], 0.0, false);
        motion.ingest(
            Some(&board(90.0)),
            &board(90.0),
            0.0,
            [0.25, 0.25],
            0.0,
            false,
        );
        assert_eq!(motion.fill(0.070), [0.375, 0.125], "lineal a mitad");
        assert_eq!(motion.fill(0.140), [0.25, 0.25]);
        assert!(!motion.offset.active(0.140));
    }

    #[test]
    fn notices_fade_in_hold_and_fade_out_with_gpui_times() {
        let mut motion = Motion::new(150.0, 1400.0);
        let prev = board(90.0);
        motion.ingest(None, &prev, 0.0, [0.5, 0.0], 0.0, false);
        motion.ingest(Some(&prev), &board(89.0), 0.0, [0.5, 0.0], 1.0, false);
        assert_eq!(motion.notice_alpha(1.0), 0.0, "entrada desde cero");
        assert!((motion.notice_alpha(1.090) - 0.5).abs() < 1e-6);
        assert_eq!(motion.notice_alpha(2.0), 1.0);
        assert_eq!(motion.event(1.0), Some(Event::PersonalBest));
        assert_eq!(motion.event(5.1), None, "4000 ms de vida");
        assert_eq!(motion.flash(1.0), Some(1.0));
    }

    #[test]
    fn reduced_motion_settles_without_a_flash_or_a_clock() {
        let mut motion = motion();
        motion.ingest(Some(&board(90.0)), &board(89.0), 0.5, [0.5, 0.2], 0.0, true);
        assert_eq!(motion.flash(0.0), None);
        assert_eq!(motion.bar(0.0), 0.5);
        assert_eq!(motion.fill(0.0), [0.5, 0.2]);
        assert_eq!(motion.next_wake(0.0), None);
        motion.settle();
        assert_eq!(motion.bar(0.0), 0.5);
    }
}
