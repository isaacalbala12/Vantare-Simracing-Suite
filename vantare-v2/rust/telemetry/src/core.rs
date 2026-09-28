//! Simulator-neutral owned batch and candidate/commit reducer.

pub mod facts;
pub mod session;

use std::sync::Arc;

use crate::quality::{Field, Freshness};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Cursor {
    pub epoch: u64,
    pub sequence: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionFlag {
    Yellow,
}

#[derive(Debug)]
pub struct Vehicle<T> {
    pub id: String,
    pub value: T,
}

#[derive(Debug)]
pub struct VehicleState<S, F, D> {
    pub driver_name: Field<String>,
    pub name: Field<String>,
    pub vehicle_class: Field<String>,
    pub car_number: Field<String>,
    pub player: Field<bool>,
    pub sector: Field<S>,
    pub lap_distance: Field<f64>,
    pub lap_progress_time: Field<f64>,
    pub best_lap_time: Field<f64>,
    pub last_lap_time: Field<f64>,
    pub estimated_lap_time: Field<f64>,
    pub lap_number: Field<i32>,
    pub gear: Field<i32>,
    pub engine_rpm: Field<f64>,
    pub speed_mps: Field<f64>,
    pub throttle: Field<f64>,
    pub brake: Field<f64>,
    pub clutch: Field<f64>,
    pub position: Field<i32>,
    pub completed_laps: Field<i32>,
    pub in_pit: Field<bool>,
    pub pit_stop_count: Field<i32>,
    pub penalty_count: Field<i32>,
    pub time_behind_leader: Field<f64>,
    pub laps_behind_leader: Field<i32>,
    pub time_behind_next: Field<f64>,
    pub laps_behind_next: Field<i32>,
    pub fuel: Field<F>,
    pub delta_best: Field<f64>,
    pub world_position: Field<[f64; 3]>,
    pub local_velocity: Field<[f64; 3]>,
    pub orientation: Field<[[f64; 3]; 3]>,
    pub damage: Field<D>,
    pub tyre_wear: Field<[f64; 4]>,
}

#[derive(Debug)]
pub struct ObservedState<S, V> {
    pub source_time_ns: Field<i64>,
    pub end_time_seconds: Field<f64>,
    pub maximum_laps: Field<i32>,
    pub track_name: Field<String>,
    pub session_type: Field<S>,
    pub vehicle_count: Field<i32>,
    pub player_present: Field<bool>,
    pub ambient_temp_c: Field<f64>,
    pub track_temp_c: Field<f64>,
    pub rain_fraction: Field<f64>,
    pub wetness_fraction: Field<f64>,
    pub session_flag: Field<SessionFlag>,
    pub vehicles: Vec<Vehicle<V>>,
    pub track_length: Field<f64>,
}

#[derive(Debug)]
pub struct Batch<S, V> {
    pub event_id: String,
    pub session_id: String,
    pub player_id: Option<String>,
    pub cursor: Cursor,
    pub state: ObservedState<S, V>,
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

pub struct Reducer<S, V> {
    token: Arc<()>,
    current: Option<Batch<S, V>>,
}

pub struct Candidate<S, V> {
    token: Arc<()>,
    batch: Batch<S, V>,
}

impl<S, V> Reducer<S, V> {
    pub fn new() -> Self {
        Self {
            token: Arc::new(()),
            current: None,
        }
    }

    pub fn prepare(&self, batch: Batch<S, V>) -> Result<Candidate<S, V>, Reject> {
        self.validate(&batch)?;
        Ok(Candidate {
            token: self.token.clone(),
            batch,
        })
    }

    fn validate(&self, batch: &Batch<S, V>) -> Result<(), Reject> {
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
        } = &batch.state.vehicle_count
            && *freshness != Freshness::Invalid
            && (*value < 0 || *value as usize != batch.state.vehicles.len())
        {
            return Err(Reject::VehicleCountMismatch);
        }
        let mut ids = Vec::with_capacity(batch.state.vehicles.len());
        for vehicle in &batch.state.vehicles {
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

    pub fn commit(&mut self, candidate: Candidate<S, V>) -> Result<(), Reject> {
        if !Arc::ptr_eq(&self.token, &candidate.token) {
            return Err(Reject::WrongReducer);
        }
        self.validate(&candidate.batch)?;
        self.current = Some(candidate.batch);
        Ok(())
    }

    pub fn current(&self) -> Option<&Batch<S, V>> {
        self.current.as_ref()
    }
}

impl<S, V> Default for Reducer<S, V> {
    fn default() -> Self {
        Self::new()
    }
}

impl<S, V> Candidate<S, V> {
    pub fn batch(&self) -> &Batch<S, V> {
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

    fn batch(sequence: u64) -> Batch<(), ()> {
        Batch {
            event_id: "event".to_owned(),
            session_id: "session".to_owned(),
            player_id: None,
            cursor: Cursor { epoch: 1, sequence },
            state: ObservedState {
                source_time_ns: Field::Missing,
                end_time_seconds: Field::Missing,
                maximum_laps: Field::Missing,
                track_name: Field::Missing,
                session_type: Field::Missing,
                vehicle_count: Field::observed(2),
                player_present: Field::Missing,
                ambient_temp_c: Field::Missing,
                track_temp_c: Field::Missing,
                rain_fraction: Field::Missing,
                wetness_fraction: Field::Missing,
                session_flag: Field::Missing,
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
                track_length: Field::Missing,
            },
        }
    }

    #[test]
    fn invalid_batch_does_not_advance_reducer() {
        let mut reducer = Reducer::new();
        let mut invalid = batch(1);
        invalid.state.vehicle_count = Field::observed(3);
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
