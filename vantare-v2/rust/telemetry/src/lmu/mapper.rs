//! Long-lived source-slot generations for the LMU batch mapper.

use std::collections::HashMap;

use super::{AdmittedGrid, SessionType, fusion::FusedSession};
use crate::core::Cursor;
use crate::quality::{Field, Freshness};

pub const DEFAULT_SLOT_GRACE_FRAMES: u64 = 30;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlotFingerprint {
    pub driver: String,
    pub class: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SlotOutcome {
    pub generation: u64,
    pub reopened: bool,
    pub bumped: bool,
}

#[derive(Clone, Debug)]
struct Entry {
    generation: u64,
    fingerprint: SlotFingerprint,
    last_seen: u64,
}

#[derive(Clone, Debug)]
pub struct SlotTracker {
    grace: u64,
    entries: HashMap<i32, Entry>,
}

impl SlotTracker {
    pub fn new(grace: u64) -> Self {
        Self {
            grace: if grace == 0 {
                DEFAULT_SLOT_GRACE_FRAMES
            } else {
                grace
            },
            entries: HashMap::new(),
        }
    }

    pub fn observe(&mut self, slot: i32, fingerprint: SlotFingerprint, frame: u64) -> SlotOutcome {
        let Some(entry) = self.entries.get_mut(&slot) else {
            self.entries.insert(
                slot,
                Entry {
                    generation: 1,
                    fingerprint,
                    last_seen: frame,
                },
            );
            return SlotOutcome {
                generation: 1,
                reopened: false,
                bumped: true,
            };
        };
        let gap = frame.wrapping_sub(entry.last_seen);
        let continuous = gap <= 1;
        let reopened =
            !continuous && gap <= self.grace.saturating_add(1) && entry.fingerprint == fingerprint;
        let bumped = !continuous && !reopened;
        if bumped {
            entry.generation += 1;
        }
        entry.fingerprint = fingerprint;
        entry.last_seen = frame;
        SlotOutcome {
            generation: entry.generation,
            reopened,
            bumped,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClockChange {
    Continuous,
    Reset,
    Wrap,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MapError {
    InvalidSession,
    InvalidGrid,
    InvalidPlayer,
    Exhausted,
}

#[derive(Debug, Eq, PartialEq)]
pub struct VehicleIdentity {
    pub source_id: i32,
    pub vehicle_id: String,
}

#[derive(Debug, Eq, PartialEq)]
pub struct IdentityBatch {
    pub session_id: String,
    pub player_id: Option<String>,
    pub cursor: Cursor,
    pub vehicles: Vec<VehicleIdentity>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Signature {
    track: String,
    kind: SessionType,
}

#[derive(Clone, Debug)]
struct MapperState {
    session_counter: u64,
    cursor: Cursor,
    last_fresh: Option<Signature>,
    last_source_time_ns: Option<i64>,
    frame: u64,
    slots: SlotTracker,
}

pub struct IdentityMapper {
    state: MapperState,
}

pub struct PreparedIdentity {
    candidate: MapperState,
    pub batch: IdentityBatch,
}

pub struct MapperCandidate {
    candidate: MapperState,
}

impl PreparedIdentity {
    pub fn split(self) -> (MapperCandidate, IdentityBatch) {
        (
            MapperCandidate {
                candidate: self.candidate,
            },
            self.batch,
        )
    }
}

impl IdentityMapper {
    pub fn new(slot_grace_frames: u64) -> Self {
        Self {
            state: MapperState {
                session_counter: 0,
                cursor: Cursor {
                    epoch: 0,
                    sequence: 0,
                },
                last_fresh: None,
                last_source_time_ns: None,
                frame: 0,
                slots: SlotTracker::new(slot_grace_frames),
            },
        }
    }

    /// Candidate state remains private until the downstream batch is accepted.
    pub fn prepare(
        &self,
        grid: &AdmittedGrid,
        session: &FusedSession,
        clock_change: ClockChange,
    ) -> Result<PreparedIdentity, MapError> {
        let track = usable(&session.track_name.field)
            .filter(|value| !value.trim().is_empty())
            .ok_or(MapError::InvalidSession)?;
        let kind = usable(&session.session_type.field)
            .filter(|value| **value != SessionType::Unknown)
            .ok_or(MapError::InvalidSession)?;
        let count = usable(&session.vehicle_count.field).ok_or(MapError::InvalidGrid)?;
        if *count < 0 || *count as usize != grid.vehicles.len() || grid.vehicles.len() > 104 {
            return Err(MapError::InvalidGrid);
        }
        let present = usable(&session.player_present.field).ok_or(MapError::InvalidPlayer)?;
        let mut seen = std::collections::HashSet::with_capacity(grid.vehicles.len());
        let mut player_slot = None;
        for row in &grid.vehicles {
            if row.source_id < 0 || !seen.insert(row.source_id) {
                return Err(MapError::InvalidGrid);
            }
            let player = usable(&row.player).ok_or(MapError::InvalidPlayer)?;
            if *player && player_slot.replace(row.source_id).is_some() {
                return Err(MapError::InvalidPlayer);
            }
        }
        if *present != player_slot.is_some() {
            return Err(MapError::InvalidPlayer);
        }

        let mut candidate = self.state.clone();
        let first = candidate.session_counter == 0;
        let mut change = clock_change;
        if let Some(source_time) = usable(&session.source_time_ns.field) {
            if let Some(previous) = candidate.last_source_time_ns
                && change == ClockChange::Continuous
                && previous > 0
                && *source_time < previous
            {
                change = if previous >= 24 * 60 * 60 * 1_000_000_000
                    && *source_time < 60 * 1_000_000_000
                {
                    ClockChange::Wrap
                } else {
                    ClockChange::Reset
                };
            }
            candidate.last_source_time_ns = Some(*source_time);
        }
        let signature = Signature {
            track: track.clone(),
            kind: *kind,
        };
        let session_boundary = !first
            && (change == ClockChange::Reset
                || candidate
                    .last_fresh
                    .as_ref()
                    .is_some_and(|last| last != &signature));
        let epoch_boundary = session_boundary || (!first && change == ClockChange::Wrap);
        if first || session_boundary {
            candidate.session_counter = candidate
                .session_counter
                .checked_add(1)
                .ok_or(MapError::Exhausted)?;
            candidate.frame = 0;
            candidate.slots = SlotTracker::new(candidate.slots.grace);
        }
        candidate.frame = candidate.frame.checked_add(1).ok_or(MapError::Exhausted)?;
        let mut vehicles = Vec::with_capacity(grid.vehicles.len());
        let mut player_id = None;
        for row in &grid.vehicles {
            let fingerprint = SlotFingerprint {
                driver: usable(&row.driver_name).cloned().unwrap_or_default(),
                class: usable(&row.vehicle_class).cloned().unwrap_or_default(),
            };
            let outcome = candidate
                .slots
                .observe(row.source_id, fingerprint, candidate.frame);
            let vehicle_id = format!(
                "lmu-slot-{}-generation-{}",
                row.source_id, outcome.generation
            );
            if player_slot == Some(row.source_id) {
                player_id = Some(vehicle_id.clone());
            }
            vehicles.push(VehicleIdentity {
                source_id: row.source_id,
                vehicle_id,
            });
        }
        candidate.cursor = advance_cursor(candidate.cursor, epoch_boundary)?;
        if session.track_name.field.quality().1 == Some(Freshness::Fresh)
            && session.session_type.field.quality().1 == Some(Freshness::Fresh)
        {
            candidate.last_fresh = Some(signature);
        }
        Ok(PreparedIdentity {
            batch: IdentityBatch {
                session_id: format!("lmu-session-{}", candidate.session_counter),
                player_id,
                cursor: candidate.cursor,
                vehicles,
            },
            candidate,
        })
    }

    pub fn commit(&mut self, prepared: PreparedIdentity) {
        self.state = prepared.candidate;
    }

    pub fn commit_candidate(&mut self, prepared: MapperCandidate) {
        self.state = prepared.candidate;
    }
}

fn usable<T>(field: &Field<T>) -> Option<&T> {
    match field {
        Field::Present {
            value,
            freshness: Freshness::Fresh | Freshness::Stale,
            ..
        } => Some(value),
        _ => None,
    }
}

fn advance_cursor(cursor: Cursor, boundary: bool) -> Result<Cursor, MapError> {
    if cursor.epoch == 0 {
        return Ok(Cursor {
            epoch: 1,
            sequence: 1,
        });
    }
    if boundary || cursor.sequence == u64::MAX {
        return Ok(Cursor {
            epoch: cursor.epoch.checked_add(1).ok_or(MapError::Exhausted)?,
            sequence: 1,
        });
    }
    Ok(Cursor {
        epoch: cursor.epoch,
        sequence: cursor.sequence + 1,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lmu::{admit_v13, fusion::fuse_session, rest::RestCache};

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    fn fingerprint(driver: &str) -> SlotFingerprint {
        SlotFingerprint {
            driver: driver.to_owned(),
            class: "Hypercar".to_owned(),
        }
    }

    #[test]
    fn bounded_absence_preserves_generation_and_late_return_bumps_it() {
        let mut tracker = SlotTracker::new(2);
        assert_eq!(
            tracker.observe(7, fingerprint("A"), 1),
            SlotOutcome {
                generation: 1,
                reopened: false,
                bumped: true
            }
        );
        assert_eq!(
            tracker.observe(7, fingerprint("A"), 2),
            SlotOutcome {
                generation: 1,
                reopened: false,
                bumped: false
            }
        );
        assert_eq!(
            tracker.observe(7, fingerprint("A"), 4),
            SlotOutcome {
                generation: 1,
                reopened: true,
                bumped: false
            }
        );
        assert_eq!(
            tracker.observe(7, fingerprint("B"), 6),
            SlotOutcome {
                generation: 2,
                reopened: false,
                bumped: true
            }
        );
        assert_eq!(
            tracker.observe(7, fingerprint("B"), 10),
            SlotOutcome {
                generation: 3,
                reopened: false,
                bumped: true
            }
        );
    }

    #[test]
    fn cloned_candidate_does_not_advance_committed_tracker() {
        let mut committed = SlotTracker::new(2);
        committed.observe(7, fingerprint("A"), 1);
        let mut candidate = committed.clone();
        candidate.observe(7, fingerprint("A"), 5);
        let original = committed.observe(7, fingerprint("A"), 2);
        assert_eq!(original.generation, 1);
        assert!(!original.bumped);
    }

    #[test]
    fn mapper_prepares_identity_without_advancing_until_commit() {
        let mut grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let rest = RestCache::default();
        let mut mapper = IdentityMapper::new(30);
        let fused = fuse_session(&grid, 100, &rest, 100);
        let first = mapper
            .prepare(&grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert_eq!(
            first.batch.cursor,
            Cursor {
                epoch: 1,
                sequence: 1
            }
        );
        assert_eq!(first.batch.session_id, "lmu-session-1");
        assert_eq!(first.batch.vehicles.len(), 44);
        assert!(first.batch.player_id.is_some());
        let retry = mapper
            .prepare(&grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert_eq!(retry.batch.cursor, first.batch.cursor);
        mapper.commit(first);

        let mut invalid = fuse_session(&grid, 100, &rest, 100);
        invalid.vehicle_count.field = Field::observed(43);
        assert!(matches!(
            mapper.prepare(&grid, &invalid, ClockChange::Continuous),
            Err(MapError::InvalidGrid)
        ));
        let second = mapper
            .prepare(&grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert_eq!(
            second.batch.cursor,
            Cursor {
                epoch: 1,
                sequence: 2
            }
        );
        mapper.commit(second);

        grid.session.track_name = Field::observed("Another circuit".to_owned());
        let next = fuse_session(&grid, 100, &rest, 100);
        let boundary = mapper
            .prepare(&grid, &next, ClockChange::Continuous)
            .unwrap();
        assert_eq!(
            boundary.batch.cursor,
            Cursor {
                epoch: 2,
                sequence: 1
            }
        );
        assert_eq!(boundary.batch.session_id, "lmu-session-2");
    }

    #[test]
    fn source_clock_wrap_changes_epoch_without_reusing_session_identity() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let rest = RestCache::default();
        let mut mapper = IdentityMapper::new(30);
        let mut first = fuse_session(&grid, 100, &rest, 100);
        first.source_time_ns.field = Field::observed(25 * 60 * 60 * 1_000_000_000);
        mapper.commit(
            mapper
                .prepare(&grid, &first, ClockChange::Continuous)
                .unwrap(),
        );
        let mut wrapped = fuse_session(&grid, 100, &rest, 100);
        wrapped.source_time_ns.field = Field::observed(10 * 1_000_000_000);
        let candidate = mapper
            .prepare(&grid, &wrapped, ClockChange::Continuous)
            .unwrap();
        assert_eq!(
            candidate.batch.cursor,
            Cursor {
                epoch: 2,
                sequence: 1
            }
        );
        assert_eq!(candidate.batch.session_id, "lmu-session-1");
        mapper.commit(candidate);
        let mut reset = fuse_session(&grid, 100, &rest, 100);
        reset.source_time_ns.field = Field::observed(1_000_000_000);
        let candidate = mapper
            .prepare(&grid, &reset, ClockChange::Continuous)
            .unwrap();
        assert_eq!(
            candidate.batch.cursor,
            Cursor {
                epoch: 3,
                sequence: 1
            }
        );
        assert_eq!(candidate.batch.session_id, "lmu-session-2");
    }
}
