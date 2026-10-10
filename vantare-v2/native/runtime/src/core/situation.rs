//! Situación central: 250 ms de confirmación antes de ocultar; recuperación inmediata.
use std::time::Duration;
use vantare_domain::{DrivingSituation as Situation, Quality, Snapshot, SourceState};

fn reliable<T: Copy>(quality: &Quality<T>) -> Option<T> {
    if let Quality::Reliable(value) = quality {
        Some(*value)
    } else {
        None
    }
}

#[derive(Default)]
pub(super) struct Tracker {
    pending: Option<(Situation, Duration)>,
    confirmed: Situation,
    last: Option<Duration>,
}

impl Tracker {
    pub(super) fn reset(&mut self) {
        *self = Self::default();
    }

    pub(super) fn deadline(&self) -> Option<Duration> {
        self.pending
            .filter(|(candidate, _)| *candidate != self.confirmed)
            .map(|(_, since)| since.saturating_add(Duration::from_millis(250)))
    }

    /// Un status SHM puede congelarse durante pausa. Se confirma dentro de su
    /// plazo vigente, sin inventar una segunda adquisición para el mismo dato.
    pub(super) fn advance(&mut self, now: Duration) -> Option<Situation> {
        let (candidate, since) = self.pending?;
        if self.last.is_some_and(|last| {
            now >= last && now.saturating_sub(last) < Duration::from_millis(500)
        }) && now.saturating_sub(since) >= Duration::from_millis(250)
            && candidate != self.confirmed
        {
            self.confirmed = candidate;
            Some(candidate)
        } else {
            None
        }
    }

    pub(super) fn update(&mut self, snapshot: &mut Snapshot) {
        let state = &snapshot.state;
        let candidate = match state.source_state {
            SourceState::Waiting | SourceState::Stale | SourceState::Lost => Situation::Unknown,
            SourceState::Paused => Situation::Paused,
            SourceState::Live
                if matches!(
                    state.driving_situation,
                    Situation::Garage | Situation::Replay | Situation::OnTrack
                ) =>
            {
                state.driving_situation
            }
            SourceState::Live => {
                let pit = state.player_car().and_then(|car| reliable(&car.in_pits));
                let player = state.player.as_ref();
                let speed = player.and_then(|p| reliable(&p.telemetry.speed_mps));
                // Pits y velocidad no distinguen garaje de servicio/cola parada.
                // Solo el adapter puede aportar evidencia explícita de Garage.
                match (pit, speed) {
                    (_, Some(speed)) if speed > 0.5 => Situation::OnTrack,
                    (Some(false), _) => Situation::OnTrack,
                    _ => Situation::Unknown,
                }
            }
        };
        let now = snapshot.origin.received_at;
        if self.last.is_some_and(|last| {
            now < last || now.saturating_sub(last) >= Duration::from_millis(500)
        }) {
            self.reset();
        }
        self.last = Some(now);
        if candidate.off_track() {
            let since = match self.pending {
                Some((old, since)) if old == candidate && now >= since => since,
                _ => {
                    self.pending = Some((candidate, now));
                    now
                }
            };
            if now.saturating_sub(since) >= Duration::from_millis(250) {
                self.confirmed = candidate;
            }
        } else {
            self.pending = None;
            self.confirmed = candidate;
        }
        snapshot.state.driving_situation = self.confirmed;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vantare_domain::{Car, CarId, Player, Quality};

    fn photo(at: u64, pit: Quality<bool>, speed: Quality<f64>) -> Snapshot {
        let mut s = Snapshot::default();
        s.origin.received_at = Duration::from_millis(at);
        s.state.source_state = SourceState::Live;
        s.state.player = Some(Player {
            car: CarId(1),
            telemetry: vantare_domain::Telemetry {
                speed_mps: speed,
                ..vantare_domain::Telemetry::default()
            },
            ..Player::default()
        });
        s.state.cars.push(Car {
            id: CarId(1),
            in_pits: pit,
            ..Car::default()
        });
        s
    }

    #[test]
    fn only_explicit_garage_settles_and_absence_restores_immediately() {
        let mut t = Tracker::default();
        for (at, evidence, expected) in [
            (0, Situation::Garage, Situation::Unknown),
            (249, Situation::Garage, Situation::Unknown),
            (250, Situation::Garage, Situation::Garage),
            (251, Situation::OnTrack, Situation::OnTrack),
            (252, Situation::Garage, Situation::OnTrack),
            (501, Situation::Garage, Situation::OnTrack),
            (502, Situation::Garage, Situation::Garage),
        ] {
            let mut s = photo(at, Quality::Reliable(true), Quality::Reliable(0.0));
            s.state.driving_situation = evidence;
            t.update(&mut s);
            assert_eq!(s.state.driving_situation, expected);
        }
        for missing in [
            Quality::Unavailable,
            Quality::Stale(true),
            Quality::Estimated(true),
        ] {
            let mut s = photo(503, missing, Quality::Reliable(0.0));
            t.update(&mut s);
            assert_eq!(s.state.driving_situation, Situation::Unknown);
        }
    }

    #[test]
    fn stopped_pit_service_or_queue_without_garage_signal_never_hides() {
        let mut t = Tracker::default();
        for stopped in [Quality::Reliable(true), Quality::Unavailable] {
            for at in [0, 250, 500] {
                let mut s = photo(at, Quality::Reliable(true), Quality::Reliable(0.0));
                s.state.player.as_mut().expect("player").pit_stop_stopped = stopped;
                t.update(&mut s);
                assert_eq!(s.state.driving_situation, Situation::Unknown);
                assert!(!s.state.driving_situation.off_track());
            }
        }
    }

    #[test]
    fn pause_expires_and_recorded_transport_is_not_game_replay() {
        let mut t = Tracker::default();
        for (at, source, expected) in [
            (0, SourceState::Paused, Situation::Unknown),
            (250, SourceState::Paused, Situation::Paused),
            (251, SourceState::Stale, Situation::Unknown),
        ] {
            let mut s = photo(at, Quality::Unavailable, Quality::Unavailable);
            s.state.source_state = source;
            t.update(&mut s);
            assert_eq!(s.state.driving_situation, expected);
        }
        let mut s = photo(300, Quality::Reliable(false), Quality::Reliable(20.0));
        s.origin.source.kind = vantare_domain::SourceKind::Replay;
        t.update(&mut s);
        assert_eq!(s.state.driving_situation, Situation::OnTrack);
        for at in [400, 650] {
            s.origin.received_at = Duration::from_millis(at);
            s.state.driving_situation = Situation::Replay;
            t.update(&mut s);
        }
        assert_eq!(s.state.driving_situation, Situation::Replay);
        t.reset();
        s.origin.received_at = Duration::ZERO;
        t.update(&mut s);
        assert_eq!(s.state.driving_situation, Situation::Unknown);
    }
}
