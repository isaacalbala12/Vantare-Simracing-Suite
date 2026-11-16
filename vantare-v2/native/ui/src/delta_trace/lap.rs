//! Historia de vuelta observada, indexada por distancia; nunca rellena huecos.
pub(super) use vantare_domain::delta_trace::{LapHistory as History, LapPoint as Point};

#[cfg(test)]
use vantare_domain::{Quality, Snapshot, SourceState};

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
