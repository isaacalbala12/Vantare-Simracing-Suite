//! Historia de vuelta observada, indexada por distancia; nunca rellena huecos.
use vantare_domain::{CarId, Quality, SessionId, Snapshot, SourceState};

#[derive(Clone, Copy, Debug)]
pub(super) struct Point {
    pub progress: f32,
    pub delta: f32,
    pub cut: bool,
}
type Identity = (
    u64,
    SessionId,
    CarId,
    vantare_domain::delta::Reference,
    Option<u64>,
    Option<u64>,
);

#[derive(Clone, Default)]
pub(super) struct History {
    pub points: Vec<Point>,
    pub previous: Vec<Point>,
    identity: Option<Identity>,
    lap: Option<u32>,
    last_sequence: Option<u64>,
    cut: bool,
    last_at: Option<std::time::Duration>,
}
impl History {
    #[cfg(test)]
    pub fn push(&mut self, snapshot: &Snapshot) -> bool {
        let board = vantare_domain::delta::project(
            snapshot,
            vantare_domain::format::Preferences::default(),
        );
        self.push_with_board(snapshot, &board)
    }

    pub fn push_with_board(
        &mut self,
        snapshot: &Snapshot,
        board: &vantare_domain::delta::Board,
    ) -> bool {
        let mut changed = false;
        let reference = board.reference_lap_s.map(f64::to_bits);
        let length = snapshot
            .state
            .session
            .track_length_m
            .current()
            .filter(|v| v.is_finite() && **v > 0.0)
            .map(|v| v.to_bits());
        let identity = snapshot.state.player.map(|p| {
            (
                snapshot.epoch,
                snapshot.state.session.id,
                p.car,
                board.reference,
                reference,
                length,
            )
        });
        if identity != self.identity
            || matches!(
                snapshot.state.source_state,
                SourceState::Waiting | SourceState::Lost
            )
        {
            changed = !self.points.is_empty() || !self.previous.is_empty();
            *self = Self {
                identity,
                ..Self::default()
            };
            if snapshot.state.source_state != SourceState::Live {
                return changed;
            }
        }
        let lap = snapshot
            .state
            .player_car()
            .and_then(|c| c.laps.current().copied());
        if lap != self.lap {
            self.previous = if self.lap.and_then(|n| n.checked_add(1)) == lap {
                std::mem::take(&mut self.points)
            } else {
                self.points.clear();
                Vec::new()
            };
            self.lap = lap;
            self.last_sequence = None;
            self.cut = true;
        }
        let Some(_player) = snapshot.state.player else {
            return changed;
        };
        let car = snapshot.state.player_car();
        let progress = car
            .and_then(|c| c.lap_distance_m.current())
            .zip(snapshot.state.session.track_length_m.current())
            .and_then(|(d, l)| {
                (d.is_finite() && l.is_finite() && *l > 0.0 && *d >= 0.0 && d <= l)
                    .then_some((d / l) as f32)
            });
        let delta = match board.delta {
            Quality::Reliable(v) | Quality::Estimated(v) if v.is_finite() => Some(v as f32),
            _ => None,
        };
        if snapshot.state.source_state != SourceState::Live || progress.is_none() || delta.is_none()
        {
            self.cut = true;
            return changed;
        }
        if self.last_sequence.is_some_and(|n| snapshot.sequence <= n) {
            return changed;
        }
        self.cut |= self
            .last_sequence
            .is_none_or(|n| n.checked_add(1) != Some(snapshot.sequence));
        let at = snapshot.origin.received_at;
        self.cut |= self.last_at.is_some_and(|last| {
            at < last || at.saturating_sub(last) > std::time::Duration::from_millis(500)
        });
        self.last_at = Some(at);
        self.last_sequence = Some(snapshot.sequence);
        let (Some(progress), Some(delta)) = (progress, delta) else {
            return changed;
        };
        if self.points.last().is_some_and(|p| progress < p.progress) {
            self.points.clear();
            self.cut = true;
        }
        // Un punto por milésima de vuelta limita memoria y coste a 1001 puntos.
        if self
            .points
            .last()
            .is_some_and(|p| (p.progress * 1000.0) as u32 == (progress * 1000.0) as u32)
        {
            return changed;
        }
        self.points.push(Point {
            progress,
            delta,
            cut: self.cut,
        });
        self.cut = false;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn photo(sequence: u64, lap: u32, progress: f64) -> Snapshot {
        let mut s = crate::source::realistic(0);
        s.sequence = sequence;
        s.state.source_state = SourceState::Live;
        s.state.session.track_length_m = Quality::Reliable(1000.0);
        let id = s.state.player.expect("jugador").car;
        let car = s.state.cars.iter_mut().find(|c| c.id == id).expect("coche");
        car.laps = Quality::Reliable(lap);
        car.lap_distance_m = Quality::Reliable(progress * 1000.0);
        s.state.player.as_mut().expect("jugador").delta_best_s = Quality::Reliable(-0.2);
        s
    }
    #[test]
    fn a_new_reference_discards_old_deltas_instead_of_combining_bases() {
        let mut h = History::default();
        h.push(&photo(1, 1, 0.2));
        h.push(&photo(2, 1, 0.9));
        h.push(&photo(3, 2, 0.1));
        let mut next = photo(4, 2, 0.2);
        let id = next.state.player.expect("jugador").car;
        next.state
            .cars
            .iter_mut()
            .find(|c| c.id == id)
            .expect("coche")
            .best_lap_s = Quality::Reliable(1.234);
        h.push(&next);
        assert!(h.previous.is_empty());
        assert_eq!(h.points.len(), 1);
    }

    #[test]
    fn lap_wrap_retains_previous_but_source_change_clears_both() {
        let mut h = History::default();
        h.push(&photo(1, 1, 0.2));
        h.push(&photo(2, 1, 0.9));
        h.push(&photo(3, 2, 0.1));
        assert_eq!((h.points.len(), h.previous.len()), (1, 2));
        let mut s = photo(4, 2, 0.2);
        s.epoch += 1;
        h.push(&s);
        assert!(h.previous.is_empty());
        assert_eq!(h.points.len(), 1);
    }
    #[test]
    fn lost_or_missing_samples_cannot_bridge_a_gap() {
        let mut h = History::default();
        h.push(&photo(1, 1, 0.1));
        h.push(&photo(3, 1, 0.2));
        assert!(h.points[1].cut);
        let mut s = photo(4, 1, 0.3);
        s.state.player.as_mut().expect("jugador").delta_best_s = Quality::Unavailable;
        h.push(&s);
        h.push(&photo(5, 1, 0.4));
        assert!(h.points[2].cut);
        s.state.source_state = SourceState::Lost;
        h.push(&s);
        assert!(h.points.is_empty());
    }
}
