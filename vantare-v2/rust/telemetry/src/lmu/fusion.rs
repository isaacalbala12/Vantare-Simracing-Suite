//! Conservative REST identity join over an admitted SHM grid.

use super::{AdmittedGrid, SessionType, rest::RestCache};
use crate::quality::{Field, Freshness};

pub const DEFAULT_REST_TTL_NS: u64 = 2_000_000_000;

#[derive(Debug, Default)]
pub struct SessionFloor {
    last: Option<(String, SessionType)>,
    floor_ns: Option<u64>,
}

impl SessionFloor {
    pub fn observe_shm(&mut self, grid: &AdmittedGrid, received_ns: u64, clock_reset: bool) {
        if clock_reset {
            self.floor_ns = Some(received_ns);
        }
        let (
            Field::Present {
                value: track,
                freshness: Freshness::Fresh,
                ..
            },
            Field::Present {
                value: session,
                freshness: Freshness::Fresh,
                ..
            },
        ) = (&grid.session.track_name, &grid.session.session_type)
        else {
            return;
        };
        if track.trim().is_empty() || *session == SessionType::Unknown {
            return;
        }
        let key = (track.clone(), *session);
        if self.last.as_ref().is_some_and(|last| last != &key) {
            self.floor_ns = Some(received_ns);
        }
        self.last = Some(key);
    }

    pub fn floor_ns(&self) -> Option<u64> {
        self.floor_ns
    }
}

/// `session_floor_ns` is raised by a fresh SHM session change or clock reset.
/// A REST poll begun before that floor cannot name a reused SHM slot.
pub fn join_car_numbers(
    grid: &mut AdmittedGrid,
    rest: &RestCache,
    now_ns: u64,
    session_floor_ns: Option<u64>,
) -> usize {
    for row in &mut grid.vehicles {
        row.car_number = Field::Missing;
    }
    let Some(standings) = &rest.standings else {
        return 0;
    };
    let Some(started) = rest.car_numbers_started_ns() else {
        return 0;
    };
    if now_ns < started
        || now_ns - started > DEFAULT_REST_TTL_NS
        || session_floor_ns.is_some_and(|floor| started < floor)
    {
        return 0;
    }
    let mut joined = 0;
    for row in &mut grid.vehicles {
        let Some(entry) = standings
            .car_numbers
            .iter()
            .find(|entry| entry.slot == row.source_id)
        else {
            continue;
        };
        // Decoding removes duplicate slots, but keep this guard for any
        // future cache source to avoid assigning an ambiguous identity.
        if standings
            .car_numbers
            .iter()
            .filter(|other| other.slot == row.source_id)
            .count()
            != 1
            || entry.vehicle.is_empty()
        {
            continue;
        }
        let Field::Present {
            value: vehicle_name,
            freshness,
            ..
        } = &row.vehicle_name
        else {
            continue;
        };
        if *freshness == Freshness::Invalid || vehicle_name.trim() != entry.vehicle {
            continue;
        }
        row.car_number = Field::observed(entry.number.clone());
        joined += 1;
    }
    joined
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lmu::admit_v13;

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn rest_numbers_join_only_matching_existing_shm_rows() {
        let mut grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first = &grid.vehicles[0];
        let body = format!(
            r#"[{{"slotID":{},"carNumber":"007","vehicleName":"{}"}},{{"slotID":9999,"carNumber":"9","vehicleName":"Unknown"}}]"#,
            first.source_id,
            first.vehicle_name.value().unwrap()
        );
        let mut rest = RestCache::default();
        rest.accept_standings(body.as_bytes(), 100, 110);
        assert_eq!(join_car_numbers(&mut grid, &rest, 110, None), 1);
        assert_eq!(grid.vehicles.len(), 44);
        assert_eq!(
            grid.vehicles[0].car_number,
            Field::observed("007".to_owned())
        );
        assert!(
            grid.vehicles[1..]
                .iter()
                .all(|row| row.car_number == Field::Missing)
        );
        assert_eq!(join_car_numbers(&mut grid, &rest, 110, Some(101)), 0);
        assert_eq!(grid.vehicles[0].car_number, Field::Missing);
    }

    #[test]
    fn stale_and_mismatched_rest_identity_never_publish() {
        let mut grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let slot = grid.vehicles[0].source_id;
        let mut rest = RestCache::default();
        rest.accept_standings(
            format!(r#"[{{"slotID":{slot},"carNumber":"007","vehicleName":"Other car"}}]"#)
                .as_bytes(),
            100,
            110,
        );
        assert_eq!(join_car_numbers(&mut grid, &rest, 110, None), 0);
        let name = grid.vehicles[0].vehicle_name.value().unwrap().clone();
        rest.accept_standings(
            format!(r#"[{{"slotID":{slot},"carNumber":"007","vehicleName":"{name}"}}]"#).as_bytes(),
            100,
            110,
        );
        assert_eq!(
            join_car_numbers(&mut grid, &rest, DEFAULT_REST_TTL_NS + 101, None),
            0
        );
        assert_eq!(join_car_numbers(&mut grid, &rest, 99, None), 0);
    }

    #[test]
    fn session_change_and_clock_reset_raise_identity_floor() {
        let mut grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut floor = SessionFloor::default();
        floor.observe_shm(&grid, 100, false);
        assert_eq!(floor.floor_ns(), None);
        floor.observe_shm(&grid, 110, false);
        assert_eq!(floor.floor_ns(), None);
        grid.session.track_name = Field::observed("Another circuit".to_owned());
        floor.observe_shm(&grid, 120, false);
        assert_eq!(floor.floor_ns(), Some(120));
        floor.observe_shm(&grid, 130, true);
        assert_eq!(floor.floor_ns(), Some(130));
        grid.session.track_name = Field::invalid_observed(String::new());
        floor.observe_shm(&grid, 140, false);
        assert_eq!(floor.floor_ns(), Some(130));
    }
}
