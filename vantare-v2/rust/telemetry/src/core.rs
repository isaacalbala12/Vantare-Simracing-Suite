//! Owned candidate/commit boundary for complete LMU identity batches.
//! Product projections and the full canonical field set remain future work.

use crate::lmu::{
    AdmittedGrid,
    mapper::{Cursor, IdentityBatch},
};
use crate::quality::{Field, Freshness};
use std::sync::Arc;

#[derive(Debug)]
pub struct Batch {
    pub event_id: String,
    pub identity: IdentityBatch,
    pub grid: AdmittedGrid,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Reject {
    IncompleteIdentity,
    InvalidInitialCursor,
    Stale,
    SequenceGap,
    EpochGap,
    InvalidEpochReset,
    RunIdentityChanged,
    VehicleCountMismatch,
    VehicleMappingMismatch,
    MissingVehicleId,
    DuplicateVehicleId,
    WrongReducer,
}

pub struct Reducer {
    token: Arc<()>,
    current: Option<Batch>,
}

pub struct Candidate {
    token: Arc<()>,
    batch: Batch,
}

impl Reducer {
    pub fn new() -> Self {
        Self {
            token: Arc::new(()),
            current: None,
        }
    }

    pub fn prepare(&self, batch: Batch) -> Result<Candidate, Reject> {
        if batch.event_id.is_empty() || batch.identity.session_id.is_empty() {
            return Err(Reject::IncompleteIdentity);
        }
        validate_cursor(
            self.current.as_ref().map(|current| current.identity.cursor),
            batch.identity.cursor,
        )?;
        if let Some(current) = &self.current
            && current.identity.cursor.epoch == batch.identity.cursor.epoch
            && (current.event_id != batch.event_id
                || current.identity.session_id != batch.identity.session_id)
        {
            return Err(Reject::RunIdentityChanged);
        }
        let count = &batch.grid.vehicle_count;
        if let Field::Present {
            value, freshness, ..
        } = count
            && *freshness != Freshness::Invalid
            && (*value < 0 || *value as usize != batch.grid.vehicles.len())
        {
            return Err(Reject::VehicleCountMismatch);
        }
        if batch.identity.vehicles.len() != batch.grid.vehicles.len() {
            return Err(Reject::VehicleMappingMismatch);
        }
        let mut ids = Vec::with_capacity(batch.identity.vehicles.len());
        for (mapped, source) in batch.identity.vehicles.iter().zip(&batch.grid.vehicles) {
            if mapped.source_id != source.source_id {
                return Err(Reject::VehicleMappingMismatch);
            }
            if mapped.vehicle_id.is_empty() {
                return Err(Reject::MissingVehicleId);
            }
            ids.push(mapped.vehicle_id.as_str());
        }
        ids.sort_unstable();
        if ids.windows(2).any(|pair| pair[0] == pair[1]) {
            return Err(Reject::DuplicateVehicleId);
        }
        Ok(Candidate {
            token: self.token.clone(),
            batch,
        })
    }

    pub fn commit(&mut self, candidate: Candidate) -> Result<(), Reject> {
        if !Arc::ptr_eq(&self.token, &candidate.token) {
            return Err(Reject::WrongReducer);
        }
        self.current = Some(candidate.batch);
        Ok(())
    }

    pub fn current(&self) -> Option<&Batch> {
        self.current.as_ref()
    }
}

impl Default for Reducer {
    fn default() -> Self {
        Self::new()
    }
}

fn validate_cursor(current: Option<Cursor>, next: Cursor) -> Result<(), Reject> {
    let Some(current) = current else {
        return if next.epoch != 0 && next.sequence == 1 {
            Ok(())
        } else {
            Err(Reject::InvalidInitialCursor)
        };
    };
    if next.epoch < current.epoch
        || (next.epoch == current.epoch && next.sequence <= current.sequence)
    {
        return Err(Reject::Stale);
    }
    if next.epoch == current.epoch {
        return if current.sequence.checked_add(1) == Some(next.sequence) {
            Ok(())
        } else {
            Err(Reject::SequenceGap)
        };
    }
    if current.epoch.checked_add(1) != Some(next.epoch) {
        return Err(Reject::EpochGap);
    }
    if next.sequence != 1 {
        return Err(Reject::InvalidEpochReset);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lmu::{
        admit_v13,
        fusion::fuse_session,
        mapper::{ClockChange, IdentityMapper},
        rest::RestCache,
    };

    const REAL_44: &[u8] = include_bytes!("../../../testdata/lmu-fixture.bin");

    fn batch(mapper: &IdentityMapper) -> Batch {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &RestCache::default(), 100);
        let prepared = mapper
            .prepare(&grid, &fused, ClockChange::Continuous)
            .unwrap();
        Batch {
            event_id: "lmu-event-1".to_owned(),
            identity: prepared.batch,
            grid,
        }
    }

    #[test]
    fn reducer_rejects_bad_candidates_without_advancing_current() {
        let mapper = IdentityMapper::new(30);
        let mut reducer = Reducer::new();
        let mut invalid = batch(&mapper);
        invalid.grid.vehicle_count = Field::observed(43);
        assert!(matches!(
            reducer.prepare(invalid),
            Err(Reject::VehicleCountMismatch)
        ));
        assert!(reducer.current().is_none());
        let first = reducer.prepare(batch(&mapper)).unwrap();
        assert!(reducer.current().is_none());
        reducer.commit(first).unwrap();
        assert_eq!(
            reducer.current().unwrap().identity.cursor,
            Cursor {
                epoch: 1,
                sequence: 1
            }
        );
        assert!(matches!(
            reducer.prepare(batch(&mapper)),
            Err(Reject::Stale)
        ));
        assert_eq!(
            reducer.current().unwrap().identity.cursor,
            Cursor {
                epoch: 1,
                sequence: 1
            }
        );
    }

    #[test]
    fn reducer_detects_sequence_and_identity_errors_before_commit() {
        let mapper = IdentityMapper::new(30);
        let mut reducer = Reducer::new();
        reducer
            .commit(reducer.prepare(batch(&mapper)).unwrap())
            .unwrap();
        let mut gap = batch(&mapper);
        gap.identity.cursor.sequence = 3;
        assert!(matches!(reducer.prepare(gap), Err(Reject::SequenceGap)));
        let mut run_change = batch(&mapper);
        run_change.identity.cursor.sequence = 2;
        run_change.identity.session_id = "other".to_owned();
        assert!(matches!(
            reducer.prepare(run_change),
            Err(Reject::RunIdentityChanged)
        ));
    }

    #[test]
    fn candidate_cannot_be_committed_to_another_reducer() {
        let mapper = IdentityMapper::new(30);
        let first = Reducer::new();
        let mut second = Reducer::new();
        let prepared = first.prepare(batch(&mapper)).unwrap();
        assert_eq!(second.commit(prepared), Err(Reject::WrongReducer));
        assert!(second.current().is_none());
    }
}
