//! Transactional LMU adaptation into the simulator-neutral reducer.

use super::mapper::{ClockChange, IdentityMapper, MapError, MapperCandidate};
use super::{
    AdmittedGrid, Damage, FastTelemetry, Fuel, Sector, SessionType, VehicleFields,
    fusion::{FusedSession, FusedWeather},
};
use crate::core;
use crate::core::facts::{Fact, FactCursor, FactError, FactLog, MAX_RETAINED_FACTS};
use crate::core::session::{SessionCandidate, SessionCoordinator, SessionError, SessionFact};
use crate::derive;
use crate::quality::Field;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PipelineError {
    Mapping(MapError),
    IdentityMismatch,
    Reduction(core::Reject),
    Session(SessionError),
    Fact(FactError),
    FactSequenceMismatch,
}

pub type LmuVehicleState = core::VehicleState<Sector, Fuel, Damage>;

pub struct Pipeline {
    mapper: IdentityMapper,
    reducer: core::Reducer<SessionType, LmuVehicleState>,
    session: SessionCoordinator,
    fact_log: FactLog<SessionFact>,
    last_facts: Vec<SessionFact>,
    session_remaining: Option<Field<f64>>,
    controls_history: Option<derive::controls::ControlHistory>,
}

pub struct PipelineCandidate {
    mapper: MapperCandidate,
    reduced: core::Candidate<SessionType, LmuVehicleState>,
    session: SessionCandidate,
    session_remaining: Field<f64>,
    controls_history: derive::controls::ControlHistory,
}

impl Pipeline {
    pub fn new(slot_grace_frames: u64, fact_stream_id: u64) -> Result<Self, FactError> {
        Ok(Self {
            mapper: IdentityMapper::new(slot_grace_frames),
            reducer: core::Reducer::new(),
            session: SessionCoordinator::default(),
            fact_log: FactLog::new(fact_stream_id, MAX_RETAINED_FACTS)?,
            last_facts: Vec::new(),
            session_remaining: None,
            controls_history: None,
        })
    }

    pub fn prepare(
        &self,
        grid: AdmittedGrid,
        fused: &FusedSession,
        weather: &FusedWeather,
        clock_change: ClockChange,
        occurred_utc_ns: i64,
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
        let AdmittedGrid {
            vehicles: source_vehicles,
            session,
            ..
        } = grid;
        let vehicles = source_vehicles
            .into_iter()
            .zip(identity.vehicles)
            .map(|(value, id)| core::Vehicle {
                id: id.vehicle_id,
                value: map_vehicle(value),
            })
            .collect();
        let state = core::ObservedState {
            source_time_ns: fused.source_time_ns.field.clone(),
            end_time_seconds: session.end_time_seconds,
            maximum_laps: session.maximum_laps,
            track_name: fused.track_name.field.clone(),
            session_type: fused.session_type.field.clone(),
            vehicle_count: fused.vehicle_count.field.clone(),
            player_present: fused.player_present.field.clone(),
            ambient_temp_c: weather.ambient_temp_c.clone(),
            track_temp_c: weather.track_temp_c.clone(),
            rain_fraction: weather.rain_fraction.clone(),
            wetness_fraction: weather.wetness_fraction.clone(),
            session_flag: match &weather.global_yellow {
                Field::Present {
                    value: true,
                    provenance,
                    freshness,
                } => Field::Present {
                    value: core::SessionFlag::Yellow,
                    provenance: *provenance,
                    freshness: *freshness,
                },
                _ => Field::Missing,
            },
            vehicles,
            track_length: session.track_length,
        };
        let batch = core::Batch {
            event_id: "lmu-event-1".to_owned(),
            session_id: identity.session_id,
            player_id: identity.player_id,
            cursor: identity.cursor,
            state,
        };
        let reduced = self
            .reducer
            .prepare(batch)
            .map_err(PipelineError::Reduction)?;
        let controls_history = derive::controls::prepare(
            self.controls_history.as_ref(),
            self.reducer.current().map(|batch| batch.cursor),
            reduced.batch(),
            occurred_utc_ns,
            derive::controls::MAX_CONTROLS_HISTORY,
        );
        let session = self
            .session
            .prepare(reduced.batch(), occurred_utc_ns)
            .map_err(PipelineError::Session)?;
        self.validate_fact_batch(session.facts())?;
        Ok(PipelineCandidate {
            mapper,
            reduced,
            session,
            session_remaining,
            controls_history,
        })
    }

    pub fn commit(
        &mut self,
        candidate: PipelineCandidate,
    ) -> Result<&core::Batch<SessionType, LmuVehicleState>, PipelineError> {
        self.session
            .validate_candidate(&candidate.session)
            .map_err(PipelineError::Session)?;
        self.validate_fact_batch(candidate.session.facts())?;
        self.reducer
            .commit(candidate.reduced)
            .map_err(PipelineError::Reduction)?;
        self.last_facts = self
            .session
            .commit(candidate.session)
            .map_err(PipelineError::Session)?;
        self.fact_log
            .append_batch(self.last_facts.clone())
            .map_err(PipelineError::Fact)?;
        self.mapper.commit_candidate(candidate.mapper);
        self.session_remaining = Some(candidate.session_remaining);
        self.controls_history = Some(candidate.controls_history);
        Ok(self.reducer.current().expect("commit installed a batch"))
    }

    pub fn current(&self) -> Option<&core::Batch<SessionType, LmuVehicleState>> {
        self.reducer.current()
    }

    pub fn session_remaining(&self) -> Option<&Field<f64>> {
        self.session_remaining.as_ref()
    }

    pub fn controls_history(&self) -> Option<&derive::controls::ControlHistory> {
        self.controls_history.as_ref()
    }

    pub fn facts(&self) -> &[SessionFact] {
        &self.last_facts
    }

    pub fn fact_high_water(&self) -> FactCursor {
        self.fact_log.high_water()
    }

    pub fn replay_facts_after(
        &self,
        cursor: FactCursor,
    ) -> Result<Vec<&Fact<SessionFact>>, FactError> {
        self.fact_log.after(cursor)
    }

    fn validate_fact_batch(&self, facts: &[SessionFact]) -> Result<(), PipelineError> {
        self.fact_log
            .can_append(facts.len())
            .map_err(PipelineError::Fact)?;
        if facts.is_empty() {
            return Ok(());
        }
        let next = self
            .fact_log
            .high_water()
            .sequence
            .checked_add(1)
            .ok_or(PipelineError::Fact(FactError::SequenceExhausted))?;
        if facts
            .iter()
            .enumerate()
            .any(|(index, fact)| fact.sequence != next + index as u64)
        {
            return Err(PipelineError::FactSequenceMismatch);
        }
        Ok(())
    }

    pub fn set_connected(
        &mut self,
        connected: bool,
        occurred_utc_ns: i64,
    ) -> Result<&[SessionFact], PipelineError> {
        let candidate = self
            .session
            .prepare_connection(connected, occurred_utc_ns)
            .map_err(PipelineError::Session)?;
        self.commit_session_transition(candidate)
    }

    pub fn end_session(&mut self, occurred_utc_ns: i64) -> Result<&[SessionFact], PipelineError> {
        let candidate = self
            .session
            .prepare_end(occurred_utc_ns)
            .map_err(PipelineError::Session)?;
        self.commit_session_transition(candidate)
    }

    fn commit_session_transition(
        &mut self,
        candidate: Option<SessionCandidate>,
    ) -> Result<&[SessionFact], PipelineError> {
        self.last_facts = match candidate {
            Some(candidate) => {
                self.validate_fact_batch(candidate.facts())?;
                self.session
                    .commit(candidate)
                    .map_err(PipelineError::Session)?
            }
            None => Vec::new(),
        };
        self.fact_log
            .append_batch(self.last_facts.clone())
            .map_err(PipelineError::Fact)?;
        Ok(&self.last_facts)
    }
}

impl PipelineCandidate {
    pub fn batch(&self) -> &core::Batch<SessionType, LmuVehicleState> {
        self.reduced.batch()
    }

    pub fn session_remaining(&self) -> &Field<f64> {
        &self.session_remaining
    }

    pub fn controls_history(&self) -> &derive::controls::ControlHistory {
        &self.controls_history
    }

    pub fn facts(&self) -> &[SessionFact] {
        self.session.facts()
    }
}

fn map_vehicle(source: VehicleFields) -> LmuVehicleState {
    let VehicleFields {
        source_id: _,
        driver_name,
        vehicle_name,
        vehicle_class,
        car_number,
        player,
        position,
        completed_laps,
        sector,
        lap_distance,
        lap_progress_time,
        best_lap_time,
        last_lap_time,
        estimated_lap_time,
        in_pit,
        pit_stop_count,
        penalty_count,
        time_behind_next,
        laps_behind_next,
        time_behind_leader,
        laps_behind_leader,
        world_position,
        local_velocity,
        orientation,
        fast,
    } = source;
    let FastTelemetry {
        lap_number,
        gear,
        engine_rpm,
        speed_mps,
        throttle,
        brake,
        clutch,
        fuel,
        delta_best_seconds,
        tyre_wear,
        damage,
    } = fast.unwrap_or(FastTelemetry {
        lap_number: Field::Missing,
        gear: Field::Missing,
        engine_rpm: Field::Missing,
        speed_mps: Field::Missing,
        throttle: Field::Missing,
        brake: Field::Missing,
        clutch: Field::Missing,
        fuel: Field::Missing,
        delta_best_seconds: Field::Missing,
        tyre_wear: Field::Missing,
        damage: Field::Missing,
    });
    core::VehicleState {
        driver_name,
        name: vehicle_name,
        vehicle_class,
        car_number,
        player,
        sector,
        lap_distance,
        lap_progress_time,
        best_lap_time,
        last_lap_time,
        estimated_lap_time,
        lap_number,
        gear,
        engine_rpm,
        speed_mps,
        throttle,
        brake,
        clutch,
        position,
        completed_laps,
        in_pit,
        pit_stop_count,
        penalty_count,
        time_behind_leader,
        laps_behind_leader,
        time_behind_next,
        laps_behind_next,
        fuel,
        delta_best: delta_best_seconds,
        world_position,
        local_velocity,
        orientation,
        damage,
        tyre_wear,
    }
}

#[cfg(test)]
impl Default for Pipeline {
    fn default() -> Self {
        Self::new(super::mapper::DEFAULT_SLOT_GRACE_FRAMES, 1).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::session::FactKind;
    use crate::derive::controls::HistoryFreshness;
    use crate::lmu::{
        admit_v13,
        fusion::{fuse_session, fuse_weather},
        rest::RestCache,
    };

    const REAL_44: &[u8] = include_bytes!("../../../../testdata/lmu-fixture.bin");

    fn fixture_weather(grid: &AdmittedGrid) -> FusedWeather {
        fuse_weather(grid, 100, &RestCache::default(), 100, None)
    }

    #[test]
    fn controls_history_is_owned_bounded_and_committed_with_grid() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        for sequence in 1..=121 {
            let mut grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
            let player = grid
                .vehicles
                .iter_mut()
                .find(|car| car.player.value() == Some(&true))
                .unwrap();
            let fast = player.fast.as_mut().unwrap();
            fast.throttle = Field::observed(sequence as f64 / 121.0);
            fast.brake = Field::observed(0.0);
            fast.clutch = Field::observed(0.0);
            let fused = fuse_session(&grid, 100, &rest, 100);
            let weather = fixture_weather(&grid);
            let candidate = pipeline
                .prepare(grid, &fused, &weather, ClockChange::Continuous, sequence)
                .unwrap();
            assert_eq!(
                candidate.controls_history().samples.len(),
                sequence.min(120) as usize
            );
            assert_eq!(
                pipeline
                    .controls_history()
                    .map(|history| history.samples.len()),
                if sequence == 1 {
                    None
                } else {
                    Some((sequence - 1).min(120) as usize)
                }
            );
            pipeline.commit(candidate).unwrap();
        }
        let history = pipeline.controls_history().unwrap();
        assert_eq!(history.samples.len(), 120);
        assert_eq!(history.samples[0].cursor.sequence, 2);
        assert_eq!(history.samples[119].captured_utc_ns, 121);
        assert_eq!(history.samples[119].brake, 0.0);
    }

    #[test]
    fn invalid_controls_keep_last_owned_history_and_quality() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let mut first = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let player = first
            .vehicles
            .iter_mut()
            .find(|car| car.player.value() == Some(&true))
            .unwrap();
        let fast = player.fast.as_mut().unwrap();
        fast.throttle = Field::observed(0.0);
        fast.brake = Field::observed(0.0);
        fast.clutch = Field::observed(0.0);
        fast.speed_mps = Field::Missing;
        let fused = fuse_session(&first, 100, &rest, 100);
        let weather = fixture_weather(&first);
        pipeline
            .commit(
                pipeline
                    .prepare(first, &fused, &weather, ClockChange::Continuous, 100)
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(pipeline.controls_history().unwrap().samples.len(), 1);
        assert_eq!(
            pipeline.controls_history().unwrap().samples[0].speed_mps,
            Field::Missing
        );
        let mut second = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let player = second
            .vehicles
            .iter_mut()
            .find(|car| car.player.value() == Some(&true))
            .unwrap();
        let fast = player.fast.as_mut().unwrap();
        fast.throttle = Field::invalid_observed(0.8);
        fast.brake = Field::observed(0.0);
        fast.clutch = Field::observed(0.0);
        let fused = fuse_session(&second, 100, &rest, 100);
        let weather = fixture_weather(&second);
        let candidate = pipeline
            .prepare(second, &fused, &weather, ClockChange::Continuous, 200)
            .unwrap();
        assert_eq!(
            candidate.controls_history().freshness,
            HistoryFreshness::Invalid
        );
        assert_eq!(candidate.controls_history().samples.len(), 1);
        pipeline.commit(candidate).unwrap();
        assert_eq!(
            pipeline.controls_history().unwrap().samples[0].captured_utc_ns,
            100
        );
        let mut third = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let player = third
            .vehicles
            .iter_mut()
            .find(|car| car.player.value() == Some(&true))
            .unwrap();
        let fast = player.fast.as_mut().unwrap();
        fast.throttle = Field::Present {
            value: 0.5,
            provenance: crate::quality::Provenance::Observed,
            freshness: crate::quality::Freshness::Stale,
        };
        fast.brake = Field::observed(0.0);
        fast.clutch = Field::observed(0.0);
        let fused = fuse_session(&third, 100, &rest, 100);
        let weather = fixture_weather(&third);
        let candidate = pipeline
            .prepare(third, &fused, &weather, ClockChange::Continuous, 300)
            .unwrap();
        assert_eq!(
            candidate.controls_history().freshness,
            HistoryFreshness::Stale
        );
        assert_eq!(candidate.controls_history().samples.len(), 1);
        pipeline.commit(candidate).unwrap();
        let mut reset = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let player = reset
            .vehicles
            .iter_mut()
            .find(|car| car.player.value() == Some(&true))
            .unwrap();
        let fast = player.fast.as_mut().unwrap();
        fast.throttle = Field::observed(0.0);
        fast.brake = Field::observed(0.0);
        fast.clutch = Field::observed(0.0);
        let fused = fuse_session(&reset, 100, &rest, 100);
        let weather = fixture_weather(&reset);
        let candidate = pipeline
            .prepare(reset, &fused, &weather, ClockChange::Wrap, 400)
            .unwrap();
        assert_eq!(candidate.controls_history().samples.len(), 1);
        assert_eq!(candidate.controls_history().samples[0].cursor.epoch, 2);
        pipeline.commit(candidate).unwrap();
    }

    #[test]
    fn productive_constructor_requires_nonzero_fact_stream() {
        assert!(matches!(
            Pipeline::new(30, 0),
            Err(FactError::InvalidConfiguration)
        ));
    }

    #[test]
    fn connection_fact_invalidates_prepared_frame_before_reducer_commit() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let first = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first_fused = fuse_session(&first, 100, &rest, 100);
        let first_weather = fixture_weather(&first);
        pipeline
            .commit(
                pipeline
                    .prepare(
                        first,
                        &first_fused,
                        &first_weather,
                        ClockChange::Continuous,
                        100,
                    )
                    .unwrap(),
            )
            .unwrap();
        let second = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let second_fused = fuse_session(&second, 100, &rest, 100);
        let second_weather = fixture_weather(&second);
        let prepared = pipeline
            .prepare(
                second,
                &second_fused,
                &second_weather,
                ClockChange::Continuous,
                200,
            )
            .unwrap();
        pipeline.set_connected(false, 150).unwrap();
        assert!(matches!(
            pipeline.commit(prepared),
            Err(PipelineError::Session(SessionError::StaleCandidate))
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
        assert_eq!(pipeline.fact_high_water().sequence, 2);
    }

    #[test]
    fn lost_fact_window_demands_resync_without_changing_observed_state() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        pipeline
            .commit(
                pipeline
                    .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
                    .unwrap(),
            )
            .unwrap();
        for step in 0..260 {
            pipeline.set_connected(step % 2 == 1, 200 + step).unwrap();
        }
        assert_eq!(pipeline.fact_high_water().sequence, 261);
        assert!(matches!(
            pipeline.replay_facts_after(FactCursor {
                stream: 1,
                sequence: 0
            }),
            Err(FactError::ResyncRequired {
                first: 6,
                next: 262
            })
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
    }

    #[test]
    fn admitted_grid_commits_atomically_and_rejects_bad_retry() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = pipeline
            .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
            .unwrap();
        assert_eq!(candidate.batch().state.vehicles.len(), 44);
        assert_eq!(candidate.batch().state.track_name, fused.track_name.field);
        assert_eq!(
            candidate.batch().state.session_type,
            fused.session_type.field
        );
        assert_eq!(
            candidate.batch().state.vehicle_count,
            fused.vehicle_count.field
        );
        assert_eq!(candidate.batch().state.rain_fraction, weather.rain_fraction);
        assert!(matches!(
            candidate.batch().state.session_flag,
            Field::Missing
        ));
        assert_eq!(candidate.batch().cursor.sequence, 1);
        let expected_remaining = candidate.session_remaining().clone();
        assert_eq!(candidate.facts().len(), 1);
        assert_eq!(candidate.facts()[0].kind, FactKind::SessionStarted);
        assert!(pipeline.current().is_none());
        assert!(pipeline.session_remaining().is_none());
        pipeline.commit(candidate).unwrap();
        assert_eq!(pipeline.facts()[0].sequence, 1);
        assert_eq!(pipeline.session_remaining(), Some(&expected_remaining));

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let mut invalid = fuse_session(&grid, 100, &rest, 100);
        invalid.vehicle_count.field = Field::observed(43);
        let weather = fixture_weather(&grid);
        assert!(matches!(
            pipeline.prepare(grid, &invalid, &weather, ClockChange::Continuous, 100),
            Err(PipelineError::Mapping(MapError::InvalidGrid))
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
        assert_eq!(pipeline.session_remaining(), Some(&expected_remaining));

        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = pipeline
            .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 2);
        assert!(candidate.facts().is_empty());
        pipeline.commit(candidate).unwrap();
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 2);
        assert!(pipeline.facts().is_empty());
    }

    #[test]
    fn foreign_candidate_does_not_advance_mapper() {
        let rest = RestCache::default();
        let first = Pipeline::default();
        let mut other = Pipeline::default();
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = first
            .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
            .unwrap();
        assert!(matches!(
            other.commit(candidate),
            Err(PipelineError::Session(SessionError::WrongCoordinator))
        ));
        assert!(other.current().is_none());
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &rest, 100);
        let weather = fixture_weather(&grid);
        let candidate = other
            .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 1);
    }

    #[test]
    fn stale_commit_does_not_publish_a_new_derived_value() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let first_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first_fused = fuse_session(&first_grid, 100, &rest, 100);
        let first_weather = fixture_weather(&first_grid);
        let first = pipeline
            .prepare(
                first_grid,
                &first_fused,
                &first_weather,
                ClockChange::Continuous,
                100,
            )
            .unwrap();
        let mut stale_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        stale_grid.session.end_time_seconds = Field::observed(999.0);
        let stale_fused = fuse_session(&stale_grid, 100, &rest, 100);
        let stale_weather = fixture_weather(&stale_grid);
        let stale = pipeline
            .prepare(
                stale_grid,
                &stale_fused,
                &stale_weather,
                ClockChange::Continuous,
                100,
            )
            .unwrap();
        let expected = first.session_remaining().clone();
        pipeline.commit(first).unwrap();
        assert!(matches!(
            pipeline.commit(stale),
            Err(PipelineError::Session(SessionError::StaleCandidate))
        ));
        assert_eq!(pipeline.session_remaining(), Some(&expected));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
    }

    #[test]
    fn positive_global_yellow_is_the_only_published_flag() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let fused = fuse_session(&grid, 100, &RestCache::default(), 100);
        let mut weather = fixture_weather(&grid);
        weather.global_yellow = Field::observed(true);
        let pipeline = Pipeline::default();
        let candidate = pipeline
            .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
            .unwrap();
        assert_eq!(
            candidate.batch().state.session_flag.value(),
            Some(&core::SessionFlag::Yellow)
        );
    }

    #[test]
    fn real_grid_preserves_player_fast_fields_and_rival_absence() {
        let grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let player_index = grid.player_index.unwrap();
        let expected_player = &grid.vehicles[player_index];
        let expected_speed = expected_player.fast.as_ref().unwrap().speed_mps.clone();
        let expected_damage = expected_player.fast.as_ref().unwrap().damage.clone();
        let expected_position = expected_player.position.clone();
        let expected_rival_name = grid.vehicles[0].driver_name.clone();
        let fused = fuse_session(&grid, 100, &RestCache::default(), 100);
        let weather = fixture_weather(&grid);
        let candidate = Pipeline::default()
            .prepare(grid, &fused, &weather, ClockChange::Continuous, 100)
            .unwrap();
        let vehicles = &candidate.batch().state.vehicles;
        assert_eq!(vehicles[player_index].value.speed_mps, expected_speed);
        assert_eq!(vehicles[player_index].value.damage, expected_damage);
        assert_eq!(vehicles[player_index].value.position, expected_position);
        assert_eq!(vehicles[0].value.driver_name, expected_rival_name);
        if player_index != 0 {
            assert!(matches!(vehicles[0].value.speed_mps, Field::Missing));
            assert!(matches!(vehicles[0].value.fuel, Field::Missing));
        }
    }

    #[test]
    fn fact_overflow_rejects_whole_lmu_candidate_and_retry_keeps_cursor() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let first_grid = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first_fused = fuse_session(&first_grid, 100, &rest, 100);
        let first_weather = fixture_weather(&first_grid);
        pipeline
            .commit(
                pipeline
                    .prepare(
                        first_grid,
                        &first_fused,
                        &first_weather,
                        ClockChange::Continuous,
                        100,
                    )
                    .unwrap(),
            )
            .unwrap();
        let mut over = admit_v13(REAL_44, "1.3.0.0").unwrap();
        over.vehicles[0].completed_laps = Field::observed(100_000);
        let over_fused = fuse_session(&over, 100, &rest, 100);
        let over_weather = fixture_weather(&over);
        assert!(matches!(
            pipeline.prepare(
                over,
                &over_fused,
                &over_weather,
                ClockChange::Continuous,
                200
            ),
            Err(PipelineError::Session(SessionError::FactBatchOverflow))
        ));
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 1);
        assert_eq!(pipeline.facts()[0].kind, FactKind::SessionStarted);
        let retry = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let retry_fused = fuse_session(&retry, 100, &rest, 100);
        let retry_weather = fixture_weather(&retry);
        let candidate = pipeline
            .prepare(
                retry,
                &retry_fused,
                &retry_weather,
                ClockChange::Continuous,
                200,
            )
            .unwrap();
        assert_eq!(candidate.batch().cursor.sequence, 2);
        pipeline.commit(candidate).unwrap();
    }

    #[test]
    fn real_grid_reconnect_and_explicit_end_preserve_fact_order() {
        let rest = RestCache::default();
        let mut pipeline = Pipeline::default();
        let first = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let first_fused = fuse_session(&first, 100, &rest, 100);
        let first_weather = fixture_weather(&first);
        pipeline
            .commit(
                pipeline
                    .prepare(
                        first,
                        &first_fused,
                        &first_weather,
                        ClockChange::Continuous,
                        100,
                    )
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(pipeline.facts()[0].kind, FactKind::SessionStarted);
        assert_eq!(
            pipeline.fact_high_water(),
            FactCursor {
                stream: 1,
                sequence: 1
            }
        );
        assert_eq!(
            pipeline.set_connected(false, 200).unwrap()[0].kind,
            FactKind::ConnectionLost
        );
        assert!(pipeline.set_connected(false, 201).unwrap().is_empty());
        assert_eq!(pipeline.fact_high_water().sequence, 2);
        assert_eq!(
            pipeline.set_connected(true, 300).unwrap()[0].kind,
            FactKind::ConnectionRecovered
        );
        let next = admit_v13(REAL_44, "1.3.0.0").unwrap();
        let next_fused = fuse_session(&next, 100, &rest, 100);
        let next_weather = fixture_weather(&next);
        pipeline
            .commit(
                pipeline
                    .prepare(
                        next,
                        &next_fused,
                        &next_weather,
                        ClockChange::Continuous,
                        400,
                    )
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(pipeline.current().unwrap().cursor.sequence, 2);
        assert!(pipeline.facts().is_empty());
        assert_eq!(
            pipeline.end_session(500).unwrap()[0].kind,
            FactKind::SessionEnded
        );
        assert!(pipeline.end_session(501).unwrap().is_empty());
        let facts = pipeline
            .replay_facts_after(FactCursor {
                stream: 1,
                sequence: 0,
            })
            .unwrap();
        assert_eq!(
            facts.iter().map(|fact| fact.value.kind).collect::<Vec<_>>(),
            vec![
                FactKind::SessionStarted,
                FactKind::ConnectionLost,
                FactKind::ConnectionRecovered,
                FactKind::SessionEnded
            ]
        );
        assert_eq!(
            facts
                .iter()
                .map(|fact| fact.cursor.sequence)
                .collect::<Vec<_>>(),
            vec![1, 2, 3, 4]
        );
        assert!(matches!(
            pipeline.replay_facts_after(FactCursor {
                stream: 2,
                sequence: 0
            }),
            Err(FactError::ForeignStream)
        ));
    }
}
