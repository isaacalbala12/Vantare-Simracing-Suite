//! Conservative REST identity join over an admitted SHM grid.

use super::{AdmittedGrid, SessionType, rest::RestCache};
use crate::quality::{Field, Freshness};

pub const DEFAULT_REST_TTL_NS: u64 = 2_000_000_000;
pub const DEFAULT_SHM_TTL_NS: u64 = 500_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Source {
    SharedMemory,
    Rest,
    Unknown,
}

#[derive(Debug, PartialEq)]
pub struct Choice<T> {
    pub field: Field<T>,
    pub source: Source,
    pub fallback: bool,
    pub conflict: bool,
}

/// The Go matrix ranks fresh, stale and invalid fields in that order, and
/// preserves preferred-source order within each rank.
pub fn choose_scalar<T: Clone + PartialEq>(
    shared: (&Field<T>, Option<u64>),
    rest: (&Field<T>, Option<u64>),
    now_ns: u64,
    equivalent: bool,
) -> Choice<T> {
    let shared_quality = effective_freshness(shared.0, shared.1, now_ns, DEFAULT_SHM_TTL_NS);
    let rest_quality = effective_freshness(rest.0, rest.1, now_ns, DEFAULT_REST_TTL_NS);
    let conflict = equivalent
        && usable_for_conflict(shared_quality)
        && usable_for_conflict(rest_quality)
        && shared.0.value() != rest.0.value();
    for freshness in [Freshness::Fresh, Freshness::Stale, Freshness::Invalid] {
        if shared_quality == Some(freshness) {
            return Choice {
                field: clone_with_freshness(shared.0, freshness),
                source: Source::SharedMemory,
                fallback: false,
                conflict,
            };
        }
        if equivalent && rest_quality == Some(freshness) {
            return Choice {
                field: clone_with_freshness(rest.0, freshness),
                source: Source::Rest,
                fallback: true,
                conflict,
            };
        }
    }
    Choice {
        field: Field::Missing,
        source: Source::Unknown,
        fallback: false,
        conflict,
    }
}

fn effective_freshness<T>(
    field: &Field<T>,
    updated_ns: Option<u64>,
    now_ns: u64,
    ttl_ns: u64,
) -> Option<Freshness> {
    let Field::Present { freshness, .. } = field else {
        return None;
    };
    if *freshness == Freshness::Fresh
        && updated_ns.is_some_and(|updated| now_ns < updated || now_ns - updated > ttl_ns)
    {
        Some(Freshness::Stale)
    } else {
        Some(*freshness)
    }
}

fn clone_with_freshness<T: Clone>(field: &Field<T>, freshness: Freshness) -> Field<T> {
    let mut chosen = field.clone();
    if let Field::Present {
        freshness: stored, ..
    } = &mut chosen
    {
        *stored = freshness;
    }
    chosen
}

fn usable_for_conflict(freshness: Option<Freshness>) -> bool {
    matches!(freshness, Some(Freshness::Fresh | Freshness::Stale))
}

#[derive(Debug, PartialEq)]
pub struct FusedSession {
    pub source_time_ns: Choice<i64>,
    pub track_name: Choice<String>,
    pub session_type: Choice<SessionType>,
    pub vehicle_count: Choice<i32>,
    pub player_present: Choice<bool>,
}

#[derive(Debug, PartialEq)]
pub struct FusedPlayer {
    pub position: Choice<i32>,
    pub completed_laps: Choice<i32>,
    pub pit_stop_count: Choice<i32>,
}

pub fn fuse_player(
    grid: &AdmittedGrid,
    shared_updated_ns: u64,
    rest: &RestCache,
    now_ns: u64,
) -> FusedPlayer {
    let missing = Field::Missing;
    let player = grid.player_index.and_then(|index| grid.vehicles.get(index));
    let rest_player = player.and(rest.standings.as_ref());
    let pair = |shared: Option<&Field<i32>>, alternative: Option<&Field<i32>>| {
        choose_scalar(
            (shared.unwrap_or(&missing), Some(shared_updated_ns)),
            (alternative.unwrap_or(&missing), rest.standings_updated_ns()),
            now_ns,
            true,
        )
    };
    FusedPlayer {
        position: pair(
            player.map(|row| &row.position),
            rest_player.map(|row| &row.player_position),
        ),
        completed_laps: pair(
            player.map(|row| &row.completed_laps),
            rest_player.map(|row| &row.completed_laps),
        ),
        pit_stop_count: pair(
            player.map(|row| &row.pit_stop_count),
            rest_player.map(|row| &row.pit_stop_count),
        ),
    }
}

pub fn fuse_session(
    grid: &AdmittedGrid,
    shared_updated_ns: u64,
    rest: &RestCache,
    now_ns: u64,
) -> FusedSession {
    let missing_name = Field::Missing;
    let missing_time = Field::Missing;
    let missing_type = Field::Missing;
    let missing_count = Field::Missing;
    let missing_player = Field::Missing;
    let (rest_name, rest_type, rest_count, rest_time) = rest.session.as_ref().map_or(
        (&missing_name, &missing_type, &missing_count, &missing_time),
        |session| {
            (
                &session.track_name,
                &session.session_type,
                &session.vehicle_count,
                &session.source_time_ns,
            )
        },
    );
    let rest_player = if grid.vehicles.is_empty() {
        &missing_player
    } else {
        rest.standings
            .as_ref()
            .map_or(&missing_player, |standings| &standings.player_present)
    };
    FusedSession {
        source_time_ns: choose_source_time(
            (&grid.session.source_time_ns, Some(shared_updated_ns)),
            (rest_time, rest.session_updated_ns()),
            now_ns,
        ),
        track_name: choose_scalar(
            (&grid.session.track_name, Some(shared_updated_ns)),
            (rest_name, rest.session_updated_ns()),
            now_ns,
            true,
        ),
        session_type: choose_scalar(
            (&grid.session.session_type, Some(shared_updated_ns)),
            (rest_type, rest.session_updated_ns()),
            now_ns,
            true,
        ),
        vehicle_count: choose_scalar(
            (&grid.vehicle_count, Some(shared_updated_ns)),
            (rest_count, rest.session_updated_ns()),
            now_ns,
            true,
        ),
        player_present: choose_scalar(
            (&grid.player_present, Some(shared_updated_ns)),
            (rest_player, rest.standings_updated_ns()),
            now_ns,
            true,
        ),
    }
}

pub fn choose_source_time(
    shared: (&Field<i64>, Option<u64>),
    rest: (&Field<i64>, Option<u64>),
    now_ns: u64,
) -> Choice<i64> {
    let mut choice = choose_scalar(shared, rest, now_ns, true);
    let shared_quality = effective_freshness(shared.0, shared.1, now_ns, DEFAULT_SHM_TTL_NS);
    let rest_quality = effective_freshness(rest.0, rest.1, now_ns, DEFAULT_REST_TTL_NS);
    choice.conflict = usable_for_conflict(shared_quality)
        && usable_for_conflict(rest_quality)
        && match (projected_time(shared, now_ns), projected_time(rest, now_ns)) {
            (Some(left), Some(right)) => left.abs_diff(right) > DEFAULT_SHM_TTL_NS,
            _ => true,
        };
    choice
}

fn projected_time(input: (&Field<i64>, Option<u64>), now_ns: u64) -> Option<i64> {
    let value = *input.0.value()?;
    let received = input.1?;
    if value < 0 || now_ns < received {
        return None;
    }
    value.checked_add(i64::try_from(now_ns - received).ok()?)
}

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
    fn scalar_authority_ranks_quality_then_source_and_bounds_conflicts() {
        let shared = Field::observed(3_i32);
        let rest = Field::observed(4_i32);
        let chosen = choose_scalar((&shared, Some(100)), (&rest, Some(100)), 200, true);
        assert_eq!(chosen.source, Source::SharedMemory);
        assert!(chosen.conflict);
        let chosen = choose_scalar(
            (&shared, Some(100)),
            (&rest, Some(600_000_000)),
            600_000_000,
            true,
        );
        assert_eq!(chosen.source, Source::Rest);
        assert!(chosen.fallback);
        assert!(chosen.conflict);
        let invalid = Field::invalid_observed(0_i32);
        let chosen = choose_scalar((&invalid, Some(100)), (&rest, Some(100)), 200, true);
        assert_eq!(chosen.source, Source::Rest);
        let chosen = choose_scalar((&invalid, Some(100)), (&rest, Some(100)), 200, false);
        assert_eq!(chosen.field, invalid);
        assert!(!chosen.conflict);
        let missing: Field<i32> = Field::Missing;
        let chosen = choose_scalar((&missing, None), (&missing, None), 200, true);
        assert_eq!(chosen.source, Source::Unknown);
    }

    #[test]
    fn session_fusion_prefers_shm_then_uses_fresh_rest_when_shm_ages() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut rest = RestCache::default();
        rest.accept_standings(br#"[{"player":true}]"#, 100, 100);
        rest.accept_session(
            br#"{"trackName":"REST circuit","session":"RACE1","numberOfVehicles":44}"#,
            100,
        );
        let first = fuse_session(&grid, 100, &rest, 200);
        assert_eq!(first.track_name.source, Source::SharedMemory);
        assert!(first.track_name.conflict);
        assert_eq!(first.vehicle_count.field, Field::observed(44));
        let later = fuse_session(&grid, 100, &rest, 600_000_101);
        assert_eq!(later.track_name.source, Source::Rest);
        assert_eq!(
            later.track_name.field,
            Field::observed("REST circuit".to_owned())
        );
        assert_eq!(later.player_present.source, Source::Rest);
        let menu = admit_v13(
            include_bytes!("../../../../testdata/lmu-menu-fixture.bin"),
            "1.3.0.0",
        )
        .unwrap();
        let menu_fused = fuse_session(&menu, 100, &rest, 200);
        assert_eq!(menu_fused.player_present.field, Field::observed(false));
        assert_eq!(menu_fused.player_present.source, Source::SharedMemory);
    }

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

    #[test]
    fn source_clock_conflict_uses_projected_values_and_tolerance() {
        let shared = Field::observed(1_000_000_000_i64);
        let matching = Field::observed(1_100_000_000_i64);
        let choice = choose_source_time(
            (&shared, Some(100_000_000)),
            (&matching, Some(200_000_000)),
            300_000_000,
        );
        assert_eq!(choice.source, Source::SharedMemory);
        assert!(!choice.conflict);
        let divergent = Field::observed(3_000_000_000_i64);
        let choice = choose_source_time(
            (&shared, Some(100_000_000)),
            (&divergent, Some(200_000_000)),
            300_000_000,
        );
        assert!(choice.conflict);
    }

    #[test]
    fn player_fusion_requires_shm_player_and_can_fallback_to_rest() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut rest = RestCache::default();
        rest.accept_standings(
            br#"[{"player":true,"position":3,"lapsCompleted":8,"pitstops":1}]"#,
            600_000_000,
            600_000_000,
        );
        let fresh = fuse_player(&grid, 600_000_000, &rest, 600_000_000);
        assert_eq!(fresh.position.source, Source::SharedMemory);
        let fallback = fuse_player(&grid, 100, &rest, 600_000_001);
        assert_eq!(fallback.position.source, Source::Rest);
        assert_eq!(fallback.position.field, Field::observed(3));
        let menu = admit_v13(
            include_bytes!("../../../../testdata/lmu-menu-fixture.bin"),
            "1.3.0.0",
        )
        .unwrap();
        let no_player = fuse_player(&menu, 100, &rest, 600_000_001);
        assert_eq!(no_player.position.field, Field::Missing);
        assert_eq!(no_player.completed_laps.field, Field::Missing);
        assert_eq!(no_player.pit_stop_count.field, Field::Missing);
    }
}
