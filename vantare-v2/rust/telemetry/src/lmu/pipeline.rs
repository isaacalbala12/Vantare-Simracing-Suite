//! Transactional LMU adaptation into the simulator-neutral reducer.

use super::mapper::{ClockChange, IdentityMapper, MapError, MapperCandidate};
use super::{AdmittedGrid, VehicleFields, fusion::FusedSession};
use crate::core;
use crate::derive;
use crate::quality::Field;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PipelineError {
    Mapping(MapError),
    IdentityMismatch,
    Reduction(core::Reject),
}

pub struct Pipeline {
    mapper: IdentityMapper,
    reducer: core::Reducer<VehicleFields>,
    session_remaining: Option<Field<f64>>,
}

pub struct PipelineCandidate {
    mapper: MapperCandidate,
    reduced: core::Candidate<VehicleFields>,
    session_remaining: Field<f64>,
}

impl Pipeline {
    pub fn new(slot_grace_frames: u64) -> Self {
        Self {
            mapper: IdentityMapper::new(slot_grace_frames),
            reducer: core::Reducer::new(),
            session_remaining: None,
        }
    }

    pub fn prepare(
        &self,
        grid: AdmittedGrid,
        fused: &FusedSession,
        clock_change: ClockChange,
    ) -> Result<PipelineCandidate, PipelineError> {
        let (mapper, identity) = self
            .mapper
            .prepare(&grid, fused, clock_change)
            .map_err(PipelineError::Mapping)?
            .split();
        let session_remaining =
            derive::session_remaining(&fused.source_time_ns.field, &grid.session.end_time_seconds);
        if grid.vehicles.len() != identity.vehicles.len()
            || !grid
                .vehicles
                .iter()
                .zip(&identity.vehicles)
                .all(|(row, id)| row.source_id == id.source_id)
        {
            return Err(PipelineError::IdentityMismatch);
        }
        let vehicles = grid
            .vehicles
            .into_iter()
            .zip(identity.vehicles)
            .map(|(value, id)| core::Vehicle {
                id: id.vehicle_id,
                value,
            })
            .collect();
        let batch = core::Batch {
            event_id: "lmu-event-1".to_owned(),
            session_id: identity.session_id,
            player_id: identity.player_id,
            cursor: identity.cursor,
            vehicle_count: fused.vehicle_count.field.clone(),
            vehicles,
        };
        let reduced = self
            .reducer
            .prepare(batch)
            .map_err(PipelineError::Reduction)?;
        Ok(PipelineCandidate {
            mapper,
            reduced,
            session_remaining,
        })
    }

    pub fn commit(
        &mut self,
        candidate: PipelineCandidate,
    ) -> Result<&core::Batch<VehicleFields>, core::Reject> {
        self.reducer.commit(candidate.reduced)?;
        self.mapper.commit_candidate(candidate.mapper);
        self.session_remaining = Some(candidate.session_remaining);
        Ok(self.reducer.current().expect("commit installed a batch"))
    }

    pub fn current(&self) -> Option<&core::Batch<VehicleFields>> {
        self.reducer.current()
    }

    pub fn session_remaining(&self) -> Option<&Field<f64>> {
        self.session_remaining.as_ref()
    }
}

impl PipelineCandidate {
    pub fn batch(&self) -> &core::Batch<VehicleFields> {
        self.reduced.batch()
    }

    pub fn session_remaining(&self) -> &Field<f64> {
        &self.session_remaining
    }
}

impl Default for Pipeline {
    fn default() -> Self {
        Self::new(super::mapper::DEFAULT_SLOT_GRACE_FRAMES)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lmu::{admit_v13, fusion::fuse_session, rest::RestCache};

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    #[test]
    fn admitted_grid_commits_atomically_and_rejects_bad_retry() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let candidate = pipeline
            .prepare(grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert_eq!(candidate.batch().vehicles.len(), 44);
        assert_eq!(candidate.batch().cursor.sequence, 1);
        let expected_remaining = candidate.session_remaining().clone();
        assert!(pipeline.current().is_none());
        assert!(pipeline.session_remaining().is_none());
        pipeline.commit(candidate).unwrap();
        assert_eq!(pipeline.session_remaining(), Some(&expected_remaining));

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut invalid = fuse_session(&grid, 100, &rest, 100);
        invalid.vehicle_count.field = Field::observed(43);
        assert!(matches!(
            pipeline.prepare(grid, &invalid, ClockChange::Continuous),
            Err(PipelineError::Mapping(MapError::InvalidGrid))
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
        assert_eq!(pipeline.session_remaining(), Some(&expected_remaining));

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let candidate = pipeline
            .prepare(grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 2);
        pipeline.commit(candidate).unwrap();
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 2);
    }

    #[test]
    fn foreign_candidate_does_not_advance_mapper() {
        let rest = RestCache::default();
        let first = Pipeline::default();
        let mut other = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let candidate = first
            .prepare(grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert!(matches!(
            other.commit(candidate),
            Err(core::Reject::WrongReducer)
        ));
        assert!(other.current().is_none());
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let candidate = other
            .prepare(grid, &fused, ClockChange::Continuous)
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 1);
    }

    #[test]
    fn stale_commit_does_not_publish_a_new_derived_value() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let first_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first_fused = fuse_session(&first_grid, 100, &rest, 100);
        let first = pipeline
            .prepare(first_grid, &first_fused, ClockChange::Continuous)
            .unwrap();
        let mut stale_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        stale_grid.session.end_time_seconds = Field::observed(999.0);
        let stale_fused = fuse_session(&stale_grid, 100, &rest, 100);
        let stale = pipeline
            .prepare(stale_grid, &stale_fused, ClockChange::Continuous)
            .unwrap();
        let expected = first.session_remaining().clone();
        pipeline.commit(first).unwrap();
        assert!(matches!(pipeline.commit(stale), Err(core::Reject::Stale)));
        assert_eq!(pipeline.session_remaining(), Some(&expected));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
    }
}
