//! Movimiento de Standings Vantare (#1497): las filas se deslizan al cambiar
//! de posición, las nuevas aparecen con un fundido y los cambios relevantes
//! (gana o pierde puestos, mejor vuelta de clase, entrada en boxes) destellan.
//!
//! La primera foto nunca anima. Con todo quieto se pide `Wake::Idle`.

use crate::app::Wake;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use vantare_domain::CarId;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Flash {
    Gain,
    Loss,
    Best,
    Pit,
}

/// Duraciones del movimiento (editables en el estilo).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Timing {
    pub reorder: Duration,
    pub fade: Duration,
    pub flash: Duration,
}

/// Lo que el movimiento necesita saber de cada fila visible.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Sample {
    pub id: CarId,
    pub y: f32,
    pub position: u32,
    pub fastest: bool,
    pub in_pits: bool,
}

/// Estado de una fila en un instante: desplazamiento sobre su sitio,
/// opacidad de entrada y destello con su intensidad (1 → 0).
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Pose {
    pub offset: f32,
    pub alpha: f32,
    pub flash: Option<(Flash, f32)>,
}

impl Default for Pose {
    fn default() -> Self {
        Self {
            offset: 0.0,
            alpha: 1.0,
            flash: None,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct Track {
    from: f32,
    to: f32,
    moved: Instant,
    born: Option<Instant>,
    flash: Option<(Flash, Instant)>,
    position: u32,
    fastest: bool,
    in_pits: bool,
}

impl Track {
    fn progress(start: Instant, length: Duration, now: Instant) -> f32 {
        if length.is_zero() {
            return 1.0;
        }
        (now.saturating_duration_since(start).as_secs_f32() / length.as_secs_f32()).clamp(0.0, 1.0)
    }

    fn y(&self, timing: Timing, now: Instant) -> f32 {
        let t = Self::progress(self.moved, timing.reorder, now);
        // Salida suave (cúbica): arranca rápido y frena al llegar.
        let eased = 1.0 - (1.0 - t).powi(3);
        self.from + (self.to - self.from) * eased
    }

    fn active(&self, timing: Timing, now: Instant) -> bool {
        let moving = self.from != self.to && Self::progress(self.moved, timing.reorder, now) < 1.0;
        let fading = self
            .born
            .is_some_and(|born| Self::progress(born, timing.fade, now) < 1.0);
        let flashing = self
            .flash
            .is_some_and(|(_, at)| Self::progress(at, timing.flash, now) < 1.0);
        moving || fading || flashing
    }
}

#[derive(Clone, Debug, Default)]
pub(crate) struct Motion {
    rows: HashMap<CarId, Track>,
    started: bool,
}

impl Motion {
    /// Nueva disposición tras un cambio del ViewModel.
    pub(crate) fn update(&mut self, rows: &[Sample], timing: Timing, now: Instant) {
        let first = !self.started;
        self.started = true;
        let mut next = HashMap::with_capacity(rows.len());
        for sample in rows {
            let track = match self.rows.get(&sample.id) {
                Some(old) if !first => {
                    let current = old.y(timing, now);
                    // Boxes manda: entrar suele costar puestos y es lo que hay que ver.
                    let flash = if sample.in_pits && !old.in_pits {
                        Some((Flash::Pit, now))
                    } else if sample.position < old.position {
                        Some((Flash::Gain, now))
                    } else if sample.position > old.position {
                        Some((Flash::Loss, now))
                    } else if sample.fastest && !old.fastest {
                        Some((Flash::Best, now))
                    } else {
                        old.flash
                    };
                    let moved = (current - sample.y).abs() > 0.01;
                    Track {
                        from: if moved { current } else { sample.y },
                        to: sample.y,
                        moved: if moved { now } else { old.moved },
                        born: old.born,
                        flash,
                        position: sample.position,
                        fastest: sample.fastest,
                        in_pits: sample.in_pits,
                    }
                }
                _ => Track {
                    from: sample.y,
                    to: sample.y,
                    moved: now,
                    born: (!first).then_some(now),
                    flash: None,
                    position: sample.position,
                    fastest: sample.fastest,
                    in_pits: sample.in_pits,
                },
            };
            next.insert(sample.id, track);
        }
        self.rows = next;
    }

    /// Recoloca sin animar (cambio de estilo o de tamaño).
    pub(crate) fn snap(&mut self, rows: &[Sample]) {
        for sample in rows {
            if let Some(track) = self.rows.get_mut(&sample.id) {
                track.from = sample.y;
                track.to = sample.y;
            }
        }
    }

    /// Da por terminado todo movimiento, entrada y destello en curso.
    pub(crate) fn settle(&mut self) {
        for track in self.rows.values_mut() {
            track.from = track.to;
            track.born = None;
            track.flash = None;
        }
    }

    pub(crate) fn pose(&self, id: CarId, timing: Timing, now: Instant) -> Pose {
        let Some(track) = self.rows.get(&id) else {
            return Pose::default();
        };
        let alpha = track
            .born
            .map_or(1.0, |born| Track::progress(born, timing.fade, now));
        let flash = track.flash.and_then(|(kind, at)| {
            let t = Track::progress(at, timing.flash, now);
            (t < 1.0).then_some((kind, 1.0 - t))
        });
        Pose {
            offset: track.y(timing, now) - track.to,
            alpha,
            flash,
        }
    }

    pub(crate) fn wake(&self, timing: Timing, now: Instant) -> Wake {
        if self.rows.values().any(|track| track.active(timing, now)) {
            Wake::Frame
        } else {
            Wake::Idle
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TIMING: Timing = Timing {
        reorder: Duration::from_millis(300),
        fade: Duration::from_millis(200),
        flash: Duration::from_millis(1200),
    };

    fn sample(id: u32, y: f32, position: u32) -> Sample {
        Sample {
            id: CarId(id),
            y,
            position,
            fastest: false,
            in_pits: false,
        }
    }

    #[test]
    fn first_photo_is_still_and_an_overtake_slides_and_flashes_then_settles() {
        let t0 = Instant::now();
        let mut motion = Motion::default();
        motion.update(&[sample(1, 0.0, 1), sample(2, 24.0, 2)], TIMING, t0);
        assert_eq!(
            motion.wake(TIMING, t0),
            Wake::Idle,
            "la primera foto no anima"
        );
        motion.update(&[sample(2, 0.0, 1), sample(1, 24.0, 2)], TIMING, t0);
        let gain = motion.pose(CarId(2), TIMING, t0);
        assert_eq!(gain.offset, 24.0, "parte de su sitio anterior");
        assert_eq!(gain.flash, Some((Flash::Gain, 1.0)));
        assert_eq!(
            motion.pose(CarId(1), TIMING, t0).flash.map(|f| f.0),
            Some(Flash::Loss)
        );
        let mid = motion.pose(CarId(2), TIMING, t0 + Duration::from_millis(150));
        assert!(mid.offset > 0.0 && mid.offset < 24.0);
        assert_eq!(
            motion.wake(TIMING, t0 + Duration::from_millis(150)),
            Wake::Frame
        );
        let end = t0 + Duration::from_millis(1300);
        assert_eq!(motion.pose(CarId(2), TIMING, end), Pose::default());
        assert_eq!(
            motion.wake(TIMING, end),
            Wake::Idle,
            "acaba y deja de pedir fotogramas"
        );
    }

    #[test]
    fn new_rows_fade_in_and_best_lap_or_pit_entry_flash() {
        let t0 = Instant::now();
        let mut motion = Motion::default();
        motion.update(&[sample(1, 0.0, 1)], TIMING, t0);
        let mut best = sample(1, 0.0, 1);
        best.fastest = true;
        motion.update(&[best, sample(3, 24.0, 2)], TIMING, t0);
        assert_eq!(motion.pose(CarId(3), TIMING, t0).alpha, 0.0);
        assert_eq!(
            motion.pose(CarId(1), TIMING, t0).flash.map(|f| f.0),
            Some(Flash::Best)
        );
        let mut pits = best;
        pits.in_pits = true;
        motion.update(
            &[pits, sample(3, 24.0, 2)],
            TIMING,
            t0 + Duration::from_millis(1300),
        );
        assert_eq!(
            motion
                .pose(CarId(1), TIMING, t0 + Duration::from_millis(1300))
                .flash
                .map(|f| f.0),
            Some(Flash::Pit)
        );
    }

    #[test]
    fn settling_ends_every_animation_but_keeps_detecting_the_next_change() {
        let t0 = Instant::now();
        let mut motion = Motion::default();
        motion.update(&[sample(1, 0.0, 1), sample(2, 24.0, 2)], TIMING, t0);
        motion.update(&[sample(2, 0.0, 1), sample(1, 24.0, 2)], TIMING, t0);
        motion.settle();
        assert_eq!(motion.pose(CarId(1), TIMING, t0), Pose::default());
        assert_eq!(motion.wake(TIMING, t0), Wake::Idle);
        motion.update(&[sample(1, 0.0, 1), sample(2, 24.0, 2)], TIMING, t0);
        assert_eq!(
            motion.pose(CarId(1), TIMING, t0).flash.map(|f| f.0),
            Some(Flash::Gain)
        );
    }

    #[test]
    fn snapping_moves_without_animation() {
        let t0 = Instant::now();
        let mut motion = Motion::default();
        motion.update(&[sample(1, 0.0, 1)], TIMING, t0);
        motion.snap(&[sample(1, 30.0, 1)]);
        assert_eq!(motion.pose(CarId(1), TIMING, t0).offset, 0.0);
        assert_eq!(motion.wake(TIMING, t0), Wake::Idle);
    }
}
