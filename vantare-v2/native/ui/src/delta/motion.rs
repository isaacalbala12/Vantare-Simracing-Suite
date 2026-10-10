use crate::app::Wake;
use std::time::{Duration, Instant};
use vantare_domain::delta::{self, Event, Status, Tone, ViewModel};

const FILL: Duration = Duration::from_millis(140);
const FADE: Duration = Duration::from_millis(180);
const CROSS: Duration = Duration::from_millis(700);
const CROSS_FADE: Duration = Duration::from_millis(350);

#[derive(Clone, Copy)]
pub(super) struct Frame {
    pub fill: [f32; 2],
    pub event: Option<Event>,
    pub notice_alpha: f32,
    pub cross: Option<Tone>,
    pub cross_alpha: f32,
}

#[derive(Default)]
pub(super) struct Motion {
    fill: Option<(Instant, [f32; 2], [f32; 2])>,
    event: Option<(Instant, Event)>,
    cross: Option<(Instant, Tone)>,
    last_side: Option<Tone>,
}

fn geometry(vm: &ViewModel) -> [f32; 2] {
    let progress = vm.progress.unwrap_or(0.0);
    [0.5 + progress.min(0.0) * 0.5, progress.abs() * 0.5]
}

fn side(tone: Tone) -> Option<Tone> {
    (tone != Tone::Neutral).then_some(tone)
}

fn event_life(event: Event) -> Duration {
    Duration::from_millis(if event == Event::PersonalBest {
        4000
    } else {
        2600
    })
}

#[allow(clippy::cast_possible_truncation)] // Cociente de duraciones acotado.
fn fraction(elapsed: Duration, duration: Duration) -> f32 {
    (elapsed.as_secs_f64() / duration.as_secs_f64()).clamp(0.0, 1.0) as f32
}

impl Motion {
    pub fn update(&mut self, prev: &ViewModel, next: &ViewModel, now: Instant) {
        if prev.identity != next.identity
            || prev.requested_reference != next.requested_reference
            || prev.status != Status::Ready
            || next.status != Status::Ready
        {
            *self = Self {
                last_side: side(next.tone),
                ..Self::default()
            };
            return;
        }
        if prev.progress != next.progress {
            self.fill = Some((now, self.frame(prev, now).fill, geometry(next)));
        }
        self.last_side = side(prev.tone).or(self.last_side);
        if let Some(to) = side(next.tone) {
            if side(prev.tone)
                .or(self.last_side)
                .is_some_and(|from| from != to)
            {
                self.cross = Some((now, to));
            }
            self.last_side = Some(to);
        }
        if let Some(event) = delta::event(prev, next) {
            self.event = Some((now, event));
        }
    }

    pub fn frame(&self, vm: &ViewModel, now: Instant) -> Frame {
        let mut fill = geometry(vm);
        if let Some((start, from, to)) = self.fill {
            let t = fraction(now.saturating_duration_since(start), FILL);
            fill = [
                from[0] + (to[0] - from[0]) * t,
                from[1] + (to[1] - from[1]) * t,
            ];
        }
        let mut frame = Frame {
            fill,
            event: None,
            notice_alpha: 0.0,
            cross: None,
            cross_alpha: 0.0,
        };
        if let Some((start, event)) = self.event {
            let age = now.saturating_duration_since(start);
            let life = event_life(event);
            if age < life + FADE {
                frame.event = Some(event);
                frame.notice_alpha = if age < FADE {
                    1.0 - (1.0 - fraction(age, FADE)).powi(3)
                } else if age < life {
                    1.0
                } else {
                    (1.0 - fraction(age.saturating_sub(life), FADE)).powi(3)
                };
            }
        }
        if let Some((start, tone)) = self.cross {
            let age = now.saturating_duration_since(start);
            if age < CROSS + CROSS_FADE {
                frame.cross = Some(tone);
                frame.cross_alpha = if age < CROSS_FADE {
                    fraction(age, CROSS_FADE)
                } else if age < CROSS {
                    1.0
                } else {
                    1.0 - fraction(age.saturating_sub(CROSS), CROSS_FADE)
                };
            }
        }
        frame
    }

    /// Conserva los avisos, pero cambia de estado de golpe y solo despierta al caducar.
    pub fn reduced_frame(&self, vm: &ViewModel, now: Instant) -> (Frame, Wake) {
        let event = self
            .event
            .filter(|(start, event)| now.saturating_duration_since(*start) < event_life(*event));
        let cross = self
            .cross
            .filter(|(start, _)| now.saturating_duration_since(*start) < CROSS);
        let next = event
            .map(|(start, event)| (start, event_life(event)))
            .into_iter()
            .chain(cross.map(|(start, _)| (start, CROSS)))
            .map(|(start, life)| life.saturating_sub(now.saturating_duration_since(start)))
            .min();
        (
            Frame {
                fill: geometry(vm),
                event: event.map(|(_, event)| event),
                notice_alpha: if event.is_some() { 1.0 } else { 0.0 },
                cross: cross.map(|(_, tone)| tone),
                cross_alpha: if cross.is_some() { 1.0 } else { 0.0 },
            },
            next.map_or(Wake::Idle, Wake::At),
        )
    }

    pub fn wake(&self, now: Instant) -> Wake {
        let mut wake_at: Option<Duration> = None;
        if self
            .fill
            .is_some_and(|(start, _, _)| now.saturating_duration_since(start) < FILL)
        {
            return Wake::Frame;
        }
        for (start, hold, fade, entrance) in self
            .event
            .map(|(t, e)| (t, event_life(e), FADE, FADE))
            .into_iter()
            .chain(self.cross.map(|(t, _)| (t, CROSS, CROSS_FADE, CROSS_FADE)))
        {
            let age = now.saturating_duration_since(start);
            if age < entrance || (age >= hold && age < hold + fade) {
                return Wake::Frame;
            }
            if age < hold {
                wake_at = Some(wake_at.map_or(hold.saturating_sub(age), |d| {
                    d.min(hold.saturating_sub(age))
                }));
            }
        }
        wake_at.map_or(Wake::Idle, Wake::At)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Car, CarId, Player, Quality, Snapshot, format::Preferences};

    fn vm(delta: f64, lap: u32, best: f64) -> ViewModel {
        let mut s = Snapshot::default();
        s.state.source_state = vantare_domain::SourceState::Live;
        s.state.player = Some(Player {
            car: CarId(1),
            delta_best_s: Quality::Reliable(delta),
            ..Player::default()
        });
        s.state.cars.push(Car {
            id: CarId(1),
            laps: Quality::Reliable(lap),
            best_lap_s: Quality::Reliable(best),
            last_lap_s: Quality::Reliable(best + 0.2),
            ..Car::default()
        });
        delta::project(&s, Preferences::default())
    }

    #[test]
    fn reduced_motion_keeps_notices_and_expires_without_a_fade() {
        let now = Instant::now();
        let mut motion = Motion::default();
        let before = vm(0.2, 10, 90.0);
        let after = vm(0.2, 11, 89.0);
        motion.update(&before, &after, now);
        let (frame, wake) = motion.reduced_frame(&after, now);
        assert_eq!(frame.event, Some(Event::PersonalBest));
        assert_eq!(frame.notice_alpha, 1.0);
        assert!(matches!(wake, Wake::At(_)));
        let (frame, wake) = motion.reduced_frame(&after, now + Duration::from_secs(4));
        assert_eq!(frame.event, None);
        assert_eq!(frame.notice_alpha, 0.0);
        assert_eq!(wake, Wake::Idle);
    }

    #[test]
    fn notices_expire_and_hold_without_requesting_frames() {
        let now = Instant::now();
        for (best, expected, life) in [
            (90.0, Event::LapCompleted, 2600),
            (89.0, Event::PersonalBest, 4000),
        ] {
            let mut m = Motion::default();
            let a = vm(0.2, 10, 90.0);
            let b = vm(0.2, 11, best);
            m.update(&a, &b, now);
            assert_eq!(m.frame(&b, now + FADE).event, Some(expected));
            assert!(matches!(m.wake(now), Wake::Frame));
            assert!(matches!(m.wake(now + FADE), Wake::At(_)));
            let end = now + Duration::from_millis(life) + FADE;
            assert!(matches!(m.wake(end), Wake::Idle));
            assert_eq!(m.frame(&b, end).event, None);
        }
    }

    #[test]
    fn crossing_remembers_neutral_and_drains_both_geometry_axes() {
        let now = Instant::now();
        let mut m = Motion::default();
        let losing = vm(0.75, 10, 90.0);
        let neutral = vm(0.0, 10, 90.0);
        let gaining = vm(-0.75, 10, 90.0);
        m.update(&losing, &neutral, now);
        m.update(&neutral, &gaining, now + FILL);
        let half = m.frame(&gaining, now + FILL + FILL / 2);
        assert_eq!(half.cross, Some(Tone::Gaining));
        assert!((half.fill[0] - 0.375).abs() < 1e-6);
        assert!((half.fill[1] - 0.125).abs() < 1e-6);
        assert!(matches!(m.wake(now + FILL + CROSS), Wake::Frame));
        assert!(matches!(
            m.wake(now + FILL + CROSS + CROSS_FADE),
            Wake::Idle
        ));
    }

    #[test]
    fn a_reset_cancels_notices_and_first_data_is_idle() {
        let now = Instant::now();
        let mut m = Motion::default();
        let a = vm(0.2, 10, 90.0);
        let mut b = vm(-0.2, 11, 89.0);
        m.update(&a, &b, now);
        b.identity.0 += 1;
        m.update(&a, &b, now);
        assert!(matches!(m.wake(now), Wake::Idle));
        m.update(
            &delta::project(&Snapshot::default(), Preferences::default()),
            &b,
            now,
        );
        assert!(matches!(m.wake(now), Wake::Idle));
    }

    #[test]
    fn rapid_updates_keep_the_current_fill_and_replace_the_notice_deadline() {
        let now = Instant::now();
        let mut m = Motion::default();
        let a = vm(0.75, 10, 90.0);
        let b = vm(-0.75, 11, 90.0);
        m.update(&a, &b, now);
        let at = now + FILL / 2;
        let current = m.frame(&b, at).fill;
        let c = vm(0.75, 11, 90.0);
        m.update(&b, &c, at);
        assert_eq!(m.frame(&c, at).fill, current);
        let renewed = now + Duration::from_millis(2500);
        let d = vm(0.75, 12, 90.0);
        m.update(&c, &d, renewed);
        assert_eq!(
            m.frame(&d, now + Duration::from_millis(2780)).event,
            Some(Event::LapCompleted)
        );
        assert!(matches!(
            m.wake(renewed + Duration::from_millis(2780)),
            Wake::Idle
        ));
    }
}
