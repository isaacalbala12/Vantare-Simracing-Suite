//! Candidate/commit lifecycle facts over simulator-neutral observed batches.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use super::{Batch, Cursor, VehicleState, validate_cursor};
use crate::quality::{Field, Freshness};

pub const DEFAULT_MAX_FACT_BATCH: usize = 256;
pub const DEFAULT_MAX_VEHICLE_HISTORY: usize = 512;

pub trait LifecycleSignals {
    fn driver_name(&self) -> Option<&str>;
    fn team_id(&self) -> Option<&str> {
        None
    }
    fn completed_laps(&self) -> Option<i32>;
    fn in_pit(&self) -> Option<bool>;
}

impl<S, F, D> LifecycleSignals for VehicleState<S, F, D> {
    fn driver_name(&self) -> Option<&str> {
        usable(&self.driver_name).map(String::as_str)
    }
    fn completed_laps(&self) -> Option<i32> {
        usable(&self.completed_laps).copied()
    }
    fn in_pit(&self) -> Option<bool> {
        usable(&self.in_pit).copied()
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FactKind {
    SessionStarted,
    SessionEnded,
    LapCompleted,
    PitEntered,
    PitExited,
    DriverChanged,
    ConnectionLost,
    ConnectionRecovered,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactIdentity {
    pub event_id: String,
    pub session_id: String,
    pub vehicle_id: Option<String>,
    pub driver_id: String,
    pub team_id: String,
    pub stint_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionFact {
    pub sequence: u64,
    pub kind: FactKind,
    pub occurred_utc_ns: i64,
    pub identity: FactIdentity,
    pub previous_identity: Option<FactIdentity>,
    pub lap: Option<i32>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionError {
    InvalidCursor,
    ChangedRunWithoutEpoch,
    FactBatchOverflow,
    FactSequenceExhausted,
    VehicleHistoryOverflow,
    StintSequenceExhausted,
    WrongCoordinator,
    StaleCandidate,
}

#[derive(Clone, Debug)]
struct History {
    identity: FactIdentity,
    stint_generation: u64,
    completed_laps: Option<i32>,
    in_pit: Option<bool>,
    last_seen: Cursor,
}

#[derive(Clone, Debug, Default)]
struct State {
    active: bool,
    connected: Option<bool>,
    cursor: Option<Cursor>,
    header: Option<FactIdentity>,
    vehicles: HashMap<String, History>,
    fact_sequence: u64,
    identity_evicted: u64,
}

pub struct SessionCoordinator {
    token: Arc<()>,
    state: State,
    max_facts: usize,
    max_vehicles: usize,
}

pub struct SessionCandidate {
    token: Arc<()>,
    base_cursor: Option<Cursor>,
    base_fact_sequence: u64,
    next: State,
    facts: Vec<SessionFact>,
}

impl SessionCoordinator {
    pub fn new(max_facts: usize, max_vehicles: usize) -> Self {
        Self {
            token: Arc::new(()),
            state: State::default(),
            max_facts: if max_facts == 0 {
                DEFAULT_MAX_FACT_BATCH
            } else {
                max_facts
            },
            max_vehicles: if max_vehicles == 0 {
                DEFAULT_MAX_VEHICLE_HISTORY
            } else {
                max_vehicles
            },
        }
    }

    pub fn prepare<S, V: LifecycleSignals>(
        &self,
        batch: &Batch<S, V>,
        occurred_utc_ns: i64,
    ) -> Result<SessionCandidate, SessionError> {
        validate_cursor(self.state.cursor, batch.cursor)
            .map_err(|_| SessionError::InvalidCursor)?;
        let same_session = self.state.header.as_ref().is_some_and(|last| {
            last.event_id == batch.event_id && last.session_id == batch.session_id
        });
        if self
            .state
            .cursor
            .is_some_and(|cursor| cursor.epoch == batch.cursor.epoch)
            && !same_session
        {
            return Err(SessionError::ChangedRunWithoutEpoch);
        }
        let mut next = self.state.clone();
        if !same_session || !next.active {
            next.vehicles.clear();
        } else if next
            .header
            .as_ref()
            .and_then(|header| header.vehicle_id.as_ref())
            != batch.player_id.as_ref()
            && let Some(player_id) = &batch.player_id
        {
            next.vehicles.remove(player_id);
        }

        let active: HashSet<&str> = batch
            .state
            .vehicles
            .iter()
            .map(|vehicle| vehicle.id.as_str())
            .collect();
        let new_count = batch
            .state
            .vehicles
            .iter()
            .filter(|vehicle| !next.vehicles.contains_key(&vehicle.id))
            .count();
        let overflow = next
            .vehicles
            .len()
            .saturating_add(new_count)
            .saturating_sub(self.max_vehicles);
        if overflow > 0 {
            let mut inactive: Vec<_> = next
                .vehicles
                .iter()
                .filter(|(id, _)| !active.contains(id.as_str()))
                .collect();
            inactive.sort_unstable_by(|(left_id, left), (right_id, right)| {
                (
                    left.last_seen.epoch,
                    left.last_seen.sequence,
                    left_id.as_str(),
                )
                    .cmp(&(
                        right.last_seen.epoch,
                        right.last_seen.sequence,
                        right_id.as_str(),
                    ))
            });
            if inactive.len() < overflow {
                return Err(SessionError::VehicleHistoryOverflow);
            }
            let victims: Vec<_> = inactive
                .into_iter()
                .take(overflow)
                .map(|(id, _)| id.clone())
                .collect();
            for id in victims {
                next.vehicles.remove(&id);
            }
            next.identity_evicted += overflow as u64;
        }

        let mut staged = Vec::with_capacity(batch.state.vehicles.len());
        for vehicle in &batch.state.vehicles {
            let previous = next.vehicles.get(&vehicle.id);
            let driver = vehicle.value.driver_name().unwrap_or_default().to_owned();
            let team = vehicle.value.team_id().unwrap_or_default().to_owned();
            let mut generation = previous.map_or(1, |history| history.stint_generation);
            if previous.is_some_and(|history| {
                history.identity.driver_id != driver || history.identity.team_id != team
            }) {
                generation = generation
                    .checked_add(1)
                    .ok_or(SessionError::StintSequenceExhausted)?;
            }
            let identity = FactIdentity {
                event_id: batch.event_id.clone(),
                session_id: batch.session_id.clone(),
                vehicle_id: Some(vehicle.id.clone()),
                driver_id: driver,
                team_id: team,
                stint_id: Some(format!(
                    "{}/{}/stint-{generation}",
                    batch.session_id, vehicle.id
                )),
            };
            staged.push((vehicle, identity, generation));
        }
        let player_identity = batch
            .player_id
            .as_ref()
            .and_then(|id| {
                staged
                    .iter()
                    .find(|(vehicle, _, _)| &vehicle.id == id)
                    .map(|(_, identity, _)| identity.clone())
            })
            .unwrap_or_else(|| FactIdentity {
                event_id: batch.event_id.clone(),
                session_id: batch.session_id.clone(),
                vehicle_id: batch.player_id.clone(),
                driver_id: String::new(),
                team_id: String::new(),
                stint_id: None,
            });
        let mut facts = Vec::new();
        if !next.active {
            push_fact(
                &mut facts,
                self.max_facts,
                FactKind::SessionStarted,
                occurred_utc_ns,
                player_identity.clone(),
                None,
                None,
            )?;
        } else if !same_session {
            let previous = next.header.clone().expect("active session has header");
            push_fact(
                &mut facts,
                self.max_facts,
                FactKind::SessionEnded,
                occurred_utc_ns,
                previous.clone(),
                None,
                None,
            )?;
            push_fact(
                &mut facts,
                self.max_facts,
                FactKind::SessionStarted,
                occurred_utc_ns,
                player_identity.clone(),
                Some(previous),
                None,
            )?;
        }

        for (vehicle, identity, generation) in staged {
            let previous = next.vehicles.get(&vehicle.id).cloned();
            let continuous = previous
                .as_ref()
                .is_some_and(|old| Some(old.last_seen) == self.state.cursor);
            if let Some(old) = &previous
                && (old.identity.driver_id != identity.driver_id
                    || old.identity.team_id != identity.team_id)
            {
                push_fact(
                    &mut facts,
                    self.max_facts,
                    FactKind::DriverChanged,
                    occurred_utc_ns,
                    identity.clone(),
                    Some(old.identity.clone()),
                    None,
                )?;
            }
            let laps = vehicle
                .value
                .completed_laps()
                .or_else(|| previous.as_ref().and_then(|old| old.completed_laps));
            let high_water = match (previous.as_ref().and_then(|old| old.completed_laps), laps) {
                (Some(old), Some(current)) if current > old => {
                    let increase = usize::try_from(i64::from(current) - i64::from(old))
                        .map_err(|_| SessionError::FactBatchOverflow)?;
                    if facts.len().saturating_add(increase) > self.max_facts {
                        return Err(SessionError::FactBatchOverflow);
                    }
                    for completed in (i64::from(old) + 1)..=i64::from(current) {
                        push_fact(
                            &mut facts,
                            self.max_facts,
                            FactKind::LapCompleted,
                            occurred_utc_ns,
                            identity.clone(),
                            None,
                            Some(completed as i32),
                        )?;
                    }
                    Some(current)
                }
                (Some(old), Some(current)) => Some(old.max(current)),
                (_, current) => current,
            };
            let pit = vehicle
                .value
                .in_pit()
                .or_else(|| previous.as_ref().and_then(|old| old.in_pit));
            if continuous
                && let Some(old) = &previous
                && let (Some(before), Some(after)) = (old.in_pit, vehicle.value.in_pit())
                && before != after
            {
                push_fact(
                    &mut facts,
                    self.max_facts,
                    if after {
                        FactKind::PitEntered
                    } else {
                        FactKind::PitExited
                    },
                    occurred_utc_ns,
                    identity.clone(),
                    Some(old.identity.clone()),
                    None,
                )?;
            }
            next.vehicles.insert(
                vehicle.id.clone(),
                History {
                    identity,
                    stint_generation: generation,
                    completed_laps: high_water,
                    in_pit: pit,
                    last_seen: batch.cursor,
                },
            );
        }
        let fact_count =
            u64::try_from(facts.len()).map_err(|_| SessionError::FactSequenceExhausted)?;
        let last_sequence = next
            .fact_sequence
            .checked_add(fact_count)
            .ok_or(SessionError::FactSequenceExhausted)?;
        for (offset, fact) in facts.iter_mut().enumerate() {
            fact.sequence = next.fact_sequence + offset as u64 + 1;
        }
        next.fact_sequence = last_sequence;
        next.cursor = Some(batch.cursor);
        next.header = Some(player_identity);
        next.active = true;
        if next.connected.is_none() {
            next.connected = Some(true);
        }
        Ok(SessionCandidate {
            token: self.token.clone(),
            base_cursor: self.state.cursor,
            base_fact_sequence: self.state.fact_sequence,
            next,
            facts,
        })
    }

    pub fn prepare_connection(
        &self,
        connected: bool,
        occurred_utc_ns: i64,
    ) -> Result<Option<SessionCandidate>, SessionError> {
        if self.state.cursor.is_none() {
            return Err(SessionError::InvalidCursor);
        }
        if self.state.connected == Some(connected) {
            return Ok(None);
        }
        let mut next = self.state.clone();
        next.connected = Some(connected);
        let kind = if connected {
            FactKind::ConnectionRecovered
        } else {
            FactKind::ConnectionLost
        };
        self.single_fact(next, kind, occurred_utc_ns).map(Some)
    }

    pub fn prepare_end(
        &self,
        occurred_utc_ns: i64,
    ) -> Result<Option<SessionCandidate>, SessionError> {
        if !self.state.active {
            return Ok(None);
        }
        let mut next = self.state.clone();
        next.active = false;
        next.vehicles.clear();
        self.single_fact(next, FactKind::SessionEnded, occurred_utc_ns)
            .map(Some)
    }

    fn single_fact(
        &self,
        mut next: State,
        kind: FactKind,
        occurred_utc_ns: i64,
    ) -> Result<SessionCandidate, SessionError> {
        if self.max_facts == 0 {
            return Err(SessionError::FactBatchOverflow);
        }
        let sequence = next
            .fact_sequence
            .checked_add(1)
            .ok_or(SessionError::FactSequenceExhausted)?;
        let identity = next.header.clone().ok_or(SessionError::InvalidCursor)?;
        next.fact_sequence = sequence;
        Ok(SessionCandidate {
            token: self.token.clone(),
            base_cursor: self.state.cursor,
            base_fact_sequence: self.state.fact_sequence,
            next,
            facts: vec![SessionFact {
                sequence,
                kind,
                occurred_utc_ns,
                identity,
                previous_identity: None,
                lap: None,
            }],
        })
    }

    pub fn validate_candidate(&self, candidate: &SessionCandidate) -> Result<(), SessionError> {
        if !Arc::ptr_eq(&self.token, &candidate.token) {
            return Err(SessionError::WrongCoordinator);
        }
        if self.state.cursor != candidate.base_cursor
            || self.state.fact_sequence != candidate.base_fact_sequence
        {
            return Err(SessionError::StaleCandidate);
        }
        Ok(())
    }

    pub fn commit(
        &mut self,
        candidate: SessionCandidate,
    ) -> Result<Vec<SessionFact>, SessionError> {
        self.validate_candidate(&candidate)?;
        self.state = candidate.next;
        Ok(candidate.facts)
    }

    pub fn fact_sequence(&self) -> u64 {
        self.state.fact_sequence
    }
    pub fn identity_evicted(&self) -> u64 {
        self.state.identity_evicted
    }
    pub fn cursor(&self) -> Option<Cursor> {
        self.state.cursor
    }
}

impl Default for SessionCoordinator {
    fn default() -> Self {
        Self::new(0, 0)
    }
}

impl SessionCandidate {
    pub fn facts(&self) -> &[SessionFact] {
        &self.facts
    }
    pub fn stint_id(&self, vehicle_id: &str) -> Option<&str> {
        self.next
            .vehicles
            .get(vehicle_id)
            .and_then(|vehicle| vehicle.identity.stint_id.as_deref())
    }
}

fn push_fact(
    facts: &mut Vec<SessionFact>,
    max_facts: usize,
    kind: FactKind,
    occurred_utc_ns: i64,
    identity: FactIdentity,
    previous_identity: Option<FactIdentity>,
    lap: Option<i32>,
) -> Result<(), SessionError> {
    if facts.len() >= max_facts {
        return Err(SessionError::FactBatchOverflow);
    }
    facts.push(SessionFact {
        sequence: 0,
        kind,
        occurred_utc_ns,
        identity,
        previous_identity,
        lap,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::{ObservedState, Vehicle};

    struct Life {
        driver: String,
        laps: Field<i32>,
        pit: Field<bool>,
    }

    impl LifecycleSignals for Life {
        fn driver_name(&self) -> Option<&str> {
            Some(&self.driver)
        }
        fn completed_laps(&self) -> Option<i32> {
            usable(&self.laps).copied()
        }
        fn in_pit(&self) -> Option<bool> {
            usable(&self.pit).copied()
        }
    }

    fn batch(
        epoch: u64,
        sequence: u64,
        session: &str,
        vehicles: Vec<(&str, &str, i32, bool)>,
    ) -> Batch<(), Life> {
        let player_id = vehicles.first().map(|(id, _, _, _)| (*id).to_owned());
        let count = vehicles.len() as i32;
        Batch {
            event_id: "event".to_owned(),
            session_id: session.to_owned(),
            player_id,
            cursor: Cursor { epoch, sequence },
            state: ObservedState {
                source_time_ns: Field::Missing,
                end_time_seconds: Field::Missing,
                maximum_laps: Field::Missing,
                track_name: Field::Missing,
                session_type: Field::Missing,
                vehicle_count: Field::observed(count),
                player_present: Field::observed(count > 0),
                ambient_temp_c: Field::Missing,
                track_temp_c: Field::Missing,
                rain_fraction: Field::Missing,
                wetness_fraction: Field::Missing,
                session_flag: Field::Missing,
                track_length: Field::Missing,
                vehicles: vehicles
                    .into_iter()
                    .map(|(id, driver, laps, pit)| Vehicle {
                        id: id.to_owned(),
                        value: Life {
                            driver: driver.to_owned(),
                            laps: Field::observed(laps),
                            pit: Field::observed(pit),
                        },
                    })
                    .collect(),
            },
        }
    }

    #[test]
    fn lifecycle_facts_keep_go_order_and_session_boundary() {
        let mut coordinator = SessionCoordinator::default();
        let first = coordinator
            .prepare(&batch(1, 1, "s1", vec![("a", "driver-a", 4, false)]), 10)
            .unwrap();
        assert_eq!(
            first
                .facts()
                .iter()
                .map(|fact| fact.kind)
                .collect::<Vec<_>>(),
            vec![FactKind::SessionStarted]
        );
        assert_eq!(first.stint_id("a"), Some("s1/a/stint-1"));
        coordinator.commit(first).unwrap();
        let second = coordinator
            .prepare(&batch(1, 2, "s1", vec![("a", "driver-b", 5, true)]), 20)
            .unwrap();
        assert_eq!(
            second
                .facts()
                .iter()
                .map(|fact| fact.kind)
                .collect::<Vec<_>>(),
            vec![
                FactKind::DriverChanged,
                FactKind::LapCompleted,
                FactKind::PitEntered
            ]
        );
        assert_eq!(second.facts()[1].lap, Some(5));
        assert_eq!(
            second.facts()[0]
                .previous_identity
                .as_ref()
                .unwrap()
                .driver_id,
            "driver-a"
        );
        assert_eq!(second.stint_id("a"), Some("s1/a/stint-2"));
        let facts = coordinator.commit(second).unwrap();
        assert_eq!(
            facts.iter().map(|fact| fact.sequence).collect::<Vec<_>>(),
            vec![2, 3, 4]
        );
        let third = coordinator
            .prepare(&batch(1, 3, "s1", vec![("a", "driver-b", 5, false)]), 30)
            .unwrap();
        assert_eq!(third.facts()[0].kind, FactKind::PitExited);
        coordinator.commit(third).unwrap();
        let wrapped = coordinator
            .prepare(&batch(2, 1, "s1", vec![("a", "driver-b", 5, false)]), 40)
            .unwrap();
        assert!(wrapped.facts().is_empty());
        coordinator.commit(wrapped).unwrap();
        let next = coordinator
            .prepare(&batch(3, 1, "s2", vec![("a", "driver-b", 5, false)]), 50)
            .unwrap();
        assert_eq!(
            next.facts()
                .iter()
                .map(|fact| fact.kind)
                .collect::<Vec<_>>(),
            vec![FactKind::SessionEnded, FactKind::SessionStarted]
        );
        assert_eq!(next.stint_id("a"), Some("s2/a/stint-1"));
    }

    #[test]
    fn rejected_and_stale_candidates_do_not_advance_facts() {
        let mut coordinator = SessionCoordinator::new(4, 0);
        let input = batch(1, 1, "s", vec![("a", "driver", 1, false)]);
        let first = coordinator.prepare(&input, 10).unwrap();
        let stale = coordinator.prepare(&input, 10).unwrap();
        assert_eq!(coordinator.fact_sequence(), 0);
        coordinator.commit(first).unwrap();
        assert_eq!(coordinator.commit(stale), Err(SessionError::StaleCandidate));
        assert_eq!(coordinator.fact_sequence(), 1);
        assert!(matches!(
            coordinator.prepare(&batch(1, 2, "s", vec![("a", "driver", 300, false)]), 20),
            Err(SessionError::FactBatchOverflow)
        ));
        assert_eq!(coordinator.fact_sequence(), 1);
        let retry = coordinator
            .prepare(&batch(1, 2, "s", vec![("a", "driver", 2, false)]), 20)
            .unwrap();
        assert_eq!(retry.facts()[0].sequence, 2);
        coordinator.commit(retry).unwrap();
        assert_eq!(coordinator.fact_sequence(), 2);
    }

    #[test]
    fn inactive_history_is_evicted_without_removing_current_car() {
        let mut coordinator = SessionCoordinator::new(0, 2);
        for (sequence, id) in [(1, "a"), (2, "b"), (3, "c")] {
            let candidate = coordinator
                .prepare(&batch(1, sequence, "s", vec![(id, "driver", 0, false)]), 10)
                .unwrap();
            coordinator.commit(candidate).unwrap();
        }
        assert_eq!(coordinator.identity_evicted(), 1);
        let next = coordinator
            .prepare(&batch(1, 4, "s", vec![("c", "driver", 0, false)]), 10)
            .unwrap();
        assert_eq!(next.stint_id("c"), Some("s/c/stint-1"));
    }

    #[test]
    fn reconnect_is_idempotent_and_never_opens_another_session() {
        let mut coordinator = SessionCoordinator::default();
        assert!(matches!(
            coordinator.prepare_connection(false, 1),
            Err(SessionError::InvalidCursor)
        ));
        let first = coordinator
            .prepare(&batch(1, 1, "s", vec![("a", "d", 1, false)]), 10)
            .unwrap();
        coordinator.commit(first).unwrap();
        let lost = coordinator.prepare_connection(false, 20).unwrap().unwrap();
        let duplicate = coordinator.prepare_connection(false, 20).unwrap().unwrap();
        assert_eq!(lost.facts()[0].kind, FactKind::ConnectionLost);
        assert_eq!(lost.facts()[0].sequence, 2);
        coordinator.commit(lost).unwrap();
        assert_eq!(
            coordinator.commit(duplicate),
            Err(SessionError::StaleCandidate)
        );
        assert!(coordinator.prepare_connection(false, 21).unwrap().is_none());
        let recovered = coordinator.prepare_connection(true, 30).unwrap().unwrap();
        assert_eq!(recovered.facts()[0].kind, FactKind::ConnectionRecovered);
        coordinator.commit(recovered).unwrap();
        let next = coordinator
            .prepare(&batch(1, 2, "s", vec![("a", "d", 1, false)]), 40)
            .unwrap();
        assert!(next.facts().is_empty());
        assert_eq!(coordinator.fact_sequence(), 3);
    }

    #[test]
    fn explicit_end_is_idempotent_and_next_epoch_starts_new_baseline() {
        let mut coordinator = SessionCoordinator::default();
        let first = coordinator
            .prepare(&batch(1, 1, "s", vec![("a", "d", 4, false)]), 10)
            .unwrap();
        coordinator.commit(first).unwrap();
        let ended = coordinator.prepare_end(20).unwrap().unwrap();
        assert_eq!(ended.facts()[0].kind, FactKind::SessionEnded);
        coordinator.commit(ended).unwrap();
        assert!(coordinator.prepare_end(21).unwrap().is_none());
        let restarted = coordinator
            .prepare(&batch(2, 1, "s", vec![("a", "d", 5, true)]), 30)
            .unwrap();
        assert_eq!(
            restarted
                .facts()
                .iter()
                .map(|fact| fact.kind)
                .collect::<Vec<_>>(),
            vec![FactKind::SessionStarted]
        );
        assert_eq!(restarted.stint_id("a"), Some("s/a/stint-1"));
    }
}
