//! Simulator-neutral owned batch and candidate/commit reducer.

use std::sync::Arc;

use crate::quality::{Field, Freshness};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Cursor {
    pub epoch: u64,
    pub sequence: u64,
}

#[derive(Debug)]
pub struct Vehicle<T> {
    pub id: String,
    pub value: T,
}

#[derive(Debug)]
pub struct Batch<T> {
    pub event_id: String,
    pub session_id: String,
    pub player_id: Option<String>,
    pub cursor: Cursor,
    pub vehicle_count: Field<i32>,
    pub vehicles: Vec<Vehicle<T>>,
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
    MissingVehicleId,
    DuplicateVehicleId,
    WrongReducer,
}

pub struct Reducer<T> {
    token: Arc<()>,
    current: Option<Batch<T>>,
}

pub struct Candidate<T> {
    token: Arc<()>,
    batch: Batch<T>,
}

impl<T> Reducer<T> {
    pub fn new() -> Self {
        Self {
            token: Arc::new(()),
            current: None,
        }
    }

    pub fn prepare(&self, batch: Batch<T>) -> Result<Candidate<T>, Reject> {
        self.validate(&batch)?;
        Ok(Candidate {
            token: self.token.clone(),
            batch,
        })
    }

    fn validate(&self, batch: &Batch<T>) -> Result<(), Reject> {
        if batch.event_id.is_empty() || batch.session_id.is_empty() {
            return Err(Reject::IncompleteIdentity);
        }
        validate_cursor(
            self.current.as_ref().map(|current| current.cursor),
            batch.cursor,
        )?;
        if let Some(current) = &self.current
            && current.cursor.epoch == batch.cursor.epoch
            && (current.event_id != batch.event_id || current.session_id != batch.session_id)
        {
            return Err(Reject::RunIdentityChanged);
        }
        if let Field::Present {
            value, freshness, ..
        } = &batch.vehicle_count
            && *freshness != Freshness::Invalid
            && (*value < 0 || *value as usize != batch.vehicles.len())
        {
            return Err(Reject::VehicleCountMismatch);
        }
        let mut ids = Vec::with_capacity(batch.vehicles.len());
        for vehicle in &batch.vehicles {
            if vehicle.id.is_empty() {
                return Err(Reject::MissingVehicleId);
            }
            ids.push(vehicle.id.as_str());
        }
        ids.sort_unstable();
        if ids.windows(2).any(|pair| pair[0] == pair[1]) {
            return Err(Reject::DuplicateVehicleId);
        }
        Ok(())
    }

    pub fn commit(&mut self, candidate: Candidate<T>) -> Result<(), Reject> {
        if !Arc::ptr_eq(&self.token, &candidate.token) {
            return Err(Reject::WrongReducer);
        }
        self.validate(&candidate.batch)?;
        self.current = Some(candidate.batch);
        Ok(())
    }

    pub fn current(&self) -> Option<&Batch<T>> {
        self.current.as_ref()
    }
}

impl<T> Default for Reducer<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Candidate<T> {
    pub fn batch(&self) -> &Batch<T> {
        &self.batch
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

    fn batch(sequence: u64) -> Batch<()> {
        Batch {
            event_id: "event".to_owned(),
            session_id: "session".to_owned(),
            player_id: None,
            cursor: Cursor { epoch: 1, sequence },
            vehicle_count: Field::observed(2),
            vehicles: vec![
                Vehicle {
                    id: "a".to_owned(),
                    value: (),
                },
                Vehicle {
                    id: "b".to_owned(),
                    value: (),
                },
            ],
        }
    }

    #[test]
    fn invalid_batch_does_not_advance_reducer() {
        let mut reducer = Reducer::new();
        let mut invalid = batch(1);
        invalid.vehicle_count = Field::observed(3);
        assert!(matches!(
            reducer.prepare(invalid),
            Err(Reject::VehicleCountMismatch)
        ));
        assert!(reducer.current().is_none());
        let first = reducer.prepare(batch(1)).unwrap();
        assert!(reducer.current().is_none());
        reducer.commit(first).unwrap();
        assert_eq!(
            reducer.current().unwrap().cursor,
            Cursor {
                epoch: 1,
                sequence: 1
            }
        );
        assert!(matches!(reducer.prepare(batch(1)), Err(Reject::Stale)));
        assert!(matches!(
            reducer.prepare(batch(3)),
            Err(Reject::SequenceGap)
        ));
        assert_eq!(
            reducer.current().unwrap().cursor,
            Cursor {
                epoch: 1,
                sequence: 1
            }
        );
    }

    #[test]
    fn epoch_and_identity_are_validated() {
        let mut reducer = Reducer::new();
        reducer.commit(reducer.prepare(batch(1)).unwrap()).unwrap();
        let mut changed = batch(2);
        changed.session_id = "other".to_owned();
        assert!(matches!(
            reducer.prepare(changed),
            Err(Reject::RunIdentityChanged)
        ));
        let mut new_epoch = batch(1);
        new_epoch.cursor.epoch = 2;
        assert!(reducer.prepare(new_epoch).is_ok());
    }

    #[test]
    fn candidate_belongs_to_its_reducer() {
        let first = Reducer::new();
        let mut other = Reducer::new();
        let candidate = first.prepare(batch(1)).unwrap();
        assert_eq!(other.commit(candidate), Err(Reject::WrongReducer));
        assert!(other.current().is_none());
    }

    #[test]
    fn old_candidate_cannot_overwrite_new_commit() {
        let mut reducer = Reducer::new();
        let first = reducer.prepare(batch(1)).unwrap();
        let stale = reducer.prepare(batch(1)).unwrap();
        reducer.commit(first).unwrap();
        assert_eq!(reducer.commit(stale), Err(Reject::Stale));
        assert_eq!(reducer.current().unwrap().cursor.sequence, 1);
    }
}
