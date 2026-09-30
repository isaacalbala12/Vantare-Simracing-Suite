//! FLIP horizontal, entradas/salidas de 120 ms y aviso de adelantamiento 450 ms.
//! Estado acotado a las cinco tarjetas; los textos no disparan movimiento.

use crate::app::Wake;
use std::time::{Duration, Instant};
use vantare_domain::broadcast_tower::{Row, Status, ViewModel};

const FADE: Duration = Duration::from_millis(120);
const CUE: Duration = Duration::from_millis(450);

#[derive(Clone)]
pub(super) struct Card {
    pub row: Row,
    pub slot: f32,
    pub opacity: f32,
    /// +1 gana, -1 pierde, 0 no hay aviso.
    pub cue: f32,
}

struct Transition {
    row: Row,
    from: f32,
    to: f32,
    opacity: f32,
    entering: bool,
    exiting: bool,
    cue: f32,
    start: Instant,
}

impl Transition {
    fn duration(&self) -> Duration {
        // Tarjeta por defecto congelada (345,16 px + borde); tope del producto.
        Duration::from_secs_f32(
            (250.0 + (self.from - self.to).abs() * 346.16 * 0.28).min(360.0) / 1000.0,
        )
    }
}

#[derive(Default)]
pub(super) struct Motion {
    cards: Vec<Transition>,
}

impl Motion {
    pub(super) fn reset(&mut self, vm: &ViewModel, now: Instant) {
        self.cards = vm
            .rows
            .iter()
            .enumerate()
            .map(|(slot, row)| Transition {
                row: row.clone(),
                from: slot as f32,
                to: slot as f32,
                opacity: 1.0,
                entering: false,
                exiting: false,
                cue: 0.0,
                start: now,
            })
            .collect();
    }

    pub(super) fn ingest(&mut self, previous: &ViewModel, next: &ViewModel, now: Instant) {
        let valid = |vm: &ViewModel| {
            vm.status == Status::Ready
                && vm.rows.iter().enumerate().all(|(i, row)| {
                    row.place.is_some() && !vm.rows[..i].iter().any(|other| other.id == row.id)
                })
        };
        if !valid(previous) || !valid(next) || previous.session != next.session {
            self.reset(next, now);
            return;
        }
        let before: Vec<_> = previous.rows.iter().map(|row| row.id).collect();
        let after: Vec<_> = next.rows.iter().map(|row| row.id).collect();
        if before == after {
            for card in &mut self.cards {
                if let Some(row) = next.rows.iter().find(|row| row.id == card.row.id) {
                    card.row = row.clone();
                }
            }
            return;
        }
        let visible = self.frame(now);
        let common_before: Vec<_> = before.iter().filter(|id| after.contains(id)).collect();
        let common_after: Vec<_> = after.iter().filter(|id| before.contains(id)).collect();
        let mut cards: Vec<_> = next
            .rows
            .iter()
            .enumerate()
            .map(|(slot, row)| {
                let old = visible.iter().find(|card| card.row.id == row.id);
                let a = common_before.iter().position(|id| **id == row.id);
                let b = common_after.iter().position(|id| **id == row.id);
                let cue = match (a, b) {
                    (Some(a), Some(b)) if b < a => 1.0,
                    (Some(a), Some(b)) if b > a => -1.0,
                    _ => 0.0,
                };
                Transition {
                    row: row.clone(),
                    from: old.map_or(slot as f32, |card| card.slot),
                    to: slot as f32,
                    opacity: old.map_or(0.0, |card| card.opacity),
                    entering: !before.contains(&row.id),
                    exiting: false,
                    cue,
                    start: now,
                }
            })
            .collect();
        for old in visible
            .into_iter()
            .filter(|card| before.contains(&card.row.id) && !after.contains(&card.row.id))
        {
            cards.push(Transition {
                row: old.row,
                from: old.slot,
                to: old.slot,
                opacity: old.opacity,
                entering: false,
                exiting: true,
                cue: 0.0,
                start: now,
            });
        }
        self.cards = cards;
    }

    pub(super) fn frame(&self, now: Instant) -> Vec<Card> {
        self.cards
            .iter()
            .filter_map(|card| {
                let elapsed = now.saturating_duration_since(card.start);
                if card.exiting && elapsed >= FADE {
                    return None;
                }
                let fade = ease(
                    (elapsed.as_secs_f32() / FADE.as_secs_f32()).min(1.0),
                    (0.0, 0.0, 0.58, 1.0),
                );
                let progress = (elapsed.as_secs_f32() / card.duration().as_secs_f32()).min(1.0);
                // Cubic-bezier(0.2, .75, .3, 1), mediante bisección del eje x.
                let slide = ease(progress, (0.2, 0.75, 0.3, 1.0));
                Some(Card {
                    row: card.row.clone(),
                    slot: card.from + (card.to - card.from) * slide,
                    opacity: if card.exiting {
                        card.opacity * (1.0 - fade)
                    } else if card.entering {
                        card.opacity + (1.0 - card.opacity) * fade
                    } else {
                        1.0
                    },
                    cue: card.cue
                        * (1.0
                            - ease(
                                (elapsed.as_secs_f32() / CUE.as_secs_f32()).min(1.0),
                                (0.0, 0.0, 0.58, 1.0),
                            )),
                })
            })
            .collect()
    }

    pub(super) fn wake(&self, now: Instant) -> Wake {
        if self.cards.iter().any(|card| {
            let elapsed = now.saturating_duration_since(card.start);
            ((card.from - card.to).abs() > 0.001 && elapsed < card.duration())
                || ((card.entering || card.exiting) && elapsed < FADE)
                || (card.cue.abs() > 0.0 && elapsed < CUE)
        }) {
            Wake::Frame
        } else {
            Wake::Idle
        }
    }
}

fn ease(x: f32, curve: (f32, f32, f32, f32)) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let (mut low, mut high) = (0.0_f32, 1.0_f32);
    for _ in 0..12 {
        let t = f32::midpoint(low, high);
        let u = 1.0 - t;
        let bx = 3.0 * u * u * t * curve.0 + 3.0 * u * t * t * curve.2 + t * t * t;
        if bx < x {
            low = t;
        } else {
            high = t;
        }
    }
    let t = f32::midpoint(low, high);
    let u = 1.0 - t;
    3.0 * u * u * t * curve.1 + 3.0 * u * t * t * curve.3 + t * t * t
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{
        Capability, Car, CarId, Quality, Snapshot, broadcast_tower, format::Preferences,
    };

    fn vm(ids: &[u32]) -> ViewModel {
        let mut snapshot = Snapshot::default();
        snapshot.state.source_state = vantare_domain::SourceState::Live;
        snapshot.state.capabilities.positions = Capability::Fresh;
        snapshot.state.cars = ids
            .iter()
            .enumerate()
            .map(|(i, id)| Car {
                id: CarId(*id),
                position: Quality::Reliable(i as u32 + 1),
                ..Car::default()
            })
            .collect();
        broadcast_tower::project(&snapshot, Preferences::default())
    }

    #[test]
    fn reorder_retargets_and_ends_while_telemetry_does_not_trigger_motion() {
        let now = Instant::now();
        let mut motion = Motion::default();
        let before = vm(&[1, 2, 3]);
        motion.reset(&before, now);
        assert_eq!(motion.wake(now), Wake::Idle);
        let next = vm(&[2, 1, 3]);
        motion.ingest(&before, &next, now);
        assert_eq!(motion.wake(now), Wake::Frame);
        let midway = now + Duration::from_millis(100);
        let slot = motion.frame(midway)[0].slot;
        let again = vm(&[1, 2, 3]);
        motion.ingest(&next, &again, midway);
        assert!((motion.frame(midway)[1].slot - slot).abs() < 0.001);
        let settled = midway + Duration::from_secs(1);
        assert_eq!(motion.wake(settled), Wake::Idle);
        let mut text_change = again.clone();
        text_change.rows[0].gap = "+1.235".into();
        motion.ingest(&again, &text_change, settled);
        assert_eq!(motion.wake(settled), Wake::Idle);
    }

    #[test]
    fn insertion_is_not_an_overtake_and_ghosts_expire() {
        let now = Instant::now();
        let mut motion = Motion::default();
        let before = vm(&[1, 2, 3]);
        motion.reset(&before, now);
        let next = vm(&[4, 1, 2]);
        motion.ingest(&before, &next, now);
        assert!(motion.frame(now).iter().all(|card| card.cue.abs() < 0.001));
        assert_eq!(motion.frame(now).len(), 4);
        assert_eq!(motion.frame(now + FADE).len(), 3);
        assert_eq!(motion.wake(now + Duration::from_secs(1)), Wake::Idle);
    }
}
