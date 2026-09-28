//! Transactional LMU adaptation into the simulator-neutral reducer.

use super::mapper::{ClockChange, IdentityMapper, MapError, MapperCandidate};
use super::{AdmittedGrid, VehicleFields, fusion::FusedSession};
use crate::core;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PipelineError {
    Mapping(MapError),
    IdentityMismatch,
    Reduction(core::Reject),
}

pub struct Pipeline {
    mapper: IdentityMapper,
    reducer: core::Reducer<VehicleFields>,
}

pub struct PipelineCandidate {
    mapper: MapperCandidate,
    reduced: core::Candidate<VehicleFields>,
}

impl Pipeline {
    pub fn new(slot_grace_frames: u64) -> Self {
        Self {
            mapper: IdentityMapper::new(slot_grace_frames),
            reducer: core::Reducer::new(),
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
        Ok(PipelineCandidate { mapper, reduced })
    }

    pub fn commit(
        &mut self,
        candidate: PipelineCandidate,
    ) -> Result<&core::Batch<VehicleFields>, core::Reject> {
        self.reducer.commit(candidate.reduced)?;
        self.mapper.commit_candidate(candidate.mapper);
        Ok(self.reducer.current().expect("commit installed a batch"))
    }

    pub fn current(&self) -> Option<&core::Batch<VehicleFields>> {
        self.reducer.current()
    }
}

impl PipelineCandidate {
    pub fn batch(&self) -> &core::Batch<VehicleFields> {
        self.reduced.batch()
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
    use crate::quality::Field;

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
        assert!(pipeline.current().is_none());
        pipeline.commit(candidate).unwrap();

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut invalid = fuse_session(&grid, 100, &rest, 100);
        invalid.vehicle_count.field = Field::observed(43);
        assert!(matches!(
            pipeline.prepare(grid, &invalid, ClockChange::Continuous),
            Err(PipelineError::Mapping(MapError::InvalidGrid))
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);

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
}
